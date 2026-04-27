import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { authorizeOrder, resolveUserAccess, resolveVendedorNome } from '@/lib/platformOrderAccess'
import { buildShareDocumentPayload } from '@/lib/platformOrderSharePayload'
import { renderPlatformOrderPdfBuffer } from '@/lib/platformOrderSharePdf'

export async function GET(req: Request, { params }: { params: { numero: string } }) {
  const url = new URL(req.url)
  const entityParam = String(url.searchParams.get('entity') || url.searchParams.get('tipo') || '').toLowerCase()
  const documentKind = entityParam === 'proposta' ? 'proposta' : 'pedido'

  try {
    const session = (await getServerSession(options as any)) as any
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const numero = Number(params?.numero || 0)
    if (!numero) {
      return NextResponse.json({ ok: false, error: 'Número inválido' }, { status: 400 })
    }

    const userAccess = await resolveUserAccess(session.user.email || null)
    const orderRow = await authorizeOrder(numero, userAccess)
    const vendedorNome = await resolveVendedorNome(orderRow.id_vendedor_externo)
    const payload = await buildShareDocumentPayload(orderRow, vendedorNome, { documentKind })
    const pdf = renderPlatformOrderPdfBuffer(payload)

    const filename = documentKind === 'proposta' ? `proposta-${numero}.pdf` : `pedido-${numero}.pdf`
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error: unknown) {
    const raw = error instanceof Error ? error.message : String(error)
    if (raw === 'pedido_nao_encontrado') {
      const err =
        documentKind === 'proposta'
          ? 'Proposta não encontrada ou sem permissão.'
          : 'Pedido não encontrado ou sem permissão.'
      return NextResponse.json({ ok: false, error: err }, { status: 404 })
    }
    console.error('[pedidos/[numero]/pdf] GET', error)
    return NextResponse.json({ ok: false, error: 'Não foi possível gerar o PDF.' }, { status: 500 })
  }
}
