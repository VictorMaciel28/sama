import { tinyV2Post } from '@/lib/tinyOAuth'

function currentDateBr() {
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yyyy = String(now.getFullYear())
  return `${dd}/${mm}/${yyyy}`
}

/** Aceita id numérico > 0 (número ou string, inclusive `"0"` → ignora). */
function coalescePositiveTinyId(...raws: unknown[]): string | null {
  for (const raw of raws) {
    if (raw == null || raw === '') continue
    const n = Number(String(raw).trim())
    if (Number.isFinite(n) && n > 0) return String(Math.trunc(n))
  }
  return null
}

/**
 * Extrai o id do vendedor no Tiny (string para `platform_order.id_vendedor_externo`)
 * a partir de `pedido.obter`, payload aninhado `vendedor` ou `dados` do webhook.
 */
export function parseTinyIdVendedorExternoFromPedido(
  tinyPedido: Record<string, unknown> | null | undefined,
  webhookDados?: Record<string, unknown> | null | undefined
): string | null {
  if (!tinyPedido && !webhookDados) return null
  const vend = tinyPedido?.vendedor
  const vendObj = vend && typeof vend === 'object' ? (vend as Record<string, unknown>) : null
  const whVend = webhookDados?.vendedor
  const whVendObj = whVend && typeof whVend === 'object' ? (whVend as Record<string, unknown>) : null

  return coalescePositiveTinyId(
    tinyPedido?.id_vendedor,
    tinyPedido?.idVendedor,
    vendObj?.id,
    vendObj?.id_vendedor,
    vendObj?.idVendedor,
    webhookDados?.idVendedor,
    webhookDados?.id_vendedor,
    webhookDados?.idVendedorTiny,
    whVendObj?.id,
    whVendObj?.id_vendedor,
    whVendObj?.idVendedor
  )
}

/**
 * Mesma fonte que o import full sync (`pedidos.pesquisa`): quando `pedido.obter` vem sem vendedor útil,
 * a lista ainda costuma trazer `id_vendedor`.
 */
export async function fetchIdVendedorExternoViaPedidosPesquisa(tinyOrderId: number, numero: number): Promise<string | null> {
  if (!(tinyOrderId > 0) || !(numero > 0)) return null
  try {
    const json = await tinyV2Post('pedidos.pesquisa.php', {
      numero,
      pagina: 1,
      sort: 'ASC',
      dataInicial: '01/01/2000',
      dataFinal: currentDateBr(),
    })
    const retorno = json?.retorno
    if (String(retorno?.status || '') !== 'OK') return null
    const pedidosRaw = Array.isArray(retorno?.pedidos) ? retorno.pedidos : []
    for (const item of pedidosRaw) {
      const p = item?.pedido as Record<string, unknown> | undefined
      if (!p) continue
      const idP = Number(p?.id || 0)
      const numP = Number(p?.numero || 0)
      if (idP === tinyOrderId || numP === numero) {
        const v = parseTinyIdVendedorExternoFromPedido(p, null)
        if (v) return v
      }
    }
  } catch {
    return null
  }
  return null
}

export async function resolveTinyPedidoIdVendedorExterno(args: {
  tinyPedido: Record<string, unknown> | null | undefined
  webhookDados?: Record<string, unknown> | null | undefined
  tinyOrderId: number
  numero: number
}): Promise<string | null> {
  const direct = parseTinyIdVendedorExternoFromPedido(args.tinyPedido ?? undefined, args.webhookDados ?? undefined)
  if (direct) return direct
  return fetchIdVendedorExternoViaPedidosPesquisa(args.tinyOrderId, args.numero)
}
