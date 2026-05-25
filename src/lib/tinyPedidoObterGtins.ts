import { tinyV2Post } from '@/lib/tinyOAuth'

function normCodigo(s: string | null | undefined): string {
  return String(s ?? '')
    .trim()
    .toUpperCase()
}

function parseGtin(v: unknown): string | null {
  const s = v == null ? '' : String(v).trim()
  return s.length > 0 ? s : null
}

function readTinyItem(row: unknown): Record<string, unknown> | null {
  if (!row || typeof row !== 'object') return null
  const o = row as Record<string, unknown>
  const inner = o.item
  if (inner && typeof inner === 'object') return inner as Record<string, unknown>
  return o
}

/**
 * Monta mapas de GTIN a partir de `pdv.pedido.obter` (Tiny API 2 — PDV).
 * Mesmo corpo que `pedido.obter` (`id` do pedido); o GTIN costuma vir só nesta rota.
 * Um POST por `tiny_id`; relaciona `id_produto` e código ao GTIN; falhas por pedido são ignoradas.
 */
export async function fetchGtinLookupFromPedidosObter(tinyIds: number[]): Promise<{
  byProdutoId: Map<number, string | null>
  byCodigoNorm: Map<string, string | null>
}> {
  const byProdutoId = new Map<number, string | null>()
  const byCodigoNorm = new Map<string, string | null>()
  const unique = [...new Set(tinyIds.filter((id) => Number.isFinite(id) && id > 0))]
  if (unique.length === 0) {
    return { byProdutoId, byCodigoNorm }
  }

  await Promise.all(
    unique.map(async (tinyId) => {
      try {
        const json = (await tinyV2Post('pdv.pedido.obter.php', { id: tinyId })) as {
          retorno?: { status?: string; pedido?: { itens?: unknown } }
        }
        if (String(json?.retorno?.status || '') !== 'OK') return
        const itens = json?.retorno?.pedido?.itens
        if (!Array.isArray(itens)) return
        for (const row of itens) {
          const item = readTinyItem(row)
          if (!item) continue
          const gtin = parseGtin(item.gtin ?? item.Gtin)
          if (!gtin) continue
          const idProd = Number(item.id_produto)
          if (Number.isFinite(idProd) && idProd > 0) {
            byProdutoId.set(idProd, gtin)
          }
          const cod = normCodigo(item.codigo as string | undefined)
          if (cod) {
            byCodigoNorm.set(cod, gtin)
          }
        }
      } catch {
        /* OAuth / rede / pedido: ignora e segue */
      }
    }),
  )

  return { byProdutoId, byCodigoNorm }
}
