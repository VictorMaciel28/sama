import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { Prisma } from '@prisma/client'
import { EMPRESA_IDS } from '@/constants/empresas-suprimentos'

type ParcelaIn = {
  dias?: number
  dataVencimento?: string
  valor?: number
  contaContabil?: { id?: number }
  meioPagamento?: number
  observacoes?: string
}

type ItemIn = {
  produto?: { id?: number; tipo?: string; nome?: string; codigo?: string; manual?: boolean }
  quantidade?: number
  valor?: number
  informacoesAdicionais?: string
  aliquotaIPI?: number
  valorICMS?: number
  valorST?: number
}

function toDateOnly(s: string | undefined): Date | null {
  if (!s) return null
  const d = new Date(String(s).slice(0, 10) + 'T12:00:00')
  return Number.isNaN(d.getTime()) ? null : d
}

/** Igual ao front: q×vu + IPI% sobre a base + ICMS em valor. */
function itemLineTotalDec(it: ItemIn, q: number, vu: number): Prisma.Decimal {
  const sub = new Prisma.Decimal(q).mul(vu)
  const ipiPct =
    it.aliquotaIPI != null && Number.isFinite(Number(it.aliquotaIPI)) ? Number(it.aliquotaIPI) : 0
  const ipiVal = sub.mul(ipiPct).div(100)
  const icmsNum =
    it.valorICMS != null && Number.isFinite(Number(it.valorICMS)) ? Number(it.valorICMS) : 0
  const stNum = it.valorST != null && Number.isFinite(Number(it.valorST)) ? Number(it.valorST) : 0
  return sub.add(ipiVal).add(new Prisma.Decimal(icmsNum)).add(new Prisma.Decimal(stNum))
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
    const empresa_id = String(body?.empresa_id || body?.empresaId || '').trim()
    if (!EMPRESA_IDS.has(empresa_id)) {
      return NextResponse.json({ ok: false, error: 'empresa_id inválido' }, { status: 400 })
    }

    const data = toDateOnly(body?.data)
    const data_prevista = toDateOnly(body?.dataPrevista)
    if (!data || !data_prevista) {
      return NextResponse.json({ ok: false, error: 'data e dataPrevista são obrigatórias' }, { status: 400 })
    }

    const cliente_id = Number(body?.contato?.id ?? body?.cliente_id)
    if (!Number.isFinite(cliente_id) || cliente_id <= 0) {
      return NextResponse.json({ ok: false, error: 'contato (cliente) inválido' }, { status: 400 })
    }

    const cliente = await prisma.cliente.findUnique({ where: { id: cliente_id } })
    if (!cliente) {
      return NextResponse.json({ ok: false, error: 'Cliente não encontrado' }, { status: 400 })
    }

    const desconto = new Prisma.Decimal(Number(body?.desconto ?? 0))
    const frete = new Prisma.Decimal(Number(body?.frete ?? 0))
    const frete_por_conta = String(body?.fretePorConta || 'R').slice(0, 1).toUpperCase() || 'R'
    const condicao = body?.condicao != null ? String(body.condicao).slice(0, 255) : null
    const observacoes = body?.observacoes != null ? String(body.observacoes) : null
    const observacoes_internas = body?.observacoesInternas != null ? String(body.observacoesInternas) : null
    const transportador = body?.transportador != null ? String(body.transportador).slice(0, 255) : null
    const categoria_id =
      body?.categoria?.id != null && Number.isFinite(Number(body.categoria.id))
        ? Number(body.categoria.id)
        : null

    const rawItems: ItemIn[] = Array.isArray(body?.itens) ? body.itens : []
    if (rawItems.length === 0) {
      return NextResponse.json({ ok: false, error: 'Informe ao menos um item' }, { status: 400 })
    }

    const itemsPayload: {
      product_id: number | null
      tiny_produto_id: bigint | null
      produto_codigo: string | null
      produto_nome: string | null
      quantidade: Prisma.Decimal
      valor: Prisma.Decimal
      informacoes_adicionais: string | null
      aliquota_ipi: Prisma.Decimal | null
      valor_icms: Prisma.Decimal | null
      valor_st: Prisma.Decimal | null
    }[] = []

    let bruto = new Prisma.Decimal(0)
    for (const it of rawItems) {
      const q = Number(it?.quantidade ?? 0)
      const vu = Number(it?.valor ?? 0)
      if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(vu) || vu < 0) {
        return NextResponse.json({ ok: false, error: 'Quantidade e valor unitário inválidos nos itens' }, { status: 400 })
      }
      const sub = new Prisma.Decimal(q).mul(vu)

      if (it?.produto?.manual === true) {
        const nomeManual = it?.produto?.nome != null ? String(it.produto.nome).trim() : ''
        if (!nomeManual) {
          return NextResponse.json(
            { ok: false, error: 'Item manual: informe a descrição do produto.' },
            { status: 400 }
          )
        }
        const codigoManual = it?.produto?.codigo != null ? String(it.produto.codigo).trim() : ''
        itemsPayload.push({
          product_id: null,
          tiny_produto_id: null,
          produto_codigo: codigoManual ? codigoManual.slice(0, 100) : null,
          produto_nome: nomeManual.slice(0, 255),
          quantidade: new Prisma.Decimal(q),
          valor: new Prisma.Decimal(vu),
          informacoes_adicionais: it.informacoesAdicionais != null ? String(it.informacoesAdicionais) : null,
          aliquota_ipi:
            it.aliquotaIPI != null && Number.isFinite(Number(it.aliquotaIPI))
              ? new Prisma.Decimal(Number(it.aliquotaIPI))
              : null,
          valor_icms:
            it.valorICMS != null && Number.isFinite(Number(it.valorICMS))
              ? new Prisma.Decimal(Number(it.valorICMS))
              : null,
          valor_st:
            it.valorST != null && Number.isFinite(Number(it.valorST))
              ? new Prisma.Decimal(Number(it.valorST))
              : null,
        })
        bruto = bruto.add(itemLineTotalDec(it, q, vu))
        continue
      }

      const pid = Number(it?.produto?.id)
      if (!Number.isFinite(pid) || pid <= 0) {
        return NextResponse.json({ ok: false, error: 'Cada item precisa de produto.id ou ser marcado como manual' }, { status: 400 })
      }
      const nomeTiny = it?.produto?.nome != null ? String(it.produto.nome).trim() : ''
      const codigoTiny = it?.produto?.codigo != null ? String(it.produto.codigo).trim() : ''

      const prodLocal = await prisma.product.findUnique({ where: { id: pid } })
      bruto = bruto.add(itemLineTotalDec(it, q, vu))

      if (prodLocal) {
        itemsPayload.push({
          product_id: prodLocal.id,
          tiny_produto_id: null,
          produto_codigo: null,
          produto_nome: null,
          quantidade: new Prisma.Decimal(q),
          valor: new Prisma.Decimal(vu),
          informacoes_adicionais: it.informacoesAdicionais != null ? String(it.informacoesAdicionais) : null,
          aliquota_ipi:
            it.aliquotaIPI != null && Number.isFinite(Number(it.aliquotaIPI))
              ? new Prisma.Decimal(Number(it.aliquotaIPI))
              : null,
          valor_icms:
            it.valorICMS != null && Number.isFinite(Number(it.valorICMS))
              ? new Prisma.Decimal(Number(it.valorICMS))
              : null,
          valor_st:
            it.valorST != null && Number.isFinite(Number(it.valorST))
              ? new Prisma.Decimal(Number(it.valorST))
              : null,
        })
      } else {
        if (!nomeTiny) {
          return NextResponse.json(
            { ok: false, error: 'Itens do Tiny precisam de produto.nome quando não há vínculo local' },
            { status: 400 }
          )
        }
        itemsPayload.push({
          product_id: null,
          tiny_produto_id: BigInt(pid),
          produto_codigo: codigoTiny ? codigoTiny.slice(0, 100) : null,
          produto_nome: nomeTiny.slice(0, 255),
          quantidade: new Prisma.Decimal(q),
          valor: new Prisma.Decimal(vu),
          informacoes_adicionais: it.informacoesAdicionais != null ? String(it.informacoesAdicionais) : null,
          aliquota_ipi:
            it.aliquotaIPI != null && Number.isFinite(Number(it.aliquotaIPI))
              ? new Prisma.Decimal(Number(it.aliquotaIPI))
              : null,
          valor_icms:
            it.valorICMS != null && Number.isFinite(Number(it.valorICMS))
              ? new Prisma.Decimal(Number(it.valorICMS))
              : null,
          valor_st:
            it.valorST != null && Number.isFinite(Number(it.valorST))
              ? new Prisma.Decimal(Number(it.valorST))
              : null,
        })
      }
    }

    const valor_total = bruto.add(frete).sub(desconto)

    let parcelasJson: ParcelaIn[] | null = null
    if (Array.isArray(body?.parcelas) && body.parcelas.length > 0) {
      parcelasJson = body.parcelas.map((p: ParcelaIn) => ({
        dias: p.dias ?? 0,
        dataVencimento: p.dataVencimento ? String(p.dataVencimento).slice(0, 10) : null,
        valor: p.valor != null ? Number(p.valor) : 0,
        contaContabil: { id: p.contaContabil?.id ?? 0 },
        meioPagamento: p.meioPagamento ?? 1,
        observacoes: p.observacoes ?? '',
      }))
    }

    const created = await prisma.purchase_order.create({
      data: {
        empresa_id,
        data,
        data_prevista,
        desconto,
        condicao,
        observacoes,
        observacoes_internas,
        frete_por_conta,
        transportador,
        frete,
        categoria_id,
        cliente_id,
        valor_total,
        parcelas: parcelasJson === null ? Prisma.JsonNull : parcelasJson,
        items: { create: itemsPayload },
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
