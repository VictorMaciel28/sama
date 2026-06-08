export type PedidoStatus =
  | 'Proposta'
  | 'Aprovado'
  | 'Pendente'
  | 'Faturado'
  | 'Enviado'
  | 'Entregue'
  | 'Cancelado'
  | 'Dados incompletos'

export interface Pedido {
  numero: number
  data: string // ISO date: YYYY-MM-DD
  cliente: string
  cnpj: string
  company_id?: string | null
  id_client_externo?: string | null
  total: number
  status: PedidoStatus
  id_vendedor_externo?: string | null
  order_vendor_externo?: string | null
  order_vendor_nome?: string | null
  client_vendor_externo?: string | null
  client_vendor_nome?: string | null
}

const LIST_CACHE_TTL_MS = 2500
let pedidosCache: { ts: number; data: Pedido[] } | null = null
let pedidosInFlight: Promise<Pedido[]> | null = null

// Funções para consumir a API de pedidos da plataforma
export async function getPedidos(): Promise<Pedido[]> {
  const now = Date.now()
  if (pedidosCache && now - pedidosCache.ts < LIST_CACHE_TTL_MS) return pedidosCache.data
  if (pedidosInFlight) return pedidosInFlight

  pedidosInFlight = (async () => {
    const res = await fetch('/api/pedidos')
    const json = await res.json()
    const data = !res.ok || !json?.ok ? [] : (json.data as Pedido[])
    pedidosCache = { ts: Date.now(), data }
    return data
  })()

  try {
    return await pedidosInFlight
  } finally {
    pedidosInFlight = null
  }
}

export function getNextPedidoNumero(): number {
  // Mantém cálculo local apenas para exibição antes do salvamento
  // O número oficial é definido no servidor ao salvar
  return 1001
}

export async function getPedidoByNumero(numero: number): Promise<Pedido | undefined> {
  if (!numero) return undefined
  const res = await fetch(`/api/pedidos/${numero}`)
  const json = await res.json()
  if (!res.ok || !json?.ok) return undefined
  return json.data as Pedido
}

export async function savePedido(input: Partial<Pedido> & {
  numero?: number
  id_vendedor_externo?: string | null
  client_vendor_externo?: string | null
}): Promise<Pedido> {
  const res = await fetch('/api/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const json = await res.json()
  if (!res.ok || !json?.ok) throw new Error(json?.error || 'Falha ao salvar pedido')

  // Expect backend to return { ok: true, numero: <number> } when platform save happens.
  if (json?.numero) {
    const numero = Number(json.numero)
    const saved = await getPedidoByNumero(numero)
    if (!saved) throw new Error('Falha ao carregar pedido salvo')
    return saved
  }

  // Fallback: if backend returned something else, throw so callers handle it explicitly.
  throw new Error('Resposta inesperada ao salvar pedido')
}

