import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { NivelAcesso } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { encryptPassword, decryptPassword } from '@/lib/crypto'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { isVendedorTipoAcessoValue, type VendedorTipoAcessoValue } from '@/lib/vendedorTipoAcesso'
import { vendedorAccessKey } from '@/lib/vendedorAccessKey'

function emptyToNull(v: unknown): string | null {
  if (v == null) return null
  const t = String(v).trim()
  return t === '' ? null : t
}

export async function GET() {
  try {
    const rows = await prisma.vendedor.findMany({ orderBy: { nome: 'asc' } })

    const accessKeys = Array.from(new Set(rows.map((r) => vendedorAccessKey(r))))
    const externos = Array.from(
      new Set(rows.map((r) => r.id_vendedor_externo).filter((x): x is string => !!x))
    )

    const tipos =
      accessKeys.length > 0
        ? await prisma.vendedor_tipo_acesso.findMany({
            where: { id_vendedor_externo: { in: accessKeys } },
          })
        : []

    const niveles =
      accessKeys.length > 0
        ? await prisma.vendedor_nivel_acesso.findMany({
            where: { id_vendedor_externo: { in: accessKeys } },
          })
        : []

    const tipoByKey = new Map(tipos.map((t) => [t.id_vendedor_externo, t.tipo]))
    const nivelByKey = new Map(niveles.map((t) => [t.id_vendedor_externo, t.nivel]))

    const supLinks =
      externos.length > 0
        ? await prisma.supervisor_vendor_links.findMany({
            where: { vendedor_externo: { in: externos } },
            include: { supervisor: { select: { id_vendedor_externo: true } } },
            orderBy: [{ supervisor_id: 'asc' }, { id: 'asc' }],
          })
        : []

    const supervisorExternoPorVendedor = new Map<string, string>()
    for (const l of supLinks) {
      const ve = l.vendedor_externo
      const sext = l.supervisor?.id_vendedor_externo
      if (!ve || !sext) continue
      if (!supervisorExternoPorVendedor.has(ve)) supervisorExternoPorVendedor.set(ve, sext)
    }

    const data = rows.map((r) => {
      const senhaPlain = r.senha_encrypted ? (() => {
        try {
          return decryptPassword(r.senha_encrypted!)
        } catch {
          return null
        }
      })() : null
      const ext = r.id_vendedor_externo
      const key = vendedorAccessKey(r)
      const obj: any = {
        ...r,
        tipo_acesso: tipoByKey.get(key) ?? null,
        nivel_acesso: nivelByKey.get(key) ?? null,
        senha: senhaPlain,
        /** Supervisor inferido do cadastro de supervisão (vínculo); preferir `supervisor_responsavel_externo` quando preenchido. */
        supervisor_via_vinculo_externo: ext ? supervisorExternoPorVendedor.get(ext) ?? null : null,
      }
      delete obj.senha_encrypted
      return obj
    })

    return NextResponse.json({ ok: true, data })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao listar vendedores' }, { status: 500 })
  }
}

