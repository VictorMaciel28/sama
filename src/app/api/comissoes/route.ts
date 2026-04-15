import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'

export async function GET(req: Request) {
  try {
    const session = await getServerSession(options as any)
    const userEmail = session?.user?.email || null
    let vendedorExterno: string | null = null
    let isAdmin = false
    if (userEmail) {
      const vend = await prisma.vendedor.findFirst({ where: { email: userEmail } })
      vendedorExterno = vend?.id_vendedor_externo ?? null
      if (vend?.id_vendedor_externo) {
        const nivel = await prisma.vendedor_nivel_acesso
          .findUnique({ where: { id_vendedor_externo: vend.id_vendedor_externo } })
          .catch(() => null)
        isAdmin = nivel?.nivel === 'ADMINISTRADOR'
      }
    }
    /** Administrador vê todas as comissões; não exige linha em `vendedor_tipo_acesso`. */
    if (!vendedorExterno && !isAdmin) {
      return NextResponse.json({ ok: true, data: [] })
    }

    const { searchParams } = new URL(req.url)
    const roleParam = (searchParams.get('role') || '').toString().trim().toUpperCase()
    const vendorExterno = (searchParams.get('vendor_externo') || '').toString().trim()
    const startStr = (searchParams.get('start') || '').toString().slice(0, 10)
    const endStr = (searchParams.get('end') || '').toString().slice(0, 10)

    const where: any = {
      status: {
        in: ['FATURADO', 'ENVIADO', 'ENTREGUE'],
      },
    }
    if (!isAdmin) {
      where.OR = [
        { id_vendedor_externo: vendedorExterno },
        { client_vendor_externo: vendedorExterno },
        { cliente_rel: { is: { id_vendedor_externo: vendedorExterno } } },
      ]
    }
    if (startStr || endStr) {
      where.data = {}
      if (startStr) where.data.gte = new Date(startStr + 'T00:00:00.000Z')
      if (endStr) where.data.lte = new Date(endStr + 'T23:59:59.999Z')
    }

    const orders = await prisma.platform_order.findMany({
      where,
      include: { cliente_rel: true },
      orderBy: { data: 'desc' },
      take: 5000,
    })

    const externalsSet = new Set<string>()
    for (const o of orders) {
      if (o.id_vendedor_externo) externalsSet.add(o.id_vendedor_externo)
      const clientVendor = o.cliente_rel?.id_vendedor_externo || o.client_vendor_externo || null
      if (clientVendor) externalsSet.add(clientVendor)
    }
    const externos = Array.from(externalsSet)
    const vendRows =
      externos.length > 0
        ? await prisma.vendedor.findMany({
            where: { id_vendedor_externo: { in: externos } },
            select: { id_vendedor_externo: true, nome: true },
          })
        : []
    const nameByExt = new Map(vendRows.map((v) => [v.id_vendedor_externo || '', v.nome]))

    let seq = 1
    const computed: any[] = []
    for (const o of orders) {
      const total = Number(o.total || 0)
      if (!(total > 0)) continue
      const orderVendor = (o.id_vendedor_externo || '').trim()
      const clientVendor = (o.cliente_rel?.id_vendedor_externo || o.client_vendor_externo || '').trim()
      if (!orderVendor && !clientVendor) continue

      const orderView = {
        numero: o.numero,
        data: o.data.toISOString().slice(0, 10),
        cliente: o.cliente,
        cnpj: o.cnpj,
        total,
        status: o.status,
      }
      const orderVendorView = orderVendor
        ? { externo: orderVendor, nome: nameByExt.get(orderVendor) || null }
        : null
      const clientVendorView = clientVendor
        ? { externo: clientVendor, nome: nameByExt.get(clientVendor) || null }
        : null

      // 5%: same vendor on order and client wallet -> one single commission row
      if (orderVendor && clientVendor && orderVendor === clientVendor) {
        computed.push({
          id: seq++,
          role: 'VENDEDOR',
          percent: 5,
          amount: Number(((total * 5) / 100).toFixed(2)),
          created_at: o.data.toISOString(),
          order_num: o.numero,
          order: orderView,
          order_vendor: orderVendorView,
          client_vendor: clientVendorView,
          beneficiary_externo: orderVendor,
        })
        continue
      }

      // 1%: vendor on order
      if (orderVendor) {
        computed.push({
          id: seq++,
          role: 'TELEVENDAS',
          percent: 1,
          amount: Number(((total * 1) / 100).toFixed(2)),
          created_at: o.data.toISOString(),
          order_num: o.numero,
          order: orderView,
          order_vendor: orderVendorView,
          client_vendor: clientVendorView,
          beneficiary_externo: orderVendor,
        })
      }

      // 4%: vendor from client wallet
      if (clientVendor) {
        computed.push({
          id: seq++,
          role: 'VENDEDOR',
          percent: 4,
          amount: Number(((total * 4) / 100).toFixed(2)),
          created_at: o.data.toISOString(),
          order_num: o.numero,
          order: orderView,
          order_vendor: orderVendorView,
          client_vendor: clientVendorView,
          beneficiary_externo: clientVendor,
        })
      }
    }

    let data = computed
    if (!isAdmin && vendorExterno) {
      data = data.filter((r) => String(r.beneficiary_externo || '') === vendorExterno)
    }
    if (isAdmin && vendorExterno) {
      data = data.filter((r) => String(r.beneficiary_externo || '') === vendorExterno)
    }
    if (isAdmin && (roleParam === 'VENDEDOR' || roleParam === 'TELEVENDAS')) {
      data = data.filter((r) => r.role === roleParam)
    }
    data = data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return NextResponse.json({ ok: true, data })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Erro ao listar comissões' }, { status: 500 })
  }
}


