import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { prisma } from '@/lib/prisma'
import { fetchGtinMapForProdutoIds } from '@/lib/tinyProdutoGtins'
import { SeparacaoStatus } from '@prisma/client'

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

    let sep = await prisma.stock_separation.findUnique({
      where: { id },
      include: {
        orders: {
          orderBy: { id: 'asc' },
          include: {
            order_ref: {
              select: {
                numero: true,
                cliente: true,
                status: true,
                products: {
                  select: {
                    id: true,
                    codigo: true,
                    nome: true,
                    unidade: true,
                    quantidade: true,
                    produto_id: true,
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!sep) {
      return NextResponse.json({ ok: false, error: 'Não encontrado' }, { status: 404 })
    }
    if (sep.status !== SeparacaoStatus.SEPARADO) {
      return NextResponse.json({ ok: false, error: 'Indisponível' }, { status: 400 })
    }

    const vid = Number(session.user.id)
    if (Number.isFinite(vid) && vid > 0 && sep.embalagem_iniciada_vendedor_id == null) {
      await prisma.stock_separation.updateMany({
        where: {
          id,
          status: SeparacaoStatus.SEPARADO,
          embalagem_iniciada_vendedor_id: null,
        },
        data: {
          embalagem_iniciada_vendedor_id: vid,
          embalagem_iniciada_at: new Date(),
        },
      })
      sep = await prisma.stock_separation.findUniqueOrThrow({
        where: { id },
        include: {
          orders: {
            orderBy: { id: 'asc' },
            include: {
              order_ref: {
                select: {
                  numero: true,
                  cliente: true,
                  status: true,
                  products: {
                    select: {
                      id: true,
                      codigo: true,
                      nome: true,
                      unidade: true,
                      quantidade: true,
                      produto_id: true,
                    },
                  },
                },
              },
            },
          },
        },
      })
    }

    const produtoIds = [
      ...new Set(
        sep.orders.flatMap((o) =>
          o.order_ref.products.map((p) => p.produto_id).filter((id): id is number => id != null && id > 0),
        ),
      ),
    ]
    const gtinPorProduto = await fetchGtinMapForProdutoIds(produtoIds)

    const pedidos = sep.orders.map((o, index) => ({
      index,
      numero: o.order_ref.numero,
      cliente: o.order_ref.cliente,
      status: o.order_ref.status,
      itens: o.order_ref.products.map((p) => ({
        id: p.id,
        codigo: p.codigo,
        gtin: p.produto_id != null ? (gtinPorProduto.get(p.produto_id) ?? null) : null,
        nome: p.nome,
        unidade: p.unidade,
        quantidade: p.quantidade.toString(),
        produto_id: p.produto_id,
      })),
    }))

    return NextResponse.json({
      ok: true,
      data: {
        id: sep.id,
        pedidos,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Erro' }, { status: 500 })
  }
}
