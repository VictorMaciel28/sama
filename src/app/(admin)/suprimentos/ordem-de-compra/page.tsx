'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Modal } from 'react-bootstrap'
import { EMPRESAS_SUPRIMENTOS, labelEmpresa } from '@/constants/empresas-suprimentos'
import { downloadPurchaseOrderPdf, type PurchaseOrderPdfDetail } from '@/lib/purchaseOrderPdf'
import { OrdemCompraForm } from './OrdemCompraForm'
import { purchaseOrderApiToFormSnapshot } from './ordemCompraPrefill'
import type { OrdemCompraFormSnapshot } from './ordemCompraFormTypes'

type Row = {
  id: number
  empresa_id: string
  data: string
  data_prevista: string
  valor_total: string | number
  cliente: { id: number; nome: string; cpf_cnpj?: string | null }
}

function PrinterIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
    </svg>
  )
}

export default function OrdemCompraListPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [listErr, setListErr] = useState<string | null>(null)
  const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null)
  const [deleteLoadingId, setDeleteLoadingId] = useState<number | null>(null)
  const [modalOrderId, setModalOrderId] = useState<number | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalSnapshot, setModalSnapshot] = useState<OrdemCompraFormSnapshot | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const [deleteModalRow, setDeleteModalRow] = useState<Row | null>(null)
  const [deleteModalError, setDeleteModalError] = useState<string | null>(null)
  const [empresa, setEmpresa] = useState<string>('')
  /** Vazios = sem filtro de data (evita esconder ordens fora do “mês atual até hoje”). */
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (empresa) p.set('empresa', empresa)
      if (dataInicio) p.set('dataInicio', dataInicio)
      if (dataFim) p.set('dataFim', dataFim)
      const res = await fetch(`/api/suprimentos/ordens-compra?${p.toString()}`)
      const json = await res.json()
      if (json?.ok) {
        setListErr(null)
        setRows(json.data || [])
      } else {
        setListErr(json?.error || 'Não foi possível carregar a lista.')
        setRows([])
      }
    } catch {
      setListErr('Erro de rede ao carregar.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [empresa, dataInicio, dataFim])

  useEffect(() => {
    load()
  }, [load])

  const fmtMoney = (v: string | number) =>
    Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const fmtDate = (s: string) => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—')

  const totalLista = useMemo(() => rows.reduce((a, r) => a + Number(r.valor_total || 0), 0), [rows])

  const openDeleteModal = useCallback((r: Row) => {
    setDeleteModalError(null)
    setDeleteModalRow(r)
  }, [])

  const closeDeleteModal = useCallback(() => {
    if (deleteLoadingId != null) return
    setDeleteModalRow(null)
    setDeleteModalError(null)
  }, [deleteLoadingId])

  const confirmDeleteOrder = useCallback(async () => {
    if (!deleteModalRow) return
    const id = deleteModalRow.id
    setDeleteLoadingId(id)
    setDeleteModalError(null)
    try {
      const res = await fetch(`/api/suprimentos/ordens-compra/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json?.ok) {
        setDeleteModalError(json?.error || 'Não foi possível excluir.')
        return
      }
      setDeleteModalRow(null)
      await load()
    } catch {
      setDeleteModalError('Erro de rede ao excluir.')
    } finally {
      setDeleteLoadingId(null)
    }
  }, [deleteModalRow, load])

  const downloadPdf = useCallback(async (id: number) => {
    setPdfLoadingId(id)
    try {
      const res = await fetch(`/api/suprimentos/ordens-compra/${id}`)
      const json = await res.json()
      if (!json?.ok || !json.data) {
        return
      }
      downloadPurchaseOrderPdf(json.data as PurchaseOrderPdfDetail)
    } catch {
      /* noop */
    } finally {
      setPdfLoadingId(null)
    }
  }, [])

  const closePedidoModal = useCallback(() => {
    setModalOrderId(null)
    setModalSnapshot(null)
    setModalError(null)
    setModalLoading(false)
  }, [])

  const openPedidoModal = useCallback(async (id: number) => {
    setModalOrderId(id)
    setModalLoading(true)
    setModalSnapshot(null)
    setModalError(null)
    try {
      const res = await fetch(`/api/suprimentos/ordens-compra/${id}`)
      const json = await res.json()
      if (!json?.ok || !json.data) {
        setModalError(json?.error || 'Não foi possível carregar o pedido.')
        return
      }
      setModalSnapshot(purchaseOrderApiToFormSnapshot(json.data as Record<string, unknown>))
    } catch {
      setModalError('Erro ao carregar o pedido.')
    } finally {
      setModalLoading(false)
    }
  }, [])

  return (
    <div className="p-3">
      <div className="card border-0 shadow-sm">
        <div className="card-body">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
            <div>
              <h2 className="m-0">Ordem de compra</h2>
            </div>
            <Link href="/suprimentos/ordem-de-compra/novo" className="btn btn-primary">
              Novo pedido
            </Link>
          </div>

          <div className="row g-2 align-items-end mb-3">
            <div className="col-12 col-md-3">
              <label className="form-label mb-0">Empresa</label>
              <select
                className="form-select form-select-sm"
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
              >
                <option value="">Todas</option>
                {EMPRESAS_SUPRIMENTOS.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label mb-0">Data inicial</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label mb-0">Data final</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
            <div className="col-12 col-md-3">
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => load()} disabled={loading}>
                {loading ? 'Carregando…' : 'Filtrar'}
              </button>
            </div>
          </div>
          {listErr && <div className="alert alert-warning py-2 mb-2">{listErr}</div>}

          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Prevista</th>
                  <th>Empresa</th>
                  <th>Fornecedor (contato)</th>
                  <th className="text-end">Total</th>
                  <th style={{ width: 120 }} className="text-center">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="text-muted text-center py-4">
                      Nenhuma ordem no período.
                    </td>
                  </tr>
                )}
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer"
                    style={{ cursor: 'pointer' }}
                    onClick={() => openPedidoModal(r.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openPedidoModal(r.id)
                      }
                    }}
                  >
                    <td>{fmtDate(r.data)}</td>
                    <td>{fmtDate(r.data_prevista)}</td>
                    <td>{labelEmpresa(r.empresa_id)}</td>
                    <td>{r.cliente?.nome || '—'}</td>
                    <td className="text-end">{fmtMoney(r.valor_total)}</td>
                    <td className="text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="d-inline-flex align-items-center gap-1">
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm py-1 px-2"
                          title="Baixar PDF do pedido"
                          disabled={pdfLoadingId === r.id || deleteLoadingId === r.id}
                          onClick={() => downloadPdf(r.id)}
                        >
                          {pdfLoadingId === r.id ? (
                            <span className="spinner-border spinner-border-sm" role="status" />
                          ) : (
                            <PrinterIcon />
                          )}
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm py-1 px-2"
                          title="Excluir ordem"
                          disabled={deleteLoadingId === r.id || pdfLoadingId === r.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            openDeleteModal(r)
                          }}
                        >
                          {deleteLoadingId === r.id ? (
                            <span className="spinner-border spinner-border-sm" role="status" />
                          ) : (
                            <TrashIcon />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length > 0 && (
            <div className="text-end small text-muted">
              {rows.length} registro(s) · Total listado: {fmtMoney(totalLista)}
            </div>
          )}

        </div>
      </div>

      <Modal
        show={deleteModalRow != null}
        onHide={closeDeleteModal}
        centered
        backdrop={deleteLoadingId != null ? 'static' : true}
        keyboard={deleteLoadingId == null}
      >
        <Modal.Header closeButton className="border-0 pb-0">
          <Modal.Title className="d-flex align-items-center gap-2 text-danger">
            <span
              className="d-inline-flex align-items-center justify-content-center rounded-circle bg-danger bg-opacity-10 text-danger"
              style={{ width: 40, height: 40 }}
              aria-hidden
            >
              <TrashIcon />
            </span>
            Excluir ordem de compra
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="pt-2">
          <p className="mb-3 text-body-secondary">
            Esta ação não pode ser desfeita. O pedido será removido permanentemente.
          </p>
          {deleteModalRow && (
            <div className="rounded border bg-light p-3 small">
              <div className="fw-semibold mb-2">Pedido #{deleteModalRow.id}</div>
              <div className="row g-2">
                <div className="col-sm-4 text-muted">Fornecedor</div>
                <div className="col-sm-8">{deleteModalRow.cliente?.nome || '—'}</div>
                <div className="col-sm-4 text-muted">Data</div>
                <div className="col-sm-8">{fmtDate(deleteModalRow.data)}</div>
                <div className="col-sm-4 text-muted">Total</div>
                <div className="col-sm-8 fw-semibold">{fmtMoney(deleteModalRow.valor_total)}</div>
              </div>
            </div>
          )}
          {deleteModalError && <div className="alert alert-danger py-2 mt-3 mb-0">{deleteModalError}</div>}
        </Modal.Body>
        <Modal.Footer className="border-0 pt-0">
          <Button variant="outline-secondary" onClick={closeDeleteModal} disabled={deleteLoadingId != null}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={() => void confirmDeleteOrder()} disabled={deleteLoadingId != null}>
            {deleteLoadingId != null ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" />
                Excluindo…
              </>
            ) : (
              'Excluir pedido'
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={modalOrderId != null} onHide={closePedidoModal} size="xl" scrollable centered>
        <Modal.Header closeButton>
          <Modal.Title>Pedido #{modalOrderId}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-0">
          {modalLoading && <div className="p-4 text-center text-muted">Carregando…</div>}
          {!modalLoading && modalError && <div className="alert alert-danger m-3 mb-0">{modalError}</div>}
          {!modalLoading && !modalError && modalSnapshot && modalOrderId != null && (
            <OrdemCompraForm
              key={modalOrderId}
              variant="modal"
              initialSnapshot={modalSnapshot}
              onCancel={closePedidoModal}
              onSaved={() => {
                closePedidoModal()
                load()
              }}
            />
          )}
        </Modal.Body>
      </Modal>
    </div>
  )
}
