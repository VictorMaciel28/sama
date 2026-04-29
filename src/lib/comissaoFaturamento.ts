import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/** Primeira vez que o pedido passou a Faturado (histórico por `tiny_id`). */
export async function primeiroFaturadoPorTinyIds(tinyIds: number[]): Promise<Map<number, Date>> {
  const map = new Map<number, Date>()
  if (!tinyIds.length) return map
  const grouped = await prisma.platform_order_status_history.groupBy({
    by: ['tiny_id'],
    where: { tiny_id: { in: tinyIds }, status: 'FATURADO' },
    _min: { changed_at: true },
  })
  for (const row of grouped) {
    if (row._min.changed_at != null) map.set(row.tiny_id, row._min.changed_at)
  }
  return map
}

/** `tiny_id` cujo primeiro registro FATURADO cai no intervalo [start, end]. */
export async function tinyIdsComPrimeiroFaturadoNoPeriodo(startStr: string, endStr: string): Promise<number[]> {
  const havingParts: Prisma.Sql[] = []
  if (startStr) havingParts.push(Prisma.sql`MIN(changed_at) >= ${new Date(startStr + 'T00:00:00.000Z')}`)
  if (endStr) havingParts.push(Prisma.sql`MIN(changed_at) <= ${new Date(endStr + 'T23:59:59.999Z')}`)
  if (!havingParts.length) return []

  const rows = await prisma.$queryRaw<Array<{ tiny_id: number }>>`
    SELECT tiny_id
    FROM platform_order_status_history
    WHERE status = 'FATURADO'
    GROUP BY tiny_id
    HAVING ${Prisma.join(havingParts, ' AND ')}
  `
  return rows.map((r) => r.tiny_id)
}

/**
 * Restringe `where` a pedidos cujo primeiro FATURADO em `platform_order_status_history` cai no período.
 * Só entram pedidos com alteração de status registrada (via Tiny); não há fallback por data do pedido.
 * @returns `true` se não há `tiny_id` a buscar no período.
 */
export async function aplicarFiltroPeriodoComissaoPorFaturamento(
  where: Record<string, unknown>,
  startStr: string,
  endStr: string
): Promise<boolean> {
  const temPeriodo = Boolean(startStr || endStr)
  if (!temPeriodo) return false

  const tinyIdsPeriodo = await tinyIdsComPrimeiroFaturadoNoPeriodo(startStr, endStr)
  if (tinyIdsPeriodo.length === 0) return true

  const existing = where.AND
  where.AND = [
    ...(Array.isArray(existing) ? existing : existing != null ? [existing] : []),
    { tiny_id: { in: tinyIdsPeriodo } },
  ]
  return false
}

/** Mantém apenas pedidos com `tiny_id` e pelo menos um FATURADO no histórico (sincronizado via Tiny). */
export function filtrarPedidosComHistoricoFaturado<T extends { tiny_id: number | null }>(
  orders: T[],
  primeiroFaturadoPorTinyId: Map<number, Date>
): T[] {
  return orders.filter((o) => o.tiny_id != null && primeiroFaturadoPorTinyId.has(o.tiny_id))
}
