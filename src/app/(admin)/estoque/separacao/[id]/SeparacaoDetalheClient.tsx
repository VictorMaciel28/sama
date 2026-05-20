'use client'

import IconifyIcon from '@/components/wrappers/IconifyIcon'
import { notifyEmbalagemListaUpdated } from '@/lib/embalagemListaBroadcast'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  Collapse,
  Form,
  ListGroup,
  Modal,
  Spinner,
} from 'react-bootstrap'

type PedidoLinha = {
  numero: number
  cliente: string
  status: string
  total: string
  data: string
}

type Grupo = {
  codigo: string | null
  nome: string
  unidade: string | null
  total_quantidade: number
  produto_id: number | null
  pedidos: { numero: number; quantidade: number }[]
}

type Detalhe = {
  id: number
  status: string
  status_label: string
  created_at: string
  finished_at: string | null
  pedidos: PedidoLinha[]
  itens_agrupados: Grupo[]
}

function chaveItem(idx: number, g: Grupo) {
  return `${idx}|${g.codigo ?? ''}|${g.nome}`
}

function pickImagemUrl(json: Record<string, unknown> | null): string | null {
  if (!json) return null
  const img = json.imagem
  if (typeof img === 'string' && img.trim()) return img.trim()
  const ext = json.imagensExternas
  if (Array.isArray(ext) && ext.length > 0) {
    const first = ext[0] as unknown
    if (typeof first === 'string' && first.trim()) return first.trim()
    if (first && typeof first === 'object' && 'url' in first) {
      const u = (first as { url?: unknown }).url
      if (typeof u === 'string' && u.trim()) return u.trim()
    }
  }
  return null
}

