import { EMPRESAS_SUPRIMENTOS } from '@/constants/empresas-suprimentos'
import { parcelasFromCondicaoText, type ParcelaForm } from '@/lib/suprimentosParcelas'
import type { ClienteOpt, ItemRow, OrdemCompraFormSnapshot } from './ordemCompraFormTypes'

function newRowId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `r-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function toYmd(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.slice(0, 10)
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return ''
}

type ApiItem = {
  product_id?: number | null
  tiny_produto_id?: string | number | null
  produto_codigo?: string | null
  produto_nome?: string | null
  quantidade?: string | number
  valor?: string | number
  informacoes_adicionais?: string | null
  aliquota_ipi?: string | number | null
  valor_icms?: string | number | null
  product?: { code?: string; name?: string } | null
}

function apiItemToRow(it: ApiItem): ItemRow {
  const pid = it.product_id != null && Number(it.product_id) > 0 ? Number(it.product_id) : null
  const tiny =
    it.tiny_produto_id != null && String(it.tiny_produto_id).length > 0
      ? Number(it.tiny_produto_id)
      : 0
  const tinyId = pid ?? (Number.isFinite(tiny) && tiny > 0 ? tiny : 0)

  const codigo = it.product?.code ?? it.produto_codigo ?? ''
  const nome = it.product?.name ?? it.produto_nome ?? '—'
  const label = [codigo, nome].filter(Boolean).join(' — ') || nome

  return {
    rowId: newRowId(),
    tinyId,
    nome,
    codigo: codigo || undefined,
    produtoLabel: label,
    quantidade: Number(it.quantidade) || 0,
    valor: Number(it.valor) || 0,
    informacoesAdicionais: it.informacoes_adicionais ?? '',
    aliquotaIPI: Number(it.aliquota_ipi) || 0,
    valorICMS: Number(it.valor_icms) || 0,
  }
}

function normalizeParcelas(raw: unknown, meioFallback: number): ParcelaForm[] {
  if (!Array.isArray(raw) || raw.length === 0) return []
  return raw.map((p: Record<string, unknown>) => ({
    dias: Number(p.dias) || 0,
    dataVencimento: String(p.dataVencimento ?? '').slice(0, 10),
    valor: Number(p.valor) || 0,
    contaContabil:
      typeof p.contaContabil === 'object' && p.contaContabil != null && 'id' in (p.contaContabil as object)
        ? (p.contaContabil as { id: number })
        : { id: 0 },
    meioPagamento: Number(p.meioPagamento) || meioFallback,
    observacoes: p.observacoes != null ? String(p.observacoes) : '',
  }))
}

/** Converte resposta de GET /api/suprimentos/ordens-compra/[id] em snapshot do formulário. */
export function purchaseOrderApiToFormSnapshot(raw: Record<string, unknown>): OrdemCompraFormSnapshot {
  const empresaRaw = String(raw.empresa_id ?? EMPRESAS_SUPRIMENTOS[0].id)
  const empresaId = EMPRESAS_SUPRIMENTOS.some((e) => e.id === empresaRaw) ? empresaRaw : EMPRESAS_SUPRIMENTOS[0].id

  const cliente = raw.cliente as { id?: number; nome?: string; cpf_cnpj?: string | null } | undefined
  const fornecedor: ClienteOpt = {
    id: Number(cliente?.id) || 0,
    nome: cliente?.nome ?? '—',
    cpf_cnpj: cliente?.cpf_cnpj ?? null,
  }
  const fornecedorInput = `${fornecedor.nome}${fornecedor.cpf_cnpj ? ` — ${fornecedor.cpf_cnpj}` : ''}`

  const itemsRaw = Array.isArray(raw.items) ? raw.items : []
  const items = itemsRaw.map((it) => apiItemToRow(it as ApiItem))

  const desconto = Number(raw.desconto) || 0
  const frete = Number(raw.frete) || 0
  const fretePorConta: 'R' | 'D' = raw.frete_por_conta === 'D' ? 'D' : 'R'
  const data = toYmd(raw.data)
  const dataPrevista = toYmd(raw.data_prevista)
  const condicao = raw.condicao != null ? String(raw.condicao) : ''

  const bruto = items.reduce((a, it) => {
    const q = Number(it.quantidade) || 0
    const vu = Number(it.valor) || 0
    const base = q * vu
    const ipiPct = Number(it.aliquotaIPI) || 0
    const ipi = base * (ipiPct / 100)
    const icms = Number(it.valorICMS) || 0
    return a + base + ipi + icms
  }, 0)
  const total = Math.max(0, bruto + frete - desconto)

  let meioPagamentoCodigo = 1
  const stored = normalizeParcelas(raw.parcelas, 1)
  if (stored.length > 0) {
    meioPagamentoCodigo = stored[0].meioPagamento
  }

  let parcelas: ParcelaForm[]
  if (stored.length > 0) {
    parcelas = stored.map((p) => ({ ...p, meioPagamento: meioPagamentoCodigo }))
  } else {
    parcelas = parcelasFromCondicaoText(condicao, total, dataPrevista).map((p) => ({
      ...p,
      meioPagamento: meioPagamentoCodigo,
    }))
  }

  return {
    empresaId,
    data: data || new Date().toISOString().slice(0, 10),
    dataPrevista: dataPrevista || new Date().toISOString().slice(0, 10),
    fornecedor,
    fornecedorInput,
    items,
    condicao,
    parcelas,
    meioPagamentoCodigo,
    desconto,
    frete,
    fretePorConta,
    transportador: raw.transportador != null ? String(raw.transportador) : '',
    observacoes: raw.observacoes != null ? String(raw.observacoes) : '',
    observacoesInternas: raw.observacoes_internas != null ? String(raw.observacoes_internas) : '',
  }
}
