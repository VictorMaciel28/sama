import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { options } from '@/app/api/auth/[...nextauth]/options'

/** Preço unitário exibido (tabela `product` usa centavos em campos int). */
export function productUnitPriceReais(p: { value_web: number; value_exit: number; value_sistem: number }) {
  const v = p.value_web || p.value_exit || p.value_sistem || 0
  return Math.round(v) / 100
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(options as any)
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const url = new URL(req.url)
    const q = (url.searchParams.get('q') || '').trim()
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 50)))

    const where = q
      ? {
          OR: [
            { name: { contains: q } },
            { code: { contains: q } },
            { description: { contains: q } },
          ],
        }
      : undefined

    const rows = await prisma.product.findMany({
      where,
      orderBy: { name: 'asc' },
      take: limit,
    })

    const data = rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      preco: productUnitPriceReais(r),
    }))

    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Erro ao listar produtos' }, { status: 500 })
  }
}
