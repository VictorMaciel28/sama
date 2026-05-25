import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sessionIsFinanceiroAdmin } from '@/lib/financeiroAdminAuth'

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    if (!(await sessionIsFinanceiroAdmin())) {
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 403 })
    }

    const id = Number(params.id)
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json({ ok: false, error: 'ID inválido' }, { status: 400 })
    }

    const body = (await req.json().catch(() => null)) as { status?: number } | null
    const statusCode = Number(body?.status)
    if (!Number.isFinite(statusCode)) {
      return NextResponse.json({ ok: false, error: 'Status inválido' }, { status: 400 })
    }

    const parcel = await prisma.payment_date.findFirst({
      where: { id },
      select: { id: true },
    })
    if (!parcel) {
      return NextResponse.json({ ok: false, error: 'Parcela não encontrada' }, { status: 404 })
    }

    const statusRow = await prisma.payment_status.findFirst({
      where: { code: statusCode },
    })
    if (!statusRow) {
      return NextResponse.json({ ok: false, error: 'Status inválido' }, { status: 400 })
    }

    await prisma.payment_date.update({
      where: { id },
      data: { status: statusRow.code },
    })

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? 'Erro ao atualizar status' },
      { status: 500 }
    )
  }
}
