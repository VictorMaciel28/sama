'use client'

import IconifyIcon from '@/components/wrappers/IconifyIcon'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  Col,
  Form,
  Modal,
  Row,
  Spinner,
  Table,
} from 'react-bootstrap'
import { toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import SeparacaoListaView, { type SeparacaoListaRow } from './components/SeparacaoListaView'

type PedidoDisp = {
  numero: number
  cliente: string
  data: string
  representante: string
}

export default function SeparacaoListClient() {
  const router = useRouter()
  const [rows, setRows] = useState<SeparacaoListaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [pedidosDisp, setPedidosDisp] = useState<PedidoDisp[]>([])
  const [loadingPedidos, setLoadingPedidos] = useState(false)
  const [selected, setSelected] = useState<Record<number, boolean>>({})
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/estoque/separacoes')
      const json = await res.json().catch(() => null)
      if (json?.ok && Array.isArray(json.data)) setRows(json.data)
      else setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    try {
      if (sessionStorage.getItem('separacao_pronto_embalagem') !== '1') return
      sessionStorage.removeItem('separacao_pronto_embalagem')
      toast.success('Separação concluída. Enviada para embalagem.', {
        position: 'top-right',
        autoClose: 4000,
      })
    } catch {
      /* ignore */
    }
  }, [])

  const openModal = async () => {
    setModalOpen(true)
    setSelected({})
    setLoadingPedidos(true)
    try {
      const res = await fetch('/api/estoque/separacoes/pedidos-disponiveis')
      const json = await res.json().catch(() => null)
      setPedidosDisp(json?.ok && Array.isArray(json.data) ? json.data : [])
    } finally {
      setLoadingPedidos(false)
    }
  }

  const toggle = (numero: number) => {
    setSelected((s) => ({ ...s, [numero]: !s[numero] }))
  }

  const selecionados = useMemo(() => Object.keys(selected).filter((k) => selected[Number(k)]).map(Number), [selected])

  const iniciar = async () => {
    if (selecionados.length === 0) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/estoque/separacoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_numeros: selecionados }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        alert(json?.error ?? 'Não foi possível iniciar a separação.')
        return
      }
      setModalOpen(false)
      router.push(`/estoque/separacao/${json.id}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Row className="mb-4 align-items-center">
        <Col xs={12} md>
          <h4 className="mb-0">Separação</h4>
        </Col>
        <Col xs={12} md="auto" className="mt-2 mt-md-0">
          <Button variant="primary" className="d-inline-flex align-items-center gap-2" onClick={openModal}>
            <IconifyIcon icon="ri:add-line" className="fs-18" />
            Nova separação
          </Button>
        </Col>
      </Row>

      <Card className="border-0 shadow-sm">
        <Card.Body>
          <SeparacaoListaView rows={rows} loading={loading} />
        </Card.Body>
      </Card>

      <Modal show={modalOpen} onHide={() => !submitting && setModalOpen(false)} size="lg" scrollable centered>
        <Modal.Header closeButton>
          <Modal.Title>Nova separação</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {loadingPedidos ? (
            <div className="d-flex justify-content-center py-5 text-muted gap-2">
              <Spinner animation="border" size="sm" />
              Carregando…
            </div>
          ) : pedidosDisp.length === 0 ? (
            <div className="text-muted py-3 text-center">—</div>
          ) : (
            <>
              <div className="d-none d-md-block table-responsive rounded border mb-0">
                <Table size="sm" className="mb-0 align-middle">
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: 48 }} />
                      <th>Nº</th>
                      <th>Cliente</th>
                      <th>Representante</th>
                      <th>Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedidosDisp.map((p) => (
                      <tr key={p.numero}>
                        <td>
                          <Form.Check
                            type="checkbox"
                            checked={!!selected[p.numero]}
                            onChange={() => toggle(p.numero)}
                            aria-label={`Pedido ${p.numero}`}
                          />
                        </td>
                        <td className="fw-medium">{p.numero}</td>
                        <td className="text-break" style={{ maxWidth: 220 }}>
                          {p.cliente}
                        </td>
                        <td className="text-break small" style={{ maxWidth: 180 }}>
                          {p.representante}
                        </td>
                        <td className="text-nowrap small">{p.data}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>

              <div className="d-md-none d-flex flex-column gap-2">
                {pedidosDisp.map((p) => (
                  <label
                    key={p.numero}
                    className="d-flex align-items-start gap-3 rounded border p-3 mb-0"
                    style={{ cursor: 'pointer', minHeight: 52 }}
                  >
                    <Form.Check type="checkbox" checked={!!selected[p.numero]} onChange={() => toggle(p.numero)} />
                    <div className="flex-grow-1 min-w-0">
                      <div className="fw-semibold">#{p.numero}</div>
                      <div className="text-break small text-muted">{p.cliente}</div>
                      <div className="text-break small mt-1">{p.representante}</div>
                      <div className="small text-muted mt-1">{p.data}</div>
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}
        </Modal.Body>
        <Modal.Footer className="flex-wrap gap-2">
          <span className="text-muted small me-auto">{selecionados.length}</span>
          <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={iniciar} disabled={submitting || selecionados.length === 0}>
            {submitting ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                …
              </>
            ) : (
              'Iniciar separação'
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
