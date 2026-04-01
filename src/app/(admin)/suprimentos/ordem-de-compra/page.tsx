'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Modal } from 'react-bootstrap'
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

function todayYmd() {
  return new Date().toISOString().slice(0, 10)
}

function monthStartYmd() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function PrinterIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z" />
    </svg>
  )
}

export default function OrdemCompraListPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null)
  const [modalOrderId, setModalOrderId] = useState<number | null>(null)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalSnapshot, setModalSnapshot] = useState<OrdemCompraFormSnapshot | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const [empresa, setEmpresa] = useState<string>('')
  const [dataInicio, setDataInicio] = useState(monthStartYmd)
  const [dataFim, setDataFim] = useState(todayYmd)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (empresa) p.set('empresa', empresa)
      if (dataInicio) p.set('dataInicio', dataInicio)
      if (dataFim) p.set('dataFim', dataFim)
      const res = await fetch(`/api/suprimentos/ordens-compra?${p.toString()}`)
      const json = await res.json()
      if (json?.ok) setRows(json.data || [])
      else setRows([])
    } catch {
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

          <div className="table-responsive">
            <table className="table table-sm table-hover align-middle">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Prevista</th>
                  <th>Empresa</th>
                  <th>Fornecedor (contato)</th>
                  <th className="text-end">Total</th>
                  <th style={{ width: 88 }} className="text-center">
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
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm py-1 px-2"
                        title="Baixar PDF do pedido"
                        disabled={pdfLoadingId === r.id}
                        onClick={() => downloadPdf(r.id)}
                      >
                        {pdfLoadingId === r.id ? (
                          <span className="spinner-border spinner-border-sm" role="status" />
                        ) : (
                          <PrinterIcon />
                        )}
                      </button>
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

          <div className="small text-muted mt-2">Clique na linha para abrir o pedido no formulário (duplicar / editar).</div>
        </div>
      </div>

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
