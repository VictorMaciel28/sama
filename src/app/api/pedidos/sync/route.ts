import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tinyV2Post } from '@/lib/tinyOAuth'
import { unwrapTinyObterCliente, upsertClienteFromTinyObterPayload } from '@/lib/tinyObterCliente'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type TinyPedidoListItem = {
  id?: number | string
  numero?: number | string
  data_pedido?: string
  nome?: string
  valor?: string | number
  id_vendedor?: number | string
  situacao?: string
  id_cliente?: number | string
  cpf_cnpj?: string
}

type ParsedRow = {
  numero: number
  tiny_id: number
  data: Date
  cliente: string
  cnpj: string
  total: number
  status: any
  id_vendedor_externo: string | null
  id_client_externo: bigint | null
  sistema_origem: 'tiny'
}

function onlyDigits(v: string) {
  return (v || '').replace(/\D/g, '')
}

function normClienteNome(s: string) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  if (items.length === 0) return
  let cursor = 0
  const n = Math.min(Math.max(1, limit), items.length)
  const runners = Array.from({ length: n }, async () => {
    while (true) {
      const i = cursor++
      if (i >= items.length) break
      await worker(items[i])
    }
  })
  await Promise.all(runners)
}

function toIsoDate(input: unknown) {
  const raw = String(input || '').trim()
  if (!raw) return new Date().toISOString().slice(0, 10)
  const brDateMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (brDateMatch) {
    const [, dd, mm, yyyy] = brDateMatch
    return `${yyyy}-${mm}-${dd}`
  }
  return raw.slice(0, 10)
}

function currentDateBr() {
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = String(now.getFullYear())
  return `${dd}/${mm}/${yyyy}`
}

