import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'

export async function GET() {
  try {
    const session = await getServerSession(options as any)
    const email = session?.user?.email || null
    if (!email) return NextResponse.json({ ok: true, data: null })

    const vend = await prisma.vendedor.findFirst({ where: { email } })
    if (!vend?.id_vendedor_externo) {
      return NextResponse.json({ ok: true, data: { email, tipo: null } })
    }

    const externo = vend.id_vendedor_externo
    /** Ausência de linha em `vendedor_tipo_acesso` não impede acesso: perfil vem de `vendedor_nivel_acesso`. */
    const tipoRow = await prisma.vendedor_tipo_acesso.findUnique({ where: { id_vendedor_externo: externo } })
    const tipo = tipoRow?.tipo ?? null
    const nivelRow = await prisma.vendedor_nivel_acesso
      .findUnique({ where: { id_vendedor_externo: externo } })
      .catch(() => null)
    const isAdmin = nivelRow?.nivel === 'ADMINISTRADOR'
    const isSupervisor = nivelRow?.nivel === 'SUPERVISOR'

    let cidades: string[] = []
    if (tipo === 'TELEVENDAS') {
      const tel = await prisma.telemarketing.findUnique({
        where: { id_vendedor_externo: externo },
        include: { cidades: true },
      })
      cidades = (tel?.cidades || []).map((c) => c.cidade)
    }

    return NextResponse.json({
      ok: true,
      data: {
        email,
        id_vendedor_externo: externo,
        nome: vend.nome,
        tipo,
        is_admin: isAdmin,
        is_supervisor: isSupervisor,
        cidades,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao obter vendedor atual' }, { status: 500 })
  }
}


