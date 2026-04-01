import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { options } from '@/app/api/auth/[...nextauth]/options'

export async function GET() {
  try {
    const session = await getServerSession(options as any)
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const data = await prisma.payment_method.findMany({
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    })

    return NextResponse.json({ ok: true, data })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro ao listar meios de pagamento'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
