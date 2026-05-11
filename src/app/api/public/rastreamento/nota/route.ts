import { NextResponse } from 'next/server'
import { tinyV3Fetch } from '@/lib/tinyOAuth'
import { obterPdfDanfeNotaFiscalTiny } from '@/lib/tinyNotaFiscalObterLink'

function extractXmlString(payload: unknown): string | null {
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

async function fetchTinyXml(idNota: string) {
  const paths = [`/nots/${idNota}/xml`, `/notas/${idNota}/xml`]
  let lastRes: Response | null = null
  for (const p of paths) {
    const res = await tinyV3Fetch(p, { method: 'GET' })
    lastRes = res
    if (res.ok) {
      const json = await res.json().catch(() => null)
      const xml = extractXmlString(json)
      if (xml) return { xml, json }
    }
  }
  if (lastRes) {
    const text = await lastRes.text().catch(() => '')
    throw new Error(`tiny_xml_error: status=${lastRes.status} body=${text}`)
  }
  throw new Error('tiny_xml_error')
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const idNota = (searchParams.get('id') || '').toString().trim()
    const type = (searchParams.get('type') || 'xml').toString().trim().toLowerCase()
    if (!idNota) {
      return NextResponse.json({ ok: false, error: 'id_nota_obrigatorio' }, { status: 400 })
    }

    if (type === 'pdf') {
      const buffer = await obterPdfDanfeNotaFiscalTiny(idNota)
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="danfe-${idNota}.pdf"`,
        },
      })
    }

    const { xml } = await fetchTinyXml(idNota)

    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/xml',
        'Content-Disposition': `attachment; filename="nfe-${idNota}.xml"`,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || 'erro_ao_baixar_nota' }, { status: 500 })
  }
}
