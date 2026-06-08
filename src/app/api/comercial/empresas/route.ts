import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const session = (await getServerSession(options as any)) as any
    if (!session?.user?.id) return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })

    const rows = await prisma.company.findMany({
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true, cnpj: true },
    })

    return NextResponse.json({ ok: true, data: rows })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao listar empresas' }, { status: 500 })
  }
}
