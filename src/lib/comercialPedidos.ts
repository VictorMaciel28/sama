import { prisma } from '@/lib/prisma'
import { findVendedorForAuthSession } from '@/lib/vendedorFromSession'
import { vendedorAccessKey } from '@/lib/vendedorAccessKey'

/** Discrimina pedidos/orçamentos do módulo Comercial (sem Tiny). */
export const SISTEMA_ORIGEM_COMERCIAL = 'comercial'

export function vendedorExternoForPlatformOrder(v: { id: number; id_vendedor_externo?: string | null }): string | null {
  const ext = (v.id_vendedor_externo || '').trim()
  if (ext) return ext
  return `local:${v.id}`
}

export type ComercialSessionAccess = {
  vend: { id: number; id_vendedor_externo: string | null; nome: string; email: string | null }
  vendedorExterno: string | null
  isAdmin: boolean
}

export async function resolveComercialSessionAccess(sessionUser: {
  id?: string
  email?: string | null
}): Promise<ComercialSessionAccess | null> {
  const vend = await findVendedorForAuthSession(sessionUser)
  if (!vend) return null
  const accessKey = vendedorAccessKey(vend)
  const nivelRow = await prisma.vendedor_nivel_acesso
    .findUnique({ where: { id_vendedor_externo: accessKey } })
    .catch(() => null)
  const isAdmin = nivelRow?.nivel === 'ADMINISTRADOR'
  return {
    vend: {
      id: vend.id,
      id_vendedor_externo: vend.id_vendedor_externo,
      nome: vend.nome,
      email: vend.email,
    },
    vendedorExterno: vendedorExternoForPlatformOrder(vend),
    isAdmin,
  }
}

export function canAccessComercialOrder(
  access: ComercialSessionAccess,
  orderVendedorExterno: string | null | undefined
): boolean {
  if (access.isAdmin) return true
  if (!access.vendedorExterno || !orderVendedorExterno) return false
  return String(orderVendedorExterno).trim() === access.vendedorExterno
}

export const STATUS_MAP_UI_TO_DB: Record<string, string> = {
  Proposta: 'PROPOSTA',
  Aprovado: 'APROVADO',
  Pendente: 'PENDENTE',
  Cancelado: 'CANCELADO',
  Faturado: 'FATURADO',
  Enviado: 'ENVIADO',
  Entregue: 'ENTREGUE',
  'Dados incompletos': 'DADOS_INCOMPLETOS',
}

export const STATUS_MAP_DB_TO_UI: Record<string, string> = {
  PROPOSTA: 'Proposta',
  APROVADO: 'Aprovado',
  PENDENTE: 'Pendente',
  CANCELADO: 'Cancelado',
  FATURADO: 'Faturado',
  ENVIADO: 'Enviado',
  ENTREGUE: 'Entregue',
  DADOS_INCOMPLETOS: 'Dados incompletos',
}

export function normalizeComercialItems(items: unknown): Array<{
  produto_id: number | null
  codigo: string | null
  nome: string
  preco: number
  quantidade: number
  unidade: string
}> {
  if (!Array.isArray(items)) return []
  return items
    .map((it: any) => {
      const node = it?.item && typeof it.item === 'object' ? it.item : it
      const nome = (node?.descricao || node?.nome || '').toString().trim()
      const quantidade = Number(node?.quantidade || 0)
      const preco = Number(node?.valor_unitario ?? node?.preco ?? 0)
      if (!nome || quantidade <= 0) return null
      const produtoIdRaw = node?.produtoId ?? node?.produto_id ?? it?.produtoId ?? it?.produto_id
      const produtoIdNum = produtoIdRaw != null ? Number(produtoIdRaw) : null
      return {
        produto_id: produtoIdNum && !Number.isNaN(produtoIdNum) ? produtoIdNum : null,
        codigo: node?.codigo ? String(node.codigo) : null,
        nome,
        preco,
        quantidade,
        unidade: node?.unidade ? String(node.unidade) : 'UN',
      }
    })
    .filter(Boolean) as Array<{
    produto_id: number | null
    codigo: string | null
    nome: string
    preco: number
    quantidade: number
    unidade: string
  }>
}

export async function persistComercialOrderProducts(orderKey: number, items: ReturnType<typeof normalizeComercialItems>) {
  if (orderKey <= 0) return
  await prisma.platform_order_product.deleteMany({ where: { tiny_id: orderKey } as any })
  if (items.length === 0) return
  await prisma.platform_order_product.createMany({
    data: items.map((it) => ({
      tiny_id: orderKey,
      produto_id: it.produto_id,
      codigo: it.codigo,
      nome: it.nome,
      preco: Number(it.preco || 0),
      quantidade: Number(it.quantidade || 0),
      unidade: it.unidade || 'UN',
    })) as any,
  })
}

export async function resolveComercialCompanyId(
  bodyCompanyId: unknown,
  existingCompanyId?: string | null
): Promise<string | null> {
  const raw = bodyCompanyId != null ? String(bodyCompanyId).trim() : ''
  if (raw) {
    const hit = await prisma.company.findUnique({ where: { id: raw }, select: { id: true } })
    if (hit) return hit.id
  }
  const existing = existingCompanyId != null ? String(existingCompanyId).trim() : ''
  if (existing) {
    const hit = await prisma.company.findUnique({ where: { id: existing }, select: { id: true } })
    if (hit) return hit.id
  }
  return null
}

export async function nextPlatformOrderNumero(): Promise<number> {
  const maxRow = await prisma.platform_order.findFirst({
    select: { numero: true },
    orderBy: { numero: 'desc' },
  })
  return (maxRow?.numero || 1000) + 1
}
