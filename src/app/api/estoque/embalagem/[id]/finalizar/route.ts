import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { prisma } from '@/lib/prisma'
import { tinyPedidoAlterarSituacao } from '@/lib/tinyPedidoAlterarSituacao'
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
      return NextResponse.json({ ok: false, error: 'Não encontrado' }, { status: 404 })
    }
    if (sep.status !== SeparacaoStatus.SEPARADO) {
      return NextResponse.json({ ok: false, error: 'Indisponível' }, { status: 400 })
    }

    const vid = Number(session.user.id)
    const finalizadorId = Number.isFinite(vid) && vid > 0 ? vid : null

    const linkRows = await prisma.stock_separation_order.findMany({
      where: { separation_id: id },
      select: { order_numero: true },
    })
    const numeros = [...new Set(linkRows.map((r) => r.order_numero))]
    const pedidosTiny = await prisma.platform_order.findMany({
      where: { numero: { in: numeros } },
      select: { tiny_id: true },
    })
    const seenTiny = new Set<number>()
    let tiny_updated = false
    for (const p of pedidosTiny) {
      const tid = p.tiny_id != null && Number(p.tiny_id) > 0 ? Number(p.tiny_id) : null
      if (!tid || seenTiny.has(tid)) continue
      seenTiny.add(tid)
      const tr = await tinyPedidoAlterarSituacao(tid, 'pronto_envio')
      if (!tr.ok) {
        return NextResponse.json({ ok: false, error: tr.error }, { status: 502 })
      }
      tiny_updated = true
    }

    await prisma.stock_separation.update({
      where: { id },
      data: {
        status: SeparacaoStatus.CONCLUIDO,
        concluido_at: new Date(),
        ...(finalizadorId != null ? { embalagem_finalizada_vendedor_id: finalizadorId } : {}),
      },
    })

    revalidatePath('/estoque/embalagem')

    return NextResponse.json({ ok: true, tiny_updated })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Erro' }, { status: 500 })
  }
}
