import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tinyV2Post } from '@/lib/tinyOAuth'
import { upsertClienteFromTinyObterPayload } from '@/lib/tinyObterCliente'
import { recomputeCommissionsForOrder } from '@/services/commission'
import { persistTinyNotaFiscalOnPayment } from '@/lib/tinyNotaFiscalPayment'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function detectDevice(userAgent: string) {
  const ua = userAgent.toLowerCase()
  if (!ua) return 'unknown'
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return 'mobile'
  if (ua.includes('ipad') || ua.includes('tablet')) return 'tablet'
  if (ua.includes('postman') || ua.includes('insomnia') || ua.includes('curl') || ua.includes('httpie')) return 'api-client'
  if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider')) return 'bot'
  return 'desktop'
}

async function logWebhook(req: NextRequest, rawBody: string) {
  const headers = Object.fromEntries(req.headers.entries())
  const userAgent = req.headers.get('user-agent') ?? null
  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    req.headers.get('cf-connecting-ip') ??
    null
  const method = req.method.toUpperCase()
  detectDevice(userAgent ?? '')

  await prisma.$executeRaw`
    INSERT INTO tiny_raw_logs (
      method, headers, body, ip_address, user_agent, received_at
    ) VALUES (
      ${method},
      ${JSON.stringify(headers)},
      ${rawBody || null},
      ${ipAddress},
      ${userAgent},
      NOW()
    )
  `
}

function mapTinyStatusToPlatform(codigoSituacao: string) {
  const code = (codigoSituacao || '').toLowerCase().trim()
  const map: Record<string, 'APROVADO' | 'PENDENTE' | 'FATURADO' | 'ENVIADO' | 'ENTREGUE' | 'CANCELADO' | 'DADOS_INCOMPLETOS'> = {
    aprovado: 'APROVADO',
    preparando_envio: 'PENDENTE',
    faturado: 'FATURADO',
    enviado: 'ENVIADO',
    entregue: 'ENTREGUE',
    cancelado: 'CANCELADO',
    dados_incompletos: 'DADOS_INCOMPLETOS',
  }
  return map[code] ?? null
}

function normalizeCondicaoPagamento(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  // Tiny v3 often returns "21 28"; UI/options use "21/28D".
  const onlyNumbersAndSpaces = raw.replace(/\s+/g, ' ').trim()
  const parts = onlyNumbersAndSpaces
    .split(' ')
    .map((p) => p.trim())
    .filter((p) => /^\d+$/.test(p))

  if (parts.length > 0 && parts.join(' ') === onlyNumbersAndSpaces) {
    return `${parts.join('/')}D`
  }

  return raw
}

function buildEnderecoEntrega(tinyPedido: any) {
  if (tinyPedido?.endereco_entrega) {
    return {
      endereco: tinyPedido.endereco_entrega?.endereco || '',
      numero: tinyPedido.endereco_entrega?.numero || '',
      complemento: tinyPedido.endereco_entrega?.complemento || '',
      bairro: tinyPedido.endereco_entrega?.bairro || '',
      cep: tinyPedido.endereco_entrega?.cep || '',
      cidade: tinyPedido.endereco_entrega?.cidade || '',
      uf: tinyPedido.endereco_entrega?.uf || '',
      endereco_diferente: true,
    }
  }

  return null
}

