import { existsSync } from 'fs'
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

/** Caminhos comuns do Chrome/Chromium em desenvolvimento (puppeteer-core não baixa browser). */
function candidateChromePaths(): string[] {
  const out: string[] = []
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH?.trim() || process.env.CHROME_PATH?.trim()
  if (fromEnv) out.push(fromEnv)
  if (process.platform === 'win32') {
    const la = process.env.LOCALAPPDATA
    if (la) out.push(`${la}\\Google\\Chrome\\Application\\chrome.exe`)
    out.push('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
    out.push('C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe')
  } else if (process.platform === 'darwin') {
    out.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    out.push('/Applications/Chromium.app/Contents/MacOS/Chromium')
  } else {
    out.push('/usr/bin/google-chrome-stable')
    out.push('/usr/bin/google-chrome')
    out.push('/usr/bin/chromium')
    out.push('/usr/bin/chromium-browser')
  }
  return out
}

type HeadlessOpt = boolean | 'shell'

async function resolvePuppeteerLaunchOptions(): Promise<{
  executablePath: string
  args: string[]
  defaultViewport: { width: number; height: number; deviceScaleFactor?: number } | null
  headless: HeadlessOpt
}> {
  if (process.env.VERCEL) {
    const chromium = (await import('@sparticuz/chromium')).default
    return {
      executablePath: await chromium.executablePath(),
      args: [...chromium.args],
      defaultViewport: chromium.defaultViewport,
      headless: chromium.headless as HeadlessOpt,
    }
  }

  const executablePath = candidateChromePaths().find((p) => p && existsSync(p))
  if (!executablePath) {
    throw new Error(
      'Chrome não encontrado para gerar o PDF. Instale o Google Chrome ou defina PUPPETEER_EXECUTABLE_PATH (caminho do chrome.exe / google-chrome). Na Vercel o binário serverless é usado automaticamente.'
    )
  }

  return {
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=none',
    ],
    defaultViewport: null,
    headless: true,
  }
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
  let puppeteer: typeof import('puppeteer-core')
  try {
    puppeteer = await import('puppeteer-core')
  } catch {
    throw new Error('Não foi possível carregar puppeteer-core. Execute npm install.')
  }

  const launchOpts = await resolvePuppeteerLaunchOptions()

  const browser = await puppeteer.default.launch({
    headless: launchOpts.headless,
    args: launchOpts.args,
    executablePath: launchOpts.executablePath,
    ...(launchOpts.defaultViewport ? { defaultViewport: launchOpts.defaultViewport } : {}),
  })

  try {
    const page = await browser.newPage()
    if (!launchOpts.defaultViewport) {
      await page.setViewport({ width: 1280, height: 1800, deviceScaleFactor: 1 })
    }
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
