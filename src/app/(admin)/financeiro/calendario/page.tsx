'use client'

import IconifyIcon from '@/components/wrappers/IconifyIcon'
import { formatSqlYmdToPtBr } from '@/lib/calendarDate'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, Col, Form, Modal, Row, Spinner, Table } from 'react-bootstrap'
import { toast } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

function defaultMesYyyyMm(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}

function parseYm(yyyyMm: string): { y: number; mo: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(yyyyMm.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return null
  return { y, mo }
}

const moneyPt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

type BucketKey = 'a_receber' | 'recebido' | 'inadimplencia' | 'a_pagar' | 'a_pagar_realizado' | 'antecipado'

type LegendItem = { key: string; label: string; color: string }

type DayRow = { ymd: string; resultado: number } & Record<BucketKey, number>

type TotalsMes = Record<BucketKey, number> & { resultado: number }

const BUCKET_ORDER: BucketKey[] = ['a_receber', 'recebido', 'inadimplencia', 'a_pagar', 'a_pagar_realizado', 'antecipado']

function emptyTotals(): TotalsMes {
  return {
    a_receber: 0,
    recebido: 0,
    inadimplencia: 0,
    a_pagar: 0,
    a_pagar_realizado: 0,
    antecipado: 0,
    resultado: 0,
  }
}

function valorNoMes(item: LegendItem, tm: TotalsMes): number {
  if (item.key === 'resultado') return tm.resultado
  return tm[item.key as BucketKey] ?? 0
}

function mostrarCardMes(item: LegendItem, v: number): boolean {
  if (item.key === 'resultado') return Math.abs(v) > 0.0001
  return v > 0.0001
}

function parseTotalsMes(raw: unknown): TotalsMes | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  return {
    a_receber: Number(o.a_receber) || 0,
    recebido: Number(o.recebido) || 0,
    inadimplencia: Number(o.inadimplencia) || 0,
    a_pagar: Number(o.a_pagar) || 0,
    a_pagar_realizado: Number(o.a_pagar_realizado) || 0,
    antecipado: Number(o.antecipado) || 0,
    resultado: Number(o.resultado) || 0,
  }
}

function buildMonthCells(y: number, mo: number): Array<{ day: number | null; ymd: string | null }> {
  const first = new Date(y, mo - 1, 1)
  const startPad = first.getDay()
  const dim = new Date(y, mo, 0).getDate()
  const cells: Array<{ day: number | null; ymd: string | null }> = []
  for (let i = 0; i < startPad; i++) cells.push({ day: null, ymd: null })
  for (let d = 1; d <= dim; d++) {
    const ymd = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ day: d, ymd })
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, ymd: null })
  return cells
}

function tituloFiltroParcelas(bucket: string | null, legend: LegendItem[]): string {
  if (bucket == null) return 'Todas as parcelas do dia'
  const hit = legend.find((l) => l.key === bucket)
  return hit?.label ?? bucket
}

type PaymentStatusOption = { code: number; name: string }

type ParcelaDiaRow = {
  id: number
  id_payment: number
  income: number
  indice: number
  total: number
  payment_number: string
  emiter: string
  destine: string
  parcel_value: number
  parcel_date: string
  approved_date: string | null
  status: number
  bucket: string
  method: number
  method_name: string | null
  id_account: number | null
  account_name: string | null
  observation: string
}

type DiaModalState =
  | null
  | {
      mes: string
      diaYmd: string
      bucket: string | null
      titulo: string
      loading: boolean
      error: string | null
      rows: ParcelaDiaRow[]
      payment_statuses: PaymentStatusOption[]
    }

