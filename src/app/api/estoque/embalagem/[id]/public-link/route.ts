import { options } from '@/app/api/auth/[...nextauth]/options'
import { canSignEmbalagemPublicLink, signEmbalagemPublicQuery } from '@/lib/embalagemPublicLink'
import { prisma } from '@/lib/prisma'
import { SeparacaoStatus } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = (await getServerSession(options as any)) as { user?: { id?: string } } | null
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const id = Number(params.id)
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json({ ok: false, error: 'ID inválido' }, { status: 400 })
    }

    const exists = await prisma.stock_separation.findFirst({
      where: {
        id,
        status: { in: [SeparacaoStatus.SEPARADO, SeparacaoStatus.CONCLUIDO] },
      },
      select: { id: true },
    })
    if (!exists) {
      return NextResponse.json({ ok: false, error: 'Não encontrado' }, { status: 404 })
    }

    if (!canSignEmbalagemPublicLink()) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Defina EMBALAGEM_PUBLIC_HMAC_SECRET ou NEXTAUTH_SECRET para gerar links públicos.',
        },
        { status: 503 },
      )
    }

    const signed = signEmbalagemPublicQuery(id)
    if (!signed) {
      return NextResponse.json({ ok: false, error: 'Não foi possível assinar o link.' }, { status: 500 })
    }

    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3000'
    const proto = req.headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
    const base = `${proto}://${host}`
    const url = new URL('/embalagem/publico', base)
    url.searchParams.set('id', String(id))
    url.searchParams.set('e', String(signed.e))
    url.searchParams.set('sig', signed.sig)

    return NextResponse.json({ ok: true, href: url.toString() })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Erro' }, { status: 500 })
  }
}
