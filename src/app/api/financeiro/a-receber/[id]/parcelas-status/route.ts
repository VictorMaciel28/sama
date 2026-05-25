import { NextResponse } from 'next/server'
import { sessionIsFinanceiroAdmin } from '@/lib/financeiroAdminAuth'
import { parseMonthQueryParam } from '@/lib/financeiroMesBounds'
import { updateParcelasStatusInMonth } from '@/lib/financeiroParcelStatusMes'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    if (!(await sessionIsFinanceiroAdmin())) {
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 403 })
    }

    const id = Number(params.id)
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json({ ok: false, error: 'ID inválido' }, { status: 400 })
    }

    const body = (await req.json().catch(() => null)) as { mes?: string; status?: number } | null
    const ym = parseMonthQueryParam(body?.mes ?? null)
    const statusCode = Number(body?.status)
    if (!Number.isFinite(statusCode)) {
      return NextResponse.json({ ok: false, error: 'Status inválido' }, { status: 400 })
    }

    const result = await updateParcelasStatusInMonth({
      paymentId: id,
      income: 1,
      ym,
      statusCode,
    })

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.http })
    }

    return NextResponse.json({ ok: true, updated: result.count })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? 'Erro ao atualizar status' },
      { status: 500 }
    )
  }
}
