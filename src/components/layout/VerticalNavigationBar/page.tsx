import LogoBox from '@/components/LogoBox'
import React from 'react'
import HoverMenuToggle from './components/HoverMenuToggle'
import SimplebarReactClient from '@/components/wrappers/SimplebarReactClient'
import AppMenu from './components/AppMenu'
import { getMenuItems } from '@/helpers/Manu'
import { getServerSession } from 'next-auth'
import { options } from '@/app/api/auth/[...nextauth]/options'
import { prisma } from '@/lib/prisma'

const page = async () => {
  const session = (await getServerSession(options as any)) as any
  const email = session?.user?.email || null

  let nivel: 'ADMINISTRADOR' | 'SUPERVISOR' | null = null
  if (email) {
    const vend = await prisma.vendedor.findFirst({
      where: { email },
      select: { id_vendedor_externo: true },
    })
    if (vend?.id_vendedor_externo) {
      const nivelRow = await prisma.vendedor_nivel_acesso.findUnique({
        where: { id_vendedor_externo: vend.id_vendedor_externo },
        select: { nivel: true },
      })
      if (nivelRow?.nivel === 'ADMINISTRADOR' || nivelRow?.nivel === 'SUPERVISOR') {
        nivel = nivelRow.nivel
      }
    }
  }

  const menuItems = getMenuItems().filter((item) => {
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
