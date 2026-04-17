"use client"

import { FormEvent, useRef, useState } from 'react'
import Image from 'next/image'
import favIcon from '@/assets/images/favcon.ico'

type ResumoNota = {
  id: string
  numero: string
  serie: string
  data_emissao: string
  cliente_nome: string
  cliente_cnpj: string
  endereco_entrega: string
  valor: string
  situacao: string
}

type ItemNota = {
  indice: number
  id_produto: string | null
  codigo: string | null
  descricao: string
  unidade: string
  quantidade: string
  valor_unitario: string
  valor_total: string
}

type NotaDetalhe = {
  id: string
  numero: string
  serie: string
  data_emissao: string
  natureza_operacao: string
  cliente: { nome: string; cpf_cnpj: string }
  endereco_entrega: string
  valor_nota: string
  valor_produtos: string
  valor_frete: string
  situacao: string
  itens: ItemNota[]
}

function parseMoneyBR(s: string) {
  const n = Number(String(s || '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

type ImagemSlot = { file: File; preview: string } | null

export default function RevisarPedidoPage() {
  const [numeroNota, setNumeroNota] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resumo, setResumo] = useState<ResumoNota | null>(null)

  const [revisaoLoading, setRevisaoLoading] = useState(false)
  const [revisaoError, setRevisaoError] = useState('')
  const [detalhe, setDetalhe] = useState<NotaDetalhe | null>(null)
  const [marcados, setMarcados] = useState<Record<number, boolean>>({})
  const [telefone, setTelefone] = useState('')
  const [telefoneEhWhatsapp, setTelefoneEhWhatsapp] = useState(false)
  const [solicitarLoading, setSolicitarLoading] = useState(false)
  const [solicitarFeedback, setSolicitarFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  /** Após envio com sucesso: substitui o formulário pela mensagem final (número = id no banco). */
  const [solicitacaoRegistradaId, setSolicitacaoRegistradaId] = useState<number | null>(null)
  const [imagemSlots, setImagemSlots] = useState<ImagemSlot[]>([null, null, null])
  const [observacoes, setObservacoes] = useState('')
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null])

  const clearImagemSlots = () => {
    setImagemSlots((prev) => {
      prev.forEach((s) => {
        if (s?.preview) URL.revokeObjectURL(s.preview)
      })
      return [null, null, null]
    })
  }

  const setSlotArquivo = (index: number, file: File | null) => {
    setImagemSlots((prev) => {
      const next = [...prev] as ImagemSlot[]
      if (next[index]?.preview) URL.revokeObjectURL(next[index]!.preview)
      next[index] = file ? { file, preview: URL.createObjectURL(file) } : null
      return next
    })
  }

  const handlePesquisar = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setResumo(null)
    setDetalhe(null)
    setMarcados({})
    setRevisaoError('')
    setSolicitarFeedback(null)
    setSolicitacaoRegistradaId(null)
    clearImagemSlots()
    setObservacoes('')
    setTelefoneEhWhatsapp(false)

    const n = numeroNota.trim()
    const c = cnpj.trim()
    if (!n || !c) {
      setError('Informe o número da nota fiscal e o CNPJ para pesquisar.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/public/revisar-pedido/pesquisar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero: n, cnpj: c }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'Não foi possível localizar a nota.')
      }
      setResumo(json.data as ResumoNota)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao pesquisar.')
    } finally {
      setLoading(false)
    }
  }

  const handleRevisar = async () => {
    if (!resumo?.id) return
    setRevisaoError('')
    setDetalhe(null)
    setMarcados({})
    setSolicitarFeedback(null)
    setSolicitacaoRegistradaId(null)
    clearImagemSlots()
    setObservacoes('')
    setTelefoneEhWhatsapp(false)
    setRevisaoLoading(true)
    try {
      const res = await fetch('/api/public/revisar-pedido/obter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: resumo.id }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'Não foi possível carregar a nota.')
      }
      const d = json.data as NotaDetalhe
      setResumo(null)
      setDetalhe(d)
      const inicial: Record<number, boolean> = {}
      d.itens.forEach((it) => {
        inicial[it.indice] = false
      })
      setMarcados(inicial)
    } catch (err: unknown) {
      setRevisaoError(err instanceof Error ? err.message : 'Erro ao revisar.')
    } finally {
      setRevisaoLoading(false)
    }
  }

  const toggleItem = (indice: number) => {
    setMarcados((prev) => ({ ...prev, [indice]: !prev[indice] }))
  }

  const handleSolicitar = async (e: FormEvent) => {
    e.preventDefault()
    if (!detalhe?.id) return
    setSolicitarFeedback(null)
    const indices = Object.entries(marcados)
      .filter(([, v]) => v)
      .map(([k]) => Number(k))

    const temImagem = imagemSlots.some(Boolean)
    if (!temImagem) {
      setSolicitarFeedback({
        ok: false,
        text: 'Envie pelo menos uma imagem (até três).',
      })
      return
    }

    setSolicitarLoading(true)
    try {
      const fd = new FormData()
      fd.set('tiny_nota_fiscal_id', detalhe.id)
      fd.set('telefone', telefone)
      fd.set('telefone_e_whatsapp', telefoneEhWhatsapp ? '1' : '0')
      fd.set('itens_indices', JSON.stringify(indices))
      fd.set('nota_numero', detalhe.numero)
      fd.set('nota_serie', detalhe.serie || '')
      fd.set('cliente_nome', detalhe.cliente.nome)
      fd.set('valor_nota', detalhe.valor_nota)
      fd.set('observacoes', observacoes)
      const snapshot = detalhe.itens
        .filter((it) => marcados[it.indice])
        .map((it) => ({
          indice: it.indice,
          descricao: it.descricao,
          codigo: it.codigo,
          quantidade: it.quantidade,
          unidade: it.unidade,
          valor_total: it.valor_total,
        }))
      fd.set('itens_snapshot', JSON.stringify(snapshot))
      imagemSlots.forEach((slot, i) => {
        if (slot?.file) fd.set(`image_${i}`, slot.file)
      })

      const res = await fetch('/api/public/revisar-pedido/solicitar', {
        method: 'POST',
        body: fd,
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'Não foi possível enviar a solicitação.')
      }
      const numId = Number(json.id)
      if (!Number.isFinite(numId) || numId <= 0) {
        throw new Error('Não foi possível confirmar o número da solicitação. Entre em contato com o suporte.')
      }
      clearImagemSlots()
      setTelefone('')
      setTelefoneEhWhatsapp(false)
      setObservacoes('')
      setMarcados({})
      setDetalhe(null)
      setSolicitacaoRegistradaId(numId)
    } catch (err: unknown) {
      setSolicitarFeedback({
        ok: false,
        text: err instanceof Error ? err.message : 'Erro ao solicitar.',
      })
    } finally {
      setSolicitarLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #f7f9fc 0%, #eef2f7 100%)' }}>
      <div className="container py-5" style={{ maxWidth: '85vw' }}>
        <div className="row justify-content-center">
          <div className="col-12">
            <div className="card border-0 shadow-sm mb-4">
              <div className="card-body p-4">
                <div className="d-flex align-items-center gap-3 mb-3">
                  <div
                    className="d-flex align-items-center justify-content-center rounded bg-white shadow-sm"
                    style={{ width: 64, height: 56 }}
                  >
                    <Image src={favIcon} alt="Sistema Aliança Mercantil Atacadista" width={42} height={32} />
                  </div>
                  <div>
                    <h2 className="mb-1">Solicitar revisão de pedido</h2>
                    <div className="text-muted">Sistema Aliança Mercantil Atacadista</div>
                  </div>
                </div>
                <p className="text-muted mb-4">
                  Localize seu pedido pelo número da nota fiscal e CNPJ da empresa destinatária.
                </p>
                <form onSubmit={handlePesquisar}>
                  <div className="row g-3">
                    <div className="col-md-4">
                      <label className="form-label">Número da nota fiscal</label>
                      <input
                        className="form-control"
                        value={numeroNota}
                        onChange={(e) => setNumeroNota(e.target.value)}
                        placeholder="Ex.: 148"
                        autoComplete="off"
                      />
                    </div>
                    <div className="col-md-5">
                      <label className="form-label">CNPJ</label>
                      <input
                        className="form-control"
                        value={cnpj}
                        onChange={(e) => setCnpj(e.target.value)}
                        placeholder="00.000.000/0001-00"
                        autoComplete="off"
                      />
                    </div>
                    <div className="col-md-3 d-flex align-items-end">
                      <button className="btn btn-primary w-100" type="submit" disabled={loading}>
                        {loading ? 'Pesquisando...' : 'Pesquisar'}
                      </button>
                    </div>
                  </div>
                </form>
                {error && <div className="alert alert-danger mt-3 mb-0">{error}</div>}
              </div>
            </div>

            {resumo && !detalhe && (
              <div
                className="card border-0 shadow-sm mb-3 mx-auto"
                style={{ maxWidth: 1100, border: '1px solid #e3e8ef' }}
              >
                <div className="card-body py-2 px-3">
                  <div className="d-flex flex-wrap align-items-stretch gap-2 gap-md-3">
                    <div className="flex-grow-1 min-w-0 d-flex flex-wrap align-items-center gap-3 gap-lg-4 small">
                      <div className="min-w-0" style={{ maxWidth: 220 }}>
                        <div className="text-muted text-uppercase" style={{ fontSize: '0.65rem', letterSpacing: '0.06em' }}>
                          Cliente
                        </div>
                        <div className="fw-semibold text-truncate" title={resumo.cliente_nome}>
                          {resumo.cliente_nome}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-muted text-uppercase" style={{ fontSize: '0.65rem', letterSpacing: '0.06em' }}>
                          CNPJ
                        </div>
                        <div className="fw-semibold text-nowrap">{resumo.cliente_cnpj || '—'}</div>
                      </div>
                      <div>
                        <div className="text-muted text-uppercase" style={{ fontSize: '0.65rem', letterSpacing: '0.06em' }}>
                          Data de emissão
                        </div>
                        <div className="fw-semibold">{resumo.data_emissao || '—'}</div>
                      </div>
                      <div>
                        <div className="text-muted text-uppercase" style={{ fontSize: '0.65rem', letterSpacing: '0.06em' }}>
                          Valor total
                        </div>
                        <div className="fw-semibold">
                          {parseMoneyBR(resumo.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </div>
                      </div>
                    </div>
                    <div className="d-flex align-items-center ms-md-auto">
                      <button
                        type="button"
                        className="btn btn-primary btn-lg px-4"
                        disabled={revisaoLoading}
                        onClick={handleRevisar}
                      >
                        {revisaoLoading ? 'Carregando...' : 'Revisar'}
                      </button>
                    </div>
                  </div>
                  {revisaoError && (
                    <div className="alert alert-danger py-2 px-3 small mb-0 mt-2">{revisaoError}</div>
                  )}
                </div>
              </div>
            )}

            {solicitacaoRegistradaId != null && (
              <div className="card border-0 shadow-sm mb-4 mx-auto" style={{ maxWidth: 720 }}>
                <div
                  className="card-body p-4 p-md-5 rounded-3 text-center"
                  style={{
                    background: 'linear-gradient(180deg, #d4edda 0%, #c3e6cb 100%)',
                    border: '1px solid #a3cfbb',
                  }}
                >
                  <h3 className="fw-bold text-success mb-3" style={{ fontSize: '1.35rem' }}>
                    Solicitação nº {solicitacaoRegistradaId} registrada com sucesso.
                  </h3>
                  <p className="mb-0 text-body" style={{ fontSize: '1.05rem', lineHeight: 1.55 }}>
                    Nosso suporte entrará em contato com o retorno da solicitação em breve.
                  </p>
                </div>
              </div>
            )}

            {detalhe && (
              <div className="card border-0 shadow-sm mb-4">
                <div className="card-body p-4">
                  <div className="row g-3 mb-4 pb-3" style={{ borderBottom: '1px solid #e8edf4' }}>
                    <div className="col-md-4">
                      <div className="text-muted text-uppercase" style={{ fontSize: '0.65rem', letterSpacing: '0.06em' }}>
                        Cliente
                      </div>
                      <div className="fw-semibold">{detalhe.cliente.nome}</div>
                    </div>
                    <div className="col-md-4">
                      <div className="text-muted text-uppercase" style={{ fontSize: '0.65rem', letterSpacing: '0.06em' }}>
                        Nota
                      </div>
                      <div className="fw-semibold">
                        {detalhe.numero}
                        {detalhe.serie ? ` · Série ${detalhe.serie}` : ''}
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="text-muted text-uppercase" style={{ fontSize: '0.65rem', letterSpacing: '0.06em' }}>
                        Valor
                      </div>
                      <div className="fw-semibold">
                        {parseMoneyBR(detalhe.valor_nota).toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL',
                        })}
                      </div>
                    </div>
                  </div>

                  <h4 className="fw-bold mb-3" style={{ fontSize: '1.35rem', color: '#1a2b4a' }}>
                    Materiais com problema
                  </h4>
                  <div className="table-responsive mb-4">
                    <table className="table table-sm align-middle mb-0">
                      <thead>
                        <tr>
                          <th>Descrição</th>
                          <th>Código</th>
                          <th>Qtd</th>
                          <th>Vl. unit.</th>
                          <th>Total</th>
                          <th className="text-center" style={{ width: 100, verticalAlign: 'bottom' }}>
                            <span
                              className="d-block text-muted fw-semibold mb-1"
                              style={{ fontSize: '0.8rem', letterSpacing: '0.02em' }}
                            >
                              Selecionar
                            </span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalhe.itens.map((it) => (
                          <tr key={`${it.indice}-${it.codigo || it.descricao}`}>
                            <td>{it.descricao}</td>
                            <td>{it.codigo || '—'}</td>
                            <td>
                              {it.quantidade} {it.unidade}
                            </td>
                            <td>
                              {parseMoneyBR(it.valor_unitario).toLocaleString('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              })}
                            </td>
                            <td>
                              {parseMoneyBR(it.valor_total).toLocaleString('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              })}
                            </td>
                            <td className="text-center">
                              <input
                                type="checkbox"
                                className="form-check-input mt-1"
                                checked={!!marcados[it.indice]}
                                onChange={() => toggleItem(it.indice)}
                                aria-label={`Selecionar ${it.descricao}`}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="text-muted small mb-2">Anexe até três fotos para ilustrar o problema.</p>
                  <div className="row g-3 mb-4">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="col-md-4">
                        <input
                          ref={(el) => {
                            fileInputRefs.current[i] = el
                          }}
                          type="file"
                          className="d-none"
                          accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
                          onChange={(ev) => {
                            const f = ev.target.files?.[0] ?? null
                            ev.target.value = ''
                            setSlotArquivo(i, f)
                          }}
                        />
                        <button
                          type="button"
                          className="w-100 border-0 bg-transparent p-0 text-start"
                          onClick={() => fileInputRefs.current[i]?.click()}
                        >
                          <div
                            className="rounded-3 w-100 position-relative overflow-hidden d-flex align-items-center justify-content-center"
                            style={{
                              aspectRatio: '1',
                              minHeight: 200,
                              maxHeight: 280,
                              border: '2px dashed #b8c5d9',
                              background: imagemSlots[i] ? '#f0f3f8' : '#fafbfd',
                              cursor: 'pointer',
                            }}
                          >
                            {imagemSlots[i] ? (
                              <img
                                src={imagemSlots[i]!.preview}
                                alt={`Anexo ${i + 1}`}
                                className="w-100 h-100"
                                style={{ objectFit: 'contain' }}
                              />
                            ) : (
                              <div className="text-center px-2 py-3">
                                <div className="text-muted mb-1" style={{ fontSize: '2rem', lineHeight: 1 }}>
                                  +
                                </div>
                                <div className="fw-semibold text-secondary" style={{ fontSize: '0.95rem' }}>
                                  Importar imagem
                                </div>
                                <div className="small text-muted mt-1">Toque para escolher</div>
                              </div>
                            )}
                          </div>
                        </button>
                        {imagemSlots[i] && (
                          <button
                            type="button"
                            className="btn btn-link btn-sm text-danger p-0 mt-1"
                            onClick={() => setSlotArquivo(i, null)}
                          >
                            Remover
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <form onSubmit={handleSolicitar} className="border-top pt-4">
                    <div className="mb-3">
                      <label className="form-label" htmlFor="revisar-observacoes">
                        Observações
                      </label>
                      <textarea
                        id="revisar-observacoes"
                        className="form-control"
                        rows={4}
                        value={observacoes}
                        onChange={(e) => setObservacoes(e.target.value)}
                        placeholder="Descreva o problema ou qualquer informação útil para o suporte (opcional)."
                        maxLength={8000}
                      />
                      <div className="form-text">{observacoes.length} / 8000 caracteres</div>
                    </div>
                    <div className="row g-3 align-items-end">
                      <div className="col-md-4">
                        <label className="form-label">Telefone para acompanhar a solicitação</label>
                        <input
                          className="form-control"
                          type="tel"
                          value={telefone}
                          onChange={(e) => setTelefone(e.target.value)}
                          placeholder="DDD + número"
                          autoComplete="tel"
                        />
                      </div>
                      <div className="col-md-3">
                        <div className="form-label mb-0">É WhatsApp?</div>
                        <div className="form-check mt-2">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            id="revisar-telefone-whatsapp"
                            checked={telefoneEhWhatsapp}
                            onChange={(e) => setTelefoneEhWhatsapp(e.target.checked)}
                          />
                          <label className="form-check-label" htmlFor="revisar-telefone-whatsapp">
                            Sim
                          </label>
                        </div>
                      </div>
                      <div className="col-md-3">
                        <button type="submit" className="btn btn-primary w-100" disabled={solicitarLoading}>
                          {solicitarLoading ? 'Enviando...' : 'Solicitar'}
                        </button>
                      </div>
                    </div>
                    {solicitarFeedback && !solicitarFeedback.ok && (
                      <div className="alert alert-danger mt-3 mb-0">{solicitarFeedback.text}</div>
                    )}
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
