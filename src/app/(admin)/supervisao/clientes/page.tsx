'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SupervisaoClientesRedirectPage() {
  const router = useRouter()
  const [msg, setMsg] = useState('Redirecionando…')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/me/vendedor')
        const json = await res.json()
        const ext = json?.data?.id_vendedor_externo
        if (cancelled) return
        if (ext) {
          router.replace(`/supervisor/${encodeURIComponent(String(ext))}/clientes`)
        } else {
          setMsg('Não foi possível identificar seu perfil. Abra Supervisão › Vendas e use as abas.')
          router.replace('/supervisao/vendas')
        }
      } catch {
        if (!cancelled) {
          setMsg('Erro ao redirecionar.')
          router.replace('/supervisao/vendas')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [router])

  return (
    <div className="p-3">
      <p className="text-muted">{msg}</p>
    </div>
  )
}
