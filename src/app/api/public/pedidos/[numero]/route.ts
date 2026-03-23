import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { PedidoStatus } from '@prisma/client';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

function formatEndereco(
  enderecoEntrega: unknown,
  cliente: {
    endereco: string | null;
    numero: string | null;
    bairro: string | null;
    cidade: string | null;
    estado: string | null;
    cep: string | null;
  } | null
) {
  const address = enderecoEntrega && typeof enderecoEntrega === 'object' ? (enderecoEntrega as Record<string, unknown>) : null;
  const parts = [
    address?.endereco || cliente?.endereco,
    address?.numero || cliente?.numero,
    address?.bairro || cliente?.bairro,
    address?.cidade || cliente?.cidade,
    address?.uf || cliente?.estado,
    address?.cep || cliente?.cep,
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return parts.join(', ') || null;
}

export async function GET(request: Request, { params }: { params: { numero: string } }) {
  try {
    const numeroParam = params.numero;
    const numero = Number(numeroParam);
    if (!Number.isFinite(numero) || numero <= 0) {
      return NextResponse.json({ ok: false, error: 'Número inválido' }, { status: 400, headers: corsHeaders });
    }

    const { searchParams } = new URL(request.url);
    const motoristaId = Number(searchParams.get('motorista_id') || 0);
    if (!motoristaId) {
      return NextResponse.json(
        { ok: false, error: 'Informe o motorista' },
        { status: 400, headers: corsHeaders }
      );
    }

    const motorista = await prisma.motorista.findUnique({ where: { id: motoristaId } });
    if (!motorista) {
      return NextResponse.json({ ok: false, error: 'Motorista não encontrado' }, { status: 404, headers: corsHeaders });
    }

    const order = await prisma.platform_order.findUnique({
      where: { numero },
      include: {
        cliente_rel: {
          select: {
            endereco: true,
            numero: true,
            bairro: true,
            cidade: true,
            estado: true,
            cep: true,
            celular: true,
            fone: true,
          },
        },
        products: {
          orderBy: { id: 'asc' },
        },
        envios: {
          where: { motorista_id: motoristaId },
          select: {
            id: true,
            foto_path: true,
            foto_name: true,
            foto_data: true,
            foto_coordenada: true,
            assinatura_path: true,
            assinatura_name: true,
            assinatura_data: true,
            assinatura_coordenada: true,
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ ok: false, error: 'Pedido não encontrado' }, { status: 404, headers: corsHeaders });
    }

    const st = order.status as PedidoStatus;
    if (st === 'ENVIADO' || st === 'ENTREGUE') {
      if (!order.envios.length) {
        return NextResponse.json({ ok: false, error: 'Sem permissão para este pedido' }, { status: 403, headers: corsHeaders });
      }
    }

    const vendorIds = order.id_vendedor_externo ? [order.id_vendedor_externo] : [];
    const vendors = vendorIds.length
      ? await prisma.vendedor.findMany({
          where: { id_vendedor_externo: { in: vendorIds } },
          select: { id_vendedor_externo: true, nome: true, telefone: true },
        })
      : [];
    const vendorName = vendors[0]?.nome ?? null;
    const vendorTelefoneRaw = vendors[0]?.telefone?.trim();
    const vendorTelefone = vendorTelefoneRaw && vendorTelefoneRaw.length > 0 ? vendorTelefoneRaw : null;

    const histories = order.tiny_id
      ? await prisma.platform_order_status_history.findMany({
          where: { tiny_id: order.tiny_id, status: order.status },
          orderBy: { changed_at: 'desc' },
          take: 1,
          select: { changed_at: true },
        })
      : [];

    const statusEm = histories[0]?.changed_at ?? null;
    const clienteTelefone = order.cliente_rel?.celular || order.cliente_rel?.fone || null;
    const endereco = formatEndereco(order.endereco_entrega, order.cliente_rel);

    const itens = (order.products || []).map((p) => ({
      id: p.id,
      codigo: p.codigo ?? null,
      nome: p.nome,
      quantidade: Number(p.quantidade || 0),
      unidade: p.unidade || 'UN',
      preco: Number(p.preco || 0),
    }));

    const envio = order.envios?.[0];
    const data = {
      numero: order.numero,
      cliente: order.cliente,
      cnpj: order.cnpj,
      valor: Number(order.total),
      status: order.status,
      status_em: statusEm,
      vendedor: vendorName,
      vendedor_telefone: vendorTelefone,
      cliente_telefone: clienteTelefone,
      forma_recebimento: order.forma_recebimento,
      condicao_pagamento: order.condicao_pagamento,
      endereco,
      itens,
      entrega_foto_path: envio?.foto_path ?? null,
      entrega_foto_name: envio?.foto_name ?? null,
      entrega_foto_data: envio?.foto_data ? envio.foto_data.toISOString() : null,
      entrega_foto_coordenada: envio?.foto_coordenada ?? null,
      assinatura_path: envio?.assinatura_path ?? null,
      assinatura_name: envio?.assinatura_name ?? null,
      assinatura_data: envio?.assinatura_data ? envio.assinatura_data.toISOString() : null,
      assinatura_coordenada: envio?.assinatura_coordenada ?? null,
    };

    return NextResponse.json({ ok: true, data }, { headers: corsHeaders });
  } catch (error) {
    console.error('[public/pedidos/[numero]]', error);
    return NextResponse.json({ ok: false, error: 'Erro ao carregar pedido' }, { status: 500, headers: corsHeaders });
  }
}
