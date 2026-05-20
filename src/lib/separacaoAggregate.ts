import type { Prisma } from '@prisma/client'

export type PedidoAggInput = {
  numero: number
  cliente: string
  products: {
    codigo: string | null
    nome: string
    unidade: string | null
    quantidade: Prisma.Decimal
    produto_id: number | null
  }[]
}

export type GrupoItemSeparacao = {
  codigo: string | null
  nome: string
  unidade: string | null
  total_quantidade: number
  produto_id: number | null
  pedidos: { numero: number; quantidade: number }[]
}

export function aggregateItensSeparacao(orders: PedidoAggInput[]): GrupoItemSeparacao[] {
  const map = new Map<string, GrupoItemSeparacao>()
  const keyOf = (codigo: string | null, nome: string) =>
    codigo != null && String(codigo).trim() !== '' ? `c:${String(codigo).trim()}` : `n:${nome.trim()}`

  for (const o of orders) {
    for (const p of o.products) {
      const key = keyOf(p.codigo, p.nome)
      const qty = Number(p.quantidade)
      if (!Number.isFinite(qty)) continue
      let g = map.get(key)
      if (!g) {
        g = {
          codigo: p.codigo != null && String(p.codigo).trim() !== '' ? String(p.codigo).trim() : null,
          nome: p.nome,
          unidade: p.unidade,
          total_quantidade: 0,
          produto_id: p.produto_id ?? null,
          pedidos: [],
        }
        map.set(key, g)
      }
      if (g.produto_id == null && p.produto_id != null) {
        g.produto_id = p.produto_id
      }
      g.total_quantidade += qty
      const prev = g.pedidos.find((x) => x.numero === o.numero)
      if (prev) prev.quantidade += qty
      else g.pedidos.push({ numero: o.numero, quantidade: qty })
    }
  }
  return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
}
