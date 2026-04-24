import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { tierToPercent } from '@/lib/paymentConditions'

function normalizeAdminTier(v: unknown): 0 | 1 | 2 {
  const n = Number(v)
  if (n === 1 || n === 2) return n as 1 | 2
  return 0
}

export async function GET() {
  try {
    const rows = await prisma.payment_condition.findMany({
      orderBy: [{ admin_tier: 'asc' }, { name: 'asc' }],
    })
    return NextResponse.json({ ok: true, data: rows })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao listar condições' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const toCreate: Array<{
      name: string
      admin_tier?: number
      valor_minimo?: number | null
    }> = Array.isArray(body?.create) ? body.create : []

    const toUpdate: Array<{
      id: number
      name?: string
      admin_tier?: number
      valor_minimo?: number | null
    }> = Array.isArray(body?.update) ? body.update : []

    const toDelete: number[] = Array.isArray(body?.delete)
      ? body.delete.map((v: any) => Number(v)).filter((n: number) => !Number.isNaN(n))
      : []

    for (const c of toCreate) {
      if (!c?.name) {
        return NextResponse.json({ ok: false, error: 'Payload inválido (create)' }, { status: 400 })
      }
    }
    for (const u of toUpdate) {
      if (!u?.id || (u.name == null && u.admin_tier === undefined && u.valor_minimo === undefined)) {
        return NextResponse.json({ ok: false, error: 'Payload inválido (update)' }, { status: 400 })
      }
    }

    try {
      const results = await prisma.$transaction(async (tx) => {
        if (toDelete.length > 0) {
          await tx.payment_condition.deleteMany({ where: { id: { in: toDelete } } })
        }

        const updates = await Promise.all(
          toUpdate.map((u) => {
            const tier =
              u.admin_tier !== undefined ? normalizeAdminTier(u.admin_tier) : undefined
            const percent = tier !== undefined ? tierToPercent(tier) : undefined
            return tx.payment_condition
              .update({
                where: { id: u.id },
                data: {
                  name: u.name !== undefined ? u.name?.toString().slice(0, 100) : undefined,
                  admin_tier: tier,
                  percent: percent !== undefined ? percent : undefined,
                  valor_minimo:
                    u.valor_minimo === undefined
                      ? undefined
                      : u.valor_minimo === null || Number.isNaN(Number(u.valor_minimo))
                        ? null
                        : Number(u.valor_minimo),
                  valor_minimo_sem_taxa: null,
                },
              })
              .catch(() => null)
          })
        )

        const creates = await Promise.all(
          toCreate.map((c) => {
            const tier = normalizeAdminTier(c.admin_tier ?? 0)
            const pct = tierToPercent(tier)
            return tx.payment_condition.create({
              data: {
                name: c.name.toString().slice(0, 100),
                admin_tier: tier,
                percent: pct,
                valor_minimo:
                  c.valor_minimo == null || c.valor_minimo === '' || Number.isNaN(Number(c.valor_minimo))
                    ? null
                    : Number(c.valor_minimo),
                valor_minimo_sem_taxa: null,
              },
            })
          })
        )

        const rows = await tx.payment_condition.findMany({
          orderBy: [{ admin_tier: 'asc' }, { name: 'asc' }],
        })
        return { updates, creates, rows }
      })

      return NextResponse.json({ ok: true, data: results.rows })
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e?.message ?? 'Erro na operação' }, { status: 500 })
    }
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao criar condição' }, { status: 500 })
  }
}
