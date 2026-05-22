import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { prisma } from '@/lib/prisma'
import { findVendedorForAuthSession } from '@/lib/vendedorFromSession'
import { PedidoStatus, SeparacaoStatus } from '@prisma/client'

export async function POST(req: Request) {
  try {
    const session = (await getServerSession(options as any)) as { user?: { id?: string } } | null
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const order_numero = Number(body?.order_numero)
    if (!Number.isFinite(order_numero) || order_numero < 1) {
      return NextResponse.json({ ok: false, error: 'Pedido inválido.' }, { status: 400 })
    }

    const emEmbalagem = await prisma.stock_separation_order.findFirst({
      where: {
        order_numero,
        separation: { status: { in: [SeparacaoStatus.SEPARADO, SeparacaoStatus.CONCLUIDO] } },
      },
      select: { id: true },
    })
    if (emEmbalagem) {
      return NextResponse.json({ ok: false, error: 'Pedido já vinculado a uma embalagem.' }, { status: 409 })
    }

    const pedido = await prisma.platform_order.findFirst({
      where: { numero: order_numero, status: PedidoStatus.FATURADO },
      select: { numero: true },
    })
    if (!pedido) {
      return NextResponse.json({ ok: false, error: 'Pedido não encontrado ou não está faturado.' }, { status: 400 })
    }

    const vend = await findVendedorForAuthSession(session.user)
    const externo = vend?.id_vendedor_externo ?? null
    const vid = Number(session.user.id)
    const separacao_vendedor_id = Number.isFinite(vid) && vid > 0 ? vid : null

    const sep = await prisma.$transaction(async (tx) => {
      const s = await tx.stock_separation.create({
        data: {
          status: SeparacaoStatus.SEPARADO,
          id_vendedor_externo: externo,
          separacao_vendedor_id,
          finished_at: new Date(),
        },
      })
      await tx.stock_separation_order.create({
        data: { separation_id: s.id, order_numero },
      })
      return s
    })

    /** Situação `pronto_envio` na Tiny é aplicada ao concluir a conferência (`POST .../embalagem/[id]/finalizar`). */
    return NextResponse.json({ ok: true, id: sep.id })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Erro' }, { status: 500 })
  }
}
