import { SQL_PARCEL_DATE_VALID } from '@/lib/financeiroPaymentDateRows'
import { prisma } from '@/lib/prisma'
import { parseYmdToSqlDate, todayCalendarYmdLocal } from '@/lib/calendarDate'
import { fluxoCaixaResultado } from '@/lib/fluxoCaixaMath'

export type FluxoCaixaARealizarRow = {
  y: number
  mo: number
  label: string
  contasAReceber: number
  despesa: null
  inadimplencia: number
  contasAPagar: number
  resultado: number
}

const MONTH_SHORT_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'] as const

export function fluxoCaixaMesAnoLabel(y: number, mo: number): string {
  const abbr = MONTH_SHORT_PT[mo - 1]
  return abbr ? `${abbr}/${y}` : `${mo}/${y}`
}

function yearBounds(y: number): { gte: Date; lte: Date } {
  return {
    gte: parseYmdToSqlDate(`${y}-01-01`),
    lte: parseYmdToSqlDate(`${y}-12-31`),
  }
}

type SqlMonthAgg = {
  mo: number
  contas_a_receber: unknown
  inadimplencia: unknown
  contas_a_pagar: unknown
}

function toNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export { fluxoCaixaResultado } from '@/lib/fluxoCaixaMath'

/** Anos distintos com parcelas (`payment_date.parcel_date`), mais recente primeiro. */
export async function listFluxoCaixaPaymentYears(): Promise<number[]> {
  const raw = await prisma.$queryRaw<Array<{ y: unknown }>>`
    SELECT DISTINCT YEAR(pd.parcel_date) AS y
    FROM payment_date pd
    WHERE 1 = 1
      ${SQL_PARCEL_DATE_VALID}
    ORDER BY y DESC
  `
  const years = raw
    .map((r) => Number(r.y))
    .filter((y) => Number.isFinite(y) && y >= 2000 && y <= 2100)
  return years.length > 0 ? years : [new Date().getFullYear()]
}

export function resolveFluxoCaixaYear(anoParam: string | null | undefined, availableYears: number[]): number {
  const requested = parseFluxoCaixaYearParam(anoParam)
  if (availableYears.includes(requested)) return requested
  const current = new Date().getFullYear()
  if (availableYears.includes(current)) return current
  return availableYears[0] ?? current
}

/** Agrega parcelas do ano civil por mês de vencimento (`parcel_date`). */
export async function buildFluxoCaixaARealizarRows(year: number): Promise<FluxoCaixaARealizarRow[]> {
  const { gte, lte } = yearBounds(year)
  const todayYmd = todayCalendarYmdLocal().slice(0, 10)
  const todayDate = parseYmdToSqlDate(todayYmd)

  const raw = await prisma.$queryRaw<SqlMonthAgg[]>`
    SELECT
      MONTH(pd.parcel_date) AS mo,
      SUM(
        CASE
          WHEN p.income = 1 AND pd.status = 0 AND pd.parcel_date >= ${todayDate}
          THEN pd.parcel_value
          ELSE 0
        END
      ) AS contas_a_receber,
      SUM(
        CASE
          WHEN p.income = 1 AND pd.status = 0 AND pd.parcel_date < ${todayDate}
          THEN pd.parcel_value
          ELSE 0
        END
      ) AS inadimplencia,
      SUM(CASE WHEN p.income = 0 AND pd.status = 0 THEN pd.parcel_value ELSE 0 END) AS contas_a_pagar
    FROM payment_date pd
    INNER JOIN payment p ON p.id = pd.id_payment
    WHERE pd.parcel_date >= ${gte}
      AND pd.parcel_date <= ${lte}
      ${SQL_PARCEL_DATE_VALID}
    GROUP BY MONTH(pd.parcel_date)
    ORDER BY MONTH(pd.parcel_date) ASC
  `

  const byMonth = new Map<number, SqlMonthAgg>()
  for (const row of raw) {
    const mo = Number(row.mo)
    if (mo >= 1 && mo <= 12) byMonth.set(mo, row)
  }

  const rows: FluxoCaixaARealizarRow[] = []
  for (let mo = 1; mo <= 12; mo++) {
    const hit = byMonth.get(mo)
    const contasAReceber = toNum(hit?.contas_a_receber)
    const inadimplencia = toNum(hit?.inadimplencia)
    const contasAPagar = toNum(hit?.contas_a_pagar)
    rows.push({
      y: year,
      mo,
      label: fluxoCaixaMesAnoLabel(year, mo),
      contasAReceber,
      despesa: null,
      inadimplencia,
      contasAPagar,
      resultado: fluxoCaixaResultado(contasAReceber, inadimplencia, contasAPagar),
    })
  }

  return rows
}

export function parseFluxoCaixaYearParam(ano: string | null | undefined): number {
  const n = Number(String(ano ?? '').trim())
  const current = new Date().getFullYear()
  if (Number.isFinite(n) && n >= 2000 && n <= 2100) return Math.trunc(n)
  return current
}
