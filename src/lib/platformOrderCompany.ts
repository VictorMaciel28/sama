import { EMPRESAS_SUPRIMENTOS } from '@/constants/empresas-suprimentos'

/** Empresa padrão dos pedidos/propostas (Aliança matriz — mesmo CNPJ usado antes). */
export const DEFAULT_PLATFORM_ORDER_COMPANY_ID = 'alianca-matriz'

const COMPANY_IDS = new Set<string>(EMPRESAS_SUPRIMENTOS.map((e) => e.id))

export function companyIdFromCnpjDigits(digits: string): string | null {
  const d = String(digits || '').replace(/\D/g, '')
  if (!d) return null
  const hit = EMPRESAS_SUPRIMENTOS.find((e) => e.cnpj.replace(/\D/g, '') === d)
  return hit?.id ?? null
}

/** Resolve `platform_order.company_id` a partir do corpo, valor existente e regra de default. */
export function resolvePlatformOrderCompanyId(
  body: { company_id?: unknown; company?: unknown },
  existingCompanyId?: string | null,
  options: { applyDefault?: boolean } = {}
): string | null {
  const { applyDefault = false } = options

  const rawId = body.company_id != null ? String(body.company_id).trim() : ''
  if (rawId && COMPANY_IDS.has(rawId)) return rawId

  const rawCompany = body.company != null ? String(body.company).trim() : ''
  if (rawCompany) {
    if (COMPANY_IDS.has(rawCompany)) return rawCompany
    const byCnpj = companyIdFromCnpjDigits(rawCompany)
    if (byCnpj) return byCnpj
  }

  const existing = existingCompanyId != null ? String(existingCompanyId).trim() : ''
  if (existing && COMPANY_IDS.has(existing)) return existing

  return applyDefault ? DEFAULT_PLATFORM_ORDER_COMPANY_ID : null
}
