/** Faixa de taxa administrativa nas condições de pagamento (cadastro e pedido). */
export const PAYMENT_ADMIN_TIER_LABELS: Record<number, string> = {
  0: 'Taxa administrativa isenta',
  1: 'Taxa administrativa de 3%',
  2: 'Taxa administrativa de 5%',
}

export const PAYMENT_ADMIN_TIER_ORDER = [0, 1, 2] as const

export type PaymentAdminTier = (typeof PAYMENT_ADMIN_TIER_ORDER)[number]

export function tierToPercent(tier: number): number {
  if (tier === 2) return 5
  if (tier === 1) return 3
  return 0
}

export function tierToMarkupDecimal(tier: number): number {
  return tierToPercent(tier) / 100
}

const REF_PREFIX = '__pcid:'

/** Valor do <select> para condição cadastrada (evita ambiguidade entre faixas). */
export function formatPaymentConditionSelectValue(id: number): string {
  return `${REF_PREFIX}${id}`
}

export function parsePaymentConditionSelectValue(value: string): number | null {
  const s = String(value || '')
  if (!s.startsWith(REF_PREFIX)) return null
  const id = Number(s.slice(REF_PREFIX.length))
  return Number.isFinite(id) && id > 0 ? id : null
}

export type PaymentConditionRow = {
  id: number
  name: string
  percent: number
  admin_tier: number
  valor_minimo: number | null
  valor_minimo_sem_taxa: number | null
}

export function resolvePaymentCondition(
  condicaoPersistida: string,
  list: PaymentConditionRow[]
): PaymentConditionRow | undefined {
  const id = parsePaymentConditionSelectValue(condicaoPersistida)
  if (id != null) return list.find((c) => c.id === id)
  const name = String(condicaoPersistida || '').trim()
  if (!name) return undefined
  return list.find((c) => c.name === name)
}
