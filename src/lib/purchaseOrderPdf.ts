import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  EMPRESA_IDS_LOGO_ALIANCA_PDF,
  EMPRESAS_SUPRIMENTOS,
  labelEmpresa,
} from '@/constants/empresas-suprimentos'
import { formatCnpjDisplay } from '@/lib/cnpjFormat'
import { parcelasFromCondicaoText } from '@/lib/suprimentosParcelas'

/** #122c4f — barras de cabeçalho das tabelas */
const TABLE_HEAD_COLOR: [number, number, number] = [18, 44, 79]

/** Logos em `public/` (mesmos arquivos que em `src/assets/images/*-sem-fundo.png`). */
const LOGO_URL_ALIANCA = '/alianca-logo-sem-fundo.png'
const LOGO_URL_OUTRAS = '/casa-dos-parafusos-verde-sem-fundo.png'

async function fetchDataUrl(url: string): Promise<string> {
  const res = await fetch(url)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(new Error('leitura da logo'))
    r.readAsDataURL(blob)
  })
}

/** Largura ÷ altura para posicionar a logo no PDF sem distorcer. */
function aspectRatioFromDataUrl(dataUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      resolve(1)
      return
    }
    const img = new Image()
    img.onload = () => {
      const h = Math.max(1, img.naturalHeight)
      resolve(img.naturalWidth / h)
    }
    img.onerror = () => reject(new Error('logo'))
    img.src = dataUrl
  })
}

