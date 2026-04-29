"use client"

import { useEffect, useMemo, useState } from 'react'

type Linha = {
  id: number
  role: 'VENDEDOR' | 'TELEVENDAS'
  percent: number
  amount: number
  created_at: string
  order_num: number
  order?: {
    numero: number
    data: string
    faturado_em?: string
    cliente: string
    cnpj: string
    total: number
    status: string
  } | null
  order_vendor?: { externo: string; nome?: string | null } | null
  client_vendor?: { externo: string; nome?: string | null } | null
}

type RelatorioPorCliente = {
  cliente: string
  cnpj: string
  num_registros: number
  total: number
  order_total: number
}

type RelatorioVendedorRow = {
  externo: string
  nome: string | null
  num_registros?: number
  num_pedidos?: number
  total: number
  order_total: number
  por_cliente?: RelatorioPorCliente[]
}

export default function ComissoesPage() {
  const cycleData = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('pt-BR', { month: 'long' })
    const now = new Date()
    const options: Array<{ id: string; label: string; start: string; end: string }> = []
    let defaultId = ''
    const currentDay = now.getDate()
    for (let offset = 0; offset < 4; offset++) {
      const cycleMonth = new Date(now.getFullYear(), now.getMonth() - offset, 1)
      const year = cycleMonth.getFullYear()
      const monthIndex = cycleMonth.getMonth()
      const monthName = formatter
        .format(cycleMonth)
        .replace(/^\w/, (chr) => chr.toUpperCase())
      const lastDay = new Date(year, monthIndex + 1, 0).getDate()
      const firstHalfStart = new Date(year, monthIndex, 1).toISOString().slice(0, 10)
      const firstHalfEnd = new Date(year, monthIndex, 15).toISOString().slice(0, 10)
      const secondHalfStart = new Date(year, monthIndex, 16).toISOString().slice(0, 10)
      const secondHalfEnd = new Date(year, monthIndex, lastDay).toISOString().slice(0, 10)

      const firstId = `${year}-${monthIndex + 1}-first`
      options.push({
        id: firstId,
        label: `1 a 15 de ${monthName} de ${year}`,
        start: firstHalfStart,
        end: firstHalfEnd,
      })
      if (offset === 0 && currentDay <= 15) defaultId = firstId

      const secondId = `${year}-${monthIndex + 1}-second`
      options.push({
        id: secondId,
        label: `16 a ${lastDay} de ${monthName} de ${year}`,
        start: secondHalfStart,
        end: secondHalfEnd,
      })
      if (offset === 0 && currentDay > 15) defaultId = secondId
    }
    return { options, defaultId }
  }, [])

  const [rows, setRows] = useState<Linha[]>([])
  const [loading, setLoading] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [role, setRole] = useState<'VENDEDOR' | 'TELEVENDAS' | ''>('')
  const [vendorsAll, setVendorsAll] = useState<{ externo: string; nome: string; tipo?: 'VENDEDOR' | 'TELEVENDAS' | null }[]>([])
  const [vendorExterno, setVendorExterno] = useState<string>('')
  const [meVendorId, setMeVendorId] = useState<string>('')
  const [selectedCycle, setSelectedCycle] = useState(cycleData.defaultId)
  const [start, setStart] = useState<string>('')
  const [end, setEnd] = useState<string>('')
  const [reportCaseA, setReportCaseA] = useState<RelatorioVendedorRow[]>([])
  const [reportCaseB, setReportCaseB] = useState<RelatorioVendedorRow[]>([])
  const [reportCaseC, setReportCaseC] = useState<RelatorioVendedorRow[]>([])
  const [reportLoading, setReportLoading] = useState(false)
  const [showReport, setShowReport] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (role) params.set('role', role)
      if (vendorExterno) params.set('vendor_externo', vendorExterno)
      if (start) params.set('start', start)
      if (end) params.set('end', end)

      const res = await fetch(`/api/comissoes${params.toString() ? `?${params.toString()}` : ''}`)
      const json = await res.json()
      if (json?.ok) setRows(json.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Default: current month
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    const first = new Date(y, m, 1).toISOString().slice(0, 10)
    const last = new Date(y, m + 1, 0).toISOString().slice(0, 10)
    setStart(first)
    setEnd(last)

    // Resolve access level for UI controls
    ;(async () => {
      try {
        const res = await fetch('/api/me/vendedor')
        const json = await res.json()
        const idExterno = String(json?.data?.id_vendedor_externo || '')
        setIsAdmin(Boolean(json?.ok && json?.data?.is_admin))
        setMeVendorId(idExterno)
        if (!json?.data?.is_admin && idExterno) {
          setVendorExterno(idExterno)
        }
      } catch {
        setIsAdmin(false)
      }
    })()

    // Load vendors for filter
    ;(async () => {
      try {
        const res = await fetch('/api/vendedores')
        const json = await res.json()
        if (json?.ok) {
          const opts = (json.data || [])
            .filter((v: any) => !!v.id_vendedor_externo)
            .map((v: any) => ({
              externo: v.id_vendedor_externo as string,
              nome: v.nome as string,
              tipo: (v.tipo_acesso as any) || null,
            }))
          setVendorsAll(opts)
        }
      } catch {}
    })()
  }, [])

  useEffect(() => {
    if (!selectedCycle) return
    const cycle = cycleData.options.find((option) => option.id === selectedCycle)
    if (cycle) {
      setStart(cycle.start)
      setEnd(cycle.end)
    }
  }, [selectedCycle, cycleData.options])

  // When role changes, clear vendor if it doesn't match the filtered options
  const vendorOptions = useMemo(() => {
    if (!role) return vendorsAll
    return vendorsAll.filter((v) => {
      if (v.tipo === role) return true
      /** Sem linha em `vendedor_tipo_acesso`: comissões assumem papel Vendedor (igual ao backend). */
      if (v.tipo == null && role === 'VENDEDOR') return true
      return false
    })
  }, [vendorsAll, role])

  useEffect(() => {
    if (!isAdmin) return
    if (vendorExterno && !vendorOptions.some((v) => v.externo === vendorExterno)) {
      setVendorExterno('')
    }
  }, [role, vendorOptions, vendorExterno, isAdmin])

  // Auto reload on filter change (after dates are initialized)
  const cycleOptions = cycleData.options

  useEffect(() => {
    if (start && end) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, vendorExterno, start, end])

  const data = useMemo(() => rows, [rows])
  const totalAmount = useMemo(() => data.reduce((acc, r) => acc + (r.amount || 0), 0), [data])
  const totalOrderValue = useMemo(() => data.reduce((acc, r) => acc + (r.order?.total || 0), 0), [data])
  const totalCaseA = useMemo(() => reportCaseA.reduce((acc, r) => acc + (r.total || 0), 0), [reportCaseA])
  const totalCaseB = useMemo(() => reportCaseB.reduce((acc, r) => acc + (r.total || 0), 0), [reportCaseB])
  const totalCaseC = useMemo(() => reportCaseC.reduce((acc, r) => acc + (r.total || 0), 0), [reportCaseC])
  const totalOrderCaseA = useMemo(() => reportCaseA.reduce((acc, r) => acc + (r.order_total || 0), 0), [reportCaseA])
  const totalOrderCaseB = useMemo(() => reportCaseB.reduce((acc, r) => acc + (r.order_total || 0), 0), [reportCaseB])
  const totalOrderCaseC = useMemo(() => reportCaseC.reduce((acc, r) => acc + (r.order_total || 0), 0), [reportCaseC])
  const summaryRows = useMemo(() => {
    const map = new Map<string, RelatorioVendedorRow>()
    const addRow = (row: RelatorioVendedorRow) => {
      if (!row.externo) return
      const current = map.get(row.externo) || {
        ...row,
        total: 0,
        order_total: 0,
        por_cliente: [],
      }
      current.total += row.total
      current.order_total += row.order_total
      current.por_cliente = [...(current.por_cliente || []), ...(row.por_cliente ?? [])]
      map.set(row.externo, current)
    }
    ;[reportCaseA, reportCaseB, reportCaseC].forEach((list) => list.forEach(addRow))
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [reportCaseA, reportCaseB, reportCaseC])
  const totalCaseSummary = useMemo(() => summaryRows.reduce((acc, r) => acc + (r.total || 0), 0), [summaryRows])
  const totalOrderCaseSummary = useMemo(() => summaryRows.reduce((acc, r) => acc + (r.order_total || 0), 0), [summaryRows])

  const runReport = async () => {
    setReportLoading(true)
    try {
      const params = new URLSearchParams()
      if (vendorExterno) params.set('vendor_externo', vendorExterno)
      if (start) params.set('start', start)
      if (end) params.set('end', end)
      if (role) params.set('role', role)
      const res = await fetch(`/api/relatorios/vendas-por-vendedor?${params.toString()}`)
      const json = await res.json()
      if (json?.ok) {
        setReportCaseA(json.caseA || [])
        setReportCaseB(json.caseB || [])
        setReportCaseC(json.caseC || [])
        setShowReport(true)
      }
    } finally {
      setReportLoading(false)
    }
  }

  const renderCommissionSection = (
    title: string,
    rows: RelatorioVendedorRow[],
    totalOrder: number,
    totalCommission: number,
  ) => {
    if (!rows.length) return null
    return (
      <div className="table-responsive mb-4">
        <h5 className="mb-2">{title}</h5>
        <table className="table table-sm table-striped table-hover">
          <thead>
            <tr>
              <th>Vendedor</th>
              <th>ID Externo</th>
              <th>Total dos pedidos</th>
              <th>Registros</th>
              <th>Total Comissão</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.externo}-${r.total}-${r.order_total}`}>
                <td className="align-top" style={{ minWidth: 220 }}>
                  <div className="fw-bold">{r.nome || '-'}</div>
                  <div className="small text-muted mb-1">{r.externo}</div>
                  {(r.por_cliente ?? []).map((c) => (
                    <div
                      key={`${c.cnpj}-${c.cliente}`}
                      className="ps-3 ms-2 mt-2 small border-start border-secondary border-opacity-25"
                    >
                      <div>{c.cliente}</div>
                      {c.cnpj ? <div className="text-muted">{c.cnpj}</div> : null}
                      <div className="text-muted">
                        Comissão:{' '}
                        {c.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · Pedido:{' '}
                        {c.order_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} ·{' '}
                        {(c.num_registros ?? 0)} reg.
                      </div>
                    </div>
                  ))}
                </td>
                <td className="align-top text-muted small">{r.externo}</td>
                <td>{r.order_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                <td>{(r as any).num_registros ?? (r as any).num_pedidos ?? 0}</td>
                <td>{r.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="text-end fw-semibold">
                Total dos pedidos
              </td>
              <td className="fw-semibold">{totalOrder.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
              <td colSpan={2}></td>
            </tr>
            <tr>
              <td colSpan={4} className="text-end fw-semibold">
                Total comissão
              </td>
              <td className="fw-semibold">{totalCommission.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    )
  }

  const renderSummarySection = (
    title: string,
    rows: RelatorioVendedorRow[],
    totalOrder: number,
    totalCommission: number,
  ) => {
    if (!rows.length) return null
    return (
      <div className="table-responsive mb-4">
        <h5 className="mb-2">{title}</h5>
        <table className="table table-sm table-striped table-hover">
          <thead>
            <tr>
              <th>Vendedor</th>
              <th>Comissões somadas:</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`summary-${r.externo}`}>
                <td className="fw-bold">{r.nome || '-'}</td>
                <td>{r.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="text-end fw-semibold">
                Total dos pedidos
              </td>
              <td className="fw-semibold">{totalOrder.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
              <td></td>
            </tr>
            <tr>
              <td colSpan={3} className="text-end fw-semibold">
                Total comissão
              </td>
              <td className="fw-semibold">{totalCommission.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    )
  }

  return (
    <div className="p-3">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h2 className="m-0">Comissões</h2>
      </div>

      <div className="card mb-3">
        <div className="card-body">
          <div className="row g-2">
            {isAdmin && (
              <div className="col-md-2">
                <label className="form-label">Tipo</label>
                <select className="form-select" value={role} onChange={(e) => setRole(e.target.value as any)}>
                  <option value="">Todos</option>
                  <option value="VENDEDOR">Vendedor</option>
                  <option value="TELEVENDAS">Televendas</option>
                </select>
              </div>
            )}
            {isAdmin && (
              <div className="col-md-3">
                <label className="form-label">Vendedor</label>
                <select className="form-select" value={vendorExterno} onChange={(e) => setVendorExterno(e.target.value)}>
                  <option value="">Todos</option>
                  {vendorOptions.map((v) => (
                    <option key={v.externo} value={v.externo}>
                      {v.nome} ({v.externo})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="col-md-3">
              <label className="form-label">Ciclo</label>
              <select
                className="form-select"
                value={selectedCycle}
                onChange={(e) => setSelectedCycle(e.target.value)}
              >
                <option value="">Nenhum</option>
                {cycleOptions.map((cycle) => (
                  <option key={cycle.id} value={cycle.id}>
                    {cycle.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={isAdmin ? "col-md-3" : "col-md-4"}>
              <label className="form-label">Data inicial</label>
              <input
                type="date"
                className="form-control"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value)
                  setSelectedCycle('')
                }}
              />
            </div>
            <div className={isAdmin ? "col-md-4" : "col-md-4"}>
              <label className="form-label">Data final</label>
              <div className="d-flex align-items-center">
                <input
                  type="date"
                  className="form-control"
                  value={end}
                  onChange={(e) => {
                    setEnd(e.target.value)
                    setSelectedCycle('')
                  }}
                />
                {isAdmin && (
                  <button className="btn btn-primary ms-2 text-nowrap" onClick={runReport} disabled={reportLoading}>
                    {reportLoading ? 'Gerando...' : 'Relatório Geral'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>



      {showReport && (
        <div className="modal d-block" tabIndex={-1} role="dialog">
          <div className="modal-dialog modal-xl" role="document">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Relatório Geral de Vendas por Vendedor</h5>
                <button type="button" className="btn-close" onClick={() => setShowReport(false)} aria-label="Close"></button>
              </div>
              <div className="modal-body">
                {renderCommissionSection('Vendedor do pedido e do cliente (5%)', reportCaseA, totalOrderCaseA, totalCaseA)}
                {renderCommissionSection('Vendedor do pedido, outro cliente (Televendas - 1%)', reportCaseB, totalOrderCaseB, totalCaseB)}
                {renderCommissionSection('Vendedor do cliente (4%)', reportCaseC, totalOrderCaseC, totalCaseC)}
                {renderSummarySection('Somatório total por vendedor', summaryRows, totalOrderCaseSummary, totalCaseSummary)}
                {!reportCaseA.length && !reportCaseB.length && !reportCaseC.length && (
                  <div className="text-center text-muted">Nenhum registro retornado para o ciclo selecionado.</div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowReport(false)}>Fechar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div>Carregando...</div>
      ) : (
        <div className="card border-0 shadow-sm">
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-sm table-striped table-hover mb-0">
                <thead>
                  <tr>
                    <th>Faturado em</th>
                    <th>Pedido</th>
                    <th>Cliente</th>
                    <th>Vendedor do Pedido</th>
                    <th>Vendedor Pertencente</th>
                    <th>Total do Pedido</th>
                    <th>Tipo</th>
                    <th>%</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((r) => (
                    <tr key={r.id}>
                      <td>{new Date(r.created_at).toLocaleDateString('pt-BR')}</td>
                      <td>{r.order?.numero ?? r.order_num}</td>
                      <td>{r.order?.cliente ?? '-'}</td>
                      <td>{r.order_vendor ? (r.order_vendor.nome || r.order_vendor.externo) : '-'}</td>
                      <td>{r.client_vendor ? (r.client_vendor.nome || r.client_vendor.externo) : '-'}</td>
                      <td>
                        {typeof r.order?.total === 'number'
                          ? r.order.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                          : '-'}
                      </td>
                      <td>{r.role === 'TELEVENDAS' ? 'Televendas' : 'Vendedor'}</td>
                      <td>{r.percent}%</td>
                      <td>{r.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5} className="text-end fw-semibold">Total dos pedidos</td>
                    <td className="fw-semibold">{totalOrderValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                    <td colSpan={3}></td>
                  </tr>
                  <tr>
                    <td colSpan={7} className="text-end fw-semibold">Total comissão</td>
                    <td className="fw-semibold">{totalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


