import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { formatSqlDateOnly, parseYmdToSqlDate, todayCalendarYmdUtc } from '@/lib/calendarDate'

function pickStr(body: Record<string, unknown>, key: string, maxLen: number): string | null {
  const v = body[key]
  if (v == null) return null
  const s = String(v).trim().slice(0, maxLen)
  return s === '' ? null : s
}

/** Mesmos nomes do POST /api/pedidos e payloads espelhados (pagamento.*). */
function resolveFormaRecebimento(body: Record<string, unknown>): string | null {
  const direct = pickStr(body, 'forma_recebimento', 50) ?? pickStr(body, 'formaPagamento', 50)
  if (direct) return direct
  const pag = body.pagamento as Record<string, unknown> | undefined
  const nested = pag?.formaRecebimento
  if (nested && typeof nested === 'object' && nested !== null && 'nome' in nested) {
    const s = String((nested as { nome?: unknown }).nome ?? '').trim().slice(0, 50)
    if (s) return s
  }
  return null
}

function resolveCondicaoPagamento(body: Record<string, unknown>): string | null {
  const direct =
    pickStr(body, 'condicao_pagamento', 100) ??
    pickStr(body, 'condicaoPagamento', 100) ??
    pickStr(body, 'condicao', 100)
  if (direct) return direct
  const pag = body.pagamento as Record<string, unknown> | undefined
  if (pag?.condicao_pagamento != null) {
    const s = String(pag.condicao_pagamento).trim().slice(0, 100)
    if (s) return s
  }
  return null
}

