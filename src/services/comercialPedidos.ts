import type { Pedido } from './pedidos2'

const ORCAMENTO_CACHE_TTL = 2500
let orcamentosCache: { ts: number; data: Pedido[] } | null = null
let orcamentosInFlight: Promise<Pedido[]> | null = null

export async function getComercialOrcamentos(): Promise<Pedido[]> {
  const now = Date.now()
  if (orcamentosCache && now - orcamentosCache.ts < ORCAMENTO_CACHE_TTL) return orcamentosCache.data
  if (orcamentosInFlight) return orcamentosInFlight
  orcamentosInFlight = (async () => {
    const res = await fetch('/api/comercial/orcamentos')
    const json = await res.json()
    const data = !res.ok || !json?.ok ? [] : (json.data as Pedido[])
    orcamentosCache = { ts: Date.now(), data }
    return data
  })()
  try {
    return await orcamentosInFlight
  } finally {
    orcamentosInFlight = null
  }
}

export async function getComercialPedidoByNumero(numero: number, kind: 'orcamento' | 'pedido'): Promise<Pedido | undefined> {
  if (!numero) return undefined
  const base = kind === 'orcamento' ? '/api/comercial/orcamentos' : '/api/comercial/pedidos'
  const res = await fetch(`${base}/${numero}`)
  const json = await res.json()
  if (!res.ok || !json?.ok) return undefined
  return json.data as Pedido
}

export async function createComercialOrcamento(input: Partial<Pedido> & Record<string, unknown>) {
  const res = await fetch('/api/comercial/orcamentos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const json = await res.json()
  if (!res.ok || !json?.ok) throw new Error(json?.error || 'Falha ao salvar orçamento')
  orcamentosCache = null
  return json.numero as number
}

export async function updateComercialOrcamento(numero: number, input: Partial<Pedido> & Record<string, unknown>) {
  const res = await fetch(`/api/comercial/orcamentos/${numero}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const json = await res.json()
  if (!res.ok || !json?.ok) throw new Error(json?.error || 'Falha ao atualizar orçamento')
  orcamentosCache = null
  return json.numero as number
}

export async function saveComercialPedido(input: Partial<Pedido> & Record<string, unknown>): Promise<Pedido | { numero: number }> {
  const res = await fetch('/api/comercial/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const json = await res.json()
  if (!res.ok || !json?.ok) throw new Error(json?.error || 'Falha ao salvar pedido comercial')
  if (json?.numero) {
    const saved = await getComercialPedidoByNumero(Number(json.numero), 'pedido')
    if (saved) return saved
    return { numero: Number(json.numero) }
  }
  return json
}

export type ComercialPedidosListaResponse = {
  ok: boolean
  data: Pedido[]
  paginacao?: { total?: number; total_valor?: number }
}

export async function fetchComercialPedidosLista(url: string): Promise<ComercialPedidosListaResponse> {
  const res = await fetch(url)
  const json = (await res.json().catch(() => null)) as Partial<ComercialPedidosListaResponse> | null
  if (!res.ok || !json?.ok) {
    throw new Error((typeof (json as any)?.error === 'string' && (json as any).error) || 'Falha ao listar pedidos comerciais')
  }
  return json as ComercialPedidosListaResponse
}
