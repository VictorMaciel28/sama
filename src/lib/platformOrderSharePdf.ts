import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

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

export type PlatformOrderSharePdfInput = {
  numero: number
  data: Date | string
  cliente: string
  cnpj: string
  status: string
  total: unknown
  forma_recebimento?: string | null
  condicao_pagamento?: string | null
  endereco_entrega?: unknown
  products?: Array<{ nome?: string | null; codigo?: string | null; quantidade?: unknown; preco?: unknown }>
}

/** PDF em memória (Buffer), sem Puppeteer nem escrita em disco — compatível com Vercel. */
export function renderPlatformOrderPdfBuffer(order: PlatformOrderSharePdfInput): Buffer {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 40
  let y = 48

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(`Pedido #${order.numero}`, margin, y)
  y += 22
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(107, 114, 128)
  doc.text(`Emitido em ${formatDate(order.data)}`, margin, y)
  doc.setTextColor(0, 0, 0)
  y += 28

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
  doc.text('Total', margin, y)
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
    const quantity = Number(item?.quantidade || 0)
    const price = Number(item?.preco || 0)
    const lineTotal = quantity * price
    return [
      String(item?.nome || '—'),
      String(item?.codigo || '—'),
      String(quantity),
      formatCurrency(price),
      formatCurrency(lineTotal),
    ]
  })

  autoTable(doc, {
    startY: y,
    head: [['Produto', 'Código', 'Qtd', 'Valor unit.', 'Subtotal']],
    body: body.length > 0 ? body : [['Nenhum item registrado', '—', '—', '—', '—']],
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255 },
    margin: { left: margin, right: margin },
  })

  const finalY = getFinalY(doc, y) + 20
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(`Total: ${formatCurrency(Number(order.total) || 0)}`, pageW - margin, finalY, { align: 'right' })

  return Buffer.from(doc.output('arraybuffer'))
}
