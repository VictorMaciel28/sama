import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { tinyContatosPesquisaPage } from '@/lib/tinyContatoCarteira'

export type TinyContatoPesquisaRow = {
  id: number
  nome: string
  fantasia: string | null
  cpf_cnpj: string | null
  cidade: string | null
  uf: string | null
  id_vendedor: number | null
  nome_vendedor: string | null
}

function rowFromContato(ct: Record<string, unknown>): TinyContatoPesquisaRow | null {
  const id = Number(ct.id)
  if (!Number.isFinite(id) || id <= 0) return null
  const nome = String(ct.nome || '').trim() || `Contato #${id}`
  const ufRaw = ct.uf != null ? String(ct.uf).trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) : ''
  const idV = ct.id_vendedor != null ? Number(ct.id_vendedor) : NaN
  const nomeV =
    ct.nome_vendedor != null && String(ct.nome_vendedor).trim() !== ''
      ? String(ct.nome_vendedor).trim().slice(0, 200)
      : null
  return {
    id,
    nome,
    fantasia: ct.fantasia != null ? String(ct.fantasia).trim().slice(0, 200) : null,
    cpf_cnpj: ct.cpf_cnpj != null ? String(ct.cpf_cnpj).trim().slice(0, 30) : null,
    cidade: ct.cidade != null ? String(ct.cidade).trim().slice(0, 100) : null,
    uf: ufRaw.length === 2 ? ufRaw : null,
    id_vendedor: Number.isFinite(idV) && idV > 0 ? idV : null,
    nome_vendedor: nomeV,
  }
}

/** Busca pública de contatos na Tiny (`contatos.pesquisa.php`) para uso no formulário de pedidos. */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(options as any)
    const email = session?.user?.email
    if (!email) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const me = await prisma.vendedor.findFirst({
      where: { email: email.trim() },
      select: { id: true },
    })
    if (!me) {
      return NextResponse.json({ ok: false, error: 'Sem permissão' }, { status: 403 })
    }

    const url = new URL(req.url)
    const qRaw = (url.searchParams.get('q') || '').trim().slice(0, 100)
    const pagina = Math.max(1, Number(url.searchParams.get('pagina') || 1) || 1)
    const qDigits = qRaw.replace(/\D/g, '')

    const temTexto = qRaw.length >= 3
    const temDoc = qDigits.length >= 8
    if (!temTexto && !temDoc) {
      return NextResponse.json({
        ok: true,
        data: { contatos: [] as TinyContatoPesquisaRow[], pagina: 1, numero_paginas: 1 },
      })
    }

    const pesquisa = temTexto ? qRaw : ' '
    const cpf_cnpj = temDoc ? qDigits.slice(0, 18) : undefined

    const page = await tinyContatosPesquisaPage({ pesquisa, pagina, cpf_cnpj })
    const contatos: TinyContatoPesquisaRow[] = []
    for (const ct of page.contatos) {
      const row = rowFromContato(ct)
      if (row) contatos.push(row)
    }

    return NextResponse.json({
      ok: true,
      data: {
        contatos,
        pagina: page.pagina,
        numero_paginas: page.numero_paginas,
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro ao pesquisar contatos na Tiny'
    console.error('[pedidos/tiny-contatos-pesquisa]', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
