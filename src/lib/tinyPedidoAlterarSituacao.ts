import { tinyV2Post } from '@/lib/tinyOAuth'

/** `pedido.alterar.situacao` — códigos conforme doc Tiny v2 (ex.: `preparando_envio`, `pronto_envio`). */
export async function tinyPedidoAlterarSituacao(
  tinyId: number,
  situacao: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isFinite(tinyId) || tinyId < 1) {
    return { ok: false, error: 'ID Tiny inválido' }
  }
  try {
    const data = await tinyV2Post('pedido.alterar.situacao', { id: tinyId, situacao })
    const retorno = (data as { retorno?: { status?: string; erros?: { erro?: string }[] } })?.retorno
    if (String(retorno?.status || '').toUpperCase() === 'OK') {
      return { ok: true }
    }
    const msg =
      Array.isArray(retorno?.erros) && retorno.erros.length > 0
        ? String(retorno.erros[0]?.erro || '')
        : 'Falha ao alterar situação no Tiny'
    return { ok: false, error: msg || 'Falha ao alterar situação no Tiny' }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro ao comunicar com o Tiny'
    return { ok: false, error: msg }
  }
}
