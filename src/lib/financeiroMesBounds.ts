import { parseYmdToSqlDate } from '@/lib/calendarDate'

export type YearMonth = { y: number; mo: number }

/** `YYYY-MM` válido ou mês civil atual (local). */
export function parseMonthQueryParam(mes: string | null | undefined): YearMonth {
  const m = /^(\d{4})-(\d{2})$/.exec(String(mes || '').trim())
  if (m) {
    const y = Number(m[1])
    const mo = Number(m[2])
    if (y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12) return { y, mo }
  }
  const n = new Date()
  return { y: n.getFullYear(), mo: n.getMonth() + 1 }
}

export function yearMonthToYmdPrefix(ym: YearMonth): string {
  return `${ym.y}-${String(ym.mo).padStart(2, '0')}`
}

export function monthParcelDateBounds(ym: YearMonth): { gte: Date; lte: Date } {
  const ymdStart = `${ym.y}-${String(ym.mo).padStart(2, '0')}-01`
  const lastDay = new Date(ym.y, ym.mo, 0).getDate()
  const ymdEnd = `${ym.y}-${String(ym.mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { gte: parseYmdToSqlDate(ymdStart), lte: parseYmdToSqlDate(ymdEnd) }
}
