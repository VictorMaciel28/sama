'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Form, Modal, Spinner } from 'react-bootstrap'
import { toast } from 'react-toastify'

type MonthRow = { month: number; label: string; value: number }

function currentYear(): number {
  return new Date().getFullYear()
}

function formatInputValue(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return ''
  return String(n).replace('.', ',')
}

function parseInputValue(raw: string): number {
  const s = raw.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  if (!s) return 0
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

type Props = {
  show: boolean
  onHide: () => void
}

export default function MercadoLivreModal({ show, onHide }: Props) {
  const [ano, setAno] = useState(currentYear)
  const [anos, setAnos] = useState<number[]>([currentYear()])
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<MonthRow[]>([])
  const [draft, setDraft] = useState<Record<number, string>>({})
  const [savingMonth, setSavingMonth] = useState<number | null>(null)
  const debounceRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const draftRef = useRef(draft)
  const anoRef = useRef(ano)

  draftRef.current = draft
  anoRef.current = ano

  const load = useCallback(async (year: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('ano', String(year))
      const res = await fetch(`/api/financeiro/mercado-livre?${params.toString()}`)
      const json = await res.json().catch(() => null)
      if (!json?.ok) {
        setRows([])
        setDraft({})
        return
      }
      const anosList = Array.isArray(json.anos)
        ? json.anos.map((y: unknown) => Number(y)).filter((y: number) => Number.isFinite(y))
        : [currentYear()]
      setAnos(anosList.length > 0 ? anosList : [currentYear()])
      const list = Array.isArray(json.rows) ? json.rows : []
      const parsed: MonthRow[] = list.map((r: Record<string, unknown>) => ({
        month: Number(r.month) || 0,
        label: String(r.label ?? ''),
        value: Number(r.value) || 0,
      }))
      setRows(parsed)
      const nextDraft: Record<number, string> = {}
      for (const r of parsed) {
        if (r.month >= 1 && r.month <= 12) nextDraft[r.month] = formatInputValue(r.value)
      }
      setDraft(nextDraft)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (show) void load(ano)
  }, [show, ano, load])

  useEffect(() => {
    return () => {
      for (const t of debounceRef.current.values()) clearTimeout(t)
      debounceRef.current.clear()
    }
  }, [])

  const saveMonth = useCallback(async (month: number, raw: string) => {
    const value = parseInputValue(raw)
    setSavingMonth(month)
    try {
      const res = await fetch('/api/financeiro/mercado-livre', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ano: anoRef.current, mes: month, valor: value }),
      })
      const json = await res.json().catch(() => null)
      if (!json?.ok) {
        toast.error(json?.error ?? 'Não foi possível salvar.', { position: 'top-right', autoClose: 3000 })
        return
      }
      setRows((prev) =>
        prev.map((r) => (r.month === month ? { ...r, value: json.value ?? value } : r))
      )
      toast.success('Salvo.', {
        position: 'top-right',
        autoClose: 1800,
        style: { backgroundColor: '#198754', color: '#fff' },
      })
    } finally {
      setSavingMonth((m) => (m === month ? null : m))
    }
  }, [])

  const scheduleSave = useCallback(
    (month: number, raw: string) => {
      const prev = debounceRef.current.get(month)
      if (prev) clearTimeout(prev)
      debounceRef.current.set(
        month,
        setTimeout(() => {
          debounceRef.current.delete(month)
          void saveMonth(month, raw)
        }, 700)
      )
    },
    [saveMonth]
  )

  const onFieldChange = (month: number, raw: string) => {
    setDraft((d) => ({ ...d, [month]: raw }))
    scheduleSave(month, raw)
  }

  const onFieldBlur = (month: number) => {
    const prev = debounceRef.current.get(month)
    if (prev) {
      clearTimeout(prev)
      debounceRef.current.delete(month)
    }
    void saveMonth(month, draftRef.current[month] ?? '')
  }

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton className="py-2">
        <div className="d-flex align-items-center justify-content-between w-100 me-2">
          <Modal.Title className="fs-6 mb-0">Mercado Livre</Modal.Title>
          <Form.Select
            size="sm"
            style={{ width: 'auto', minWidth: '5.5rem' }}
            value={String(ano)}
            onChange={(e) => setAno(Number(e.target.value))}
            disabled={loading}
          >
            {anos.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Form.Select>
        </div>
      </Modal.Header>
      <Modal.Body className="py-3">
        {loading ? (
          <div className="text-center py-4">
            <Spinner animation="border" size="sm" />
          </div>
        ) : (
          <div className="row g-2">
            {rows.map((r) => (
              <div key={r.month} className="col-12 col-sm-6 col-md-4">
                <Form.Group controlId={`ml-mes-${r.month}`}>
                  <Form.Label className="small mb-1">{r.label}</Form.Label>
                  <Form.Control
                    type="text"
                    inputMode="decimal"
                    size="sm"
                    value={draft[r.month] ?? ''}
                    onChange={(e) => onFieldChange(r.month, e.target.value)}
                    onBlur={() => onFieldBlur(r.month)}
                    disabled={savingMonth === r.month}
                    placeholder="0,00"
                  />
                </Form.Group>
              </div>
            ))}
          </div>
        )}
      </Modal.Body>
    </Modal>
  )
}