async function applyTipoNivelAcesso(
  id_vendedor_externo: string,
  tipo_acesso: VendedorTipoAcessoValue | null | undefined,
  nivel_acesso: 'SUPERVISOR' | 'ADMINISTRADOR' | 'OPERADOR' | null | undefined,
  hasTipoKey: boolean,
  hasNivelKey: boolean
) {
  if (hasTipoKey) {
    if (tipo_acesso === null) {
      await prisma.vendedor_tipo_acesso.deleteMany({ where: { id_vendedor_externo } })
    } else if (tipo_acesso) {
      await prisma.vendedor_tipo_acesso.upsert({
        where: { id_vendedor_externo },
        update: { tipo: tipo_acesso as any },
        create: { id_vendedor_externo, tipo: tipo_acesso as any },
      })
    }
  }
  if (hasNivelKey) {
    if (nivel_acesso === null) {
      await prisma.vendedor_nivel_acesso.deleteMany({ where: { id_vendedor_externo } })
    } else if (nivel_acesso) {
      await prisma.vendedor_nivel_acesso.upsert({
        where: { id_vendedor_externo },
        update: { nivel: nivel_acesso as any },
        create: { id_vendedor_externo, nivel: nivel_acesso as any },
      })
    }
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    if (String(body?.action || '') === 'create') {
      const nome = body?.nome?.toString?.().trim?.() || ''
      const email = body?.email?.toString?.().trim?.() || ''
      const password = typeof body?.password === 'string' ? body.password.trim() : ''
      const id_vendedor_externo = emptyToNull(body?.id_vendedor_externo)
      if (!nome) return NextResponse.json({ ok: false, error: 'Nome é obrigatório' }, { status: 400 })
      if (!email) return NextResponse.json({ ok: false, error: 'E-mail é obrigatório' }, { status: 400 })
      if (!password) return NextResponse.json({ ok: false, error: 'Senha é obrigatória' }, { status: 400 })
      const dup = await prisma.vendedor.findFirst({
        where: {
          OR: [{ email }, ...(id_vendedor_externo ? [{ id_vendedor_externo }] : [])],
        },
        select: { id: true, email: true, id_vendedor_externo: true },
      })
      if (dup) {
        const msg = dup.email === email ? 'E-mail já cadastrado' : 'ID externo já em uso'
        return NextResponse.json({ ok: false, error: msg }, { status: 400 })
      }
      const hasTipoKey = Object.prototype.hasOwnProperty.call(body, 'tipo_acesso')
      const hasNivelKey = Object.prototype.hasOwnProperty.call(body, 'nivel_acesso')
      let tipo_acesso: VendedorTipoAcessoValue | null | undefined
      let nivel_acesso: 'SUPERVISOR' | 'ADMINISTRADOR' | 'OPERADOR' | null | undefined
      if (hasTipoKey) {
        const t = body.tipo_acesso
        if (t == null || t === '') tipo_acesso = null
        else if (isVendedorTipoAcessoValue(t)) tipo_acesso = t
        else return NextResponse.json({ ok: false, error: 'tipo_acesso inválido' }, { status: 400 })
      }
      if (hasNivelKey) {
        const n = body.nivel_acesso
        if (n == null || n === '') nivel_acesso = null
        else if (n === 'SUPERVISOR' || n === 'ADMINISTRADOR' || n === 'OPERADOR') nivel_acesso = n
        else return NextResponse.json({ ok: false, error: 'nivel_acesso inválido' }, { status: 400 })
      }
      const created = await prisma.vendedor.create({
        data: {
          nome,
          email,
          id_vendedor_externo,
          senha_encrypted: encryptPassword(password),
          telefone: body?.telefone !== undefined ? emptyToNull(body.telefone) : null,
          razao_social: body?.razao_social !== undefined ? emptyToNull(body.razao_social) : undefined,
          endereco_razao: body?.endereco_razao !== undefined ? emptyToNull(body.endereco_razao) : undefined,
          nome_representante: body?.nome_representante !== undefined ? emptyToNull(body.nome_representante) : undefined,
          endereco_representante:
            body?.endereco_representante !== undefined ? emptyToNull(body.endereco_representante) : undefined,
          cpf_representante: body?.cpf_representante !== undefined ? emptyToNull(body.cpf_representante) : undefined,
          identidade_representante:
            body?.identidade_representante !== undefined ? emptyToNull(body.identidade_representante) : undefined,
          conta_bancaria: body?.conta_bancaria !== undefined ? emptyToNull(body.conta_bancaria) : undefined,
          pix: body?.pix !== undefined ? emptyToNull(body.pix) : undefined,
          supervisor_responsavel_externo:
            body?.supervisor_responsavel_externo !== undefined
              ? emptyToNull(body.supervisor_responsavel_externo)
              : undefined,
          observacao: body?.observacao !== undefined ? emptyToNull(body.observacao) : undefined,
        } as any,
      })
      await applyTipoNivelAcesso(vendedorAccessKey(created), tipo_acesso, nivel_acesso, hasTipoKey, hasNivelKey)
      return NextResponse.json({ ok: true, id: created.id })
    }

    const id: number | null = typeof body?.id === 'number' ? body.id : Number(body?.id) || null
    const nome: string | undefined = body?.nome?.toString?.().trim?.() || undefined
    const email: string | null | undefined =
      body?.email === null
        ? null
        : body?.email?.toString?.().trim?.()
        ? body.email.toString().trim()
        : undefined
    const telefone: string | null | undefined =
      body?.telefone === null || body?.telefone === ''
        ? null
        : body?.telefone?.toString?.().trim?.()
          ? body.telefone.toString().trim()
          : undefined
    const id_vendedor_externo: string | undefined =
      body?.id_vendedor_externo?.toString?.().trim?.() || undefined
    const password: string | undefined = typeof body?.password === 'string' && body.password.trim() ? body.password.trim() : undefined

    const extra = {
      razao_social: body?.razao_social !== undefined ? emptyToNull(body.razao_social) : undefined,
      endereco_razao: body?.endereco_razao !== undefined ? emptyToNull(body.endereco_razao) : undefined,
      nome_representante: body?.nome_representante !== undefined ? emptyToNull(body.nome_representante) : undefined,
      endereco_representante:
        body?.endereco_representante !== undefined ? emptyToNull(body.endereco_representante) : undefined,
      cpf_representante: body?.cpf_representante !== undefined ? emptyToNull(body.cpf_representante) : undefined,
      identidade_representante:
        body?.identidade_representante !== undefined ? emptyToNull(body.identidade_representante) : undefined,
      conta_bancaria: body?.conta_bancaria !== undefined ? emptyToNull(body.conta_bancaria) : undefined,
      pix: body?.pix !== undefined ? emptyToNull(body.pix) : undefined,
      supervisor_responsavel_externo:
        body?.supervisor_responsavel_externo !== undefined ? emptyToNull(body.supervisor_responsavel_externo) : undefined,
      observacao: body?.observacao !== undefined ? emptyToNull(body.observacao) : undefined,
    } as const

    const hasExtra = Object.values(extra).some((v) => v !== undefined)
    const hasTipoKey = Object.prototype.hasOwnProperty.call(body, 'tipo_acesso')
    const hasNivelKey = Object.prototype.hasOwnProperty.call(body, 'nivel_acesso')

    let tipo_acesso: VendedorTipoAcessoValue | null | undefined
    let nivel_acesso: 'SUPERVISOR' | 'ADMINISTRADOR' | 'OPERADOR' | null | undefined

    if (hasTipoKey) {
      const t = body.tipo_acesso
      if (t == null || t === '') tipo_acesso = null
      else if (isVendedorTipoAcessoValue(t)) tipo_acesso = t
      else return NextResponse.json({ ok: false, error: 'tipo_acesso inválido' }, { status: 400 })
    }

    if (hasNivelKey) {
      const n = body.nivel_acesso
      if (n == null || n === '') nivel_acesso = null
      else if (n === 'SUPERVISOR' || n === 'ADMINISTRADOR' || n === 'OPERADOR') nivel_acesso = n
      else return NextResponse.json({ ok: false, error: 'nivel_acesso inválido' }, { status: 400 })
    }

    if (
      !id &&
      nome === undefined &&
      email === undefined &&
      telefone === undefined &&
      !hasExtra &&
      !hasTipoKey &&
      !hasNivelKey &&
      !password
    ) {
      return NextResponse.json({ ok: false, error: 'Nada para atualizar' }, { status: 400 })
    }

    if (id) {
      const data: Record<string, unknown> = {
        ...(nome !== undefined ? { nome } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(telefone !== undefined ? { telefone } : {}),
      }
      if (extra.razao_social !== undefined) data.razao_social = extra.razao_social
      if (extra.endereco_razao !== undefined) data.endereco_razao = extra.endereco_razao
      if (extra.nome_representante !== undefined) data.nome_representante = extra.nome_representante
      if (extra.endereco_representante !== undefined) data.endereco_representante = extra.endereco_representante
      if (extra.cpf_representante !== undefined) data.cpf_representante = extra.cpf_representante
      if (extra.identidade_representante !== undefined) data.identidade_representante = extra.identidade_representante
      if (extra.conta_bancaria !== undefined) data.conta_bancaria = extra.conta_bancaria
      if (extra.pix !== undefined) data.pix = extra.pix
      if (extra.supervisor_responsavel_externo !== undefined) {
        data.supervisor_responsavel_externo = extra.supervisor_responsavel_externo
      }
      if (extra.observacao !== undefined) data.observacao = extra.observacao

      if (Object.keys(data).length > 0) {
        await prisma.vendedor.update({
          where: { id },
          data: data as any,
        })
      }
    }

    if (hasTipoKey || hasNivelKey) {
      let accessKey: string | null = null
      if (id) {
        const row = await prisma.vendedor.findUnique({
          where: { id },
          select: { id: true, id_vendedor_externo: true },
        })
        if (row) accessKey = vendedorAccessKey(row)
      } else if (id_vendedor_externo) {
        accessKey = id_vendedor_externo
      }
      if (accessKey) {
        await applyTipoNivelAcesso(accessKey, tipo_acesso, nivel_acesso, hasTipoKey, hasNivelKey)
      }
    }

    if (password) {
      if (!email) {
        return NextResponse.json({ ok: false, error: 'Email required to set password' }, { status: 400 })
      }
      const encrypted = encryptPassword(password)
      if (id) {
        await prisma.vendedor.update({
          where: { id },
          data: { senha_encrypted: encrypted },
        })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao salvar vendedor' }, { status: 500 })
  }
}

/** Remove o cadastro do SAMA apenas (sem Tiny). Exige administrador. */
export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(options as any)
    const email = session?.user?.email
    if (!email) {
      return NextResponse.json({ ok: false, error: 'Não autenticado' }, { status: 401 })
    }
    const me = await prisma.vendedor.findFirst({
      where: { email: email.trim() },
      select: { id_vendedor_externo: true },
    })
    if (!me?.id_vendedor_externo) {
      return NextResponse.json({ ok: false, error: 'Sem permissão' }, { status: 403 })
    }
    const meNivel = await prisma.vendedor_nivel_acesso.findUnique({
      where: { id_vendedor_externo: me.id_vendedor_externo },
      select: { nivel: true },
    })
    if (meNivel?.nivel !== NivelAcesso.ADMINISTRADOR) {
      return NextResponse.json({ ok: false, error: 'Apenas administrador pode excluir representantes' }, { status: 403 })
    }

    const url = new URL(req.url)
    const id = Number(url.searchParams.get('id') || '')
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ ok: false, error: 'ID inválido' }, { status: 400 })
    }

    const row = await prisma.vendedor.findUnique({
      where: { id },
      select: { id: true, id_vendedor_externo: true },
    })
    if (!row) {
      return NextResponse.json({ ok: false, error: 'Representante não encontrado' }, { status: 404 })
    }

    const ext = row.id_vendedor_externo?.trim() || null
    const accessKey = vendedorAccessKey(row)
    const isTargetAdmin = await prisma.vendedor_nivel_acesso.findUnique({
      where: { id_vendedor_externo: accessKey },
      select: { nivel: true },
    })
    if (isTargetAdmin?.nivel === NivelAcesso.ADMINISTRADOR) {
      const adminCount = await prisma.vendedor_nivel_acesso.count({
        where: { nivel: NivelAcesso.ADMINISTRADOR },
      })
      if (adminCount <= 1) {
        return NextResponse.json(
          { ok: false, error: 'Não é possível excluir o último administrador do sistema' },
          { status: 400 },
        )
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.vendedor_tipo_acesso.deleteMany({ where: { id_vendedor_externo: accessKey } })
      await tx.vendedor_nivel_acesso.deleteMany({ where: { id_vendedor_externo: accessKey } })
      if (ext) {
        await tx.supervisor_vendor_links.deleteMany({ where: { vendedor_externo: ext } })
        await tx.vendedor.updateMany({
          where: { supervisor_responsavel_externo: ext },
          data: { supervisor_responsavel_externo: null },
        })
        await tx.supervisor.deleteMany({ where: { id_vendedor_externo: ext } })
        await tx.telemarketing.deleteMany({ where: { id_vendedor_externo: ext } })
      }
      await tx.vendedor.delete({ where: { id: row.id } })
    })

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao excluir vendedor' }, { status: 500 })
  }
}
