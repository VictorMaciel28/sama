import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { prisma } from '@/lib/prisma'
import { PedidoStatus } from '@prisma/client'

export async function GET() {
  try {
    const session = (await getServerSession(options as any)) as { user?: { id?: string } } | null
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const pedidos = await prisma.platform_order.findMany({
      where: { status: PedidoStatus.APROVADO },
      orderBy: { data: 'desc' },
      take: 200,
      select: {
        numero: true,
        data: true,
        cliente: true,
        cnpj: true,
        total: true,
        id_vendedor_externo: true,
      },
    })

    const data = pedidos.map((p) => ({
      numero: p.numero,
      data: p.data.toISOString().slice(0, 10),
      cliente: p.cliente,
      cnpj: p.cnpj,
      total: p.total.toString(),
      representante: p.id_vendedor_externo ?? null,
    }))

    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Erro' }, { status: 500 })
  }
}
