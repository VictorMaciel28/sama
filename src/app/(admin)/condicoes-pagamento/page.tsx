'use client'

import { useEffect, useState, useRef } from 'react'
import { Accordion } from 'react-bootstrap'
import { PAYMENT_ADMIN_TIER_LABELS, PAYMENT_ADMIN_TIER_ORDER } from '@/lib/paymentConditions'

type PaymentConditionRow = {
  id?: number | null
  name: string
  admin_tier: number
  valor_minimo?: string | number | null
}

function normalizeRowsFromApi(data: unknown[]): PaymentConditionRow[] {
  return (data || []).map((row: any) => ({
    id: row.id != null ? Number(row.id) : null,
    name: String(row.name ?? ''),
    admin_tier: Number(row.admin_tier ?? 0) === 2 ? 2 : Number(row.admin_tier ?? 0) === 1 ? 1 : 0,
    valor_minimo:
      row.valor_minimo != null && !Number.isNaN(Number(row.valor_minimo))
        ? String(Number(row.valor_minimo))
        : '',
  }))
}

function globalRowIndex(rows: PaymentConditionRow[], tier: number, indexInTier: number): number {
  let seen = -1
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].admin_tier !== tier) continue
    seen++
    if (seen === indexInTier) return i
  }
  return -1
}

