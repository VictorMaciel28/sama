'use client'

import Link from 'next/link'
import { Badge, Button, Card, Spinner, Table } from 'react-bootstrap'

export type SeparacaoListaRow = {
  id: number
  status: string
  status_label: string
  created_at: string
  responsavel_nome: string | null
  pedidos_count: number
}

function formatData(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function statusVariant(status: string) {
  if (status === 'SEPARADO') return 'primary'
  if (status === 'SEPARANDO') return 'warning'
  if (status === 'CONCLUIDO') return 'secondary'
  return 'secondary'
}

export default function SeparacaoListaView({ rows, loading }: { rows: SeparacaoListaRow[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center gap-2 py-5 text-muted">
        <Spinner animation="border" size="sm" />
        Carregando…
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
              <th>Início</th>
              <th>Responsável</th>
              <th>Pedidos</th>
              <th className="text-end">Ação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="text-muted">#{r.id}</td>
                <td>
                  <Badge bg={statusVariant(r.status)}>{r.status_label}</Badge>
                </td>
                <td className="small text-nowrap">{formatData(r.created_at)}</td>
                <td className="small text-break">{r.responsavel_nome ?? '—'}</td>
                <td className="small">{r.pedidos_count}</td>
                <td className="text-end">
                  <Button variant="outline-primary" size="sm" as={Link} href={`/estoque/separacao/${r.id}`}>
                    Abrir
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <div className="d-md-none d-flex flex-column gap-2">
        {rows.map((r) => (
          <Card key={r.id} className="border shadow-sm">
            <Card.Body className="py-3">
              <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                <span className="text-muted small">#{r.id}</span>
                <Badge bg={statusVariant(r.status)}>{r.status_label}</Badge>
              </div>
              <div className="small text-muted mb-1">Início {formatData(r.created_at)}</div>
              <div className="small mb-2 text-break">
                <span className="text-muted">Responsável</span>{' '}
                <span className="text-body">{r.responsavel_nome ?? '—'}</span>
              </div>
              <div className="small mb-3">{r.pedidos_count} pedido(s)</div>
              <Button variant="primary" size="sm" className="w-100" as={Link} href={`/estoque/separacao/${r.id}`}>
                Abrir
              </Button>
            </Card.Body>
          </Card>
        ))}
      </div>
    </>
  )
}
