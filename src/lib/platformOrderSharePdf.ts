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

function getFinalY(doc: jsPDF, fallback: number): number {
  const t = doc as jsPDF & { lastAutoTable?: { finalY: number } }
  return t.lastAutoTable?.finalY ?? fallback
}

/** PDF em memória (Buffer) — estrutura tipo ordem de compra: itens, total, parcelas, endereço, status. */
export function renderPlatformOrderPdfBuffer(order: ShareDocumentPayload): Buffer {
  const isProposta = order.documentKind === 'proposta'
  const docTitulo = isProposta ? 'Proposta' : 'Pedido'

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 40
  let y = 48

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(`${docTitulo} nº ${order.numero}`, margin, y)
  y += 22
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(107, 114, 128)
  doc.text(`Emitido em ${order.emitido_em_label}`, margin, y)
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
  y += 12
  doc.text(`Vendedor: ${order.vendedor_label}`, margin, y)
  y += 22

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

  y = getFinalY(doc, y) + 18

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(
    `${isProposta ? 'Total da proposta' : 'Total do pedido'}: ${formatCurrency(Number(order.total) || 0)}`,
    pageW - margin,
    y,
    { align: 'right' }
  )
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  y += 28

  const parcelas = Array.isArray(order.parcelas_resumo) ? order.parcelas_resumo : []
  if (parcelas.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('Parcelas', margin, y)
    y += 10
    const pBody = parcelas.map((p) => [String(p.numero), p.vencimento, formatCurrency(p.valor)])
    autoTable(doc, {
      startY: y,
      head: [['Nº', 'Vencimento', 'Valor']],
      body: pBody,
      styles: { fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 28, halign: 'center' },
        1: { cellWidth: 90 },
        2: { halign: 'right' },
      },
      margin: { left: margin, right: margin },
    })
    y = getFinalY(doc, y) + 20
  }

  const addrTitle = order.endereco_do_cliente ? 'Endereço (cadastro do cliente)' : 'Endereço de entrega'
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(addrTitle, margin, y)
  y += 14
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const addrWrapped = doc.splitTextToSize(order.endereco_exibicao || 'Não informado', pageW - 2 * margin)
  doc.text(addrWrapped, margin, y)
  y += addrWrapped.length * 12 + 16

  doc.setFont('helvetica', 'normal')
  doc.text(statusLabel, margin, y)
  y += 20

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(120, 120, 120)
   doc.setTextColor(0, 0, 0)

  return Buffer.from(doc.output('arraybuffer'))
}
