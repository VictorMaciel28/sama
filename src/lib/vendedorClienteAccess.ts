import { prisma } from '@/lib/prisma'

/** Admin, o próprio vendedor da URL ou supervisor com vínculo ao vendedor alvo. */
export async function canManageVendedorCarteiraDeCliente(userEmail: string | null, targetVendedorExterno: string): Promise<boolean> {
  const target = String(targetVendedorExterno || '').trim()
  if (!userEmail || !target) return false

  const me = await prisma.vendedor.findFirst({
    where: { email: userEmail },
    select: { id_vendedor_externo: true },
  })
  if (!me?.id_vendedor_externo) return false

  const nivel = await prisma.vendedor_nivel_acesso.findUnique({
    where: { id_vendedor_externo: me.id_vendedor_externo },
    select: { nivel: true },
  })

  if (nivel?.nivel === 'ADMINISTRADOR') return true
  if (String(me.id_vendedor_externo).trim() === target) return true

  if (nivel?.nivel === 'SUPERVISOR') {
    const sup = await prisma.supervisor.findUnique({
      where: { id_vendedor_externo: me.id_vendedor_externo },
      include: { links: true },
    })
    if (!sup?.links?.length) return false
    return sup.links.some((l) => String(l.vendedor_externo || '').trim() === target)
  }

  return false
}
