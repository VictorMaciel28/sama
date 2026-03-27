import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveSupervisorSupervisedList } from '@/lib/supervisorScope'

export async function GET(_req: Request, { params }: { params: { externo: string } }) {
  try {
    const externo = decodeURIComponent(params?.externo || '')

    const scope = await resolveSupervisorSupervisedList(externo)
    if (scope.ok === false) {
      return NextResponse.json({ ok: false, error: scope.message }, { status: scope.status })
    }

    if (scope.supervisedExternos.length === 0) {
      return NextResponse.json({ ok: true, data: [] })
    }

    const rows = await prisma.vendedor.findMany({
      where: { id_vendedor_externo: { in: scope.supervisedExternos } },
      orderBy: { nome: 'asc' },
    })

    const tipos = await prisma.vendedor_tipo_acesso.findMany({
      where: { id_vendedor_externo: { in: scope.supervisedExternos } },
    })
    const niveles = await prisma.vendedor_nivel_acesso.findMany({
      where: { id_vendedor_externo: { in: scope.supervisedExternos } },
    })
    const tipoBy = new Map(tipos.map((t) => [t.id_vendedor_externo, t.tipo]))
    const nivelBy = new Map(niveles.map((n) => [n.id_vendedor_externo, n.nivel]))

    const data = rows.map((r) => ({
      id: r.id,
      id_vendedor_externo: r.id_vendedor_externo,
      nome: r.nome,
      email: r.email,
      telefone: r.telefone,
      tipo_acesso: r.id_vendedor_externo ? tipoBy.get(r.id_vendedor_externo) ?? null : null,
      nivel_acesso: r.id_vendedor_externo ? nivelBy.get(r.id_vendedor_externo) ?? null : null,
    }))

    return NextResponse.json({ ok: true, data })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao listar vendedores' }, { status: 500 })
  }
}
