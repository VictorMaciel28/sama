import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
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

function getFinalY(doc: jsPDF, fallback: number): number {
  const t = doc as jsPDF & { lastAutoTable?: { finalY: number } }
  return t.lastAutoTable?.finalY ?? fallback
}

/** PDF em memória (Buffer), sem Puppeteer — mesmo conteúdo base do email HTML. Valores líquidos de produto/qtd × preço e total do pedido (sem discriminação de impostos). */
export function renderPlatformOrderPdfBuffer(order: ShareDocumentPayload): Buffer {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 40
  let y = 48

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(`Pedido nº ${order.numero}`, margin, y)
  y += 22
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(107, 114, 128)
  doc.text(`Emitido em ${formatDate(order.data)}`, margin, y)
  doc.setTextColor(0, 0, 0)
  y += 18

  const meta: string[] = []
  if (order.sistema_origem) meta.push(`Origem: ${String(order.sistema_origem).toUpperCase()}`)
  if (order.tiny_id) meta.push(`Pedido Tiny: ${order.tiny_id}`)
  if (order.nf_referencia) meta.push(`Ref. NF: ${order.nf_referencia}`)
  if (meta.length) {
    doc.setFontSize(9)
    doc.setTextColor(75, 85, 99)
    doc.text(meta.join('   ·   '), margin, y)
    doc.setTextColor(0, 0, 0)
    y += 16
  } else {
    y += 10
  }

  const statusLabel = STATUS_LABELS[String(order.status)] || String(order.status || '')

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Cliente', margin, y)
  y += 14
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(String(order.cliente || ''), margin, y)
  y += 12
  doc.text(String(order.cnpj || ''), margin, y)
  y += 12
  doc.text(`Vendedor: ${order.vendedor_label}`, margin, y)
  y += 20

  doc.setFont('helvetica', 'bold')
  doc.text('Status', margin, y)
  y += 14
  doc.setFont('helvetica', 'normal')
  doc.text(statusLabel, margin, y)
  y += 12
  doc.text(`Forma de recebimento: ${order.forma_recebimento || '—'}`, margin, y)
  y += 12
  doc.text(`Condição de pagamento: ${order.condicao_pagamento || '—'}`, margin, y)
  y += 20

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
    .filter((x) => x != null && String(x).trim() !== '')
    .map((x) => String(x))
    .join(' · ')

  doc.setFont('helvetica', 'bold')
  doc.text('Endereço de entrega', margin, y)
  y += 14
  doc.setFont('helvetica', 'normal')
  const addrWrapped = doc.splitTextToSize(addressLines || 'Não informado', pageW - 2 * margin)
  doc.text(addrWrapped, margin, y)
  y += addrWrapped.length * 12 + 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Total do pedido', margin, y)
  y += 18
  doc.setFontSize(18)
  doc.text(formatCurrency(Number(order.total) || 0), margin, y)
  doc.setFontSize(10)
  y += 28

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Itens', margin, y)
  y += 12

  const items = Array.isArray(order.products) ? order.products : []
  const body = items.map((item) => {
    return [
      item.nome,
      item.codigo,
      String(item.quantidade),
      item.unidade,
      formatCurrency(item.preco),
      formatCurrency(item.subtotal),
    ]
  })

  autoTable(doc, {
    startY: y,
    head: [['Produto', 'Código', 'Qtd', 'Un.', 'Vl. unit.', 'Subtotal']],
    body:
      body.length > 0
        ? body
        : [['Nenhum item registrado', '—', '—', '—', '—', '—']],
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    margin: { left: margin, right: margin },
  })

  const finalY = getFinalY(doc, y) + 14
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(120, 120, 120)
  doc.text(
    'Totais conforme cadastro do pedido na plataforma (sem discriminação de impostos por item).',
    margin,
    finalY
  )
  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(`Total: ${formatCurrency(Number(order.total) || 0)}`, pageW - margin, finalY + 18, { align: 'right' })

  return Buffer.from(doc.output('arraybuffer'))
}
