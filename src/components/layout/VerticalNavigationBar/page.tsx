import LogoBox from '@/components/LogoBox'
import React from 'react'
import HoverMenuToggle from './components/HoverMenuToggle'
import SimplebarReactClient from '@/components/wrappers/SimplebarReactClient'
import AppMenu from './components/AppMenu'
import { getMenuItems } from '@/helpers/Manu'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { prisma } from '@/lib/prisma'
import { vendedorAccessKey } from '@/lib/vendedorAccessKey'

const page = async () => {
  const session = (await getServerSession(options as any)) as any
  const email = session?.user?.email || null

  let nivel: 'ADMINISTRADOR' | 'SUPERVISOR' | null = null
  let tipo: string | null = null
  if (email) {
    const vend = await prisma.vendedor.findFirst({
      where: { email },
      select: { id: true, id_vendedor_externo: true },
    })
    if (vend) {
      const accessKey = vendedorAccessKey(vend)
      const [nivelRow, tipoRow] = await Promise.all([
        prisma.vendedor_nivel_acesso.findUnique({
          where: { id_vendedor_externo: accessKey },
          select: { nivel: true },
        }),
        prisma.vendedor_tipo_acesso.findUnique({
          where: { id_vendedor_externo: accessKey },
          select: { tipo: true },
        }),
      ])
      if (nivelRow?.nivel === 'ADMINISTRADOR' || nivelRow?.nivel === 'SUPERVISOR') {
        nivel = nivelRow.nivel
      }
      tipo = tipoRow?.tipo ?? null
    }
  }

  const menuItems = getMenuItems().filter((item) => {
    if (tipo === 'VENDEDOR_COMERCIAL') {
      return item.key === 'comercial'
    }
    if (item.key === 'administracao' || item.key === 'suprimentos' || item.key === 'financeiro') {
      return nivel === 'ADMINISTRADOR'
    }
    if (item.key === 'supervisao') {
      return nivel === 'ADMINISTRADOR' || nivel === 'SUPERVISOR'
    }
    return true
  })

  return (
    <div className="main-nav" id="leftside-menu-container">
      <LogoBox />
      <HoverMenuToggle />
      <SimplebarReactClient className="scrollbar" data-simplebar>
        <AppMenu menuItems={menuItems} />
      </SimplebarReactClient>
    </div>
  )
}

export default page
