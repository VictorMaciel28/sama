import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveSupervisorSupervisedList } from '@/lib/supervisorScope'

export async function GET(req: Request, { params }: { params: { externo: string } }) {
  try {
    const externo = decodeURIComponent(params?.externo || '')

    const scope = await resolveSupervisorSupervisedList(externo)
    if (scope.ok === false) {
      return NextResponse.json({ ok: false, error: scope.message }, { status: scope.status })
    }

    const { searchParams } = new URL(req.url)
    const q = (searchParams.get('q') || '').toString().trim()
    const limitParam = Number(searchParams.get('limit') || 50)
    const offsetParam = Number(searchParams.get('offset') || 0)
    const limit = Number.isFinite(limitParam) ? Math.min(200, Math.max(1, limitParam)) : 50
    const offset = Number.isFinite(offsetParam) ? Math.max(0, offsetParam) : 0

    if (scope.supervisedExternos.length === 0) {
      return NextResponse.json({
        ok: true,
        data: [],
        paginacao: { limit, offset, total: 0 },
      })
    }

    let where: any = { id_vendedor_externo: { in: scope.supervisedExternos } }

    if (q) {
      const qDigits = q.replace(/\D/g, '')
      where = {
        ...where,
        OR: qDigits
          ? [{ nome: { contains: q } }, { cpf_cnpj: { contains: qDigits } }]
          : [{ nome: { contains: q } }],
      }
    }

    const total = await prisma.cliente.count({ where })
    const rows = await prisma.cliente.findMany({
      where,
      orderBy: { nome: 'asc' },
      include: { vendedor: { select: { id: true, nome: true, id_vendedor_externo: true } } },
      skip: offset,
      take: limit,
    })

    const clientes = rows.map((c: any) => ({ ...c, external_id: c.external_id?.toString?.() ?? null }))

    return NextResponse.json({
      ok: true,
      data: clientes,
      paginacao: { limit, offset, total },
    })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao listar clientes' }, { status: 500 })
  }
}
