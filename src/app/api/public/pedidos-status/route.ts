import { NextResponse } from 'next/server';
import { PrismaClient } from '@/lib/prisma';
import type { PedidoStatus, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const allowedStatuses = new Set(['FATURADO', 'ENVIADO', 'ENTREGUE']);

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const statusParams = searchParams.getAll('status');
    const rawStatuses = statusParams
      .flatMap((value) => value.split(','))
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);

    const statuses = Array.from(new Set(rawStatuses)).filter((status) => allowedStatuses.has(status)) as PedidoStatus[];
    if (!statuses.length) {
      return NextResponse.json({ ok: false, error: 'Informe um status válido' }, { status: 400, headers: corsHeaders });
    }

    const motoristaId = searchParams.get('motorista_id') ? Number(searchParams.get('motorista_id')) : null;
    const limitRaw = Number(searchParams.get('limit') || '25');
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 25;

    const where: Record<string, any> = {
      status: { in: statuses },
    };
    if (motoristaId && statuses.every((s) => s !== 'FATURADO')) {
      where.envios = { some: { motorista_id: motoristaId } };
    }

    type OrderRow = Prisma.platform_orderGetPayload<{
      select: {
        numero: true;
        cliente: true;
        cnpj: true;
        total: true;
        status: true;
        id_vendedor_externo: true;
        tiny_id: true;
        endereco_entrega: true;
        cliente_rel: {
          select: {
            endereco: true;
            numero: true;
            bairro: true;
            cidade: true;
            estado: true;
            cep: true;
            celular: true;
            fone: true;
          };
        };
      };
    }>;

    const orders = await prisma.platform_order.findMany({
      where,
      take: limit,
      orderBy: { updated_at: 'desc' },
      select: {
        numero: true,
        cliente: true,
        cnpj: true,
        total: true,
        status: true,
        id_vendedor_externo: true,
        tiny_id: true,
        endereco_entrega: true,
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
        ...(motoristaId
          ? {
              envios: {
                where: { motorista_id: motoristaId },
                select: {
                  foto_path: true,
                  foto_name: true,
                  foto_data: true,
                  foto_coordenada: true,
                  assinatura_path: true,
                  assinatura_name: true,
                  assinatura_data: true,
                  assinatura_coordenada: true,
                },
                take: 1,
              },
            }
          : {}),
      },
    });

    const vendorIds = Array.from(new Set(orders.map((o) => o.id_vendedor_externo).filter(Boolean))) as string[];
    const vendors = vendorIds.length
      ? await prisma.vendedor.findMany({
          where: { id_vendedor_externo: { in: vendorIds } },
          select: { id_vendedor_externo: true, nome: true },
        })
      : [];
    const vendorNameByExternal = new Map(vendors.map((v) => [v.id_vendedor_externo, v.nome]));

    const tinyIds = Array.from(new Set(orders.map((o) => o.tiny_id).filter((id) => id != null))) as number[];
    const histories = tinyIds.length
      ? await prisma.platform_order_status_history.findMany({
          where: { tiny_id: { in: tinyIds }, status: { in: statuses as any } },
          orderBy: { changed_at: 'desc' },
          select: { tiny_id: true, status: true, changed_at: true },
        })
      : [];

    const historyByKey = new Map<string, Date>();
    for (const row of histories) {
      const key = `${row.tiny_id}:${row.status}`;
      if (!historyByKey.has(key)) historyByKey.set(key, row.changed_at);
    }

    const data = (orders as OrderRow[]).map((order) => {
      const statusEm =
        order.tiny_id != null ? historyByKey.get(`${order.tiny_id}:${order.status}`) ?? null : null;
      const endereco = formatEndereco(order.endereco_entrega, order.cliente_rel);
      const clienteTelefone = order.cliente_rel?.celular || order.cliente_rel?.fone || null;
      const envio =
        motoristaId && 'envios' in order && Array.isArray((order as { envios?: unknown }).envios)
          ? (order as {
              envios: Array<{
                foto_path: string | null;
                foto_name: string | null;
                foto_data: Date | null;
                foto_coordenada: string | null;
                assinatura_path: string | null;
                assinatura_name: string | null;
                assinatura_data: Date | null;
                assinatura_coordenada: string | null;
              }>;
            }).envios[0]
          : undefined;
      return {
        numero: order.numero,
        cliente: order.cliente,
        cnpj: order.cnpj,
        vendedor: order.id_vendedor_externo ? vendorNameByExternal.get(order.id_vendedor_externo) || null : null,
        vendedor_telefone: null,
        cliente_telefone: clienteTelefone,
        endereco,
        valor: Number(order.total),
        status: order.status,
        status_em: statusEm,
        entrega_foto_path: envio?.foto_path ?? null,
        entrega_foto_name: envio?.foto_name ?? null,
        entrega_foto_data: envio?.foto_data ? envio.foto_data.toISOString() : null,
        entrega_foto_coordenada: envio?.foto_coordenada ?? null,
        assinatura_path: envio?.assinatura_path ?? null,
        assinatura_name: envio?.assinatura_name ?? null,
        assinatura_data: envio?.assinatura_data ? envio.assinatura_data.toISOString() : null,
        assinatura_coordenada: envio?.assinatura_coordenada ?? null,
      };
    });

    return NextResponse.json({ ok: true, data }, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ ok: false, error: 'Erro ao carregar pedidos' }, { status: 500, headers: corsHeaders });
  }
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
  const address = enderecoEntrega && typeof enderecoEntrega === 'object' ? (enderecoEntrega as any) : null;
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
