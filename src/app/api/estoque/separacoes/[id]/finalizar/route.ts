import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { prisma } from '@/lib/prisma'
import { SeparacaoStatus } from '@prisma/client'

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = (await getServerSession(options as any)) as { user?: { id?: string } } | null
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const id = Number(params.id)
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json({ ok: false, error: 'ID inválido' }, { status: 400 })
    }

    const sep = await prisma.stock_separation.findUnique({
      where: { id },
      select: { id: true, status: true },
    })
    if (!sep) {
      return NextResponse.json({ ok: false, error: 'Separação não encontrada' }, { status: 404 })
    }
    if (sep.status !== SeparacaoStatus.SEPARANDO) {
      return NextResponse.json({ ok: false, error: 'Esta separação já foi finalizada.' }, { status: 400 })
    }

    // `finished_at` = momento em que a separação foi concluída e enviada à fila de embalagem (coluna "Enviado em").
    // `separacao_vendedor_id` permanece quem criou a separação (POST inicial).
    const updated = await prisma.stock_separation.update({
      where: { id },
      data: {
        status: SeparacaoStatus.SEPARADO,
        finished_at: new Date(),
      },
    })

    revalidatePath('/estoque/embalagem')

    return NextResponse.json({
      ok: true,
      status: updated.status,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Erro ao finalizar' }, { status: 500 })
  }
}
