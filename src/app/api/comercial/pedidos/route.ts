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
  STATUS_MAP_DB_TO_UI,
  STATUS_MAP_UI_TO_DB,
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
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 20)))
    const offset = Math.max(0, Number(url.searchParams.get('offset') || 0))
    const search = (url.searchParams.get('search') || '').trim()
    const statusText = (url.searchParams.get('status') || '').trim()
    const dataInicio = (url.searchParams.get('dataInicio') || '').trim()
    const dataFim = (url.searchParams.get('dataFim') || '').trim()
    const companyId = (url.searchParams.get('company_id') || '').trim()
    const sortByRaw = (url.searchParams.get('sortBy') || 'id').trim()
    const sortDirRaw = (url.searchParams.get('sortDir') || 'desc').trim().toLowerCase()
    const sortDir = sortDirRaw === 'asc' ? 'asc' : 'desc'
    const orderByField = sortByRaw === 'numero' || sortByRaw === 'data' || sortByRaw === 'cliente' ? sortByRaw : 'id'

    const session = (await getServerSession(options as any)) as any
    if (!session?.user?.id) return NextResponse.json({ ok: true, data: [], paginacao: { limit, offset, total: 0 } })

    const access = await resolveComercialSessionAccess(session.user)
    if (!access) return NextResponse.json({ ok: true, data: [], paginacao: { limit, offset, total: 0 } })

    const where: any = {
      sistema_origem: SISTEMA_ORIGEM_COMERCIAL,
      NOT: { status: 'PROPOSTA' },
    }
    if (!access.isAdmin && access.vendedorExterno) {
      where.id_vendedor_externo = access.vendedorExterno
    } else if (!access.isAdmin) {
      return NextResponse.json({ ok: true, data: [], paginacao: { limit, offset, total: 0 } })
    }

    if (statusText) {
      const st = STATUS_MAP_UI_TO_DB[statusText]
      if (st) where.status = st
    }
    if (search) {
      where.OR = [
        { cliente: { contains: search } },
        { cnpj: { contains: search } },
        ...(/^\d+$/.test(search) ? [{ numero: Number(search) }] : []),
      ]
    }
    if (dataInicio || dataFim) {
      where.data = {}
      if (dataInicio) where.data.gte = new Date(dataInicio)
      if (dataFim) where.data.lte = new Date(dataFim)
    }
    if (companyId) where.company_id = companyId

    const total = await prisma.platform_order.count({ where })
    const agg = await prisma.platform_order.aggregate({ where, _sum: { total: true } })
    const rows = await prisma.platform_order.findMany({
      where,
      orderBy: { [orderByField]: sortDir } as any,
      skip: offset,
      take: limit,
    })

    const data = rows.map((r) => ({
      numero: r.numero,
      data: formatSqlDateOnly(r.data),
      cliente: r.cliente,
      cnpj: r.cnpj,
      company_id: r.company_id ?? null,
      sistema_origem: SISTEMA_ORIGEM_COMERCIAL,
      total: Number(r.total),
      status: STATUS_MAP_DB_TO_UI[r.status] || 'Pendente',
      id_vendedor_externo: r.id_vendedor_externo,
      forma_recebimento: r.forma_recebimento ?? null,
      condicao_pagamento: r.condicao_pagamento ?? null,
      juros_ligado: Boolean(r.juros_ligado ?? true),
    }))

    return NextResponse.json({
      ok: true,
      data,
      paginacao: { limit, offset, total, total_valor: Number(agg?._sum?.total || 0) },
    })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao listar pedidos comerciais' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = (await getServerSession(options as any)) as any
    if (!session?.user?.id) return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })

    const access = await resolveComercialSessionAccess(session.user)
    if (!access) return NextResponse.json({ ok: false, error: 'Usuário não autenticado' }, { status: 401 })

    const body = (await req.json()) as Record<string, unknown>
    const numeroInput = Number(body?.numero || 0)
    const { cliente, cnpj } = parseClienteCnpj(body)
    if (!cliente) return NextResponse.json({ ok: false, error: 'Cliente obrigatório' }, { status: 400 })

    const items = normalizeComercialItems(body?.itens)
    if (items.length === 0) {
      return NextResponse.json({ ok: false, error: 'Itens do pedido ausentes ou inválidos.' }, { status: 400 })
    }

    const statusStr = String(body?.status || 'Pendente')
    const platformStatus = STATUS_MAP_UI_TO_DB[statusStr] ?? 'PENDENTE'
    const dataStr = String(body?.data || '').slice(0, 10)
    const total = Number(body?.total || 0)
    const forma_recebimento = body?.forma_recebimento != null ? String(body.forma_recebimento).trim().slice(0, 50) || null : null
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
      body?.endereco_entrega != null && typeof body.endereco_entrega === 'object' ? body.endereco_entrega : null

    let existing =
      numeroInput > 0
        ? await prisma.platform_order.findUnique({ where: { numero: numeroInput } })
        : null

    if (existing && String(existing.sistema_origem || '').toLowerCase() !== SISTEMA_ORIGEM_COMERCIAL) {
      return NextResponse.json({ ok: false, error: 'Pedido não encontrado' }, { status: 404 })
    }
    if (existing && !canAccessComercialOrder(access, existing.id_vendedor_externo)) {
      return NextResponse.json({ ok: false, error: 'Sem permissão' }, { status: 403 })
    }

    const company_id = await resolveComercialCompanyId(body?.company_id, existing?.company_id ?? null)
    if (!company_id) return NextResponse.json({ ok: false, error: 'Empresa obrigatória' }, { status: 400 })

    const isEvolvingOrcamento =
      existing != null && existing.status === 'PROPOSTA' && platformStatus === 'PENDENTE'

    const baseData = {
      data: dataStr ? parseYmdToSqlDate(dataStr) : parseYmdToSqlDate(todayCalendarYmdUtc()),
      cliente,
      cnpj,
      company_id,
      total,
      status: isEvolvingOrcamento ? 'PENDENTE' : platformStatus,
      forma_recebimento,
      condicao_pagamento: null,
      juros_ligado,
      endereco_entrega,
      id_vendedor_externo,
      id_client_externo,
      client_vendor_externo,
      sistema_origem: SISTEMA_ORIGEM_COMERCIAL,
    }

    let savedNumero: number
    let productKey: number

    if (existing) {
      const updated = await prisma.platform_order.update({
        where: { numero: existing.numero },
        data: baseData as any,
      })
      savedNumero = updated.numero
      productKey = Number(updated.tiny_id ?? updated.numero)
    } else {
      const nextNumero = await nextPlatformOrderNumero()
      const created = await prisma.platform_order.create({
        data: {
          numero: nextNumero,
          tiny_id: nextNumero,
          ...baseData,
        } as any,
      })
      savedNumero = created.numero
      productKey = Number(created.tiny_id ?? created.numero)
    }

    await persistComercialOrderProducts(productKey, items)

    return NextResponse.json({ ok: true, numero: savedNumero, localOnly: true })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao salvar pedido comercial' }, { status: 500 })
  }
}
