/** Confere leitura de SKU ou GTIN (apenas dígitos, ≥8) contra o código do item. */
export function matchesSkuOrGtin(codigo: string | null, raw: string): boolean {
  const q = raw.trim()
  if (!q) return false
  const c = (codigo || '').trim()
  if (c && c.toLowerCase() === q.toLowerCase()) return true
  const qDigits = q.replace(/\D/g, '')
  const cDigits = c.replace(/\D/g, '')
  if (qDigits.length < 8) return false
  if (!cDigits) return false
  if (cDigits === qDigits) return true
  if (cDigits.endsWith(qDigits)) return true
  if (qDigits.endsWith(cDigits) && cDigits.length >= 8) return true
  return false
}
