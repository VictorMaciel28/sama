import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { tinyV2Post } from '@/lib/tinyOAuth'
import { upsertClienteFromTinyObterPayload } from '@/lib/tinyObterCliente'

function toIsoDate(input: unknown) {
  const raw = String(input || '').trim()
  if (!raw) return new Date().toISOString().slice(0, 10)
  const brDateMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (brDateMatch) {
    const [, dd, mm, yyyy] = brDateMatch
    return `${yyyy}-${mm}-${dd}`
  }
  return raw.slice(0, 10)
}

export async function GET(_: Request, { params }: { params: { numero: string } }) {
  try {
    const session = (await getServerSession(options as any)) as any
    if (!session?.user?.id) return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })

    // Resolve external vendor id for this session and detect admin
    const userEmail = session.user.email || null
    let vendedorExterno: string | null = null
    let isAdmin = false
    let vendRecord = null
    if (userEmail) {
      vendRecord = await prisma.vendedor.findFirst({ where: { email: userEmail } })
      vendedorExterno = vendRecord?.id_vendedor_externo ?? null
      if (vendRecord?.id_vendedor_externo) {
        const nivel = await prisma.vendedor_nivel_acesso.findUnique({ where: { id_vendedor_externo: vendRecord.id_vendedor_externo } }).catch(() => null)
        if (nivel?.nivel === 'ADMINISTRADOR') isAdmin = true
      }
    }
    const numero = Number(params?.numero || 0)
    if (!numero) return NextResponse.json({ ok: false, error: 'Número inválido' }, { status: 400 })

    let row = await prisma.platform_order.findUnique({
      where: { numero },
      include: {
        cliente_rel: true,
        products: {
          orderBy: { id: 'asc' },
        },
      },
    })
    if (!row || (!isAdmin && row.id_vendedor_externo !== vendedorExterno)) {
      return NextResponse.json({ ok: false, error: 'Pedido não encontrado' }, { status: 404 })
    }

    let tinyPedidoV2: any = null
    const shouldBackfillFromTinyV2 =
      String((row as any).sistema_origem || '').toLowerCase() === 'tiny' &&
      Number(row.tiny_id || 0) > 0

    if (shouldBackfillFromTinyV2) {
      try {
        const tinyJson = await tinyV2Post('pedido.obter.php', { id: Number(row.tiny_id) })
        const retorno = tinyJson?.retorno
        if (String(retorno?.status || '') === 'OK' && retorno?.pedido) {
          tinyPedidoV2 = retorno.pedido

          const tinyCliente = tinyPedidoV2?.cliente || {}
          const tinyEndereco = tinyPedidoV2?.endereco_entrega || null
          const tinyVendedorId = tinyPedidoV2?.id_vendedor ? String(tinyPedidoV2.id_vendedor) : null
          const tinyData = toIsoDate(tinyPedidoV2?.data_pedido)

          let idClientExterno: bigint | null = row.id_client_externo ?? null
          let clientVendorExterno: string | null = row.client_vendor_externo ?? null
          if (tinyCliente && Object.keys(tinyCliente).length > 0) {
            const extId = await upsertClienteFromTinyObterPayload(prisma, tinyCliente)
            if (extId) {
              const cli = await prisma.cliente.findUnique({
                where: { external_id: extId },
                select: { id_vendedor_externo: true },
              })
              idClientExterno = extId
              clientVendorExterno = cli?.id_vendedor_externo ?? null
            }
          }

          await prisma.platform_order.update({
            where: { numero: row.numero },
            data: {
              data: tinyData ? new Date(tinyData) : row.data,
              cliente: String(tinyCliente?.nome || row.cliente || 'Cliente não informado'),
              cnpj: String(tinyCliente?.cpf_cnpj || row.cnpj || ''),
              total: Number(tinyPedidoV2?.total_pedido || tinyPedidoV2?.total_produtos || row.total || 0),
              forma_recebimento: String(tinyPedidoV2?.forma_pagamento || row.forma_recebimento || '') || null,
              condicao_pagamento: String(tinyPedidoV2?.condicao_pagamento || row.condicao_pagamento || '') || null,
              endereco_entrega: tinyEndereco
                ? {
                    endereco: String(tinyEndereco?.endereco || ''),
                    numero: String(tinyEndereco?.numero || ''),
                    complemento: String(tinyEndereco?.complemento || ''),
                    bairro: String(tinyEndereco?.bairro || ''),
                    cep: String(tinyEndereco?.cep || ''),
                    cidade: String(tinyEndereco?.cidade || ''),
                    uf: String(tinyEndereco?.uf || ''),
                    endereco_diferente: true,
                  }
                : row.endereco_entrega,
              id_vendedor_externo: tinyVendedorId || row.id_vendedor_externo,
              id_client_externo: idClientExterno,
              client_vendor_externo: clientVendorExterno,
            } as any,
          })

          const tinyItens = Array.isArray(tinyPedidoV2?.itens) ? tinyPedidoV2.itens : []
          if (tinyItens.length > 0 && Number(row.tiny_id || 0) > 0) {
            await prisma.platform_order_product.deleteMany({ where: { tiny_id: Number(row.tiny_id) } as any })
            await prisma.platform_order_product.createMany({
              data: tinyItens.map((entry: any) => {
                const item = entry?.item || {}
                return {
                  tiny_id: Number(row.tiny_id),
                  produto_id: item?.id_produto != null && Number(item.id_produto) > 0 ? Number(item.id_produto) : null,
                  codigo: item?.codigo != null ? String(item.codigo) : null,
                  nome: String(item?.descricao || 'Produto'),
                  preco: Number(item?.valor_unitario || 0),
                  quantidade: Number(item?.quantidade || 0),
                  unidade: item?.unidade ? String(item.unidade) : 'UN',
                }
              }) as any,
            })
          }

          row = await prisma.platform_order.findUnique({
            where: { numero },
            include: {
              cliente_rel: true,
              products: {
                orderBy: { id: 'asc' },
              },
            },
          }) as any
        }
      } catch {
        // Keep opening flow resilient even if Tiny v2 fails.
      }
    }

    let selectedVendedor: any = null
    if (row.id_vendedor_externo) {
      const vend = await prisma.vendedor.findFirst({
        where: { id_vendedor_externo: row.id_vendedor_externo },
        select: { id_vendedor_externo: true, nome: true },
      })
      const tipo = await prisma.vendedor_tipo_acesso
        .findUnique({
          where: { id_vendedor_externo: row.id_vendedor_externo },
          select: { tipo: true },
        })
        .catch(() => null)

      selectedVendedor = {
        id_vendedor_externo: row.id_vendedor_externo,
        nome: vend?.nome ?? null,
        tipo: tipo?.tipo ?? null,
      }
    }

    const data = {
      numero: row.numero,
      data: row.data.toISOString().slice(0, 10),
      cliente: row.cliente,
      cnpj: row.cnpj,
      sistema_origem: String((row as any).sistema_origem || 'sama').toLowerCase(),
      id_client_externo: row.id_client_externo?.toString?.() ?? null,
      total: Number(row.total),
      forma_recebimento: row.forma_recebimento,
      condicao_pagamento: row.condicao_pagamento,
      juros_ligado: Boolean((row as any).juros_ligado ?? true),
      endereco_entrega: row.endereco_entrega,
      selected_vendedor:
        selectedVendedor ||
        (tinyPedidoV2?.id_vendedor
          ? {
              id_vendedor_externo: String(tinyPedidoV2.id_vendedor),
              nome: tinyPedidoV2?.nome_vendedor ? String(tinyPedidoV2.nome_vendedor) : null,
              tipo: null,
            }
          : null),
      selected_client: row.cliente_rel
        ? {
            id: row.cliente_rel.id,
            external_id: row.cliente_rel.external_id?.toString?.() ?? null,
            nome: row.cliente_rel.nome,
            cpf_cnpj: row.cliente_rel.cpf_cnpj ?? '',
            id_vendedor_externo: row.cliente_rel.id_vendedor_externo ?? null,
            nome_vendedor: row.cliente_rel.nome_vendedor ?? null,
            cidade: row.cliente_rel.cidade ?? null,
            endereco: row.cliente_rel.endereco ?? null,
            numero: row.cliente_rel.numero ?? null,
            complemento: row.cliente_rel.complemento ?? null,
            bairro: row.cliente_rel.bairro ?? null,
            cep: row.cliente_rel.cep ?? null,
            uf: row.cliente_rel.estado ?? null,
            email: row.cliente_rel.email ?? null,
          }
        : tinyPedidoV2?.cliente
        ? {
            id: null,
            external_id: row.id_client_externo?.toString?.() ?? null,
            nome: String(tinyPedidoV2.cliente?.nome || row.cliente || ''),
            cpf_cnpj: String(tinyPedidoV2.cliente?.cpf_cnpj || row.cnpj || ''),
            id_vendedor_externo: tinyPedidoV2?.id_vendedor ? String(tinyPedidoV2.id_vendedor) : null,
            nome_vendedor: tinyPedidoV2?.nome_vendedor ? String(tinyPedidoV2.nome_vendedor) : null,
            cidade: String(tinyPedidoV2.cliente?.cidade || ''),
            endereco: String(tinyPedidoV2.cliente?.endereco || ''),
            numero: String(tinyPedidoV2.cliente?.numero || ''),
            complemento: String(tinyPedidoV2.cliente?.complemento || ''),
            bairro: String(tinyPedidoV2.cliente?.bairro || ''),
            cep: String(tinyPedidoV2.cliente?.cep || ''),
            uf: String(tinyPedidoV2.cliente?.uf || ''),
            email: String(tinyPedidoV2.cliente?.email || ''),
          }
        : null,
      itens: (row.products || []).map((p: any) => ({
        produtoId: p.produto_id ?? null,
        codigo: p.codigo ?? undefined,
        nome: p.nome,
        quantidade: Number(p.quantidade || 0),
        unidade: p.unidade || 'UN',
        preco: Number(p.preco || 0),
      })),
      status:
      (row.status as any) === 'PROPOSTA'
        ? 'Proposta'
        : row.status === 'APROVADO'
        ? 'Aprovado'
        : row.status === 'PENDENTE'
        ? 'Pendente'
        : row.status === 'CANCELADO'
        ? 'Cancelado'
        : row.status === 'FATURADO'
        ? 'Faturado'
        : row.status === 'ENVIADO'
        ? 'Enviado'
        : row.status === 'DADOS_INCOMPLETOS'
        ? 'Dados incompletos'
        : 'Entregue',
      id_vendedor_externo: row.id_vendedor_externo,
    }

    return NextResponse.json({ ok: true, data })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao buscar pedido' }, { status: 500 })
  }
}

