/** Busca GTIN na API Tiny (produto.obter) para vários IDs; ignora falhas por item. */
export async function fetchGtinMapForProdutoIds(produtoIds: number[]): Promise<Map<number, string | null>> {
  const map = new Map<number, string | null>()
  const token = process.env.TINY_API_TOKEN
  const unique = [...new Set(produtoIds.filter((id) => Number.isFinite(id) && id > 0))]
  if (!token || unique.length === 0) {
    for (const id of unique) map.set(id, null)
    return map
  }

  await Promise.all(
    unique.map(async (produtoId) => {
      try {
        const paramsBody = new URLSearchParams()
        paramsBody.set('token', token)
        paramsBody.set('id', String(produtoId))
        paramsBody.set('formato', 'JSON')
        const res = await fetch('https://api.tiny.com.br/api2/produto.obter.php', {
          method: 'POST',
          headers: { Accept: 'application/json' },
          body: paramsBody,
        })
        if (!res.ok) {
          map.set(produtoId, null)
          return
        }
        const json = (await res.json()) as { retorno?: { produto?: { gtin?: unknown } } }
        const g = json?.retorno?.produto?.gtin
        const s = g == null ? '' : String(g).trim()
        map.set(produtoId, s.length > 0 ? s : null)
      } catch {
        map.set(produtoId, null)
      }
    }),
  )

  return map
}
