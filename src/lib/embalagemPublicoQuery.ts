import { prisma } from '@/lib/prisma'
import { SeparacaoStatus } from '@prisma/client'

export type EmbalagemPublicoMaterial = {
  codigo: string | null
  nome: string
  quantidade: string
  unidade: string | null
}

export type EmbalagemPublicoPedido = {
  numero: number
  cliente: string
  cliente_cnpj: string
  materiais: EmbalagemPublicoMaterial[]
}

export type EmbalagemPublicoPayload = {
  id: number
  empresa: { nome: string; cnpj: string }
  pedidos: EmbalagemPublicoPedido[]
}

function empresaOrigem(): { nome: string; cnpj: string } {
  const nome = process.env.PUBLIC_EMBALAGEM_EMPRESA_RAZAO?.trim()
  const cnpj = process.env.PUBLIC_EMBALAGEM_EMPRESA_CNPJ?.trim()
  return {
    nome: nome && nome.length > 0 ? nome : 'Aliança Mercantil',
    cnpj: cnpj && cnpj.length > 0 ? cnpj : '—',
  }
}

/** Dados públicos da embalagem (pedidos + materiais); só usar após validar assinatura. */
export async function getEmbalagemPublicoPayload(separationId: number): Promise<EmbalagemPublicoPayload | null> {
  const sep = await prisma.stock_separation.findFirst({
    where: {
      id: separationId,
      status: { in: [SeparacaoStatus.SEPARADO, SeparacaoStatus.CONCLUIDO] },
    },
    include: {
      orders: {
        orderBy: { id: 'asc' },
        include: {
          order_ref: {
            select: {
              numero: true,
              cliente: true,
              cnpj: true,
              products: {
                orderBy: { id: 'asc' },
                select: {
                  codigo: true,
                  nome: true,
                  quantidade: true,
                  unidade: true,
                },
              },
            },
          },
        },
      },
    },
  })

  if (!sep) return null

  return {
    id: sep.id,
    empresa: empresaOrigem(),
    pedidos: sep.orders.map((o) => ({
      numero: o.order_ref.numero,
      cliente: o.order_ref.cliente,
      cliente_cnpj: o.order_ref.cnpj,
      materiais: o.order_ref.products.map((p) => ({
        codigo: p.codigo,
        nome: p.nome,
        quantidade: p.quantidade.toString(),
        unidade: p.unidade,
      })),
    })),
  }
}