function mapTinySituacaoToPedidoStatus(situacao: string | null | undefined) {
  const normalized = String(situacao || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
  if (!normalized) return 'PENDENTE'
  if (normalized.includes('incomplet')) return 'DADOS_INCOMPLETOS'
  if (normalized.includes('cancel') || normalized.includes('nao entregue')) return 'CANCELADO'
  if (normalized.includes('entreg')) return 'ENTREGUE'
  if (normalized.includes('enviad') || normalized.includes('pronto envio')) return 'ENVIADO'
  if (normalized.includes('fatur') || normalized.includes('atendid')) return 'FATURADO'
  if (normalized.includes('aprov')) return 'APROVADO'
  return 'PENDENTE'
}

async function fetchTinyPage(pageNumber: number) {
  const json = await tinyV2Post('pedidos.pesquisa.php', {
    pagina: pageNumber,
    dataInicial: '01/01/2000',
    dataFinal: currentDateBr(),
    sort: 'ASC',
  })
  const retorno = json?.retorno
  const status = String(retorno?.status || '')
  if (status !== 'OK') {
    const codigoErro = Number(retorno?.codigo_erro || 0)
    if (codigoErro === 20) {
      return { itens: [] as TinyPedidoListItem[], totalPages: 0 }
    }
    const firstError =
      Array.isArray(retorno?.erros) && retorno.erros.length > 0
        ? String(retorno.erros[0]?.erro || '')
        : ''
    throw new Error(firstError || 'tiny_v2_list_failed')
  }
  const pedidosRaw = Array.isArray(retorno?.pedidos) ? retorno.pedidos : []
  const itens = pedidosRaw.map((item: any) => item?.pedido).filter(Boolean) as TinyPedidoListItem[]
  const totalPages = Number(retorno?.numero_paginas || 1)
  return { itens, totalPages }
}

/** Índice nome/fantasia normalizado → cliente local (cache em memória na sincronização). */
async function buildClienteNomeIndex() {
  const rows = await prisma.cliente.findMany({
    select: { external_id: true, nome: true, fantasia: true, id_vendedor_externo: true },
  })
  const map = new Map<string, { external_id: bigint; id_vendedor_externo: string | null }>()
  for (const r of rows) {
    const pack = { external_id: r.external_id, id_vendedor_externo: r.id_vendedor_externo || null }
    const k1 = normClienteNome(r.nome)
    if (k1 && !map.has(k1)) map.set(k1, pack)
    if (r.fantasia) {
      const k2 = normClienteNome(r.fantasia)
      if (k2 && !map.has(k2)) map.set(k2, pack)
    }
  }
  return map
}

function applyClienteNomeMatch(rows: ParsedRow[], index: Map<string, { external_id: bigint; id_vendedor_externo: string | null }>) {
  const skip = normClienteNome('Cliente não informado')
  for (const r of rows) {
    if (r.id_client_externo != null) continue
    const k = normClienteNome(r.cliente)
    if (!k || k === skip) continue
    const hit = index.get(k)
    if (hit) r.id_client_externo = hit.external_id
  }
}

type TinyContato = {
  /** Tiny devolve `id` como número ou string (ex.: `"752377058"`). */
  id?: number | string
  nome?: string
  fantasia?: string
  cpf_cnpj?: string
  endereco?: string
  numero?: string
  complemento?: string
  bairro?: string
  cep?: string
  cidade?: string
  uf?: string
  email?: string
  fone?: string
  id_lista_preco?: number
  id_vendedor?: number
  nome_vendedor?: string
  situacao?: string
  codigo?: string
  tipo_pessoa?: string
}

function contatoIdNumber(ct: TinyContato): number | null {
  if (ct.id == null) return null
  const n = Number(String(ct.id).trim())
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null
}

async function fetchTinyContatosPage(pesquisa: string, pagina: number, extra?: { cpf_cnpj?: string }) {
  const body: Record<string, string | number> = {
    pagina,
    pesquisa: pesquisa.slice(0, 100).trim() || ' ',
  }
  if (extra?.cpf_cnpj) body.cpf_cnpj = String(extra.cpf_cnpj).slice(0, 18)
  const json = await tinyV2Post('contatos.pesquisa.php', body)
  const retorno = json?.retorno
  if (String(retorno?.status || '') !== 'OK') {
    return [] as { contato: TinyContato }[]
  }
  return Array.isArray(retorno?.contatos) ? retorno.contatos : []
}

/** Variações de texto para `pesquisa` + opcional `cpf_cnpj` (API v2 contatos.pesquisa). */
function contatoPesquisaCandidates(cliente: string, cnpj: string): { pesquisa: string; cpf_cnpj?: string }[] {
  const raw = String(cliente || '').trim()
  const skip = normClienteNome('Cliente não informado')
  if (!raw || normClienteNome(raw) === skip) return []
  const seen = new Set<string>()
  const out: { pesquisa: string; cpf_cnpj?: string }[] = []
  const push = (pesquisa: string, cpf_cnpj?: string) => {
    const p = pesquisa.trim().slice(0, 100) || ' '
    const key = `${p}|${cpf_cnpj || ''}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(cpf_cnpj ? { pesquisa: p, cpf_cnpj } : { pesquisa: p })
  }
  const collapsed = raw.replace(/\s*[-–—]\s*/g, ' ').replace(/\s+/g, ' ').trim()
  push(raw)
  if (collapsed !== raw) push(collapsed)
  push(collapsed.replace(/\bMATERIAS\b/gi, 'MATERIAIS'))
  push(collapsed.replace(/\bMATERIAIS\b/gi, 'MATERIAS'))
  if (collapsed.length > 85) push(collapsed.slice(0, 85).trim())
  if (collapsed.length > 55) push(collapsed.slice(0, 55).trim())
  const words = collapsed.split(/\s+/).filter(Boolean)
  if (words.length > 5) push(words.slice(0, 5).join(' '))
  if (words.length > 3) push(words.slice(0, 3).join(' '))
  const digits = onlyDigits(cnpj)
  if (digits.length >= 8) {
    push(digits.slice(0, 14))
    if (digits.length === 14) {
      const f = `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
      push(f)
    }
  }
  return out
}

