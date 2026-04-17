'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, Col, Modal, Row, Spinner, Table } from 'react-bootstrap'

type ListaRow = {
  id: number
  created_at: string
  tiny_nota_fiscal_id: string
  nota_numero: string | null
  nota_serie: string | null
  cliente_nome: string | null
  valor_nota: string | null
  telefone: string
  telefone_e_whatsapp?: boolean
  qtd_anexos: number
}

type ItemSnapshot = {
  indice: number
  descricao: string
  codigo?: string | null
  quantidade?: string
  unidade?: string
  valor_total?: string
}

type Detalhe = {
  id: number
  created_at: string
  tiny_nota_fiscal_id: string
  nota_numero: string | null
  nota_serie: string | null
  cliente_nome: string | null
  valor_nota: string | null
  telefone: string
  telefone_e_whatsapp?: boolean
  observacoes: string | null
  itens_indices: unknown
  itens_snapshot: unknown
  anexos: Array<{ ordem: number; file_name: string; imagemUrl: string }>
}

function parseMoney(s: string | null | undefined) {
  const n = Number(String(s || '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function formatData(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

export default function DevolucoesSolicitadasPage() {
  const [rows, setRows] = useState<ListaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [detalheLoading, setDetalheLoading] = useState(false)
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/devolucoes-solicitadas')
      const json = await res.json().catch(() => null)
      if (res.status === 401) {
        setRows([])
        return
      }
      if (json?.ok && Array.isArray(json.data)) setRows(json.data)
      else setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const abrirDetalhe = async (id: number) => {
    setModalOpen(true)
    setDetalhe(null)
    setDetalheLoading(true)
    try {
      const res = await fetch(`/api/devolucoes-solicitadas/${id}`)
      const json = await res.json().catch(() => null)
      if (json?.ok && json.data) setDetalhe(json.data as Detalhe)
      else setDetalhe(null)
    } finally {
      setDetalheLoading(false)
    }
  }

  const fecharModal = () => {
    setModalOpen(false)
    setDetalhe(null)
  }

  const snapshotItens: ItemSnapshot[] = Array.isArray(detalhe?.itens_snapshot)
    ? (detalhe!.itens_snapshot as ItemSnapshot[])
    : []

  const indicesRaw = detalhe?.itens_indices
  const indicesList = Array.isArray(indicesRaw)
    ? (indicesRaw as unknown[]).map((x) => Number(x)).filter((n) => Number.isFinite(n))
    : []

  return (
    <>
      <style jsx global>{`
        /* Centraliza o diálogo na área da página (à direita do menu), não sob o menu lateral */
        .modal.devolucoes-solicitadas-modal-align {
          padding-left: var(--bs-main-nav-width, 260px);
        }
        html[data-menu-size='condensed'] .modal.devolucoes-solicitadas-modal-align,
        html[data-menu-size='sm-hover'] .modal.devolucoes-solicitadas-modal-align,
        html[data-menu-size='sm-hover-active'] .modal.devolucoes-solicitadas-modal-align {
          padding-left: var(--bs-main-nav-width-sm, 75px);
        }
        html[data-menu-size='hidden']:not(.sidebar-enable) .modal.devolucoes-solicitadas-modal-align {
          padding-left: 0;
        }
        html[data-menu-size='hidden'].sidebar-enable .modal.devolucoes-solicitadas-modal-align {
          padding-left: var(--bs-main-nav-width, 260px);
        }
        /* ~80% da largura útil (viewport menos menu) */
        .modal-dialog.devolucoes-solicitadas-modal-wide {
          max-width: calc((100vw - var(--bs-main-nav-width, 260px)) * 0.8);
          width: calc((100vw - var(--bs-main-nav-width, 260px)) * 0.8);
          margin: 1.75rem auto;
        }
        html[data-menu-size='condensed'] .modal-dialog.devolucoes-solicitadas-modal-wide,
        html[data-menu-size='sm-hover'] .modal-dialog.devolucoes-solicitadas-modal-wide,
        html[data-menu-size='sm-hover-active'] .modal-dialog.devolucoes-solicitadas-modal-wide {
          max-width: calc((100vw - var(--bs-main-nav-width-sm, 75px)) * 0.8);
          width: calc((100vw - var(--bs-main-nav-width-sm, 75px)) * 0.8);
        }
        html[data-menu-size='hidden']:not(.sidebar-enable) .modal-dialog.devolucoes-solicitadas-modal-wide {
          max-width: 80vw;
          width: 80vw;
        }
      `}</style>
      <Row className="mb-4">
        <Col>
          <h4 className="mb-1">Devoluções solicitadas</h4>
          <p className="text-muted mb-0">
            Solicitações feitas pelo fluxo público de revisão de nota fiscal. Clique em uma linha para ver
            materiais, fotos e observações.
          </p>
        </Col>
      </Row>

      <Card className="border-0 shadow-sm">
        <Card.Body>
          {loading ? (
            <div className="d-flex align-items-center gap-2 py-5 justify-content-center text-muted">
              <Spinner animation="border" size="sm" />
              Carregando…
            </div>
          ) : rows.length === 0 ? (
            <div className="text-muted py-4 text-center">Nenhuma solicitação registrada ainda.</div>
          ) : (
            <div className="table-responsive">
              <Table hover className="align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Nº</th>
                    <th>Data</th>
                    <th>Cliente</th>
                    <th>Nota</th>
                    <th>Valor</th>
                    <th>Telefone</th>
                    <th>WhatsApp?</th>
                    <th>ID NF (Tiny)</th>
                    <th>Fotos</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      role="button"
                      style={{ cursor: 'pointer' }}
                      onClick={() => abrirDetalhe(r.id)}
                    >
                      <td className="fw-semibold">{r.id}</td>
                      <td>{formatData(r.created_at)}</td>
                      <td>{r.cliente_nome || '—'}</td>
                      <td>
                        {r.nota_numero || '—'}
                        {r.nota_serie ? ` / sér. ${r.nota_serie}` : ''}
                      </td>
                      <td>
                        {parseMoney(r.valor_nota).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td>{r.telefone}</td>
                      <td>{r.telefone_e_whatsapp ? 'Sim' : 'Não'}</td>
                      <td className="small text-muted">{r.tiny_nota_fiscal_id}</td>
                      <td>{r.qtd_anexos}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Card.Body>
      </Card>

      <Modal
        show={modalOpen}
        onHide={fecharModal}
        centered
        scrollable
        className="devolucoes-solicitadas-modal-align"
        dialogClassName="devolucoes-solicitadas-modal-wide"
      >
        <Modal.Header closeButton>
          <Modal.Title>
            Solicitação nº {detalhe?.id ?? '…'}
            {detalhe ? <span className="text-muted fw-normal fs-6 ms-2">{formatData(detalhe.created_at)}</span> : null}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {detalheLoading && (
            <div className="d-flex align-items-center gap-2 py-5 justify-content-center text-muted">
              <Spinner animation="border" size="sm" />
              Carregando detalhes…
            </div>
          )}
          {!detalheLoading && !detalhe && (
            <div className="text-danger">Não foi possível carregar esta solicitação.</div>
          )}
          {detalhe && (
            <>
              <Row className="g-3 mb-3 small">
                <Col md={6}>
                  <div className="text-muted text-uppercase" style={{ fontSize: '0.65rem' }}>
                    Cliente
                  </div>
                  <div className="fw-semibold">{detalhe.cliente_nome || '—'}</div>
                </Col>
                <Col md={2}>
                  <div className="text-muted text-uppercase" style={{ fontSize: '0.65rem' }}>
                    Telefone
                  </div>
                  <div>{detalhe.telefone}</div>
                </Col>
                <Col md={2}>
                  <div className="text-muted text-uppercase" style={{ fontSize: '0.65rem' }}>
                    É WhatsApp?
                  </div>
                  <div>{detalhe.telefone_e_whatsapp ? 'Sim' : 'Não'}</div>
                </Col>
                <Col md={2}>
                  <div className="text-muted text-uppercase" style={{ fontSize: '0.65rem' }}>
                    Valor (nota)
                  </div>
                  <div>
                    {parseMoney(detalhe.valor_nota).toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </div>
                </Col>
                <Col md={4}>
                  <div className="text-muted text-uppercase" style={{ fontSize: '0.65rem' }}>
                    Nota fiscal
                  </div>
                  <div>
                    {detalhe.nota_numero || '—'}
                    {detalhe.nota_serie ? ` · Série ${detalhe.nota_serie}` : ''}
                  </div>
                </Col>
                <Col md={8}>
                  <div className="text-muted text-uppercase" style={{ fontSize: '0.65rem' }}>
                    ID nota (Tiny)
                  </div>
                  <div className="font-monospace small">{detalhe.tiny_nota_fiscal_id}</div>
                </Col>
              </Row>

              <h6 className="border-bottom pb-2 mb-2">Materiais marcados pelo cliente</h6>
              {snapshotItens.length > 0 ? (
                <Table size="sm" bordered responsive className="mb-3">
                  <thead className="table-light">
                    <tr>
                      <th>Descrição</th>
                      <th>Código</th>
                      <th>Qtd</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshotItens.map((it, idx) => (
                      <tr key={`${it.indice}-${idx}`}>
                        <td>{it.descricao}</td>
                        <td>{it.codigo || '—'}</td>
                        <td>
                          {it.quantidade ?? '—'} {it.unidade || ''}
                        </td>
                        <td>
                          {parseMoney(it.valor_total).toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              ) : (
                <p className="text-muted small mb-3">
                  Nenhum item com snapshot salvo. Índices marcados:{' '}
                  {indicesList.length ? indicesList.join(', ') : '—'}
                </p>
              )}

              <h6 className="border-bottom pb-2 mb-2">Observações</h6>
              <div
                className="mb-3 p-3 rounded bg-light border"
                style={{ whiteSpace: 'pre-wrap', minHeight: 48 }}
              >
                {detalhe.observacoes?.trim() ? detalhe.observacoes : (
                  <span className="text-muted">Nenhuma observação informada.</span>
                )}
              </div>

              <h6 className="border-bottom pb-2 mb-2">Fotos anexadas</h6>
              {detalhe.anexos.length === 0 ? (
                <p className="text-muted small">Sem imagens.</p>
              ) : (
                <Row className="g-2">
                  {detalhe.anexos.map((a) => (
                    <Col xs={12} md={4} key={a.ordem}>
                      <div className="border rounded overflow-hidden bg-light" style={{ aspectRatio: '1' }}>
                        <img
                          src={a.imagemUrl}
                          alt={`Anexo ${a.ordem + 1}`}
                          className="w-100 h-100"
                          style={{ objectFit: 'contain' }}
                        />
                      </div>
                      <div className="small text-muted text-truncate mt-1" title={a.file_name}>
                        {a.file_name}
                      </div>
                    </Col>
                  ))}
                </Row>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <button type="button" className="btn btn-secondary" onClick={fecharModal}>
            Fechar
          </button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