/** Cancelamento: marca pedido como cancelado no Tiny (`pedido.alterar.situacao`) e depois no SAMA. */
export async function PATCH(req: Request, { params }: { params: { numero: string } }) {
  try {
    const session = (await getServerSession(options as any)) as any
    if (!session?.user?.id) return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    if (String(body?.action || '') !== 'cancel') {
      return NextResponse.json({ ok: false, error: 'Ação inválida' }, { status: 400 })
    }

    const userEmail = session.user.email || null
    let isAdmin = false
    if (userEmail) {
      const vendRecord = await prisma.vendedor.findFirst({ where: { email: userEmail } })
      if (vendRecord?.id_vendedor_externo) {
        const nivel = await prisma.vendedor_nivel_acesso
          .findUnique({ where: { id_vendedor_externo: vendRecord.id_vendedor_externo } })
          .catch(() => null)
        if (nivel?.nivel === 'ADMINISTRADOR') isAdmin = true
      }
    }
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: 'Sem permissão para cancelar pedidos' }, { status: 403 })
    }

    const numero = Number(params?.numero || 0)
    if (!numero) return NextResponse.json({ ok: false, error: 'Número inválido' }, { status: 400 })

    const row = await prisma.platform_order.findUnique({ where: { numero } })
    if (!row) return NextResponse.json({ ok: false, error: 'Pedido não encontrado' }, { status: 404 })

    if (row.status === 'CANCELADO') {
      return NextResponse.json({ ok: true, alreadyCancelled: true, tinyError: null })
    }

    let tinyError: string | null = null
    const tinyId = row.tiny_id != null && Number(row.tiny_id) > 0 ? Number(row.tiny_id) : null

    if (tinyId) {
      try {
        const dataTiny = await tinyV2Post('pedido.alterar.situacao', {
          id: tinyId,
          situacao: 'cancelado',
        })
        const retorno = dataTiny?.retorno
        if (String(retorno?.status || '').toUpperCase() !== 'OK') {
          const msg =
            Array.isArray(retorno?.erros) && retorno.erros.length > 0
              ? String(retorno.erros[0]?.erro || '')
              : 'Falha ao cancelar pedido no Tiny'
          tinyError = msg || 'Falha ao cancelar pedido no Tiny'
        }
      } catch (e: any) {
        tinyError = e?.message ? String(e.message) : 'Erro ao comunicar com o Tiny'
      }
    }

    await prisma.platform_order.update({
      where: { numero },
      data: { status: 'CANCELADO' },
    })

    if (tinyId) {
      try {
        await prisma.$executeRaw`
          INSERT INTO platform_order_status_history (tiny_id, status, changed_at)
          VALUES (${tinyId}, ${'CANCELADO'}, NOW())
        `
      } catch {
        // ignore history failures
      }
    }

    return NextResponse.json({ ok: true, tinyError })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao cancelar pedido' }, { status: 500 })
  }
}

