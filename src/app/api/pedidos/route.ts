import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { tinyV2Post, tinyV2PostWithJsonParam } from '@/lib/tinyOAuth'
import { assertUserCanEditPedidoPlataforma } from '@/lib/pedidoOrderAccess'
import { formatSqlDateOnly, parseYmdToSqlDate, todayCalendarYmdUtc } from '@/lib/calendarDate'

function formatBrDate(iso: string) {
  const s = String(iso || '').slice(0, 10)
  const [y, m, d] = s.split('-')
  if (!y || !m || !d) return ''
  return `${d}/${m}/${y}`
}


export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 20)))
    const offset = Math.max(0, Number(url.searchParams.get('offset') || 0))
    const search = (url.searchParams.get('search') || '').trim()
    const statusText = (url.searchParams.get('status') || '').trim()
    const vendedorFiltro = (url.searchParams.get('vendedor') || '').trim()
    const dataInicio = (url.searchParams.get('dataInicio') || '').trim()
    const dataFim = (url.searchParams.get('dataFim') || '').trim()
    const sortByRaw = (url.searchParams.get('sortBy') || 'id').trim()
    const sortDirRaw = (url.searchParams.get('sortDir') || 'desc').trim().toLowerCase()
    const sortDir = sortDirRaw === 'asc' ? 'asc' : 'desc'

    const session = (await getServerSession(options as any)) as any
    if (!session?.user?.id) return NextResponse.json({ ok: true, data: [] })

    const userEmail = session.user.email || null
    // Resolve external vendor id for this session user.
    let id_vendedor_externo: string | null = null
    let isAdmin = false
    let isSupervisor = false
    let vendRecord = null
    if (userEmail) {
      vendRecord = await prisma.vendedor.findFirst({ where: { email: userEmail } })
      id_vendedor_externo = vendRecord?.id_vendedor_externo ?? null
      if (vendRecord?.id_vendedor_externo) {
        const nivel = await prisma.vendedor_nivel_acesso.findUnique({ where: { id_vendedor_externo: vendRecord.id_vendedor_externo } }).catch(() => null)
        if (nivel?.nivel === 'ADMINISTRADOR') isAdmin = true
        if (nivel?.nivel === 'SUPERVISOR') isSupervisor = true
      }
    }
    const statusMapFromText: Record<string, any> = {
      Proposta: 'PROPOSTA',
      Aprovado: 'APROVADO',
      Pendente: 'PENDENTE',
      Cancelado: 'CANCELADO',
      Faturado: 'FATURADO',
      Enviado: 'ENVIADO',
      Entregue: 'ENTREGUE',
      'Dados incompletos': 'DADOS_INCOMPLETOS',
    }
    const statusEnum = statusText ? statusMapFromText[statusText] || null : null
    const orderByField =
      sortByRaw === 'numero' || sortByRaw === 'data' || sortByRaw === 'cliente'
        ? sortByRaw
        : 'id'

    const whereBase: any = {
      NOT: { status: 'PROPOSTA' as any },
    }
    if (statusEnum) whereBase.status = statusEnum
    if (search) {
      whereBase.OR = [
        { cliente: { contains: search } },
        { cnpj: { contains: search } },
        ...( /^\d+$/.test(search) ? [{ numero: Number(search) }] : []),
      ]
    }
    if (dataInicio || dataFim) {
      whereBase.data = {}
      if (dataInicio) whereBase.data.gte = new Date(dataInicio)
      if (dataFim) whereBase.data.lte = new Date(dataFim)
    }

    // If admin, return filtered/paged orders
    let rows: any[] = []
    let total = 0
    let totalValor = 0
    if (isAdmin) {
      if (vendedorFiltro) whereBase.id_vendedor_externo = vendedorFiltro
      total = await prisma.platform_order.count({ where: whereBase })
      const agg = await prisma.platform_order.aggregate({
        where: whereBase,
        _sum: { total: true },
      })
      totalValor = Number(agg?._sum?.total || 0)
      rows = await prisma.platform_order.findMany({
        where: whereBase,
        orderBy: { [orderByField]: sortDir } as any,
        skip: offset,
        take: limit,
      })
    } else if (isSupervisor) {
      if (!id_vendedor_externo) return NextResponse.json({ ok: true, data: [], paginacao: { limit, offset, total: 0 } })
      const sup = await prisma.supervisor.findUnique({
        where: { id_vendedor_externo },
        select: { id: true },
      })
      const links = sup
        ? await prisma.supervisor_vendor_links.findMany({
            where: { supervisor_id: sup.id },
            select: { vendedor_externo: true },
          })
        : []
      const allowed = Array.from(new Set([id_vendedor_externo, ...links.map((l) => l.vendedor_externo)]))

      const where: any = {
        ...whereBase,
        id_vendedor_externo: {
          in:
            vendedorFiltro && allowed.includes(vendedorFiltro)
              ? [vendedorFiltro]
              : allowed,
        },
      }
      total = await prisma.platform_order.count({ where })
      const agg = await prisma.platform_order.aggregate({
        where,
        _sum: { total: true },
      })
      totalValor = Number(agg?._sum?.total || 0)
      rows = await prisma.platform_order.findMany({
        where,
        orderBy: { [orderByField]: sortDir } as any,
        skip: offset,
        take: limit,
      })
    } else {
      // If we couldn't resolve an external vendor id, return empty result (no access)
      if (!id_vendedor_externo) return NextResponse.json({ ok: true, data: [] })

      const where: any = {
        ...whereBase,
        OR: [
          { id_vendedor_externo },
          { client_vendor_externo: id_vendedor_externo },
        ],
      }
      total = await prisma.platform_order.count({ where })
      const agg = await prisma.platform_order.aggregate({
        where,
        _sum: { total: true },
      })
      totalValor = Number(agg?._sum?.total || 0)
      rows = await prisma.platform_order.findMany({
        where,
        orderBy: { [orderByField]: sortDir } as any,
        skip: offset,
        take: limit,
      })
    }

    const vendorIds = new Set<string>()
    rows.forEach((r) => {
      if (r.id_vendedor_externo) vendorIds.add(r.id_vendedor_externo)
      if (r.client_vendor_externo) vendorIds.add(r.client_vendor_externo)
    })
    const vendorNameMap = new Map<string, string>()
    if (vendorIds.size > 0) {
      const vendorRecords = await prisma.vendedor.findMany({
        where: { id_vendedor_externo: { in: Array.from(vendorIds) } },
        select: { id_vendedor_externo: true, nome: true },
      })
      vendorRecords.forEach((v) => {
        if (v.id_vendedor_externo) vendorNameMap.set(v.id_vendedor_externo, v.nome || '')
      })
    }

    /** Sincronização Tiny grava `id_client_externo` mas `platform_order.cnpj` pode vir vazio; o documento está em `cliente`. */
    const extIdsNeedCnpj = Array.from(
      new Set(
        rows
          .filter((r) => !String(r.cnpj || '').trim() && r.id_client_externo != null)
          .map((r) => r.id_client_externo as bigint)
      )
    )
    const cnpjByClienteExt = new Map<string, string>()
    if (extIdsNeedCnpj.length > 0) {
      const clin = await prisma.cliente.findMany({
        where: { external_id: { in: extIdsNeedCnpj } },
        select: { external_id: true, cpf_cnpj: true },
      })
      for (const c of clin) {
        const doc = String(c.cpf_cnpj || '').trim()
        if (doc) cnpjByClienteExt.set(String(c.external_id), doc)
      }
    }

    const data = rows.map((r) => {
      const orderVendor = r.id_vendedor_externo ?? null
      const clientVendor = r.client_vendor_externo ?? null
      const cnpjStored = String(r.cnpj || '').trim()
      const cnpjFromCliente =
        r.id_client_externo != null ? cnpjByClienteExt.get(String(r.id_client_externo)) || '' : ''
      const cnpj = cnpjStored || cnpjFromCliente
      return {
        numero: r.numero,
        data: formatSqlDateOnly(r.data),
        cliente: r.cliente,
        cnpj,
        sistema_origem: String(r.sistema_origem || 'sama').toLowerCase(),
        total: Number(r.total),
        status:
          r.status === 'PROPOSTA'
            ? 'Proposta'
            : r.status === 'APROVADO'
            ? 'Aprovado'
            : r.status === 'PENDENTE'
            ? 'Pendente'
            : r.status === 'CANCELADO'
            ? 'Cancelado'
            : r.status === 'FATURADO'
            ? 'Faturado'
            : r.status === 'ENVIADO'
            ? 'Enviado'
            : r.status === 'DADOS_INCOMPLETOS'
            ? 'Dados incompletos'
            : 'Entregue',
        id_vendedor_externo: orderVendor,
        order_vendor_externo: orderVendor,
        order_vendor_nome: orderVendor ? vendorNameMap.get(orderVendor) || null : null,
        client_vendor_externo: clientVendor,
        client_vendor_nome: clientVendor ? vendorNameMap.get(clientVendor) || null : null,
      }
    })

    return NextResponse.json({
      ok: true,
      data,
      paginacao: { limit, offset, total, total_valor: totalValor },
    })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao listar pedidos' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const session = (await getServerSession(options as any)) as any
    if (!session?.user?.id) return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    const userEmail = session.user.email || null
    const body = await req.json()
    const numeroInput = Number(body?.numero || 0)
    const dataStr = (body?.data || '').toString().slice(0, 10)
    const cliente =
      typeof body?.cliente === 'string'
        ? body.cliente.trim()
        : typeof body?.cliente === 'object' && body?.cliente != null
          ? String((body.cliente as { nome?: string }).nome ?? '').trim()
          : String(body?.cliente ?? '').trim()
    const cnpj = (body?.cnpj || '').toString().trim()
    const total = Number(body?.total || 0)
    const statusStr = (body?.status || 'Pendente').toString()
    /** Mesmo critério de /api/propostas: aceita vendedor.id ou id_vendedor_externo no corpo. */
    let id_vendedor_externo: string | null = null
    const vendedorIdBody = body?.vendedor?.id
    if (vendedorIdBody != null && Number(vendedorIdBody) > 0) {
      id_vendedor_externo = String(vendedorIdBody).trim()
    }
    if (!id_vendedor_externo && body?.id_vendedor_externo != null && String(body.id_vendedor_externo).trim() !== '') {
      const n = Number(body.id_vendedor_externo)
      if (Number.isFinite(n) && n > 0) id_vendedor_externo = String(body.id_vendedor_externo).trim()
    }
    if (!id_vendedor_externo && userEmail) {
      const vendSess = await prisma.vendedor.findFirst({
        where: { email: userEmail },
        select: { id_vendedor_externo: true },
      })
      if (vendSess?.id_vendedor_externo != null && String(vendSess.id_vendedor_externo).trim() !== '') {
        id_vendedor_externo = String(vendSess.id_vendedor_externo).trim()
      }
    }
    const client_vendor_externo: string | null =
      body?.client_vendor_externo != null ? body.client_vendor_externo?.toString?.().trim?.() || null : null
    const forma_recebimento: string | null =
      body?.forma_recebimento != null ? body.forma_recebimento?.toString?.().trim?.() || null : null
    const condicao_pagamento: string | null =
      body?.condicao_pagamento != null ? body.condicao_pagamento?.toString?.().trim?.() || null : null
    const juros_ligado =
      body?.juros_ligado === false || body?.juros_ligado === 'false' || body?.juros_ligado === 0 || body?.juros_ligado === '0'
        ? false
        : true
    const endereco_entrega: any = body?.endereco_entrega && typeof body.endereco_entrega === 'object' ? body.endereco_entrega : null

    if (!cliente) return NextResponse.json({ ok: false, error: 'Cliente obrigatório' }, { status: 400 })

    const statusMap: Record<string, any> = {
      Proposta: 'PROPOSTA',
      Aprovado: 'APROVADO',
      Pendente: 'PENDENTE',
      Cancelado: 'CANCELADO',
      Faturado: 'FATURADO',
      Enviado: 'ENVIADO',
      Entregue: 'ENTREGUE',
      'Dados incompletos': 'DADOS_INCOMPLETOS',
    }

    const status = statusMap[statusStr] ?? 'PENDENTE'

    const normalizeItems = (items: any[]): any[] => {
      if (!Array.isArray(items)) return []
      return items
        .map((it: any) => {
          const node = it?.item && typeof it.item === 'object' ? it.item : it
          const nome = (node?.descricao || node?.nome || '').toString().trim()
          const quantidade = Number(node?.quantidade || 0)
          const preco = Number(node?.valor_unitario ?? node?.preco ?? 0)
          if (!nome || quantidade <= 0) return null
          const produtoIdRaw = node?.produtoId ?? node?.produto_id ?? it?.produtoId ?? it?.produto_id
          const produtoIdNum = produtoIdRaw != null ? Number(produtoIdRaw) : null
          return {
            produto_id: produtoIdNum && !Number.isNaN(produtoIdNum) ? produtoIdNum : null,
            codigo: node?.codigo ? String(node.codigo) : null,
            nome,
            preco,
            quantidade,
            unidade: node?.unidade ? String(node.unidade) : 'UN',
          }
        })
        .filter(Boolean)
    }

    const toIsoDate = (s: any) => (s ? String(s).slice(0, 10) : new Date().toISOString().slice(0, 10))
    const rawCliente = typeof body?.cliente === 'object' && body?.cliente != null ? body?.cliente : null
    const idContatoRaw =
      rawCliente?.idContato ??
      rawCliente?.external_id ??
      body?.idContato ??
      body?.id_client_externo ??
      0
    let idContatoStr = idContatoRaw != null && idContatoRaw !== '' ? String(idContatoRaw).trim() : '0'
    if (idContatoStr && !/^\d+$/.test(idContatoStr)) {
      const digits = idContatoStr.replace(/\D/g, '')
      idContatoStr = digits || '0'
    }
    let idContatoDb = /^\d+$/.test(idContatoStr) && idContatoStr !== '0' ? BigInt(idContatoStr) : null
    const idContatoNum = Number(idContatoStr)
    let idContato = Number.isFinite(idContatoNum) && idContatoNum > 0 ? idContatoNum : 0
    const vendedorTinyIdNum = id_vendedor_externo != null ? Number(id_vendedor_externo) : NaN
    let vendedorTinyId =
      Number.isFinite(vendedorTinyIdNum) && vendedorTinyIdNum > 0 ? vendedorTinyIdNum : null

    /** Lista/modal de proposta manda payload enxuto: completa contato/vendedor do `platform_order`. */
    if ((idContato <= 0 || vendedorTinyId == null) && numeroInput > 0) {
      const existing = await prisma.platform_order.findUnique({
        where: { numero: numeroInput },
        select: { id_client_externo: true, id_vendedor_externo: true },
      })
      if (existing) {
        if (idContato <= 0 && existing.id_client_externo != null) {
          const n = Number(existing.id_client_externo)
          if (Number.isFinite(n) && n > 0) {
            idContato = n
            idContatoDb = existing.id_client_externo
          }
        }
        if (vendedorTinyId == null && existing.id_vendedor_externo) {
          const n = Number(String(existing.id_vendedor_externo).trim())
          if (Number.isFinite(n) && n > 0) vendedorTinyId = n
        }
      }
    }
    if (!id_vendedor_externo && vendedorTinyId != null) {
      id_vendedor_externo = String(vendedorTinyId)
    }
    if (idContato > 0 && idContatoDb == null) {
      idContatoDb = BigInt(idContato)
    }

    const endereco = endereco_entrega || {}

    /** Preenche endereço com cadastro local do contato; Tiny rejeita `uf: ""`. */
    type CliAddr = {
      endereco: string | null
      numero: string | null
      complemento: string | null
      bairro: string | null
      cep: string | null
      cidade: string | null
      estado: string | null
    } | null
    let cliAddr: CliAddr = null
    if (idContato > 0) {
      try {
        cliAddr = await prisma.cliente.findUnique({
          where: { external_id: BigInt(idContato) },
          select: {
            endereco: true,
            numero: true,
            complemento: true,
            bairro: true,
            cep: true,
            cidade: true,
            estado: true,
          },
        })
      } catch {
        cliAddr = null
      }
    }
    const pickStr = (a: unknown, b: unknown) => String(a ?? b ?? '').trim()
    let ufTiny = pickStr(endereco.uf, cliAddr?.estado)
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 2)
    const clienteV2 = {
      nome: String((rawCliente?.nome as string) ?? (body?.cliente || '')).trim(),
      cpf_cnpj: String((rawCliente?.cpf_cnpj as string) ?? (body?.cnpj || '')).trim(),
      endereco: pickStr(endereco.endereco, cliAddr?.endereco),
      numero: pickStr(endereco.numero, cliAddr?.numero),
      complemento: pickStr(endereco.complemento, cliAddr?.complemento),
      bairro: pickStr(endereco.bairro, cliAddr?.bairro),
      cep: pickStr(endereco.cep, cliAddr?.cep).replace(/\D/g, ''),
      cidade: pickStr(endereco.cidade, cliAddr?.cidade),
      uf: ufTiny,
    }
    const ufValida = /^[A-Z]{2}$/.test(clienteV2.uf)

    const normalizedItems = normalizeItems(body?.itens || [])
    const itensV2 = normalizedItems.map((it: any) => ({
      item: {
        codigo: it.codigo ? String(it.codigo) : '',
        descricao: String(it.nome || 'Produto'),
        unidade: String(it.unidade || 'UN'),
        quantidade: String(Number(it.quantidade || 0)),
        valor_unitario: String(Number(it.preco || 0).toFixed(2).replace(/,/g, '.')),
      },
    }))

    if (itensV2.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Itens do pedido ausentes ou inválidos.' },
        { status: 400 }
      )
    }

    if (!idContato || idContato <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Contato Tiny obrigatório (idContato). Informe idContato, id_client_externo ou cliente com id/external_id, ou selecione um cliente cadastrado no Tiny na tela do pedido.',
        },
        { status: 400 }
      )
    }
    if (vendedorTinyId == null) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Vendedor Tiny obrigatório. Envie vendedor.id ou id_vendedor_externo, ou use um usuário vendedor vinculado no sistema.',
        },
        { status: 400 }
      )
    }

    const existingPlatformOrder =
      numeroInput > 0 ? await prisma.platform_order.findUnique({ where: { numero: numeroInput } }) : null

    if (existingPlatformOrder) {
      try {
        await assertUserCanEditPedidoPlataforma(userEmail, existingPlatformOrder.id_vendedor_externo)
      } catch (e: any) {
        const st = e?.status === 403 ? 403 : 400
        return NextResponse.json({ ok: false, error: e?.message ?? 'Sem permissão' }, { status: st })
      }
    }

    const tinyIdAlter =
      existingPlatformOrder?.tiny_id != null && Number(existingPlatformOrder.tiny_id) > 0
        ? Number(existingPlatformOrder.tiny_id)
        : null

    let tinyResponseAlter: any = null
    let dadosPedidoAlter: Record<string, unknown> | null = null

    if (tinyIdAlter) {
      const rawPar = Array.isArray(body?.pagamento?.parcelas) ? body.pagamento.parcelas : []
      const parcelasAlter = rawPar.map((p: any) => {
        const valor = Number(p?.valor ?? 0)
        const diasRaw = p?.dias
        const diasNum = diasRaw != null && diasRaw !== '' ? Number(diasRaw) : NaN
        const row: Record<string, unknown> = {
          data: p?.data ? formatBrDate(String(p.data)) : '',
          valor,
          obs: String(p?.observacoes ?? p?.obs ?? '').slice(0, 100),
          forma_pagamento: String(forma_recebimento || '').toLowerCase() || 'boleto',
        }
        if (Number.isFinite(diasNum)) row.dias = diasNum
        return row
      })
      dadosPedidoAlter = {}
      if (body?.data) dadosPedidoAlter.data_prevista = formatBrDate(toIsoDate(body?.data))
      if (parcelasAlter.length > 0) dadosPedidoAlter.parcelas = parcelasAlter
      if (Object.keys(dadosPedidoAlter).length === 0) {
        dadosPedidoAlter.obs = 'Pedido atualizado via plataforma SAMA.'
      }

      tinyResponseAlter = await tinyV2PostWithJsonParam('pedido.alterar.php', {
        id: tinyIdAlter,
        dados_pedido: dadosPedidoAlter,
      })
      const stAlter = String(tinyResponseAlter?.retorno?.status || '').toUpperCase()
      if (stAlter !== 'OK') {
        const msg =
          Array.isArray(tinyResponseAlter?.retorno?.erros) && tinyResponseAlter.retorno.erros.length > 0
            ? String(tinyResponseAlter.retorno.erros[0]?.erro || '')
            : 'Falha ao alterar pedido no Tiny (pedido.alterar)'
        return NextResponse.json(
          {
            ok: false,
            error: msg,
            tinyResponse: tinyResponseAlter,
            sentObject: { dados_pedido: dadosPedidoAlter },
          },
          { status: 400 }
        )
      }
    } else if (existingPlatformOrder) {
      tinyResponseAlter = {
        skippedTiny: true,
        reason: 'Pedido sem tiny_id — alterações gravadas apenas na plataforma.',
      }
    }

    /** Edição de pedido já existente: não chama pedido.incluir de novo (Tiny: pedido.alterar ou só DB). */
    if (existingPlatformOrder) {
      const platformNumero = numeroInput
      const statusMapPersist: Record<string, any> = {
        Proposta: 'PROPOSTA',
        Aprovado: 'APROVADO',
        Pendente: 'PENDENTE',
        Cancelado: 'CANCELADO',
        Faturado: 'FATURADO',
        Enviado: 'ENVIADO',
        Entregue: 'ENTREGUE',
        'Dados incompletos': 'DADOS_INCOMPLETOS',
      }
      const platformStatusPersist = statusMapPersist[(body?.status as string) || 'Pendente'] ?? 'PENDENTE'
      const baseOrderData: any = {
        numero: platformNumero,
        data: dataStr ? parseYmdToSqlDate(dataStr) : parseYmdToSqlDate(todayCalendarYmdUtc()),
        cliente: String((rawCliente?.nome as string) ?? (body?.cliente || '')).toString(),
        cnpj: String((rawCliente?.cpf_cnpj as string) ?? (body?.cnpj || '')).toString(),
        total: total,
        status: platformStatusPersist,
        forma_recebimento,
        condicao_pagamento,
        juros_ligado,
        endereco_entrega,
        id_vendedor_externo: id_vendedor_externo,
        id_client_externo: idContatoDb,
        client_vendor_externo: client_vendor_externo,
        sistema_origem: String(existingPlatformOrder.sistema_origem || 'sama').toLowerCase(),
      }
      const previousStatus = existingPlatformOrder.status
      const savedOrder = await prisma.platform_order.update({
        where: { numero: platformNumero },
        data: baseOrderData,
      })

      const tinyIdForHistory = Number(savedOrder?.tiny_id || tinyIdAlter || 0)
      const statusChanged = previousStatus !== savedOrder.status
      if (tinyIdForHistory > 0 && statusChanged) {
        try {
          await prisma.$executeRaw`
            INSERT INTO platform_order_status_history (tiny_id, status, changed_at)
            VALUES (${tinyIdForHistory}, ${String(savedOrder.status)}, NOW())
          `
        } catch {
          // ignore
        }
      }

      const orderTinyIdForItems = Number(savedOrder?.tiny_id || tinyIdAlter || platformNumero)
      if (orderTinyIdForItems > 0) {
        await prisma.platform_order_product.deleteMany({ where: { tiny_id: orderTinyIdForItems } as any })
        if (normalizedItems.length > 0) {
          await prisma.platform_order_product.createMany({
            data: normalizedItems.map((it: any) => ({
              tiny_id: orderTinyIdForItems,
              produto_id: it.produto_id,
              codigo: it.codigo,
              nome: it.nome,
              preco: Number(it.preco || 0),
              quantidade: Number(it.quantidade || 0),
              unidade: it.unidade || 'UN',
            })) as any,
          })
        }
      }

      return NextResponse.json({
        ok: true,
        tinyResponse: tinyResponseAlter,
        sentObject: dadosPedidoAlter ? { dados_pedido: dadosPedidoAlter } : { local: true },
        numero: platformNumero,
      })
    }

    const pedidoV2Obj: any = {
      data_pedido: formatBrDate(toIsoDate(body?.data)),
      cliente: ufValida ? clienteV2 : { ...clienteV2, uf: '' },
      itens: itensV2,
      parcelas: (Array.isArray(body?.pagamento?.parcelas) ? body.pagamento.parcelas : []).map((p: any) => ({
        parcela: {
          dias: String(p?.dias ?? ''),
          data: p?.data ? formatBrDate(String(p.data)) : '',
          valor: String(Number(p?.valor || 0).toFixed(2).replace(/,/g, '.')),
          obs: '',
          forma_pagamento: String(forma_recebimento || '').toLowerCase() || 'boleto',
        },
      })),
      numero_pedido_ecommerce: String(body?.numero || numeroInput || ''),
      forma_pagamento: String(forma_recebimento || '').toLowerCase() || 'multiplas',
      condicao_pagamento: String(condicao_pagamento || ''),
      id_vendedor: String(vendedorTinyId),
    }

    const pedidoParamJson = JSON.stringify({ pedido: pedidoV2Obj })

    const dataTiny = await tinyV2Post('pedido.incluir.php', {
      pedido: pedidoParamJson,
    })

      const retorno = dataTiny?.retorno
      const topStatus = String(retorno?.status || '')
      const reg = retorno?.registros?.registro ?? retorno?.registros?.[0]?.registro ?? null
      const regStatus = String(reg?.status || '')
      const tinyNumero = reg?.numero != null ? String(reg.numero) : null
      const tinyId = reg?.id != null ? Number(reg.id) : null

      if (topStatus !== 'OK' || regStatus !== 'OK' || !tinyNumero) {
        const msg =
          Array.isArray(retorno?.erros) && retorno.erros.length > 0
            ? String(retorno.erros[0]?.erro || '')
            : Array.isArray(reg?.erros) && reg.erros.length > 0
              ? String(reg.erros[0]?.erro || '')
              : 'Falha ao incluir pedido no Tiny (v2)'
        return NextResponse.json(
          {
            ok: false,
            error: msg,
            tinyResponse: dataTiny,
            sentObject: { pedido: pedidoV2Obj },
          },
          { status: 400 }
        )
      }

      // If Tiny returned a numero, persist (create or update) the platform_order with that numero
      if (tinyNumero) {
        const platformNumero = Number(tinyNumero)
        // Map status string to platform enum
        const statusMap: Record<string, any> = {
          Proposta: 'PROPOSTA',
          Aprovado: 'APROVADO',
          Pendente: 'PENDENTE',
          Cancelado: 'CANCELADO',
          Faturado: 'FATURADO',
          Enviado: 'ENVIADO',
          Entregue: 'ENTREGUE',
          'Dados incompletos': 'DADOS_INCOMPLETOS',
        }

        const platformStatus = statusMap[(body?.status as string) || 'Pendente'] ?? 'PENDENTE'

        // Build record payload
        const baseOrderData: any = {
          numero: platformNumero,
          data: dataStr ? parseYmdToSqlDate(dataStr) : parseYmdToSqlDate(todayCalendarYmdUtc()),
          cliente: String((rawCliente?.nome as string) ?? (body?.cliente || '')).toString(),
          cnpj: String((rawCliente?.cpf_cnpj as string) ?? (body?.cnpj || '')).toString(),
          total: total,
          status: platformStatus,
          forma_recebimento,
          condicao_pagamento,
          juros_ligado,
          endereco_entrega,
          id_vendedor_externo: id_vendedor_externo,
          id_client_externo: idContatoDb,
          client_vendor_externo: client_vendor_externo,
          sistema_origem: 'sama',
        }
        // do not store tiny_id directly on platform_order (no such column)

        // Upsert: if exists update, else create
        const existing = await prisma.platform_order.findUnique({ where: { numero: platformNumero } })
        let savedOrder
        let previousStatus: any = null
        if (existing) {
          previousStatus = existing.status
          const updateData: any = { ...baseOrderData }
          savedOrder = await prisma.platform_order.update({
            where: { numero: platformNumero },
            data: updateData,
          })
        } else {
          const createData: any = { ...baseOrderData }
          savedOrder = await prisma.platform_order.create({ data: createData })
        }

        // Persist status history whenever status changes (or when order is first created)
        if (savedOrder?.tiny_id || tinyId) {
          const tinyIdForHistory = Number(savedOrder?.tiny_id || tinyId || 0)
          const statusChanged = !existing || previousStatus !== savedOrder.status
          if (tinyIdForHistory > 0 && statusChanged) {
            await prisma.$executeRaw`
              INSERT INTO platform_order_status_history (tiny_id, status, changed_at)
              VALUES (${tinyIdForHistory}, ${String(savedOrder.status)}, NOW())
            `
          }
        }

        // If Tiny provided an id, store it on platform_order.tiny_id
        if (tinyId) {
          try {
            await prisma.platform_order.update({
              where: { numero: platformNumero },
              data: { tiny_id: tinyId },
            })
          } catch (e) {
            // ignore errors updating tiny_id
          }
        }

        // Commission is now computed from fiscal-note webhook flow.

        const orderTinyIdForItems = Number(
          savedOrder?.tiny_id || tinyId || platformNumero
        )
        if (orderTinyIdForItems > 0 && (!savedOrder?.tiny_id || Number(savedOrder.tiny_id) !== orderTinyIdForItems)) {
          await prisma.platform_order.update({
            where: { numero: platformNumero },
            data: { tiny_id: orderTinyIdForItems },
          })
        }

        // Persist order items for edit/reload flow linked by tiny_id
        await prisma.platform_order_product.deleteMany({ where: { tiny_id: orderTinyIdForItems } as any })
        if (normalizedItems.length > 0) {
          await prisma.platform_order_product.createMany({
            data: normalizedItems.map((it: any) => ({
              tiny_id: orderTinyIdForItems,
              produto_id: it.produto_id,
              codigo: it.codigo,
              nome: it.nome,
              preco: Number(it.preco || 0),
              quantidade: Number(it.quantidade || 0),
              unidade: it.unidade || 'UN',
            })) as any,
          })
        }

        // Return Tiny response + platform numero
        return NextResponse.json({ ok: true, tinyResponse: dataTiny, sentObject: { pedido: pedidoV2Obj }, numero: platformNumero })
      }

      // If no numero from Tiny, just return its response for inspection
      return NextResponse.json({ ok: true, tinyResponse: dataTiny, sentObject: { pedido: pedidoV2Obj } })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao salvar pedido' }, { status: 500 })
  }
}


