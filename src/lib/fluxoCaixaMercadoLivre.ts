import { prisma } from '@/lib/prisma'
import { fluxoCaixaMesAnoLabel, resolveFluxoCaixaYear } from '@/lib/fluxoCaixaARealizar'

export type MercadoLivreMonthValue = { month: number; value: number }

export function parseMercadoLivreMonthParam(mes: unknown): number | null {
  const n = Number(mes)
  if (!Number.isFinite(n) || n < 1 || n > 12) return null
  return Math.trunc(n)
}

export function parseMercadoLivreValueParam(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value)
  const s = String(value ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

/** Valores por mês (1–12) para o ano; meses sem registro = 0. */
export async function findMercadoLivreValuesByYear(year: number): Promise<Map<number, number>> {
  const rows = await prisma.fluxo_caixa_mercado_livre.findMany({
    where: { year },
    select: { month: true, value: true },
  })
  const map = new Map<number, number>()
  for (let mo = 1; mo <= 12; mo++) map.set(mo, 0)
  for (const r of rows) {
    const mo = Number(r.month)
    if (mo >= 1 && mo <= 12) map.set(mo, Number(r.value) || 0)
  }
  return map
}

export async function listMercadoLivreYears(): Promise<number[]> {
  const rows = await prisma.fluxo_caixa_mercado_livre.findMany({
    distinct: ['year'],
    select: { year: true },
    orderBy: { year: 'desc' },
  })
  const years = rows.map((r) => r.year).filter((y) => y >= 2000 && y <= 2100)
  const current = new Date().getFullYear()
  if (!years.includes(current)) years.unshift(current)
  return years.length > 0 ? years.sort((a, b) => b - a) : [current]
}

export async function upsertMercadoLivreValue(year: number, month: number, value: number): Promise<void> {
  await prisma.fluxo_caixa_mercado_livre.upsert({
    where: { year_month: { year, month } },
    create: { year, month, value },
    update: { value },
  })
}

export function mercadoLivreRowsForApi(year: number, byMonth: Map<number, number>) {
  const rows: Array<{ month: number; label: string; value: number }> = []
  for (let mo = 1; mo <= 12; mo++) {
    rows.push({
      month: mo,
      label: fluxoCaixaMesAnoLabel(year, mo),
      value: byMonth.get(mo) ?? 0,
    })
  }
  return rows
}

export function resolveMercadoLivreYear(anoParam: string | null | undefined, availableYears: number[]): number {
  return resolveFluxoCaixaYear(anoParam, availableYears)
}
