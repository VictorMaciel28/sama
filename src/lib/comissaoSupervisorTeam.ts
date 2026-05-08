import type { PrismaClient } from '@prisma/client'

/** Supervisor + vendedores vinculados em `supervisor_vendor_links`. */
export async function getSupervisorTeamExternos(
  prisma: PrismaClient,
  supervisorExterno: string
): Promise<string[]> {
  const sup = await prisma.supervisor.findUnique({
    where: { id_vendedor_externo: supervisorExterno },
    select: { id: true },
  })
  const set = new Set<string>([String(supervisorExterno).trim()])
  if (!sup) return Array.from(set)
  const links = await prisma.supervisor_vendor_links.findMany({
    where: { supervisor_id: sup.id },
    select: { vendedor_externo: true },
  })
  for (const l of links) {
    if (l.vendedor_externo) set.add(String(l.vendedor_externo).trim())
  }
  return Array.from(set)
}
