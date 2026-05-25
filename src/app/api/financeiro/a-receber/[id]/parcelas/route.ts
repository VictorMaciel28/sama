import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sessionIsFinanceiroAdmin } from '@/lib/financeiroAdminAuth'
import { formatSqlDateOnly } from '@/lib/calendarDate'
import { findPaymentDatesByPaymentIds } from '@/lib/financeiroPaymentDateRows'
import { monthParcelDateBounds, parseMonthQueryParam } from '@/lib/financeiroMesBounds'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    if (!(await sessionIsFinanceiroAdmin())) {
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 403 })
    }

    const id = Number(params.id)
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json({ ok: false, error: 'ID inválido' }, { status: 400 })
    }

    const { searchParams } = new URL(req.url)
    const ym = parseMonthQueryParam(searchParams.get('mes'))
    const { gte, lte } = monthParcelDateBounds(ym)

    const payment = await prisma.payment.findFirst({
      where: { id, income: 1 },
      select: {
        id: true,
        number: true,
        destine: true,
        emiter: true,
      },
    })
    if (!payment) {
      return NextResponse.json({ ok: false, error: 'Pagamento não encontrado' }, { status: 404 })
    }

    const rows = await findPaymentDatesByPaymentIds([id])

    const total = rows.length
    const parcels = rows.map((row, idx) => {
      const pd = row.parcel_date
      const inFilteredMonth = Boolean(pd && pd >= gte && pd <= lte)
      return {
        id: row.id,
        indice: idx + 1,
        total,
        number: row.number.toString(),
        parcel_value: row.parcel_value,
        parcel_date: formatSqlDateOnly(row.parcel_date),
        approved_date: row.approved_date ? formatSqlDateOnly(row.approved_date) : null,
        status: row.status,
        insert_date: row.insert_date ? row.insert_date.toISOString() : null,
        in_filtered_month: inFilteredMonth,
      }
    })

    return NextResponse.json({
      ok: true,
      payment: {
        id: payment.id,
        number: payment.number.toString(),
        destine: payment.destine,
        emiter: payment.emiter,
      },
      parcels,
    })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? 'Erro ao listar parcelas' },
      { status: 500 }
    )
  }
}