async function fetchTinyContatosAllPages(
  pesquisa: string,
  options?: { cpf_cnpj?: string; maxPages?: number }
): Promise<{ contato: TinyContato }[]> {
  const maxPages = Math.min(10, Math.max(1, options?.maxPages ?? 5))
  const merged: { contato: TinyContato }[] = []
  let pagina = 1
  let totalPages = 1
  while (pagina <= totalPages && pagina <= maxPages) {
    const body: Record<string, string | number> = {
      pagina,
      pesquisa: pesquisa.slice(0, 100).trim() || ' ',
    }
    if (options?.cpf_cnpj) body.cpf_cnpj = String(options.cpf_cnpj).slice(0, 18)
    const json = await tinyV2Post('contatos.pesquisa.php', body)
    const retorno = json?.retorno
    if (String(retorno?.status || '') !== 'OK') break
    const batch = Array.isArray(retorno?.contatos) ? retorno.contatos : []
    merged.push(...batch)
    totalPages = Math.max(1, Number(retorno?.numero_paginas || 1))
    if (batch.length === 0) break
    pagina += 1
  }
  return merged
}

function pickContatoForPedidoNomeCnpj(
  contatos: { contato: TinyContato }[],
  nomeAlvo: string,
  cnpjPedido: string
): TinyContato | null {
  const target = normClienteNome(nomeAlvo)
  const digitsOrder = onlyDigits(cnpjPedido)
  const list = contatos
    .map((c) => c?.contato)
    .filter((ct): ct is TinyContato => Boolean(ct?.nome) && contatoIdNumber(ct) != null)
  if (list.length === 0) return null
  if (digitsOrder.length >= 8) {
    const hit = list.find((ct) => onlyDigits(ct.cpf_cnpj || '') === digitsOrder)
    if (hit) return hit
  }
  if (target) {
    const exact = list.find((ct) => normClienteNome(ct.nome || '') === target)
    if (exact) return exact
    const fant = list.find((ct) => normClienteNome(ct.fantasia || '') === target)
    if (fant) return fant
    const sub = list.find(
      (ct) =>
        normClienteNome(ct.nome || '').includes(target) || target.includes(normClienteNome(ct.nome || ''))
    )
    if (sub) return sub
  }
  return list[0]
}

/** Tenta várias `pesquisa` (+ páginas) até achar um contato compatível com nome/CNPJ do pedido. */
async function resolveContatoViaPesquisaTiny(cliente: string, cnpj: string): Promise<TinyContato | null> {
  const candidates = contatoPesquisaCandidates(cliente, cnpj)
  for (const c of candidates) {
    try {
      const merged = await fetchTinyContatosAllPages(c.pesquisa, { cpf_cnpj: c.cpf_cnpj, maxPages: 5 })
      const pick = pickContatoForPedidoNomeCnpj(merged, cliente, cnpj)
      if (pick && contatoIdNumber(pick)) return pick
    } catch {
      /* próxima variação */
    }
  }
  return null
}

async function upsertClienteFromTinyContato(ct: TinyContato) {
  const rawCod = String(ct.codigo ?? '').trim()
  const idNum = contatoIdNumber(ct)
  if (!idNum) throw new Error('contato_sem_id_valido')
  const extId =
    rawCod && /^\d+$/.test(rawCod)
      ? BigInt(rawCod)
      : BigInt(idNum)
  const vendedorExtId = ct.id_vendedor != null ? String(ct.id_vendedor) : null
  const dataCommon = {
    codigo: ct.codigo ?? null,
    nome: String(ct.nome || 'Sem nome'),
    fantasia: ct.fantasia ?? null,
    endereco: ct.endereco ?? null,
    numero: ct.numero ?? null,
    complemento: ct.complemento ?? null,
    bairro: ct.bairro ?? null,
    cep: ct.cep ?? null,
    cidade: ct.cidade ?? null,
    estado: ct.uf ?? null,
    email: ct.email ?? null,
    fone: ct.fone ?? null,
    tipo_pessoa: ct.tipo_pessoa ?? null,
    cpf_cnpj: ct.cpf_cnpj ?? null,
    lista_preco: ct.id_lista_preco != null ? String(ct.id_lista_preco) : null,
    id_vendedor_externo: vendedorExtId,
    nome_vendedor: ct.nome_vendedor || null,
    situacao: ct.situacao ?? null,
  }
  await prisma.cliente.upsert({
    where: { external_id: extId },
    create: { external_id: extId, ...dataCommon },
    update: dataCommon,
  })
}

