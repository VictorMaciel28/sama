'use client'

import IconifyIcon from '@/components/wrappers/IconifyIcon'
import { useCallback, useEffect, useState } from 'react'
import { Badge, Button, Card, Col, Modal, Overlay, Row, Spinner, Table, Tooltip } from 'react-bootstrap'
import { toast } from 'react-toastify'

function escapeHtml(s: string) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

type PedidoRow = {
  numero: number
  data: string
  cliente: string
  cnpj: string
  total: string
  representante: string | null
}

type ItemDetalhe = {
  codigo: string | null
  nome: string
  quantidade: string
  unidade: string | null
}

type PedidoDetalhe = {
  numero: number
  data: string
  cliente: string
  cnpj: string
  total: string
  representante: string | null
  itens: ItemDetalhe[]
}

function formatBrl(totalStr: string) {
  const n = Number(totalStr)
  if (!Number.isFinite(n)) return totalStr
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

function formatDataBr(isoDate: string) {
  try {
    const [y, m, d] = isoDate.split('-').map(Number)
    if (!y || !m || !d) return isoDate
    return new Date(y, m - 1, d).toLocaleDateString('pt-BR')
  } catch {
    return isoDate
  }
}

function buildPreFaturamentoPrintHtml(d: PedidoDetalhe, numero: number): string {
  const itensRows = d.itens
    .map(
      (it) =>
        `<tr><td>${escapeHtml(it.codigo ?? '—')}</td><td>${escapeHtml(it.nome)}</td><td class="text-end">${escapeHtml(it.quantidade)}${it.unidade ? ` <span class="muted">${escapeHtml(it.unidade)}</span>` : ''}</td></tr>`,
    )
    .join('')
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>Pedido #${numero}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;padding:1.25rem;color:#222;max-width:900px;margin:0 auto}
  h1{font-size:1.15rem;margin:0 0 0.75rem}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:0.5rem 1.5rem;font-size:0.9rem;margin-bottom:1rem}
  .label{color:#666;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.04em}
  table{width:100%;border-collapse:collapse;font-size:0.85rem;margin-top:0.5rem}
  th,td{border:1px solid #ccc;padding:0.45rem 0.5rem;text-align:left}
  th{background:#f5f5f5;font-weight:600}
  .text-end{text-align:right}
  .muted{color:#666}
  @media print{body{padding:0}}
</style>
</head>
<body>
  <h1>Pré-faturamento · Pedido #${numero}</h1>
  <div class="grid">
    <div><div class="label">Cliente</div><div>${escapeHtml(d.cliente)}</div></div>
    <div><div class="label">CNPJ</div><div>${escapeHtml(d.cnpj)}</div></div>
    <div><div class="label">Data</div><div>${escapeHtml(formatDataBr(d.data))}</div></div>
    <div><div class="label">Total</div><div><strong>${escapeHtml(formatBrl(d.total))}</strong></div></div>
  </div>
  <div class="label">Itens</div>
  <table>
    <thead><tr><th>Código</th><th>Descrição</th><th class="text-end">Qtd</th></tr></thead>
    <tbody>${itensRows}</tbody>
  </table>
</body>
</html>`
}

/** Impressão via iframe fora da tela (sem pop-up). `srcdoc` + `onload` evita janela em branco. */
function printHtmlInHiddenIframe(html: string, onFail: (msg: string) => void) {
  const iframe = document.createElement('iframe') as HTMLIFrameElement
  iframe.setAttribute('title', 'Impressão pré-faturamento')
  Object.assign(iframe.style, {
    position: 'fixed',
    left: '-9999px',
    top: '0',
    width: '210mm',
    minHeight: '297mm',
    border: '0',
    pointerEvents: 'none',
    zIndex: '-1',
  })

  const cleanup = () => {
    try {
      iframe.remove()
    } catch {
      /* ignore */
    }
  }

  let printStarted = false
  const runPrint = () => {
    if (printStarted) return
    const win = iframe.contentWindow
    if (!win) {
      onFail('Não foi possível preparar a impressão.')
      cleanup()
      return
    }
    printStarted = true
    try {
      win.focus()
      win.print()
    } catch {
      printStarted = false
      onFail('Falha ao abrir a impressão.')
      cleanup()
      return
    }
    win.addEventListener('afterprint', cleanup, { once: true })
    window.setTimeout(cleanup, 3000)
  }

  document.body.appendChild(iframe)

  iframe.onload = () => {
    window.setTimeout(runPrint, 100)
  }

  iframe.srcdoc = html

  window.setTimeout(() => {
    if (printStarted) return
    if (iframe.contentDocument?.readyState === 'complete' && iframe.contentWindow) {
      runPrint()
      return
    }
    cleanup()
    onFail('Não foi possível carregar o documento para impressão.')
  }, 3000)
}

export default function PreFaturamentoClient() {
  const [rows, setRows] = useState<PedidoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [modalNumero, setModalNumero] = useState<number | null>(null)
  const [detalhe, setDetalhe] = useState<PedidoDetalhe | null>(null)
  const [detalheLoading, setDetalheLoading] = useState(false)
  const [detalheErro, setDetalheErro] = useState<string | null>(null)
  const [aprovarLoading, setAprovarLoading] = useState(false)
  const [tinyTip, setTinyTip] = useState<{ target: HTMLElement; show: boolean } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/estoque/pre-faturamento/pedidos', { cache: 'no-store' })
      const json = await res.json().catch(() => null)
      setRows(json?.ok && Array.isArray(json.data) ? json.data : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const abrirPedido = async (numero: number) => {
    setModalNumero(numero)
    setDetalhe(null)
    setDetalheErro(null)
    setDetalheLoading(true)
    try {
      const res = await fetch(`/api/estoque/pre-faturamento/pedidos/${numero}`, { cache: 'no-store' })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        setDetalheErro(json?.error ?? 'Não foi possível carregar o pedido.')
        return
      }
      setDetalhe(json.data as PedidoDetalhe)
    } finally {
      setDetalheLoading(false)
    }
  }

  const fecharModal = () => {
    setModalNumero(null)
    setDetalhe(null)
    setDetalheErro(null)
  }

  const imprimirPedido = useCallback((d: PedidoDetalhe, numero: number) => {
    const html = buildPreFaturamentoPrintHtml(d, numero)
    printHtmlInHiddenIframe(html, (msg) => toast.error(msg))
  }, [])

  const aprovar = async (ev: React.MouseEvent<HTMLButtonElement>) => {
    if (!modalNumero) return
    const targetEl = ev.currentTarget
    setAprovarLoading(true)
    try {
      const res = await fetch('/api/estoque/pre-faturamento/aprovar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_numero: modalNumero }),
      })
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean
        separation_id?: number
        tiny_updated?: boolean
        error?: string
      } | null
      if (!res.ok || !json?.ok) {
        toast.error(json?.error ?? 'Não foi possível aprovar.')
        return
      }
      if (json.tiny_updated) {
        setTinyTip({ target: targetEl, show: true })
        await new Promise((r) => window.setTimeout(r, 2200))
        setTinyTip(null)
      } else {
        toast.success(`Pedido #${modalNumero} aprovado para faturamento (separação #${json.separation_id}).`)
      }
      fecharModal()
      void load()
    } finally {
      setAprovarLoading(false)
    }
  }

  return (
    <>
      {tinyTip ? (
        <Overlay target={tinyTip.target} show={tinyTip.show} placement="top" rootClose>
          {(p) => (
            <Tooltip id="tiny-pre-faturamento-tip" {...p}>
              Situação atualizada no Tiny.
            </Tooltip>
          )}
        </Overlay>
      ) : null}
      <Row className="mb-4 align-items-center">
        <Col xs={12} md>
          <h4 className="mb-0">Pré-faturamento</h4>
        </Col>
        <Col xs={12} md="auto" className="mt-2 mt-md-0">
          <Button variant="outline-secondary" size="sm" className="d-inline-flex align-items-center gap-1" type="button" onClick={() => void load()} disabled={loading}>
            <IconifyIcon icon="ri:refresh-line" className="fs-16" />
            Atualizar
          </Button>
        </Col>
      </Row>

      <Card className="border-0 shadow-sm">
        <Card.Body className="p-0">
          {loading ? (
            <div className="d-flex justify-content-center align-items-center gap-2 py-5 text-muted">
              <Spinner animation="border" size="sm" />
              Carregando…
            </div>
          ) : rows.length === 0 ? (
            <div className="text-muted text-center py-5 px-3">Nenhum pedido aprovado no momento.</div>
          ) : (
            <>
              <div className="d-none d-md-block table-responsive rounded border">
                <Table hover className="mb-0 align-middle">
                  <thead className="table-light">
                    <tr>
                      <th>Pedido</th>
                      <th>Data</th>
                      <th>Cliente</th>
                      <th className="d-none d-lg-table-cell">CNPJ</th>
                      <th className="text-end">Total</th>
                      <th className="text-center text-nowrap">Status</th>
                      <th className="text-end">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.numero}
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer"
                        style={{ cursor: 'pointer' }}
                        onClick={() => void abrirPedido(r.numero)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            void abrirPedido(r.numero)
                          }
                        }}
                      >
                        <td className="text-muted">Pedido #{r.numero}</td>
                        <td className="small text-nowrap">{formatDataBr(r.data)}</td>
                        <td className="small text-break">{r.cliente}</td>
                        <td className="small font-monospace text-secondary text-break d-none d-lg-table-cell">{r.cnpj}</td>
                        <td className="small text-end text-nowrap fw-semibold">{formatBrl(r.total)}</td>
                        <td className="text-center">
                          <Badge bg="success">Aprovado</Badge>
                        </td>
                        <td className="text-end" onClick={(e) => e.stopPropagation()}>
                          <Button
                            type="button"
                            variant="outline-primary"
                            size="sm"
                            className="d-inline-flex align-items-center gap-1"
                            onClick={(e) => {
                              e.stopPropagation()
                              void abrirPedido(r.numero)
                            }}
                          >
                            <IconifyIcon icon="ri:file-search-line" className="fs-16" />
                            Conferir
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>

              <div className="d-md-none d-flex flex-column gap-2 p-3">
                {rows.map((r) => (
                  <Card
                    key={r.numero}
                    className="border shadow-sm"
                    role="button"
                    tabIndex={0}
                    onClick={() => void abrirPedido(r.numero)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        void abrirPedido(r.numero)
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <Card.Body className="py-3">
                      <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                        <span className="fw-semibold text-primary">Pedido #{r.numero}</span>
                        <Badge bg="success">Aprovado</Badge>
                      </div>
                      <div className="small text-muted mb-1">{formatDataBr(r.data)}</div>
                      <div className="small text-break mb-1">{r.cliente}</div>
                      <div className="small font-monospace text-secondary text-break mb-2">{r.cnpj}</div>
                      <div className="fw-semibold mb-3">{formatBrl(r.total)}</div>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        className="w-100 d-inline-flex align-items-center justify-content-center gap-1"
                        onClick={(e) => {
                          e.stopPropagation()
                          void abrirPedido(r.numero)
                        }}
                      >
                        <IconifyIcon icon="ri:file-search-line" className="fs-16" />
                        Conferir
                      </Button>
                    </Card.Body>
                  </Card>
                ))}
              </div>
            </>
          )}
        </Card.Body>
      </Card>

      <Modal show={modalNumero != null} onHide={fecharModal} centered size="lg" scrollable>
        <Modal.Header closeButton>
          <Modal.Title className="fs-6">Pedido #{modalNumero}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {detalheLoading ? (
            <div className="d-flex justify-content-center py-4">
              <Spinner animation="border" size="sm" />
            </div>
          ) : null}
          {detalheErro ? <p className="text-danger small mb-0">{detalheErro}</p> : null}
          {detalhe ? (
            <>
              <Row className="g-2 small mb-3 pb-3 border-bottom">
                <Col xs={12} sm={6}>
                  <span className="text-muted">Cliente</span>
                  <div className="fw-medium text-break">{detalhe.cliente}</div>
                </Col>
                <Col xs={12} sm={6}>
                  <span className="text-muted">CNPJ</span>
                  <div className="font-monospace">{detalhe.cnpj}</div>
                </Col>
                <Col xs={6}>
                  <span className="text-muted">Data</span>
                  <div>{formatDataBr(detalhe.data)}</div>
                </Col>
                <Col xs={6}>
                  <span className="text-muted">Total</span>
                  <div className="fw-semibold">{formatBrl(detalhe.total)}</div>
                </Col>
              </Row>
              <div className="fw-semibold small text-uppercase text-muted mb-2" style={{ letterSpacing: '0.05em' }}>
                Itens
              </div>
              <Table responsive size="sm" bordered className="mb-0 align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Código</th>
                    <th>Descrição</th>
                    <th className="text-end text-nowrap" style={{ width: '7rem' }}>
                      Qtd
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {detalhe.itens.map((it, idx) => (
                    <tr key={idx}>
                      <td className="font-monospace small text-secondary text-break">{it.codigo ?? '—'}</td>
                      <td className="text-break">{it.nome}</td>
                      <td className="text-end text-nowrap">
                        {it.quantidade}
                        {it.unidade ? <span className="text-muted"> {it.unidade}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          ) : null}
        </Modal.Body>
        <Modal.Footer className="border-0 pt-0">
          <div className="d-flex w-100 justify-content-between align-items-center flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={fecharModal}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="outline-dark"
              size="sm"
              className="d-inline-flex align-items-center gap-1"
              disabled={!detalhe || detalheLoading || !!detalheErro}
              onClick={() => {
                if (detalhe && modalNumero != null) imprimirPedido(detalhe, modalNumero)
              }}
            >
              <IconifyIcon icon="ri:printer-line" className="fs-18" />
              Imprimir
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="d-inline-flex align-items-center gap-2"
              disabled={!detalhe || aprovarLoading || !!detalheErro}
              onClick={(e) => void aprovar(e)}
            >
              {aprovarLoading ? <Spinner animation="border" size="sm" /> : <IconifyIcon icon="ri:check-double-line" className="fs-18" />}
              Aprovar para faturamento
            </Button>
          </div>
        </Modal.Footer>
      </Modal>
    </>
  )
}
