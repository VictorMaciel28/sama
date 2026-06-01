import { NextResponse } from 'next/server'
import { sessionIsFinanceiroAdmin } from '@/lib/financeiroAdminAuth'
import {
  findMercadoLivreValuesByYear,
  listMercadoLivreYears,
  mercadoLivreRowsForApi,
  parseMercadoLivreMonthParam,
  parseMercadoLivreValueParam,
  resolveMercadoLivreYear,
  upsertMercadoLivreValue,
} from '@/lib/fluxoCaixaMercadoLivre'

export async function GET(req: Request) {
  try {
    if (!(await sessionIsFinanceiroAdmin())) {
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const anos = await listMercadoLivreYears()
    const year = resolveMercadoLivreYear(searchParams.get('ano'), anos)
    const byMonth = await findMercadoLivreValuesByYear(year)

    return NextResponse.json({
      ok: true,
      ano: year,
      anos,
      rows: mercadoLivreRowsForApi(year, byMonth),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao carregar Mercado Livre'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    if (!(await sessionIsFinanceiroAdmin())) {
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    const anos = await listMercadoLivreYears()
    const year = resolveMercadoLivreYear(
      body?.ano != null ? String(body.ano) : body?.year != null ? String(body.year) : null,
      anos
    )
    const month = parseMercadoLivreMonthParam(body?.mes ?? body?.month)
    if (month == null) {
      return NextResponse.json({ ok: false, error: 'Mês inválido' }, { status: 400 })
    }

    const value = parseMercadoLivreValueParam(body?.valor ?? body?.value)
    await upsertMercadoLivreValue(year, month, value)

    return NextResponse.json({ ok: true, ano: year, month, value })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao salvar Mercado Livre'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
