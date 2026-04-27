import type { ShareDocumentPayload } from '@/lib/platformOrderSharePayload'

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

/** Corpo HTML alinhado ao PDF anexo (mesmos campos, tabela com unidade, sem colunas de impostos). */
export function buildOrderShareEmailHtml(order: ShareDocumentPayload): string {
  const statusLabel = STATUS_LABELS[String(order.status)] || String(order.status || '')
  const clientEmail = order.cliente_email || ''
  const delivery = (order.endereco_entrega || {}) as Record<string, unknown>
  const items = Array.isArray(order.products) ? order.products : []
  const rows = items
    .map((item) => {
      return `
        <tr>
          <td>${escapeHtml(item.nome)}</td>
          <td>${escapeHtml(item.codigo)}</td>
          <td style="text-align:right">${item.quantidade}</td>
          <td>${escapeHtml(item.unidade)}</td>
          <td style="text-align:right">${formatCurrency(item.preco)}</td>
          <td style="text-align:right"><strong>${formatCurrency(item.subtotal)}</strong></td>
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

  const metaLine: string[] = []
  if (order.sistema_origem) metaLine.push(`Origem: ${escapeHtml(String(order.sistema_origem).toUpperCase())}`)
  if (order.tiny_id) metaLine.push(`Pedido Tiny: ${order.tiny_id}`)
  if (order.nf_referencia) metaLine.push(`Ref. NF: ${escapeHtml(order.nf_referencia)}`)

  return `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Pedido ${order.numero}</title>
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; font-family: 'Segoe UI', system-ui, sans-serif; background: #f5f7fb; color: #111827; }
        .page { width: 100%; max-width: 920px; margin: 0 auto; padding: 28px 16px; }
        .card { background: #fff; border-radius: 12px; padding: 28px 24px; box-shadow: 0 12px 32px rgba(15,23,42,.08); }
        h1 { margin: 0 0 6px; font-size: 26px; }
        .muted { color: #6b7280; font-size: 13px; }
        .meta { font-size: 12px; color: #64748b; margin-top: 8px; }
        .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 20px; }
        @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
        .box { padding: 14px; border: 1px solid #e5e7eb; border-radius: 10px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
        th, td { padding: 10px 8px; text-align: left; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
        th { font-weight: 600; background: #0f172a; color: #fff; }
        th:first-child { border-radius: 8px 0 0 0; }
        th:last-child { border-radius: 0 8px 0 0; }
        tfoot td { border: none; }
        .text-right { text-align: right; }
        .small { font-size: 11px; color: #6b7280; }
        .footnote { margin-top: 18px; font-size: 11px; color: #64748b; line-height: 1.45; }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="card">
          <div>
            <h1>Pedido nº ${order.numero}</h1>
            <div class="muted">Emitido em ${formatDate(order.data)}</div>
            ${metaLine.length ? `<div class="meta">${metaLine.join(' · ')}</div>` : ''}
          </div>
          <div class="grid">
            <div class="box">
              <strong>Cliente</strong>
              <div>${escapeHtml(order.cliente)}</div>
              <div class="small">${escapeHtml(order.cnpj)}</div>
              ${clientEmail ? `<div class="small">Email: ${escapeHtml(clientEmail)}</div>` : ''}
              <div class="small" style="margin-top:8px"><strong>Vendedor:</strong> ${escapeHtml(order.vendedor_label)}</div>
            </div>
            <div class="box">
              <strong>Status</strong>
              <div>${escapeHtml(statusLabel)}</div>
              <div class="small">Forma de recebimento: ${escapeHtml(order.forma_recebimento || '—')}</div>
              <div class="small">Condição de pagamento: ${escapeHtml(order.condicao_pagamento || '—')}</div>
            </div>
          </div>
          <div class="grid" style="margin-top: 14px;">
            <div class="box">
              <strong>Endereço de entrega</strong>
              <div>${escapeHtml(addressLines || 'Não informado')}</div>
            </div>
            <div class="box">
              <strong>Total do pedido</strong>
              <div style="font-size: 22px; font-weight: 700; margin-top: 4px;">${formatCurrency(Number(order.total) || 0)}</div>
              <div class="small">Mesmo valor do PDF anexo (sem discriminação de impostos).</div>
            </div>
          </div>
          <div>
            <h2 style="margin-top: 28px; margin-bottom: 12px; font-size: 17px;">Itens</h2>
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Código</th>
                  <th class="text-right">Qtd</th>
                  <th>Un.</th>
                  <th class="text-right">Vl. unit.</th>
                  <th class="text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${rows || '<tr><td colspan="6" class="muted text-right">Nenhum item registrado</td></tr>'}
              </tbody>
              <tfoot>
                <tr>
                  <td colspan="5" class="text-right"><strong>Total</strong></td>
                  <td class="text-right"><strong>${formatCurrency(Number(order.total) || 0)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p class="footnote">
            Este resumo replica os dados do pedido na plataforma (produto, quantidades, preços e total).
            Não há discriminação de impostos por item; o valor total corresponde ao cadastro do pedido.
          </p>
        </div>
      </div>
    </body>
  </html>
  `
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
