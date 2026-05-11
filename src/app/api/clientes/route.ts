import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const vendedorExternoParam = searchParams.get('vendedor_externo')?.toString() || null
    const q = (searchParams.get('q') || '').toString().trim()
    const limitParam = Number(searchParams.get('limit') || 50)
    const offsetParam = Number(searchParams.get('offset') || 0)
    const limit = Number.isFinite(limitParam) ? Math.min(200, Math.max(1, limitParam)) : 50
    const offset = Number.isFinite(offsetParam) ? Math.max(0, offsetParam) : 0

    // Decide filter by session role if no explicit vendedor_externo is provided
    let where: any = undefined
    if (vendedorExternoParam) {
      where = { id_vendedor_externo: vendedorExternoParam }
    } else {
      const session = await getServerSession(options as any)
      const userEmail = session?.user?.email || null
      if (userEmail) {
        const vend = await prisma.vendedor.findFirst({ where: { email: userEmail } })
        const externo = vend?.id_vendedor_externo || null
        if (externo) {
          const nivel = await prisma.vendedor_nivel_acesso.findUnique({ where: { id_vendedor_externo: externo } })
          // Regra solicitada:
          // - ADMINISTRADOR: todos os clientes
          // - SUPERVISOR: clientes dos representantes vinculados + o próprio supervisor (alinhado a pedidos/comissões)
          // - demais perfis: somente clientes do vendedor logado
          if (nivel?.nivel === 'ADMINISTRADOR') {
            where = undefined
          } else if (nivel?.nivel === 'SUPERVISOR') {
            const sup = await prisma.supervisor.findUnique({
              where: { id_vendedor_externo: externo },
              select: { id: true },
            })
            const links = sup
              ? await prisma.supervisor_vendor_links.findMany({
                  where: { supervisor_id: sup.id },
                  select: { vendedor_externo: true },
                })
              : []
            const allowed = Array.from(
              new Set([externo, ...links.map((l) => l.vendedor_externo).filter(Boolean)] as string[])
            )
            where = { id_vendedor_externo: { in: allowed } }
          } else {
            where = { id_vendedor_externo: externo }
          }
        } else {
          // usuário sem vínculo externo não vê clientes
          where = { id: -1 }
        }
      } else {
        // sem sessão/e-mail não retorna clientes
        where = { id: -1 }
      }
    }

    // Apply local DB search if provided (name or cpf/cnpj)
    if (q) {
      const qDigits = q.replace(/\D/g, '')
      where = {
        ...(where || {}),
        OR: qDigits
          ? [
              { nome: { contains: q } },
              { cpf_cnpj: { contains: qDigits } },
            ]
          : [{ nome: { contains: q } }],
      }
    }

    const total = await prisma.cliente.count({ where })
    const rows = await prisma.cliente.findMany({
      where,
      orderBy: { nome: 'asc' },
      include: { vendedor: true },
      skip: offset,
      take: limit,
    })

    // BigInt -> string for JSON safety
    const clientes = rows.map((c: any) => ({ ...c, external_id: c.external_id?.toString?.() ?? null }))

    return NextResponse.json({
      ok: true,
      data: clientes,
      paginacao: {
        limit,
        offset,
        total,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao listar clientes' }, { status: 500 })
  }
}


