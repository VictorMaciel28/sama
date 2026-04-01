'use client'

import { useState } from 'react'
import { EMPRESAS_SUPRIMENTOS } from '@/constants/empresas-suprimentos'

type Item = {
  cProd?: string
  xProd?: string
  uCom?: string
  qCom?: string
  vUnCom?: string
  vProd?: string
}

export default function NotasFiscaisPage() {
  // const [xmlText, setXmlText] = useState<string | null>(null) // preview removed
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<any | null>(null)
  const [hasSelectedFile, setHasSelectedFile] = useState(false)
  const companyOptions = EMPRESAS_SUPRIMENTOS
  const [selectedCompany, setSelectedCompany] = useState<(typeof companyOptions)[0] | null>(companyOptions[0])
  const [isSending, setIsSending] = useState(false)
  const [sendModal, setSendModal] = useState<{ status: 'success' | 'error'; title: string; message: string } | null>(null)

  const handleFile = (file: File | null) => {
    setHasSelectedFile(Boolean(file))
    setError(null)
    setSummary(null)
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '')
      try {
        const parser = new DOMParser()
        const doc = parser.parseFromString(text, 'application/xml')
        const parseText = (tag: string) => {
          const el = doc.getElementsByTagName(tag)[0]
          return el ? el.textContent?.trim() ?? '' : ''
        }

        // chave de acesso: infNFe @Id or chave tag
        let chave = ''
        const infNFe = doc.getElementsByTagName('infNFe')[0]
        if (infNFe) {
          const idAttr = infNFe.getAttribute('Id') || ''
          chave = idAttr.replace(/^NFe/, '')
        }
        if (!chave) {
          const chaveTag = parseText('chNFe') || parseText('infNFeId')
          chave = chaveTag
        }

        const nNF = parseText('nNF')
        const dEmi = parseText('dEmi') || parseText('dhEmi')
        const naturezaOperacao = parseText('natOp')
        const emit_xNome = (doc.getElementsByTagName('emit')[0]?.getElementsByTagName('xNome')[0]?.textContent || '').trim()
        const emit_CNPJ = (doc.getElementsByTagName('emit')[0]?.getElementsByTagName('CNPJ')[0]?.textContent || '').trim()
        const dest_xNome = (doc.getElementsByTagName('dest')[0]?.getElementsByTagName('xNome')[0]?.textContent || '').trim()
        const dest_CNPJ = (doc.getElementsByTagName('dest')[0]?.getElementsByTagName('CNPJ')[0]?.textContent || '').trim()
        const vNF = (doc.getElementsByTagName('vNF')[0]?.textContent || '').trim() || (doc.getElementsByTagName('vProd')[0]?.textContent || '').trim()
        const modFrete = (doc.getElementsByTagName('modFrete')[0]?.textContent || '').trim()
        const fretePorConta = modFrete === '1' ? 'D' : modFrete ? 'R' : ''

        const parseNumber = (value: any) => {
          if (value == null) return null
          const str = String(value).trim()
          if (!str) return null
          const hasComma = str.includes(',')
          const hasDot = str.includes('.')
          let normalized = str
          if (hasComma && hasDot) {
            normalized = str.replace(/\./g, '').replace(',', '.')
          } else if (hasComma) {
            normalized = str.replace(',', '.')
          }
          const n = Number(normalized)
          return Number.isFinite(n) ? n : null
        }

        // payments: detPag or pag->detPag
        const detPagNodes = Array.from(doc.getElementsByTagName('detPag') || [])
        const pags: Array<{ tPag: string; vPag: number | null }> = []
        if (detPagNodes.length > 0) {
          for (const p of detPagNodes) {
            const t = p.getElementsByTagName('tPag')[0]?.textContent?.trim() || p.getAttribute('tPag') || ''
            const v = p.getElementsByTagName('vPag')[0]?.textContent?.trim() || ''
            pags.push({ tPag: t, vPag: parseNumber(v) })
          }
        } else {
          // older/alternate structure: pag -> tPag / vPag
          const pagNode = doc.getElementsByTagName('pag')[0]
          if (pagNode) {
            const t = pagNode.getElementsByTagName('tPag')[0]?.textContent?.trim() || ''
            const v = pagNode.getElementsByTagName('vPag')[0]?.textContent?.trim() || ''
            if (t || v) pags.push({ tPag: t, vPag: parseNumber(v) })
          }
        }

        // taxes: ICMSTot and other totals
        const icmsTot = doc.getElementsByTagName('ICMSTot')[0]
        const taxes: Record<string, number | null> = {}
        if (icmsTot) {
          const fields = ['vBC', 'vICMS', 'vICMSDeson', 'vST', 'vProd', 'vFrete', 'vSeg', 'vDesc', 'vII', 'vIPI', 'vPIS', 'vCOFINS', 'vOutro', 'vNF']
          for (const f of fields) {
            taxes[f] = parseNumber(icmsTot.getElementsByTagName(f)[0]?.textContent || icmsTot.getAttribute(f) || '')
          }
        } else {
          // fallback: try top-level tags
          taxes['vNF'] = parseNumber(parseText('vNF') || '')
        }

        // items
        const dets = Array.from(doc.getElementsByTagName('det') || [])
        const items: Item[] = dets.map((d) => {
          const prod = d.getElementsByTagName('prod')[0]
          if (!prod) return {}
          return {
            cProd: prod.getElementsByTagName('cProd')[0]?.textContent?.trim(),
            xProd: prod.getElementsByTagName('xProd')[0]?.textContent?.trim(),
            uCom: prod.getElementsByTagName('uCom')[0]?.textContent?.trim(),
            qCom: prod.getElementsByTagName('qCom')[0]?.textContent?.trim(),
            vUnCom: prod.getElementsByTagName('vUnCom')[0]?.textContent?.trim(),
            vProd: prod.getElementsByTagName('vProd')[0]?.textContent?.trim(),
          }
        })

        setSummary({
          chave,
          nNF,
          dEmi,
          naturezaOperacao,
          fretePorConta,
          emit: { nome: emit_xNome, cnpj: emit_CNPJ },
          dest: { nome: dest_xNome, cnpj: dest_CNPJ },
          total: parseNumber(vNF),
          items,
          payments: pags,
          taxes,
        })
      } catch (e: any) {
        setError('Falha ao analisar XML: ' + (e?.message || 'erro'))
      }
    }
    reader.onerror = () => {
      setError('Falha ao ler arquivo')
    }
    reader.readAsText(file, 'UTF-8')
  }

  const parseFlexibleNumber = (value?: string | number | null) => {
    if (value == null) return null
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    const str = String(value).trim()
    if (!str) return null
    const hasComma = str.includes(',')
    const hasDot = str.includes('.')
    let normalized = str
    if (hasComma && hasDot) {
      normalized = str.replace(/\./g, '').replace(',', '.')
    } else if (hasComma) {
      normalized = str.replace(',', '.')
    }
    const n = Number(normalized)
    return Number.isFinite(n) ? n : null
  }

  const formatMoney = (value?: string | number | null) => {
    const n = parseFlexibleNumber(value)
    if (n == null) return value ? String(value) : '—'
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  const formatQuantity = (value?: string | number | null) => {
    const n = parseFlexibleNumber(value)
    if (n == null) return value ? String(value) : '—'
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 })
  }

  const formatChave = (s?: string) => {
    if (!s) return '—'
    return String(s).replace(/\s+/g, '').match(/.{1,4}/g)?.join(' ') ?? String(s)
  }

  const formatCNPJ = (s?: string) => {
    if (!s) return ''
    const d = String(s).replace(/\D/g, '')
    if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
    return s
  }

  const formatDate = (s?: string) => {
    if (!s) return '—'
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return s
    return d.toLocaleString('pt-BR')
  }

  const formatDateForTiny = (value?: string) => {
    if (!value) return ''
    const trimmed = String(value).trim()
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (isoMatch) return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`
    const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
    if (brMatch) return `${brMatch[1]}/${brMatch[2]}/${brMatch[3]}`
    const d = new Date(trimmed)
    if (Number.isNaN(d.getTime())) return ''
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = String(d.getFullYear())
    return `${day}/${month}/${year}`
  }

  const formatTimeForTiny = (value?: string) => {
    if (!value) return ''
    const trimmed = String(value).trim()
    const timeMatch = trimmed.match(/T(\d{2}:\d{2}:\d{2})/)
    if (timeMatch) return timeMatch[1]
    const timeOnlyMatch = trimmed.match(/(\d{2}:\d{2}:\d{2})/)
    if (timeOnlyMatch) return timeOnlyMatch[1]
    const d = new Date(trimmed)
    if (Number.isNaN(d.getTime())) return ''
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    const seconds = String(d.getSeconds()).padStart(2, '0')
    return `${hours}:${minutes}:${seconds}`
  }

  const formatDecimalForTiny = (value?: string | number | null) => {
    const n = parseFlexibleNumber(value)
    if (n == null) return ''
    return String(n)
  }

  const handleSend = async () => {
    if (!selectedCompany) {
      setSendModal({
        status: 'error',
        title: 'Empresa não selecionada',
        message: 'Selecione a empresa de destino antes de enviar.',
      })
      return
    }
    if (!summary) {
      setSendModal({
        status: 'error',
        title: 'Nota fiscal ausente',
        message: 'Importe o XML antes de enviar a nota.',
      })
      return
    }

    const clienteNome = summary.emit?.nome?.trim()
    if (!clienteNome) {
      setSendModal({
        status: 'error',
        title: 'Dados incompletos',
        message: 'Não foi possível identificar o emitente no XML.',
      })
      return
    }

    const clienteDocumento = String(summary.emit?.cnpj || '').replace(/\D/g, '')
    const clienteTipo =
      clienteDocumento.length === 14 ? 'J' : clienteDocumento.length === 11 ? 'F' : undefined

    const itens = (summary.items || []).map((it: Item) => {
      const quantidade = parseFlexibleNumber(it.qCom)
      const valorUnitario = parseFlexibleNumber(it.vUnCom)
        ?? (quantidade ? (parseFlexibleNumber(it.vProd) ?? 0) / quantidade : null)

      if (!it.xProd || quantidade == null || valorUnitario == null) return null

      return {
        item: {
          codigo: it.cProd || undefined,
          descricao: it.xProd,
          unidade: it.uCom || 'UN',
          quantidade: formatDecimalForTiny(quantidade),
          valor_unitario: formatDecimalForTiny(valorUnitario),
          tipo: 'P',
        },
      }
    }).filter(Boolean)

    if (!itens || itens.length === 0) {
      setSendModal({
        status: 'error',
        title: 'Itens inválidos',
        message: 'Não foi possível montar os itens da nota a partir do XML.',
      })
      return
    }

    const dataEmissao = formatDateForTiny(summary.dEmi)
    const horaEntradaSaida = formatTimeForTiny(summary.dEmi)
    const notaPayload = {
      nota_fiscal: {
        tipo: 'E',
        ...(summary.naturezaOperacao ? { natureza_operacao: summary.naturezaOperacao } : {}),
        ...(dataEmissao ? { data_emissao: dataEmissao } : {}),
        ...(dataEmissao ? { data_entrada_saida: dataEmissao } : {}),
        ...(horaEntradaSaida ? { hora_entrada_saida: horaEntradaSaida } : {}),
        ...(summary.fretePorConta ? { frete_por_conta: summary.fretePorConta } : {}),
        cliente: {
          nome: clienteNome,
          ...(clienteTipo ? { tipo_pessoa: clienteTipo } : {}),
          ...(clienteDocumento ? { cpf_cnpj: clienteDocumento } : {}),
        },
        itens,
      },
    }

    try {
      setIsSending(true)
      const response = await fetch('/api/notas-fiscais/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: selectedCompany.apiKey,
          apiKey: selectedCompany.apiKey,
          nota: notaPayload,
          formato: 'JSON',
        }),
      })

      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.ok) {
        const fallbackMessage = payload?.error || 'Falha ao comunicar com o servidor.'
        setSendModal({
          status: 'error',
          title: 'Erro ao enviar',
          message: fallbackMessage,
        })
        return
      }

      const retorno = payload?.data?.retorno
      if (retorno?.status === 'OK') {
        const registro = retorno?.registros?.[0]?.registro
        const message = registro?.id
          ? `Nota enviada com sucesso. ID: ${registro.id}.`
          : 'Nota enviada com sucesso.'
        setSendModal({ status: 'success', title: 'Envio realizado', message })
        return
      }

      const retornoErros = Array.isArray(retorno?.erros) ? retorno.erros : []
      const registros = Array.isArray(retorno?.registros) ? retorno.registros : retorno?.registros ? [retorno.registros] : []
      const registroErros = registros
        .map((item: any) => item?.registro?.erros || item?.erros || [])
        .flat()
        .filter(Boolean)

      const errorMessage =
        retornoErros.map((err: any) => err?.erro).filter(Boolean).join(' | ')
        || registroErros.map((err: any) => err?.erro).filter(Boolean).join(' | ')
        || registros?.[0]?.registro?.status
        || payload?.data?.raw
        || 'Falha ao enviar a nota.'

      setSendModal({
        status: 'error',
        title: 'Erro ao enviar',
        message: errorMessage,
      })
    } catch (e: any) {
      setSendModal({
        status: 'error',
        title: 'Erro ao enviar',
        message: e?.message || 'Falha ao comunicar com a API da Tiny.',
      })
    } finally {
      setIsSending(false)
    }
  }

  const closeSendModal = () => setSendModal(null)

  return (
    <div className="py-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h4 className="mb-0">Notas Fiscais</h4>
          <small className="text-muted">Importe um arquivo XML de NF-e para visualizar os dados</small>
        </div>
      </div>

      <div className="card border-0 shadow-sm">
        <div className="card-body">
          <div className="row g-3 align-items-end mb-3">
            <div className="col-md-6">
              <label className="form-label">Selecione o arquivo XML</label>
              <input type="file" accept=".xml,application/xml" className="form-control" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
            </div>
            {hasSelectedFile && (
              <>
                <div className="col-md-4">
                  <label className="form-label">Enviar para Empresa</label>
                  <select
                    className="form-select"
                    value={selectedCompany?.id ?? ''}
                    onChange={(e) => {
                      const next = companyOptions.find((company) => company.id === e.target.value) || null
                      setSelectedCompany(next)
                    }}
                  >
                    {companyOptions.map((company) => (
                      <option key={company.id} value={company.id}>{company.label}</option>
                    ))}
                  </select>
                </div>
                <div className="col-md-2 d-grid">
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={handleSend}
                    disabled={isSending || !summary || !selectedCompany}
                  >
                    {isSending ? 'Enviando...' : 'Enviar'}
                  </button>
                </div>
              </>
            )}
          </div>

          {error && <div className="alert alert-danger">{error}</div>}

          {summary && (
            <div className="mt-3">
              <div className="card border-0 shadow-sm mb-3">
                <div className="card-body">
                  <div className="row g-3 align-items-start">
                    <div className="col-lg-8">
                      <div className="small text-muted">Chave de Acesso</div>
                      <div className="fw-monospace text-break">{formatChave(summary.chave)}</div>
                    </div>
                    <div className="col-lg-4">
                      <div className="d-flex flex-wrap gap-3 justify-content-lg-end">
                        <div>
                          <div className="small text-muted">Nº NF</div>
                          <div className="fw-semibold">{summary.nNF || '—'}</div>
                        </div>
                        <div>
                          <div className="small text-muted">Data Emissão</div>
                          <div>{formatDate(summary.dEmi)}</div>
                        </div>
                        <div>
                          <div className="small text-muted">Total</div>
                          <div className="fw-semibold">{formatMoney(summary.total)}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <hr className="my-3" />

                  <div className="row g-3">
                    <div className="col-md-6">
                      <div className="small text-muted">Emitente</div>
                      <div className="fw-semibold text-break">{summary.emit?.nome || '—'}</div>
                      <div className="text-muted small">{formatCNPJ(summary.emit?.cnpj)}</div>
                    </div>
                    <div className="col-md-6">
                      <div className="small text-muted">Destinatário</div>
                      <div className="fw-semibold text-break">{summary.dest?.nome || '—'}</div>
                      <div className="text-muted small">{formatCNPJ(summary.dest?.cnpj)}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card border-0 shadow-sm mb-3">
                <div className="card-body">
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <div className="fw-semibold">Itens</div>
                    <div className="text-muted small">{summary.items?.length ?? 0} itens</div>
                  </div>
                  <div className="table-responsive">
                    <table className="table table-sm table-striped align-middle mb-0">
                      <thead>
                        <tr>
                          <th>Cod</th>
                          <th>Nome</th>
                          <th className="text-end">Qtde</th>
                          <th className="text-end">Valor Un.</th>
                          <th className="text-end">Valor Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.items && summary.items.length > 0 ? summary.items.map((it: Item, i: number) => (
                          <tr key={i}>
                            <td className="text-nowrap">{it.cProd || '—'}</td>
                            <td className="text-break">{it.xProd || '—'}</td>
                            <td className="text-end">{formatQuantity(it.qCom)}</td>
                            <td className="text-end">{formatMoney(it.vUnCom)}</td>
                            <td className="text-end">{formatMoney(it.vProd)}</td>
                          </tr>
                        )) : (
                          <tr><td colSpan={5} className="text-muted">Nenhum item encontrado</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="row g-3">
                <div className="col-md-4">
                  <div className="card border-0 shadow-sm h-100">
                    <div className="card-body">
                      <div className="small text-muted mb-2">Pagamentos</div>
                      {summary.payments && summary.payments.length > 0 ? summary.payments.map((p: any, i: number) => (
                        <div key={i} className="d-flex justify-content-between align-items-center">
                          <div className="small text-truncate" title={p.tPag || ''}>{p.tPag || '—'}</div>
                          <div className="fw-semibold">{formatMoney(p.vPag)}</div>
                        </div>
                      )) : <div className="text-muted small">Nenhum pagamento informado</div>}
                    </div>
                  </div>
                </div>
                <div className="col-md-8">
                  <div className="card border-0 shadow-sm h-100">
                    <div className="card-body">
                      <div className="small text-muted mb-2">Impostos (ICMSTot)</div>
                      {summary.taxes ? (
                        <div className="row row-cols-2 g-2 small">
                          <div className="col d-flex justify-content-between"><span>Produtos</span><span>{formatMoney(summary.taxes.vProd)}</span></div>
                          <div className="col d-flex justify-content-between"><span>Frete</span><span>{formatMoney(summary.taxes.vFrete)}</span></div>
                          <div className="col d-flex justify-content-between"><span>Descontos</span><span>{formatMoney(summary.taxes.vDesc)}</span></div>
                          <div className="col d-flex justify-content-between"><span>IPI</span><span>{formatMoney(summary.taxes.vIPI)}</span></div>
                          <div className="col d-flex justify-content-between"><span>PIS</span><span>{formatMoney(summary.taxes.vPIS)}</span></div>
                          <div className="col d-flex justify-content-between"><span>COFINS</span><span>{formatMoney(summary.taxes.vCOFINS)}</span></div>
                          <div className="col d-flex justify-content-between"><span>Outros</span><span>{formatMoney(summary.taxes.vOutro)}</span></div>
                          <div className="col d-flex justify-content-between fw-semibold"><span>Total NF</span><span>{formatMoney(summary.taxes.vNF)}</span></div>
                        </div>
                      ) : <div className="text-muted small">Nenhum total de impostos encontrado</div>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* XML preview removed */}
        </div>
      </div>

      {sendModal && (
        <>
          <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className={`modal-header ${sendModal.status === 'success' ? 'bg-success text-white' : 'bg-danger text-white'}`}>
                  <h5 className="modal-title">{sendModal.title}</h5>
                  <button type="button" className="btn-close btn-close-white" aria-label="Fechar" onClick={closeSendModal} />
                </div>
                <div className="modal-body">
                  <div>{sendModal.message}</div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={closeSendModal}>
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={closeSendModal} />
        </>
      )}
    </div>
  )
}

