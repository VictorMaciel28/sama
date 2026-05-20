'use client'

import IconifyIcon from '@/components/wrappers/IconifyIcon'
import type { EmbalagemListaRow } from '@/lib/embalagemListaQuery'
import { printDataUrlQr } from '@/lib/printDataUrlQr'
import Link from 'next/link'
import { useCallback, useState } from 'react'
import { Badge, Button, Card, Modal, Spinner, Table } from 'react-bootstrap'

export type { EmbalagemListaRow }

function formatData(iso: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function statusBadgeVariant(status: string) {
  if (status === 'CONCLUIDO') return 'secondary'
  return 'primary'
}

type QrModalState =
  | null
  | {
      id: number
      href: string
      dataUrl: string | null
      loading: boolean
      error: string | null
    }

export default function EmbalagemListaView({ rows, loading }: { rows: EmbalagemListaRow[]; loading: boolean }) {
  const [qr, setQr] = useState<QrModalState>(null)

  const openQr = useCallback(async (separationId: number) => {
    setQr({ id: separationId, href: '', dataUrl: null, loading: true, error: null })
    try {
      const res = await fetch(`/api/estoque/embalagem/${separationId}/public-link`, { cache: 'no-store' })
      const json = (await res.json().catch(() => null)) as { ok?: boolean; href?: string; error?: string } | null
      if (!json?.ok || !json.href) throw new Error(json?.error ?? 'Não foi possível gerar o link.')
      const href = String(json.href)
      const QRCode = (await import('qrcode')).default
      const dataUrl = await QRCode.toDataURL(href, { margin: 2, width: 300, errorCorrectionLevel: 'M' })
      setQr({ id: separationId, href, dataUrl, loading: false, error: null })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro'
      setQr((s) => (s ? { ...s, loading: false, error: msg } : null))
    }
  }, [])

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center gap-2 py-5 text-muted">
        <Spinner animation="border" size="sm" />
      </div>
    )
  }

  if (rows.length === 0) {
    return <div className="text-muted text-center py-4">—</div>
  }

  return (
    <>
      <div className="d-none d-md-block table-responsive rounded border">
        <Table hover className="mb-0 align-middle">
          <thead className="table-light">
            <tr>
              <th>ID</th>
              <th>Status</th>
              <th>Enviado em</th>
              <th>Responsável</th>
              <th>Pedidos</th>
              <th className="text-center text-nowrap">QR</th>
              <th className="text-end">Ação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const podeIniciar = r.status === 'SEPARADO'
              return (
                <tr key={r.id}>
                  <td className="text-muted">#{r.id}</td>
                  <td>
                    <Badge bg={statusBadgeVariant(r.status)}>{r.status_label}</Badge>
                  </td>
                  <td className="small text-nowrap">{formatData(r.enviado_embalagem_em)}</td>
                  <td className="small text-break">{r.responsavel_nome ?? '—'}</td>
                  <td className="small">{r.pedidos_count}</td>
                  <td className="text-center">
                    <Button
                      type="button"
                      variant="outline-secondary"
                      size="sm"
                      className="d-inline-flex align-items-center justify-content-center p-1 px-2"
                      title="QR para impressão (link público)"
                      onClick={() => void openQr(r.id)}
                    >
                      <IconifyIcon icon="ri:qr-code-line" className="fs-18" />
                    </Button>
                  </td>
                  <td className="text-end">
                    {podeIniciar ? (
                      <Button variant="outline-primary" size="sm" as={Link} href={`/estoque/embalagem/${r.id}`}>
                        Iniciar conferência
                      </Button>
                    ) : (
                      <span className="text-muted small">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      </div>

      <div className="d-md-none d-flex flex-column gap-2">
        {rows.map((r) => {
          const podeIniciar = r.status === 'SEPARADO'
          return (
            <Card key={r.id} className="border shadow-sm">
              <Card.Body className="py-3">
                <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                  <span className="text-muted small">#{r.id}</span>
                  <div className="d-flex align-items-center gap-1 flex-shrink-0">
                    <Button
                      type="button"
                      variant="outline-secondary"
                      size="sm"
                      className="d-inline-flex align-items-center justify-content-center p-1 px-2"
                      title="QR para impressão"
                      onClick={() => void openQr(r.id)}
                    >
                      <IconifyIcon icon="ri:qr-code-line" className="fs-18" />
                    </Button>
                    <Badge bg={statusBadgeVariant(r.status)}>{r.status_label}</Badge>
                  </div>
                </div>
                <div className="small text-muted mb-1">
                  Enviado em <span className="text-body">{formatData(r.enviado_embalagem_em)}</span>
                </div>
                {r.status === 'CONCLUIDO' && r.concluido_em ? (
                  <div className="small text-muted mb-1">
                    Concluído em <span className="text-body">{formatData(r.concluido_em)}</span>
                  </div>
                ) : null}
                <div className="small mb-2 text-break">
                  <span className="text-muted">Responsável</span>{' '}
                  <span className="text-body">{r.responsavel_nome ?? '—'}</span>
                </div>
                <div className="small mb-3">{r.pedidos_count} pedido(s)</div>
                {podeIniciar ? (
                  <Button variant="primary" size="sm" className="w-100" as={Link} href={`/estoque/embalagem/${r.id}`}>
                    Iniciar conferência
                  </Button>
                ) : null}
              </Card.Body>
            </Card>
          )
        })}
      </div>

      <Modal
        show={qr != null}
        onHide={() => setQr(null)}
        centered
        dialogClassName="modal-embalagem-qr"
        contentClassName="border-0"
      >
        <Modal.Header closeButton className="border-0 pb-0">
          <Modal.Title className="fs-6 fw-semibold">QR · Embalagem #{qr?.id}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center px-4 pt-2 pb-3">
          {qr?.loading ? (
            <div className="d-flex flex-column align-items-center gap-2 py-5">
              <Spinner animation="border" size="sm" />
              <span className="small text-muted">Gerando código…</span>
            </div>
          ) : null}
          {qr?.error ? (
            <div className="text-start rounded-3 bg-danger-subtle border border-danger-subtle p-3 mb-0">
              <p className="text-danger small mb-0">{qr.error}</p>
            </div>
          ) : null}
          {!qr?.loading && qr?.dataUrl ? (
            <>
              <p className="small text-muted mb-3">Escaneie para abrir os dados públicos desta embalagem.</p>
              <div className="modal-qrcode-wrap mx-auto mb-3">
                <img src={qr.dataUrl} alt="QR Code" />
              </div>
              <div className="d-flex flex-column align-items-center gap-2">
                <Button
                  type="button"
                  variant="outline-dark"
                  size="sm"
                  className="d-inline-flex align-items-center gap-2 rounded-pill px-3"
                  title="Imprimir apenas o QR"
                  onClick={() => {
                    if (qr?.dataUrl) printDataUrlQr(qr.dataUrl)
                  }}
                >
                  <IconifyIcon icon="ri:printer-line" className="fs-18" />
                  Imprimir QR
                </Button>
                <Button variant="link" size="sm" className="text-decoration-none py-0" as="a" href={qr.href} target="_blank" rel="noreferrer">
                  Abrir link no navegador
                </Button>
              </div>
            </>
          ) : null}
        </Modal.Body>
        <Modal.Footer className="border-0 pt-0 justify-content-center">
          <Button variant="secondary" size="sm" onClick={() => setQr(null)}>
            Fechar
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
