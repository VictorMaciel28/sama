import { NextResponse } from 'next/server'
import { sessionIsFinanceiroAdmin } from '@/lib/financeiroAdminAuth'
import { listFluxoCaixaPaymentYears, resolveFluxoCaixaYear } from '@/lib/fluxoCaixaARealizar'
import { listMercadoLivreYears } from '@/lib/fluxoCaixaMercadoLivre'
import { buildFluxoCaixaRealizadoRows } from '@/lib/fluxoCaixaRealizado'

export async function GET(req: Request) {
  try {
    if (!(await sessionIsFinanceiroAdmin())) {
      return NextResponse.json({ ok: false, error: 'Não autorizado' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const [paymentYears, mlYears] = await Promise.all([listFluxoCaixaPaymentYears(), listMercadoLivreYears()])
    const anos = [...new Set([...paymentYears, ...mlYears])].sort((a, b) => b - a)
    const year = resolveFluxoCaixaYear(searchParams.get('ano'), anos)
    const rows = await buildFluxoCaixaRealizadoRows(year)

    return NextResponse.json({ ok: true, ano: year, anos, rows })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao montar realizado'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