export async function GET() {
  try {
    const session = (await getServerSession(options as any)) as any
    if (!session?.user?.id) return NextResponse.json({ ok: true, data: [] })

    const userEmail = session.user.email || null
    // Resolve external vendor for this session user.
    let id_vendedor_externo: string | null = null
    let isAdmin = false
    if (userEmail) {
      const vendRecord = await prisma.vendedor.findFirst({ where: { email: userEmail } })
      id_vendedor_externo = vendRecord?.id_vendedor_externo ?? null
      if (vendRecord?.id_vendedor_externo) {
        const nivel = await prisma.vendedor_nivel_acesso.findUnique({ where: { id_vendedor_externo: vendRecord.id_vendedor_externo } }).catch(() => null)
        if (nivel?.nivel === 'ADMINISTRADOR') isAdmin = true
      }
    }
    let rows
    if (isAdmin) {
      rows = await prisma.platform_order.findMany({ where: { status: 'PROPOSTA' as any }, orderBy: { created_at: 'desc' } })
    } else {
      if (!id_vendedor_externo) return NextResponse.json({ ok: true, data: [] })
      rows = await prisma.platform_order.findMany({
        where: {
          status: 'PROPOSTA' as any,
          id_vendedor_externo,
        },
        orderBy: { created_at: 'desc' },
      })
    }

    // Include products for each proposal (if any)
    const data = await Promise.all(
      rows.map(async (r) => {
        const products = r.tiny_id
          ? await prisma.platform_order_product.findMany({ where: { tiny_id: r.tiny_id } as any })
          : []
        return {
          numero: r.numero,
          data: formatSqlDateOnly(r.data),
          cliente: r.cliente,
          cnpj: r.cnpj,
          total: Number(r.total),
          status: 'Proposta',
          forma_recebimento: r.forma_recebimento ?? null,
          condicao_pagamento: r.condicao_pagamento ?? null,
          juros_ligado: Boolean(r.juros_ligado ?? true),
          id_vendedor_externo: r.id_vendedor_externo,
          /** Necessário ao evoluir proposta → pedido (Tiny exige idContato). */
          id_client_externo: r.id_client_externo != null ? r.id_client_externo.toString() : null,
          itens: products.map((p) => ({
            produtoId: p.produto_id,
            codigo: p.codigo,
            nome: p.nome,
            quantidade: Number(p.quantidade),
            unidade: p.unidade,
            preco: Number(p.preco),
          })),
        }
      })
    )

    return NextResponse.json({ ok: true, data })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao listar propostas' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = (await getServerSession(options as any)) as any
    if (!session?.user?.id) return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    const userEmail = session.user.email || null
    // Resolve vendedor externo for this session user
    let vendedorExternoFromSession: string | null = null
    if (userEmail) {
      const vend = await prisma.vendedor.findFirst({ where: { email: userEmail } })
      vendedorExternoFromSession = vend?.id_vendedor_externo ?? null
    }
    if (!vendedorExternoFromSession) return NextResponse.json({ ok: false, error: 'Usuário não é vendedor autenticado' }, { status: 401 })

    const body = (await req.json()) as Record<string, unknown>
    const dataStr = (body?.data || '').toString().slice(0, 10)
    // Accept cliente sent either as string or as an object { nome, cpf_cnpj }.
    let cliente = ''
    let cnpj = ''
    if (body?.cliente && typeof body.cliente === 'object') {
      cliente = (body.cliente?.nome || '').toString().trim()
      cnpj = (body.cliente?.cpf_cnpj || body.cliente?.cnpj || body?.cnpj || '').toString().trim()
    } else {
      cliente = (body?.cliente || '').toString().trim()
      cnpj = (body?.cnpj || '').toString().trim()
    }
    const total = Number(body?.total || 0)
    const forma_recebimento = resolveFormaRecebimento(body)
    const condicao_pagamento = resolveCondicaoPagamento(body)
    const juros_ligado =
      body?.juros_ligado === false ||
      body?.juros_ligado === 'false' ||
      body?.juros_ligado === 0 ||
      body?.juros_ligado === '0'
        ? false
        : true

    const id_vendedor_externo =
      body?.vendedor != null &&
      typeof body.vendedor === 'object' &&
      (body.vendedor as { id?: unknown }).id != null
        ? String((body.vendedor as { id?: unknown }).id).trim() || null
        : body?.id_vendedor_externo != null
          ? body.id_vendedor_externo?.toString?.().trim?.() || null
          : vendedorExternoFromSession
    const idClientStr = body?.idContato != null ? body.idContato?.toString?.().trim?.() || '' : ''
    const id_client_externo = /^\d+$/.test(idClientStr) && idClientStr !== '0' ? BigInt(idClientStr) : null
    const client_vendor_externo: string | null =
      body?.client_vendor_externo != null ? body.client_vendor_externo?.toString?.().trim?.() || null : null

    if (!cliente) return NextResponse.json({ ok: false, error: 'Cliente obrigatório' }, { status: 400 })

    const maxRow = await prisma.platform_order.findFirst({
      select: { numero: true },
      orderBy: { numero: 'desc' },
    })
    const nextNumero = (maxRow?.numero || 1000) + 1

    const enderecoEntregaJson =
      body?.endereco_entrega != null && typeof body.endereco_entrega === 'object'
        ? (body.endereco_entrega as object)
        : undefined

    const created = await prisma.platform_order.create({
      data: {
        numero: nextNumero,
        tiny_id: nextNumero,
        data: dataStr ? parseYmdToSqlDate(dataStr) : parseYmdToSqlDate(todayCalendarYmdUtc()),
        cliente,
        cnpj,
        total,
        status: 'PROPOSTA' as any,
        forma_recebimento,
        condicao_pagamento,
        juros_ligado,
        id_vendedor_externo: id_vendedor_externo,
        id_client_externo: id_client_externo,
        client_vendor_externo: client_vendor_externo,
        ...(enderecoEntregaJson != null ? { endereco_entrega: enderecoEntregaJson } : {}),
      },
    })

    /** Mantém cadastro local alinhado ao endereço informado (uso posterior no Tiny / pedido). */
    if (id_client_externo && enderecoEntregaJson) {
      const a = enderecoEntregaJson as Record<string, unknown>
      const skip = a.endereco_diferente === true
      if (!skip) {
        try {
          const ufRaw = String(a.uf ?? '').trim().toUpperCase().slice(0, 2)
          const clienteData: Record<string, string> = {}
          if (a.endereco != null && String(a.endereco).trim() !== '') clienteData.endereco = String(a.endereco).slice(0, 200)
          if (a.numero != null && String(a.numero).trim() !== '') clienteData.numero = String(a.numero).slice(0, 20)
          if (a.complemento != null) clienteData.complemento = String(a.complemento).slice(0, 100)
          if (a.bairro != null && String(a.bairro).trim() !== '') clienteData.bairro = String(a.bairro).slice(0, 100)
          if (a.cep != null && String(a.cep).trim() !== '')
            clienteData.cep = String(a.cep).replace(/\D/g, '').slice(0, 20)
          if (a.cidade != null && String(a.cidade).trim() !== '') clienteData.cidade = String(a.cidade).slice(0, 100)
          if (ufRaw.length === 2) clienteData.estado = ufRaw
          if (Object.keys(clienteData).length > 0) {
            await prisma.cliente.update({
              where: { external_id: id_client_externo },
              data: clienteData,
            })
          }
        } catch {
          /* contato pode não existir localmente ainda */
        }
      }
    }

    // Persist any provided items linked to this proposal (do not send to Tiny here)
    try {
      const itens = Array.isArray(body?.itens) ? body.itens : []
      if (itens.length > 0) {
        const toCreate = itens.map((it: any) => ({
          tiny_id: created.tiny_id ?? created.numero,
          produto_id: it.produtoId != null ? Number(it.produtoId) : null,
          codigo: it.codigo || (it.sku || null),
          nome: it.nome || it.descricao || '',
          quantidade: typeof it.quantidade === 'number' ? it.quantidade : Number(it.quantidade || 0),
          unidade: it.unidade || 'UN',
          preco: typeof it.preco === 'number' ? it.preco : Number(it.preco || 0),
        }))
        await prisma.platform_order_product.createMany({ data: toCreate as any })
      }
    } catch (e) {
      // ignore product persistence errors to avoid blocking proposal creation
      console.error('Failed saving proposal items', e)
    }

    return NextResponse.json({ ok: true, numero: created.numero })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao salvar proposta' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url)
    const numero = Number(url.searchParams.get('id') || 0)
    if (!numero) return NextResponse.json({ ok: false, error: 'Número obrigatório' }, { status: 400 })

    const session = (await getServerSession(options as any)) as any
    if (!session?.user?.id) return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })

    // resolve vendedor/admin
    const userEmail = session.user.email || null
    let vendedorExterno: string | null = null
    let isAdmin = false
    if (userEmail) {
      const vend = await prisma.vendedor.findFirst({ where: { email: userEmail } })
      vendedorExterno = vend?.id_vendedor_externo ?? null
      if (vend?.id_vendedor_externo) {
        const nivel = await prisma.vendedor_nivel_acesso.findUnique({ where: { id_vendedor_externo: vend.id_vendedor_externo } }).catch(() => null)
        if (nivel?.nivel === 'ADMINISTRADOR') isAdmin = true
      }
    }
    if (!vendedorExterno && !isAdmin) return NextResponse.json({ ok: false, error: 'Usuário sem permissão' }, { status: 403 })

    const row = await prisma.platform_order.findUnique({ where: { numero } })
    if (!row || row.status !== ('PROPOSTA' as any)) return NextResponse.json({ ok: false, error: 'Proposta não encontrada' }, { status: 404 })
    if (!isAdmin && row.id_vendedor_externo !== vendedorExterno) return NextResponse.json({ ok: false, error: 'Proposta não encontrada' }, { status: 404 })

    await prisma.platform_order.delete({ where: { numero } })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao deletar proposta' }, { status: 500 })
  }
}