export default function CondicoesPagamentoPage() {
  const [rows, setRows] = useState<PaymentConditionRow[]>([])
  const [saving, setSaving] = useState(false)
  const originalRef = useRef<Record<number, { name: string; admin_tier: number; valor_minimo: number | null }>>({})

  async function load() {
    const res = await fetch('/api/condicoes-pagamento')
    const json = await res.json()
    if (json?.ok) {
      setRows(normalizeRowsFromApi(json.data || []))
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    originalRef.current = {}
    rows.forEach((r) => {
      if (r.id) {
        const vm = r.valor_minimo
        const vmNum = vm === '' || vm == null || Number.isNaN(Number(vm)) ? null : Number(vm)
        originalRef.current[Number(r.id)] = {
          name: r.name,
          admin_tier: r.admin_tier,
          valor_minimo: vmNum,
        }
      }
    })
  }, [rows])

  function handleAdd(tier: number) {
    setRows((prev) => [...prev, { id: null, name: '', admin_tier: tier, valor_minimo: '' }])
  }

  async function handleRemove(tier: number, indexInTier: number) {
    setRows((prev) => {
      const g = globalRowIndex(prev, tier, indexInTier)
      if (g < 0) return prev
      const row = prev[g]
      const next = prev.filter((_, i) => i !== g)
      if (row?.id) {
        void (async () => {
          try {
            const res = await fetch('/api/condicoes-pagamento', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ create: [], update: [], delete: [Number(row.id)] }),
            })
            const json = await res.json()
            if (json?.ok) {
              setRows(normalizeRowsFromApi(json.data || []))
            } else {
              alert('Falha ao remover: ' + (json?.error || 'erro'))
            }
          } catch {
            alert('Erro ao remover')
          }
        })()
        return prev
      }
      return next
    })
  }

  function parseValorMinimoPayload(raw: string | number | null | undefined): number | null {
    if (raw === '' || raw == null) return null
    const n = Number(raw)
    return Number.isNaN(n) || n <= 0 ? null : n
  }

  /** Apenas estado local — sem POST ao digitar (evita `setRows` com resposta da API no meio da digitação e valor “pulando”). Use “Salvar alterações pendentes”. */
  function handleChange(tier: number, indexInTier: number, field: 'name' | 'valor_minimo', value: string) {
    setRows((prev) => {
      const g = globalRowIndex(prev, tier, indexInTier)
      if (g < 0) return prev
      const next = [...prev]
      next[g] = { ...next[g], [field]: value }
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const toCreate = rows
        .filter((r) => !r.id && String(r.name || '').trim() !== '')
        .map((r) => ({
          name: String(r.name).trim(),
          admin_tier: r.admin_tier,
          valor_minimo: parseValorMinimoPayload(r.valor_minimo),
        }))
      const toUpdate = rows
        .filter((r) => r.id)
        .map((r) => ({
          id: Number(r.id),
          name: String(r.name).trim(),
          admin_tier: r.admin_tier,
          valor_minimo: parseValorMinimoPayload(r.valor_minimo),
        }))
        .filter((r) => {
          const orig = originalRef.current[r.id]
          const vm = parseValorMinimoPayload(r.valor_minimo)
          const nameTrim = String(r.name || '').trim()
          return (
            !orig ||
            String(orig.name || '').trim() !== nameTrim ||
            orig.admin_tier !== r.admin_tier ||
            (orig.valor_minimo ?? null) !== (vm ?? null)
          )
        })

      const res = await fetch('/api/condicoes-pagamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ create: toCreate, update: toUpdate, delete: [] }),
      })
      const json = await res.json()
      if (json?.ok) {
        await load()
      } else {
        alert('Falha ao salvar: ' + (json?.error || 'erro'))
      }
    } catch {
      alert('Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="py-4">
      <div className="card border-0 shadow-sm">
        <div className="card-body">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <div>
              <h4 className="mb-0">Condições de pagamento</h4>
              <small className="text-muted">
                Cadastre o parcelamento e o valor mínimo do pedido em cada faixa de taxa administrativa. Clique em{' '}
                <strong>Salvar alterações pendentes</strong> para gravar no servidor.
              </small>
            </div>
          </div>

          <Accordion defaultActiveKey="0" alwaysOpen className="mb-3">
            {PAYMENT_ADMIN_TIER_ORDER.map((tier) => {
              const tierRows = rows.filter((r) => r.admin_tier === tier)
              return (
                <Accordion.Item eventKey={String(tier)} key={tier}>
                  <Accordion.Header>{PAYMENT_ADMIN_TIER_LABELS[tier] ?? `Faixa ${tier}`}</Accordion.Header>
                  <Accordion.Body className="pt-2">
                    <div className="list-group">
                      {tierRows.length > 0 && (
                        <div className="list-group-item py-2 bg-light border-bottom-0">
                          <div className="row g-2 align-items-end small text-muted fw-semibold">
                            <div className="col-md-5">Parcelamento</div>
                            <div className="col-md-5">Valor mínimo (R$)</div>
                            <div className="col-md-2 text-end" aria-hidden>
                              &nbsp;
                            </div>
                          </div>
                        </div>
                      )}
                      {tierRows.map((r, indexInTier) => (
                        <div key={(r.id ?? `n-${tier}`) + '_' + indexInTier} className="list-group-item">
                          <div className="row g-2 align-items-center">
                            <div className="col-md-5">
                              <input
                                className="form-control form-control-sm"
                                value={r.name}
                                onChange={(e) => handleChange(tier, indexInTier, 'name', e.target.value)}
                                placeholder="ex: 30/60/90"
                              />
                            </div>
                            <div className="col-md-5">
                              <input
                                className="form-control form-control-sm"
                                value={
                                  r.valor_minimo === null || r.valor_minimo === undefined ? '' : String(r.valor_minimo)
                                }
                                onChange={(e) => handleChange(tier, indexInTier, 'valor_minimo', e.target.value)}
                                placeholder="Opcional"
                                inputMode="decimal"
                              />
                            </div>
                            <div className="col-md-2 d-flex justify-content-end">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                title="Remover"
                                onClick={() => void handleRemove(tier, indexInTier)}
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {tierRows.length === 0 && (
                        <div className="list-group-item text-muted small">Nenhuma condição nesta faixa.</div>
                      )}
                    </div>
                    <div className="mt-2">
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => handleAdd(tier)}>
                        Adicionar
                      </button>
                    </div>
                  </Accordion.Body>
                </Accordion.Item>
              )
            })}
          </Accordion>

          <div className="d-flex gap-2">
            <button type="button" className="btn btn-outline-secondary" onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar alterações pendentes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
