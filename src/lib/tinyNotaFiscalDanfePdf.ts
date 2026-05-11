import { tinyV3Fetch } from '@/lib/tinyOAuth'

export function extractXmlStringFromTinyPayload(payload: unknown): string | null {
  if (!payload) return null
  const p = payload as Record<string, unknown>
  const candidates = [
    p.xmlNfe,
    p.xmlNFe,
    p.xml,
    (p.data as Record<string, unknown> | undefined)?.xmlNfe,
    (p.data as Record<string, unknown> | undefined)?.xmlNFe,
    (p.data as Record<string, unknown> | undefined)?.xml,
  ]
  const found = candidates.find((c) => typeof c === 'string' && (c as string).trim())
  if (!found) return null
  const raw = String(found).trim()
  if (raw.startsWith('<')) return raw
  try {
    return Buffer.from(raw, 'base64').toString('utf-8')
  } catch {
    return raw
  }
}

const DANFE_API_URL = 'https://api.meudanfe.com.br/v2/fd/convert/xml-to-da'
const DANFE_API_KEY = process.env.DANFE_API_KEY || 'a23c472e-6b4e-40d6-a8bc-4099eb0ff1ef'

export async function fetchDanfePdfFromNfeXml(xml: string): Promise<Buffer> {
  const res = await fetch(DANFE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'Api-Key': DANFE_API_KEY,
    },
    body: xml,
  })

  const json = await res.json().catch(() => null)
  const data = json?.data
  if (!res.ok || !data || typeof data !== 'string') {
    const message = json?.message || json?.error || `danfe_api_error_${res.status}`
    throw new Error(message)
  }

  return Buffer.from(data, 'base64')
}

/** XML da NF-e via Tiny public API v3 (mesmos paths do rastreamento público). */
export async function fetchTinyNfeXmlString(idNota: string): Promise<string> {
  const paths = [`/nots/${idNota}/xml`, `/notas/${idNota}/xml`]
  let lastRes: Response | null = null
  for (const p of paths) {
    const res = await tinyV3Fetch(p, { method: 'GET' })
    lastRes = res
    if (res.ok) {
      const json = await res.json().catch(() => null)
      const xml = extractXmlStringFromTinyPayload(json)
      if (xml) return xml
    }
  }
  if (lastRes) {
    const text = await lastRes.text().catch(() => '')
    throw new Error(`tiny_xml_error: status=${lastRes.status} body=${text}`)
  }
  throw new Error('tiny_xml_error')
}

export async function buildDanfePdfBufferFromTinyNotaId(idNota: string): Promise<Buffer> {
  const xml = await fetchTinyNfeXmlString(idNota)
  return fetchDanfePdfFromNfeXml(xml)
}
