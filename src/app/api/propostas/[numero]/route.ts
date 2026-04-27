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

async function resolveSessionVendorAndAdmin(userEmail: string | null): Promise<{
  vendedorExterno: string | null
  isAdmin: boolean
}> {
  let vendedorExterno: string | null = null
  let isAdmin = false
  if (userEmail) {
    const vend = await prisma.vendedor.findFirst({ where: { email: userEmail } })
    vendedorExterno = vend?.id_vendedor_externo ?? null
    if (vend?.id_vendedor_externo) {
      const nivel = await prisma.vendedor_nivel_acesso
        .findUnique({ where: { id_vendedor_externo: vend.id_vendedor_externo } })
        .catch(() => null)
      if (nivel?.nivel === 'ADMINISTRADOR') isAdmin = true
    }
  }
  return { vendedorExterno, isAdmin }
}

/** Atualiza proposta existente (mesmo payload conceitual do POST /api/propostas). */
export async function PATCH(req: Request, { params }: { params: { numero: string } }) {
  try {
    const session = (await getServerSession(options as any)) as any
    if (!session?.user?.id) return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })

    const numero = Number(params?.numero || 0)
    if (!numero) return NextResponse.json({ ok: false, error: 'Número inválido' }, { status: 400 })

    const { vendedorExterno, isAdmin } = await resolveSessionVendorAndAdmin(session.user.email || null)
    if (!vendedorExterno && !isAdmin) return NextResponse.json({ ok: false, error: 'Usuário não é vendedor autenticado' }, { status: 401 })

    const existing = await prisma.platform_order.findUnique({ where: { numero } })
    if (!existing || existing.status !== ('PROPOSTA' as any)) {
      return NextResponse.json({ ok: false, error: 'Proposta não encontrada' }, { status: 404 })
    }
    if (!isAdmin && existing.id_vendedor_externo !== vendedorExterno) {
      return NextResponse.json({ ok: false, error: 'Proposta não encontrada' }, { status: 404 })
    }

    const body = (await req.json()) as Record<string, unknown>
    const dataStr = (body?.data || '').toString().slice(0, 10)

    let cliente = ''
    let cnpj = ''
    if (body?.cliente && typeof body.cliente === 'object') {
      cliente = (body.cliente as { nome?: string }).nome?.toString().trim() || ''
      cnpj = (
        (body.cliente as { cpf_cnpj?: string }).cpf_cnpj ||
        (body.cliente as { cnpj?: string }).cnpj ||
        body?.cnpj ||
        ''
      )
        .toString()
        .trim()
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
          : existing.id_vendedor_externo

    const idClientStr = body?.idContato != null ? body.idContato?.toString?.().trim?.() || '' : ''
    const id_client_externo = /^\d+$/.test(idClientStr) && idClientStr !== '0' ? BigInt(idClientStr) : null
    const client_vendor_externo: string | null =
      body?.client_vendor_externo != null ? body.client_vendor_externo?.toString?.().trim?.() || null : null

    if (!cliente) return NextResponse.json({ ok: false, error: 'Cliente obrigatório' }, { status: 400 })

    const enderecoEntregaJson =
      body?.endereco_entrega != null && typeof body.endereco_entrega === 'object'
        ? (body.endereco_entrega as object)
        : undefined

    await prisma.platform_order.update({
      where: { numero },
      data: {
        data: dataStr ? parseYmdToSqlDate(dataStr) : parseYmdToSqlDate(formatSqlDateOnly(existing.data) || todayCalendarYmdUtc()),
        cliente,
        cnpj,
        total,
        forma_recebimento,
        condicao_pagamento,
        juros_ligado,
        id_vendedor_externo: id_vendedor_externo ?? undefined,
        id_client_externo,
        client_vendor_externo,
        ...(enderecoEntregaJson != null ? { endereco_entrega: enderecoEntregaJson } : {}),
      } as any,
    })

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

    const tinyIdForProducts = Number(existing.tiny_id ?? existing.numero)
    try {
      await prisma.platform_order_product.deleteMany({ where: { tiny_id: tinyIdForProducts } as any })
      const itens = Array.isArray(body?.itens) ? body.itens : []
      if (itens.length > 0) {
        const toCreate = itens.map((it: any) => ({
          tiny_id: tinyIdForProducts,
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
      console.error('Failed updating proposal items', e)
    }

    return NextResponse.json({ ok: true, numero })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao atualizar proposta' }, { status: 500 })
  }
}
