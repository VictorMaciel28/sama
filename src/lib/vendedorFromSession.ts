import { prisma } from '@/lib/prisma'

type SessionUser = { id?: string; email?: string | null }

/**
 * Alinha com o NextAuth (`user.id` = `vendedor.id`). Evita `findFirst` só por e-mail
 * quando há ambiguidade ou divergência entre sessão e cadastro.
 */
export async function findVendedorForAuthSession(user: SessionUser | null | undefined) {
  if (!user) return null
  const idNum = user.id != null ? Number(user.id) : NaN
  if (Number.isFinite(idNum) && idNum > 0) {
    const byId = await prisma.vendedor.findUnique({ where: { id: idNum } })
    if (byId) return byId
  }
  const email = (user.email || '').trim()
  if (email) {
    return prisma.vendedor.findFirst({ where: { email } })
  }
  return null
}
