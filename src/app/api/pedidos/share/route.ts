import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import nodemailer from 'nodemailer'
import { renderPlatformOrderPdfBuffer } from '@/lib/platformOrderSharePdf'
import { buildShareDocumentPayload } from '@/lib/platformOrderSharePayload'
import { buildOrderShareEmailHtml } from '@/lib/platformOrderShareEmailHtml'

type UserAccess = {
  vendorId: string | null
  isAdmin: boolean
  isSupervisor: boolean
}

const SMTP_DEFAULTS = {
  host: 'br590.hostgator.com.br',
  port: 587,
  user: 'sama@aliancamercantil.com',
  from: 'sama@aliancamercantil.com',
}

const MAIL_CONFIG = {
  host: process.env.MAIL_HOST || SMTP_DEFAULTS.host,
  port: Number(process.env.MAIL_PORT || SMTP_DEFAULTS.port),
  user: process.env.MAIL_USERNAME || process.env.MAIL_USER || SMTP_DEFAULTS.user,
  pass: process.env.MAIL_PASSWORD || process.env.MAIL_PASS || '',
  from: process.env.MAIL_FROM || process.env.EMAIL_FROM || SMTP_DEFAULTS.from,
}

async function resolveUserAccess(userEmail: string | null): Promise<UserAccess> {
  let vendorId: string | null = null
  let isAdmin = false
  let isSupervisor = false
  if (userEmail) {
    const vendRecord = await prisma.vendedor.findFirst({ where: { email: userEmail } })
    vendorId = vendRecord?.id_vendedor_externo ?? null
    if (vendRecord?.id_vendedor_externo) {
      const nivel = await prisma.vendedor_nivel_acesso
        .findUnique({ where: { id_vendedor_externo: vendRecord.id_vendedor_externo } })
        .catch(() => null)
      if (nivel?.nivel === 'ADMINISTRADOR') isAdmin = true
      if (nivel?.nivel === 'SUPERVISOR') isSupervisor = true
    }
  }
  return { vendorId, isAdmin, isSupervisor }
}

async function loadOrder(numero: number) {
  return prisma.platform_order.findUnique({
    where: { numero },
    include: {
      cliente_rel: true,
      products: {
        orderBy: { id: 'asc' },
      },
    },
  })
}

async function authorizeOrder(numero: number, userAccess: UserAccess) {
  const { vendorId, isAdmin, isSupervisor } = userAccess
  const order = await loadOrder(numero)
  if (!order) throw new Error('pedido_nao_encontrado')

  if (isAdmin) return order

  if (isSupervisor && vendorId) {
    const sup = await prisma.supervisor.findUnique({
      where: { id_vendedor_externo: vendorId },
      select: { id: true },
    })
    const links = sup
      ? await prisma.supervisor_vendor_links.findMany({
          where: { supervisor_id: sup.id },
          select: { vendedor_externo: true },
        })
      : []
    const allowed = new Set<string>()
    allowed.add(vendorId)
    links.forEach((link) => {
      if (link.vendedor_externo) allowed.add(link.vendedor_externo)
    })
    const rowVendor = order.id_vendedor_externo
    const clientVendor = order.client_vendor_externo
    if ((rowVendor && allowed.has(rowVendor)) || (clientVendor && allowed.has(clientVendor))) {
      return order
    }
    throw new Error('pedido_nao_encontrado')
  }

  if (!vendorId) throw new Error('pedido_nao_encontrado')
  if (order.id_vendedor_externo === vendorId || order.client_vendor_externo === vendorId) {
    return order
  }
  throw new Error('pedido_nao_encontrado')
}

function buildMailer() {
  return nodemailer.createTransport({
    host: MAIL_CONFIG.host,
    port: MAIL_CONFIG.port,
    secure: MAIL_CONFIG.port === 465,
    auth: MAIL_CONFIG.user && MAIL_CONFIG.pass ? { user: MAIL_CONFIG.user, pass: MAIL_CONFIG.pass } : undefined,
    tls: {
      rejectUnauthorized: false,
    },
    requireTLS: MAIL_CONFIG.port === 587,
  })
}

function normalizeAddr(a: string) {
  return String(a || '').trim().toLowerCase()
}

function recipientAccepted(recipient: string, accepted: unknown[]): boolean {
  const want = normalizeAddr(recipient)
  if (!want) return false
  return (accepted || []).some((a) => normalizeAddr(String(a)) === want)
}

function recipientRejected(recipient: string, rejected: unknown[]): boolean {
  const want = normalizeAddr(recipient)
  return (rejected || []).some((a) => normalizeAddr(String(a)) === want)
}

function mapSmtpSendError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  if (lower.includes('invalid login') || lower.includes('authentication failed') || lower.includes('535'))
    return 'O servidor de email recusou o login (usuário ou senha SMTP incorretos). Verifique MAIL_USERNAME e MAIL_PASSWORD no ambiente.'
  if (lower.includes('econnrefused') || lower.includes('connect econnrefused'))
    return 'Não foi possível conectar ao servidor SMTP (conexão recusada). Verifique MAIL_HOST e MAIL_PORT.'
  if (lower.includes('etimedout') || lower.includes('timeout'))
    return 'Tempo esgotado ao contatar o servidor de email. Tente novamente ou verifique a rede/firewall.'
  if (lower.includes('certificate') || lower.includes('ssl') || lower.includes('tls'))
    return 'Falha de segurança TLS/SSL ao conectar ao SMTP. Verifique MAIL_PORT (587 com STARTTLS é o mais comum).'
  if (lower.includes('spam') || lower.includes('550') || lower.includes('553'))
    return 'O servidor de email recusou o envio para este destinatário (política antispam ou endereço inválido).'
  return `Falha ao enviar pelo SMTP: ${msg}`
}

function mapVerifyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return `Verificação SMTP falhou: ${msg}`
}

async function sendOrderEmail(recipient: string, subject: string, pdf: Buffer, htmlBody: string, pdfFilename: string) {
  if (!MAIL_CONFIG.pass && MAIL_CONFIG.user) {
    throw new Error('MAIL_PASSWORD não configurada no servidor — não é possível enviar email.')
  }

  const transporter = buildMailer()
  let smtpVerified = false
  let smtpVerifyError: string | null = null
  try {
    await transporter.verify()
    smtpVerified = true
  } catch (err) {
    smtpVerifyError = mapVerifyError(err)
    console.warn('[pedidos/share] SMTP verify failed', err)
  }

  let info: nodemailer.SentMessageInfo
  try {
    info = await transporter.sendMail({
      from: MAIL_CONFIG.from || MAIL_CONFIG.user,
      to: recipient,
      subject,
      text: `Pedido — mesmas informações do PDF anexo.\n\nAssunto: ${subject}\nConfira o arquivo PDF em anexo.`,
      html: htmlBody,
      attachments: [
        {
          filename: pdfFilename,
          content: pdf,
        },
      ],
    })
  } catch (err) {
    const detail = mapSmtpSendError(err)
    console.error('[pedidos/share] sendMail failed', err)
    throw new Error(detail)
  }

  const accepted = Array.isArray(info.accepted) ? info.accepted : []
  const rejected = Array.isArray(info.rejected) ? info.rejected : []

  console.log('[pedidos/share] delivered', {
    messageId: info.messageId,
    response: info.response,
    accepted,
    rejected,
  })

  return {
    smtp: {
      host: MAIL_CONFIG.host,
      port: MAIL_CONFIG.port,
      secure: MAIL_CONFIG.port === 465,
      user: MAIL_CONFIG.user,
      verified: smtpVerified,
      verify_warning: smtpVerifyError,
    },
    message: {
      messageId: info.messageId,
      response: info.response,
      accepted,
      rejected,
    },
  }
}

export async function POST(req: Request) {
  try {
    const session = (await getServerSession(options as any)) as any
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const numero = Number(body?.numero || 0)
    const email = (body?.email || '').toString().trim()
    if (!numero) {
      return NextResponse.json({ ok: false, error: 'Informe o número do pedido.' }, { status: 400 })
    }
    if (!email) {
      return NextResponse.json({ ok: false, error: 'Informe o email do destinatário.' }, { status: 400 })
    }

    const userAccess = await resolveUserAccess(session.user.email || null)
    const orderRow = await authorizeOrder(numero, userAccess)

    let vendedorNome: string | null = null
    if (orderRow.id_vendedor_externo) {
      const v = await prisma.vendedor.findFirst({
        where: { id_vendedor_externo: orderRow.id_vendedor_externo },
        select: { nome: true },
      })
      vendedorNome = v?.nome?.trim() || null
    }

    const payload = buildShareDocumentPayload(orderRow, vendedorNome)
    const html = buildOrderShareEmailHtml(payload)
    const pdf = renderPlatformOrderPdfBuffer(payload)

    const subject = `Pedido nº ${payload.numero} — ${payload.cliente}`
    const pdfFilename = `pedido-${payload.numero}.pdf`

    const result = await sendOrderEmail(email, subject, pdf, html, pdfFilename)

  const accepted = result.message.accepted || []
  const rejected = result.message.rejected || []
  const hasMessageId = String(result.message.messageId || '').length > 0
  const deliveredOk =
    !recipientRejected(email, rejected) &&
    (recipientAccepted(email, accepted) || (hasMessageId && rejected.length === 0 && accepted.length === 0))

    let warning: string | undefined
    if (!result.smtp.verified && result.smtp.verify_warning) {
      warning =
        'O envio foi tentado, mas a verificação prévia do SMTP falhou; se o email não chegar, revise MAIL_HOST e credenciais. Detalhes técnicos no campo mail.smtp.verify_warning.'
    }

    return NextResponse.json({
      ok: deliveredOk,
      numero: payload.numero,
      to: email,
      mail: result,
      warning,
      userHint: deliveredOk
        ? `Mensagem aceita pelo servidor SMTP para ${email}. Verifique também a caixa de spam.`
        : rejected.length
          ? `O servidor SMTP não aceitou o envio para este endereço (rejeitado: ${rejected.join(', ') || '—'}).`
          : `Resposta ambígua do SMTP — accepted: ${accepted.join(', ') || '—'}. Confira spam ou credenciais.`,
    })
  } catch (error: any) {
    const raw = error?.message || 'erro_ao_enviar_email'
    const human =
      raw === 'pedido_nao_encontrado'
        ? 'Pedido não encontrado ou sem permissão.'
        : raw.startsWith('Falha') || raw.startsWith('O servidor') || raw.startsWith('Não foi') || raw.startsWith('MAIL_')
          ? raw
          : `Não foi possível enviar: ${raw}`
    console.error('[pedidos/share] POST error', error)
    return NextResponse.json({ ok: false, error: human }, { status: 500 })
  }
}
