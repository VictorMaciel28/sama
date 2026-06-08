'use client'

import { useSession } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

const COMERCIAL_HOME = '/comercial/orcamentos'

export default function ComercialRouteGuard() {
  const { status } = useSession()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (status !== 'authenticated') return
    if (pathname.startsWith('/comercial')) return

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/me/vendedor', { cache: 'no-store' })
        const json = await res.json()
        if (cancelled) return
        if (json?.ok && json?.data?.tipo === 'VENDEDOR_COMERCIAL') {
          router.replace(COMERCIAL_HOME)
        }
      } catch {
        /* ignore */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [status, pathname, router])

  return null
}
