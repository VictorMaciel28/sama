import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { prisma } from '@/lib/prisma'
import { formatSqlDateOnly, parseYmdToSqlDate, todayCalendarYmdUtc } from '@/lib/calendarDate'
import {
  SISTEMA_ORIGEM_COMERCIAL,
  canAccessComercialOrder,
  normalizeComercialItems,
  nextPlatformOrderNumero,
  persistComercialOrderProducts,
  resolveComercialCompanyId,
  resolveComercialSessionAccess,
} from '@/lib/comercialPedidos'

function parseClienteCnpj(body: Record<string, unknown>) {
  let cliente = ''
  let cnpj = ''
  if (body?.cliente && typeof body.cliente === 'object') {
    cliente = String((body.cliente as { nome?: string }).nome ?? '').trim()
    cnpj = String(
      (body.cliente as { cpf_cnpj?: string }).cpf_cnpj ||
        (body.cliente as { cnpj?: string }).cnpj ||
        body?.cnpj ||
        ''
    ).trim()
  } else {
    cliente = String(body?.cliente ?? '').trim()
    cnpj = String(body?.cnpj ?? '').trim()
  }
  return { cliente, cnpj }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const companyId = (url.searchParams.get('company_id') || '').trim()

    const session = (await getServerSession(options as any)) as any
    if (!session?.user?.id) return NextResponse.json({ ok: true, data: [] })

    const access = await resolveComercialSessionAccess(session.user)
    if (!access) return NextResponse.json({ ok: true, data: [] })

    const where: any = {
      status: 'PROPOSTA',
      sistema_origem: SISTEMA_ORIGEM_COMERCIAL,
    }
    if (companyId) where.company_id = companyId
    if (!access.isAdmin && access.vendedorExterno) {
      where.id_vendedor_externo = access.vendedorExterno
    } else if (!access.isAdmin) {
      return NextResponse.json({ ok: true, data: [] })
    }

    const rows = await prisma.platform_order.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: { products: { orderBy: { id: 'asc' } } },
    })

    const data = rows.map((r) => ({
      numero: r.numero,
      data: formatSqlDateOnly(r.data),
      cliente: r.cliente,
      cnpj: r.cnpj,
      company_id: r.company_id ?? null,
      sistema_origem: SISTEMA_ORIGEM_COMERCIAL,
      total: Number(r.total),
      status: 'Proposta',
      forma_recebimento: r.forma_recebimento ?? null,
      condicao_pagamento: r.condicao_pagamento ?? null,
      juros_ligado: Boolean(r.juros_ligado ?? true),
      id_vendedor_externo: r.id_vendedor_externo,
      id_client_externo: r.id_client_externo != null ? r.id_client_externo.toString() : null,
      itens: (r.products || []).map((p) => ({
        produtoId: p.produto_id,
        codigo: p.codigo,
        nome: p.nome,
        quantidade: Number(p.quantidade),
        unidade: p.unidade,
        preco: Number(p.preco),
      })),
    }))

    return NextResponse.json({ ok: true, data })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao listar orçamentos' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = (await getServerSession(options as any)) as any
    if (!session?.user?.id) return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })

    const access = await resolveComercialSessionAccess(session.user)
    if (!access) return NextResponse.json({ ok: false, error: 'Usuário não autenticado' }, { status: 401 })

    const body = (await req.json()) as Record<string, unknown>
    const { cliente, cnpj } = parseClienteCnpj(body)
    if (!cliente) return NextResponse.json({ ok: false, error: 'Cliente obrigatório' }, { status: 400 })

    const dataStr = String(body?.data || '').slice(0, 10)
    const total = Number(body?.total || 0)
    const forma_recebimento = body?.forma_recebimento != null ? String(body.forma_recebimento).trim().slice(0, 50) || null : null
    const company_id = await resolveComercialCompanyId(body?.company_id, null)
    if (!company_id) return NextResponse.json({ ok: false, error: 'Empresa obrigatória' }, { status: 400 })
    const juros_ligado =
      body?.juros_ligado === false || body?.juros_ligado === 'false' || body?.juros_ligado === 0 || body?.juros_ligado === '0'
        ? false
        : true

    const id_vendedor_externo =
      body?.id_vendedor_externo != null && String(body.id_vendedor_externo).trim() !== ''
        ? String(body.id_vendedor_externo).trim()
        : access.vendedorExterno

    const idClientStr = body?.idContato != null ? String(body.idContato).trim() : ''
    const id_client_externo = /^\d+$/.test(idClientStr) && idClientStr !== '0' ? BigInt(idClientStr) : null
    const client_vendor_externo =
      body?.client_vendor_externo != null ? String(body.client_vendor_externo).trim() || null : null
    const endereco_entrega =
      body?.endereco_entrega != null && typeof body.endereco_entrega === 'object' ? body.endereco_entrega : undefined

    const nextNumero = await nextPlatformOrderNumero()
    const created = await prisma.platform_order.create({
      data: {
        numero: nextNumero,
        tiny_id: nextNumero,
        data: dataStr ? parseYmdToSqlDate(dataStr) : parseYmdToSqlDate(todayCalendarYmdUtc()),
        cliente,
        cnpj,
        company_id,
        total,
        status: 'PROPOSTA',
        forma_recebimento,
        condicao_pagamento: null,
        juros_ligado,
        id_vendedor_externo,
        id_client_externo,
        client_vendor_externo,
        sistema_origem: SISTEMA_ORIGEM_COMERCIAL,
        ...(endereco_entrega != null ? { endereco_entrega } : {}),
      } as any,
    })

    const items = normalizeComercialItems(body?.itens)
    await persistComercialOrderProducts(Number(created.tiny_id ?? created.numero), items)

    return NextResponse.json({ ok: true, numero: created.numero })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao salvar orçamento' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url)
    const numero = Number(url.searchParams.get('id') || 0)
    if (!numero) return NextResponse.json({ ok: false, error: 'Número obrigatório' }, { status: 400 })

    const session = (await getServerSession(options as any)) as any
    if (!session?.user?.id) return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })

    const access = await resolveComercialSessionAccess(session.user)
    if (!access) return NextResponse.json({ ok: false, error: 'Sem permissão' }, { status: 403 })

    const row = await prisma.platform_order.findUnique({ where: { numero } })
    if (
      !row ||
      row.status !== 'PROPOSTA' ||
      String(row.sistema_origem || '').toLowerCase() !== SISTEMA_ORIGEM_COMERCIAL
    ) {
      return NextResponse.json({ ok: false, error: 'Orçamento não encontrado' }, { status: 404 })
    }
    if (!canAccessComercialOrder(access, row.id_vendedor_externo)) {
      return NextResponse.json({ ok: false, error: 'Orçamento não encontrado' }, { status: 404 })
    }

    await prisma.platform_order.delete({ where: { numero } })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao excluir orçamento' }, { status: 500 })
  }
}
