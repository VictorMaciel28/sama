import { prisma } from '@/lib/prisma'
import { labelSeparacaoStatusListagem } from '@/lib/separacaoLabels'
import { PedidoStatus, SeparacaoStatus } from '@prisma/client'

/** Linha da listagem de embalagem: separação já existente ou pedido faturado ainda sem vínculo de embalagem. */
export type EmbalagemListaRowSeparacao = {
  kind: 'separacao'
  id: number
  status: string
  status_label: string
  id_vendedor_externo: string | null
  created_at: string
  enviado_embalagem_em: string | null
  concluido_em: string | null
  responsavel_nome: string | null
  pedidos_count: number
  pedidos: { numero: number; cliente: string; status: string; total: string }[]
}

export type EmbalagemListaRowPedidoFaturado = {
  kind: 'pedido_faturado'
  order_numero: number
  cliente: string
  total: string
  data: string
}

export type EmbalagemListaRow = EmbalagemListaRowSeparacao | EmbalagemListaRowPedidoFaturado

function sortSeparacaoRows<T extends { status: SeparacaoStatus; finished_at: Date | null; concluido_at: Date | null }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const pri = (s: SeparacaoStatus) => (s === SeparacaoStatus.SEPARADO ? 0 : 1)
    const d = (x: T) =>
      x.status === SeparacaoStatus.SEPARADO ? x.finished_at?.getTime() ?? 0 : x.concluido_at?.getTime() ?? 0
    const pa = pri(a.status)
    const pb = pri(b.status)
    if (pa !== pb) return pa - pb
    return d(b) - d(a)
  })
}

/** Mesmos dados do `GET /api/estoque/embalagem` (para SSR + API). */
export async function getEmbalagemListaPayload(): Promise<EmbalagemListaRow[]> {
  const emEmbalagemNums = await prisma.stock_separation_order.findMany({
    where: {
      separation: { status: { in: [SeparacaoStatus.SEPARADO, SeparacaoStatus.CONCLUIDO] } },
    },
    select: { order_numero: true },
  })
  const ocupadosEmb = new Set(emEmbalagemNums.map((x) => x.order_numero))

  const pedidosFaturados = await prisma.platform_order.findMany({
    where: {
      status: PedidoStatus.FATURADO,
      ...(ocupadosEmb.size > 0 ? { numero: { notIn: [...ocupadosEmb] } } : {}),
    },
    orderBy: { data: 'desc' },
    take: 200,
    select: {
      numero: true,
      cliente: true,
      total: true,
      data: true,
    },
  })

  const separacoes = await prisma.stock_separation.findMany({
    where: { status: { in: [SeparacaoStatus.SEPARADO, SeparacaoStatus.CONCLUIDO] } },
    take: 300,
    include: {
      embalagem_finalizada_vendedor: { select: { nome: true } },
      orders: {
        include: {
          order_ref: { select: { numero: true, cliente: true, status: true, total: true } },
        },
      },
    },
  })

  const sortedSep = sortSeparacaoRows(separacoes)

  const rowsSep: EmbalagemListaRowSeparacao[] = sortedSep.map((r) => ({
    kind: 'separacao',
    id: r.id,
    status: r.status,
    status_label: labelSeparacaoStatusListagem(r.status),
    id_vendedor_externo: r.id_vendedor_externo,
    created_at: r.created_at.toISOString(),
    enviado_embalagem_em: r.finished_at ? r.finished_at.toISOString() : null,
    concluido_em: r.concluido_at ? r.concluido_at.toISOString() : null,
    responsavel_nome: r.embalagem_finalizada_vendedor?.nome ?? null,
    pedidos_count: r.orders.length,
    pedidos: r.orders.map((o) => ({
      numero: o.order_ref.numero,
      cliente: o.order_ref.cliente,
      status: o.order_ref.status,
      total: o.order_ref.total.toString(),
    })),
  }))

  const rowsPed: EmbalagemListaRowPedidoFaturado[] = pedidosFaturados.map((p) => ({
    kind: 'pedido_faturado',
    order_numero: p.numero,
    cliente: p.cliente,
    total: p.total.toString(),
    data: p.data.toISOString().slice(0, 10),
  }))

  return [...rowsPed, ...rowsSep]
}
