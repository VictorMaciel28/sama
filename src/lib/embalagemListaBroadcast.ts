/** Mesmo nome em todas as instâncias: outras abas recebem o evento. */
const CHANNEL = 'sama-estoque-embalagem'

/** Avisa outras abas/janelas para darem `router.refresh()` na lista de embalagem. */
export function notifyEmbalagemListaUpdated() {
  if (typeof BroadcastChannel === 'undefined') return
  try {
    const ch = new BroadcastChannel(CHANNEL)
    ch.postMessage({ type: 'embalagem-lista' })
    ch.close()
  } catch {
    /* ignore */
  }
}

/** Inscreve atualizações disparadas por `notifyEmbalagemListaUpdated` (mesmo navegador). */
export function subscribeEmbalagemListaUpdates(onUpdate: () => void): () => void {
  if (typeof BroadcastChannel === 'undefined') {
    return () => {}
  }
  const ch = new BroadcastChannel(CHANNEL)
  ch.onmessage = () => {
    onUpdate()
  }
  return () => {
    try {
      ch.close()
    } catch {
      /* ignore */
    }
  }
}
