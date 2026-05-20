'use client'

import type { CSSProperties } from 'react'
import IconifyIcon from '@/components/wrappers/IconifyIcon'
import { notifyEmbalagemListaUpdated } from '@/lib/embalagemListaBroadcast'
import { matchesSkuOrGtin } from '@/lib/embalagemScanMatch'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Button, Card, Col, Form, ListGroup, Modal, Row, Spinner } from 'react-bootstrap'

/** Destaque verde (conferido completo). */
const rowConferidoStyle: CSSProperties = {
  backgroundColor: '#d4f4dd',
  border: '1px solid #8fd4a8',
}

/** Parcialmente bipado — mesmo tom da página de pedidos (produto já no pedido). */
const rowParcialStyle: CSSProperties = {
  backgroundColor: '#e8f4fc',
}

function parseRequerido(quantidade: string): number {
  const n = Number.parseFloat(String(quantidade).replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return 1
  return Math.max(1, Math.round(n))
}

type Item = {
  id: number
  codigo: string | null
  gtin: string | null
  nome: string
  unidade: string | null
  quantidade: string
  produto_id: number | null
}

type PedidoEmb = {
  index: number
  numero: number
  cliente: string
  status: string
  itens: Item[]
}

type Payload = {
  id: number
  pedidos: PedidoEmb[]
}

type Linha = Item & {
  key: string
  pedidoNumero: number
  cliente: string
  requerido: number
  contado: number
}

function linhaEmbConcluida(l: Linha): boolean {
  return l.contado >= l.requerido
}

function itemLinhaMatchesScan(l: Linha, qTrimmed: string): boolean {
  return matchesSkuOrGtin(l.codigo, qTrimmed) || matchesSkuOrGtin(l.gtin, qTrimmed)
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

export default function EmbalagemFluxoClient() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id ?? '')
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [scan, setScan] = useState('')
  const [qtdPorBip, setQtdPorBip] = useState('1')
  const [scanErro, setScanErro] = useState<string | null>(null)
  const [modalErro, setModalErro] = useState<string | null>(null)
  const [fotoModal, setFotoModal] = useState<{
    show: boolean
    nome: string
    url: string | null
    loading: boolean
    erro: string | null
  }>({ show: false, nome: '', url: null, loading: false, erro: null })
  const scanRef = useRef<HTMLInputElement>(null)
  const completingRef = useRef(false)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch(`/api/estoque/embalagem/${id}`)
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        setErr(json?.error ?? '—')
        setData(null)
        return
      }
      setData(json.data as Payload)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!data) {
      setLinhas([])
      return
    }
    completingRef.current = false
    const next: Linha[] = []
    for (const p of data.pedidos) {
      for (const it of p.itens) {
        next.push({
          ...it,
          gtin: it.gtin ?? null,
          key: `${p.numero}-${it.id}`,
          pedidoNumero: p.numero,
          cliente: p.cliente,
          requerido: parseRequerido(it.quantidade),
          contado: 0,
        })
      }
    }
    setLinhas(next)
  }, [data])

  useEffect(() => {
    if (loading || err || !data) return
    const t = window.setTimeout(() => scanRef.current?.focus(), 100)
    return () => window.clearTimeout(t)
  }, [loading, err, data])

  const conferidos = useMemo(() => linhas.filter(linhaEmbConcluida).length, [linhas])
  const totalLinhas = linhas.length

  const finalizarSeparacao = useCallback(async () => {
    if (completingRef.current) return
    completingRef.current = true
    try {
      const res = await fetch(`/api/estoque/embalagem/${id}/finalizar`, { method: 'POST' })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        completingRef.current = false
        setModalErro(json?.error ?? 'Não foi possível concluir.')
        return
      }
      notifyEmbalagemListaUpdated()
      router.replace('/estoque/embalagem')
    } catch {
      completingRef.current = false
      setModalErro('Não foi possível concluir.')
    }
  }, [id, router])

  const abrirFotoProduto = async (nome: string, produtoId: number | null) => {
    setFotoModal({ show: true, nome, url: null, loading: true, erro: null })
    if (produtoId == null) {
      setFotoModal({ show: true, nome, url: null, loading: false, erro: '—' })
      return
    }
    try {
      const res = await fetch(`/api/produtos/${produtoId}`)
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
      if (!res.ok || (json && typeof json.erro === 'string')) {
        setFotoModal({
          show: true,
          nome,
          url: null,
          loading: false,
          erro: (json?.erro as string) ?? '—',
        })
        return
      }
      const url = pickImagemUrl(json)
      setFotoModal({
        show: true,
        nome,
        url,
        loading: false,
        erro: url ? null : '—',
      })
    } catch {
      setFotoModal({ show: true, nome, url: null, loading: false, erro: '—' })
    }
  }

  const confirmarScan = useCallback(() => {
    if (linhas.length > 0 && linhas.every(linhaEmbConcluida)) {
      setScan('')
      return
    }
    const q = scan.trim()
    if (!q) {
      setScanErro(null)
      return
    }
    const incRaw = Number.parseInt(String(qtdPorBip).trim(), 10)
    const incremento = Number.isFinite(incRaw) && incRaw > 0 ? incRaw : 1
    const idx = linhas.findIndex((l) => !linhaEmbConcluida(l) && itemLinhaMatchesScan(l, q))
    if (idx === -1) {
      const jaInformado = linhas.some((l) => linhaEmbConcluida(l) && itemLinhaMatchesScan(l, q))
      setScanErro(jaInformado ? 'Material já foi informado' : 'Nenhum item pendente corresponde a este código.')
      return
    }
    const alvo = linhas[idx]
    const falta = alvo.requerido - alvo.contado
    if (incremento > falta) {
      setScanErro('Quantidade acima da exigida')
      return
    }
    const key = alvo.key
    const novoContado = Math.min(alvo.requerido, alvo.contado + incremento)
    const next = linhas.map((l, i) => (i === idx ? { ...l, contado: novoContado } : l))
    setLinhas(next)
    setScan('')
    setScanErro(null)
    window.setTimeout(() => {
      rowRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      scanRef.current?.focus()
    }, 0)
    if (next.length > 0 && next.every(linhaEmbConcluida)) {
      void finalizarSeparacao()
    }
  }, [linhas, scan, qtdPorBip, finalizarSeparacao])

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
          <Button variant="outline-secondary" size="sm" as={Link} href="/estoque/embalagem">
            Voltar
          </Button>
        </Card.Body>
      </Card>
    )
  }

  if (totalLinhas === 0) {
    return (
      <Card className="border-0 shadow-sm">
        <Card.Body>
          <p className="text-muted mb-3">Nenhum item nesta separação.</p>
          <Button variant="outline-secondary" size="sm" as={Link} href="/estoque/embalagem">
            Voltar
          </Button>
        </Card.Body>
      </Card>
    )
  }

  return (
    <>
      <div className="pb-3" style={{ paddingBottom: 'max(9rem, env(safe-area-inset-bottom))' }}>
        <div className="mb-3">
          <Button
            variant="link"
            className="text-decoration-none p-0 mb-1 d-inline-flex align-items-center gap-1"
            as={Link}
            href="/estoque/embalagem"
          >
            <IconifyIcon icon="ri:arrow-left-line" />
            <span>Voltar</span>
          </Button>
          <h4 className="mb-1">Conferência · #{data.id}</h4>
          <div className="text-muted small">
            {conferidos} de {totalLinhas} itens conferidos
          </div>
        </div>

        {data.pedidos.map((pedido) => (
          <Card key={pedido.numero} className="border-0 shadow-sm mb-3">
            <Card.Header className="bg-white py-2 fw-semibold small d-flex flex-wrap align-items-center justify-content-between gap-2">
              <span className="d-flex flex-wrap align-items-center gap-2">
                <span className="fw-medium">Pedido #{pedido.numero}</span>
                <span className="text-break">{pedido.cliente}</span>
              </span>
              <Badge bg="light" text="dark" className="border">
                {pedido.status}
              </Badge>
            </Card.Header>
            <ListGroup variant="flush">
              {linhas
                .filter((l) => l.pedidoNumero === pedido.numero)
                .map((l) => {
                  const temTinyId = l.produto_id != null
                  const ok = linhaEmbConcluida(l)
                  const parcial = l.contado > 0 && l.contado < l.requerido
                  return (
                    <ListGroup.Item key={l.key} className="py-3 px-2 rounded-0 border-bottom">
                      <div
                        ref={(el) => {
                          rowRefs.current[l.key] = el
                        }}
                        className={`rounded p-2 w-100${parcial ? ' border border-info' : ''}`}
                        style={ok ? rowConferidoStyle : parcial ? rowParcialStyle : undefined}
                      >
                        <div className="d-flex align-items-start gap-2">
                          <Button
                            type="button"
                            variant="light"
                            size="sm"
                            className="p-1 flex-shrink-0 rounded border align-self-start"
                            title="Foto"
                            disabled={!temTinyId}
                            onClick={() => abrirFotoProduto(l.nome, l.produto_id)}
                          >
                            <IconifyIcon icon="ri:image-2-line" className={`fs-20 ${temTinyId ? 'text-primary' : 'text-muted'}`} />
                          </Button>
                          <div className="flex-grow-1 min-w-0 d-flex flex-column gap-2">
                            <div className="d-flex flex-wrap align-items-center gap-2">
                              <div className="d-flex flex-wrap align-items-center gap-1 min-w-0 flex-grow-1">
                                {l.codigo ? (
                                  <Badge bg="secondary" className="font-monospace text-truncate" style={{ maxWidth: 'min(100%, 11rem)' }}>
                                    {l.codigo}
                                  </Badge>
                                ) : null}
                                {ok ? (
                                  <Badge bg="success" className="flex-shrink-0">
                                    OK
                                  </Badge>
                                ) : null}
                              </div>
                              <div
                                className={`flex-shrink-0 ms-auto small fw-semibold text-nowrap rounded px-2 py-1 border ${
                                  ok
                                    ? 'border-success-subtle bg-success-subtle'
                                    : parcial
                                      ? 'border-info-subtle bg-info-subtle'
                                      : 'bg-body-secondary border-secondary-subtle text-body-secondary'
                                }`}
                              >
                                <span className="text-uppercase fw-normal opacity-75" style={{ fontSize: '0.65rem', letterSpacing: '0.04em' }}>
                                  Bipes
                                </span>{' '}
                                <span className={parcial ? 'text-info' : ok ? 'text-success' : ''}>
                                  {l.contado}/{l.requerido}
                                </span>
                                {l.unidade ? <span className="text-muted fw-normal"> {l.unidade}</span> : null}
                              </div>
                            </div>
                            <div className="fw-medium text-break lh-sm w-100">{l.nome}</div>
                          </div>
                        </div>
                      </div>
                    </ListGroup.Item>
                  )
                })}
            </ListGroup>
          </Card>
        ))}
      </div>

      <div
        className="position-fixed bottom-0 start-0 end-0 border-top bg-body shadow-lg"
        style={{ zIndex: 1020, paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="px-3 pt-3 mx-auto" style={{ maxWidth: 720 }}>
          <Form
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              confirmarScan()
            }}
          >
            <Row className="g-2 align-items-end">
              <Col xs>
                <Form.Label className="small fw-semibold mb-1">SKU ou GTIN</Form.Label>
                <Form.Control
                  ref={scanRef}
                  size="lg"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={scan}
                  onChange={(e) => {
                    setScan(e.target.value)
                    setScanErro(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    confirmarScan()
                  }}
                />
              </Col>
              <Col xs="auto" style={{ width: '5.5rem' }}>
                <Form.Label className="small fw-semibold mb-1">Qtd</Form.Label>
                <Form.Control
                  size="lg"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={qtdPorBip}
                  onChange={(e) => {
                    setQtdPorBip(e.target.value)
                    setScanErro(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    confirmarScan()
                  }}
                />
              </Col>
            </Row>
            <button type="submit" className="visually-hidden" tabIndex={-1} aria-hidden="true">
              Confirmar
            </button>
            {scanErro ? <div className="text-danger small mt-1 mb-2">{scanErro}</div> : <div className="mb-2" />}
          </Form>
        </div>
      </div>

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
    </>
  )
}
