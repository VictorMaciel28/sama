import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { Prisma } from '@prisma/client'
import { EMPRESA_IDS } from '@/constants/empresas-suprimentos'
import { montarOrdemCompraParaGravar } from '@/lib/ordemCompra/ordemCompraSalvar'

function toDateOnly(s: string | undefined): Date | null {
  if (!s) return null
  const d = new Date(String(s).slice(0, 10) + 'T12:00:00')
  return Number.isNaN(d.getTime()) ? null : d
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(options as any)
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const url = new URL(req.url)
    const empresaId = (url.searchParams.get('empresa') || '').trim()
    const dataInicio = toDateOnly(url.searchParams.get('dataInicio') || undefined)
    const dataFim = toDateOnly(url.searchParams.get('dataFim') || undefined)

    const where: Prisma.purchase_orderWhereInput = {}
    if (empresaId && EMPRESA_IDS.has(empresaId)) {
      where.empresa_id = empresaId
    }
    if (dataInicio && dataFim) {
      where.data = { gte: dataInicio, lte: dataFim }
    } else if (dataInicio) {
      where.data = { gte: dataInicio }
    } else if (dataFim) {
      where.data = { lte: dataFim }
    }

    const rows = await prisma.purchase_order.findMany({
      where,
      orderBy: { id: 'desc' },
      take: 500,
      include: {
        cliente: { select: { id: true, nome: true, cpf_cnpj: true } },
        items: { include: { product: { select: { id: true, code: true, name: true } } } },
      },
    })

    const data = rows.map((r) => ({
      ...r,
      desconto: r.desconto.toString(),
      frete: r.frete.toString(),
      valor_total: r.valor_total.toString(),
      items: r.items.map((it) => ({
        ...it,
        tiny_produto_id: it.tiny_produto_id != null ? it.tiny_produto_id.toString() : null,
        quantidade: it.quantidade.toString(),
        valor: it.valor.toString(),
        aliquota_ipi: it.aliquota_ipi?.toString() ?? null,
        valor_icms: it.valor_icms?.toString() ?? null,
        valor_st: it.valor_st?.toString() ?? null,
      })),
    }))

    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Erro ao listar' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(options as any)
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = await montarOrdemCompraParaGravar(prisma, body)
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status })
    }

    const d = parsed.ordem
    const created = await prisma.purchase_order.create({
      data: {
        empresa_id: d.empresa_id,
        data: d.data,
        data_prevista: d.data_prevista,
        desconto: d.desconto,
        condicao: d.condicao,
        observacoes: d.observacoes,
        observacoes_internas: d.observacoes_internas,
        frete_por_conta: d.frete_por_conta,
        transportador: d.transportador,
        frete: d.frete,
        categoria_id: d.categoria_id,
        cliente_id: d.cliente_id,
        valor_total: d.valor_total,
        parcelas: d.parcelasJson === null ? Prisma.JsonNull : d.parcelasJson,
        items: { create: d.itemsPayload },
      },
      include: {
        cliente: { select: { id: true, nome: true } },
        items: { include: { product: true } },
      },
    })

    const safe = JSON.parse(
      JSON.stringify(created, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
    )
    return NextResponse.json({ ok: true, data: safe })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Erro ao salvar' }, { status: 500 })
  }
}
