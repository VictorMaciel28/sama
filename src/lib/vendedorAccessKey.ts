/** Chave usada em `vendedor_tipo_acesso` / `vendedor_nivel_acesso` (externo Tiny ou identificador local). */
export function vendedorAccessKey(v: { id: number; id_vendedor_externo?: string | null }): string {
  const ext = (v.id_vendedor_externo || '').trim()
  if (ext) return ext
  return `local:${v.id}`
}

export function isLocalVendedorAccessKey(key: string): boolean {
  return key.startsWith('local:')
}
