import { tinyV2Post } from '@/lib/tinyOAuth'

function erroTiny(json: unknown): string {
  const erros = (json as { retorno?: { erros?: { erro?: string }[] } })?.retorno?.erros
  if (Array.isArray(erros) && erros[0]?.erro) return String(erros[0].erro)
  return 'Não foi possível obter o link da nota fiscal no Tiny.'
}

function validarIdNota(idNota: string): string {
  const id = String(idNota || '').trim()
  if (!id || !/^\d+$/.test(id)) throw new Error('ID da nota fiscal inválido')
  return id
}

/** URL de visualização (HTML DANFE no ERP Olist), não necessariamente PDF. */
export async function obterLinkNotaFiscalTiny(idNota: string): Promise<string> {
  const id = validarIdNota(idNota)

  const json = await tinyV2Post('nota.fiscal.obter.link.php', { id })
  const ret = (json as { retorno?: { status?: string; link_nfe?: string } })?.retorno
  if (String(ret?.status || '').toUpperCase() !== 'OK') {
    throw new Error(erroTiny(json))
  }
  const link = ret?.link_nfe != null ? String(ret.link_nfe).trim() : ''
  if (!link || !/^https?:\/\//i.test(link)) {
    throw new Error('O Tiny não retornou um link válido para a nota fiscal.')
  }
  return link
}

/**
 * `nota.fiscal.obter.link.php` (API 2.0 Tiny) → segue `link_nfe` e devolve o corpo bruto (HTML, PDF, etc.).
 */
export async function obterCorpoViaTinyNotaFiscalObterLink(idNota: string): Promise<{
  buffer: Buffer
  contentType: string
}> {
  const link = await obterLinkNotaFiscalTiny(idNota)

  const res = await fetch(link, { redirect: 'follow', cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Falha ao baixar o documento do link da nota (HTTP ${res.status}).`)
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream'
  return { buffer, contentType }
}

async function renderNfeViewerUrlToPdf(viewerUrl: string): Promise<Buffer> {
  let puppeteer: typeof import('puppeteer')
  try {
    puppeteer = await import('puppeteer')
  } catch {
    throw new Error(
      'Não foi possível carregar o Puppeteer (Chromium). Confirme npm install puppeteer e espaço em disco para o browser.'
    )
  }

  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim() || undefined

  const browser = await puppeteer.default.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=none',
    ],
    executablePath: executablePath || undefined,
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 1800, deviceScaleFactor: 1 })
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    )

    await page.goto(viewerUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    })
    await page.waitForSelector('#container', { timeout: 30_000 }).catch(() => {})
    await page.emulateMediaType('print')
    await new Promise((r) => setTimeout(r, 2800))

    const pdfUint8 = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '8mm', right: '6mm', bottom: '8mm', left: '6mm' },
      preferCSSPageSize: false,
    })
    return Buffer.from(pdfUint8)
  } finally {
    await browser.close()
  }
}

/**
 * Obtém PDF da DANFE mantendo o fluxo `nota.fiscal.obter.link.php`.
 * Se o link já servir `application/pdf`, devolve o binário; caso típico (HTML + print), renderiza com Chromium.
 */
export async function obterPdfDanfeNotaFiscalTiny(idNota: string): Promise<Buffer> {
  validarIdNota(idNota)
  const link = await obterLinkNotaFiscalTiny(idNota)

  const res = await fetch(link, { redirect: 'follow', cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Falha ao acessar o link da nota (HTTP ${res.status}).`)
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  const contentType = (res.headers.get('content-type')?.split(';')[0] || '').trim().toLowerCase()

  if (contentType.includes('application/pdf')) {
    return buffer
  }

  return renderNfeViewerUrlToPdf(link)
}
