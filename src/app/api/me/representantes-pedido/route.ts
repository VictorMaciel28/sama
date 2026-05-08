import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { options } from '@/app/api/auth/[...nextauth]/options'

/** Lista de representantes para o select de “Representante do pedido” (admin = todos; supervisor = supervisionados). */
export async function GET() {
  try {
    const session = await getServerSession(options as any)
    const email = session?.user?.email || null
    if (!email) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const me = await prisma.vendedor.findFirst({
      where: { email: email.trim() },
      select: { id_vendedor_externo: true },
    })
    if (!me?.id_vendedor_externo) {
      return NextResponse.json({ ok: true, data: [] as { externo: string; nome: string }[] })
    }

    const nivel = await prisma.vendedor_nivel_acesso
      .findUnique({
        where: { id_vendedor_externo: me.id_vendedor_externo },
        select: { nivel: true },
      })
      .catch(() => null)

    const isAdmin = nivel?.nivel === 'ADMINISTRADOR'
    const isSupervisor = nivel?.nivel === 'SUPERVISOR'

    if (isAdmin) {
      const rows = await prisma.vendedor.findMany({
        select: { id_vendedor_externo: true, nome: true },
        orderBy: { nome: 'asc' },
      })
      const data = rows
        .filter((r) => r.id_vendedor_externo && String(r.id_vendedor_externo).trim() !== '')
        .map((r) => ({
          externo: String(r.id_vendedor_externo).trim(),
          nome: (r.nome?.trim() || r.id_vendedor_externo).trim(),
        }))
      return NextResponse.json({ ok: true, data })
    }

    if (isSupervisor) {
      const sup = await prisma.supervisor.findUnique({
        where: { id_vendedor_externo: me.id_vendedor_externo },
        include: { links: true },
      })
      if (!sup?.links?.length) {
        return NextResponse.json({ ok: true, data: [] as { externo: string; nome: string }[] })
      }
      const externos = Array.from(new Set(sup.links.map((l) => l.vendedor_externo).filter(Boolean))) as string[]
      const rows = await prisma.vendedor.findMany({
        where: { id_vendedor_externo: { in: externos } },
        select: { id_vendedor_externo: true, nome: true },
        orderBy: { nome: 'asc' },
      })
      const data = rows.map((r) => ({
        externo: String(r.id_vendedor_externo).trim(),
        nome: (r.nome?.trim() || r.id_vendedor_externo).trim(),
      }))
      return NextResponse.json({ ok: true, data })
    }

    return NextResponse.json({ ok: true, data: [] as { externo: string; nome: string }[] })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[me/representantes-pedido]', msg)
    return NextResponse.json({ ok: false, error: 'Erro ao listar representantes' }, { status: 500 })
  }
}
