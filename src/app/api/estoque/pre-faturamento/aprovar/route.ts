import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { prisma } from '@/lib/prisma'
import { findVendedorForAuthSession } from '@/lib/vendedorFromSession'
import { tinyPedidoAlterarSituacao } from '@/lib/tinyPedidoAlterarSituacao'
import { PedidoStatus, SeparacaoStatus } from '@prisma/client'

export async function POST(req: Request) {
  try {
    const session = (await getServerSession(options as any)) as { user?: { id?: string } } | null
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const numero = Number(body?.order_numero)
    if (!Number.isFinite(numero) || numero < 1) {
      return NextResponse.json({ ok: false, error: 'Informe o número do pedido.' }, { status: 400 })
    }

    /** Só evita duplicar o próprio passo de pré-faturamento; ignora separação física / embalagem. */
    const jaPreFat = await prisma.stock_separation_order.findFirst({
      where: {
        order_numero: numero,
        separation: { status: SeparacaoStatus.PRE_FATURAMENTO },
      },
      select: { id: true },
    })
    if (jaPreFat) {
      return NextResponse.json(
        { ok: false, error: 'Este pedido já foi encaminhado nesta etapa de pré-faturamento.' },
        { status: 409 },
      )
    }

    const pedido = await prisma.platform_order.findFirst({
      where: { numero, status: PedidoStatus.APROVADO },
      select: { numero: true, tiny_id: true },
    })
    if (!pedido) {
      return NextResponse.json({ ok: false, error: 'Pedido não encontrado ou não está no status Aprovado.' }, { status: 400 })
    }

    const vend = await findVendedorForAuthSession(session.user)
    const externo = vend?.id_vendedor_externo ?? null
    const vid = Number(session.user.id)
    const separacao_vendedor_id = Number.isFinite(vid) && vid > 0 ? vid : null

    const sep = await prisma.$transaction(async (tx) => {
      const s = await tx.stock_separation.create({
        data: {
          status: SeparacaoStatus.PRE_FATURAMENTO,
          id_vendedor_externo: externo,
          separacao_vendedor_id,
        },
      })
      await tx.stock_separation_order.create({
        data: {
          separation_id: s.id,
          order_numero: numero,
        },
      })
      return s
    })

    const tinyId = pedido.tiny_id != null && Number(pedido.tiny_id) > 0 ? Number(pedido.tiny_id) : null
    let tiny_updated = false
    if (tinyId) {
      const tr = await tinyPedidoAlterarSituacao(tinyId, 'preparando_envio')
      if (!tr.ok) {
        await prisma.stock_separation.delete({ where: { id: sep.id } })
        return NextResponse.json({ ok: false, error: tr.error }, { status: 502 })
      }
      tiny_updated = true
    }

    return NextResponse.json({ ok: true, separation_id: sep.id, tiny_updated })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Erro' }, { status: 500 })
  }
}
