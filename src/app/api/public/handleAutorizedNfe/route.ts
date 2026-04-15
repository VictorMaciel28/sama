import { NextRequest, NextResponse } from 'next/server'
// @ts-ignore
import nodemailer from 'nodemailer'
import { prisma } from '@/lib/prisma'
import { PAYMENT_EMITER_ALIANCA, persistTinyNotaFiscalOnPayment } from '@/lib/tinyNotaFiscalPayment'

export const runtime = 'nodejs'

function detectDevice(userAgent: string) {
  const ua = userAgent.toLowerCase()
  if (!ua) return 'unknown'
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return 'mobile'
  if (ua.includes('ipad') || ua.includes('tablet')) return 'tablet'
  if (ua.includes('postman') || ua.includes('insomnia') || ua.includes('curl') || ua.includes('httpie')) {
    return 'api-client'
  }
  if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider')) return 'bot'
  return 'desktop'
}

async function logWebhook(req: NextRequest, rawBody: string) {
  const headers = Object.fromEntries(req.headers.entries())
  const userAgent = req.headers.get('user-agent') ?? null
  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    req.headers.get('cf-connecting-ip') ??
    null
  const method = req.method.toUpperCase()
  detectDevice(userAgent ?? '')

  await prisma.$executeRaw`
    INSERT INTO tiny_raw_logs (
      method, headers, body, ip_address, user_agent, received_at
    ) VALUES (
      ${method},
      ${JSON.stringify(headers)},
      ${rawBody || null},
      ${ipAddress},
      ${userAgent},
      NOW()
    )
  `
}

function onlyDigits(v: string | null | undefined) {
  return (v || '').replace(/\D/g, '')
}

