import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { EMPRESAS_SUPRIMENTOS, labelEmpresa } from '@/constants/empresas-suprimentos'

export type PurchaseOrderPdfItem = {
  quantidade: string
  valor: string
  produto_codigo: string | null
  produto_nome: string | null
  aliquota_ipi: string | null
  valor_icms: string | null
  informacoes_adicionais: string | null
  product: { code: string; name: string } | null
}

export type PurchaseOrderPdfDetail = {
  id: number
  empresa_id: string
  data: string
  data_prevista: string
  desconto: string
  frete: string
  frete_por_conta: string
  condicao: string | null
  observacoes: string | null
  transportador: string | null
  valor_total: string
  parcelas: unknown
  cliente: { id: number; nome: string; cpf_cnpj?: string | null }
  items: PurchaseOrderPdfItem[]
}

function fmtDate(s: string) {
  return s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—'
}

function fmtMoney(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function lineTotal(it: PurchaseOrderPdfItem): number {
  const q = Number(it.quantidade) || 0
  const vu = Number(it.valor) || 0
  const base = q * vu
  const ipiPct = Number(it.aliquota_ipi) || 0
  const ipi = base * (ipiPct / 100)
  const icms = Number(it.valor_icms) || 0
  return base + ipi + icms
}

function getFinalY(doc: jsPDF, fallback: number): number {
  const t = doc as jsPDF & { lastAutoTable?: { finalY: number } }
  return t.lastAutoTable?.finalY ?? fallback
}

/** Gera e baixa o PDF do pedido de compra no navegador. */
export function downloadPurchaseOrderPdf(detail: PurchaseOrderPdfDetail) {
  const doc = new jsPDF({ format: 'a4', unit: 'mm' })
  const margin = 14
  let y = margin

  const empresa = EMPRESAS_SUPRIMENTOS.find((e) => e.id === detail.empresa_id)

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(`Pedido de compra #${detail.id}`, margin, y)
  doc.setFont('helvetica', 'normal')
  y += 9

  doc.setFontSize(10)
  doc.text(`Comprador: ${empresa?.label ?? labelEmpresa(detail.empresa_id)}`, margin, y)
  y += 5
  doc.text(`CNPJ: ${empresa?.cnpj ?? '—'}`, margin, y)
  y += 7

  doc.text(`Fornecedor: ${detail.cliente?.nome ?? '—'}`, margin, y)
  y += 5
  const docCnpj = detail.cliente?.cpf_cnpj?.trim()
  doc.text(`CNPJ / CPF: ${docCnpj || '—'}`, margin, y)
  y += 7

  doc.text(`Data: ${fmtDate(detail.data)}    Data prevista: ${fmtDate(detail.data_prevista)}`, margin, y)
  y += 8

  if (detail.transportador?.trim()) {
    doc.text(`Transportador: ${detail.transportador.trim()}`, margin, y)
    y += 6
  }

  const body = detail.items.map((it) => {
    const cod = it.product?.code ?? it.produto_codigo ?? '—'
    const nome = it.product?.name ?? it.produto_nome ?? '—'
    const q = Number(it.quantidade) || 0
    const vu = Number(it.valor) || 0
    const tot = lineTotal(it)
    return [String(cod), nome, String(q), fmtMoney(vu), fmtMoney(tot)]
  })

  autoTable(doc, {
    startY: y,
    head: [['Código', 'Produto', 'Qtd', 'Vl. unit.', 'Total linha']],
    body,
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [66, 66, 66] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 78 },
      2: { cellWidth: 18, halign: 'right' },
      3: { cellWidth: 28, halign: 'right' },
      4: { cellWidth: 30, halign: 'right' },
    },
    margin: { left: margin, right: margin },
  })

  y = getFinalY(doc, y + 40) + 8

  doc.setFontSize(10)
  doc.text(
    `Frete: ${fmtMoney(Number(detail.frete))} (${detail.frete_por_conta === 'D' ? 'destinatário' : 'remetente'})`,
    margin,
    y
  )
  y += 5
  doc.text(`Desconto: ${fmtMoney(Number(detail.desconto))}`, margin, y)
  y += 5
  doc.setFont('helvetica', 'bold')
  doc.text(`Total do pedido: ${fmtMoney(Number(detail.valor_total))}`, margin, y)
  doc.setFont('helvetica', 'normal')
  y += 10

  if (detail.condicao?.trim()) {
    doc.setFont('helvetica', 'bold')
    doc.text('Condição de pagamento', margin, y)
    doc.setFont('helvetica', 'normal')
    y += 5
    const lines = doc.splitTextToSize(detail.condicao.trim(), 182)
    doc.text(lines, margin, y)
    y += lines.length * 4.5 + 6
  }

  const parcelas = Array.isArray(detail.parcelas) ? detail.parcelas : []
  if (parcelas.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.text('Parcelas', margin, y)
    doc.setFont('helvetica', 'normal')
    y += 5

    const pBody = parcelas.map((p: Record<string, unknown>) => {
      const dv = p.dataVencimento
      const dvStr =
        typeof dv === 'string' && dv.length >= 10
          ? dv.slice(0, 10).split('-').reverse().join('/')
          : '—'
      return [
        String(p.dias ?? ''),
        dvStr,
        fmtMoney(Number(p.valor)),
        String(p.meioPagamento ?? '—'),
      ]
    })

    autoTable(doc, {
      startY: y,
      head: [['Dias', 'Vencimento', 'Valor', 'Meio pgto (cód.)']],
      body: pBody,
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [66, 66, 66] },
      margin: { left: margin, right: margin },
    })
    y = getFinalY(doc, y + 30) + 8
  }

  if (detail.observacoes?.trim()) {
    doc.setFont('helvetica', 'bold')
    doc.text('Observações', margin, y)
    doc.setFont('helvetica', 'normal')
    y += 5
    const obsLines = doc.splitTextToSize(detail.observacoes.trim(), 182)
    doc.text(obsLines, margin, y)
  }

  doc.save(`pedido-compra-${detail.id}.pdf`)
}