/**
 * Pedidos Tiny sem cliente local: `contatos.pesquisa.php` com várias variações de texto/CNPJ
 * (nome do pedido costuma divergir da razão social no Tiny; `pedido.obter` pode vir sem id útil).
 */
async function relinkOrphansViaContatosPesquisa(): Promise<number> {
  const rows = await prisma.platform_order.findMany({
    where: { sistema_origem: 'tiny', id_client_externo: null },
    select: { numero: true, cliente: true, cnpj: true },
    orderBy: { numero: 'asc' },
  })
  const skip = normClienteNome('Cliente não informado')
  const byNorm = new Map<string, { clienteRef: string; cnpjRef: string; numeros: number[] }>()
  for (const r of rows) {
    const nk = normClienteNome(r.cliente)
    if (!nk || nk === skip) continue
    const display = String(r.cliente || '').trim()
    const prev = byNorm.get(nk)
    if (!prev) {
      byNorm.set(nk, { clienteRef: display, cnpjRef: String(r.cnpj || ''), numeros: [r.numero] })
      continue
    }
    if (display.length > prev.clienteRef.length) prev.clienteRef = display
    const dNew = onlyDigits(r.cnpj || '')
    const dOld = onlyDigits(prev.cnpjRef)
    if (dNew.length > dOld.length) prev.cnpjRef = String(r.cnpj || '')
    prev.numeros.push(r.numero)
  }
  let pedidosAtualizados = 0
  for (const [, g] of byNorm) {
    const ct = await resolveContatoViaPesquisaTiny(g.clienteRef, g.cnpjRef)
    if (!ct || !contatoIdNumber(ct)) continue
    try {
      await upsertClienteFromTinyContato(ct)
    } catch {
      continue
    }
    const rawCod = String(ct.codigo ?? '').trim()
    const extId =
      rawCod && /^\d+$/.test(rawCod)
        ? BigInt(rawCod)
        : BigInt(contatoIdNumber(ct)!)
    const cli = await prisma.cliente.findUnique({
      where: { external_id: extId },
      select: { id_vendedor_externo: true },
    })
    if (!cli) continue
    const res = await prisma.platform_order.updateMany({
      where: {
        numero: { in: g.numeros },
        sistema_origem: 'tiny',
        id_client_externo: null,
      },
      data: {
        id_client_externo: extId,
        client_vendor_externo: cli.id_vendedor_externo ?? null,
      },
    })
    pedidosAtualizados += res.count
  }
  return pedidosAtualizados
}

async function runImportClientsAndRelink(nomesRaw: string[]) {
  const nomes = Array.from(
    new Set(
      nomesRaw
        .map((n) => String(n || '').trim())
        .filter((n) => n.length > 0 && normClienteNome(n) !== normClienteNome('Cliente não informado'))
    )
  )
  const failedNomes: string[] = []
  let importedOrUpdated = 0

  /** Primeiro: `contatos.pesquisa` por nome/CNPJ do pedido (várias variações + páginas). */
  let relinkedViaContatosPesquisa = await relinkOrphansViaContatosPesquisa()

  for (const nome of nomes) {
    try {
      const ct = await resolveContatoViaPesquisaTiny(nome, '')
      if (!ct) {
        failedNomes.push(nome)
        continue
      }
      await upsertClienteFromTinyContato(ct)
      importedOrUpdated += 1
    } catch {
      failedNomes.push(nome)
    }
  }

  const index = await buildClienteNomeIndex()
  const orphan = await prisma.platform_order.findMany({
    where: { sistema_origem: 'tiny', id_client_externo: null },
    select: { numero: true, cliente: true },
  })
  let relinkedPedidos = 0
  for (const o of orphan) {
    const k = normClienteNome(o.cliente)
    if (!k) continue
    const hit = index.get(k)
    if (!hit) continue
    await prisma.platform_order.update({
      where: { numero: o.numero },
      data: {
        id_client_externo: hit.external_id,
        client_vendor_externo: hit.id_vendedor_externo,
      },
    })
    relinkedPedidos += 1
  }

  const stillRows = await prisma.platform_order.findMany({
    where: { sistema_origem: 'tiny', id_client_externo: null },
    select: { numero: true, tiny_id: true, cliente: true },
    orderBy: { numero: 'asc' },
  })
  const stillUnmatched = Array.from(new Set(stillRows.map((r) => r.cliente).filter(Boolean)))
  const pedidosSemClienteVinculo = stillRows.map((r) => ({
    numero: r.numero,
    /** ID do pedido no Tiny (parâmetro `id` de pedido.obter.php). */
    tiny_id: r.tiny_id,
    cliente: r.cliente,
  }))

  return {
    ok: true as const,
    importedOrUpdated,
    relinkedPedidos,
    relinkedViaContatosPesquisa,
    failedNomes,
    stillUnmatched,
    pedidosSemClienteVinculo,
  }
}

