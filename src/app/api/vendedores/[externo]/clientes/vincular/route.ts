import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { canManageVendedorCarteiraDeCliente } from '@/lib/vendedorClienteAccess'
import { prismaClientePayloadFromTinyContato, tinyContatoObter } from '@/lib/tinyContatoCarteira'
import { tinyContatoAlterarIdVendedor } from '@/lib/tinyContatoAlterar'
import { unwrapTinyObterCliente } from '@/lib/tinyObterCliente'

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
    const tinyContactId = Number(body?.tiny_contact_id ?? body?.id ?? 0)
    if (!Number.isFinite(tinyContactId) || tinyContactId <= 0) {
      return NextResponse.json({ ok: false, error: 'tiny_contact_id inválido' }, { status: 400 })
    }

    const vend = await prisma.vendedor.findFirst({
      where: { id_vendedor_externo: externo },
      select: { id: true, nome: true, id_vendedor_externo: true },
    })
    if (!vend) {
      return NextResponse.json({ ok: false, error: 'Vendedor não encontrado na base' }, { status: 400 })
    }

    const extBig = BigInt(tinyContactId)
    const existing = await prisma.cliente.findUnique({
      where: { external_id: extBig },
      select: { id: true, id_vendedor_externo: true, nome: true },
    })

    const atualExt = (existing?.id_vendedor_externo || '').trim()
    if (existing && atualExt && atualExt !== externo) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Este cliente já está na carteira de outro vendedor na plataforma.',
          code: 'OUTRO_VENDEDOR',
          vendedor_atual_externo: atualExt,
        },
        { status: 409 }
      )
    }

    if (existing && atualExt === externo) {
      return NextResponse.json(
        { ok: false, error: 'Este cliente já está na carteira deste vendedor.', code: 'JA_NA_CARTEIRA' },
        { status: 400 }
      )
    }

    let rawTiny: Record<string, unknown>
    try {
      const obter = await tinyContatoObter(tinyContactId)
      const unwrapped = unwrapTinyObterCliente(obter)
      rawTiny =
        unwrapped && typeof unwrapped === 'object'
          ? (unwrapped as Record<string, unknown>)
          : { id: tinyContactId }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha ao obter contato no Tiny'
      return NextResponse.json({ ok: false, error: msg }, { status: 502 })
    }

    const payload = prismaClientePayloadFromTinyContato(rawTiny, {
      id: vend.id,
      nome: vend.nome,
      id_vendedor_externo: vend.id_vendedor_externo,
    })

    const saved = await prisma.cliente.upsert({
      where: { external_id: payload.external_id },
      create: payload as any,
      update: payload as any,
    })

    let tiny_ok = false
    let tiny_error: string | null = null
    try {
      const tr = await tinyContatoAlterarIdVendedor(payload.external_id, externo)
      tiny_ok = tr.ok
      tiny_error = tr.erro
    } catch (e: unknown) {
      tiny_error = e instanceof Error ? e.message : 'Erro ao sincronizar vendedor no Tiny'
    }

    return NextResponse.json({
      ok: true,
      cliente: { ...saved, external_id: saved.external_id?.toString?.() ?? String(saved.external_id) },
      tiny_ok,
      tiny_error,
    })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao vincular cliente' }, { status: 500 })
  }
}
