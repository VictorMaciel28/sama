import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { prisma } from '@/lib/prisma'
import { labelSeparacaoStatus } from '@/lib/separacaoLabels'
import { aggregateItensSeparacao } from '@/lib/separacaoAggregate'

export async function GET(_: Request, { params }: { params: { id: string } }) {
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
      include: {
        orders: {
          include: {
            order_ref: {
              select: {
                numero: true,
                cliente: true,
                status: true,
                total: true,
                data: true,
                products: {
                  select: { codigo: true, nome: true, unidade: true, quantidade: true, produto_id: true },
                },
              },
            },
          },
        },
      },
    })

    if (!sep) {
      return NextResponse.json({ ok: false, error: 'Separação não encontrada' }, { status: 404 })
    }

    const pedidos = sep.orders.map((o) => ({
      numero: o.order_ref.numero,
      cliente: o.order_ref.cliente,
      status: o.order_ref.status,
      total: o.order_ref.total.toString(),
      data: o.order_ref.data.toISOString().slice(0, 10),
    }))

    const forAgg = sep.orders.map((o) => ({
      numero: o.order_ref.numero,
      cliente: o.order_ref.cliente,
      products: o.order_ref.products,
    }))

    const itens_agrupados = aggregateItensSeparacao(forAgg)

    return NextResponse.json({
      ok: true,
      data: {
        id: sep.id,
        status: sep.status,
        status_label: labelSeparacaoStatus(sep.status),
        id_vendedor_externo: sep.id_vendedor_externo,
        created_at: sep.created_at.toISOString(),
        finished_at: sep.finished_at ? sep.finished_at.toISOString() : null,
        pedidos,
        itens_agrupados,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Erro ao carregar' }, { status: 500 })
  }
}
