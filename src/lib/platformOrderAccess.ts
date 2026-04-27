import { prisma } from '@/lib/prisma'

export type PedidoOrderUserAccess = {
  vendorId: string | null
  isAdmin: boolean
  isSupervisor: boolean
}

export async function resolveUserAccess(userEmail: string | null): Promise<PedidoOrderUserAccess> {
  let vendorId: string | null = null
  let isAdmin = false
  let isSupervisor = false
  if (userEmail) {
    const vendRecord = await prisma.vendedor.findFirst({ where: { email: userEmail } })
    vendorId = vendRecord?.id_vendedor_externo ?? null
    if (vendRecord?.id_vendedor_externo) {
      const nivel = await prisma.vendedor_nivel_acesso
        .findUnique({ where: { id_vendedor_externo: vendRecord.id_vendedor_externo } })
        .catch(() => null)
      if (nivel?.nivel === 'ADMINISTRADOR') isAdmin = true
      if (nivel?.nivel === 'SUPERVISOR') isSupervisor = true
    }
  }
  return { vendorId, isAdmin, isSupervisor }
}

export async function loadOrder(numero: number) {
  return prisma.platform_order.findUnique({
    where: { numero },
    include: {
      cliente_rel: true,
      products: {
        orderBy: { id: 'asc' },
      },
    },
  })
}

export async function authorizeOrder(numero: number, userAccess: PedidoOrderUserAccess) {
  const { vendorId, isAdmin, isSupervisor } = userAccess
  const order = await loadOrder(numero)
  if (!order) throw new Error('pedido_nao_encontrado')

  if (isAdmin) return order

  if (isSupervisor && vendorId) {
    const sup = await prisma.supervisor.findUnique({
      where: { id_vendedor_externo: vendorId },
      select: { id: true },
    })
    const links = sup
      ? await prisma.supervisor_vendor_links.findMany({
          where: { supervisor_id: sup.id },
          select: { vendedor_externo: true },
        })
      : []
    const allowed = new Set<string>()
    allowed.add(vendorId)
    links.forEach((link) => {
      if (link.vendedor_externo) allowed.add(link.vendedor_externo)
    })
    const rowVendor = order.id_vendedor_externo
    const clientVendor = order.client_vendor_externo
    if ((rowVendor && allowed.has(rowVendor)) || (clientVendor && allowed.has(clientVendor))) {
      return order
    }
    throw new Error('pedido_nao_encontrado')
  }

  if (!vendorId) throw new Error('pedido_nao_encontrado')
  if (order.id_vendedor_externo === vendorId || order.client_vendor_externo === vendorId) {
    return order
  }
  throw new Error('pedido_nao_encontrado')
}

export async function resolveVendedorNome(idVendedorExterno: string | null | undefined): Promise<string | null> {
  if (!idVendedorExterno) return null
  const v = await prisma.vendedor.findFirst({
    where: { id_vendedor_externo: idVendedorExterno },
    select: { nome: true },
  })
  return v?.nome?.trim() || null
}
