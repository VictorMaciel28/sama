import type { PrismaClient } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { EMPRESA_IDS } from '@/constants/empresas-suprimentos'

/**
 * JSON que o formulário envia em POST/PATCH (mesmo contrato da API).
 * O servidor ainda valida e resolve produto local vs Tiny antes de gravar.
 */
export type OrdemCompraSalvarPayload = {
  empresa_id: string
  data: string
  dataPrevista: string
  desconto: number
  condicao: string
  observacoes: string
  observacoesInternas: string
  fretePorConta: string
  transportador: string
  frete: number
  contato: { id: number }
  itens: OrdemCompraItemSalvarPayload[]
  parcelas?: OrdemCompraParcelaSalvarPayload[]
  categoria?: { id: number }
}

export type OrdemCompraItemProdutoSalvarPayload =
  | { manual: true; tipo: string; nome: string; codigo?: string }
  | { id: number; tipo: string; nome: string; codigo?: string }

export type OrdemCompraItemSalvarPayload = {
  produto: OrdemCompraItemProdutoSalvarPayload
  quantidade: number
  valor: number
  informacoesAdicionais?: string
  aliquotaIPI?: number
  valorICMS?: number
  valorST?: number
}

export type OrdemCompraParcelaSalvarPayload = {
  dias?: number
  dataVencimento?: string
  valor?: number
  contaContabil?: { id?: number }
  meioPagamento?: number
  observacoes?: string
}

/** Linha de item já no formato das colunas `purchase_order_item` (após resolver produto). */
export type OrdemCompraItemGravacao = {
  product_id: number | null
  tiny_produto_id: bigint | null
  produto_codigo: string | null
  produto_nome: string | null
  quantidade: Prisma.Decimal
  valor: Prisma.Decimal
  informacoes_adicionais: string | null
  aliquota_ipi: Prisma.Decimal | null
  valor_icms: Prisma.Decimal | null
  valor_st: Prisma.Decimal | null
}

/** Cabeçalho + itens + parcelas prontos para `prisma.purchase_order.create` / `update`. */
export type OrdemCompraGravacao = {
  empresa_id: string
  data: Date
  data_prevista: Date
  desconto: Prisma.Decimal
  frete: Prisma.Decimal
  frete_por_conta: string
  condicao: string | null
  observacoes: string | null
  observacoes_internas: string | null
  transportador: string | null
  categoria_id: number | null
  cliente_id: number
  valor_total: Prisma.Decimal
  parcelasJson: OrdemCompraParcelaSalvarPayload[] | null
  itemsPayload: OrdemCompraItemGravacao[]
}

export type MontarOrdemCompraParaGravarResult =
  | { ok: false; error: string; status: number }
  | { ok: true; ordem: OrdemCompraGravacao }

type ItemIn = {
  produto?: { id?: number; tipo?: string; nome?: string; codigo?: string; manual?: boolean }
  quantidade?: number
  valor?: number
  informacoesAdicionais?: string
  aliquotaIPI?: number
  valorICMS?: number
  valorST?: number
}

function toDateOnly(s: string | undefined): Date | null {
  if (!s) return null
  const d = new Date(String(s).slice(0, 10) + 'T12:00:00')
  return Number.isNaN(d.getTime()) ? null : d
}

function itemLineTotalDec(it: ItemIn, q: number, vu: number): Prisma.Decimal {
  const sub = new Prisma.Decimal(q).mul(vu)
  const ipiPct =
    it.aliquotaIPI != null && Number.isFinite(Number(it.aliquotaIPI)) ? Number(it.aliquotaIPI) : 0
  const ipiVal = sub.mul(ipiPct).div(100)
  const icmsNum =
    it.valorICMS != null && Number.isFinite(Number(it.valorICMS)) ? Number(it.valorICMS) : 0
  const stNum = it.valorST != null && Number.isFinite(Number(it.valorST)) ? Number(it.valorST) : 0
  return sub.add(ipiVal).add(new Prisma.Decimal(icmsNum)).add(new Prisma.Decimal(stNum))
}

