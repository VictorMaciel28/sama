import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { options } from '@/app/api/auth/[...nextauth]/options'

export async function GET(_req: Request, context: { params: { id: string } }) {
  try {
    const session = await getServerSession(options as any)
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const id = Number(context.params.id)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: 'ID inválido' }, { status: 400 })
    }

    const row = await prisma.purchase_order.findUnique({
      where: { id },
      include: {
        cliente: { select: { id: true, nome: true, cpf_cnpj: true } },
        items: { include: { product: { select: { id: true, code: true, name: true } } } },
      },
    })

    if (!row) {
      return NextResponse.json({ ok: false, error: 'Ordem não encontrada' }, { status: 404 })
    }

    const data = {
      ...row,
      desconto: row.desconto.toString(),
      frete: row.frete.toString(),
      valor_total: row.valor_total.toString(),
      items: row.items.map((it) => ({
        ...it,
        tiny_produto_id: it.tiny_produto_id != null ? it.tiny_produto_id.toString() : null,
        quantidade: it.quantidade.toString(),
        valor: it.valor.toString(),
        aliquota_ipi: it.aliquota_ipi?.toString() ?? null,
        valor_icms: it.valor_icms?.toString() ?? null,
      })),
    }

    const safe = JSON.parse(JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)))

    return NextResponse.json({ ok: true, data: safe })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro ao carregar ordem'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function DELETE(_req: Request, context: { params: { id: string } }) {
  try {
    const session = await getServerSession(options as any)
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const id = Number(context.params.id)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: 'ID inválido' }, { status: 400 })
    }

    const existing = await prisma.purchase_order.findUnique({ where: { id }, select: { id: true } })
    if (!existing) {
      return NextResponse.json({ ok: false, error: 'Ordem não encontrada' }, { status: 404 })
    }

    await prisma.purchase_order.delete({ where: { id } })

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro ao excluir ordem'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
