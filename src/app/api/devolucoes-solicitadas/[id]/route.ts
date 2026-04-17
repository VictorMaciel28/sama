import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { options } from '@/app/api/auth/[...nextauth]/options'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(options as any)
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const id = Number(params.id)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: 'ID inválido' }, { status: 400 })
    }

    const row = await prisma.revisar_pedido_solicitacao.findUnique({
      where: { id },
      include: {
        anexos: { orderBy: { ordem: 'asc' } },
      },
    })

    if (!row) {
      return NextResponse.json({ ok: false, error: 'Solicitação não encontrada' }, { status: 404 })
    }

    const base = `/api/devolucoes-solicitadas/${id}/imagem`
    const anexos = row.anexos.map((a) => ({
      ordem: a.ordem,
      file_name: a.file_name,
      imagemUrl: `${base}?ordem=${a.ordem}`,
    }))

    return NextResponse.json({
      ok: true,
      data: {
        id: row.id,
        created_at: row.created_at.toISOString(),
        tiny_nota_fiscal_id: row.tiny_nota_fiscal_id,
        nota_numero: row.nota_numero,
        nota_serie: row.nota_serie,
        cliente_nome: row.cliente_nome,
        valor_nota: row.valor_nota,
        telefone: row.telefone,
        telefone_e_whatsapp: row.telefone_e_whatsapp,
        observacoes: row.observacoes,
        itens_indices: row.itens_indices,
        itens_snapshot: row.itens_snapshot,
        anexos,
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[devolucoes-solicitadas/id]', message)
    return NextResponse.json({ ok: false, error: 'Erro ao carregar solicitação.' }, { status: 500 })
  }
}
