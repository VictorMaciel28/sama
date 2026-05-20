import { options } from '@/app/api/auth/[...nextauth]/options'
import { getEmbalagemListaPayload } from '@/lib/embalagemListaQuery'
import { getServerSession } from 'next-auth'
import EmbalagemListClient from './EmbalagemListClient'

export const dynamic = 'force-dynamic'

export default async function EstoqueEmbalagemPage() {
  const session = (await getServerSession(options as any)) as { user?: { id?: string } } | null
  const initialRows = session?.user?.id ? await getEmbalagemListaPayload() : undefined

  return <EmbalagemListClient initialRows={initialRows} />
}
