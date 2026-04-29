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

/**
 * Corpo HTML do “Compartilhar pedido”: parágrafos `<p>` + `<strong>` (sem anexo).
 */
export function buildOrderShareEmailLikeNfeWebhook(order: ShareDocumentPayload): string {
  const valor = Number(order.total ?? 0)
  const valorFormatted = valor.toFixed(2).replace('.', ',')
  const destine = order.cliente
  const formaPagamento = String(order.condicao_pagamento || order.forma_recebimento || '-').trim()
  const message = `Pedido ${order.numero} para ${destine} com forma de pagamento ${formaPagamento} no valor de R$ ${valorFormatted}.`

  let html = `<p>${escapeHtml(message)}</p>`
  html += `<p><strong>CNPJ:</strong> ${escapeHtml(order.cnpj || '—')}</p>`
  const statusLabel = STATUS_LABELS[String(order.status)] || String(order.status || '')
  html += `<p style="font-size:12px;color:#555">${escapeHtml(statusLabel)} · ${escapeHtml(order.vendedor_label)} · emitido em ${escapeHtml(order.emitido_em_label)}</p>`
  return html
}

/**
 * HTML mínimo (parágrafos simples, sem tabelas) + lembrete de anexo.
 */
export function buildOrderShareEmailMinimalHtml(order: ShareDocumentPayload): string {
  const total = Number(order.total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const statusLabel = STATUS_LABELS[String(order.status)] || String(order.status || '')
  const msg = `Pedido ${order.numero} para ${order.cliente} (${statusLabel}) — total ${total}. Detalhes completos no arquivo PDF anexo.`
  const sub = `Emitido em ${order.emitido_em_label} · Vendedor: ${order.vendedor_label}`
  return `<p>${escapeHtml(msg)}</p><p style="font-size:12px;color:#555">${escapeHtml(sub)}</p>`
}

/** Texto puro (opcional / alternativa MIME). */
export function buildOrderShareEmailText(order: ShareDocumentPayload): string {
  const statusLabel = STATUS_LABELS[String(order.status)] || String(order.status || '')
  const delivery = (order.endereco_entrega || {}) as Record<string, unknown>
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

  const lines: string[] = []
  lines.push(`Pedido nº ${order.numero}`)
  lines.push(`Emitido em ${order.emitido_em_label}`)
  lines.push('')
  lines.push(`Cliente: ${order.cliente}`)
  lines.push(`CNPJ: ${order.cnpj}`)
  if (order.cliente_email) lines.push(`Email cliente: ${order.cliente_email}`)
  lines.push(`Vendedor: ${order.vendedor_label}`)
  lines.push(`Status: ${statusLabel}`)
  lines.push(`Forma recebimento: ${order.forma_recebimento || '-'}`)
  lines.push(`Condicao pagamento: ${order.condicao_pagamento || '-'}`)
  lines.push('')
  lines.push(`Endereco entrega: ${addressLines || 'Nao informado'}`)
  lines.push('')
  lines.push(`TOTAL: ${formatCurrency(Number(order.total) || 0)}`)
  lines.push('')
  lines.push('--- ITENS ---')
  const items = Array.isArray(order.products) ? order.products : []
  if (items.length === 0) lines.push('(nenhum item)')
  else {
    items.forEach((item, i) => {
      lines.push(
        `${i + 1}. ${item.nome} | cod ${item.codigo} | ${item.quantidade} ${item.unidade} x ${formatCurrency(item.preco)} = ${formatCurrency(item.subtotal)}`
      )
    })
  }
  lines.push('')
  lines.push('Detalhes completos no arquivo PDF anexo.')

  return lines.join('\r\n')
}

/**
 * HTML com tabela de itens (mais pesado). Preferir `buildOrderShareEmailMinimalHtml` para mensagens curtas.
 */
export function buildOrderShareEmailHtml(order: ShareDocumentPayload): string {
  const statusLabel = STATUS_LABELS[String(order.status)] || String(order.status || '')
  const clientEmail = order.cliente_email || ''
  const delivery = (order.endereco_entrega || {}) as Record<string, unknown>
  const items = Array.isArray(order.products) ? order.products : []

  const rowHtml = items
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.nome)}</td><td>${escapeHtml(item.codigo)}</td>` +
          `<td align="right">${item.quantidade}</td><td>${escapeHtml(item.unidade)}</td>` +
          `<td align="right">${formatCurrency(item.preco)}</td><td align="right">${formatCurrency(item.subtotal)}</td></tr>`
    )
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

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pedido ${order.numero}</title>
</head>
<body style="margin:12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45;color:#111">
<h1 style="font-size:18px;margin:0 0 8px;">Pedido n&#186; ${order.numero}</h1>
<p style="margin:0 0 12px;color:#444;font-size:13px">Emitido em ${escapeHtml(order.emitido_em_label)}</p>
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;border:1px solid #ddd;border-radius:4px;padding:12px;margin-bottom:12px">
<tr><td><strong>Cliente</strong><br>${escapeHtml(order.cliente)}<br><span style="font-size:12px;color:#555">${escapeHtml(order.cnpj)}</span>
${clientEmail ? `<br><span style="font-size:12px">Email: ${escapeHtml(clientEmail)}</span>` : ''}
<br><span style="font-size:12px"><strong>Vendedor:</strong> ${escapeHtml(order.vendedor_label)}</span></td></tr>
<tr><td style="padding-top:10px"><strong>Status</strong> ${escapeHtml(statusLabel)} · Receb.: ${escapeHtml(order.forma_recebimento || '-')} · Pag.: ${escapeHtml(order.condicao_pagamento || '-')}</td></tr>
<tr><td style="padding-top:10px"><strong>Entrega</strong><br><span style="font-size:13px">${escapeHtml(addressLines || 'Nao informado')}</span></td></tr>
<tr><td style="padding-top:12px;font-size:18px"><strong>Total ${formatCurrency(Number(order.total) || 0)}</strong></td></tr>
</table>
<p style="font-size:13px;margin:12px 0 6px"><strong>Itens</strong></p>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:13px;max-width:100%">
<thead><tr style="background:#f3f4f6">
<th align="left">Produto</th><th>Codigo</th><th align="right">Qtd</th><th>Un.</th><th align="right">Vl.unit.</th><th align="right">Subtotal</th>
</tr></thead>
<tbody>
${rowHtml || '<tr><td colspan="6">Nenhum item</td></tr>'}
</tbody>
</table>
<p style="font-size:11px;color:#666;margin-top:14px">Resumo conforme cadastro na plataforma. Sem discriminacao de impostos por item. PDF anexo com o mesmo conteudo.</p>
</body>
</html>`
}

export function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
