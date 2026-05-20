import type { Metadata } from 'next'
import { verifyEmbalagemPublicQuery } from '@/lib/embalagemPublicLink'
import { getEmbalagemPublicoPayload } from '@/lib/embalagemPublicoQuery'
import Link from 'next/link'
import { Badge, Card, Col, Row, Table } from 'react-bootstrap'

export const metadata: Metadata = {
  title: 'Dados da embalagem',
  robots: { index: false, follow: false },
}

function formatCnpjDisplay(cnpj: string) {
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14) return cnpj.trim() || '—'
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

function ErrorPanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="container px-3" style={{ maxWidth: '480px' }}>
      <Card className="border-0 shadow rounded-4 overflow-hidden">
        <Card.Body className="p-4 p-md-5 text-center">
          <div className="text-danger fw-semibold mb-2">{title}</div>
          <p className="text-muted small mb-0">{message}</p>
        </Card.Body>
      </Card>
    </div>
  )
}

export default async function EmbalagemPublicoPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  const sp = searchParams
  const idRaw = typeof sp.id === 'string' ? sp.id : Array.isArray(sp.id) ? sp.id[0] : undefined
  const eRaw = typeof sp.e === 'string' ? sp.e : Array.isArray(sp.e) ? sp.e[0] : undefined
  const sig = typeof sp.sig === 'string' ? sp.sig : Array.isArray(sp.sig) ? sp.sig[0] : undefined

  const id = Number(idRaw)
  const e = Number(eRaw)

  if (!Number.isFinite(id) || id < 1 || !Number.isFinite(e) || !sig) {
    return <ErrorPanel title="Link inválido" message="Verifique se o endereço foi copiado por completo." />
  }

  if (!verifyEmbalagemPublicQuery(id, e, sig)) {
    return <ErrorPanel title="Link inválido ou expirado" message="Solicite um novo QR na lista de embalagem." />
  }

  const data = await getEmbalagemPublicoPayload(id)
  if (!data) {
    return <ErrorPanel title="Não encontrado" message="Esta embalagem não está mais disponível." />
  }

  return (
    <>
      <style>{`
        @media print {
          .emb-publico-no-print { display: none !important; }
          .emb-publico-root { background: #fff !important; padding: 0 !important; }
          .emb-publico-sheet { box-shadow: none !important; border: 1px solid #dee2e6 !important; }
        }
        .emb-publico-table thead th { font-weight: 600; }
      `}</style>

      <div className="container px-3" style={{ maxWidth: '720px' }}>
        <div className="emb-publico-no-print mb-3">
          <Link href="/" className="small text-decoration-none text-secondary">
            ← Início
          </Link>
        </div>

        <Card className="emb-publico-sheet border-0 shadow-lg rounded-4 overflow-hidden">
          <Card.Header
            as="div"
            className="emb-publico-no-print border-0 py-4 px-4 px-md-5 text-white"
            style={{
              background: 'linear-gradient(135deg, #1e3a5f 0%, #2c5282 45%, #3182ce 100%)',
            }}
          >
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
              <div>
                <div className="small text-uppercase mb-1 text-white" style={{ letterSpacing: '0.08em', opacity: 0.88 }}>
                  Conferência logística
                </div>
                <h1 className="h4 mb-0 fw-semibold">Embalagem</h1>
              </div>
              <Badge bg="light" text="dark" className="fs-6 px-3 py-2 rounded-pill">
                #{data.id}
              </Badge>
            </div>
          </Card.Header>

          <Card.Body className="p-4 p-md-5">
            <section className="mb-4 pb-4 border-bottom">
              <div className="text-uppercase text-muted fw-semibold small mb-2" style={{ letterSpacing: '0.06em' }}>
                Empresa origem
              </div>
              <Row className="g-2 align-items-baseline">
                <Col xs={12}>
                  <span className="fs-5 fw-semibold text-dark">{data.empresa.nome}</span>
                </Col>
                <Col xs={12}>
                  <span className="text-muted">CNPJ </span>
                  <span className="font-monospace text-body">{formatCnpjDisplay(data.empresa.cnpj)}</span>
                </Col>
              </Row>
            </section>

            {data.pedidos.map((p) => (
              <section key={p.numero} className="mb-5">
                <div className="d-flex align-items-center gap-2 mb-3">
                  <span
                    className="rounded-circle d-inline-flex align-items-center justify-content-center flex-shrink-0 text-white fw-bold small"
                    style={{
                      width: '2rem',
                      height: '2rem',
                      background: 'linear-gradient(135deg, #2b6cb0, #3182ce)',
                    }}
                  >
                    #
                  </span>
                  <h2 className="h5 mb-0 fw-semibold text-dark">Pedido {p.numero}</h2>
                </div>

                <Card className="border-0 bg-light rounded-3 mb-3">
                  <Card.Body className="p-3 p-md-4">
                    <div className="text-uppercase text-muted fw-semibold small mb-2" style={{ letterSpacing: '0.06em' }}>
                      Cliente
                    </div>
                    <div className="fw-semibold text-break mb-1">{p.cliente}</div>
                    <div className="small text-muted">
                      CNPJ <span className="font-monospace text-body">{formatCnpjDisplay(p.cliente_cnpj)}</span>
                    </div>
                  </Card.Body>
                </Card>

                <div className="text-uppercase text-muted fw-semibold small mb-2" style={{ letterSpacing: '0.06em' }}>
                  Materiais
                </div>
                <div className="rounded-3 border overflow-hidden bg-white">
                  <Table responsive hover size="sm" className="mb-0 align-middle emb-publico-table">
                    <thead className="table-light">
                      <tr className="small text-muted text-uppercase" style={{ fontSize: '0.65rem', letterSpacing: '0.05em' }}>
                        <th className="border-0 py-2 ps-3">Código</th>
                        <th className="border-0 py-2">Descrição</th>
                        <th className="border-0 py-2 text-end pe-3" style={{ width: '6.5rem' }}>
                          Qtd
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.materiais.map((m, i) => (
                        <tr key={i}>
                          <td className="ps-3 py-2 font-monospace small text-secondary text-break" style={{ maxWidth: '8rem' }}>
                            {m.codigo ?? '—'}
                          </td>
                          <td className="py-2 text-break">{m.nome}</td>
                          <td className="text-end pe-3 py-2 text-nowrap fw-semibold">
                            {m.quantidade}
                            {m.unidade ? <span className="text-muted fw-normal"> {m.unidade}</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </section>
            ))}

            <p className="small text-muted emb-publico-no-print mb-0 pt-2 border-top">
              Documento informativo para conferência de carga. Imprima pelo navegador se precisar de cópia em papel.
            </p>
          </Card.Body>
        </Card>
      </div>
    </>
  )
}
