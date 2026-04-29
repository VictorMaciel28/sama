import { prisma } from '@/lib/prisma'

/** Admin, vendedor dono do pedido ou supervisor com vínculo ao vendedor do pedido. */
export async function userCanAccessPedidoPlataforma(
  userEmail: string | null,
  orderVendorExterno: string | null | undefined
): Promise<boolean> {
  if (!userEmail) return false
  const vend = await prisma.vendedor.findFirst({
    where: { email: userEmail },
    select: { id_vendedor_externo: true },
  })
  if (!vend?.id_vendedor_externo) return false

  const nivel = await prisma.vendedor_nivel_acesso
    .findUnique({ where: { id_vendedor_externo: vend.id_vendedor_externo } })
    .catch(() => null)

  if (nivel?.nivel === 'ADMINISTRADOR') return true

  const ov = String(orderVendorExterno || '').trim()
  if (ov && String(vend.id_vendedor_externo) === ov) return true

  if (nivel?.nivel === 'SUPERVISOR' && ov) {
    const sup = await prisma.supervisor.findUnique({
      where: { id_vendedor_externo: vend.id_vendedor_externo },
      select: { id: true },
    })
    if (!sup) return false
    const links = await prisma.supervisor_vendor_links.findMany({
      where: { supervisor_id: sup.id },
      select: { vendedor_externo: true },
    })
    if (links.some((l) => String(l.vendedor_externo) === ov)) return true
  }

  return false
}

export async function assertUserCanEditPedidoPlataforma(
  userEmail: string | null,
  orderVendorExterno: string | null | undefined
): Promise<void> {
  const ok = await userCanAccessPedidoPlataforma(userEmail, orderVendorExterno)
  if (!ok) {
    const err = new Error('Sem permissão para este pedido')
    ;(err as any).status = 403
    throw err
  }
}
