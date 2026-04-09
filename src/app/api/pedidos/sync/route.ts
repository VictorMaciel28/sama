import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tinyV2Post } from '@/lib/tinyOAuth'

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

export async function POST() {
  try {
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

    await prisma.platform_order.deleteMany()

    const parsedRows = all
      .map((row) => {
        const tinyId = Number(row?.id || 0)
        const numero = Number(row?.numero || 0)
        if (!(tinyId > 0) || !(numero > 0)) return null

        const idClientExterno = null

        return {
          numero,
          tiny_id: tinyId,
          data: new Date(toIsoDate(row?.data_pedido)),
          cliente: String(row?.nome || 'Cliente não informado'),
          cnpj: '',
          total: Number(row?.valor || 0),
          status: mapTinySituacaoToPedidoStatus(row?.situacao) as any,
          id_vendedor_externo: row?.id_vendedor != null ? String(row.id_vendedor) : null,
          id_client_externo: idClientExterno,
          sistema_origem: 'tiny',
        }
      })
      .filter(Boolean) as Array<{
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
    }>

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
        idClienteKey != null && clienteExisteLocalmente
          ? clientVendorByExternalId.get(idClienteKey) || null
          : null

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

    return NextResponse.json({
      ok: true,
      totalRecebido: all.length,
      imported,
    })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? 'Erro ao sincronizar pedidos' },
      { status: 500 }
    )
  }
}

