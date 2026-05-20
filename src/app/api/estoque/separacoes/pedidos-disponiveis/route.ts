import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { prisma } from '@/lib/prisma'
import { PedidoStatus, SeparacaoStatus } from '@prisma/client'

export async function GET() {
  try {
    const session = (await getServerSession(options as any)) as { user?: { id?: string } } | null
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const busy = await prisma.stock_separation_order.findMany({
      where: { separation: { status: SeparacaoStatus.SEPARANDO } },
      select: { order_numero: true },
    })
    const busySet = new Set(busy.map((b) => b.order_numero))

    const rows = await prisma.platform_order.findMany({
      where: {
        status: PedidoStatus.FATURADO,
        numero: busySet.size ? { notIn: [...busySet] } : undefined,
      },
      orderBy: { id: 'desc' },
      take: 400,
      select: {
        numero: true,
        cliente: true,
        data: true,
        id_vendedor_externo: true,
      },
    })

    const externos = [...new Set(rows.map((r) => r.id_vendedor_externo).filter((x): x is string => Boolean(x)))]
    const vends =
      externos.length > 0
        ? await prisma.vendedor.findMany({
            where: { id_vendedor_externo: { in: externos } },
            select: { id_vendedor_externo: true, nome: true },
          })
        : []
    const nomePorExterno = new Map(vends.map((v) => [v.id_vendedor_externo as string, v.nome ?? '']))

    const data = rows.map((r) => ({
      numero: r.numero,
      cliente: r.cliente,
      data: r.data.toISOString().slice(0, 10),
      representante:
        r.id_vendedor_externo != null && String(r.id_vendedor_externo).trim() !== ''
          ? nomePorExterno.get(r.id_vendedor_externo) || r.id_vendedor_externo
          : '—',
    }))

    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Erro ao listar pedidos' }, { status: 500 })
  }
}
