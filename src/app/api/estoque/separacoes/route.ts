import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { prisma } from '@/lib/prisma'
import { findVendedorForAuthSession } from '@/lib/vendedorFromSession'
import { labelSeparacaoStatusListagem } from '@/lib/separacaoLabels'
import { PedidoStatus, SeparacaoStatus } from '@prisma/client'

async function requireAuth() {
  const session = (await getServerSession(options as any)) as { user?: { id?: string; email?: string | null } } | null
  if (!session?.user?.id) return { session: null as typeof session, error: NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 }) }
  return { session, error: null as NextResponse | null }
}

export async function GET() {
  try {
    const { session, error } = await requireAuth()
    if (error) return error

    const rows = await prisma.stock_separation.findMany({
      where: { status: { not: SeparacaoStatus.PRE_FATURAMENTO } },
      orderBy: { id: 'desc' },
      take: 150,
      include: {
        separacao_vendedor: { select: { id: true, nome: true } },
        orders: {
          include: {
            order_ref: { select: { numero: true, cliente: true, status: true, total: true } },
          },
        },
      },
    })

    const data = rows.map((r) => ({
      id: r.id,
      status: r.status,
      status_label: labelSeparacaoStatusListagem(r.status),
      id_vendedor_externo: r.id_vendedor_externo,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
      finished_at: r.finished_at ? r.finished_at.toISOString() : null,
      responsavel_nome: r.separacao_vendedor?.nome ?? null,
      pedidos_count: r.orders.length,
      pedidos: r.orders.map((o) => ({
        numero: o.order_ref.numero,
        cliente: o.order_ref.cliente,
        status: o.order_ref.status,
        total: o.order_ref.total.toString(),
      })),
    }))

    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Erro ao listar' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { session, error } = await requireAuth()
    if (error) return error

    const body = await req.json().catch(() => null)
    const raw = Array.isArray(body?.order_numeros) ? body.order_numeros : []
    const order_numeros = [...new Set(raw.map((n: unknown) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))] as number[]
    if (order_numeros.length === 0) {
      return NextResponse.json({ ok: false, error: 'Selecione ao menos um pedido.' }, { status: 400 })
    }

    const busy = await prisma.stock_separation_order.findMany({
      where: { separation: { status: SeparacaoStatus.SEPARANDO } },
      select: { order_numero: true },
    })
    const busySet = new Set(busy.map((b) => b.order_numero))
    const conflict = order_numeros.filter((n) => busySet.has(n))
    if (conflict.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Pedido(s) já em separação ativa: ${conflict.join(', ')}`,
        },
        { status: 409 }
      )
    }

    const found = await prisma.platform_order.findMany({
      where: { numero: { in: order_numeros } },
      select: { numero: true, status: true },
    })
    if (found.length !== order_numeros.length) {
      return NextResponse.json({ ok: false, error: 'Um ou mais pedidos não foram encontrados.' }, { status: 400 })
    }
    const naoFaturados = found.filter((f) => f.status !== PedidoStatus.FATURADO).map((f) => f.numero)
    if (naoFaturados.length > 0) {
      return NextResponse.json(
        { ok: false, error: `Apenas pedidos faturados: ${naoFaturados.join(', ')}` },
        { status: 400 }
      )
    }

    const vend = await findVendedorForAuthSession(session!.user)
    const externo = vend?.id_vendedor_externo ?? null
    const vid = Number(session!.user.id)
    const separacao_vendedor_id = Number.isFinite(vid) && vid > 0 ? vid : null

    const sep = await prisma.$transaction(async (tx) => {
      const s = await tx.stock_separation.create({
        data: {
          status: SeparacaoStatus.SEPARANDO,
          id_vendedor_externo: externo,
          separacao_vendedor_id,
        },
      })
      await tx.stock_separation_order.createMany({
        data: order_numeros.map((order_numero) => ({
          separation_id: s.id,
          order_numero,
        })),
      })
      return s
    })

    return NextResponse.json({ ok: true, id: sep.id })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Erro ao criar' }, { status: 500 })
  }
}
