import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { prisma } from '@/lib/prisma'
import { PedidoStatus } from '@prisma/client'

export async function GET(_: Request, { params }: { params: { numero: string } }) {
  try {
    const session = (await getServerSession(options as any)) as { user?: { id?: string } } | null
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const numero = Number(params.numero)
    if (!Number.isFinite(numero) || numero < 1) {
      return NextResponse.json({ ok: false, error: 'Pedido inválido' }, { status: 400 })
    }

    const pedido = await prisma.platform_order.findFirst({
      where: { numero, status: PedidoStatus.APROVADO },
      include: {
        products: {
          orderBy: { id: 'asc' },
          select: {
            codigo: true,
            nome: true,
            quantidade: true,
            unidade: true,
          },
        },
      },
    })

    if (!pedido) {
      return NextResponse.json({ ok: false, error: 'Pedido não encontrado ou não está aprovado.' }, { status: 404 })
    }

    return NextResponse.json({
      ok: true,
      data: {
        numero: pedido.numero,
        data: pedido.data.toISOString().slice(0, 10),
        cliente: pedido.cliente,
        cnpj: pedido.cnpj,
        total: pedido.total.toString(),
        representante: pedido.id_vendedor_externo ?? null,
        itens: pedido.products.map((p) => ({
          codigo: p.codigo,
          nome: p.nome,
          quantidade: p.quantidade.toString(),
          unidade: p.unidade,
        })),
      },
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Erro' }, { status: 500 })
  }
}
