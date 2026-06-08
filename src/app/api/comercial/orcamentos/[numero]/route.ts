import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { prisma } from '@/lib/prisma'
import { formatSqlDateOnly, parseYmdToSqlDate, todayCalendarYmdUtc } from '@/lib/calendarDate'
import {
  SISTEMA_ORIGEM_COMERCIAL,
  canAccessComercialOrder,
  normalizeComercialItems,
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

function mapOrcamentoDetail(row: any) {
  return {
    numero: row.numero,
    data: formatSqlDateOnly(row.data),
    cliente: row.cliente,
    cnpj: row.cnpj,
    company_id: row.company_id ?? null,
    sistema_origem: SISTEMA_ORIGEM_COMERCIAL,
    total: Number(row.total),
    status: 'Proposta',
    forma_recebimento: row.forma_recebimento,
    condicao_pagamento: row.condicao_pagamento,
    juros_ligado: Boolean(row.juros_ligado ?? true),
    endereco_entrega: row.endereco_entrega,
    id_vendedor_externo: row.id_vendedor_externo,
    id_client_externo: row.id_client_externo?.toString?.() ?? null,
    client_vendor_externo: row.client_vendor_externo,
    selected_client: row.cliente_rel
      ? {
          id: row.cliente_rel.id,
          external_id: row.cliente_rel.external_id?.toString?.() ?? null,
          nome: row.cliente_rel.nome,
          cpf_cnpj: row.cliente_rel.cpf_cnpj ?? '',
          id_vendedor_externo: row.cliente_rel.id_vendedor_externo ?? null,
          nome_vendedor: row.cliente_rel.nome_vendedor ?? null,
          cidade: row.cliente_rel.cidade ?? null,
          endereco: row.cliente_rel.endereco ?? null,
          numero: row.cliente_rel.numero ?? null,
          complemento: row.cliente_rel.complemento ?? null,
          bairro: row.cliente_rel.bairro ?? null,
          cep: row.cliente_rel.cep ?? null,
          uf: row.cliente_rel.estado ?? null,
        }
      : null,
    itens: (row.products || []).map((p: any) => ({
      produtoId: p.produto_id ?? null,
      codigo: p.codigo ?? undefined,
      nome: p.nome,
      quantidade: Number(p.quantidade || 0),
      unidade: p.unidade || 'UN',
      preco: Number(p.preco || 0),
    })),
  }
}

export async function GET(_: Request, { params }: { params: { numero: string } }) {
  try {
    const session = (await getServerSession(options as any)) as any
    if (!session?.user?.id) return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })

    const access = await resolveComercialSessionAccess(session.user)
    if (!access) return NextResponse.json({ ok: false, error: 'Sem permissão' }, { status: 403 })

    const numero = Number(params?.numero || 0)
    if (!numero) return NextResponse.json({ ok: false, error: 'Número inválido' }, { status: 400 })

    const row = await prisma.platform_order.findUnique({
      where: { numero },
      include: {
        cliente_rel: true,
        products: { orderBy: { id: 'asc' } },
      },
    })
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

    return NextResponse.json({ ok: true, data: mapOrcamentoDetail(row) })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao buscar orçamento' }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: { numero: string } }) {
  try {
    const session = (await getServerSession(options as any)) as any
    if (!session?.user?.id) return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })

    const access = await resolveComercialSessionAccess(session.user)
    if (!access) return NextResponse.json({ ok: false, error: 'Sem permissão' }, { status: 403 })

    const numero = Number(params?.numero || 0)
    if (!numero) return NextResponse.json({ ok: false, error: 'Número inválido' }, { status: 400 })

    const existing = await prisma.platform_order.findUnique({ where: { numero } })
    if (
      !existing ||
      existing.status !== 'PROPOSTA' ||
      String(existing.sistema_origem || '').toLowerCase() !== SISTEMA_ORIGEM_COMERCIAL
    ) {
      return NextResponse.json({ ok: false, error: 'Orçamento não encontrado' }, { status: 404 })
    }
    if (!canAccessComercialOrder(access, existing.id_vendedor_externo)) {
      return NextResponse.json({ ok: false, error: 'Orçamento não encontrado' }, { status: 404 })
    }

    const body = (await req.json()) as Record<string, unknown>
    const { cliente, cnpj } = parseClienteCnpj(body)
    if (!cliente) return NextResponse.json({ ok: false, error: 'Cliente obrigatório' }, { status: 400 })

    const dataStr = String(body?.data || '').slice(0, 10)
    const total = Number(body?.total || 0)
    const forma_recebimento = body?.forma_recebimento != null ? String(body.forma_recebimento).trim().slice(0, 50) || null : null
    const company_id = await resolveComercialCompanyId(body?.company_id, existing.company_id)
    if (!company_id) return NextResponse.json({ ok: false, error: 'Empresa obrigatória' }, { status: 400 })
    const juros_ligado =
      body?.juros_ligado === false || body?.juros_ligado === 'false' || body?.juros_ligado === 0 || body?.juros_ligado === '0'
        ? false
        : true
    const id_vendedor_externo =
      body?.id_vendedor_externo != null && String(body.id_vendedor_externo).trim() !== ''
        ? String(body.id_vendedor_externo).trim()
        : existing.id_vendedor_externo
    const idClientStr = body?.idContato != null ? String(body.idContato).trim() : ''
    const id_client_externo = /^\d+$/.test(idClientStr) && idClientStr !== '0' ? BigInt(idClientStr) : null
    const client_vendor_externo =
      body?.client_vendor_externo != null ? String(body.client_vendor_externo).trim() || null : null
    const endereco_entrega =
      body?.endereco_entrega != null && typeof body.endereco_entrega === 'object' ? body.endereco_entrega : undefined

    await prisma.platform_order.update({
      where: { numero },
      data: {
        data: dataStr ? parseYmdToSqlDate(dataStr) : parseYmdToSqlDate(formatSqlDateOnly(existing.data) || todayCalendarYmdUtc()),
        cliente,
        cnpj,
        company_id,
        total,
        forma_recebimento,
        condicao_pagamento: null,
        juros_ligado,
        id_vendedor_externo: id_vendedor_externo ?? undefined,
        id_client_externo,
        client_vendor_externo,
        ...(endereco_entrega != null ? { endereco_entrega } : {}),
      } as any,
    })

    const items = normalizeComercialItems(body?.itens)
    await persistComercialOrderProducts(Number(existing.tiny_id ?? existing.numero), items)

    return NextResponse.json({ ok: true, numero })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao atualizar orçamento' }, { status: 500 })
  }
}
