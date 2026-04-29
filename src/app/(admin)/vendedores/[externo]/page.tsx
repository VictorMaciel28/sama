"use client"

import { useEffect, useMemo, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Modal, Button, Form, Spinner, Table, Alert } from 'react-bootstrap'
import IconifyIcon from '@/components/wrappers/IconifyIcon'

type Cliente = {
  id: number
  external_id: string
  nome: string
  fantasia?: string | null
  cidade?: string | null
  estado?: string | null
  fone?: string | null
  email?: string | null
  cpf_cnpj?: string | null
}

type Vendedor = { id: number; id_vendedor_externo?: string | null; nome: string }

type TinyHit = {
  id: number
  nome: string
  fantasia: string | null
  cpf_cnpj: string | null
  cidade: string | null
  uf: string | null
}

export default function VendedorClientesPage() {
  const params = useParams()
  const router = useRouter()
  const externo = (params?.externo || '').toString()

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [vendedor, setVendedor] = useState<Vendedor | null>(null)
  const [loading, setLoading] = useState(false)

  const [showAddModal, setShowAddModal] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [hits, setHits] = useState<TinyHit[]>([])
  const [hitsLoading, setHitsLoading] = useState(false)
  const [hitsError, setHitsError] = useState<string | null>(null)
  const [linkingId, setLinkingId] = useState<number | null>(null)
  const [removingId, setRemovingId] = useState<number | null>(null)
  const [banner, setBanner] = useState<{ variant: 'success' | 'danger' | 'warning'; text: string } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [rc, rv] = await Promise.all([
        fetch(`/api/clientes?vendedor_externo=${encodeURIComponent(externo)}`),
        fetch('/api/vendedores'),
      ])
      const jc = await rc.json()
      const jv = await rv.json()
      if (jc?.ok) setClientes(jc.data)
      if (jv?.ok) {
        const found = (jv.data as Vendedor[]).find((v) => v.id_vendedor_externo === externo)
        setVendedor(found || null)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (externo) load()
  }, [externo])

  useEffect(() => {
    const t = window.setTimeout(() => setSearchDebounced(searchInput.trim()), 450)
    return () => window.clearTimeout(t)
  }, [searchInput])

  const fetchHits = useCallback(async () => {
    if (!externo || searchDebounced.length < 2) {
      setHits([])
      setHitsError(null)
      return
    }
    setHitsLoading(true)
    setHitsError(null)
    try {
      const res = await fetch(
        `/api/vendedores/${encodeURIComponent(externo)}/clientes/tiny-search?q=${encodeURIComponent(searchDebounced)}`
      )
      const json = await res.json()
      if (!json?.ok) {
        setHits([])
        setHitsError(json?.error || 'Falha na busca')
        return
      }
      setHits(Array.isArray(json.data) ? json.data : [])
    } catch {
      setHits([])
      setHitsError('Erro de rede ao buscar no Tiny')
    } finally {
      setHitsLoading(false)
    }
  }, [externo, searchDebounced])

  useEffect(() => {
    if (!showAddModal) return
    void fetchHits()
  }, [showAddModal, fetchHits])

  const openModal = () => {
    setShowAddModal(true)
    setSearchInput('')
    setSearchDebounced('')
    setHits([])
    setHitsError(null)
    setBanner(null)
  }

  const vincular = async (tinyId: number) => {
    setLinkingId(tinyId)
    setBanner(null)
    try {
      const res = await fetch(`/api/vendedores/${encodeURIComponent(externo)}/clientes/vincular`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiny_contact_id: tinyId }),
      })
      const json = await res.json()
      if (res.status === 409) {
        setBanner({
          variant: 'warning',
          text:
            json?.error ||
            'Cliente já está na carteira de outro vendedor.',
        })
        return
      }
      if (!json?.ok) {
        setBanner({ variant: 'danger', text: json?.error || 'Não foi possível adicionar.' })
        return
      }
      let msg = 'Cliente adicionado à carteira.'
      if (json.tiny_ok) msg += ' Também atualizado no Tiny.'
      else if (json.tiny_error) msg += ` Aviso Tiny: ${json.tiny_error}`
      setBanner({ variant: json.tiny_ok ? 'success' : 'warning', text: msg })
      await load()
      setShowAddModal(false)
    } catch {
      setBanner({ variant: 'danger', text: 'Erro ao adicionar cliente.' })
    } finally {
      setLinkingId(null)
    }
  }

  const desvincular = async (c: Cliente) => {
    const ok = window.confirm(
      `Remover "${c.nome}" da carteira deste vendedor? O vínculo será retirado na plataforma e sincronizado no Tiny quando possível.`
    )
    if (!ok) return

    setRemovingId(c.id)
    setBanner(null)
    try {
      const res = await fetch(`/api/vendedores/${encodeURIComponent(externo)}/clientes/desvincular`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: c.id }),
      })
      const json = await res.json()
      if (res.status === 409) {
        setBanner({
          variant: 'warning',
          text: json?.error || 'Não foi possível remover.',
        })
        return
      }
      if (!json?.ok) {
        setBanner({ variant: 'danger', text: json?.error || 'Não foi possível remover o cliente.' })
        return
      }
      let msg = 'Cliente removido da carteira.'
      if (json.tiny_ok) msg += ' Também atualizado no Tiny.'
      else if (json.tiny_error) msg += ` Aviso Tiny: ${json.tiny_error}`
      setBanner({ variant: json.tiny_ok ? 'success' : 'warning', text: msg })
      await load()
    } catch {
      setBanner({ variant: 'danger', text: 'Erro ao remover cliente.' })
    } finally {
      setRemovingId(null)
    }
  }

  const rows = useMemo(() => clientes, [clientes])

  return (
    <div className="p-3">
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="m-0">Clientes do Vendedor</h2>
          <div className="text-muted">{vendedor ? `${vendedor.nome} (${externo})` : externo}</div>
        </div>
        <div className="d-flex gap-2">
          <Button variant="primary" size="sm" onClick={openModal}>
            <IconifyIcon icon="ri:user-add-line" className="me-1" />
            Adicionar cliente
          </Button>
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => router.back()}>
            Voltar
          </button>
        </div>
      </div>

      {banner && !showAddModal && (
        <Alert variant={banner.variant} className="py-2 small" dismissible onClose={() => setBanner(null)}>
          {banner.text}
        </Alert>
      )}

      {loading ? (
        <div>Carregando...</div>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm table-striped">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nome</th>
                <th>Fantasia</th>
                <th>CPF/CNPJ</th>
                <th>Cidade/UF</th>
                <th>Telefone</th>
                <th>Email</th>
                <th style={{ width: 1 }} className="text-end">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.external_id}</td>
                  <td>{c.nome}</td>
                  <td>{c.fantasia ?? '-'}</td>
                  <td>{c.cpf_cnpj ?? '-'}</td>
                  <td>
                    {c.cidade ?? '-'} {c.estado ? `/${c.estado}` : ''}
                  </td>
                  <td>{c.fone ?? '-'}</td>
                  <td>{c.email ?? '-'}</td>
                  <td className="text-end align-middle">
                    <Button
                      type="button"
                      variant="outline-danger"
                      size="sm"
                      className="border-0 p-1"
                      title="Remover da carteira deste vendedor"
                      aria-label={`Remover ${c.nome} da carteira`}
                      disabled={removingId != null}
                      onClick={() => void desvincular(c)}
                    >
                      {removingId === c.id ? (
                        <Spinner animation="border" size="sm" />
                      ) : (
                        <IconifyIcon icon="ri:delete-bin-line" className="fs-5" />
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal show={showAddModal} onHide={() => setShowAddModal(false)} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Adicionar cliente (Tiny)</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="small text-muted mb-3">
            Busque por nome ou CPF/CNPJ no Tiny. Só é possível vincular se o cliente ainda não estiver na carteira de
            outro vendedor na plataforma.
          </p>
          <Form.Group className="mb-3">
            <Form.Label>Buscar</Form.Label>
            <Form.Control
              type="text"
              placeholder="Mínimo 2 caracteres"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              autoFocus
            />
          </Form.Group>

          {banner && showAddModal && (
            <Alert variant={banner.variant} className="py-2 small mb-3">
              {banner.text}
            </Alert>
          )}

          {hitsLoading ? (
            <div className="d-flex align-items-center gap-2 text-muted py-3">
              <Spinner animation="border" size="sm" /> Buscando no Tiny…
            </div>
          ) : hitsError ? (
            <div className="text-danger small">{hitsError}</div>
          ) : searchDebounced.length < 2 ? (
            <div className="text-muted small">Digite pelo menos 2 caracteres.</div>
          ) : hits.length === 0 ? (
            <div className="text-muted small">Nenhum contato encontrado.</div>
          ) : (
            <div className="table-responsive border rounded">
              <Table size="sm" className="mb-0 align-middle">
                <thead className="table-light">
                  <tr>
                    <th>ID Tiny</th>
                    <th>Nome</th>
                    <th>CPF/CNPJ</th>
                    <th>Local</th>
                    <th style={{ width: 1 }} />
                  </tr>
                </thead>
                <tbody>
                  {hits.map((h) => (
                    <tr key={h.id}>
                      <td className="font-monospace small">{h.id}</td>
                      <td>{h.nome}</td>
                      <td>{h.cpf_cnpj ?? '—'}</td>
                      <td className="small">
                        {[h.cidade, h.uf].filter(Boolean).join(' / ') || '—'}
                      </td>
                      <td className="text-end">
                        <Button
                          size="sm"
                          variant="outline-primary"
                          disabled={linkingId != null}
                          onClick={() => void vincular(h.id)}
                        >
                          {linkingId === h.id ? (
                            <Spinner animation="border" size="sm" />
                          ) : (
                            'Adicionar à carteira'
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowAddModal(false)}>
            Fechar
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}