const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export default function FinanceiroCalendarioPage() {
  const [filterMes, setFilterMes] = useState(defaultMesYyyyMm)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [legend, setLegend] = useState<LegendItem[]>([])
  const [days, setDays] = useState<DayRow[]>([])
  const [totalsMes, setTotalsMes] = useState<TotalsMes | null>(null)
  const [diaModal, setDiaModal] = useState<DiaModalState>(null)
  const [statusSavingParcelId, setStatusSavingParcelId] = useState<number | null>(null)

  const ymParsed = useMemo(() => parseYm(filterMes) ?? parseYm(defaultMesYyyyMm())!, [filterMes])
  const cells = useMemo(() => buildMonthCells(ymParsed.y, ymParsed.mo), [ymParsed.y, ymParsed.mo])

  const dayMap = useMemo(() => new Map(days.map((d) => [d.ymd, d])), [days])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('mes', filterMes.trim() || defaultMesYyyyMm())
      const res = await fetch(`/api/financeiro/calendario?${params.toString()}`)
      if (res.status === 403) {
        setForbidden(true)
        setLegend([])
        setDays([])
        setTotalsMes(null)
        return
      }
      const json = await res.json().catch(() => null)
      if (json?.ok) {
        setForbidden(false)
        setLegend(Array.isArray(json.legend) ? json.legend : [])
        setDays(Array.isArray(json.days) ? json.days : [])
        const parsed = parseTotalsMes(json.totals_mes)
        setTotalsMes(parsed ?? emptyTotals())
      } else {
        setLegend([])
        setDays([])
        setTotalsMes(null)
      }
    } finally {
      setLoading(false)
    }
  }, [filterMes])

  useEffect(() => {
    void load()
  }, [load])

  const colorByKey = useMemo(() => {
    const m = new Map<string, string>()
    for (const it of legend) {
      m.set(it.key, it.color)
    }
    return m
  }, [legend])

  const abrirParcelasDia = useCallback(
    (diaYmd: string, bucket: string | null) => {
      const mes = filterMes.trim() || defaultMesYyyyMm()
      const titulo = tituloFiltroParcelas(bucket, legend)
      setDiaModal({
        mes,
        diaYmd,
        bucket,
        titulo,
        loading: true,
        error: null,
        rows: [],
        payment_statuses: [],
      })
      const params = new URLSearchParams()
      params.set('mes', mes)
      params.set('dia', diaYmd)
      if (bucket != null) params.set('bucket', bucket)
      void fetch(`/api/financeiro/calendario/parcelas-dia?${params.toString()}`)
        .then(async (res) => {
          const json = await res.json().catch(() => null)
          setDiaModal((prev) => {
            if (!prev || prev.diaYmd !== diaYmd || prev.bucket !== bucket) return prev
            if (!res.ok || !json?.ok) {
              return {
                ...prev,
                loading: false,
                error: json?.error ?? 'Não foi possível carregar as parcelas.',
                rows: [],
                payment_statuses: [],
              }
            }
            return {
              ...prev,
              loading: false,
              error: null,
              rows: Array.isArray(json.rows) ? json.rows : [],
              payment_statuses: Array.isArray(json.payment_statuses) ? json.payment_statuses : [],
            }
          })
        })
        .catch(() => {
          setDiaModal((prev) => {
            if (!prev || prev.diaYmd !== diaYmd || prev.bucket !== bucket) return prev
            return {
              ...prev,
              loading: false,
              error: 'Falha de rede ao carregar parcelas.',
              rows: [],
              payment_statuses: [],
            }
          })
        })
    },
    [filterMes, legend]
  )

  const fecharParcelasDia = () => setDiaModal(null)

  const patchParcelaStatus = async (parcelId: number, newStatus: number) => {
    if (statusSavingParcelId != null) return
    setStatusSavingParcelId(parcelId)
    try {
      const res = await fetch(`/api/financeiro/payment-date/${parcelId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (!res.ok || !json?.ok) {
        toast.error(json?.error ?? 'Não foi possível atualizar o status.', { position: 'top-right', autoClose: 4000 })
        return
      }
      setDiaModal((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          rows: prev.rows.map((r) => (r.id === parcelId ? { ...r, status: newStatus } : r)),
        }
      })
      toast.success('Status atualizado.', { position: 'top-right', autoClose: 2200 })
      void load()
    } finally {
      setStatusSavingParcelId(null)
    }
  }

  if (forbidden) {
    return (
      <Row>
        <Col xs={12}>
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
        <Col xs={12} md={6} xl={4}>
          <h4 className="mb-1">Calendário financeiro</h4>
        </Col>
        <Col xs={12} sm={6} md={4} xl={3} className="mt-3 mt-md-0">
          <Form.Group controlId="calendario-mes" className="mb-0">
            <Form.Label className="small text-muted mb-1">Mês</Form.Label>
            <Form.Control
              type="month"
              value={filterMes}
              onChange={(e) => setFilterMes(e.target.value)}
              disabled={loading}
            />
          </Form.Group>
        </Col>
        <Col xs={12} sm={6} md="auto" className="mt-3 mt-md-0 ms-md-auto">
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="d-inline-flex align-items-center gap-1"
          >
            <IconifyIcon icon="ri:refresh-line" className="fs-16" />
            Atualizar
          </Button>
        </Col>
      </Row>

      {totalsMes && (
        <Row className="g-2 mb-3">
          {legend.map((item) => {
            const v = valorNoMes(item, totalsMes)
            if (!mostrarCardMes(item, v)) return null
            return (
              <Col key={item.key} xs={6} md={4} lg>
                <Card className="border h-100">
                  <Card.Body className="py-2 px-3">
                    <div className="small text-muted text-truncate" title={item.label}>
                      <span
                        className="d-inline-block rounded me-1 align-middle"
                        style={{ width: 8, height: 8, backgroundColor: item.color }}
                      />{' '}
                      {item.label}
                    </div>
                    <div className="fw-semibold">{moneyPt.format(v)}</div>
                  </Card.Body>
                </Card>
              </Col>
            )
          })}
        </Row>
      )}

      <Card className="border-0 shadow-sm">
        <Card.Body>
          {loading ? (
            <div className="d-flex align-items-center justify-content-center gap-2 py-5 text-muted">
              <Spinner animation="border" size="sm" />
              Carregando…
            </div>
          ) : (
            <div className="table-responsive">
              <div
                className="financeiro-cal-root"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, minmax(5.5rem, 1fr))',
                  gap: 4,
                  minWidth: 'min(100%, 52rem)',
                }}
              >
                {WEEKDAYS_SHORT.map((w) => (
                  <div key={w} className="text-center small fw-semibold text-muted py-1">
                    {w}
                  </div>
                ))}
                {cells.map((c, idx) => {
                  if (c.day == null || c.ymd == null) {
                    return <div key={`e-${idx}`} className="rounded bg-light" style={{ minHeight: '6.25rem' }} />
                  }
                  const row = dayMap.get(c.ymd)
                  const totals = row
                    ? {
                        a_receber: row.a_receber,
                        recebido: row.recebido,
                        inadimplencia: row.inadimplencia,
                        a_pagar: row.a_pagar,
                        a_pagar_realizado: row.a_pagar_realizado,
                        antecipado: row.antecipado,
                      }
                    : emptyTotals()
                  const resultadoDia = row?.resultado ?? 0
                  const hasAny = BUCKET_ORDER.some((k) => totals[k] > 0.0001)
                  const mostrarResultadoDia = hasAny || Math.abs(resultadoDia) > 0.0001
                  const colRes = colorByKey.get('resultado') ?? '#495057'
                  return (
                    <div
                      key={c.ymd}
                      className="rounded border p-1 d-flex flex-column"
                      style={{ minHeight: mostrarResultadoDia ? '6.25rem' : '5.75rem', fontSize: '0.7rem' }}
                    >
                      <div className="text-end mb-1" style={{ fontSize: '0.8rem' }}>
                        <button
                          type="button"
                          className="fw-semibold border-0 bg-transparent p-0 text-body"
                          style={{ cursor: 'pointer' }}
                          title="Ver todas as parcelas deste vencimento"
                          onClick={() => void abrirParcelasDia(c.ymd, null)}
                        >
                          {c.day}
                        </button>
                      </div>
                      {!mostrarResultadoDia ? (
                        <span className="text-muted mt-auto align-self-center">—</span>
                      ) : (
                        <>
                          {hasAny ? (
                            <div className="d-flex flex-column gap-0">
                              {BUCKET_ORDER.map((k) => {
                                const val = totals[k]
                                if (val <= 0.0001) return null
                                const col = colorByKey.get(k) ?? '#333'
                                return (
                                  <button
                                    key={k}
                                    type="button"
                                    className="text-truncate text-start border-0 bg-transparent p-0 w-100"
                                    style={{
                                      color: col,
                                      fontSize: 'inherit',
                                      cursor: 'pointer',
                                    }}
                                    title={`Parcelas: ${legend.find((l) => l.key === k)?.label ?? k}`}
                                    onClick={() => void abrirParcelasDia(c.ymd, k)}
                                  >
                                    {moneyPt.format(val)}
                                  </button>
                                )
                              })}
                            </div>
                          ) : null}
                          <div className={`mt-auto pt-1 ${hasAny ? 'border-top border-secondary border-opacity-25' : ''}`}>
                            <div className="text-muted" style={{ fontSize: '0.62rem' }}>
                              Resultado
                            </div>
                            <button
                              type="button"
                              className="fw-semibold text-truncate text-start border-0 bg-transparent p-0 w-100"
                              style={{
                                color: colRes,
                                cursor: 'pointer',
                              }}
                              title="Parcelas que compõem o resultado do dia"
                              onClick={() => void abrirParcelasDia(c.ymd, 'resultado')}
                            >
                              {moneyPt.format(resultadoDia)}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </Card.Body>
      </Card>

      <Modal show={diaModal != null} onHide={fecharParcelasDia} centered size="xl" scrollable>
        <Modal.Header closeButton className="border-0 pb-0">
          <Modal.Title className="fs-5">Parcelas do dia</Modal.Title>
        </Modal.Header>
        <Modal.Body className="pt-2">
          {diaModal ? (
            <>
              <p className="text-muted small mb-2">
                <strong>{formatSqlYmdToPtBr(diaModal.diaYmd)}</strong>
                {' · '}
                <span className="text-capitalize">{diaModal.titulo}</span>
              </p>
              {diaModal.loading ? (
                <div className="d-flex align-items-center justify-content-center gap-2 py-4 text-muted">
                  <Spinner animation="border" size="sm" />
                  Carregando…
                </div>
              ) : diaModal.error ? (
                <div className="text-danger small">{diaModal.error}</div>
              ) : diaModal.rows.length === 0 ? (
                <div className="text-muted small">Nenhuma parcela para este filtro.</div>
              ) : (
                <div className="table-responsive rounded border">
                  <Table size="sm" className="mb-0 align-middle">
                    <thead className="table-light">
                      <tr>
                        <th className="text-nowrap">#</th>
                        <th className="text-nowrap">Tipo</th>
                        <th className="text-nowrap">Nº pag.</th>
                        <th>Emitente</th>
                        <th>Destino</th>
                        <th className="text-nowrap">Vencimento</th>
                        <th className="text-nowrap">Dt. pagamento</th>
                        <th className="text-nowrap">Valor</th>
                        <th>Meio</th>
                        <th>Conta</th>
                        <th>Obs.</th>
                        <th className="text-nowrap" style={{ minWidth: '9.5rem' }}>
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {diaModal.rows.map((p) => {
                        const obs = (p.observation || '').trim()
                        const podeObs = obs.length > 0
                        return (
                          <tr key={p.id}>
                            <td className="text-nowrap">
                              {p.indice}/{p.total}
                            </td>
                            <td>
                              {p.income === 0 ? (
                                <Badge bg="danger">A pagar</Badge>
                              ) : p.bucket === 'inadimplencia' ? (
                                <Badge className="text-white" style={{ backgroundColor: '#fd7e14' }}>
                                  Inadimplência
                                </Badge>
                              ) : (
                                <Badge bg="success">A receber</Badge>
                              )}
                            </td>
                            <td className="text-nowrap">{p.payment_number}</td>
                            <td className="text-break small" style={{ maxWidth: 140 }}>
                              {p.emiter}
                            </td>
                            <td className="text-break small" style={{ maxWidth: 140 }}>
                              {p.destine}
                            </td>
                            <td className="text-nowrap small">{formatSqlYmdToPtBr(p.parcel_date)}</td>
                            <td className="text-nowrap small">{formatSqlYmdToPtBr(p.approved_date)}</td>
                            <td className="text-nowrap">{moneyPt.format(p.parcel_value)}</td>
                            <td className="small text-nowrap">
                              {p.method_name ? `${p.method_name} (${p.method})` : p.method}
                            </td>
                            <td className="small text-break" style={{ maxWidth: 120 }}>
                              {p.account_name ?? (p.id_account != null ? `#${p.id_account}` : '—')}
                            </td>
                            <td className="text-center p-1">
                              <span className="d-inline-block text-truncate" style={{ maxWidth: 72 }} title={obs || undefined}>
                                {podeObs ? (
                                  <Button
                                    type="button"
                                    variant="outline-secondary"
                                    size="sm"
                                    className="py-0 px-1"
                                    title={obs}
                                    onClick={() => toast.info(obs, { position: 'top-right', autoClose: 8000, style: { whiteSpace: 'pre-wrap' } })}
                                  >
                                    Ver
                                  </Button>
                                ) : (
                                  '—'
                                )}
                              </span>
                            </td>
                            <td className="py-1">
                              <Form.Select
                                size="sm"
                                className="min-w-0"
                                style={{ minWidth: '9rem' }}
                                value={String(p.status)}
                                disabled={
                                  diaModal.loading ||
                                  diaModal.payment_statuses.length === 0 ||
                                  statusSavingParcelId === p.id
                                }
                                onChange={(e) => {
                                  const v = Number(e.target.value)
                                  if (!Number.isFinite(v) || v === p.status) return
                                  void patchParcelaStatus(p.id, v)
                                }}
                              >
                                {!diaModal.payment_statuses.some((s) => s.code === p.status) ? (
                                  <option value={String(p.status)}>Código {p.status}</option>
                                ) : null}
                                {diaModal.payment_statuses.map((s) => (
                                  <option key={s.code} value={String(s.code)}>
                                    {s.name}
                                  </option>
                                ))}
                              </Form.Select>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </Table>
                </div>
              )}
            </>
          ) : null}
        </Modal.Body>
        <Modal.Footer className="border-0 pt-0">
          <Button variant="secondary" size="sm" onClick={fecharParcelasDia}>
            Fechar
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
