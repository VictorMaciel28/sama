import { SQL_PARCEL_DATE_VALID } from '@/lib/financeiroPaymentDateRows'
import { prisma } from '@/lib/prisma'
import { monthParcelDateBounds, type YearMonth } from '@/lib/financeiroMesBounds'
import type { FinanceiroPaymentDateRow } from '@/lib/financeiroPaymentDateRows'

export type PaymentStatusOption = { code: number; name: string }

/** Opções para `<select>` — ordenadas por `code`. */
export async function listPaymentStatusOptions(): Promise<PaymentStatusOption[]> {
  const rows = await prisma.payment_status.findMany({
    orderBy: [{ code: 'asc' }],
    select: { code: true, name: true },
  })
  return rows.map((r) => ({ code: r.code, name: r.name }))
}

/**
 * Status exibido na lista (parcelas com vencimento no mês filtrado).
 * Se houver mais de uma com status diferente, usa a primeira (ordem das parcelas do pagamento).
 */
export function parcelStatusForFilteredMonth(
  parcelsSorted: FinanceiroPaymentDateRow[],
  gte: Date,
  lte: Date
): number {
  const inMonth = parcelsSorted.filter((row) => row.parcel_date >= gte && row.parcel_date <= lte)
  if (inMonth.length > 0) return inMonth[0].status
  return parcelsSorted[0]?.status ?? 0
}

/**
 * Entre as parcelas com vencimento no mês filtrado: maior vencimento e maior data de pagamento (aprovado).
 * Usado para colunas da lista e ordenação (vencimento mais recente primeiro).
 */
export function parcelVencimentoPagamentoMaxInMonth(
  parcelsSorted: FinanceiroPaymentDateRow[],
  gte: Date,
  lte: Date
): { vencimentoMax: Date | null; pagamentoMax: Date | null } {
  const inMonth = parcelsSorted.filter((row) => row.parcel_date >= gte && row.parcel_date <= lte)
  if (inMonth.length === 0) {
    return { vencimentoMax: null, pagamentoMax: null }
  }
  let vMaxMs = inMonth[0].parcel_date.getTime()
  let pMaxMs: number | null = null
  for (const row of inMonth) {
    const vt = row.parcel_date.getTime()
    if (Number.isFinite(vt) && vt > vMaxMs) vMaxMs = vt
    const ap = row.approved_date
    if (ap) {
      const pt = ap.getTime()
      if (Number.isFinite(pt) && (pMaxMs == null || pt > pMaxMs)) pMaxMs = pt
    }
  }
  return {
    vencimentoMax: new Date(vMaxMs),
    pagamentoMax: pMaxMs != null ? new Date(pMaxMs) : null,
  }
}

export async function updateParcelStatusMes(args: {
  paymentId: number
  income: 0 | 1
  ym: YearMonth
  statusCode: number
}): Promise<{ ok: true; count: number } | { ok: false; error: string; http: number }> {
  const payment = await prisma.payment.findFirst({
    where: { id: args.paymentId, income: args.income },
    select: { id: true },
  })
  if (!payment) {
    return { ok: false, error: 'Pagamento não encontrado', http: 404 }
  }

  const statusRow = await prisma.payment_status.findFirst({
    where: { code: args.statusCode },
  })
  if (!statusRow) {
    return { ok: false, error: 'Status inválido', http: 400 }
  }

  const { gte, lte } = monthParcelDateBounds(args.ym)

  const result = await prisma.$executeRaw`
    UPDATE payment_date pd
    SET pd.status = ${statusRow.code}
    WHERE pd.id_payment = ${args.paymentId}
      AND pd.parcel_date >= ${gte}
      AND pd.parcel_date <= ${lte}
      ${SQL_PARCEL_DATE_VALID}
  `

  return { ok: true, count: Number(result) || 0 }
}

/** Nome usado pelas rotas `parcelas-status` (a-pagar / a-receber). */
export { updateParcelStatusMes as updateParcelasStatusInMonth }
