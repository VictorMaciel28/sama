import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { obterPdfDanfeNotaFiscalTiny } from '@/lib/tinyNotaFiscalObterLink'

/**
 * PDF da DANFE via `nota.fiscal.obter.link.php` do Tiny (HTML no ERP → Chromium `page.pdf()`).
 */
export async function GET(req: Request) {
  try {
    const session = (await getServerSession(options as any)) as { user?: { id?: string } } | null
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const idNota = (new URL(req.url).searchParams.get('id') || '').toString().trim()
    if (!idNota || !/^\d+$/.test(idNota)) {
      return NextResponse.json({ ok: false, error: 'ID da nota fiscal inválido' }, { status: 400 })
    }

    const buffer = await obterPdfDanfeNotaFiscalTiny(idNota)

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="nota-fiscal-${idNota}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao baixar a nota fiscal'
    console.error('[pedidos/nota-fiscal-pdf]', msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
