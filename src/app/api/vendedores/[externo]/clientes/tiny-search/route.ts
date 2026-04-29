import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { canManageVendedorCarteiraDeCliente } from '@/lib/vendedorClienteAccess'
import { tinyContatosPesquisa } from '@/lib/tinyContatoCarteira'

export type TinyContatoSearchRow = {
  id: number
  nome: string
  fantasia: string | null
  cpf_cnpj: string | null
  cidade: string | null
  uf: string | null
}

export async function GET(req: Request, { params }: { params: { externo: string } }) {
  try {
    const externo = decodeURIComponent(params?.externo || '').trim()
    if (!externo) {
      return NextResponse.json({ ok: false, error: 'Parâmetro externo inválido' }, { status: 400 })
    }

    const session = (await getServerSession(options as any)) as any
    const email = session?.user?.email || null
    const allowed = await canManageVendedorCarteiraDeCliente(email, externo)
    if (!allowed) {
      return NextResponse.json({ ok: false, error: 'Sem permissão' }, { status: 403 })
    }

    const url = new URL(req.url)
    const q = (url.searchParams.get('q') || '').trim()
    if (q.length < 2) {
      return NextResponse.json({ ok: true, data: [] as TinyContatoSearchRow[] })
    }

    const out: TinyContatoSearchRow[] = []
    const seen = new Set<number>()
    let numeroPaginas = 1

    for (let p = 1; p <= numeroPaginas && p <= 5; p++) {
      const retorno = await tinyContatosPesquisa(q, p)
      numeroPaginas = Math.max(1, Number(retorno?.numero_paginas) || 1)
      const list = Array.isArray(retorno?.contatos) ? retorno.contatos : []
      for (const row of list) {
        const ct = (row?.contato || row || {}) as Record<string, unknown>
        const id = Number(ct.id)
        if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue
        seen.add(id)
        const nome = String(ct.nome || '').trim() || `Contato #${id}`
        out.push({
          id,
          nome,
          fantasia: ct.fantasia != null ? String(ct.fantasia).trim().slice(0, 200) : null,
          cpf_cnpj: ct.cpf_cnpj != null ? String(ct.cpf_cnpj).trim().slice(0, 30) : null,
          cidade: ct.cidade != null ? String(ct.cidade).trim().slice(0, 100) : null,
          uf:
            ct.uf != null
              ? String(ct.uf)
                  .trim()
                  .toUpperCase()
                  .replace(/[^A-Z]/g, '')
                  .slice(0, 2)
              : null,
        })
        if (out.length >= 50) break
      }
      if (out.length >= 50) break
    }

    return NextResponse.json({ ok: true, data: out })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro ao buscar no Tiny'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
