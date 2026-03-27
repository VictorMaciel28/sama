import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveSupervisorSupervisedList } from '@/lib/supervisorScope'

export async function POST(req: Request, { params }: { params: { externo: string } }) {
  try {
    const externoSupervisor = decodeURIComponent(params?.externo || '')
    const scope = await resolveSupervisorSupervisedList(externoSupervisor)
    if (scope.ok === false) {
      return NextResponse.json({ ok: false, error: scope.message }, { status: scope.status })
    }

    const body = await req.json()
    const clienteId = Number(body?.cliente_id)
    const destExterno = String(body?.vendedor_externo_destino || '').trim()

    if (!clienteId || Number.isNaN(clienteId) || !destExterno) {
      return NextResponse.json({ ok: false, error: 'cliente_id e vendedor_externo_destino são obrigatórios' }, { status: 400 })
    }

    const allowed = new Set(scope.supervisedExternos.map((x) => String(x || '').trim()).filter(Boolean))
    if (!allowed.has(destExterno)) {
      return NextResponse.json(
        { ok: false, error: 'O vendedor de destino precisa estar entre os que você supervisiona' },
        { status: 403 }
      )
    }

    const cli = await prisma.cliente.findUnique({ where: { id: clienteId } })
    if (!cli) {
      return NextResponse.json({ ok: false, error: 'Cliente não encontrado' }, { status: 404 })
    }

    const atual = (cli.id_vendedor_externo || '').trim()
    if (!atual || !allowed.has(atual)) {
      return NextResponse.json(
        { ok: false, error: 'Este cliente não está sob vendedores que você supervisiona' },
        { status: 403 }
      )
    }

    if (atual === destExterno) {
      return NextResponse.json({ ok: false, error: 'O cliente já pertence a este vendedor' }, { status: 400 })
    }

    const vend = await prisma.vendedor.findFirst({
      where: { id_vendedor_externo: destExterno },
      select: { id: true, nome: true },
    })
    if (!vend) {
      return NextResponse.json({ ok: false, error: 'Vendedor de destino não encontrado na base' }, { status: 400 })
    }

    await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        id_vendedor_externo: destExterno,
        vendedor_id: vend.id,
        nome_vendedor: vend.nome,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao transferir cliente' }, { status: 500 })
  }
}
