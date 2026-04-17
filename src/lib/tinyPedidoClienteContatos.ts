import type { PrismaClient } from '@prisma/client'
import { tinyV2Post } from '@/lib/tinyOAuth'
import { upsertClienteFromTinyObterPayload } from '@/lib/tinyObterCliente'

export function onlyDigits(v: string) {
  return (v || '').replace(/\D/g, '')
}

export function normClienteNome(s: string) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export type TinyContato = {
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

export function contatoIdNumber(ct: TinyContato): number | null {
  if (ct.id == null) return null
  const n = Number(String(ct.id).trim())
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null
}

/** Variações de texto para `pesquisa` + opcional `cpf_cnpj` (API v2 contatos.pesquisa). */
export function contatoPesquisaCandidates(cliente: string, cnpj: string): { pesquisa: string; cpf_cnpj?: string }[] {
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

export async function fetchTinyContatosAllPages(
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

export function pickContatoForPedidoNomeCnpj(
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
export async function resolveContatoViaPesquisaTiny(cliente: string, cnpj: string): Promise<TinyContato | null> {
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

export async function upsertClienteFromTinyContato(prisma: PrismaClient, ct: TinyContato) {
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

/** Índice nome/fantasia normalizado → cliente local (mesma ideia do sync de pedidos). */
export async function buildClienteNomeIndex(prisma: PrismaClient) {
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

export function applyClienteNomeMatch(
  rows: { cliente: string; id_client_externo: bigint | null }[],
  index: Map<string, { external_id: bigint; id_vendedor_externo: string | null }>
) {
  const skip = normClienteNome('Cliente não informado')
  for (const r of rows) {
    if (r.id_client_externo != null) continue
    const k = normClienteNome(r.cliente)
    if (!k || k === skip) continue
    const hit = index.get(k)
    if (hit) r.id_client_externo = hit.external_id
  }
}

export type TinyPedidoClienteLinkInput = {
  cliente?: unknown
  nome?: unknown
  cpf_cnpj?: unknown
}

/**
 * Mesma estratégia do sync: `pedido.obter` → upsert por id/código; se não der, `contatos.pesquisa`;
 * por fim, casar nome normalizado com clientes já salvos localmente.
 */
export async function ensureClienteLinkForTinyPedidoObter(
  prisma: PrismaClient,
  tinyPedido: TinyPedidoClienteLinkInput
): Promise<{ external_id: bigint; id_vendedor_externo: string | null } | null> {
  const tinyCli = tinyPedido?.cliente
  if (tinyCli) {
    const extId = await upsertClienteFromTinyObterPayload(prisma, tinyCli)
    if (extId) {
      const cli = await prisma.cliente.findUnique({
        where: { external_id: extId },
        select: { id_vendedor_externo: true },
      })
      return { external_id: extId, id_vendedor_externo: cli?.id_vendedor_externo ?? null }
    }
  }

  const cliObj = tinyCli && typeof tinyCli === 'object' ? (tinyCli as Record<string, unknown>) : null
  const nome = String(cliObj?.nome || tinyPedido?.nome || '').trim()
  const cnpj = String(cliObj?.cpf_cnpj || tinyPedido?.cpf_cnpj || '').trim()

  const ct = await resolveContatoViaPesquisaTiny(nome, cnpj)
  if (ct && contatoIdNumber(ct)) {
    try {
      await upsertClienteFromTinyContato(prisma, ct)
    } catch {
      return null
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
    if (cli) {
      return { external_id: extId, id_vendedor_externo: cli.id_vendedor_externo ?? null }
    }
    return { external_id: extId, id_vendedor_externo: null }
  }

  const index = await buildClienteNomeIndex(prisma)
  const skip = normClienteNome('Cliente não informado')
  const k = normClienteNome(nome)
  if (k && k !== skip) {
    const hit = index.get(k)
    if (hit) {
      return { external_id: hit.external_id, id_vendedor_externo: hit.id_vendedor_externo }
    }
  }

  return null
}
