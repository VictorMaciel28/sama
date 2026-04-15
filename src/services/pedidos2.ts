export type PedidoStatus = 'Proposta' | 'Aprovado' | 'Pendente' | 'Faturado' | 'Enviado' | 'Entregue' | 'Cancelado' | 'Dados incompletos'

export interface Pedido {
  numero: number
  data: string // ISO date: YYYY-MM-DD
  cliente: string
  cnpj: string
  sistema_origem?: 'tiny' | 'sama' | string
  id_client_externo?: string | null
  total: number
  status: PedidoStatus
  id_vendedor_externo?: string | null
  order_vendor_externo?: string | null
  order_vendor_nome?: string | null
  client_vendor_externo?: string | null
  client_vendor_nome?: string | null
  forma_recebimento?: string | null
  condicao_pagamento?: string | null
  /** Persistido em platform_order; true = priorizar mínimo com juros na UI/validação. */
  juros_ligado?: boolean | null
  endereco_entrega?: {
    endereco?: string
    numero?: string
    complemento?: string
    bairro?: string
    cep?: string
    cidade?: string
    uf?: string
    endereco_diferente?: boolean
  } | null
  itens?: Array<{
    produtoId?: number | null
    codigo?: string
    nome: string
    quantidade: number
    unidade?: string
    preco: number
  }>
}

export async function getPedidos(): Promise<Pedido[]> {
  const res = await fetch('/api/pedidos')
  const json = await res.json()
  if (!res.ok || !json?.ok) return []
  return json.data as Pedido[]
}

export function getNextPedidoNumero(): number {
  return 1001
}

const pedidoByNumeroCache = new Map<number, { ts: number; data: Pedido | undefined }>()
const pedidoByNumeroInFlight = new Map<number, Promise<Pedido | undefined>>()

export async function getPedidoByNumero(numero: number): Promise<Pedido | undefined> {
  if (!numero) return undefined
  const now = Date.now()
  const cached = pedidoByNumeroCache.get(numero)
  if (cached && now - cached.ts < 5000) return cached.data

  const inFlight = pedidoByNumeroInFlight.get(numero)
  if (inFlight) return inFlight

  const p = (async () => {
    const res = await fetch(`/api/pedidos/${numero}`)
    const json = await res.json()
    const data = !res.ok || !json?.ok ? undefined : (json.data as Pedido)
    pedidoByNumeroCache.set(numero, { ts: Date.now(), data })
    return data
  })()
  pedidoByNumeroInFlight.set(numero, p)
  try {
    return await p
  } finally {
    pedidoByNumeroInFlight.delete(numero)
  }
}

export async function savePedido(input: Partial<Pedido> & {
  numero?: number
  id_vendedor_externo?: string | null
  client_vendor_externo?: string | null
}): Promise<any> {
  const res = await fetch('/api/pedidos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const json = await res.json()
  if (!res.ok || !json?.ok) throw new Error(json?.error || 'Falha ao salvar pedido')
  // If backend returned a platform 'numero', fetch and return the saved order as before.
  if (json?.numero) {
    const numero = Number(json.numero)
    const savedRes = await fetch(`/api/pedidos/${numero}`)
    const savedJson = await savedRes.json()
    if (!savedRes.ok || !savedJson?.ok) throw new Error('Falha ao carregar pedido salvo')
    return savedJson.data as Pedido
  }

  // Otherwise return the raw response (e.g. Tiny API response) so the caller can inspect it.
  return json
}

