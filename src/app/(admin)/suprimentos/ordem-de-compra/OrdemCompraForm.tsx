'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card, Row, Col, Form, Button, Table } from 'react-bootstrap'
import { EMPRESAS_SUPRIMENTOS } from '@/constants/empresas-suprimentos'
import { parcelasFromCondicaoText, type ParcelaForm } from '@/lib/suprimentosParcelas'
import type {
  CatalogItem,
  ClienteOpt,
  ItemRow,
  OrdemCompraFormSnapshot,
  PaymentMethodRow,
} from './ordemCompraFormTypes'

export type { OrdemCompraFormSnapshot } from './ordemCompraFormTypes'

function newRowId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `r-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function lineSubtotal(it: ItemRow): number {
  const q = Number(it.quantidade) || 0
  const vu = Number(it.valor) || 0
  const base = q * vu
  const ipiPct = Number(it.aliquotaIPI) || 0
  const ipi = base * (ipiPct / 100)
  const icms = Number(it.valorICMS) || 0
  return base + ipi + icms
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10)
}

export type OrdemCompraFormProps = {
  variant?: 'page' | 'modal'
  /** Quando preenchido, aplica uma vez (use `key` no pai para reabrir outro pedido). */
  initialSnapshot?: OrdemCompraFormSnapshot | null
  onCancel?: () => void
  onSaved?: () => void
}

export function OrdemCompraForm({
  variant = 'page',
  initialSnapshot = null,
  onCancel,
  onSaved,
}: OrdemCompraFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [empresaId, setEmpresaId] = useState(
    () =>
      (initialSnapshot?.empresaId as (typeof EMPRESAS_SUPRIMENTOS)[number]['id']) ?? EMPRESAS_SUPRIMENTOS[0].id
  )
  const [data, setData] = useState(() => initialSnapshot?.data ?? todayYmd())
  const [dataPrevista, setDataPrevista] = useState(() => initialSnapshot?.dataPrevista ?? todayYmd())

  const [fornecedorInput, setFornecedorInput] = useState(() => initialSnapshot?.fornecedorInput ?? '')
  const [fornecedorSelected, setFornecedorSelected] = useState<ClienteOpt | null>(() => {
    const f = initialSnapshot?.fornecedor
    if (!f?.id) return null
    return f
  })
  const [fornecedorOptions, setFornecedorOptions] = useState<ClienteOpt[]>([])
  const [showFornecedorDd, setShowFornecedorDd] = useState(false)
  const fornecedorBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fornecedorSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const catalogDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const catalogFirstFetchDone = useRef(false)

  const [items, setItems] = useState<ItemRow[]>(() => initialSnapshot?.items ?? [])

  const [condicao, setCondicao] = useState(() => initialSnapshot?.condicao ?? '')
  const [parcelas, setParcelas] = useState<ParcelaForm[]>(() => initialSnapshot?.parcelas ?? [])
  const condicaoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Não dispara recálculo de parcelas no 1º mount (preserva snapshot do modal). */
  const parcelaEffectMountedRef = useRef(false)

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRow[]>([])
  const [meioPagamentoCodigo, setMeioPagamentoCodigo] = useState(() => initialSnapshot?.meioPagamentoCodigo ?? 1)

  const [desconto, setDesconto] = useState(() => initialSnapshot?.desconto ?? 0)
  const [frete, setFrete] = useState(() => initialSnapshot?.frete ?? 0)
  const [fretePorConta, setFretePorConta] = useState<'R' | 'D'>(() => initialSnapshot?.fretePorConta ?? 'R')
  const [transportador, setTransportador] = useState(() => initialSnapshot?.transportador ?? '')
  const [observacoes, setObservacoes] = useState(() => initialSnapshot?.observacoes ?? '')
  const [observacoesInternas, setObservacoesInternas] = useState(() => initialSnapshot?.observacoesInternas ?? '')

  const bruto = useMemo(() => items.reduce((a, it) => a + lineSubtotal(it), 0), [items])

  const total = useMemo(() => Math.max(0, bruto + (Number(frete) || 0) - (Number(desconto) || 0)), [bruto, frete, desconto])

  const recalcParcelas = useCallback(() => {
    const base = parcelasFromCondicaoText(condicao, total, dataPrevista)
    setParcelas(base.map((p) => ({ ...p, meioPagamento: meioPagamentoCodigo })))
  }, [condicao, total, dataPrevista, meioPagamentoCodigo])

  useEffect(() => {
    if (!parcelaEffectMountedRef.current) {
      parcelaEffectMountedRef.current = true
      return
    }
    if (condicaoTimer.current) clearTimeout(condicaoTimer.current)
    condicaoTimer.current = setTimeout(() => {
      recalcParcelas()
    }, 400)
    return () => {
      if (condicaoTimer.current) clearTimeout(condicaoTimer.current)
    }
  }, [recalcParcelas])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/payment-methods')
        const json = await res.json()
        if (cancelled || !json?.ok || !Array.isArray(json.data)) return
        const rows: PaymentMethodRow[] =
          json.data.length > 0 ? json.data : [{ id: 0, code: 1, name: 'Padrão' }]
        setPaymentMethods(rows)
        setMeioPagamentoCodigo((prev) => {
          if (rows.some((m) => m.code === prev)) return prev
          return rows[0]?.code ?? prev
        })
      } catch {
        if (!cancelled) {
          setPaymentMethods([{ id: 0, code: 1, name: 'Padrão' }])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (fornecedorSearchTimer.current) clearTimeout(fornecedorSearchTimer.current)
    fornecedorSearchTimer.current = setTimeout(async () => {
      try {
        const q = fornecedorInput.trim()
        if (q.length < 2) {
          setFornecedorOptions([])
          setShowFornecedorDd(false)
          return
        }
        const qparam = `&q=${encodeURIComponent(q)}`
        const res = await fetch(`/api/clientes?limit=400${qparam}`)
        const json = await res.json()
        if (json?.ok) {
          setFornecedorOptions(json.data || [])
          setShowFornecedorDd(true)
        }
      } catch {
        /* noop */
      }
    }, 500)
    return () => {
      if (fornecedorSearchTimer.current) clearTimeout(fornecedorSearchTimer.current)
    }
  }, [fornecedorInput])

  useEffect(() => {
    const run = async (q: string) => {
      const showSpinner = !catalogFirstFetchDone.current
      if (showSpinner) setCatalogLoading(true)
      try {
        const res = await fetch(`/api/produtos?q=${encodeURIComponent(q)}`)
        const data = await res.json()
        const list: CatalogItem[] = (data?.retorno?.produtos || [])
          .map((p: { produto?: { id?: unknown; nome?: string; codigo?: string; preco?: unknown } }) => ({
            id: Number(p?.produto?.id ?? 0),
            nome: p?.produto?.nome ?? '',
            codigo: p?.produto?.codigo ?? undefined,
            preco: p?.produto?.preco != null ? Number(p.produto.preco) : undefined,
          }))
          .filter((x: CatalogItem) => !!x.nome && x.id > 0)
        setCatalog(list)
      } catch {
        if (showSpinner) setCatalog([])
      } finally {
        catalogFirstFetchDone.current = true
        if (showSpinner) setCatalogLoading(false)
      }
    }

    const q = catalogQuery.trim()
    if (catalogDebounceRef.current) clearTimeout(catalogDebounceRef.current)

    if (q.length === 0) {
      run('')
      return
    }

    catalogDebounceRef.current = setTimeout(() => run(q), 600)
    return () => {
      if (catalogDebounceRef.current) clearTimeout(catalogDebounceRef.current)
    }
  }, [catalogQuery])

  const pickFornecedor = (c: ClienteOpt) => {
    setFornecedorSelected(c)
    setFornecedorInput(`${c.nome}${c.cpf_cnpj ? ` — ${c.cpf_cnpj}` : ''}`)
    setShowFornecedorDd(false)
  }

  const onFornecedorInputChange = (v: string) => {
    setFornecedorInput(v)
    setFornecedorSelected(null)
  }

  const addProduct = (p: CatalogItem) => {
    const preco = Number(p.preco ?? 0)
    const label = [p.codigo, p.nome].filter(Boolean).join(' — ')
    setItems((prev) => {
      const existing = prev.find((i) => i.tinyId === p.id)
      if (existing) {
        return prev.map((i) =>
          i.rowId === existing.rowId ? { ...i, quantidade: Number(i.quantidade) + 1 } : i
        )
      }
      return [
        ...prev,
        {
          rowId: newRowId(),
          tinyId: p.id,
          nome: p.nome,
          codigo: p.codigo,
          produtoLabel: label,
          quantidade: 1,
          valor: preco,
          informacoesAdicionais: '',
          aliquotaIPI: 0,
          valorICMS: 0,
        },
      ]
    })
  }

  const setItem = (rowId: string, patch: Partial<ItemRow>) => {
    setItems((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)))
  }

  const removeRow = (rowId: string) => {
    setItems((prev) => prev.filter((r) => r.rowId !== rowId))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    const cid = fornecedorSelected?.id
    if (!cid) {
      setErr('Escolha o fornecedor na lista ao digitar.')
      return
    }
    const itensPayload = items.map((it) => ({
      produto: {
        id: it.tinyId,
        tipo: 'P' as const,
        nome: it.nome,
        codigo: it.codigo,
      },
      quantidade: Number(it.quantidade) || 0,
      valor: Number(it.valor) || 0,
      informacoesAdicionais: it.informacoesAdicionais || undefined,
      aliquotaIPI: it.aliquotaIPI || 0,
      valorICMS: it.valorICMS || 0,
    }))
    if (itensPayload.length === 0) {
      setErr('Adicione ao menos um produto.')
      return
    }

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        empresa_id: empresaId,
        data,
        dataPrevista,
        desconto: Number(desconto) || 0,
        condicao: condicao || '',
        observacoes: observacoes || '',
        observacoesInternas: observacoesInternas || '',
        fretePorConta,
        transportador: transportador || '',
        frete: Number(frete) || 0,
        contato: { id: cid },
        itens: itensPayload,
        parcelas: parcelas.length ? parcelas : undefined,
      }

      const res = await fetch('/api/suprimentos/ordens-compra', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!json?.ok) {
        setErr(json?.error || 'Falha ao salvar')
        return
      }
      if (variant === 'modal') {
        onSaved?.()
      } else {
        router.push('/suprimentos/ordem-de-compra')
      }
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const padClass = variant === 'modal' ? 'p-2' : 'p-3'

  return (
    <div className={padClass}>
      {variant === 'page' && <h2 className="h4 mb-3">Nova ordem de compra</h2>}
      <Form onSubmit={submit}>
        {err && <div className="alert alert-danger py-2">{err}</div>}

        <Card className="border-0 shadow-sm mb-3">
          <Card.Header className="bg-white fw-semibold">Dados gerais</Card.Header>
          <Card.Body>
            <Row className="g-3">
              <Col md={4}>
                <Form.Label>Empresa</Form.Label>
                <Form.Select
                  value={empresaId}
                  onChange={(e) => setEmpresaId(e.target.value as (typeof EMPRESAS_SUPRIMENTOS)[number]['id'])}
                  required
                >
                  {EMPRESAS_SUPRIMENTOS.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </Form.Select>
              </Col>
              <Col md={4}>
                <Form.Label>Data</Form.Label>
                <Form.Control type="date" value={data} onChange={(e) => setData(e.target.value)} required />
              </Col>
              <Col md={4}>
                <Form.Label>Data prevista</Form.Label>
                <Form.Control
                  type="date"
                  value={dataPrevista}
                  onChange={(e) => setDataPrevista(e.target.value)}
                  required
                />
              </Col>
              <Col md={12}>
                <Form.Label>Fornecedor</Form.Label>
                <div
                  className="position-relative"
                  onBlur={() => {
                    if (fornecedorBlurTimer.current) clearTimeout(fornecedorBlurTimer.current)
                    fornecedorBlurTimer.current = setTimeout(() => setShowFornecedorDd(false), 200)
                  }}
                >
                  <Form.Control
                    type="text"
                    placeholder="Digite nome ou CNPJ"
                    value={fornecedorInput}
                    onChange={(e) => onFornecedorInputChange(e.target.value)}
                    onFocus={() => {
                      if (fornecedorOptions.length > 0) setShowFornecedorDd(true)
                    }}
                    autoComplete="off"
                  />
                  {showFornecedorDd && fornecedorOptions.length > 0 && (
                    <div
                      className="border rounded bg-white shadow position-absolute w-100 mt-1"
                      style={{ zIndex: 2000, maxHeight: 280, overflowY: 'auto' }}
                    >
                      {fornecedorOptions.map((opt) => (
                        <div
                          key={opt.id}
                          className="px-2 py-2 border-bottom"
                          style={{ cursor: 'pointer' }}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickFornecedor(opt)}
                        >
                          <div className="fw-semibold small">{opt.nome}</div>
                          <div className="text-muted small">{opt.cpf_cnpj || '—'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        <Card className="border-0 shadow-sm mb-3">
          <Card.Header className="bg-white fw-semibold">Produtos e condição de pagamento</Card.Header>
          <Card.Body>
            <Row className="g-3">
              <Col md={12}>
                <Form.Label className="fw-semibold">Adicionar produtos</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Filtrar por código, SKU ou nome (opcional)"
                  value={catalogQuery}
                  onChange={(e) => setCatalogQuery(e.target.value)}
                  autoComplete="off"
                />
                <div className="mt-2 border rounded bg-white" style={{ maxHeight: 280, overflowY: 'auto' }}>
                  {catalogLoading ? (
                    <div className="p-2 small text-muted">Carregando produtos…</div>
                  ) : catalog.length === 0 ? (
                    <div className="p-2 small text-muted">Nenhum produto encontrado.</div>
                  ) : (
                    <div className="list-group list-group-flush">
                      {catalog.map((p) => (
                        <div
                          key={p.id}
                          role="button"
                          tabIndex={0}
                          className="list-group-item list-group-item-action py-2"
                          style={{ cursor: 'pointer' }}
                          onClick={() => addProduct(p)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              addProduct(p)
                            }
                          }}
                        >
                          <div className="fw-semibold small">{p.nome}</div>
                          <div className="text-muted small">
                            SKU: {p.codigo || '—'}
                            {p.preco != null && (
                              <>
                                {' '}
                                ·{' '}
                                {p.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Col>
            </Row>

            <div className="mt-3">
              <Form.Label className="fw-semibold">Itens do pedido</Form.Label>
              {items.length === 0 ? (
                <div className="text-muted small py-3">Nenhum item</div>
              ) : (
                <div className="table-responsive">
                  <Table size="sm" bordered className="mb-2 align-middle">
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th style={{ width: 110 }}>Qtd</th>
                        <th style={{ width: 120 }}>Valor un.</th>
                        <th>Inf. adic.</th>
                        <th style={{ width: 90 }}>IPI %</th>
                        <th style={{ width: 100 }}>ICMS R$</th>
                        <th style={{ width: 44 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => (
                        <tr key={it.rowId}>
                          <td className="small">{it.produtoLabel}</td>
                          <td>
                            <Form.Control
                              type="number"
                              min={0.001}
                              step="0.001"
                              size="sm"
                              value={it.quantidade}
                              onChange={(e) => setItem(it.rowId, { quantidade: Number(e.target.value) })}
                            />
                          </td>
                          <td>
                            <Form.Control
                              type="number"
                              min={0}
                              step="0.01"
                              size="sm"
                              value={it.valor}
                              onChange={(e) => setItem(it.rowId, { valor: Number(e.target.value) })}
                            />
                          </td>
                          <td>
                            <Form.Control
                              size="sm"
                              value={it.informacoesAdicionais}
                              onChange={(e) => setItem(it.rowId, { informacoesAdicionais: e.target.value })}
                            />
                          </td>
                          <td>
                            <Form.Control
                              type="number"
                              min={0}
                              step="0.01"
                              size="sm"
                              value={it.aliquotaIPI}
                              onChange={(e) => setItem(it.rowId, { aliquotaIPI: Number(e.target.value) })}
                            />
                          </td>
                          <td>
                            <Form.Control
                              type="number"
                              min={0}
                              step="0.01"
                              size="sm"
                              value={it.valorICMS}
                              onChange={(e) => setItem(it.rowId, { valorICMS: Number(e.target.value) })}
                            />
                          </td>
                          <td>
                            <Button type="button" variant="outline-danger" size="sm" onClick={() => removeRow(it.rowId)}>
                              ×
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
              <div className="small text-muted">
                Subtotal itens: {bruto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </div>
            </div>

            <Row className="g-3 mt-2">
              <Col md={12} lg={7}>
                <Form.Label>Condição de pagamento</Form.Label>
                <Form.Control
                  type="text"
                  value={condicao}
                  onChange={(e) => setCondicao(e.target.value)}
                  onBlur={recalcParcelas}
                  placeholder="Ex.: à vista, 30/60/90, 30 60 90 ou 30 60"
                />
              </Col>
              <Col md={12} lg={5}>
                <Form.Label>Meio de pagamento</Form.Label>
                <Form.Select
                  value={meioPagamentoCodigo}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setMeioPagamentoCodigo(v)
                    setParcelas((prev) => prev.map((p) => ({ ...p, meioPagamento: v })))
                  }}
                  disabled={paymentMethods.length === 0}
                >
                  {paymentMethods.length === 0 ? (
                    <option value={meioPagamentoCodigo}>Carregando…</option>
                  ) : (
                    paymentMethods.map((m) => (
                      <option key={m.id} value={m.code}>
                        {m.code} — {m.name}
                      </option>
                    ))
                  )}
                </Form.Select>
              </Col>
            </Row>

            {parcelas.length > 0 && (
              <div className="mt-3">
                <div className="fw-semibold mb-2">Parcelas</div>
                <div className="small text-muted mb-2">
                  Data prevista (1ª referência):{' '}
                  {dataPrevista ? dataPrevista.split('-').reverse().join('/') : '—'}. Vencimento = data prevista + dias;
                  valores repartem o total do pedido.
                </div>
                <Table size="sm" bordered responsive className="mb-0">
                  <thead>
                    <tr>
                      <th>Dias</th>
                      <th>Vencimento</th>
                      <th className="text-end">Valor</th>
                      <th>Meio pgto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parcelas.map((p, i) => (
                      <tr key={i}>
                        <td>{p.dias}</td>
                        <td>{p.dataVencimento.split('-').reverse().join('/')}</td>
                        <td className="text-end">
                          {p.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                        <td className="small">
                          {paymentMethods.find((m) => m.code === p.meioPagamento)?.name ?? p.meioPagamento}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </Card.Body>
        </Card>

        <Card className="border-0 shadow-sm mb-3">
          <Card.Header className="bg-white fw-semibold">Valores e observações</Card.Header>
          <Card.Body>
            <Row className="g-3">
              <Col md={4}>
                <Form.Label>Desconto (R$)</Form.Label>
                <Form.Control
                  type="number"
                  min={0}
                  step="0.01"
                  value={desconto}
                  onChange={(e) => setDesconto(Number(e.target.value))}
                />
              </Col>
              <Col md={4}>
                <Form.Label>Frete (R$)</Form.Label>
                <Form.Control
                  type="number"
                  min={0}
                  step="0.01"
                  value={frete}
                  onChange={(e) => setFrete(Number(e.target.value))}
                />
              </Col>
              <Col md={4}>
                <Form.Label>Frete por conta</Form.Label>
                <Form.Select
                  value={fretePorConta}
                  onChange={(e) => setFretePorConta(e.target.value as 'R' | 'D')}
                >
                  <option value="R">R — Remetente</option>
                  <option value="D">D — Destinatário</option>
                </Form.Select>
              </Col>
              <Col md={12}>
                <Form.Label>Transportador</Form.Label>
                <Form.Control value={transportador} onChange={(e) => setTransportador(e.target.value)} />
              </Col>
              <Col md={6}>
                <Form.Label>Observações</Form.Label>
                <Form.Control as="textarea" rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
              </Col>
              <Col md={6}>
                <Form.Label>Observações internas</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  value={observacoesInternas}
                  onChange={(e) => setObservacoesInternas(e.target.value)}
                />
              </Col>
              <Col md={12}>
                <div className="fw-semibold">
                  Total do pedido:{' '}
                  {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
              </Col>
              <Col md={12}>
                <div className="d-flex justify-content-between align-items-center gap-2 pt-3 mt-1 border-top">
                  {variant === 'modal' ? (
                    <Button type="button" variant="outline-secondary" onClick={onCancel}>
                      Fechar
                    </Button>
                  ) : (
                    <Link href="/suprimentos/ordem-de-compra" className="btn btn-outline-secondary">
                      Cancelar
                    </Link>
                  )}
                  <Button type="submit" variant="primary" disabled={saving}>
                    {saving ? 'Salvando…' : variant === 'modal' ? 'Salvar como novo pedido' : 'Salvar ordem'}
                  </Button>
                </div>
              </Col>
            </Row>
          </Card.Body>
        </Card>
      </Form>
    </div>
  )
}
