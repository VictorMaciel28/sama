import type { ParcelaForm } from '@/lib/suprimentosParcelas'

export type ClienteOpt = { id: number; nome: string; cpf_cnpj?: string | null }

/** Mesmo formato da busca em /api/produtos (Tiny). */
export type CatalogItem = { id: number; nome: string; codigo?: string; preco?: number }

export type PaymentMethodRow = { id: number; code: number; name: string }

export type ItemRow = {
  rowId: string
  /** Catálogo/Tiny; 0 quando `manual` (texto livre). */
  tinyId: number
  /** Linha digitada à mão, gravada só com código/nome (sem id). */
  manual?: boolean
  nome: string
  codigo?: string
  produtoLabel: string
  quantidade: number
  valor: number
  informacoesAdicionais: string
  aliquotaIPI: number
  valorICMS: number
  /** ICMS ST (substituição tributária), R$. */
  valorST: number
}

/** Estado vindo de GET ordem ou vazio para tela nova. */
export type OrdemCompraFormSnapshot = {
  empresaId: string
  data: string
  dataPrevista: string
  fornecedor: ClienteOpt
  fornecedorInput: string
  items: ItemRow[]
  condicao: string
  parcelas: ParcelaForm[]
  meioPagamentoCodigo: number
  desconto: number
  frete: number
  fretePorConta: 'R' | 'D'
  transportador: string
  observacoes: string
  observacoesInternas: string
}
