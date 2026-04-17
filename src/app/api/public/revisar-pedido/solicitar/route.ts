import { put } from '@vercel/blob'
import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

const MAX_OBSERVACOES = 8000

function onlyDigits(v: string | null | undefined) {
  return (v || '').replace(/\D/g, '')
}

const MAX_BYTES = 12 * 1024 * 1024
const ALLOWED_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

function guessExtension(mime: string, filename: string): string {
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('heic')) return 'heic'
  if (mime.includes('heif')) return 'heif'
  const m = /\.([a-z0-9]+)$/i.exec(filename || '')
  if (m && ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(m[1].toLowerCase())) {
    return m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase()
  }
  return 'jpg'
}

export async function POST(req: Request) {
  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token?.trim()) {
    return NextResponse.json(
      { ok: false, error: 'Upload não configurado. Defina BLOB_READ_WRITE_TOKEN no ambiente.' },
      { status: 503 }
    )
  }

  let solicitacaoId: number | null = null

  try {
    const form = await req.formData()

    const idNota = String(form.get('tiny_nota_fiscal_id') ?? form.get('id_nota') ?? '').trim()
    const telefone = String(form.get('telefone') ?? '').trim()
    const itensRaw = form.get('itens_indices')
    const notaNumero = String(form.get('nota_numero') ?? '').trim() || null
    const notaSerie = String(form.get('nota_serie') ?? '').trim() || null
    const clienteNome = String(form.get('cliente_nome') ?? '').trim() || null
    const valorNota = String(form.get('valor_nota') ?? '').trim() || null
    let observacoes =
      typeof form.get('observacoes') === 'string' ? String(form.get('observacoes')).trim() : ''
    if (observacoes.length > MAX_OBSERVACOES) {
      observacoes = observacoes.slice(0, MAX_OBSERVACOES)
    }

    const snapStr =
      typeof form.get('itens_snapshot') === 'string' ? String(form.get('itens_snapshot')).trim() : '[]'
    let itensSnapshotArr: Prisma.InputJsonValue = []
    try {
      const parsed = JSON.parse(snapStr || '[]') as unknown
      if (!Array.isArray(parsed)) {
        return NextResponse.json({ ok: false, error: 'Dados dos itens inválidos.' }, { status: 400 })
      }
      itensSnapshotArr = parsed as Prisma.InputJsonValue
    } catch {
      return NextResponse.json({ ok: false, error: 'Dados dos itens inválidos.' }, { status: 400 })
    }

    if (!idNota || !/^\d+$/.test(idNota)) {
      return NextResponse.json({ ok: false, error: 'Nota fiscal inválida.' }, { status: 400 })
    }

    const waRaw = String(form.get('telefone_e_whatsapp') ?? '').toLowerCase()
    const telefoneEWhatsapp = waRaw === '1' || waRaw === 'true' || waRaw === 'on' || waRaw === 'yes'

    const telDigits = onlyDigits(telefone)
    if (telDigits.length < 10) {
      return NextResponse.json(
        { ok: false, error: 'Informe um telefone válido para acompanhamento (DDD + número).' },
        { status: 400 }
      )
    }

    let indices: number[] = []
    try {
      const parsed = typeof itensRaw === 'string' ? JSON.parse(itensRaw) : itensRaw
      if (!Array.isArray(parsed)) {
        return NextResponse.json({ ok: false, error: 'Seleção de itens inválida.' }, { status: 400 })
      }
      indices = parsed.map((x: unknown) => Number(x)).filter((n) => Number.isFinite(n) && n >= 0)
    } catch {
      return NextResponse.json({ ok: false, error: 'Seleção de itens inválida.' }, { status: 400 })
    }

    const files: (Blob | null)[] = [0, 1, 2].map((i) => {
      const v = form.get(`image_${i}`)
      return v instanceof Blob && v.size > 0 ? v : null
    })

    if (!files.some(Boolean)) {
      return NextResponse.json(
        { ok: false, error: 'Envie pelo menos uma imagem (até três).' },
        { status: 400 }
      )
    }

    const sol = await prisma.revisar_pedido_solicitacao.create({
      data: {
        tiny_nota_fiscal_id: idNota,
        nota_numero: notaNumero,
        nota_serie: notaSerie,
        cliente_nome: clienteNome,
        valor_nota: valorNota,
        telefone: telDigits,
        telefone_e_whatsapp: telefoneEWhatsapp,
        itens_indices: indices,
        observacoes: observacoes || null,
        itens_snapshot: itensSnapshotArr,
      },
    })
    solicitacaoId = sol.id

    const stamp = Date.now()

    for (let ordem = 0; ordem < 3; ordem++) {
      const file = files[ordem]
      if (!file) continue

      if (file.size > MAX_BYTES) {
        throw new Error(`Arquivo ${ordem + 1} excede o tamanho máximo (12 MB).`)
      }

      const type = (file.type || '').toLowerCase()
      if (type && !ALLOWED_TYPES.has(type)) {
        throw new Error(`Tipo de arquivo não permitido no anexo ${ordem + 1}.`)
      }

      const buf = Buffer.from(await file.arrayBuffer())
      const fileName = file instanceof File ? file.name : 'upload'
      const ext = guessExtension(type, fileName)
      const rnd = Math.random().toString(36).slice(2, 12)
      const pathname = `revisar-pedido/solicitacao-${sol.id}/${ordem}_${stamp}_${rnd}.${ext}`

      const uploadContentType =
        type === 'image/jpg' || (!type && (ext === 'jpg' || ext === 'jpeg'))
          ? 'image/jpeg'
          : type || `image/${ext === 'jpg' ? 'jpeg' : ext}`

      const blob = await put(pathname, buf, {
        access: 'private',
        token,
        contentType: uploadContentType,
      })

      const fotoName = pathname.split('/').pop() ?? pathname

      await prisma.revisar_pedido_solicitacao_anexo.create({
        data: {
          solicitacao_id: sol.id,
          ordem,
          file_name: fotoName,
          blob_path: blob.pathname,
          blob_url: blob.url,
          content_type: uploadContentType,
        },
      })
    }

    return NextResponse.json({
      ok: true,
      message: 'Solicitação registrada com sucesso.',
      id: sol.id,
    })
  } catch (e: unknown) {
    if (solicitacaoId != null) {
      await prisma.revisar_pedido_solicitacao.delete({ where: { id: solicitacaoId } }).catch(() => {})
    }
    const message = e instanceof Error ? e.message : String(e)
    console.error('[revisar-pedido/solicitar]', message)
    const clientMsg = /Arquivo|Tipo|tamanho|excede/i.test(message)
    return NextResponse.json(
      { ok: false, error: clientMsg ? message : 'Erro ao registrar solicitação. Tente novamente.' },
      { status: clientMsg ? 400 : 500 }
    )
  }
}
