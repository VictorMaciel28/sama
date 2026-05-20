'use client'

import type { EmbalagemListaRow } from '@/lib/embalagemListaQuery'
import Link from 'next/link'
import { Badge, Button, Card, Spinner, Table } from 'react-bootstrap'

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

export default function EmbalagemListaView({ rows, loading }: { rows: EmbalagemListaRow[]; loading: boolean }) {
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
                  <Badge bg={statusBadgeVariant(r.status)}>{r.status_label}</Badge>
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
    </>
  )
}
