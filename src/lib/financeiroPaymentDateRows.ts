import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { parseYmdToSqlDate } from '@/lib/calendarDate'

/**
 * Linhas de `payment_date` para telas financeiras.
 * MySQL pode ter `approved_date` = '0000-00-00', que o Prisma/driver não decodifica como Date.
 * Usamos SQL que devolve a data aprovada só como YYYY-MM-DD ou NULL.
 */
export type FinanceiroPaymentDateRow = {
  id: number
  id_payment: number
  number: bigint
  parcel_value: number
  parcel_date: Date
  approved_date: Date | null
  status: number
  insert_date: Date | null
  inserted_by: number | null
}

function toBigInt(v: unknown): bigint {
  if (typeof v === 'bigint') return v
  if (typeof v === 'number') return BigInt(Math.trunc(v))
  return BigInt(String(v))
}

function toDateOrInvalid(v: unknown): Date {
  if (v instanceof Date) return v
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
    return parseYmdToSqlDate(v.slice(0, 10))
  }
  return new Date(NaN)
}

function parseApprovedYmd(s: unknown): Date | null {
  if (s == null) return null
  const t = String(s).trim()
  if (!t || t === '0000-00-00' || t.startsWith('0000-')) return null
  const d = parseYmdToSqlDate(t.slice(0, 10))
  return Number.isFinite(d.getTime()) ? d : null
}

function safeOptionalDateTime(v: unknown): Date | null {
  if (v == null) return null
  const d = v instanceof Date ? v : new Date(String(v))
  if (!Number.isFinite(d.getTime())) return null
  if (d.getFullYear() < 1) return null
  return d
}

export async function findPaymentDatesByPaymentIds(ids: number[]): Promise<FinanceiroPaymentDateRow[]> {
  if (ids.length === 0) return []

  const raw = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      pd.id,
      pd.id_payment,
      pd.number,
      pd.parcel_value,
      pd.parcel_date,
      CASE
        WHEN pd.approved_date IS NULL THEN NULL
        WHEN CAST(pd.approved_date AS CHAR(10)) = '0000-00-00' THEN NULL
        WHEN CAST(pd.approved_date AS CHAR(10)) LIKE '0000-%' THEN NULL
        ELSE DATE_FORMAT(pd.approved_date, '%Y-%m-%d')
      END AS approved_ymd,
      pd.status,
      pd.insert_date,
      pd.inserted_by
    FROM payment_date pd
    WHERE pd.id_payment IN (${Prisma.join(ids)})
    ORDER BY pd.id_payment ASC, pd.parcel_date ASC, pd.id ASC
  `

  return raw.map((r) => ({
    id: Number(r.id),
    id_payment: Number(r.id_payment),
    number: toBigInt(r.number),
    parcel_value: Number(r.parcel_value),
    parcel_date: toDateOrInvalid(r.parcel_date),
    approved_date: parseApprovedYmd(r.approved_ymd),
    status: Number(r.status),
    insert_date: safeOptionalDateTime(r.insert_date),
    inserted_by: r.inserted_by != null ? Number(r.inserted_by) : null,
  }))
}

/** Parcelas no intervalo de vencimento — evita ler `approved_date` inválido via Prisma (`0000-00-00`). */
export type FinanceiroPaymentDateMonthRow = {
  id: number
  id_payment: number
  parcel_value: number
  parcel_date: Date
  status: number
  approved_date: Date | null
}

export async function findPaymentDatesInParcelMonthRange(
  gte: Date,
  lte: Date
): Promise<FinanceiroPaymentDateMonthRow[]> {
  const raw = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      pd.id,
      pd.id_payment,
      pd.parcel_value,
      pd.parcel_date,
      CASE
        WHEN pd.approved_date IS NULL THEN NULL
        WHEN CAST(pd.approved_date AS CHAR(10)) = '0000-00-00' THEN NULL
        WHEN CAST(pd.approved_date AS CHAR(10)) LIKE '0000-%' THEN NULL
        ELSE DATE_FORMAT(pd.approved_date, '%Y-%m-%d')
      END AS approved_ymd,
      pd.status
    FROM payment_date pd
    WHERE pd.parcel_date >= ${gte} AND pd.parcel_date <= ${lte}
    ORDER BY pd.parcel_date ASC, pd.id ASC
  `

  return raw.map((r) => ({
    id: Number(r.id),
    id_payment: Number(r.id_payment),
    parcel_value: Number(r.parcel_value),
    parcel_date: toDateOrInvalid(r.parcel_date),
    status: Number(r.status),
    approved_date: parseApprovedYmd(r.approved_ymd),
  }))
}
