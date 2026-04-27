import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveSupervisorSupervisedList } from '@/lib/supervisorScope'

/** Vincula vendedor (Tiny) ao supervisor: cria `vendedor` local se preciso e insere em `supervisor_vendor_links`. */
export async function POST(req: Request, { params }: { params: { externo: string } }) {
  try {
    const externo = decodeURIComponent(params?.externo || '').trim()
    const scope = await resolveSupervisorSupervisedList(externo)
    if (scope.ok === false) {
      return NextResponse.json({ ok: false, error: scope.message }, { status: scope.status })
    }

    const body = await req.json().catch(() => ({}))
    const tinyId = Number(body?.tiny_id ?? body?.id)
    const nome = String(body?.nome || '').trim()
    const email = body?.email != null ? String(body.email).trim() || null : null

    if (!Number.isFinite(tinyId) || tinyId <= 0) {
      return NextResponse.json({ ok: false, error: 'ID do vendedor no Tiny inválido' }, { status: 400 })
    }
    if (!nome) {
      return NextResponse.json({ ok: false, error: 'Nome do vendedor é obrigatório' }, { status: 400 })
    }

    const vendedorExterno = String(tinyId)

    const supervisor = await prisma.supervisor.findUnique({
      where: { id_vendedor_externo: externo },
      select: { id: true, id_vendedor_externo: true, nome: true },
    })
    if (!supervisor) {
      return NextResponse.json({ ok: false, error: 'Supervisor não encontrado neste cadastro' }, { status: 404 })
    }

    const linkExistente = await prisma.supervisor_vendor_links.findFirst({
      where: { vendedor_externo: vendedorExterno },
      include: { supervisor: { select: { id: true, id_vendedor_externo: true, nome: true } } },
    })

    if (linkExistente && linkExistente.supervisor_id !== supervisor.id) {
      const s = linkExistente.supervisor
      return NextResponse.json(
        {
          ok: false,
          code: 'VENDEDOR_OUTRO_SUPERVISOR',
          error:
            'Este vendedor já está vinculado a outro supervisor. Solicite à administração ou ao supervisor atual que libere o vínculo para poder adicioná-lo à sua equipe.',
          supervisor_atual_nome: s.nome?.trim() || s.id_vendedor_externo,
          supervisor_atual_externo: s.id_vendedor_externo,
        },
        { status: 409 }
      )
    }

    if (linkExistente && linkExistente.supervisor_id === supervisor.id) {
      return NextResponse.json({ ok: true, message: 'Vendedor já estava vinculado a você.', created: false })
    }

    let v = await prisma.vendedor.findFirst({
      where: { id_vendedor_externo: vendedorExterno },
      select: { id: true },
    })

    if (!v) {
      await prisma.vendedor.create({
        data: {
          nome: nome.slice(0, 150),
          email: email ? email.slice(0, 150) : null,
          id_vendedor_externo: vendedorExterno,
          tiny_id: tinyId,
        },
      })
    } else {
      await prisma.vendedor.update({
        where: { id: v.id },
        data: {
          nome: nome.slice(0, 150),
          ...(email ? { email: email.slice(0, 150) } : {}),
          tiny_id: tinyId,
        },
      })
    }

    await prisma.supervisor_vendor_links.createMany({
      data: [{ supervisor_id: supervisor.id, vendedor_externo: vendedorExterno }],
      skipDuplicates: true,
    })

    const criouVendedor = !v
    return NextResponse.json({
      ok: true,
      created: criouVendedor,
      message: criouVendedor ? 'Vendedor criado e vinculado com sucesso.' : 'Vinculado com sucesso.',
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao vincular vendedor'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}

export async function GET(_req: Request, { params }: { params: { externo: string } }) {
  try {
    const externo = decodeURIComponent(params?.externo || '')

    const scope = await resolveSupervisorSupervisedList(externo)
    if (scope.ok === false) {
      return NextResponse.json({ ok: false, error: scope.message }, { status: scope.status })
    }

    if (scope.supervisedExternos.length === 0) {
      return NextResponse.json({ ok: true, data: [] })
    }

    const rows = await prisma.vendedor.findMany({
      where: { id_vendedor_externo: { in: scope.supervisedExternos } },
      orderBy: { nome: 'asc' },
    })

    const tipos = await prisma.vendedor_tipo_acesso.findMany({
      where: { id_vendedor_externo: { in: scope.supervisedExternos } },
    })
    const niveles = await prisma.vendedor_nivel_acesso.findMany({
      where: { id_vendedor_externo: { in: scope.supervisedExternos } },
    })
    const tipoBy = new Map(tipos.map((t) => [t.id_vendedor_externo, t.tipo]))
    const nivelBy = new Map(niveles.map((n) => [n.id_vendedor_externo, n.nivel]))

    const data = rows.map((r) => ({
      id: r.id,
      id_vendedor_externo: r.id_vendedor_externo,
      nome: r.nome,
      email: r.email,
      telefone: r.telefone,
      tipo_acesso: r.id_vendedor_externo ? tipoBy.get(r.id_vendedor_externo) ?? null : null,
      nivel_acesso: r.id_vendedor_externo ? nivelBy.get(r.id_vendedor_externo) ?? null : null,
    }))

    return NextResponse.json({ ok: true, data })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao listar vendedores' }, { status: 500 })
  }
}

/** Remove apenas o vínculo supervisor–representante (`supervisor_vendor_links`). O cadastro do vendedor permanece. */
export async function DELETE(req: Request, { params }: { params: { externo: string } }) {
  try {
    const externo = decodeURIComponent(params?.externo || '').trim()
    const scope = await resolveSupervisorSupervisedList(externo)
    if (scope.ok === false) {
      return NextResponse.json({ ok: false, error: scope.message }, { status: scope.status })
    }

    const body = await req.json().catch(() => ({}))
    const vendedorExterno = String(body?.vendedor_externo ?? '').trim()
    if (!vendedorExterno) {
      return NextResponse.json({ ok: false, error: 'Representante não informado' }, { status: 400 })
    }

    if (!scope.supervisedExternos.includes(vendedorExterno)) {
      return NextResponse.json({ ok: false, error: 'Este representante não está na sua carteira.' }, { status: 404 })
    }

    const supervisor = await prisma.supervisor.findUnique({
      where: { id_vendedor_externo: externo },
      select: { id: true },
    })
    if (!supervisor) {
      return NextResponse.json({ ok: false, error: 'Supervisor não encontrado' }, { status: 404 })
    }

    const del = await prisma.supervisor_vendor_links.deleteMany({
      where: { supervisor_id: supervisor.id, vendedor_externo: vendedorExterno },
    })

    if (del.count === 0) {
      return NextResponse.json({ ok: false, error: 'Vínculo não encontrado ou já removido.' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, message: 'Representante removido da sua carteira.' })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro ao remover vínculo'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
