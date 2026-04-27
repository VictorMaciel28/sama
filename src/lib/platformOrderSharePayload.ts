/** Snapshot único para PDF anexo e corpo HTML do “Compartilhar pedido” — evita divergência entre canais. */

export type ShareLineItem = {
  nome: string
  codigo: string
  quantidade: number
  unidade: string
  preco: number
  subtotal: number
}

export type ShareDocumentPayload = {
  numero: number
  data: Date | string
  cliente: string
  cnpj: string
  cliente_email: string | null
  status: string
  total: number
  forma_recebimento: string | null
  condicao_pagamento: string | null
  endereco_entrega: unknown
  sistema_origem: string | null
  vendedor_label: string
  nf_referencia: string | null
  tiny_id: number | null
  products: ShareLineItem[]
}

/**
 * Monta o mesmo conjunto de dados que vai para o PDF e para o email (cliente/endereço/itens sempre coerentes).
 */
export function buildShareDocumentPayload(order: any, vendedorNome: string | null): ShareDocumentPayload {
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

  return {
    numero: Number(order.numero),
    data: order.data,
    cliente,
    cnpj,
    cliente_email,
    status: String(order.status || ''),
    total: Number(order.total ?? 0),
    forma_recebimento: order.forma_recebimento ?? null,
    condicao_pagamento: order.condicao_pagamento ?? null,
    endereco_entrega: order.endereco_entrega,
    sistema_origem: order.sistema_origem != null ? String(order.sistema_origem) : null,
    vendedor_label,
    nf_referencia: order.id_nota_fiscal != null && String(order.id_nota_fiscal).trim()
      ? String(order.id_nota_fiscal).trim()
      : null,
    tiny_id: order.tiny_id != null && Number(order.tiny_id) > 0 ? Number(order.tiny_id) : null,
    products,
  }
}