function toNumberSafe(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function extractOrderCandidates(webhookPayload: any, nota: any): number[] {
  const candidatesRaw: any[] = [
    nota?.numero_ecommerce,
    webhookPayload?.dados?.numeroPedido,
    webhookPayload?.dados?.numero_pedido,
    webhookPayload?.dados?.pedido?.numero,
    nota?.numero_pedido,
    nota?.numeroPedido,
    nota?.pedido?.numero,
  ]
  const nums = candidatesRaw
    .map((x) => Number(String(x ?? '').trim()))
    .filter((x) => Number.isFinite(x) && x > 0)
  return Array.from(new Set(nums))
}

async function recomputeCommissionsFromNota(params: { webhookPayload: any; nota: any }) {
  const { webhookPayload, nota } = params
  const notaValue = toNumberSafe(nota?.valor_nota ?? nota?.total)
  if (notaValue <= 0) return { ok: false, reason: 'nota_value_invalid' }

  const numeroEcommerce = Number(String(nota?.numero_ecommerce ?? '').trim())
  const numeroCandidates = Number.isFinite(numeroEcommerce) && numeroEcommerce > 0
    ? [numeroEcommerce]
    : extractOrderCandidates(webhookPayload, nota)
  let order: any = null

  if (numeroCandidates.length > 0) {
    order = await prisma.platform_order.findFirst({
      where: { numero: { in: numeroCandidates } },
    })
  }

  if (!order) {
    const tinyOrderId = Number(webhookPayload?.dados?.idPedidoTiny ?? webhookPayload?.dados?.idPedido ?? nota?.id_pedido)
    if (Number.isFinite(tinyOrderId) && tinyOrderId > 0) {
      order = await prisma.platform_order.findFirst({ where: { tiny_id: tinyOrderId } })
    }
  }

  if (!order) {
    const cpfCnpj = onlyDigits(nota?.cliente?.cpf_cnpj)
    if (cpfCnpj) {
      order = await prisma.platform_order.findFirst({
        where: { cnpj: { contains: cpfCnpj } },
        orderBy: { created_at: 'desc' },
      })
    }
  }

  if (!order) return { ok: false, reason: 'order_not_found' }

  const meExterno =
    (order?.id_vendedor_externo && String(order.id_vendedor_externo).trim()) ||
    (nota?.id_vendedor != null ? String(nota.id_vendedor).trim() : '') ||
    (webhookPayload?.dados?.idVendedor != null ? String(webhookPayload.dados.idVendedor).trim() : '') ||
    null
  let clientVendorExterno = order?.client_vendor_externo || null

  // Fallback: derive client's vendor from CNPJ in DB if order does not have it yet.
  if (!clientVendorExterno) {
    const cnpjDigits = onlyDigits(order?.cnpj || nota?.cliente?.cpf_cnpj)
    if (cnpjDigits) {
      const cli = await prisma.cliente.findFirst({ where: { cpf_cnpj: { contains: cnpjDigits } } })
      clientVendorExterno = cli?.id_vendedor_externo || null
    }
  }

  if (!meExterno) return { ok: false, reason: 'order_vendor_missing', order_num: order.numero }

  const tipo = await prisma.vendedor_tipo_acesso.findUnique({ where: { id_vendedor_externo: meExterno } })
  const meTipo = (tipo?.tipo as 'VENDEDOR' | 'TELEVENDAS' | null) || 'VENDEDOR'

  await prisma.platform_commission.deleteMany({ where: { order_num: order.numero } })

  const entries: { beneficiary_externo: string; role: 'VENDEDOR' | 'TELEVENDAS'; percent: number; amount: number }[] = []
  if (meTipo === 'TELEVENDAS') {
    if (clientVendorExterno) {
      entries.push({ beneficiary_externo: meExterno, role: 'TELEVENDAS', percent: 1, amount: (notaValue * 1) / 100 })
      entries.push({ beneficiary_externo: clientVendorExterno, role: 'VENDEDOR', percent: 4, amount: (notaValue * 4) / 100 })
    } else {
      entries.push({ beneficiary_externo: meExterno, role: 'TELEVENDAS', percent: 5, amount: (notaValue * 5) / 100 })
    }
  } else {
    entries.push({ beneficiary_externo: meExterno, role: 'VENDEDOR', percent: 5, amount: (notaValue * 5) / 100 })
  }

  if (entries.length > 0) {
    await prisma.platform_commission.createMany({
      data: entries.map((e) => ({
        order_num: order.numero,
        beneficiary_externo: e.beneficiary_externo,
        role: e.role as any,
        percent: e.percent,
        amount: Number((Math.round(e.amount * 100) / 100).toFixed(2)),
      })),
    })
  }

  return { ok: true, order_num: order.numero, nota_value: notaValue, entries: entries.length }
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  let json: any = null

  try {
    await logWebhook(req, raw)
  } catch (e) {
    // Keep webhook flow resilient even if log insert fails.
  }

  try {
    json = JSON.parse(raw)
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  let paymentPersist: Awaited<ReturnType<typeof persistTinyNotaFiscalOnPayment>> | null = null
  try {
    paymentPersist = await persistTinyNotaFiscalOnPayment(json?.dados, PAYMENT_EMITER_ALIANCA)
  } catch {
    paymentPersist = { ok: false, reason: 'persist_error', count: 0 }
  }

  const idNotaFiscal = json?.dados?.idNotaFiscalTiny
  if (!idNotaFiscal) {
    return NextResponse.json({ ok: true, message: 'no idNotaFiscalTiny', payment_persist: paymentPersist })
  }

  const token = process.env.TINY_API_TOKEN || ''
  const tinyUrl = `https://api.tiny.com.br/api2/nota.fiscal.obter.php?token=${encodeURIComponent(
    token
  )}&id=${encodeURIComponent(String(idNotaFiscal))}&formato=json`

  let apiResponseText = ''
  try {
    const r = await fetch(tinyUrl)
    apiResponseText = await r.text()
    if (r.status !== 200) {
      return NextResponse.json({ ok: false, error: 'tiny_http_error', status: r.status }, { status: 502 })
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: 'tiny_fetch_error', detail: String(e) }, { status: 500 })
  }

  let data: any = null
  try {
    data = JSON.parse(apiResponseText)
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'invalid_tiny_json' }, { status: 500 })
  }

  const nota = data?.retorno?.nota_fiscal ?? null
  if (!nota) {
    return NextResponse.json({ ok: false, error: 'nota_not_found' }, { status: 404 })
  }

  const commissionResult: any = {
    ok: true,
    skipped: true,
    reason: 'commission_moved_to_pedido_status_faturado',
  }

  const numero = nota.numero ?? ''
  const emiter = PAYMENT_EMITER_ALIANCA
  const destine = nota.cliente?.nome ?? ''
  const formaPagamento = String((nota.forma_pagamento ?? nota.meio_pagamento) || '')
  const valor = nota.valor_nota ?? nota.total ?? 0

  // format value as "1.234,56"
  const valorFormatted = Number(valor).toFixed(2).replace('.', ',')

  const message = `Nota ${numero} emitida para ${destine} (origem: ${emiter}) com forma de pagamento ${formaPagamento} no valor de R$ ${valorFormatted}.`
  const chave = nota.chave_acesso ?? ''

  // send via existing internal whatsapp API
  const whatsappEndpoint =
    (process.env.NEXT_PUBLIC_INTERNAL_URL ? `${process.env.NEXT_PUBLIC_INTERNAL_URL}/api/whatsapp` : '') ||
    'http://localhost:3000/api/whatsapp'

  const results: any = { whatsapp: null, email: null, payment_persist: paymentPersist }

  // attempt WhatsApp send
  try {
    const resp = await fetch(whatsappEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: '5524999946480',
        message,
      }),
    })
    results.whatsapp = await resp.json().catch(() => null)
  } catch (e: any) {
    results.whatsapp = { error: String(e) }
  }

  // send email notification
  try {
    const smtpHost = process.env.SMTP_HOST || 'br590.hostgator.com.br'
    const smtpPort = Number(process.env.SMTP_PORT || '587')
    const smtpUser = process.env.SMTP_USER || 'sama@aliancamercantil.com'
    const smtpPass = process.env.SMTP_PASS || 'sama@aliancamercantil.com'
    const from = process.env.EMAIL_FROM || smtpUser
    const clientEmail = nota?.cliente?.email?.trim()
    const toEmail = clientEmail || (process.env.NOTIFY_EMAIL ?? '')

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465, // true for 465, false for other ports
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      tls: {
        rejectUnauthorized: false,
      },
    })

    const subject = `Nota ${numero} emitida — ${valorFormatted}`
    const danfeUrl =
      String(json?.dados?.urlDanfe ?? '').trim() ||
      String(nota?.url_danfe ?? nota?.link_pdf ?? nota?.linkDanfe ?? '').trim() ||
      ''
    let html = `<p>${escapeHtml(message)}</p><p><strong>Chave de acesso:</strong> ${escapeHtml(chave)}</p>`
    if (danfeUrl) {
      html += `<p><a href="${escapeHtml(danfeUrl)}">Download da nota (DANFE)</a></p>`
    }

    const info = await transporter.sendMail({
      from,
      to: toEmail,
      subject,
      html,
    })
    results.email = { ok: true, info }
  } catch (e: any) {
    results.email = { error: String(e) }
  }

  return NextResponse.json({ ok: true, results, commission: commissionResult })
}

