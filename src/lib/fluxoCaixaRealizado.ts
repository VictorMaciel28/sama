import { Prisma } from '@prisma/client'
import { parseYmdToSqlDate, todayCalendarYmdLocal } from '@/lib/calendarDate'
import { PAYMENT_STATUS_CODE } from '@/lib/financeiroCalendarioBucket'
import { SQL_PARCEL_DATE_VALID } from '@/lib/financeiroPaymentDateRows'
import { prisma } from '@/lib/prisma'
import { fluxoCaixaMesAnoLabel } from '@/lib/fluxoCaixaARealizar'
import { findMercadoLivreValuesByYear } from '@/lib/fluxoCaixaMercadoLivre'
import { fluxoCaixaRealizadoResultado } from '@/lib/fluxoCaixaMath'

export type FluxoCaixaRealizadoRow = {
  y: number
  mo: number
  label: string
  contasAReceber: number
  vendaBalcao: number
  mercadoLivre: number
  despesa: number
  contasAPagar: number
  resultado: number
}

/** `payment_date.approved_date` válido (evita `0000-00-00`). */
const SQL_PD_APPROVED_DATE_VALID = Prisma.sql`
  AND pd.approved_date IS NOT NULL
  AND CAST(pd.approved_date AS CHAR(10)) != '0000-00-00'
  AND CAST(pd.approved_date AS CHAR(10)) NOT LIKE '0000-%'
  AND MONTH(pd.approved_date) > 0
  AND DAY(pd.approved_date) > 0
`

const SQL_EXPENSE_APPROVED_DATE_VALID = Prisma.sql`
  AND e.approved_date IS NOT NULL
  AND CAST(e.approved_date AS CHAR(10)) != '0000-00-00'
  AND CAST(e.approved_date AS CHAR(10)) NOT LIKE '0000-%'
  AND MONTH(e.approved_date) > 0
  AND DAY(e.approved_date) > 0
`

function yearBounds(y: number): { gte: Date; lte: Date; lteDateTime: Date } {
  return {
    gte: parseYmdToSqlDate(`${y}-01-01`),
    lte: parseYmdToSqlDate(`${y}-12-31`),
    lteDateTime: new Date(y, 11, 31, 23, 59, 59),
  }
}

function toNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function monthMap<T extends { mo: unknown }>(raw: T[]): Map<number, T> {
  const m = new Map<number, T>()
  for (const row of raw) {
    const mo = Number(row.mo)
    if (mo >= 1 && mo <= 12) m.set(mo, row)
  }
  return m
}

/**
 * Faturado / Realizado — espelha `parcel_values_received` (PHP legado).
 * t2.to_receive → contas a receber | t3.to_pay → contas a pagar | t5 → despesa | t6 → balcão
 */
export async function buildFluxoCaixaRealizadoRows(year: number): Promise<FluxoCaixaRealizadoRow[]> {
  const { gte, lte, lteDateTime } = yearBounds(year)
  const todayDate = parseYmdToSqlDate(todayCalendarYmdLocal().slice(0, 10))
  const statusPago = PAYMENT_STATUS_CODE.PAGO
  const statusAntecipado = PAYMENT_STATUS_CODE.ANTECIPADO

  const [receberRaw, pagarRaw, expenseRaw, balconyRaw, mercadoLivreByMonth] = await Promise.all([
    prisma.$queryRaw<Array<{ mo: number; contas_a_receber: unknown }>>`
      SELECT
        MONTH(pd.approved_date) AS mo,
        COALESCE(SUM(pd.parcel_value), 0) AS contas_a_receber
      FROM payment_date pd
      INNER JOIN payment p ON p.id = pd.id_payment
      WHERE p.income = 1
        AND pd.status IN (${statusPago}, ${statusAntecipado})
        AND pd.approved_date < ${todayDate}
        AND pd.approved_date >= ${gte}
        AND pd.approved_date <= ${lte}
        ${SQL_PD_APPROVED_DATE_VALID}
      GROUP BY MONTH(pd.approved_date)
      ORDER BY MONTH(pd.approved_date) ASC
    `,
    prisma.$queryRaw<Array<{ mo: number; contas_a_pagar: unknown }>>`
      SELECT
        MONTH(pd.parcel_date) AS mo,
        COALESCE(SUM(pd.parcel_value), 0) AS contas_a_pagar
      FROM payment_date pd
      INNER JOIN payment p ON p.id = pd.id_payment
      WHERE p.income = 0
        AND pd.status = ${statusPago}
        AND pd.parcel_date >= ${gte}
        AND pd.parcel_date <= ${lte}
        ${SQL_PARCEL_DATE_VALID}
      GROUP BY MONTH(pd.parcel_date)
      ORDER BY MONTH(pd.parcel_date) ASC
    `,
    prisma.$queryRaw<Array<{ mo: number; despesa: unknown }>>`
      SELECT
        MONTH(e.approved_date) AS mo,
        COALESCE(SUM(e.value), 0) AS despesa
      FROM expense e
      WHERE e.status = ${statusPago}
        AND e.approved_date >= ${gte}
        AND e.approved_date <= ${lte}
        ${SQL_EXPENSE_APPROVED_DATE_VALID}
      GROUP BY MONTH(e.approved_date)
      ORDER BY MONTH(e.approved_date) ASC
    `,
    prisma.$queryRaw<Array<{ mo: number; venda_balcao: unknown }>>`
      SELECT
        MONTH(bv.insert_date) AS mo,
        COALESCE(SUM(COALESCE(bv.cash, 0) + COALESCE(bv.pix, 0) + COALESCE(bv.card, 0)), 0) AS venda_balcao
      FROM balcony_values bv
      WHERE bv.insert_date >= ${gte}
        AND bv.insert_date <= ${lteDateTime}
      GROUP BY MONTH(bv.insert_date)
      ORDER BY MONTH(bv.insert_date) ASC
    `,
    findMercadoLivreValuesByYear(year),
  ])

  const byReceber = monthMap(receberRaw)
  const byPagar = monthMap(pagarRaw)
  const byExpense = monthMap(expenseRaw)
  const byBalcony = monthMap(balconyRaw)

  const rows: FluxoCaixaRealizadoRow[] = []
  for (let mo = 1; mo <= 12; mo++) {
    const contasAReceber = toNum(byReceber.get(mo)?.contas_a_receber)
    const vendaBalcao = toNum(byBalcony.get(mo)?.venda_balcao)
    const mercadoLivre = mercadoLivreByMonth.get(mo) ?? 0
    const despesa = toNum(byExpense.get(mo)?.despesa)
    const contasAPagar = toNum(byPagar.get(mo)?.contas_a_pagar)
    rows.push({
      y: year,
      mo,
      label: fluxoCaixaMesAnoLabel(year, mo),
      contasAReceber,
      vendaBalcao,
      mercadoLivre,
      despesa,
      contasAPagar,
      resultado: fluxoCaixaRealizadoResultado(
        contasAReceber,
        vendaBalcao,
        mercadoLivre,
        despesa,
        contasAPagar
      ),
    })
  }

  return rows
}
