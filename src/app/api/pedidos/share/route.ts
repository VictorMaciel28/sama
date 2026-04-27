import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import nodemailer from 'nodemailer'
import { authorizeOrder, resolveUserAccess, resolveVendedorNome } from '@/lib/platformOrderAccess'
import { buildShareDocumentPayload } from '@/lib/platformOrderSharePayload'
import { buildOrderShareEmailLikeNfeWebhook } from '@/lib/platformOrderShareEmailHtml'
import { buildMailShareDiagnostics } from '@/lib/mailShareDiagnostics'
import { getInternalSmtpConfig } from '@/lib/internalSmtp'

/** Mesmo transporte que o webhook de NF (`handleAutorizedNfe`). */
function buildInternalMailer(cfg: ReturnType<typeof getInternalSmtpConfig>) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
    tls: {
      rejectUnauthorized: false,
    },
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
    return 'O servidor de email recusou o login (usuário ou senha SMTP incorretos). Verifique SMTP_USER / SMTP_PASS ou MAIL_USERNAME / MAIL_PASSWORD.'
  if (lower.includes('econnrefused') || lower.includes('connect econnrefused'))
    return 'Não foi possível conectar ao servidor SMTP (conexão recusada). Verifique SMTP_HOST / SMTP_PORT ou MAIL_HOST / MAIL_PORT.'
  if (lower.includes('etimedout') || lower.includes('timeout'))
    return 'Tempo esgotado ao contatar o servidor de email. Tente novamente ou verifique a rede/firewall.'
  if (lower.includes('certificate') || lower.includes('ssl') || lower.includes('tls'))
    return 'Falha de segurança TLS/SSL ao conectar ao SMTP. Verifique a porta (587 com STARTTLS é o mais comum).'
  if (lower.includes('spam') || lower.includes('550') || lower.includes('553'))
    return 'O servidor de email recusou o envio para este destinatário (política antispam ou endereço inválido).'
  return `Falha ao enviar pelo SMTP: ${msg}`
}

async function sendOrderEmail(recipient: string, subject: string, htmlBody: string) {
  const cfg = getInternalSmtpConfig()

  const transporter = buildInternalMailer(cfg)

  let info: nodemailer.SentMessageInfo
  try {
    /** Igual ao webhook de NF: só `html`, sem anexos (diagnóstico de entrega). */
    info = await transporter.sendMail({
      from: cfg.from,
      to: recipient,
      subject,
      html: htmlBody,
    })
  } catch (err) {
    const detail = mapSmtpSendError(err)
    console.error('[pedidos/share] sendMail failed', err)
    throw new Error(detail)
  }

  const accepted = Array.isArray(info.accepted) ? info.accepted : []
  const rejected = Array.isArray(info.rejected) ? info.rejected : []

  const env = info.envelope as { from?: string; to?: string[] } | undefined
  console.log('[pedidos/share] nodemailer result', {
    messageId: info.messageId,
    response: info.response,
    accepted,
    rejected,
    pending: info.pending,
    envelope: env,
  })

  return {
    smtp: {
      host: cfg.host,
      port: cfg.port,
      secure: cfg.port === 465,
      user: cfg.user,
      /** Igual ao webhook de NF — sem `verify()` prévio; só o resultado do `sendMail`. */
      verified: false,
      verify_warning: null as string | null,
      verify_attempted: false,
    },
    message: {
      messageId: info.messageId,
      response: info.response,
      accepted,
      rejected,
      pending: info.pending,
      envelope: env,
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
    const vendedorNome = await resolveVendedorNome(orderRow.id_vendedor_externo)

    const payload = await buildShareDocumentPayload(orderRow, vendedorNome)
    const html = buildOrderShareEmailLikeNfeWebhook(payload)
    const valorFormatted = Number(payload.total ?? 0).toFixed(2).replace('.', ',')

    /** Mesmo padrão de assunto da NF: `Nota X emitida — valor` → pedido + valor */
    const subject = `Pedido ${payload.numero} — ${valorFormatted}`.replace(/\s+/g, ' ').trim()

    const mailCfg = getInternalSmtpConfig()
    const result = await sendOrderEmail(email, subject, html)

    const accepted = result.message.accepted || []
    const rejected = result.message.rejected || []
    const hasMessageId = String(result.message.messageId || '').length > 0
    const deliveredOk =
      !recipientRejected(email, rejected) &&
      (recipientAccepted(email, accepted) || (hasMessageId && rejected.length === 0 && accepted.length === 0))

    const diagnostics = buildMailShareDiagnostics({
      recipient: email,
      envelopeFrom: mailCfg.from,
      subject,
      pdfFilename: '(sem anexo — mesmo formato do email de NF)',
      pdfByteLength: 0,
      host: mailCfg.host,
      port: mailCfg.port,
      secure: mailCfg.port === 465,
      authUser: mailCfg.user || null,
      authConfigured: Boolean(mailCfg.pass && mailCfg.user),
      verifyAttempted: Boolean(result.smtp.verify_attempted),
      verifyOk: result.smtp.verified,
      verifyDetail: result.smtp.verify_warning,
      messageId: result.message.messageId,
      serverResponse: result.message.response ?? null,
      accepted: result.message.accepted,
      rejected: result.message.rejected,
      pending: result.message.pending,
      envelope: result.message.envelope,
    })

    console.log('[pedidos/share] diagnostics (dev)', JSON.stringify(diagnostics, null, 2))

    return NextResponse.json({
      ok: deliveredOk,
      numero: payload.numero,
      to: email,
      mail: result,
      diagnostics,
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
        : raw.startsWith('Falha') ||
            raw.startsWith('O servidor') ||
            raw.startsWith('Não foi') ||
            raw.startsWith('MAIL_') ||
            raw.startsWith('Configure')
          ? raw
          : `Não foi possível enviar: ${raw}`
    console.error('[pedidos/share] POST error', error)
    return NextResponse.json({ ok: false, error: human }, { status: 500 })
  }
}
