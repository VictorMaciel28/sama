/** Snapshot único para PDF anexo e corpo HTML do “Compartilhar pedido” — evita divergência entre canais. */

import { computeParcelasResumoForPlatformOrder } from '@/lib/platformOrderParcelas'
import { formatEmitidoPedidoDoc } from '@/lib/calendarDate'

export type ShareLineItem = {
  nome: string
  codigo: string
  quantidade: number
  unidade: string
  preco: number
  subtotal: number
}

export type ShareParcelaResumo = {
  numero: number
  vencimento: string
  valor: number
}

export type ShareDocumentKind = 'pedido' | 'proposta'

export type ShareDocumentPayload = {
  /** Define rótulos no PDF (pedido vs proposta). */
  documentKind: ShareDocumentKind
  numero: number
  data: Date | string
  /** Texto já formatado para “Emitido em” (created_at ou data sem bug de fuso). */
  emitido_em_label: string
  cliente: string
  cnpj: string
  cliente_email: string | null
  status: string
  total: number
  forma_recebimento: string | null
  condicao_pagamento: string | null
  endereco_entrega: unknown
  /** Texto único para exibição: entrega do pedido ou, se vazio, endereço do cliente. */
  endereco_exibicao: string
  /** True quando não havia endereço no pedido e foi usado o cadastro do cliente. */
  endereco_do_cliente: boolean
  /** Vencimentos e valores inferidos da condição de pagamento (mesma lógica da tela do pedido). */
  parcelas_resumo: ShareParcelaResumo[]
  sistema_origem: string | null
  vendedor_label: string
  nf_referencia: string | null
  tiny_id: number | null
  products: ShareLineItem[]
}

function buildEnderecoExibicao(order: any): { texto: string; doCliente: boolean } {
  const delivery = (order.endereco_entrega || {}) as Record<string, unknown>
  const partsPedido = [
    delivery.endereco,
    delivery.numero,
    delivery.complemento,
    delivery.bairro,
    delivery.cidade,
    delivery.uf ?? delivery.estado,
    delivery.cep,
  ]
    .filter((x) => x != null && String(x).trim() !== '')
    .map((x) => String(x))
  const joinPedido = partsPedido.join(' · ').trim()
  if (joinPedido) return { texto: joinPedido, doCliente: false }

  const c = order.cliente_rel
  if (c) {
    const partsCliente = [
      c.endereco,
      c.numero,
      c.complemento,
      c.bairro,
      c.cidade,
      c.estado,
      c.cep,
    ]
      .filter((x) => x != null && String(x).trim() !== '')
      .map((x) => String(x))
    const j = partsCliente.join(' · ').trim()
    if (j) return { texto: j, doCliente: true }
  }

  return { texto: 'Não informado', doCliente: true }
}

export type BuildShareDocumentPayloadOptions = {
  documentKind?: ShareDocumentKind
}

/**
 * Monta o mesmo conjunto de dados que vai para o PDF e para o email (cliente/endereço/itens sempre coerentes).
 */
export async function buildShareDocumentPayload(
  order: any,
  vendedorNome: string | null,
  options?: BuildShareDocumentPayloadOptions
): Promise<ShareDocumentPayload> {
  const documentKind: ShareDocumentKind = options?.documentKind === 'proposta' ? 'proposta' : 'pedido'
  const cliente =
    (order.cliente && String(order.cliente).trim()) ||
    (order.cliente_rel?.nome && String(order.cliente_rel.nome).trim()) ||
    '—'
  const cnpj =
    (order.cnpj && String(order.cnpj).trim()) ||
    (order.cliente_rel?.cpf_cnpj && String(order.cliente_rel.cpf_cnpj).trim()) ||
    ''

  const rawProducts = Array.isArray(order.products) ? order.products : []
  const products: ShareLineItem[] = rawProducts.map((item: any) => {
    const quantidade = Number(item?.quantidade ?? 0)
    const preco = Number(item?.preco ?? 0)
    return {
      nome: String(item?.nome || '—'),
      codigo: String(item?.codigo || '—'),
      quantidade,
      unidade: String(item?.unidade || '').trim() || '—',
      preco,
      subtotal: quantidade * preco,
    }
  })

  const ext = order.id_vendedor_externo ? String(order.id_vendedor_externo) : ''
  const vendedor_label =
    vendedorNome && ext ? `${String(vendedorNome).trim()} · ID ${ext}` : ext ? `ID ${ext}` : '—'

  const relEmail = order.cliente_rel?.email
  const cliente_email = relEmail != null && String(relEmail).trim() ? String(relEmail).trim() : null

  const end = buildEnderecoExibicao(order)
  const parcelas_resumo = await computeParcelasResumoForPlatformOrder(order)

  const emitido_em_label = formatEmitidoPedidoDoc(order.created_at ?? null, order.data)

  return {
    documentKind,
    numero: Number(order.numero),
    data: order.data,
    emitido_em_label,
    cliente,
    cnpj,
    cliente_email,
    status: String(order.status || ''),
    total: Number(order.total ?? 0),
    forma_recebimento: order.forma_recebimento ?? null,
    condicao_pagamento: order.condicao_pagamento ?? null,
    endereco_entrega: order.endereco_entrega,
    endereco_exibicao: end.texto,
    endereco_do_cliente: end.doCliente,
    parcelas_resumo,
    sistema_origem: order.sistema_origem != null ? String(order.sistema_origem) : null,
    vendedor_label,
    nf_referencia: order.id_nota_fiscal != null && String(order.id_nota_fiscal).trim()
      ? String(order.id_nota_fiscal).trim()
      : null,
    tiny_id: order.tiny_id != null && Number(order.tiny_id) > 0 ? Number(order.tiny_id) : null,
    products,
  }
}
