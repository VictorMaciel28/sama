import { get } from '@vercel/blob'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { options } from '@/app/api/auth/[...nextauth]/options'
import {
  canViewSolicitacaoNota,
  notaFiscalTinyIdsForVendedor,
  resolveDevolucaoSolicitacaoScope,
  seesAllDevolucoesSolicitadas,
} from '@/lib/devolucoesSolicitadasAccess'

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token?.trim()) {
    return NextResponse.json({ ok: false, error: 'Armazenamento não configurado.' }, { status: 503 })
  }

  try {
    const session = await getServerSession(options as any)
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const scope = await resolveDevolucaoSolicitacaoScope(session?.user?.email)
    if (!scope) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const id = Number(params.id)
    const ordem = Number(new URL(request.url).searchParams.get('ordem'))
    if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(ordem) || ordem < 0 || ordem > 2) {
      return NextResponse.json({ ok: false, error: 'Parâmetros inválidos' }, { status: 400 })
    }

    const anexo = await prisma.revisar_pedido_solicitacao_anexo.findFirst({
      where: { solicitacao_id: id, ordem },
      include: {
        solicitacao: { select: { tiny_nota_fiscal_id: true } },
      },
    })

    if (!anexo?.blob_path?.trim()) {
      return NextResponse.json({ ok: false, error: 'Imagem não encontrada' }, { status: 404 })
    }

    let allowedNotas = new Set<string>()
    if (!seesAllDevolucoesSolicitadas(scope)) {
      const ext = scope.id_vendedor_externo
      if (!ext) {
        return NextResponse.json({ ok: false, error: 'Sem permissão.' }, { status: 403 })
      }
      allowedNotas = await notaFiscalTinyIdsForVendedor(ext)
    }
    if (!canViewSolicitacaoNota(scope, allowedNotas, anexo.solicitacao.tiny_nota_fiscal_id)) {
      return NextResponse.json({ ok: false, error: 'Sem permissão.' }, { status: 403 })
    }

    const result = await get(anexo.blob_path, { access: 'private', token })
    if (!result || result.statusCode !== 200 || !result.stream) {
      return NextResponse.json({ ok: false, error: 'Arquivo não encontrado' }, { status: 404 })
    }

    const contentType = result.blob.contentType || 'application/octet-stream'

    return new NextResponse(result.stream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=120',
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[devolucoes-solicitadas/imagem]', message)
    return NextResponse.json({ ok: false, error: 'Erro ao obter imagem' }, { status: 500 })
  }
}
