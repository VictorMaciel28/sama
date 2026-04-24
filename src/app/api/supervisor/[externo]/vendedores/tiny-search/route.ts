import { NextResponse } from 'next/server'
import { resolveSupervisorSupervisedList } from '@/lib/supervisorScope'

type TinyV = { id?: number; nome?: string; email?: string }

async function tinyVendedoresPesquisa(pesquisa: string, pagina: number) {
  const token = process.env.TINY_API_TOKEN
  if (!token) throw new Error('Token da API não configurado')

  const form = new URLSearchParams()
  form.append('token', token)
  form.append('pesquisa', pesquisa)
  form.append('formato', 'json')
  form.append('pagina', String(pagina))

  const res = await fetch('https://api.tiny.com.br/api2/vendedores.pesquisa.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: form.toString(),
  })

  const data = await res.json()
  if (!res.ok) throw new Error('Falha ao consultar Tiny')
  if (!data?.retorno || data?.retorno?.status !== 'OK') {
    const err = data?.retorno?.erros?.[0]?.erro || 'Retorno inválido'
    throw new Error(err)
  }
  return data.retorno as {
    numero_paginas?: number
    vendedores?: { vendedor: TinyV }[]
  }
}

export async function GET(req: Request, { params }: { params: { externo: string } }) {
  try {
    const externo = decodeURIComponent(params?.externo || '')
    const scope = await resolveSupervisorSupervisedList(externo)
    if (scope.ok === false) {
      return NextResponse.json({ ok: false, error: scope.message }, { status: scope.status })
    }

    const url = new URL(req.url)
    const q = (url.searchParams.get('q') || '').trim()
    if (q.length < 2) {
      return NextResponse.json({ ok: true, data: [] })
    }

    const retorno = await tinyVendedoresPesquisa(q, 1)
    const pages = Math.max(1, Number(retorno?.numero_paginas) || 1)
    const out: { id: number; nome: string; email: string | null }[] = []
    const seen = new Set<number>()

    const collect = (r: typeof retorno) => {
      const list = r?.vendedores ?? []
      for (const row of list) {
        const vd = row?.vendedor || {}
        const id = Number(vd.id)
        if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue
        seen.add(id)
        out.push({
          id,
          nome: String(vd.nome || '').trim() || `Vendedor #${id}`,
          email: vd.email != null && String(vd.email).trim() ? String(vd.email).trim() : null,
        })
      }
    }

    collect(retorno)

    // Páginas extras (Tiny costuma paginar; primeira já costuma bastante para busca)
    for (let p = 2; p <= pages && p <= 5 && out.length < 40; p++) {
      const r = await tinyVendedoresPesquisa(q, p)
      collect(r)
      if (out.length >= 40) break
    }

    return NextResponse.json({ ok: true, data: out.slice(0, 40) })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro ao buscar vendedores'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
