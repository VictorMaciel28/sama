'use client'

import IconifyIcon from '@/components/wrappers/IconifyIcon'
import { subscribeEmbalagemListaUpdates } from '@/lib/embalagemListaBroadcast'
import type { EmbalagemListaRow } from '@/lib/embalagemListaQuery'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Button, Card, Col, Row } from 'react-bootstrap'
import EmbalagemListaView from './components/EmbalagemListaView'

type Props = {
  /** Dados vindos do Server Component (`page.tsx`); atualizados com `router.refresh()`. */
  initialRows?: EmbalagemListaRow[]
}

export default function EmbalagemListClient({ initialRows }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [rows, setRows] = useState<EmbalagemListaRow[]>(() => initialRows ?? [])
  const [loading, setLoading] = useState(initialRows === undefined)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  /** Fallback se o servidor não passou dados (ex.: sessão indisponível no RSC). */
  const loadFromApi = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/estoque/embalagem', { cache: 'no-store' })
      const json = await res.json().catch(() => null)
      if (!mounted.current) return
      if (json?.ok && Array.isArray(json.data)) setRows(json.data)
      else setRows([])
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (initialRows === undefined) {
      void loadFromApi()
    }
  }, [initialRows, loadFromApi])

  useEffect(() => {
    if (initialRows !== undefined) {
      setRows(initialRows)
    }
  }, [initialRows])

  const refreshFromServer = useCallback(() => {
    startTransition(() => {
      router.refresh()
    })
  }, [router])

  useEffect(() => {
    return subscribeEmbalagemListaUpdates(() => {
      refreshFromServer()
    })
  }, [refreshFromServer])

  const showLoading = loading || isPending

  return (
    <>
      <Row className="mb-4 align-items-center">
        <Col>
          <h4 className="mb-0">Embalagem</h4>
        </Col>
        <Col xs="auto">
          <Button
            variant="outline-secondary"
            size="sm"
            className="d-inline-flex align-items-center gap-1"
            type="button"
            onClick={() => refreshFromServer()}
            disabled={showLoading}
          >
            <IconifyIcon icon="ri:refresh-line" className="fs-16" />
            Atualizar
          </Button>
        </Col>
      </Row>

      <Card className="border-0 shadow-sm">
        <Card.Body>
          <EmbalagemListaView rows={rows} loading={showLoading} />
        </Card.Body>
      </Card>
    </>
  )
}
