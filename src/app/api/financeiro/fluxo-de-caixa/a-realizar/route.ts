import { NextResponse } from 'next/server'
import { sessionIsFinanceiroAdmin } from '@/lib/financeiroAdminAuth'
import {
  buildFluxoCaixaARealizarRows,
  listFluxoCaixaPaymentYears,
  resolveFluxoCaixaYear,
} from '@/lib/fluxoCaixaARealizar'

export async function GET(req: Request) {
  try {
    if (!(await sessionIsFinanceiroAdmin())) {
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const anos = await listFluxoCaixaPaymentYears()
    const year = resolveFluxoCaixaYear(searchParams.get('ano'), anos)
    const rows = await buildFluxoCaixaARealizarRows(year)

    return NextResponse.json({ ok: true, ano: year, anos, rows })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao montar fluxo de caixa'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
