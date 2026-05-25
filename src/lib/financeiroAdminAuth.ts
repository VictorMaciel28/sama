import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { prisma } from '@/lib/prisma'

/** Financeiro (A pagar / A receber / Calendário): apenas administradores. */
export async function sessionIsFinanceiroAdmin(): Promise<boolean> {
  const session = await getServerSession(options as any)
  const email = session?.user?.email
  if (!email || typeof email !== 'string') return false
  const vend = await prisma.vendedor.findFirst({
    where: { email },
    select: { id_vendedor_externo: true },
  })
  if (!vend?.id_vendedor_externo) return false
  const nivel = await prisma.vendedor_nivel_acesso
    .findUnique({
      where: { id_vendedor_externo: vend.id_vendedor_externo },
      select: { nivel: true },
    })
    .catch(() => null)
  return nivel?.nivel === 'ADMINISTRADOR'
}
