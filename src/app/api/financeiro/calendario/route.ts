import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { findPaymentDatesInParcelMonthRange } from '@/lib/financeiroPaymentDateRows'
import { sessionIsFinanceiroAdmin } from '@/lib/financeiroAdminAuth'
import {
  emptyFinanceiroCalendarioDayTotals,
  FINANCEIRO_CALENDARIO_BUCKETS_ORDER,
  FINANCEIRO_CALENDARIO_LEGEND,
  FINANCEIRO_CALENDARIO_LEGEND_RESULTADO,
  parcelFinanceiroCalendarioBucket,
  parcelFinanceiroResultadoContribution,
  type FinanceiroCalendarioBucket,
} from '@/lib/financeiroCalendarioBucket'
import { formatSqlDateOnly } from '@/lib/calendarDate'
import { monthParcelDateBounds, parseMonthQueryParam, yearMonthToYmdPrefix } from '@/lib/financeiroMesBounds'

export async function GET(req: Request) {
  try {
    if (!(await sessionIsFinanceiroAdmin())) {
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const ym = parseMonthQueryParam(searchParams.get('mes'))
    const { gte, lte } = monthParcelDateBounds(ym)

    const parcels = await findPaymentDatesInParcelMonthRange(gte, lte)

    const paymentIds = [...new Set(parcels.map((p) => p.id_payment))]
    const payments =
      paymentIds.length === 0
        ? []
        : await prisma.payment.findMany({
            where: { id: { in: paymentIds } },
            select: { id: true, income: true },
          })
    const incomeByPaymentId = new Map(payments.map((p) => [p.id, p.income]))

    const lastDay = new Date(ym.y, ym.mo, 0).getDate()
    const dayKey = (d: number) => `${ym.y}-${String(ym.mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`

    const emptyDay = (): Record<FinanceiroCalendarioBucket, number> & { resultado: number } => ({
      ...emptyFinanceiroCalendarioDayTotals(),
      resultado: 0,
    })

    const byDay = new Map<string, Record<FinanceiroCalendarioBucket, number> & { resultado: number }>()
    for (let d = 1; d <= lastDay; d++) {
      byDay.set(dayKey(d), emptyDay())
    }

    const totalsBuckets = emptyFinanceiroCalendarioDayTotals()
    let resultadoMes = 0

    for (const row of parcels) {
      const income = incomeByPaymentId.get(row.id_payment)
      if (income == null) continue

      const ymd = formatSqlDateOnly(row.parcel_date)
      if (!ymd) continue
      const day = byDay.get(ymd)
      if (!day) continue

      const bucket = parcelFinanceiroCalendarioBucket({ income, statusCode: row.status, parcelDate: row.parcel_date })
      if (bucket == null) continue

      const v = Number(row.parcel_value) || 0
      day[bucket] += v
      const r = parcelFinanceiroResultadoContribution({ income, bucket, parcelValue: v })
      day.resultado += r
      totalsBuckets[bucket] += v
      resultadoMes += r
    }

    const days = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ymd, totals]) => ({ ymd, ...totals }))

    return NextResponse.json({
      ok: true,
      mes: yearMonthToYmdPrefix(ym),
      legend: [...FINANCEIRO_CALENDARIO_LEGEND, FINANCEIRO_CALENDARIO_LEGEND_RESULTADO],
      buckets: FINANCEIRO_CALENDARIO_BUCKETS_ORDER,
      days,
      totals_mes: { ...totalsBuckets, resultado: resultadoMes },
    })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? 'Erro ao montar calendário' },
      { status: 500 }
    )
  }
}
