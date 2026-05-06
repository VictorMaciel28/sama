import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { options } from '@/app/api/auth/[...nextauth]/options'
import {
  notaFiscalTinyIdsForVendedor,
  resolveDevolucaoSolicitacaoScope,
  seesAllDevolucoesSolicitadas,
} from '@/lib/devolucoesSolicitadasAccess'

export async function GET() {
  try {
    const session = await getServerSession(options as any)
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const scope = await resolveDevolucaoSolicitacaoScope(session?.user?.email)
    if (!scope) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    let notaFilter: string[] | undefined
    if (!seesAllDevolucoesSolicitadas(scope)) {
      const ext = scope.id_vendedor_externo
      if (!ext) {
        return NextResponse.json({ ok: true, data: [] })
      }
      const ids = await notaFiscalTinyIdsForVendedor(ext)
      if (ids.size === 0) {
        return NextResponse.json({ ok: true, data: [] })
      }
      notaFilter = Array.from(ids)
    }

    const rows = await prisma.revisar_pedido_solicitacao.findMany({
      where: notaFilter ? { tiny_nota_fiscal_id: { in: notaFilter } } : undefined,
      orderBy: { created_at: 'desc' },
      take: 300,
      include: {
        _count: { select: { anexos: true } },
      },
    })

    const data = rows.map((r) => ({
      id: r.id,
      created_at: r.created_at.toISOString(),
      tiny_nota_fiscal_id: r.tiny_nota_fiscal_id,
      nota_numero: r.nota_numero,
      nota_serie: r.nota_serie,
      cliente_nome: r.cliente_nome,
      valor_nota: r.valor_nota,
      telefone: r.telefone,
      telefone_e_whatsapp: r.telefone_e_whatsapp,
      qtd_anexos: r._count.anexos,
    }))

    return NextResponse.json({ ok: true, data })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[devolucoes-solicitadas]', message)
    return NextResponse.json({ ok: false, error: 'Erro ao listar solicitações.' }, { status: 500 })
  }
}
