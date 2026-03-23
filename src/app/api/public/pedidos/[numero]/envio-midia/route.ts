import { get } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/**
 * GET — imagem salva no Blob (foto de entrega ou assinatura), só para o motorista do envio.
 * Query: motorista_id (obrigatório), tipo=foto|assinatura
 */
export async function GET(request: Request, { params }: { params: { numero: string } }) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token?.trim()) {
    return NextResponse.json(
      { ok: false, error: 'Armazenamento não configurado.' },
      { status: 503, headers: corsHeaders }
    );
  }

  const numero = Number(params.numero);
  if (!Number.isFinite(numero) || numero <= 0) {
    return NextResponse.json({ ok: false, error: 'Número inválido' }, { status: 400, headers: corsHeaders });
  }

  const { searchParams } = new URL(request.url);
  const motoristaId = Number(searchParams.get('motorista_id') || '');
  const tipo = (searchParams.get('tipo') || '').toLowerCase().trim();

  if (!motoristaId) {
    return NextResponse.json({ ok: false, error: 'Informe o motorista' }, { status: 400, headers: corsHeaders });
  }
  if (tipo !== 'foto' && tipo !== 'assinatura') {
    return NextResponse.json(
      { ok: false, error: 'Parâmetro tipo deve ser foto ou assinatura' },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const motorista = await prisma.motorista.findUnique({ where: { id: motoristaId } });
    if (!motorista) {
      return NextResponse.json({ ok: false, error: 'Motorista não encontrado' }, { status: 404, headers: corsHeaders });
    }

    const envio = await prisma.platform_order_envio.findUnique({
      where: { order_num: numero },
      select: { motorista_id: true, foto_path: true, assinatura_path: true },
    });

    if (!envio || envio.motorista_id !== motoristaId) {
      return NextResponse.json({ ok: false, error: 'Sem permissão para este pedido' }, { status: 403, headers: corsHeaders });
    }

    const pathname = tipo === 'foto' ? envio.foto_path : envio.assinatura_path;
    if (!pathname?.trim()) {
      return NextResponse.json({ ok: false, error: 'Nenhuma imagem registrada' }, { status: 404, headers: corsHeaders });
    }

    const result = await get(pathname, { access: 'private', token });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return NextResponse.json({ ok: false, error: 'Arquivo não encontrado' }, { status: 404, headers: corsHeaders });
    }

    const contentType = result.blob.contentType || 'application/octet-stream';

    return new NextResponse(result.stream, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=120',
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[envio-midia]', message, e);
    return NextResponse.json(
      { ok: false, error: 'Erro ao carregar imagem', details: message },
      { status: 500, headers: corsHeaders }
    );
  }
}
