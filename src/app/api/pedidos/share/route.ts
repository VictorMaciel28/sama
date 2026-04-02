import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import nodemailer from 'nodemailer'
import { renderPlatformOrderPdfBuffer } from '@/lib/platformOrderSharePdf'

type UserAccess = {
  vendorId: string | null
  isAdmin: boolean
  isSupervisor: boolean
}

const STATUS_LABELS: Record<string, string> = {
  PROPOSTA: 'Proposta',
  APROVADO: 'Aprovado',
  PENDENTE: 'Pendente',
  CANCELADO: 'Cancelado',
  FATURADO: 'Faturado',
  ENVIADO: 'Enviado',
  ENTREGUE: 'Entregue',
  DADOS_INCOMPLETOS: 'Dados incompletos',
}

const SMTP_DEFAULTS = {
  host: 'br590.hostgator.com.br',
  port: 587,
  user: 'sama@aliancamercantil.com',
  pass: 'sama@aliancamercantil.com',
  from: 'sama@aliancamercantil.com',
}

const MAIL_CONFIG = {
  host: process.env.MAIL_HOST || SMTP_DEFAULTS.host,
  port: Number(process.env.MAIL_PORT || SMTP_DEFAULTS.port),
  user: process.env.MAIL_USERNAME || process.env.MAIL_USER || SMTP_DEFAULTS.user,
  pass: process.env.MAIL_PASSWORD || process.env.MAIL_PASS || SMTP_DEFAULTS.pass,
  from: process.env.MAIL_FROM || process.env.EMAIL_FROM || SMTP_DEFAULTS.from,
  secure: (process.env.MAIL_SECURE || 'false').toLowerCase() === 'true',
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

function formatCurrency(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(value: Date | string) {
  try {
    const date = typeof value === 'string' ? new Date(value) : value
    return date.toLocaleDateString('pt-BR')
  } catch {
    return ''
  }
}

function buildOrderSummaryHtml(order: any) {
  const statusLabel = STATUS_LABELS[String(order.status)] || String(order.status || '')
  const clientEmail = order.cliente_rel?.email || ''
  const delivery = order.endereco_entrega || {}
  const items = Array.isArray(order.products) ? order.products : []
  const rows = items
    .map((item) => {
      const quantity = Number(item?.quantidade || 0)
      const price = Number(item?.preco || 0)
      const total = quantity * price
      return `
        <tr>
          <td>${item?.nome || '—'}</td>
          <td>${item?.codigo || '—'}</td>
          <td>${quantity}</td>
          <td>${formatCurrency(price)}</td>
          <td>${formatCurrency(total)}</td>
        </tr>
      `
    })
    .join('')

  const addressLines = [
    delivery.endereco,
    delivery.numero,
    delivery.complemento,
    delivery.bairro,
    delivery.cidade,
    delivery.uf,
    delivery.cep,
  ]
    .filter(Boolean)
    .join(' · ')

  return `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Pedido ${order.numero}</title>
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; background: #f5f7fb; }
        .page { width: 100%; max-width: 920px; margin: 0 auto; padding: 32px; }
        .card { background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 12px 32px rgba(15,23,42,.08); }
        h1 { margin: 0 0 8px; font-size: 28px; }
        .muted { color: #6b7280; font-size: 14px; }
        .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 24px; }
        .box { padding: 16px; border: 1px solid #e5e7eb; border-radius: 10px; }
        table { width: 100%; border-collapse: collapse; margin-top: 24px; }
        th, td { padding: 12px 8px; text-align: left; border-bottom: 1px solid #e5e7eb; }
        th { font-weight: 600; color: #111827; }
        tfoot td { border: none; }
        .text-right { text-align: right; }
        .small { font-size: 12px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="card">
          <div>
            <h1>Pedido #{order.numero}</h1>
            <div class="muted">Emitido em ${formatDate(order.data)}</div>
          </div>
          <div class="grid">
            <div class="box">
              <strong>Cliente</strong>
              <div>${order.cliente}</div>
              <div class="small">${order.cnpj}</div>
              ${clientEmail ? `<div class="small">Email: ${clientEmail}</div>` : ''}
            </div>
            <div class="box">
              <strong>Status</strong>
              <div>${statusLabel}</div>
              <div class="small">Forma de recebimento: ${order.forma_recebimento || '—'}</div>
              <div class="small">Condição de pagamento: ${order.condicao_pagamento || '—'}</div>
            </div>
          </div>
          <div class="grid" style="margin-top: 16px;">
            <div class="box">
              <strong>Endereço de entrega</strong>
              <div>${addressLines || 'Não informado'}</div>
            </div>
            <div class="box">
              <strong>Total</strong>
              <div style="font-size: 24px; font-weight: 700;">${formatCurrency(Number(order.total) || 0)}</div>
            </div>
          </div>
          <div>
            <h2 style="margin-top: 32px; margin-bottom: 16px;">Itens</h2>
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Código</th>
                  <th>Qtd</th>
                  <th class="text-right">Valor unit.</th>
                  <th class="text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${rows || '<tr><td colspan="5" class="muted text-right">Nenhum item registrado</td></tr>'}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="4" class="text-right"><strong>Total</strong></td>
                  <td class="text-right"><strong>${formatCurrency(Number(order.total) || 0)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </body>
  </html>
  `
}

function buildMailer() {
  return nodemailer.createTransport({
    host: MAIL_CONFIG.host,
    port: MAIL_CONFIG.port,
    secure: MAIL_CONFIG.port === 465,
    auth: {
      user: MAIL_CONFIG.user,
      pass: MAIL_CONFIG.pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
  })
}

async function sendOrderEmail(recipient: string, order: any, pdf: Buffer, htmlBody: string) {
  const transporter = buildMailer()
  const subject = `Pedido #${order.numero} - ${order.cliente}`
  const text = `Segue em anexo o resumo do pedido ${order.numero} de ${order.cliente}.`
  try {
    await transporter.verify()
    console.log(
      '[sendOrderEmail] SMTP verified',
      MAIL_CONFIG.host,
      MAIL_CONFIG.port,
      `user=${MAIL_CONFIG.user}`
    )
  } catch (err) {
    console.warn('[sendOrderEmail] SMTP verify failed', err)
  }

  const info = await transporter.sendMail({
    from: MAIL_CONFIG.from || MAIL_CONFIG.user,
    to: recipient,
    subject,
    text,
    html: htmlBody,
    attachments: [
      {
        filename: `pedido-${order.numero}.pdf`,
        content: pdf,
      },
    ],
  })
  console.log('[sendOrderEmail] delivered', {
    numero: order.numero,
    to: recipient,
    messageId: info.messageId,
    response: info.response,
    accepted: info.accepted,
    rejected: info.rejected,
  })
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
      return NextResponse.json({ ok: false, error: 'numero_obrigatorio' }, { status: 400 })
    }
    if (!email) {
      return NextResponse.json({ ok: false, error: 'email_obrigatorio' }, { status: 400 })
    }

    const userAccess = await resolveUserAccess(session.user.email || null)
    const order = await authorizeOrder(numero, userAccess)
    const html = buildOrderSummaryHtml(order)
    const pdf = renderPlatformOrderPdfBuffer(order)
    await sendOrderEmail(email, order, pdf, html)

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    const message = error?.message || 'erro_ao_enviar_email'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
