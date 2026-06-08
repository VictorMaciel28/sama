import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { prisma } from '@/lib/prisma'
import { formatSqlDateOnly } from '@/lib/calendarDate'
import {
  SISTEMA_ORIGEM_COMERCIAL,
  canAccessComercialOrder,
  resolveComercialSessionAccess,
  STATUS_MAP_DB_TO_UI,
} from '@/lib/comercialPedidos'

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
      row.status === 'PROPOSTA' ||
      String(row.sistema_origem || '').toLowerCase() !== SISTEMA_ORIGEM_COMERCIAL
    ) {
      return NextResponse.json({ ok: false, error: 'Pedido não encontrado' }, { status: 404 })
    }
    if (!canAccessComercialOrder(access, row.id_vendedor_externo)) {
      return NextResponse.json({ ok: false, error: 'Pedido não encontrado' }, { status: 404 })
    }

    const data = {
      numero: row.numero,
      data: formatSqlDateOnly(row.data),
      cliente: row.cliente,
      cnpj: row.cnpj,
      company_id: row.company_id ?? null,
      sistema_origem: SISTEMA_ORIGEM_COMERCIAL,
      total: Number(row.total),
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
      itens: (row.products || []).map((p) => ({
        produtoId: p.produto_id ?? null,
        codigo: p.codigo ?? undefined,
        nome: p.nome,
        quantidade: Number(p.quantidade || 0),
        unidade: p.unidade || 'UN',
        preco: Number(p.preco || 0),
      })),
      status: STATUS_MAP_DB_TO_UI[row.status] || 'Pendente',
    }

    return NextResponse.json({ ok: true, data })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao buscar pedido comercial' }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: { numero: string } }) {
  try {
    const session = (await getServerSession(options as any)) as any
    if (!session?.user?.id) return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    if (String(body?.action || '') !== 'cancel') {
      return NextResponse.json({ ok: false, error: 'Ação inválida' }, { status: 400 })
    }

    const access = await resolveComercialSessionAccess(session.user)
    if (!access) return NextResponse.json({ ok: false, error: 'Sem permissão' }, { status: 403 })

    const numero = Number(params?.numero || 0)
    if (!numero) return NextResponse.json({ ok: false, error: 'Número inválido' }, { status: 400 })

    const row = await prisma.platform_order.findUnique({ where: { numero } })
    if (
      !row ||
      row.status === 'PROPOSTA' ||
      String(row.sistema_origem || '').toLowerCase() !== SISTEMA_ORIGEM_COMERCIAL
    ) {
      return NextResponse.json({ ok: false, error: 'Pedido não encontrado' }, { status: 404 })
    }
    if (!canAccessComercialOrder(access, row.id_vendedor_externo)) {
      return NextResponse.json({ ok: false, error: 'Sem permissão' }, { status: 403 })
    }

    await prisma.platform_order.update({
      where: { numero },
      data: { status: 'CANCELADO' },
    })

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao cancelar pedido' }, { status: 500 })
  }
}
