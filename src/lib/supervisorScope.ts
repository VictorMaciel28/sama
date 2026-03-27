import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { prisma } from '@/lib/prisma'

export type SupervisorScopeResult =
  | { ok: true; supervisedExternos: string[] }
  | { ok: false; status: number; message: string }

/**
 * Garante que o usuário pode atuar no escopo do supervisor `externoParam`
 * (é o próprio supervisor ou administrador) e retorna os vendedores supervisionados.
 */
export async function resolveSupervisorSupervisedList(externoParam: string): Promise<SupervisorScopeResult> {
  const externo = (externoParam || '').toString().trim()
  if (!externo) return { ok: false, status: 400, message: 'ID externo inválido' }

  const session = (await getServerSession(options as any)) as { user?: { email?: string | null } } | null
  const email = session?.user?.email || null
  if (!email) return { ok: false, status: 401, message: 'Não autenticado' }

  const me = await prisma.vendedor.findFirst({ where: { email }, select: { id_vendedor_externo: true } })
  const myExt = me?.id_vendedor_externo || null

  let isAdmin = false
  if (myExt) {
    const nivel = await prisma.vendedor_nivel_acesso.findUnique({
      where: { id_vendedor_externo: myExt },
      select: { nivel: true },
    })
    isAdmin = nivel?.nivel === 'ADMINISTRADOR'
  }

  if (!isAdmin && (!myExt || myExt !== externo)) {
    return { ok: false, status: 403, message: 'Acesso negado' }
  }

  const sup = await prisma.supervisor.findUnique({
    where: { id_vendedor_externo: externo },
    include: { links: true },
  })
  if (!sup) {
    return { ok: false, status: 404, message: 'Supervisor não encontrado neste cadastro' }
  }

  const supervisedExternos = Array.from(new Set(sup.links.map((l) => l.vendedor_externo).filter(Boolean)))
  return { ok: true, supervisedExternos }
}