export type PurchaseOrderPdfItem = {
  quantidade: string
  valor: string
  produto_codigo: string | null
  produto_nome: string | null
  aliquota_ipi: string | null
  valor_icms: string | null
  /** ICMS ST (substituição tributária), valor em R$ por linha. */
  valor_st: string | null
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

export type PurchaseOrderPdfOptions = {
  /** Converte código numérico do meio de pagamento em nome legível (sem exibir o código). */
  meioPagamentoLabel?: (code: number) => string
}

function fmtDate(s: string) {
  return s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—'
}

function fmtMoney(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtPct(n: number): string {
  if (n == null || !Number.isFinite(n) || n === 0) return '—'
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 })}%`
}

/** Valor da mercadoria na linha (q × unitário), sem impostos. */
function lineBase(it: PurchaseOrderPdfItem): number {
  const q = Number(it.quantidade) || 0
  const vu = Number(it.valor) || 0
  return q * vu
}

/** Valor do IPI na linha (% sobre a base). */
function lineIpiValue(it: PurchaseOrderPdfItem): number {
  const base = lineBase(it)
  const ipiPct = Number(it.aliquota_ipi) || 0
  return base * (ipiPct / 100)
}

function lineTotal(it: PurchaseOrderPdfItem): number {
  return (
    lineBase(it) +
    lineIpiValue(it) +
    (Number(it.valor_icms) || 0) +
    (Number(it.valor_st) || 0)
  )
}

function getFinalY(doc: jsPDF, fallback: number): number {
  const t = doc as jsPDF & { lastAutoTable?: { finalY: number } }
  return t.lastAutoTable?.finalY ?? fallback
}

/** Texto só com dias (ex. "30" ou "30 dias") — o PDF mostra tabela e não repete só o número. */
function isCondicaoSoDiasOuNumero(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false
  const s = raw.trim()
  return /^\d{1,4}$/.test(s) || /^\d{1,4}\s*dias?$/i.test(s)
}

function normalizeParcelasRows(
  raw: unknown,
  totalPedido: number,
  dataPrevistaYmd: string,
  condicao: string | null | undefined,
  labelMeio?: (code: number) => string
): { parcela: string; dataStr: string; valor: string; meio: string }[] {
  let list: Record<string, unknown>[] = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : []
  if (list.length === 0 && condicao?.trim()) {
    const derived = parcelasFromCondicaoText(condicao.trim(), totalPedido, dataPrevistaYmd)
    list = derived.map((p) => ({
      dias: p.dias,
      dataVencimento: p.dataVencimento,
      valor: p.valor,
      meioPagamento: p.meioPagamento,
    }))
  }
  const nPar = list.length
  return list.map((p, idx) => {
    const dv = p.dataVencimento
    const dataStr =
      typeof dv === 'string' && dv.length >= 10
        ? dv.slice(0, 10).split('-').reverse().join('/')
        : '—'
    const code = Number(p.meioPagamento)
    const meio =
      labelMeio != null && Number.isFinite(code) ? labelMeio(code) : '—'
    return {
      parcela: `${idx + 1} de ${nPar}`,
      dataStr,
      valor: fmtMoney(Number(p.valor)),
      meio,
    }
  })
}

/** Gera e baixa o PDF do pedido de compra no navegador. */
export async function downloadPurchaseOrderPdf(
  detail: PurchaseOrderPdfDetail,
  options?: PurchaseOrderPdfOptions
) {
  const doc = new jsPDF({ format: 'a4', unit: 'mm' })
  const margin = 14
  const pageW = doc.internal.pageSize.getWidth()
  let y = margin

  const logoPublicUrl = EMPRESA_IDS_LOGO_ALIANCA_PDF.has(detail.empresa_id)
    ? LOGO_URL_ALIANCA
    : LOGO_URL_OUTRAS

  let logo: { dataUrl: string; aspect: number } | null = null
  try {
    const raw = await fetchDataUrl(logoPublicUrl)
    const aspect = await aspectRatioFromDataUrl(raw)
    logo = { dataUrl: raw, aspect }
  } catch {
    logo = null
  }

  const empresa = EMPRESAS_SUPRIMENTOS.find((e) => e.id === detail.empresa_id)

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(`Pedido de compra #${detail.id}`, margin, y)
  doc.setFont('helvetica', 'normal')

  if (logo) {
    const logoWmm = 52
    const logoHmm = logoWmm / logo.aspect
    const logoX = pageW - margin - logoWmm
    const logoTopY = margin - 9
    doc.addImage(logo.dataUrl, 'PNG', logoX, logoTopY, logoWmm, logoHmm)
  }

  y += 9

  doc.setFontSize(10)
  doc.text(`Comprador: ${empresa?.label ?? labelEmpresa(detail.empresa_id)}`, margin, y)
  y += 5
  doc.text(`CNPJ: ${empresa?.cnpj ?? '—'}`, margin, y)
  y += 7

  doc.text(`Fornecedor: ${detail.cliente?.nome ?? '—'}`, margin, y)
  y += 5
  const docCnpj = formatCnpjDisplay(detail.cliente?.cpf_cnpj) || '—'
  doc.text(`CNPJ: ${docCnpj}`, margin, y)
  y += 7

  doc.text(`Data: ${fmtDate(detail.data)}    Data prevista: ${fmtDate(detail.data_prevista)}`, margin, y)
  y += 8

  if (detail.transportador?.trim()) {
    doc.text(`Transportador: ${detail.transportador.trim()}`, margin, y)
    y += 6
  }

  const items = detail.items || []
  const sumBase = items.reduce((a, it) => a + lineBase(it), 0)
  const sumIpi = items.reduce((a, it) => a + lineIpiValue(it), 0)
  const sumIcms = items.reduce((a, it) => a + (Number(it.valor_icms) || 0), 0)
  const sumSt = items.reduce((a, it) => a + (Number(it.valor_st) || 0), 0)
  const sumItensComImpostos = items.reduce((a, it) => a + lineTotal(it), 0)

  const body = items.map((it) => {
    const cod = it.product?.code ?? it.produto_codigo ?? '—'
    const nome = it.product?.name ?? it.produto_nome ?? '—'
    const q = Number(it.quantidade) || 0
    const vu = Number(it.valor) || 0
    const ipiPct = Number(it.aliquota_ipi) || 0
    const vIpi = lineIpiValue(it)
    const vIcms = Number(it.valor_icms) || 0
    const vSt = Number(it.valor_st) || 0
    const tot = lineTotal(it)
    return [
      String(cod),
      nome,
      String(q),
      fmtMoney(vu),
      fmtPct(ipiPct),
      vIpi > 0 || ipiPct > 0 ? fmtMoney(vIpi) : '—',
      vIcms > 0 ? fmtMoney(vIcms) : '—',
      vSt > 0 ? fmtMoney(vSt) : '—',
      fmtMoney(tot),
    ]
  })

  autoTable(doc, {
    startY: y,
    head: [['Cód.', 'Produto', 'Qtd', 'Vl. unit.', '% IPI', 'Vl. IPI', 'ICMS', 'ST', 'Total']],
    body,
    styles: { fontSize: 7, cellPadding: 1.2 },
    headStyles: {
      fillColor: TABLE_HEAD_COLOR,
      textColor: [255, 255, 255],
    },
    columnStyles: {
      0: { cellWidth: 16 },
      1: { cellWidth: 46 },
      2: { cellWidth: 10, halign: 'right' },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 12, halign: 'right' },
      5: { cellWidth: 18, halign: 'right' },
      6: { cellWidth: 16, halign: 'right' },
      7: { cellWidth: 16, halign: 'right' },
      8: { cellWidth: 20, halign: 'right' },
    },
    margin: { left: margin, right: margin },
  })

  y = getFinalY(doc, y + 40) + 6

  const freteN = Number(detail.frete) || 0
  const descontoN = Number(detail.desconto) || 0
  const totalPedido = Math.max(0, sumItensComImpostos + freteN - descontoN)
  const dataPrevistaYmd =
    detail.data_prevista && String(detail.data_prevista).length >= 10
      ? String(detail.data_prevista).slice(0, 10)
      : String(detail.data || '').slice(0, 10) || new Date().toISOString().slice(0, 10)

  const labelMeio = options?.meioPagamentoLabel
  const parcelasRows = normalizeParcelasRows(
    detail.parcelas,
    totalPedido,
    dataPrevistaYmd,
    detail.condicao,
    labelMeio
  )

  const colL = margin
  const colR = margin + 98
  const lineH = 4.8

  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('Resumo financeiro', margin, y)
  doc.setFont('helvetica', 'normal')
  let yL = y + 5
  let yR = y + 5

  doc.text(`Subtotal mercadoria (sem impostos): ${fmtMoney(sumBase)}`, colL, yL)
  yL += lineH
  doc.text(`Total IPI: ${fmtMoney(sumIpi)}`, colL, yL)
  yL += lineH
  doc.text(`Total ICMS: ${fmtMoney(sumIcms)}`, colL, yL)
  yL += lineH
  doc.text(`Total ST: ${fmtMoney(sumSt)}`, colL, yL)
  yL += lineH
  doc.setFont('helvetica', 'bold')
  doc.text(`Subtotal dos produtos (com impostos): ${fmtMoney(sumItensComImpostos)}`, colL, yL)
  doc.setFont('helvetica', 'normal')
  yL += lineH + 1

  doc.text(
    `Frete: ${fmtMoney(freteN)} (${detail.frete_por_conta === 'D' ? 'destinatário' : 'remetente'})`,
    colR,
    yR
  )
  yR += lineH
  doc.text(`Desconto: ${fmtMoney(descontoN)}`, colR, yR)
  yR += lineH
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(`Total do pedido: ${fmtMoney(totalPedido)}`, colR, yR)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  yR += lineH + 2

  y = Math.max(yL, yR) + 8

  const condicaoTrim = detail.condicao?.trim() ?? ''
  const mostrarTextoCondicao =
    condicaoTrim.length > 0 && !(isCondicaoSoDiasOuNumero(detail.condicao) && parcelasRows.length > 0)

  const temParcelasPdf = parcelasRows.length > 0

  if (mostrarTextoCondicao || temParcelasPdf) {
    doc.setFont('helvetica', 'bold')
    doc.text('Condição de pagamento', margin, y)
    doc.setFont('helvetica', 'normal')
    y += 5
  }

  if (mostrarTextoCondicao) {
    const lines = doc.splitTextToSize(condicaoTrim, 182)
    doc.text(lines, margin, y)
    y += lines.length * 4.2 + (temParcelasPdf ? 4 : 2)
  } else if (temParcelasPdf && !mostrarTextoCondicao) {
    /* só título já foi; desce um pouco antes da tabela */
    y += 2
  }

  if (temParcelasPdf) {
    const pBody = parcelasRows.map((r) => [r.parcela, r.valor, r.dataStr, r.meio])

    autoTable(doc, {
      startY: y,
      head: [['N° parcela', 'Valor', 'Data de vencimento', 'Meio de pagamento']],
      body: pBody,
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: {
        fillColor: TABLE_HEAD_COLOR,
        textColor: [255, 255, 255],
      },
      columnStyles: {
        0: { cellWidth: 26 },
        1: { cellWidth: 32, halign: 'right' },
        2: { cellWidth: 34 },
        3: { cellWidth: 80 },
      },
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