async function handle(req: NextRequest) {
  const raw = await req.text()
  try {
    await logWebhook(req, raw)
  } catch {
    // Don't break status processing if webhook_log fails.
  }

  let payload: any = null
  try {
    payload = JSON.parse(raw)
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  if (payload?.tipo === 'nota_fiscal') {
    let paymentPersist: Awaited<ReturnType<typeof persistTinyNotaFiscalOnPayment>> | null = null
    try {
      paymentPersist = await persistTinyNotaFiscalOnPayment(payload?.dados)
    } catch {
      paymentPersist = { ok: false, reason: 'persist_error', count: 0 }
    }
    return NextResponse.json({ ok: true, nota_fiscal: true, payment_persist: paymentPersist })
  }

  if (payload?.tipo !== 'atualizacao_pedido') {
    return NextResponse.json({ ok: true, ignored: true, reason: 'tipo_not_supported' })
  }

  const tinyOrderId = Number(payload?.dados?.id || 0)
  if (!Number.isFinite(tinyOrderId) || tinyOrderId <= 0) {
    return NextResponse.json({ ok: false, error: 'invalid_tiny_order_id' }, { status: 400 })
  }

  const mappedStatus = mapTinyStatusToPlatform(String(payload?.dados?.codigoSituacao || ''))
  const notaFiscalIdRaw = String(payload?.dados?.idNotaFiscal || '').trim()
  const notaFiscalId = notaFiscalIdRaw && notaFiscalIdRaw !== '0' ? notaFiscalIdRaw : null

  let row = await prisma.platform_order.findFirst({
    where: { tiny_id: tinyOrderId },
    select: { id: true, numero: true },
  })
  let tinyPedidoFromV2: any = null

  // If not found locally by tiny_id, fetch from Tiny v2 and persist.
  let tinyFetchError: string | null = null
  if (!row) {
    try {
      const tinyJson = await tinyV2Post('pedido.obter.php', { id: tinyOrderId })
      const retorno = tinyJson?.retorno
      if (String(retorno?.status || '') !== 'OK' || !retorno?.pedido) {
        tinyFetchError =
          Array.isArray(retorno?.erros) && retorno.erros.length > 0
            ? String(retorno.erros[0]?.erro || '')
            : 'tiny_v2_not_found_or_invalid'
        throw new Error(tinyFetchError)
      }

      const tinyPedido = retorno.pedido
      tinyPedidoFromV2 = tinyPedido

      const numero = Number(tinyPedido?.numero || payload?.dados?.numero || 0)
      const tinyPedidoId = Number(tinyPedido?.id || 0)

      if (tinyPedidoId > 0) {
        if (tinyPedidoId !== tinyOrderId) {
          tinyFetchError = `tiny_v2_id_mismatch: expected=${tinyOrderId}, got=${tinyPedidoId}`
          throw new Error(tinyFetchError)
        }
        if (!Number.isFinite(numero) || numero <= 0) {
          tinyFetchError = `tiny_v2_missing_numero: expectedKeys=retorno.pedido.numero`
          throw new Error(tinyFetchError)
        }
        const dataBr = String(tinyPedido?.data_pedido || '')
        const dataIso = dataBr ? dataBr.split('/').reverse().join('-') : ''
        const clienteNome = String(tinyPedido?.cliente?.nome || '').trim()
        const clienteCpfCnpj = String(tinyPedido?.cliente?.cpf_cnpj || '').trim()
        const vendedorExterno = tinyPedido?.id_vendedor != null ? String(tinyPedido.id_vendedor).trim() : null
        let idClientExterno: bigint | null = null
        let clientVendorExterno: string | null = null
        const tinyCli = tinyPedido?.cliente
        if (tinyCli) {
          const extId = await upsertClienteFromTinyObterPayload(prisma, tinyCli)
          if (extId) {
            const cli = await prisma.cliente.findUnique({
              where: { external_id: extId },
              select: { id_vendedor_externo: true },
            })
            idClientExterno = extId
            clientVendorExterno = cli?.id_vendedor_externo ?? null
          }
        }
        const formaRecebimento = tinyPedido?.forma_pagamento ? String(tinyPedido.forma_pagamento) : null
        const condicaoPagamento = normalizeCondicaoPagamento(tinyPedido?.condicao_pagamento)
        const enderecoEntrega = buildEnderecoEntrega(tinyPedido)

        const existingByTinyId = await prisma.platform_order.findFirst({
          where: { tiny_id: tinyOrderId },
          select: { id: true, numero: true },
        })
        const existingByNumero = await prisma.platform_order.findUnique({ where: { numero } })
        const baseData: any = {
          numero,
          data: dataIso ? new Date(dataIso) : new Date(),
          cliente: clienteNome || 'Cliente não informado',
          cnpj: clienteCpfCnpj || '',
          total: Number(tinyPedido?.total_pedido || tinyPedido?.total_produtos || 0),
          status: mappedStatus || 'PENDENTE',
          forma_recebimento: formaRecebimento,
          condicao_pagamento: condicaoPagamento,
          endereco_entrega: enderecoEntrega,
          id_vendedor_externo: vendedorExterno,
          id_client_externo: idClientExterno,
          client_vendor_externo: clientVendorExterno,
          tiny_id: tinyOrderId,
          id_nota_fiscal: notaFiscalId || null,
          sistema_origem: 'tiny',
        }

        if (existingByTinyId) {
          await prisma.platform_order.update({
            where: { id: existingByTinyId.id },
            data: baseData,
          })
        } else if (existingByNumero) {
          await prisma.platform_order.update({
            where: { numero },
            data: baseData,
          })
        } else {
          await prisma.platform_order.create({ data: baseData })
        }

        row = await prisma.platform_order.findFirst({
          where: { tiny_id: tinyOrderId },
          select: { id: true, numero: true },
        })
      } else {
        tinyFetchError = `tiny_v2_not_found_or_invalid: tinyPedidoId=${tinyPedidoId}`
      }
    } catch (e: any) {
      tinyFetchError = e?.message || 'tiny_v2_fetch_failed'
    }
  }

  if (!row) {
    return NextResponse.json(
      {
        ok: false,
        error: 'pedido_not_found_by_tiny_id',
        tiny_id: tinyOrderId,
        detail: tinyFetchError,
      },
      { status: 404 }
    )
  }

  // For existing orders, we still refresh full Tiny payload and items.
  // This keeps platform_order_product in sync when webhook arrives after order already exists.
  if (!tinyPedidoFromV2) {
    try {
      const tinyJson = await tinyV2Post('pedido.obter.php', { id: tinyOrderId })
      const retorno = tinyJson?.retorno
      if (String(retorno?.status || '') === 'OK' && retorno?.pedido && Number(retorno.pedido?.id || 0) === tinyOrderId) {
        tinyPedidoFromV2 = retorno.pedido
      }
    } catch {
      // Keep flow resilient; status update should not fail if Tiny detail fetch fails here.
    }
  }

  if (tinyPedidoFromV2) {
    const enderecoEntrega = buildEnderecoEntrega(tinyPedidoFromV2)
    const patch: Record<string, unknown> = {}
    if (enderecoEntrega) patch.endereco_entrega = enderecoEntrega
    if (tinyPedidoFromV2.cliente) {
      const extId = await upsertClienteFromTinyObterPayload(prisma, tinyPedidoFromV2.cliente)
      if (extId) {
        const cli = await prisma.cliente.findUnique({
          where: { external_id: extId },
          select: { id_vendedor_externo: true },
        })
        patch.id_client_externo = extId
        patch.client_vendor_externo = cli?.id_vendedor_externo ?? null
        const nome = String(tinyPedidoFromV2.cliente.nome || '').trim()
        if (nome) patch.cliente = nome
        const doc = String(tinyPedidoFromV2.cliente.cpf_cnpj || '').trim()
        if (doc) patch.cnpj = doc
      }
    }
    if (Object.keys(patch).length > 0) {
      await prisma.platform_order.update({
        where: { id: row.id },
        data: patch as any,
      })
    }

    const itens = Array.isArray(tinyPedidoFromV2?.itens) ? tinyPedidoFromV2.itens : []
    await prisma.platform_order_product.deleteMany({ where: { tiny_id: tinyOrderId } as any })
    if (itens.length > 0) {
      await prisma.platform_order_product.createMany({
        data: itens.map((it: any) => ({
          tiny_id: tinyOrderId,
          produto_id: it?.item?.id_produto != null ? Number(it.item.id_produto) : null,
          codigo: it?.item?.codigo ? String(it.item.codigo) : null,
          nome: String(it?.item?.descricao || 'Produto'),
          preco: Number(it?.item?.valor_unitario || 0),
          quantidade: Number(it?.item?.quantidade || 0),
          unidade: it?.item?.unidade ? String(it.item.unidade) : 'UN',
        })) as any,
      })
    }
  }

  const updateData: any = {}
  const current = await prisma.platform_order.findUnique({
    where: { id: row.id },
    select: { status: true, tiny_id: true },
  })

  const hasStatusChange = !!mappedStatus && current?.status !== mappedStatus
  if (mappedStatus) updateData.status = mappedStatus
  if (notaFiscalId) updateData.id_nota_fiscal = notaFiscalId

  if (Object.keys(updateData).length > 0) {
    await prisma.platform_order.update({
      where: { id: row.id },
      data: updateData,
    })
  }

  if (hasStatusChange) {
    await prisma.$executeRaw`
      INSERT INTO platform_order_status_history (tiny_id, status, changed_at)
      VALUES (${tinyOrderId}, ${String(mappedStatus)}, NOW())
    `
  }

  let commission: any = null
  if (mappedStatus === 'FATURADO') {
    try {
      commission = await recomputeCommissionsForOrder(row.numero)
    } catch (e: any) {
      commission = { ok: false, reason: 'commission_failed', detail: String(e?.message || e) }
    }
  }

  return NextResponse.json({
    ok: true,
    numero: row.numero,
    tiny_id: tinyOrderId,
    status_received: payload?.dados?.codigoSituacao ?? null,
    status_saved: mappedStatus,
    id_nota_fiscal_saved: notaFiscalId,
    commission,
  })
}

export async function POST(req: NextRequest) {
  return handle(req)
}

export async function PUT(req: NextRequest) {
  return handle(req)
}

export async function PATCH(req: NextRequest) {
  return handle(req)
}
