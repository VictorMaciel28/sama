'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { Modal, Form, Button, Spinner, OverlayTrigger, Tooltip } from 'react-bootstrap'
import IconifyIcon from '@/components/wrappers/IconifyIcon'

type Cliente = {
  id: number
  external_id: string
  nome: string
  id_vendedor_externo?: string | null
  fantasia?: string | null
  cidade?: string | null
  estado?: string | null
  fone?: string | null
  email?: string | null
  cpf_cnpj?: string | null
  nome_vendedor?: string | null
  vendedor?: { id: number; nome: string | null; id_vendedor_externo?: string | null } | null
}

type VendedorOpt = {
  id: number
  id_vendedor_externo?: string | null
  nome: string
}

export default function SupervisorClientesPage() {
  const params = useParams()
  const externo = decodeURIComponent((params?.externo as string) || '')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [limit] = useState(50)
  const [total, setTotal] = useState(0)
  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery] = useState('')

  const [showTransferModal, setShowTransferModal] = useState(false)
  const [transferCliente, setTransferCliente] = useState<Cliente | null>(null)
  const [vendedoresOpts, setVendedoresOpts] = useState<VendedorOpt[]>([])
  const [vendedoresLoading, setVendedoresLoading] = useState(false)
  const [destExterno, setDestExterno] = useState('')
  const [transferSubmitting, setTransferSubmitting] = useState(false)
  const [transferError, setTransferError] = useState<string | null>(null)
  /** Após transferência: Tiny sincronizado ou aviso se só a base local atualizou. */
  const [tinyNotice, setTinyNotice] = useState<'ok' | 'warn' | null>(null)
  const [tinyNoticeDetail, setTinyNoticeDetail] = useState<string | null>(null)

  const load = async (targetPage = page) => {
    if (!externo) return
    setLoading(true)
    setError(null)
    try {
      const offset = (targetPage - 1) * limit
      const qParam = query.trim() ? `&q=${encodeURIComponent(query.trim())}` : ''
      const res = await fetch(
        `/api/supervisor/${encodeURIComponent(externo)}/clientes?limit=${limit}&offset=${offset}${qParam}`
      )
      const json = await res.json()
      if (!json?.ok) {
        setError(json?.error || 'Falha ao carregar')
        setClientes([])
        setTotal(0)
        return
      }
      setClientes(json.data || [])
      setTotal(Number(json?.paginacao?.total || 0))
    } catch {
      setError('Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!externo) {
      setError('ID externo inválido')
      setLoading(false)
      return
    }
    load(page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externo, page, query])

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1)
      setQuery(queryInput)
    }, 600)
    return () => clearTimeout(t)
  }, [queryInput])

  const clienteVendedorExterno = (c: Cliente) =>
    String(c.id_vendedor_externo || c.vendedor?.id_vendedor_externo || '').trim()

  const openTransferModal = async (c: Cliente) => {
    setTransferCliente(c)
    setDestExterno('')
    setTransferError(null)
    setTinyNotice(null)
    setTinyNoticeDetail(null)
    setShowTransferModal(true)
    setVendedoresLoading(true)
    try {
      const res = await fetch(`/api/supervisor/${encodeURIComponent(externo)}/vendedores`)
      const json = await res.json()
      if (json?.ok) setVendedoresOpts(json.data || [])
      else setVendedoresOpts([])
    } catch {
      setVendedoresOpts([])
    } finally {
      setVendedoresLoading(false)
    }
  }

  const closeTransferModal = () => {
    setShowTransferModal(false)
    setTransferCliente(null)
    setDestExterno('')
    setTransferError(null)
  }

  const destinoOptions = useMemo(() => {
    const cur = transferCliente ? clienteVendedorExterno(transferCliente) : ''
    return vendedoresOpts.filter((v) => String(v.id_vendedor_externo || '').trim() !== cur)
  }, [vendedoresOpts, transferCliente])

  const confirmTransfer = async () => {
    if (!transferCliente || !destExterno) return
    setTransferSubmitting(true)
    setTransferError(null)
    try {
      const res = await fetch(`/api/supervisor/${encodeURIComponent(externo)}/clientes/transferir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_id: transferCliente.id,
          vendedor_externo_destino: destExterno,
        }),
      })
      const json = await res.json()
      if (!json?.ok) {
        setTransferError(json?.error || 'Falha ao transferir')
        return
      }
      closeTransferModal()
      if (json.tiny_ok) {
        setTinyNotice('ok')
        setTinyNoticeDetail(null)
      } else {
        setTinyNotice('warn')
        setTinyNoticeDetail(
          typeof json.tiny_error === 'string' && json.tiny_error.trim()
            ? json.tiny_error.trim()
            : 'Cliente atualizado na plataforma; não foi possível aplicar o vendedor no Tiny.'
        )
      }
      await load(page)
    } catch {
      setTransferError('Erro ao transferir')
    } finally {
      setTransferSubmitting(false)
    }
  }

  useEffect(() => {
    if (tinyNotice !== 'ok') return
    const t = window.setTimeout(() => setTinyNotice(null), 9000)
    return () => window.clearTimeout(t)
  }, [tinyNotice])

  const rows = useMemo(() => clientes, [clientes])
  const totalPages = Math.max(1, Math.ceil(total / limit))
  const canPrev = page > 1
  const canNext = page < totalPages
  const shownCount = rows.length

  return (
    <div className="p-3">
      <h2 className="mb-3">Supervisão • Clientes</h2>
      <p className="text-muted small mb-3">Clientes dos vendedores que você supervisiona.</p>

      {tinyNotice === 'ok' && (
        <OverlayTrigger
          placement="bottom"
          overlay={
            <Tooltip id="tooltip-tiny-sync-ok" className="border border-success shadow-sm">
              Também alterado no Tiny com sucesso
            </Tooltip>
          }
        >
          <div
            className="alert alert-success border-success py-2 px-3 mb-3 d-inline-flex align-items-center gap-2"
            role="status"
            style={{ cursor: 'default', maxWidth: '100%' }}
          >
            <IconifyIcon icon="ri:checkbox-circle-fill" className="fs-5 flex-shrink-0" />
            <span className="small fw-semibold">Também alterado no Tiny com sucesso</span>
          </div>
        </OverlayTrigger>
      )}
      {tinyNotice === 'warn' && (
        <div className="alert alert-warning py-2 small mb-3" role="status">
          <strong>Plataforma atualizada.</strong>{' '}
          {tinyNoticeDetail || 'O Tiny não confirmou a alteração do vendedor.'}
        </div>
      )}

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="card border-0 shadow-sm">
        <div className="card-body">
          <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
            <span className="text-muted small">
              Mostrando {shownCount} de {total}
            </span>
            <div className="d-flex align-items-center gap-2">
              <button
                className="btn btn-outline-secondary btn-sm"
                onClick={() => canPrev && setPage((p) => Math.max(1, p - 1))}
                disabled={!canPrev || loading}
              >
                Anterior
              </button>
              <select
                className="form-select form-select-sm"
                style={{ width: 110 }}
                value={page}
                onChange={(e) => setPage(Number(e.target.value))}
                disabled={loading}
              >
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <option key={p} value={p}>
                    Página {p}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-outline-secondary btn-sm"
                onClick={() => canNext && setPage((p) => Math.min(totalPages, p + 1))}
                disabled={!canNext || loading}
              >
                Próxima
              </button>
            </div>
          </div>

          <div className="mb-3">
            <input
              type="text"
              className="form-control"
              placeholder="Filtrar por nome ou CPF/CNPJ"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
            />
          </div>

          {loading ? (
            <div>Carregando...</div>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm mb-0 align-middle">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Nome</th>
                    <th>Fantasia</th>
                    <th>CPF/CNPJ</th>
                    <th>Cidade/UF</th>
                    <th>Telefone</th>
                    <th>Email</th>
                    <th>Vendedor</th>
                    <th style={{ width: 1 }}>Ações</th>
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
                      <td>{c.vendedor?.nome ?? c.nome_vendedor ?? '-'}</td>
                      <td>
                        <Button
                          variant="outline-primary"
                          size="sm"
                          title="Transferir para outro vendedor"
                          onClick={() => openTransferModal(c)}
                          disabled={!clienteVendedorExterno(c)}
                          className="px-2"
                        >
                          <IconifyIcon icon="ri:arrow-right-line" className="fs-18" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && !error && (
                <div className="text-muted small p-2">Nenhum cliente nos vendedores supervisionados.</div>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal show={showTransferModal} onHide={closeTransferModal} centered>
        <Modal.Header closeButton>
          <Modal.Title>Transferir cliente</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {transferCliente && (
            <p className="small mb-3">
              <span className="text-muted">Cliente: </span>
              <strong>{transferCliente.nome}</strong>
              {transferCliente.cpf_cnpj ? (
                <span className="text-muted ms-1">({transferCliente.cpf_cnpj})</span>
              ) : null}
              <br />
              <span className="text-muted">Vendedor atual: </span>
              {transferCliente.vendedor?.nome ?? transferCliente.nome_vendedor ?? '—'}
            </p>
          )}
          {transferError && <div className="alert alert-danger py-2 small mb-3">{transferError}</div>}
          <Form.Group>
            <Form.Label>Transferir para o vendedor</Form.Label>
            {vendedoresLoading ? (
              <div className="d-flex align-items-center gap-2 text-muted py-2">
                <Spinner animation="border" size="sm" /> Carregando vendedores…
              </div>
            ) : destinoOptions.length === 0 ? (
              <div className="text-muted small">Não há outro vendedor supervisionado disponível.</div>
            ) : (
              <Form.Select
                value={destExterno}
                onChange={(e) => setDestExterno(e.target.value)}
                disabled={transferSubmitting}
              >
                <option value="">Selecione o vendedor</option>
                {destinoOptions.map((v) => (
                  <option key={String(v.id_vendedor_externo)} value={String(v.id_vendedor_externo)}>
                    {v.nome} ({v.id_vendedor_externo})
                  </option>
                ))}
              </Form.Select>
            )}
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeTransferModal} disabled={transferSubmitting}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={confirmTransfer}
            disabled={transferSubmitting || !destExterno || vendedoresLoading || destinoOptions.length === 0}
          >
            {transferSubmitting ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" /> Salvando…
              </>
            ) : (
              'Confirmar transferência'
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}
