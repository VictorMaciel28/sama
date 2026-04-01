import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { onlyDigits } from '@/lib/cnpjFormat'

/** Cria cliente local para uso em ordem de compra (sem Tiny). `external_id` sintético único. */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(options as any)
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }

    const body = await req.json()
    const nome = String(body?.nome ?? '').trim()
    const cpf_cnpj_raw = body?.cpf_cnpj != null ? String(body.cpf_cnpj).trim() : ''
    const digits = onlyDigits(cpf_cnpj_raw)

    if (nome.length < 2) {
      return NextResponse.json({ ok: false, error: 'Informe o nome ou razão social do fornecedor.' }, { status: 400 })
    }
    if (digits.length > 0 && digits.length !== 14) {
      return NextResponse.json(
        { ok: false, error: 'Informe um CNPJ com 14 dígitos ou deixe em branco.' },
        { status: 400 }
      )
    }

    const email = session.user?.email
    const vend = email
      ? await prisma.vendedor.findFirst({ where: { email: String(email) }, select: { id_vendedor_externo: true } })
      : null

    const cpf_cnpj_store = digits ? digits.slice(0, 14) : null
    const tipo_pessoa: string | null = digits.length === 14 ? 'J' : null

    let lastError: unknown
    for (let attempt = 0; attempt < 12; attempt++) {
      const external_id = BigInt(Date.now() + attempt) * 1000000n + BigInt(Math.floor(Math.random() * 999999))
      try {
        const c = await prisma.cliente.create({
          data: {
            external_id,
            nome: nome.slice(0, 200),
            cpf_cnpj: cpf_cnpj_store,
            tipo_pessoa,
            id_vendedor_externo: vend?.id_vendedor_externo ?? null,
          },
          select: { id: true, nome: true, cpf_cnpj: true },
        })
        return NextResponse.json({
          ok: true,
          data: { id: c.id, nome: c.nome, cpf_cnpj: c.cpf_cnpj },
        })
      } catch (e) {
        lastError = e
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          continue
        }
        throw e
      }
    }

    const msg = lastError instanceof Error ? lastError.message : 'Não foi possível gerar ID único.'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erro ao criar fornecedor'
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
