import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sessionIsFinanceiroAdmin } from '@/lib/financeiroAdminAuth'
import { formatSqlDateOnly, parseYmdToSqlDate } from '@/lib/calendarDate'
import {
  findPaymentDatesByPaymentIds,
  findPaymentDatesInParcelMonthRange,
} from '@/lib/financeiroPaymentDateRows'
import {
  FINANCEIRO_CALENDARIO_BUCKETS_ORDER,
  parcelFinanceiroCalendarioBucket,
  parcelFinanceiroResultadoContribution,
  type FinanceiroCalendarioBucket,
} from '@/lib/financeiroCalendarioBucket'
import { listPaymentStatusOptions } from '@/lib/financeiroParcelStatusMes'
import { parseMonthQueryParam, type YearMonth } from '@/lib/financeiroMesBounds'

function diaYmdInMonth(dia: string | null | undefined, ym: YearMonth): string | null {
  const s = String(dia ?? '').trim().slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (y !== ym.y || mo !== ym.mo) return null
  const last = new Date(y, mo, 0).getDate()
  if (d < 1 || d > last) return null
  return s
}

function passesBucketFilter(
  bucketParam: string | null,
  income: number,
  statusCode: number,
  parcelValue: number,
  parcelDate: Date
): boolean {
  if (!bucketParam) return true
  const b = parcelFinanceiroCalendarioBucket({ income, statusCode, parcelDate })
  if (bucketParam === 'resultado') {
    if (b == null) return false
    return parcelFinanceiroResultadoContribution({ income, bucket: b, parcelValue }) !== 0
  }
  const allowed = FINANCEIRO_CALENDARIO_BUCKETS_ORDER as readonly string[]
  if (!allowed.includes(bucketParam)) return false
  return b === (bucketParam as FinanceiroCalendarioBucket)
}

export async function GET(req: Request) {
  try {
    if (!(await sessionIsFinanceiroAdmin())) {
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const ym = parseMonthQueryParam(searchParams.get('mes'))
    const diaYmd = diaYmdInMonth(searchParams.get('dia'), ym)
    if (!diaYmd) {
      return NextResponse.json({ ok: false, error: 'Dia inválido ou fora do mês' }, { status: 400 })
    }

    const bucketParam = (searchParams.get('bucket') || '').trim() || null

    const dayStart = parseYmdToSqlDate(diaYmd)
    const dayRows = await findPaymentDatesInParcelMonthRange(dayStart, dayStart)
    if (dayRows.length === 0) {
      const payment_statuses = await listPaymentStatusOptions()
      return NextResponse.json({ ok: true, dia: diaYmd, rows: [], payment_statuses })
    }

    const paymentIds = [...new Set(dayRows.map((r) => r.id_payment))]

    const [allParcelsByPayments, payments, methods, accounts, payment_statuses] = await Promise.all([
      findPaymentDatesByPaymentIds(paymentIds),
      prisma.payment.findMany({
        where: { id: { in: paymentIds } },
        select: {
          id: true,
          number: true,
          emiter: true,
          destine: true,
          income: true,
          method: true,
          observation: true,
          id_account: true,
        },
      }),
      prisma.payment_method.findMany({ select: { code: true, name: true } }),
      prisma.account.findMany({ select: { id: true, name: true } }),
      listPaymentStatusOptions(),
    ])

    const paymentById = new Map(payments.map((p) => [p.id, p]))
    const methodByCode = new Map(methods.map((m) => [m.code, m.name]))
    const accountById = new Map(accounts.map((a) => [a.id, a.name]))

    const byPayment = new Map<number, typeof allParcelsByPayments>()
    for (const row of allParcelsByPayments) {
      const list = byPayment.get(row.id_payment)
      if (list) list.push(row)
      else byPayment.set(row.id_payment, [row])
    }
    for (const list of byPayment.values()) {
      list.sort((a, b) => {
        const ta = a.parcel_date.getTime()
        const tb = b.parcel_date.getTime()
        if (ta !== tb) return ta - tb
        return a.id - b.id
      })
    }

    const indexByParcelId = new Map<number, { indice: number; total: number }>()
    for (const list of byPayment.values()) {
      const total = list.length
      list.forEach((row, idx) => {
        indexByParcelId.set(row.id, { indice: idx + 1, total })
      })
    }

    const rowsOut: Array<Record<string, unknown>> = []

    for (const r of dayRows) {
      const p = paymentById.get(r.id_payment)
      if (!p) continue

      const income = p.income === 1 ? 1 : 0
      if (!passesBucketFilter(bucketParam, income, r.status, r.parcel_value, r.parcel_date)) continue

      const meta = indexByParcelId.get(r.id)
      if (!meta) continue

      const b = parcelFinanceiroCalendarioBucket({ income, statusCode: r.status, parcelDate: r.parcel_date })

      rowsOut.push({
        id: r.id,
        id_payment: r.id_payment,
        income,
        indice: meta.indice,
        total: meta.total,
        payment_number: typeof p.number === 'bigint' ? p.number.toString() : String(p.number),
        emiter: p.emiter,
        destine: p.destine,
        parcel_value: r.parcel_value,
        parcel_date: formatSqlDateOnly(r.parcel_date),
        approved_date: r.approved_date ? formatSqlDateOnly(r.approved_date) : null,
        status: r.status,
        bucket: b ?? 'cancelada',
        method: p.method,
        method_name: methodByCode.get(p.method) ?? null,
        id_account: p.id_account ?? null,
        account_name: p.id_account != null ? accountById.get(p.id_account) ?? null : null,
        observation: p.observation,
      })
    }

    rowsOut.sort((a, b) => {
      const ia = Number(a.income)
      const ib = Number(b.income)
      if (ia !== ib) return ib - ia
      const da = String(a.destine)
      const db = String(b.destine)
      const c = da.localeCompare(db, 'pt-BR')
      if (c !== 0) return c
      return Number(a.id_payment) - Number(b.id_payment)
    })

    return NextResponse.json({
      ok: true,
      dia: diaYmd,
      bucket: bucketParam,
      payment_statuses,
      rows: rowsOut,
    })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? 'Erro ao listar parcelas do dia' },
      { status: 500 }
    )
  }
}