export default function SeparacaoDetalheClient() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id ?? '')
  const [data, setData] = useState<Detalhe | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [openIdx, setOpenIdx] = useState<Record<number, boolean>>({})
  const [marcados, setMarcados] = useState<Record<string, boolean>>({})
  const [finishing, setFinishing] = useState(false)
  const [modalPronto, setModalPronto] = useState(false)
  const [modalErro, setModalErro] = useState<string | null>(null)
  const [fotoModal, setFotoModal] = useState<{
    show: boolean
    nome: string
    url: string | null
    loading: boolean
    erro: string | null
  }>({ show: false, nome: '', url: null, loading: false, erro: null })

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch(`/api/estoque/separacoes/${id}`)
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        setErr(json?.error ?? '—')
        setData(null)
        return
      }
      setData(json.data as Detalhe)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    setMarcados({})
    setOpenIdx({})
  }, [id])

  const chaves = useMemo(() => {
    if (!data) return []
    return data.itens_agrupados.map((g, idx) => chaveItem(idx, g))
  }, [data])

  const todosMarcados = chaves.length === 0 || chaves.every((k) => marcados[k])

  const toggleMarca = (k: string) => {
    setMarcados((m) => ({ ...m, [k]: !m[k] }))
  }

  const statusVariant = (status: string) => {
    if (status === 'CONCLUIDO') return 'secondary'
    if (status === 'SEPARADO') return 'success'
    if (status === 'SEPARANDO') return 'warning'
    return 'secondary'
  }

  const abrirFotoProduto = async (g: Grupo) => {
    setFotoModal({ show: true, nome: g.nome, url: null, loading: true, erro: null })
    if (g.produto_id == null) {
      setFotoModal({ show: true, nome: g.nome, url: null, loading: false, erro: '—' })
      return
    }
    try {
      const res = await fetch(`/api/produtos/${g.produto_id}`)
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
      if (!res.ok || (json && typeof json.erro === 'string')) {
        setFotoModal({
          show: true,
          nome: g.nome,
          url: null,
          loading: false,
          erro: (json?.erro as string) ?? '—',
        })
        return
      }
      const url = pickImagemUrl(json)
      setFotoModal({
        show: true,
        nome: g.nome,
        url,
        loading: false,
        erro: url ? null : '—',
      })
    } catch {
      setFotoModal({ show: true, nome: g.nome, url: null, loading: false, erro: '—' })
    }
  }

  const confirmarProntoEmbalagem = async () => {
    if (!data || data.status !== 'SEPARANDO') return
    setFinishing(true)
    try {
      const res = await fetch(`/api/estoque/separacoes/${id}/finalizar`, { method: 'POST' })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        setModalPronto(false)
        setModalErro(json?.error ?? '—')
        return
      }
      setModalPronto(false)
      setMarcados({})
      notifyEmbalagemListaUpdated()
      try {
        sessionStorage.setItem('separacao_pronto_embalagem', '1')
      } catch {
        /* ignore */
      }
      router.replace('/estoque/separacao')
    } finally {
      setFinishing(false)
    }
  }

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center gap-2 py-5 text-muted">
        <Spinner animation="border" size="sm" />
        Carregando…
      </div>
    )
  }

  if (err || !data) {
    return (
      <Card className="border-0 shadow-sm">
        <Card.Body>
          <p className="text-danger mb-3">{err ?? '—'}</p>
          <Button variant="outline-secondary" size="sm" as={Link} href="/estoque/separacao">
            Voltar
          </Button>
        </Card.Body>
      </Card>
    )
  }

  const podeFinalizar = data.status === 'SEPARANDO'
  const podeAcaoPronto = podeFinalizar && todosMarcados

  return (
    <>
      <div className="pb-5 pb-md-4" style={{ paddingBottom: podeFinalizar ? '5.5rem' : undefined }}>
        <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
          <div>
            <Button variant="link" className="text-decoration-none p-0 mb-1 d-inline-flex align-items-center gap-1" as={Link} href="/estoque/separacao">
              <IconifyIcon icon="ri:arrow-left-line" />
              <span>Voltar</span>
            </Button>
            <h4 className="mb-1">#{data.id}</h4>
            <Badge bg={statusVariant(data.status)} className="me-2">
              {data.status_label}
            </Badge>
          </div>
        </div>

        <Card className="border-0 shadow-sm mb-3">
          <Card.Header className="bg-white py-2 fw-semibold small">Pedidos</Card.Header>
          <ListGroup variant="flush">
            {data.pedidos.map((p) => (
              <ListGroup.Item key={p.numero} className="d-flex flex-wrap justify-content-between gap-2 align-items-center py-2">
                <span className="fw-medium">#{p.numero}</span>
                <span className="text-break flex-grow-1 text-md-end">{p.cliente}</span>
                <Badge bg="light" text="dark" className="border">
                  {p.status}
                </Badge>
              </ListGroup.Item>
            ))}
          </ListGroup>
        </Card>

        <Card className="border-0 shadow-sm">
          <Card.Header className="bg-white py-2 fw-semibold small d-flex align-items-center justify-content-between">
            <span>Itens</span>
            {podeFinalizar && chaves.length > 0 ? (
              <span className="text-muted fw-normal" style={{ fontSize: '0.75rem' }}>
                {chaves.filter((k) => marcados[k]).length}/{chaves.length}
              </span>
            ) : null}
          </Card.Header>
          <ListGroup variant="flush">
            {data.itens_agrupados.map((g, idx) => {
              const k = chaveItem(idx, g)
              const open = !!openIdx[idx]
              const temTinyId = g.produto_id != null
              return (
                <ListGroup.Item key={k} className="px-2 py-2">
                  <div className="d-flex align-items-start gap-2">
                    {podeFinalizar ? (
                      <Form.Check
                        type="checkbox"
                        checked={!!marcados[k]}
                        onChange={() => toggleMarca(k)}
                        id={`sep-item-${idx}`}
                        className="mt-1 flex-shrink-0"
                        aria-label={`Separado ${g.nome}`}
                      />
                    ) : null}
                    <Button
                      type="button"
                      variant="light"
                      size="sm"
                      className="p-1 flex-shrink-0 rounded border"
                      title="Foto"
                      disabled={!temTinyId}
                      onClick={() => abrirFotoProduto(g)}
                    >
                      <IconifyIcon icon="ri:image-2-line" className={`fs-20 ${temTinyId ? 'text-primary' : 'text-muted'}`} />
                    </Button>
                    <div className="flex-grow-1 min-w-0">
                      <div className="d-flex flex-column flex-md-row flex-md-wrap align-items-stretch align-items-md-center gap-2 w-100">
                        <div className="d-flex flex-wrap align-items-center gap-2 flex-grow-1 min-w-0">
                          {g.codigo ? (
                            <Badge bg="secondary" className="font-monospace">
                              {g.codigo}
                            </Badge>
                          ) : null}
                          <span className="fw-medium text-break">{g.nome}</span>
                        </div>
                        <div className="d-flex align-items-center justify-content-end gap-2 ms-md-auto flex-shrink-0">
                          <span className="text-primary fw-semibold">{g.total_quantidade}</span>
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="p-0 text-decoration-none small text-nowrap"
                            onClick={() => setOpenIdx((m) => ({ ...m, [idx]: !open }))}
                          >
                            <IconifyIcon icon={open ? 'ri:arrow-up-s-line' : 'ri:arrow-down-s-line'} className="me-1" />
                            {open ? 'Ocultar' : 'Pedidos'}
                          </Button>
                        </div>
                      </div>
                      {g.unidade ? <div className="small text-muted mt-1">Un. {g.unidade}</div> : null}
                      <Collapse in={open}>
                        <div className="mt-2 border-top pt-2">
                          <ListGroup variant="flush" className="rounded border bg-light">
                            {g.pedidos.map((pp) => (
                              <ListGroup.Item key={pp.numero} className="d-flex justify-content-between py-1 px-2 small bg-transparent">
                                <span>#{pp.numero}</span>
                                <span className="fw-medium">{pp.quantidade}</span>
                              </ListGroup.Item>
                            ))}
                          </ListGroup>
                        </div>
                      </Collapse>
                    </div>
                  </div>
                </ListGroup.Item>
              )
            })}
          </ListGroup>
        </Card>

        {podeFinalizar ? (
          <div
            className="position-fixed bottom-0 start-0 end-0 p-3 border-top bg-body shadow-lg d-md-none"
            style={{ zIndex: 1020, paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            <Button
              variant="success"
              size="lg"
              className="w-100 py-3"
              onClick={() => setModalPronto(true)}
              disabled={finishing || !podeAcaoPronto}
            >
              {finishing ? <Spinner animation="border" size="sm" /> : 'Pronto para embalagem'}
            </Button>
          </div>
        ) : null}

        {podeFinalizar ? (
          <div className="d-none d-md-flex justify-content-end mt-3">
            <Button variant="success" size="lg" className="px-5" onClick={() => setModalPronto(true)} disabled={finishing || !podeAcaoPronto}>
              {finishing ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  …
                </>
              ) : (
                'Pronto para embalagem'
              )}
            </Button>
          </div>
        ) : null}
      </div>

      <Modal show={modalPronto} onHide={() => !finishing && setModalPronto(false)} centered backdrop="static">
        <Modal.Header closeButton={!finishing}>
          <Modal.Title>Pronto para embalagem</Modal.Title>
        </Modal.Header>
        <Modal.Body className="pt-2">Confirmar?</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setModalPronto(false)} disabled={finishing}>
            Voltar
          </Button>
          <Button variant="success" onClick={confirmarProntoEmbalagem} disabled={finishing}>
            {finishing ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                …
              </>
            ) : (
              'Confirmar'
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={modalErro != null} onHide={() => setModalErro(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title className="text-danger fs-6">Erro</Modal.Title>
        </Modal.Header>
        <Modal.Body className="small">{modalErro}</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setModalErro(null)}>
            Fechar
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={fotoModal.show} onHide={() => !fotoModal.loading && setFotoModal((s) => ({ ...s, show: false }))} centered size="lg">
        <Modal.Header closeButton={!fotoModal.loading}>
          <Modal.Title className="text-break fs-6">{fotoModal.nome}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center py-4">
          {fotoModal.loading ? (
            <Spinner animation="border" />
          ) : fotoModal.url ? (
            <img src={fotoModal.url} alt="" className="img-fluid rounded" style={{ maxHeight: '70vh' }} />
          ) : (
            <span className="text-muted">{fotoModal.erro ?? '—'}</span>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setFotoModal((s) => ({ ...s, show: false }))} disabled={fotoModal.loading}>
            Fechar
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
