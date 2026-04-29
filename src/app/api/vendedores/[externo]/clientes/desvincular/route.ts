import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { canManageVendedorCarteiraDeCliente } from '@/lib/vendedorClienteAccess'
import { tinyContatoRemoverVendedorTiny } from '@/lib/tinyContatoAlterar'

export async function POST(req: Request, { params }: { params: { externo: string } }) {
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

    const body = await req.json().catch(() => ({}))
    const clienteId = Number(body?.cliente_id ?? body?.id ?? 0)
    if (!Number.isFinite(clienteId) || clienteId <= 0) {
      return NextResponse.json({ ok: false, error: 'cliente_id inválido' }, { status: 400 })
    }

    const vend = await prisma.vendedor.findFirst({
      where: { id_vendedor_externo: externo },
      select: { id: true },
    })
    if (!vend) {
      return NextResponse.json({ ok: false, error: 'Vendedor não encontrado na base' }, { status: 400 })
    }

    const cli = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true, external_id: true, id_vendedor_externo: true, nome: true },
    })
    if (!cli) {
      return NextResponse.json({ ok: false, error: 'Cliente não encontrado' }, { status: 404 })
    }

    const atual = (cli.id_vendedor_externo || '').trim()
    if (atual !== externo) {
      return NextResponse.json(
        {
          ok: false,
          error:
            atual && atual !== externo
              ? 'Este cliente não está na carteira deste vendedor (pertence a outro).'
              : 'Este cliente já não está vinculado a este vendedor.',
          code: atual && atual !== externo ? 'OUTRO_VENDEDOR' : 'JA_DESVINCULADO',
        },
        { status: 409 }
      )
    }

    await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        vendedor_id: null,
        id_vendedor_externo: null,
        nome_vendedor: null,
      },
    })

    let tiny_ok = false
    let tiny_error: string | null = null
    try {
      const tr = await tinyContatoRemoverVendedorTiny(cli.external_id)
      tiny_ok = tr.ok
      tiny_error = tr.erro
    } catch (e: unknown) {
      tiny_error = e instanceof Error ? e.message : 'Erro ao sincronizar com o Tiny'
    }

    return NextResponse.json({
      ok: true,
      tiny_ok,
      tiny_error,
    })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao desvincular cliente' }, { status: 500 })
  }
}