/**
 * Lê o JSON da requisição, valida regras de negócio e monta o objeto para gravar no Prisma
 * (inclui consulta a `cliente` e `product` para cada item).
 */
export async function montarOrdemCompraParaGravar(
  prisma: PrismaClient,
  body: unknown
): Promise<MontarOrdemCompraParaGravarResult> {
  const b = body as Record<string, unknown>
  const empresa_id = String(b?.empresa_id || b?.empresaId || '').trim()
  if (!EMPRESA_IDS.has(empresa_id)) {
    return { ok: false, error: 'empresa_id inválido', status: 400 }
  }

  const data = toDateOnly(b?.data as string | undefined)
  const data_prevista = toDateOnly(b?.dataPrevista as string | undefined)
  if (!data || !data_prevista) {
    return { ok: false, error: 'data e dataPrevista são obrigatórias', status: 400 }
  }

  const cliente_id = Number(b?.contato?.id ?? b?.cliente_id)
  if (!Number.isFinite(cliente_id) || cliente_id <= 0) {
    return { ok: false, error: 'contato (cliente) inválido', status: 400 }
  }

  const cliente = await prisma.cliente.findUnique({ where: { id: cliente_id } })
  if (!cliente) {
    return { ok: false, error: 'Cliente não encontrado', status: 400 }
  }

  const desconto = new Prisma.Decimal(Number(b?.desconto ?? 0))
  const frete = new Prisma.Decimal(Number(b?.frete ?? 0))
  const frete_por_conta = String(b?.fretePorConta || 'R').slice(0, 1).toUpperCase() || 'R'
  const condicao = b?.condicao != null ? String(b.condicao).slice(0, 255) : null
  const observacoes = b?.observacoes != null ? String(b.observacoes) : null
  const observacoes_internas = b?.observacoesInternas != null ? String(b.observacoesInternas) : null
  const transportador = b?.transportador != null ? String(b.transportador).slice(0, 255) : null
  const cat = b?.categoria as { id?: unknown } | undefined
  const categoria_id =
    cat?.id != null && Number.isFinite(Number(cat.id)) ? Number(cat.id) : null

  const rawItems: ItemIn[] = Array.isArray(b?.itens) ? (b.itens as ItemIn[]) : []
  if (rawItems.length === 0) {
    return { ok: false, error: 'Informe ao menos um item', status: 400 }
  }

  const itemsPayload: OrdemCompraItemGravacao[] = []
  let bruto = new Prisma.Decimal(0)

  for (const it of rawItems) {
    const q = Number(it?.quantidade ?? 0)
    const vu = Number(it?.valor ?? 0)
    if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(vu) || vu < 0) {
      return { ok: false, error: 'Quantidade e valor unitário inválidos nos itens', status: 400 }
    }

    if (it?.produto?.manual === true) {
      const nomeManual = it?.produto?.nome != null ? String(it.produto.nome).trim() : ''
      if (!nomeManual) {
        return { ok: false, error: 'Item manual: informe a descrição do produto.', status: 400 }
      }
      const codigoManual = it?.produto?.codigo != null ? String(it.produto.codigo).trim() : ''
      itemsPayload.push({
        product_id: null,
        tiny_produto_id: null,
        produto_codigo: codigoManual ? codigoManual.slice(0, 100) : null,
        produto_nome: nomeManual.slice(0, 255),
        quantidade: new Prisma.Decimal(q),
        valor: new Prisma.Decimal(vu),
        informacoes_adicionais: it.informacoesAdicionais != null ? String(it.informacoesAdicionais) : null,
        aliquota_ipi:
          it.aliquotaIPI != null && Number.isFinite(Number(it.aliquotaIPI))
            ? new Prisma.Decimal(Number(it.aliquotaIPI))
            : null,
        valor_icms:
          it.valorICMS != null && Number.isFinite(Number(it.valorICMS))
            ? new Prisma.Decimal(Number(it.valorICMS))
            : null,
        valor_st:
          it.valorST != null && Number.isFinite(Number(it.valorST))
            ? new Prisma.Decimal(Number(it.valorST))
            : null,
      })
      bruto = bruto.add(itemLineTotalDec(it, q, vu))
      continue
    }

    const pid = Number(it?.produto?.id)
    if (!Number.isFinite(pid) || pid <= 0) {
      return { ok: false, error: 'Cada item precisa de produto.id ou ser marcado como manual', status: 400 }
    }
    const nomeTiny = it?.produto?.nome != null ? String(it.produto.nome).trim() : ''
    const codigoTiny = it?.produto?.codigo != null ? String(it.produto.codigo).trim() : ''

    const prodLocal = await prisma.product.findUnique({ where: { id: pid } })
    bruto = bruto.add(itemLineTotalDec(it, q, vu))

    if (prodLocal) {
      itemsPayload.push({
        product_id: prodLocal.id,
        tiny_produto_id: null,
        produto_codigo: null,
        produto_nome: null,
        quantidade: new Prisma.Decimal(q),
        valor: new Prisma.Decimal(vu),
        informacoes_adicionais: it.informacoesAdicionais != null ? String(it.informacoesAdicionais) : null,
        aliquota_ipi:
          it.aliquotaIPI != null && Number.isFinite(Number(it.aliquotaIPI))
            ? new Prisma.Decimal(Number(it.aliquotaIPI))
            : null,
        valor_icms:
          it.valorICMS != null && Number.isFinite(Number(it.valorICMS))
            ? new Prisma.Decimal(Number(it.valorICMS))
            : null,
        valor_st:
          it.valorST != null && Number.isFinite(Number(it.valorST))
            ? new Prisma.Decimal(Number(it.valorST))
            : null,
      })
    } else {
      if (!nomeTiny) {
        return {
          ok: false,
          error: 'Itens do Tiny precisam de produto.nome quando não há vínculo local',
          status: 400,
        }
      }
      itemsPayload.push({
        product_id: null,
        tiny_produto_id: BigInt(pid),
        produto_codigo: codigoTiny ? codigoTiny.slice(0, 100) : null,
        produto_nome: nomeTiny.slice(0, 255),
        quantidade: new Prisma.Decimal(q),
        valor: new Prisma.Decimal(vu),
        informacoes_adicionais: it.informacoesAdicionais != null ? String(it.informacoesAdicionais) : null,
        aliquota_ipi:
          it.aliquotaIPI != null && Number.isFinite(Number(it.aliquotaIPI))
            ? new Prisma.Decimal(Number(it.aliquotaIPI))
            : null,
        valor_icms:
          it.valorICMS != null && Number.isFinite(Number(it.valorICMS))
            ? new Prisma.Decimal(Number(it.valorICMS))
            : null,
        valor_st:
          it.valorST != null && Number.isFinite(Number(it.valorST))
            ? new Prisma.Decimal(Number(it.valorST))
            : null,
      })
    }
  }

  const valor_total = bruto.add(frete).sub(desconto)

  let parcelasJson: OrdemCompraParcelaSalvarPayload[] | null = null
  if (Array.isArray(b?.parcelas) && b.parcelas.length > 0) {
    parcelasJson = (b.parcelas as OrdemCompraParcelaSalvarPayload[]).map((p) => ({
      dias: p.dias ?? 0,
      dataVencimento: p.dataVencimento ? String(p.dataVencimento).slice(0, 10) : null,
      valor: p.valor != null ? Number(p.valor) : 0,
      contaContabil: { id: p.contaContabil?.id ?? 0 },
      meioPagamento: p.meioPagamento ?? 1,
      observacoes: p.observacoes ?? '',
    }))
  }

  return {
    ok: true,
    ordem: {
      empresa_id,
      data,
      data_prevista,
      desconto,
      condicao,
      observacoes,
      observacoes_internas,
      frete_por_conta,
      transportador,
      frete,
      categoria_id,
      cliente_id,
      valor_total,
      parcelasJson,
      itemsPayload,
    },
  }
}
