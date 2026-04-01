/** Apenas dígitos. */
export function onlyDigits(s: string): string {
  return s.replace(/\D/g, '')
}

/**
 * Máscara de CNPJ enquanto digita: XX.XXX.XXX/XXXX-XX (máx. 14 dígitos).
 */
export function maskCnpjInput(value: string): string {
  const d = onlyDigits(value).slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

/**
 * Exibe CNPJ formatado a partir do valor armazenado (só dígitos ou já mascarado).
 * Se não tiver 14 dígitos, devolve o texto original trimado (dados legados).
 */
export function formatCnpjDisplay(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === '') return ''
  const d = onlyDigits(String(raw))
  if (d.length === 14) return maskCnpjInput(d)
  return String(raw).trim()
}
