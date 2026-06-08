export type VendedorTipoAcessoValue = 'VENDEDOR' | 'TELEVENDAS' | 'VENDEDOR_COMERCIAL'

export const VENDEDOR_TIPO_ACESSO_OPTIONS: { value: VendedorTipoAcessoValue; label: string }[] = [
  { value: 'VENDEDOR', label: 'Vendedor Atacado' },
  { value: 'TELEVENDAS', label: 'Televendas Atacado' },
  { value: 'VENDEDOR_COMERCIAL', label: 'Vendedor Comercial' },
]

export function labelVendedorTipoAcesso(tipo: VendedorTipoAcessoValue | string | null | undefined): string {
  if (!tipo) return '-'
  const hit = VENDEDOR_TIPO_ACESSO_OPTIONS.find((o) => o.value === tipo)
  return hit?.label ?? String(tipo)
}

export function isVendedorTipoAcessoValue(v: unknown): v is VendedorTipoAcessoValue {
  return v === 'VENDEDOR' || v === 'TELEVENDAS' || v === 'VENDEDOR_COMERCIAL'
}
