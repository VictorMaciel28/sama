import { PrismaClient } from '@prisma/client'

const p = new PrismaClient()
try {
  const rows = await p.vendedor.findMany({
    orderBy: { id: 'desc' },
    take: 10,
    select: { id: true, nome: true, email: true, id_vendedor_externo: true, senha_encrypted: true },
  })
  console.log('vendedores:', JSON.stringify(rows.map((r) => ({ ...r, senha_encrypted: r.senha_encrypted ? 'set' : null })), null, 2))
  const tipos = await p.vendedor_tipo_acesso.findMany({ take: 15 })
  console.log('tipos:', JSON.stringify(tipos, null, 2))
  const niveles = await p.vendedor_nivel_acesso.findMany({ take: 15 })
  console.log('niveles:', JSON.stringify(niveles, null, 2))
  const local222Tipo = await p.vendedor_tipo_acesso.findUnique({ where: { id_vendedor_externo: 'local:222' } })
  console.log('local:222 tipo', local222Tipo)
  try {
    await p.vendedor_tipo_acesso.upsert({
      where: { id_vendedor_externo: 'local:222-test' },
      update: { tipo: 'VENDEDOR_COMERCIAL' },
      create: { id_vendedor_externo: 'local:222-test', tipo: 'VENDEDOR_COMERCIAL' },
    })
    console.log('VENDEDOR_COMERCIAL enum OK')
    await p.vendedor_tipo_acesso.delete({ where: { id_vendedor_externo: 'local:222-test' } })
  } catch (e) {
    console.log('VENDEDOR_COMERCIAL enum FAIL', e.message)
  }
} catch (e) {
  console.error('ERR', e.message)
} finally {
  await p.$disconnect()
}
