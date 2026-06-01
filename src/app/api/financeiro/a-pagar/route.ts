import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sessionIsFinanceiroAdmin } from '@/lib/financeiroAdminAuth'
import {
  findPaymentDatesByPaymentIds,
  findPaymentIdsByParcelMonthRange,
  type FinanceiroPaymentDateRow,
} from '@/lib/financeiroPaymentDateRows'
import {
  listPaymentStatusOptions,
  parcelStatusForFilteredMonth,
  parcelVencimentoPagamentoMaxInMonth,
} from '@/lib/financeiroParcelStatusMes'
import { formatSqlDateOnly } from '@/lib/calendarDate'
import { monthParcelDateBounds, parseMonthQueryParam, yearMonthToYmdPrefix } from '@/lib/financeiroMesBounds'

function formatParcelLabel(indicesInMonthSorted: number[], total: number): string {
  if (total < 1 || indicesInMonthSorted.length < 1) return '—'
  const sorted = [...indicesInMonthSorted].sort((a, b) => a - b)
  if (sorted.length === 1) {
    return `Parcela (${sorted[0]}/${total})`
  }
  let consecutive = true
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) {
      consecutive = false
      break
    }
  }
  const inner = consecutive ? `${sorted[0]}–${sorted[sorted.length - 1]}` : sorted.join(', ')
  return `Parcelas (${inner}/${total})`
}

export async function GET(req: Request) {
  try {
    if (!(await sessionIsFinanceiroAdmin())) {
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const destineParam = (searchParams.get('destine') || '').trim()
    const ym = parseMonthQueryParam(searchParams.get('mes'))
    const { gte, lte } = monthParcelDateBounds(ym)

    const paymentIdsInMonth = await findPaymentIdsByParcelMonthRange(gte, lte)

    if (paymentIdsInMonth.length === 0) {
      const payment_statuses = await listPaymentStatusOptions()
      return NextResponse.json({
        ok: true,
        mes: yearMonthToYmdPrefix(ym),
        destines: [],
        payment_statuses,
        data: [],
      })
    }

    const basePaymentWhere = {
      income: 0 as const,
      id: { in: paymentIdsInMonth },
    }

    const [destineGroups, payments, methods, accounts, payment_statuses] = await Promise.all([
      prisma.payment.groupBy({
        by: ['destine'],
        where: basePaymentWhere,
        orderBy: { destine: 'asc' },
      }),
      prisma.payment.findMany({
        where: destineParam ? { ...basePaymentWhere, destine: destineParam } : basePaymentWhere,
        orderBy: [{ destine: 'asc' }, { id: 'asc' }],
      }),
      prisma.payment_method.findMany({ select: { code: true, name: true } }),
      prisma.account.findMany({ select: { id: true, name: true } }),
      listPaymentStatusOptions(),
    ])

    const methodByCode = new Map(methods.map((m) => [m.code, m.name]))
    const accountById = new Map(accounts.map((a) => [a.id, a.name]))

    const destines = destineGroups.map((r) => r.destine).filter((d) => d != null && String(d).trim() !== '')

    const finalIds = payments.map((p) => p.id)
    const parcelsByPayment = new Map<number, FinanceiroPaymentDateRow[]>()

    if (finalIds.length > 0) {
      const allParcels = await findPaymentDatesByPaymentIds(finalIds)
      for (const row of allParcels) {
        const list = parcelsByPayment.get(row.id_payment)
        if (list) list.push(row)
        else parcelsByPayment.set(row.id_payment, [row])
      }
      for (const list of parcelsByPayment.values()) {
        list.sort((a, b) => {
          const ta = a.parcel_date.getTime()
          const tb = b.parcel_date.getTime()
          if (ta !== tb) return ta - tb
          return a.id - b.id
        })
      }
    }

    const data = payments.map((p) => {
      const list = parcelsByPayment.get(p.id) || []
      const total = list.length
      const indicesInMonth: number[] = []
      list.forEach((row, idx) => {
        const d = row.parcel_date
        if (d && d >= gte && d <= lte) indicesInMonth.push(idx + 1)
      })
      const parcel_label = formatParcelLabel(indicesInMonth, total)
      const parcel_status_mes = parcelStatusForFilteredMonth(list, gte, lte)
      const { vencimentoMax, pagamentoMax } = parcelVencimentoPagamentoMaxInMonth(list, gte, lte)

      return {
        id: p.id,
        number: p.number.toString(),
        emiter: p.emiter,
        destine: p.destine,
        method: p.method,
        method_name: methodByCode.get(p.method) ?? null,
        observation: p.observation,
        id_account: p.id_account ?? null,
        account_name: p.id_account != null ? accountById.get(p.id_account) ?? null : null,
        parcel_label,
        parcel_total: total,
        parcel_status_mes,
        parcel_vencimento_mes: vencimentoMax ? formatSqlDateOnly(vencimentoMax) : null,
        parcel_pagamento_mes: pagamentoMax ? formatSqlDateOnly(pagamentoMax) : null,
      }
    })

    data.sort((a, b) => {
      const ca = a.parcel_vencimento_mes ?? ''
      const cb = b.parcel_vencimento_mes ?? ''
      const cmp = cb.localeCompare(ca)
      if (cmp !== 0) return cmp
      return b.id - a.id
    })

    return NextResponse.json({ ok: true, mes: yearMonthToYmdPrefix(ym), destines, payment_statuses, data })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? 'Erro ao listar a pagar' },
      { status: 500 }
    )
  }
}
