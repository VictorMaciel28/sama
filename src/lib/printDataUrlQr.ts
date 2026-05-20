/**
 * Imprime apenas uma imagem (data URL), via iframe oculto — evita popup e impressão da tela inteira do admin.
 */
export function printDataUrlQr(dataUrl: string): void {
  if (typeof document === 'undefined') return

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;'

  document.body.appendChild(iframe)
  const win = iframe.contentWindow
  const doc = iframe.contentDocument
  if (!win || !doc) {
    iframe.remove()
    return
  }

  doc.open()
  doc.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"/><title>QR</title>
<style>
  @page { margin: 14mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  img { width: 260px; height: 260px; max-width: 72vmin; max-height: 72vmin; object-fit: contain; }
</style></head><body><img src=${JSON.stringify(dataUrl)} alt="" /></body></html>`)
  doc.close()

  const cleanup = () => {
    iframe.remove()
  }

  const runPrint = () => {
    try {
      win.focus()
      win.print()
    } finally {
      setTimeout(cleanup, 1000)
    }
  }

  setTimeout(runPrint, 150)
}
