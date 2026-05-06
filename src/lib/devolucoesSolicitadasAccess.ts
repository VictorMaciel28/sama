import { CommissionRole, type VendedorTipoAcesso } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export type DevolucaoSolicitacaoScope = {
  id_vendedor_externo: string | null
  tipo: VendedorTipoAcesso | null
  is_admin: boolean
  is_supervisor: boolean
}

/**
 * Televendas e perfis administrativos veem todas as solicitações;
 * vendedor vê apenas solicitações cuja NF está ligada a um pedido em que atua como vendedor.
 */
export function seesAllDevolucoesSolicitadas(scope: DevolucaoSolicitacaoScope): boolean {
  return (
    scope.tipo === 'TELEVENDAS' ||
    scope.is_admin ||
    scope.is_supervisor
  )
}

export async function resolveDevolucaoSolicitacaoScope(
  email: string | null | undefined
): Promise<DevolucaoSolicitacaoScope | null> {
  if (!email?.trim()) return null

  const vend = await prisma.vendedor.findFirst({ where: { email: email.trim() } })
  if (!vend?.id_vendedor_externo) {
    return {
      id_vendedor_externo: null,
      tipo: null,
      is_admin: false,
      is_supervisor: false,
    }
  }

  const externo = vend.id_vendedor_externo
  const tipoRow = await prisma.vendedor_tipo_acesso.findUnique({ where: { id_vendedor_externo: externo } })
  const nivelRow = await prisma.vendedor_nivel_acesso
    .findUnique({ where: { id_vendedor_externo: externo } })
    .catch(() => null)

  return {
    id_vendedor_externo: externo,
    tipo: tipoRow?.tipo ?? null,
    is_admin: nivelRow?.nivel === 'ADMINISTRADOR',
    is_supervisor: nivelRow?.nivel === 'SUPERVISOR',
  }
}

/** IDs de NF Tiny (`platform_order.id_nota_fiscal`) dos pedidos em que o vendedor está como responsável ou comissão de vendedor. */
export async function notaFiscalTinyIdsForVendedor(idVendedorExterno: string): Promise<Set<string>> {
  const orders = await prisma.platform_order.findMany({
    where: {
      OR: [
        { id_vendedor_externo: idVendedorExterno },
        {
          commissions: {
            some: {
              beneficiary_externo: idVendedorExterno,
              role: CommissionRole.VENDEDOR,
            },
          },
        },
      ],
      id_nota_fiscal: { not: null },
    },
    select: { id_nota_fiscal: true },
  })

  return new Set(
    orders.map((o) => String(o.id_nota_fiscal || '').trim()).filter(Boolean)
  )
}

export function canViewSolicitacaoNota(
  scope: DevolucaoSolicitacaoScope,
  allowedNotaIds: Set<string>,
  tinyNotaFiscalId: string
): boolean {
  if (seesAllDevolucoesSolicitadas(scope)) return true
  const id = String(tinyNotaFiscalId || '').trim()
  if (!id) return false
  return allowedNotaIds.has(id)
}