async function runPedidosFullSync() {
  let pagina = 1
  let totalPages = 1
  const all: TinyPedidoListItem[] = []

  do {
    const page = await fetchTinyPage(pagina)
    totalPages = page.totalPages
    if (page.itens.length === 0) break
    all.push(...page.itens)
    pagina += 1
  } while (pagina <= totalPages)

  const clienteNomeIndex = await buildClienteNomeIndex()

  await prisma.platform_order.deleteMany()

  const parsedRows = all
    .map((row) => {
      const tinyId = Number(row?.id || 0)
      const numero = Number(row?.numero || 0)
      if (!(tinyId > 0) || !(numero > 0)) return null

      const r = row as TinyPedidoListItem & Record<string, unknown>
      const nestedCliente = (r.cliente as { id?: number | string } | undefined)?.id
      const idClienteRaw = r.id_cliente ?? r.idContato ?? nestedCliente
      let idClientExterno: bigint | null = null
      if (idClienteRaw != null && idClienteRaw !== '') {
        const n = Number(idClienteRaw)
        if (Number.isFinite(n) && n > 0) idClientExterno = BigInt(Math.trunc(n))
      }
      const cnpjList = String(r.cpf_cnpj || (r as any).cnpj || '').trim()

      return {
        numero,
        tiny_id: tinyId,
        data: new Date(toIsoDate(row?.data_pedido)),
        cliente: String(row?.nome || 'Cliente não informado'),
        cnpj: cnpjList,
        total: Number(row?.valor || 0),
        status: mapTinySituacaoToPedidoStatus(row?.situacao) as any,
        id_vendedor_externo: row?.id_vendedor != null ? String(row.id_vendedor) : null,
        id_client_externo: idClientExterno,
        sistema_origem: 'tiny' as const,
      }
    })
    .filter(Boolean) as ParsedRow[]

  const rowsByDigits = new Map<string, ParsedRow[]>()
  for (const r of parsedRows) {
    if (r.id_client_externo != null) continue
    const d = onlyDigits(r.cnpj)
    if (d.length < 8) continue
    const list = rowsByDigits.get(d) ?? []
    list.push(r)
    rowsByDigits.set(d, list)
  }
  for (const [, group] of rowsByDigits) {
    const digits = onlyDigits(group[0]?.cnpj || '')
    if (digits.length < 8) continue
    const cli = await prisma.cliente.findFirst({
      where: { cpf_cnpj: { contains: digits } },
      select: { external_id: true },
    })
    if (cli?.external_id) {
      for (const r of group) r.id_client_externo = cli.external_id
    }
  }

  applyClienteNomeMatch(parsedRows, clienteNomeIndex)

  const needObter = parsedRows.filter((r) => r.id_client_externo == null && r.tiny_id > 0)
  const obterByNumero = new Map<number, { clientId: bigint | null; cnpj: string }>()
  await runPool(needObter, 6, async (r) => {
    try {
      const json = await tinyV2Post('pedido.obter.php', { id: r.tiny_id })
      const pedido = json?.retorno?.pedido
      if (String(json?.retorno?.status || '') !== 'OK' || !pedido) {
        obterByNumero.set(r.numero, { clientId: null, cnpj: '' })
        return
      }
      const cli = pedido?.cliente
      let clientId: bigint | null = null
      if (cli) {
        clientId = await upsertClienteFromTinyObterPayload(prisma, cli)
      }
      const cliFlat = (unwrapTinyObterCliente(cli) || cli) as { cpf_cnpj?: string } | undefined
      const cnpj = String(cliFlat?.cpf_cnpj || '').trim()
      obterByNumero.set(r.numero, { clientId, cnpj })
    } catch {
      obterByNumero.set(r.numero, { clientId: null, cnpj: '' })
    }
  })
  for (const r of parsedRows) {
    const o = obterByNumero.get(r.numero)
    if (!o) continue
    if (r.id_client_externo == null && o.clientId) r.id_client_externo = o.clientId
    if (!r.cnpj && o.cnpj) r.cnpj = o.cnpj
  }

  applyClienteNomeMatch(parsedRows, clienteNomeIndex)

  const clientIds = Array.from(
    new Set(parsedRows.map((r) => r.id_client_externo).filter((v): v is bigint => v != null))
  )
  const clients = clientIds.length
    ? await prisma.cliente.findMany({
        where: { external_id: { in: clientIds } },
        select: { external_id: true, id_vendedor_externo: true },
      })
    : []
  const clientVendorByExternalId = new Map<string, string | null>()
  for (const c of clients) {
    clientVendorByExternalId.set(String(c.external_id), c.id_vendedor_externo || null)
  }

  const rowsToInsert = parsedRows.map((r) => {
    const idClienteKey = r.id_client_externo != null ? String(r.id_client_externo) : null
    const clienteExisteLocalmente = idClienteKey != null && clientVendorByExternalId.has(idClienteKey)
    const idClientExternoSafe = clienteExisteLocalmente ? r.id_client_externo : null
    const carteiraVendor =
      idClienteKey != null && clienteExisteLocalmente ? clientVendorByExternalId.get(idClienteKey) || null : null

    return {
      ...r,
      id_client_externo: idClientExternoSafe,
      client_vendor_externo: carteiraVendor,
    }
  })

  const batchSize = 100
  let imported = 0
  for (let i = 0; i < rowsToInsert.length; i += batchSize) {
    const batch = rowsToInsert.slice(i, i + batchSize)
    if (batch.length === 0) continue
    const result = await prisma.platform_order.createMany({
      data: batch,
    })
    imported += result.count
  }

  const comClienteLocal = rowsToInsert.filter((r) => r.id_client_externo != null).length
  const skipNome = normClienteNome('Cliente não informado')
  const unmatchedClienteNomes = Array.from(
    new Set(
      rowsToInsert
        .filter((r) => r.id_client_externo == null)
        .map((r) => String(r.cliente || '').trim())
        .filter((n) => n.length > 0 && normClienteNome(n) !== skipNome)
    )
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  const pedidosSemClienteVinculo = rowsToInsert
    .filter((r) => r.id_client_externo == null)
    .map((r) => ({
      numero: r.numero,
      tiny_id: r.tiny_id,
      cliente: r.cliente,
    }))
    .sort((a, b) => a.numero - b.numero)

  return {
    ok: true as const,
    totalRecebido: all.length,
    imported,
    comClienteLocal,
    pedidosEnriquecidosObter: needObter.length,
    unmatchedClienteNomes,
    pedidosSemClienteVinculo,
  }
}

export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => ({}))
    if (raw?.action === 'importClients' && Array.isArray(raw?.nomes)) {
      const result = await runImportClientsAndRelink(raw.nomes as string[])
      return NextResponse.json(result)
    }
    const result = await runPedidosFullSync()
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? 'Erro ao sincronizar pedidos' },
      { status: 500 }
    )
  }
}
