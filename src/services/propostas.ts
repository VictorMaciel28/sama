import type { Pedido } from './pedidos'

const LIST_CACHE_TTL_MS = 2500
let propostasCache: { ts: number; data: Pedido[] } | null = null
let propostasInFlight: Promise<Pedido[]> | null = null

export async function getPropostas(): Promise<Pedido[]> {
  const now = Date.now()
  if (propostasCache && now - propostasCache.ts < LIST_CACHE_TTL_MS) return propostasCache.data
  if (propostasInFlight) return propostasInFlight

  try {
    propostasInFlight = (async () => {
      const res = await fetch('/api/propostas')
      const json = await res.json()
      const data = !res.ok || !json?.ok ? [] : (json.data as Pedido[])
      propostasCache = { ts: Date.now(), data }
      return data
    })()
    return await propostasInFlight
  } catch {
    // se a API não existir ainda, retornar lista vazia para não quebrar a UI
    return []
  } finally {
    propostasInFlight = null
  }
}

export async function createProposta(input: Partial<Pedido> & { id?: number; id_vendedor_externo?: string | null; client_vendor_externo?: string | null }) {
  const res = await fetch('/api/propostas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const json = await res.json()
  if (!res.ok || !json?.ok) throw new Error(json?.error || 'Falha ao salvar proposta')
  propostasCache = null
  return json.numero
}

export async function updateProposta(
  numero: number,
  input: Partial<Pedido> & { id?: number; id_vendedor_externo?: string | null; client_vendor_externo?: string | null }
) {
  const res = await fetch(`/api/propostas/${numero}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const json = await res.json()
  if (!res.ok || !json?.ok) throw new Error(json?.error || 'Falha ao atualizar proposta')
  propostasCache = null
  return json.numero as number
}
