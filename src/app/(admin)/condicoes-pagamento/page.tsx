'use client'

import { useEffect, useState, useRef } from 'react'

type PaymentConditionRow = {
  id?: number | null
  name: string
  percent: string | number
  valor_minimo?: string | number | null
  valor_minimo_sem_taxa?: string | number | null
}

function normalizeRowsFromApi(data: unknown[]): PaymentConditionRow[] {
  return (data || []).map((row: any) => ({
    ...row,
    valor_minimo:
      row.valor_minimo != null && !Number.isNaN(Number(row.valor_minimo))
        ? String(Number(row.valor_minimo))
        : '',
    valor_minimo_sem_taxa:
      row.valor_minimo_sem_taxa != null && !Number.isNaN(Number(row.valor_minimo_sem_taxa))
        ? String(Number(row.valor_minimo_sem_taxa))
        : '',
  }))
}

export default function CondicoesPagamentoPage() {
  const [rows, setRows] = useState<PaymentConditionRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const deletedIdsRef = useRef<Set<number>>(new Set())
  const originalRef = useRef<
    Record<number, { name: string; percent: number; valor_minimo: number | null; valor_minimo_sem_taxa: number | null }>
  >({})
  const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout> | null>>({})

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
  // populate originalRef after load
  useEffect(() => {
    originalRef.current = {}
    rows.forEach((r) => {
      if (r.id) {
        const vm = r.valor_minimo
        const vmNum = vm === '' || vm == null || Number.isNaN(Number(vm)) ? null : Number(vm)
        const vms = r.valor_minimo_sem_taxa
        const vmsNum = vms === '' || vms == null || Number.isNaN(Number(vms)) ? null : Number(vms)
        originalRef.current[Number(r.id)] = {
          name: r.name,
          percent: Number(r.percent || 0),
          valor_minimo: vmNum,
          valor_minimo_sem_taxa: vmsNum,
        }
      }
    })
  }, [rows])

  function handleAdd() {
    setRows((prev) => [...prev, { id: null, name: '', percent: '', valor_minimo: '', valor_minimo_sem_taxa: '' }])
  }

  async function handleRemove(index: number) {
    const row = rows[index]
    // cancel pending timer for this index
    if (debounceTimers.current[index]) {
      clearTimeout(debounceTimers.current[index] as any)
      debounceTimers.current[index] = null
    }
    setRows((prev) => prev.filter((_, i) => i !== index))
    if (row?.id) {
      // immediate delete
      try {
        const res = await fetch('/api/condicoes-pagamento', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ create: [], update: [], delete: [Number(row.id)] }),
        })
        const json = await res.json()
        if (json?.ok) {
          // reload authoritative list
          setRows(normalizeRowsFromApi(json.data || []))
        } else {
          alert('Falha ao remover: ' + (json?.error || 'erro'))
        }
      } catch (e) {
        alert('Erro ao remover')
      }
    }
  }

  function parseValorMinimoPayload(raw: string | number | null | undefined): number | null {
    if (raw === '' || raw == null) return null
    const n = Number(raw)
    return Number.isNaN(n) || n <= 0 ? null : n
  }

  function handleChange(
    index: number,
    field: 'name' | 'percent' | 'valor_minimo' | 'valor_minimo_sem_taxa',
    value: string
  ) {
    setRows((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }

      // schedule auto-save for this row using the up-to-date `next` value
      if (debounceTimers.current[index]) {
        clearTimeout(debounceTimers.current[index] as any)
      }
      debounceTimers.current[index] = setTimeout(async () => {
        const current = next[index]
        if (!current) {
          debounceTimers.current[index] = null
          return
        }
        try {
          if (current.id) {
            // update
            const res = await fetch('/api/condicoes-pagamento', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                create: [],
                update: [
                  {
                    id: Number(current.id),
                    name: String(current.name).trim(),
                    percent: Number(current.percent || 0),
                    valor_minimo: parseValorMinimoPayload(current.valor_minimo),
                    valor_minimo_sem_taxa: parseValorMinimoPayload(current.valor_minimo_sem_taxa),
                  },
                ],
                delete: [],
              }),
            })
            const json = await res.json()
            if (json?.ok) setRows(normalizeRowsFromApi(json.data || []))
          } else {
            // create if name provided
            if (!String(current.name || '').trim()) {
              debounceTimers.current[index] = null
              return
            }
            const res = await fetch('/api/condicoes-pagamento', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                create: [
                  {
                    name: String(current.name).trim(),
                    percent: Number(current.percent || 0),
                    valor_minimo: parseValorMinimoPayload(current.valor_minimo),
                    valor_minimo_sem_taxa: parseValorMinimoPayload(current.valor_minimo_sem_taxa),
                  },
                ],
                update: [],
                delete: [],
              }),
            })
            const json = await res.json()
            if (json?.ok) setRows(normalizeRowsFromApi(json.data || []))
          }
        } catch (e) {
          // ignore
        } finally {
          debounceTimers.current[index] = null
        }
      }, 800)

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
          percent: Number(r.percent || 0),
          valor_minimo: parseValorMinimoPayload(r.valor_minimo),
          valor_minimo_sem_taxa: parseValorMinimoPayload(r.valor_minimo_sem_taxa),
        }))
      const toUpdate = rows
        .filter((r) => r.id)
        .map((r) => ({
          id: Number(r.id),
          name: String(r.name).trim(),
          percent: Number(r.percent || 0),
          valor_minimo: parseValorMinimoPayload(r.valor_minimo),
          valor_minimo_sem_taxa: parseValorMinimoPayload(r.valor_minimo_sem_taxa),
        }))
        .filter((r) => {
          const orig = originalRef.current[r.id]
          return (
            !orig ||
            orig.name !== r.name ||
            Number(orig.percent) !== Number(r.percent) ||
            (orig.valor_minimo ?? null) !== (r.valor_minimo ?? null) ||
            (orig.valor_minimo_sem_taxa ?? null) !== (r.valor_minimo_sem_taxa ?? null)
          )
        })
      const toDelete = Array.from(deletedIdsRef.current)

      const payload = { create: toCreate, update: toUpdate, delete: toDelete }
      const res = await fetch('/api/condicoes-pagamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (json?.ok) {
        deletedIdsRef.current.clear()
        await load()
      } else {
        alert('Falha ao salvar: ' + (json?.error || 'erro'))
      }
    } catch (e) {
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
                Gerencie parcelamento, taxa administrativa (%) e valores mínimos do pedido (R$), com e sem taxa
              </small>
            </div>
          </div>

          <div className="mb-3">
            <div className="row g-2">
              <div className="col-12">
                <div className="list-group">
                  {rows.length > 0 && (
                    <div className="list-group-item py-2 bg-light border-bottom-0">
                      <div className="row g-2 align-items-end fs-5 text-muted fw-semibold">
                        <div className="col-md-3">Parcelamento</div>
                        <div className="col-md-2">Taxa administrativa</div>
                        <div className="col-md-3">Valor mínimo com taxa</div>
                        <div className="col-md-3">Valor mínimo sem taxa</div>
                        <div className="col-md-1 text-end" aria-hidden="true">
                          &nbsp;
                        </div>
                      </div>
                    </div>
                  )}
                  {rows.map((r, idx) => (
                    <div
                      key={(r.id ?? 'new') + '_' + idx}
                      className={`list-group-item d-flex align-items-center gap-2 ${rows.length > 0 ? 'border-top-0' : ''}`}
                    >
                      <div className="flex-grow-1 row g-2 align-items-center">
                        <div className="col-md-3">
                          <input
                            className="form-control"
                            value={r.name}
                            onChange={(e) => handleChange(idx, 'name', e.target.value)}
                            placeholder="ex: 14/21D"
                          />
                        </div>
                        <div className="col-md-2">
                          <input
                            className="form-control"
                            value={String(r.percent ?? '')}
                            onChange={(e) => handleChange(idx, 'percent', e.target.value)}
                            placeholder="%"
                            inputMode="decimal"
                          />
                        </div>
                        <div className="col-md-3">
                          <input
                            className="form-control"
                            value={r.valor_minimo === null || r.valor_minimo === undefined ? '' : String(r.valor_minimo)}
                            onChange={(e) => handleChange(idx, 'valor_minimo', e.target.value)}
                            placeholder="R$"
                            inputMode="decimal"
                          />
                        </div>
                        <div className="col-md-3">
                          <input
                            className="form-control"
                            value={
                              r.valor_minimo_sem_taxa === null || r.valor_minimo_sem_taxa === undefined
                                ? ''
                                : String(r.valor_minimo_sem_taxa)
                            }
                            onChange={(e) => handleChange(idx, 'valor_minimo_sem_taxa', e.target.value)}
                            placeholder="R$"
                            inputMode="decimal"
                          />
                        </div>
                        <div className="col-md-1 d-flex justify-content-end">
                          <button type="button" className="btn btn-sm btn-danger" title="Remover" onClick={() => handleRemove(idx)}>
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {rows.length === 0 && <div className="list-group-item text-muted">Nenhuma condição cadastrada</div>}
                </div>
              </div>
            </div>

            <div className="mt-3 d-flex gap-2">
              <button type="button" className="btn btn-primary" onClick={handleAdd}>
                Adicionar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
