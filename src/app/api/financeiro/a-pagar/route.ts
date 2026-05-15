import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { prisma } from '@/lib/prisma'
import { monthParcelDateBounds, parseMonthQueryParam, yearMonthToYmdPrefix } from '@/lib/financeiroMesBounds'

async function sessionIsAdmin(): Promise<boolean> {
  const session = await getServerSession(options as any)
  const email = session?.user?.email
  if (!email || typeof email !== 'string') return false
  const vend = await prisma.vendedor.findFirst({
    where: { email },
    select: { id_vendedor_externo: true },
  })
  if (!vend?.id_vendedor_externo) return false
  const nivel = await prisma.vendedor_nivel_acesso
    .findUnique({
      where: { id_vendedor_externo: vend.id_vendedor_externo },
      select: { nivel: true },
    })
    .catch(() => null)
  return nivel?.nivel === 'ADMINISTRADOR'
}

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
    if (!(await sessionIsAdmin())) {
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const destineParam = (searchParams.get('destine') || '').trim()
    const ym = parseMonthQueryParam(searchParams.get('mes'))
    const { gte, lte } = monthParcelDateBounds(ym)

    const parcelRows = await prisma.payment_date.findMany({
      where: {
        parcel_date: { gte, lte },
      },
      select: { id_payment: true },
    })
    const paymentIdsInMonth = [...new Set(parcelRows.map((r) => r.id_payment))]

    if (paymentIdsInMonth.length === 0) {
      return NextResponse.json({
        ok: true,
        mes: yearMonthToYmdPrefix(ym),
        destines: [],
        data: [],
      })
    }

    const basePaymentWhere = {
      income: 0 as const,
      id: { in: paymentIdsInMonth },
    }

    const [destineGroups, payments, methods, accounts] = await Promise.all([
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
    ])

    const methodByCode = new Map(methods.map((m) => [m.code, m.name]))
    const accountById = new Map(accounts.map((a) => [a.id, a.name]))

    const destines = destineGroups.map((r) => r.destine).filter((d) => d != null && String(d).trim() !== '')

    const finalIds = payments.map((p) => p.id)
    type PdRow = Awaited<ReturnType<typeof prisma.payment_date.findMany>>[number]
    const parcelsByPayment = new Map<number, PdRow[]>()

    if (finalIds.length > 0) {
      const allParcels = await prisma.payment_date.findMany({
        where: { id_payment: { in: finalIds } },
      })
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
        url_danfe_tiny: p.url_danfe_tiny ?? null,
        id_nota_fiscal_tiny: p.id_nota_fiscal_tiny ?? null,
        parcel_label,
        parcel_total: total,
      }
    })

    return NextResponse.json({ ok: true, mes: yearMonthToYmdPrefix(ym), destines, data })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? 'Erro ao listar a pagar' },
      { status: 500 }
    )
  }
}
