import { put } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { PedidoStatus } from '@prisma/client';

/** Atualiza só a assinatura no Blob + platform_order_envio (pedido já ENTREGUE). */

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request, { params }: { params: { numero: string } }) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token?.trim()) {
    return NextResponse.json(
      { ok: false, error: 'Upload não configurado. Defina BLOB_READ_WRITE_TOKEN no ambiente.' },
      { status: 503, headers: corsHeaders }
    );
  }

  const numero = Number(params.numero);
  if (!Number.isFinite(numero) || numero <= 0) {
    return NextResponse.json({ ok: false, error: 'Número inválido' }, { status: 400, headers: corsHeaders });
  }

  try {
    const formData = await request.formData();
    const raw = formData.get('motorista_id');
    const motoristaId = Number(typeof raw === 'string' ? raw : '');
    const latRaw = formData.get('latitude');
    const lngRaw = formData.get('longitude');
    const latitude =
      typeof latRaw === 'string' && latRaw.trim() !== '' ? Number(latRaw) : Number.NaN;
    const longitude =
      typeof lngRaw === 'string' && lngRaw.trim() !== '' ? Number(lngRaw) : Number.NaN;
    const fileEntry = formData.get('file');

    if (!motoristaId) {
      return NextResponse.json({ ok: false, error: 'Informe o motorista' }, { status: 400, headers: corsHeaders });
    }

    const file = fileEntry instanceof Blob ? fileEntry : null;
    if (!file || file.size === 0) {
      return NextResponse.json({ ok: false, error: 'Informe a imagem da assinatura' }, { status: 400, headers: corsHeaders });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: 'Arquivo muito grande (máx. 12 MB)' }, { status: 400, headers: corsHeaders });
    }

    const type = (file.type || '').toLowerCase();
    if (type && !ALLOWED_TYPES.has(type)) {
      return NextResponse.json(
        { ok: false, error: `Tipo de arquivo não permitido (${type || 'desconhecido'})` },
        { status: 400, headers: corsHeaders }
      );
    }

    const motorista = await prisma.motorista.findUnique({ where: { id: motoristaId } });
    if (!motorista) {
      return NextResponse.json({ ok: false, error: 'Motorista não encontrado' }, { status: 404, headers: corsHeaders });
    }

    const order = await prisma.platform_order.findUnique({
      where: { numero },
      select: {
        numero: true,
        status: true,
        envios: { where: { motorista_id: motoristaId }, select: { id: true } },
      },
    });

    if (!order) {
      return NextResponse.json({ ok: false, error: 'Pedido não encontrado' }, { status: 404, headers: corsHeaders });
    }

    const st = order.status as PedidoStatus;
    if (st !== 'ENTREGUE') {
      return NextResponse.json(
        { ok: false, error: 'Só é possível atualizar assinatura em pedidos já entregues' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!order.envios.length) {
      return NextResponse.json({ ok: false, error: 'Sem permissão para este pedido' }, { status: 403, headers: corsHeaders });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const fileName = file instanceof File ? file.name : 'assinatura.png';
    const ext = guessExtension(type, fileName);
    const stamp = Date.now();
    const rnd = Math.random().toString(36).slice(2, 12);
    const pathname = `pedidos/${numero}/assinatura/${stamp}_${rnd}.${ext}`;

    const uploadContentType =
      type === 'image/jpg' || (!type && (ext === 'jpg' || ext === 'jpeg'))
        ? 'image/jpeg'
        : type || `image/${ext === 'jpg' ? 'jpeg' : ext}`;

    const blob = await put(pathname, buf, {
      access: 'private',
      token,
      contentType: uploadContentType,
    });

    const assinaturaName = pathname.split('/').pop() ?? pathname;
    const now = new Date();
    const coordOk =
      Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
    const assinaturaCoordenada = coordOk ? JSON.stringify({ lat: latitude, lng: longitude }) : null;

    await prisma.platform_order_envio.update({
      where: { order_num: numero },
      data: {
        assinatura_name: assinaturaName,
        assinatura_path: blob.pathname,
        assinatura_data: now,
        assinatura_coordenada: assinaturaCoordenada,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        url: blob.url,
        pathname: blob.pathname,
        assinatura_name: assinaturaName,
        assinatura_path: blob.pathname,
        assinatura_data: now.toISOString(),
        assinatura_coordenada: assinaturaCoordenada,
      },
      { headers: corsHeaders }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[assinatura]', message, e);
    return NextResponse.json(
      { ok: false, error: 'Erro ao salvar assinatura', details: message },
      { status: 500, headers: corsHeaders }
    );
  }
}

function guessExtension(mime: string, filename: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  const m = /\.([a-z0-9]+)$/i.exec(filename || '');
  if (m && ['jpg', 'jpeg', 'png', 'webp'].includes(m[1].toLowerCase())) {
    return m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
  }
  return 'png';
}
