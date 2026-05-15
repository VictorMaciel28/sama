'use client'

import IconifyIcon from '@/components/wrappers/IconifyIcon'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, Col, Form, Modal, Row, Spinner, Table } from 'react-bootstrap'

function defaultMesYyyyMm(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}

function formatMesLabel(yyyyMm: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(yyyyMm.trim())
  if (!m) return yyyyMm
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1)
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

const moneyPt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

type PayRow = {
  id: number
  number: string
  emiter: string
  destine: string
  method: number
  method_name: string | null
  observation: string
  id_account: number | null
  account_name: string | null
  url_danfe_tiny: string | null
  id_nota_fiscal_tiny: string | null
  parcel_label: string
  parcel_total: number
}

type ObsModalState = { number: string; destine: string; observation: string } | null

type ParcelaApiRow = {
  id: number
  indice: number
  total: number
  number: string
  parcel_value: number
  parcel_date: string
  approved_date: string | null
  status: number
  insert_date: string | null
  in_filtered_month: boolean
}

type ParcelsModalState =
  | null
  | {
      paymentId: number
      loading: boolean
      error: string | null
      payment: { id: number; number: string; destine: string; emiter: string } | null
      parcels: ParcelaApiRow[]
    }

export default function FinanceiroAPagarPage() {
  const [destines, setDestines] = useState<string[]>([])
  const [rows, setRows] = useState<PayRow[]>([])
  const [filterDestine, setFilterDestine] = useState('')
  const [filterMes, setFilterMes] = useState(defaultMesYyyyMm)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [obsModal, setObsModal] = useState<ObsModalState>(null)
  const [parcelsModal, setParcelsModal] = useState<ParcelsModalState>(null)

  const mesLegenda = useMemo(() => formatMesLabel(filterMes), [filterMes])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('mes', filterMes.trim() || defaultMesYyyyMm())
      if (filterDestine.trim()) params.set('destine', filterDestine.trim())
      const res = await fetch(`/api/financeiro/a-pagar?${params.toString()}`)
      if (res.status === 403) {
        setForbidden(true)
        setDestines([])
        setRows([])
        return
      }
      const json = await res.json().catch(() => null)
      if (json?.ok) {
        setForbidden(false)
        setDestines(Array.isArray(json.destines) ? json.destines : [])
        setRows(Array.isArray(json.data) ? json.data : [])
      } else {
        setDestines([])
        setRows([])
      }
    } finally {
      setLoading(false)
    }
  }, [filterDestine, filterMes])

  useEffect(() => {
    load()
  }, [load])

  const abrirParcelas = (paymentId: number) => {
    setParcelsModal({
      paymentId,
      loading: true,
      error: null,
      payment: null,
      parcels: [],
    })
    const params = new URLSearchParams()
    params.set('mes', filterMes.trim() || defaultMesYyyyMm())
    fetch(`/api/financeiro/a-pagar/${paymentId}/parcelas?${params.toString()}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null)
        if (!res.ok || !json?.ok) {
          setParcelsModal((prev) =>
            prev && prev.paymentId === paymentId
              ? {
                  ...prev,
                  loading: false,
                  error: json?.error ?? 'Não foi possível carregar as parcelas.',
                  payment: null,
                  parcels: [],
                }
              : prev
          )
          return
        }
        setParcelsModal({
          paymentId,
          loading: false,
          error: null,
          payment: json.payment ?? null,
          parcels: Array.isArray(json.parcels) ? json.parcels : [],
        })
      })
      .catch(() => {
        setParcelsModal((prev) =>
          prev && prev.paymentId === paymentId
            ? {
                ...prev,
                loading: false,
                error: 'Falha de rede ao carregar parcelas.',
                payment: null,
                parcels: [],
              }
            : prev
        )
      })
  }

  const fecharParcelas = () => setParcelsModal(null)

  if (forbidden) {
    return (
      <Row>
        <Col>
          <Card className="border-0 shadow-sm">
            <Card.Body>
              <div className="alert alert-warning mb-0">Acesso restrito a administradores.</div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    )
  }

  return (
    <>
      <Row className="mb-4 align-items-end">
        <Col xs={12} xl={4}>
          <h4 className="mb-1">A pagar</h4>

        </Col>
        <Col xs={12} sm={6} xl className="mt-3 mt-xl-0">
          <Form.Group controlId="filtro-mes" className="mb-0">
            <Form.Label className="small text-muted mb-1">Mês Referente</Form.Label>
            <Form.Control
              type="month"
              value={filterMes}
              onChange={(e) => setFilterMes(e.target.value)}
              disabled={loading}
            />
          </Form.Group>
        </Col>
        <Col xs={12} sm={6} xl className="mt-3 mt-xl-0">
          <Form.Group controlId="filtro-destine" className="mb-0">
            <Form.Label className="small text-muted mb-1">Empresa</Form.Label>
            <Form.Select
              value={filterDestine}
              onChange={(e) => setFilterDestine(e.target.value)}
              disabled={loading}
            >
              <option value="">Todas as empresas</option>
              {destines.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>
      </Row>

      <Card className="border-0 shadow-sm">
        <Card.Body>
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
            <span className="text-muted small">
              {loading ? 'Carregando…' : `${rows.length} registro(s)`}
            </span>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => load()}
              disabled={loading}
              className="d-inline-flex align-items-center gap-1"
            >
              <IconifyIcon icon="ri:refresh-line" className="fs-16" />
              Atualizar
            </Button>
          </div>

          {loading ? (
            <div className="d-flex align-items-center justify-content-center gap-2 py-5 text-muted">
              <Spinner animation="border" size="sm" />
              Carregando…
            </div>
          ) : rows.length === 0 ? (
            <div className="text-muted py-4 text-center">
              Nenhum registro com income = 0 e parcela no mês selecionado para o filtro de empresa.
            </div>
          ) : (
            <div className="table-responsive rounded border">
              <Table hover className="align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Destino</th>
                    <th className="text-nowrap">Número</th>
                    <th>Emitente</th>
                    <th>Meio</th>
                    <th>Conta</th>
                    <th className="text-nowrap">NF-e</th>
                    <th>Parcela</th>
                    <th className="text-center text-nowrap" style={{ width: 56 }}>
                      Obs.
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const hasObs = Boolean(r.observation?.trim())
                    const podeParcelas = r.parcel_total > 0
                    return (
                      <tr key={r.id}>
                        <td className="text-break" style={{ maxWidth: 220 }}>
                          {r.destine}
                        </td>
                        <td>{r.number}</td>
                        <td className="text-break" style={{ maxWidth: 220 }}>
                          {r.emiter}
                        </td>
                        <td className="text-nowrap small">
                          {r.method_name ? `${r.method_name} (${r.method})` : r.method}
                        </td>
                        <td className="text-break small" style={{ maxWidth: 180 }}>
                          {r.account_name ?? (r.id_account != null ? `#${r.id_account}` : '—')}
                        </td>
                        <td>
                          {r.url_danfe_tiny ? (
                            <a href={r.url_danfe_tiny} target="_blank" rel="noreferrer" className="small">
                              DANFE
                            </a>
                          ) : (
                            <span className="text-muted small">{r.id_nota_fiscal_tiny ?? '—'}</span>
                          )}
                        </td>
                        <td className="small">
                          {podeParcelas ? (
                            <Button
                              type="button"
                              variant="link"
                              className="p-0 text-decoration-none"
                              onClick={() => abrirParcelas(r.id)}
                            >
                              {r.parcel_label}
                            </Button>
                          ) : (
                            <span className="text-muted">{r.parcel_label}</span>
                          )}
                        </td>
                        <td className="text-center p-2">
                          <Button
                            type="button"
                            variant={hasObs ? 'outline-primary' : 'light'}
                            size="sm"
                            className="p-2 rounded-circle"
                            title={hasObs ? 'Ver observação' : 'Sem observação'}
                            disabled={!hasObs}
                            onClick={() =>
                              hasObs &&
                              setObsModal({
                                number: r.number,
                                destine: r.destine,
                                observation: r.observation.trim(),
                              })
                            }
                          >
                            <IconifyIcon icon="ri:file-text-line" className="fs-18" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </div>
          )}
        </Card.Body>
      </Card>

      <Modal show={obsModal != null} onHide={() => setObsModal(null)} centered>
        <Modal.Header closeButton className="border-0 pb-0">
          <Modal.Title className="fs-5">Observação</Modal.Title>
        </Modal.Header>
        <Modal.Body className="pt-2">
          {obsModal ? (
            <>
              <p className="text-muted small mb-3">
                Pagamento nº <strong>{obsModal.number}</strong>
                {obsModal.destine ? (
                  <>
                    {' '}
                    · <span className="text-break">{obsModal.destine}</span>
                  </>
                ) : null}
              </p>
              <div
                className="rounded border bg-light p-3 small"
                style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              >
                {obsModal.observation}
              </div>
            </>
          ) : null}
        </Modal.Body>
        <Modal.Footer className="border-0 pt-0">
          <Button variant="secondary" size="sm" onClick={() => setObsModal(null)}>
            Fechar
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={parcelsModal != null} onHide={fecharParcelas} centered size="lg">
        <Modal.Header closeButton className="border-0 pb-0">
          <Modal.Title className="fs-5">Parcelas</Modal.Title>
        </Modal.Header>
        <Modal.Body className="pt-2">
          {parcelsModal?.loading ? (
            <div className="d-flex align-items-center justify-content-center gap-2 py-4 text-muted">
              <Spinner animation="border" size="sm" />
              Carregando…
            </div>
          ) : parcelsModal?.error ? (
            <div className="text-danger small">{parcelsModal.error}</div>
          ) : parcelsModal?.payment ? (
            <>
              <p className="text-muted small mb-3">
                <span className="text-break fw-medium">{parcelsModal.payment.destine}</span>
                <br />
                Número {parcelsModal.payment.number} · {parcelsModal.payment.emiter}
              </p>
              <p className="small text-muted mb-2">
                Destaque: parcelas com vencimento em{' '}
                <strong className="text-capitalize">{mesLegenda}</strong> (filtro de mês atual da
                lista).
              </p>
              <div className="table-responsive rounded border">
                <Table size="sm" className="mb-0 align-middle">
                  <thead className="table-light">
                    <tr>
                      <th>#</th>
                      <th>Vencimento</th>
                      <th>Valor</th>
                      <th>Status</th>
                      <th>Aprovado</th>
                      <th>Nº (parcela)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parcelsModal.parcels.map((p) => (
                      <tr key={p.id} className={p.in_filtered_month ? 'table-primary' : undefined}>
                        <td>
                          {p.indice}/{p.total}
                          {p.in_filtered_month ? (
                            <Badge bg="primary" className="ms-1">
                              mês
                            </Badge>
                          ) : null}
                        </td>
                        <td className="text-nowrap">{p.parcel_date}</td>
                        <td className="text-nowrap">{moneyPt.format(p.parcel_value)}</td>
                        <td>{p.status}</td>
                        <td className="text-nowrap">{p.approved_date ?? '—'}</td>
                        <td>{p.number}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </>
          ) : null}
        </Modal.Body>
        <Modal.Footer className="border-0 pt-0">
          <Button variant="secondary" size="sm" onClick={fecharParcelas}>
            Fechar
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
