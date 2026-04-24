'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button, Form, Modal, Spinner } from 'react-bootstrap'

type Row = {
  id: number
  id_vendedor_externo?: string | null
  nome: string
  email?: string | null
  telefone?: string | null
  tipo_acesso?: 'VENDEDOR' | 'TELEVENDAS' | null
  nivel_acesso?: 'SUPERVISOR' | 'ADMINISTRADOR' | 'OPERADOR' | null
}

type TinyOpt = { id: number; nome: string; email: string | null }

function nivelLabel(n: Row['nivel_acesso']) {
  if (!n) return '-'
  if (n === 'ADMINISTRADOR') return 'Administrador'
  if (n === 'SUPERVISOR') return 'Supervisor'
  return 'Operador'
}

export default function SupervisorVendedoresPage() {
  const params = useParams()
  const router = useRouter()
  const externo = decodeURIComponent((params?.externo as string) || '')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [tinyQ, setTinyQ] = useState('')
  const [tinyDebounced, setTinyDebounced] = useState('')
  const [tinyLoading, setTinyLoading] = useState(false)
  const [tinyErr, setTinyErr] = useState<string | null>(null)
  const [tinyResults, setTinyResults] = useState<TinyOpt[]>([])
  const [selectedTiny, setSelectedTiny] = useState<TinyOpt | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitErr, setSubmitErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!externo) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/supervisor/${encodeURIComponent(externo)}/vendedores`)
      const json = await res.json()
      if (!json?.ok) {
        setError(json?.error || 'Falha ao carregar')
        setRows([])
        return
      }
      setRows(json.data || [])
    } catch {
      setError('Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }, [externo])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const t = setTimeout(() => setTinyDebounced(tinyQ.trim()), 400)
    return () => clearTimeout(t)
  }, [tinyQ])

  const tinyAbort = useRef<AbortController | null>(null)
  useEffect(() => {
    if (!showModal) return
    if (tinyDebounced.length < 2) {
      setTinyResults([])
      setTinyErr(null)
      setTinyLoading(false)
      return
    }
    tinyAbort.current?.abort()
    const ac = new AbortController()
    tinyAbort.current = ac
    let cancelled = false
    ;(async () => {
      setTinyLoading(true)
      setTinyErr(null)
      try {
        const res = await fetch(
          `/api/supervisor/${encodeURIComponent(externo)}/vendedores/tiny-search?q=${encodeURIComponent(tinyDebounced)}`,
          { signal: ac.signal }
        )
        const json = await res.json()
        if (cancelled || ac.signal.aborted) return
        if (!json?.ok) {
          setTinyErr(json?.error || 'Falha na busca')
          setTinyResults([])
          return
        }
        setTinyResults(Array.isArray(json.data) ? json.data : [])
      } catch (e: unknown) {
        if ((e as Error)?.name === 'AbortError') return
        if (!cancelled) setTinyErr('Erro de rede ao buscar no Tiny')
      } finally {
        if (!cancelled && !ac.signal.aborted) setTinyLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showModal, tinyDebounced, externo])

  const openModal = () => {
    setTinyQ('')
    setTinyDebounced('')
    setTinyResults([])
    setTinyErr(null)
    setSelectedTiny(null)
    setSubmitErr(null)
    setShowModal(true)
  }

  const closeModal = () => {
    if (submitting) return
    setShowModal(false)
  }

  const submitVincular = async () => {
    if (!selectedTiny) {
      setSubmitErr('Selecione um vendedor na lista.')
      return
    }
    setSubmitting(true)
    setSubmitErr(null)
    try {
      const res = await fetch(`/api/supervisor/${encodeURIComponent(externo)}/vendedores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tiny_id: selectedTiny.id,
          nome: selectedTiny.nome,
          email: selectedTiny.email,
        }),
      })
      const json = await res.json()
      if (res.status === 409 && json?.code === 'VENDEDOR_OUTRO_SUPERVISOR') {
        const nomeSup = json.supervisor_atual_nome || json.supervisor_atual_externo || '—'
        setSubmitErr(
          `Este vendedor já está sob o supervisor ${nomeSup}. Entre em contato com a administração ou com esse supervisor para liberar o vínculo antes de adicioná-lo à sua equipe.`
        )
        return
      }
      if (!json?.ok) {
        setSubmitErr(json?.error || 'Não foi possível vincular.')
        return
      }
      setShowModal(false)
      await load()
    } catch {
      setSubmitErr('Erro de rede ao vincular.')
    } finally {
      setSubmitting(false)
    }
  }

  const data = useMemo(() => rows, [rows])

  return (
    <div className="p-3">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <h2 className="m-0">Supervisão • Vendedores</h2>
        <Button variant="primary" type="button" onClick={openModal}>
          Adicionar representante
        </Button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {loading ? (
        <div>Carregando...</div>
      ) : (
        <div className="card border-0 shadow-sm">
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-sm table-hover mb-0">
                <thead>
                  <tr>
                    <th>ID externo</th>
                    <th>Nome</th>
                    <th>Email</th>
                    <th>Telefone</th>
                    <th>Tipo de acesso</th>
                    <th>Nível de acesso</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((v) => (
                    <tr
                      key={v.id}
                      style={{ cursor: v.id_vendedor_externo ? 'pointer' : 'default' }}
                      onClick={() => {
                        if (!v.id_vendedor_externo) return
                        router.push(`/vendedores/${encodeURIComponent(v.id_vendedor_externo)}`)
                      }}
                    >
                      <td>{v.id_vendedor_externo ?? '-'}</td>
                      <td>{v.nome}</td>
                      <td>{v.email ?? '-'}</td>
                      <td>{v.telefone ?? '-'}</td>
                      <td>{v.tipo_acesso ? (v.tipo_acesso === 'TELEVENDAS' ? 'Televendas' : 'Vendedor') : '-'}</td>
                      <td>{nivelLabel(v.nivel_acesso)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.length === 0 && !error && (
                <div className="text-muted small p-2">Nenhum vendedor supervisionado.</div>
              )}
            </div>
          </div>
        </div>
      )}

      <Modal show={showModal} onHide={closeModal} centered backdrop={submitting ? 'static' : true}>
        <Modal.Header closeButton>
          <Modal.Title>Adicionar representante</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Label className="small text-muted">Digite nome ou parte do nome para buscar</Form.Label>
          <Form.Control
            type="text"
            autoFocus
            placeholder="Ex.: Maria, Silva…"
            value={tinyQ}
            onChange={(e) => {
              setTinyQ(e.target.value)
              setSelectedTiny(null)
            }}
          />
          <div className="mt-2 position-relative" style={{ minHeight: 120 }}>
            {tinyLoading && (
              <div className="d-flex align-items-center gap-2 text-muted small py-3">
                <Spinner animation="border" size="sm" /> Buscando…
              </div>
            )}
            {!tinyLoading && tinyErr && <div className="alert alert-danger py-2 small mb-0">{tinyErr}</div>}
            {!tinyLoading && !tinyErr && tinyDebounced.length < 2 && (
              <div className="text-muted small py-2">Digite ao menos 2 caracteres. O vendedor deve estar cadastrado no Tiny</div>
            )}
            {!tinyLoading && !tinyErr && tinyDebounced.length >= 2 && tinyResults.length === 0 && (
              <div className="text-muted small py-2">Nenhum vendedor encontrado.</div>
            )}
            {!tinyLoading && tinyResults.length > 0 && (
              <div className="list-group list-group-flush border rounded mt-1" style={{ maxHeight: 260, overflowY: 'auto' }}>
                {tinyResults.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`list-group-item list-group-item-action text-start ${selectedTiny?.id === opt.id ? 'active' : ''}`}
                    onClick={() => setSelectedTiny(opt)}
                  >
                    <div className="fw-semibold">{opt.nome}</div>
                    <div className="small opacity-75">ID Tiny: {opt.id}</div>
                    {opt.email ? <div className="small opacity-75">{opt.email}</div> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
          {submitErr && <div className="alert alert-warning py-2 small mt-2 mb-0">{submitErr}</div>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeModal} disabled={submitting}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => void submitVincular()} disabled={submitting || !selectedTiny}>
            {submitting ? 'Salvando…' : 'Adicionar'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}
