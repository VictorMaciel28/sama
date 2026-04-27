'use client'

import PageTitle from '@/components/PageTitle'
import PosVendaFlow from '@/components/pos-venda/PosVendaFlow'

export default function AdminPosVendaPage() {
  return (
    <>
      <PageTitle title="Pós venda" subName="Vendas" />
      <PosVendaFlow variant="admin" />
    </>
  )
}
