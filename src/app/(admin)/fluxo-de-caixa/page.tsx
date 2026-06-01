'use client'

import { fluxoCaixaRealizadoResultado, fluxoCaixaResultado } from '@/lib/fluxoCaixaMath'
import type { ApexOptions } from 'apexcharts'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, Col, Form, Row, Spinner, Table } from 'react-bootstrap'

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false })

const moneyPt = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const cellNowrap = { whiteSpace: 'nowrap' as const }

type ARealizarRow = {
  label: string
  contasAReceber: number
  inadimplencia: number
  contasAPagar: number
  resultado: number
}

type RealizadoRow = {
  label: string
  contasAReceber: number
  vendaBalcao: number
  mercadoLivre: number
  despesa: number
  contasAPagar: number
  resultado: number
}

function realizadoResultado(
  contasAReceber: number,
  vendaBalcao: number,
  mercadoLivre: number,
  despesa: number,
  contasAPagar: number
): number {
  return fluxoCaixaRealizadoResultado(contasAReceber, vendaBalcao, mercadoLivre, despesa, contasAPagar)
}

function mapRealizadoRows(list: unknown[]): RealizadoRow[] {
  return list.map((r) => {
    const row = r as Record<string, unknown>
    const contasAReceber = Number(row.contasAReceber) || 0
    const vendaBalcao = Number(row.vendaBalcao) || 0
    const mercadoLivre = Number(row.mercadoLivre) || 0
    const despesa = Number(row.despesa) || 0
    const contasAPagar = Number(row.contasAPagar) || 0
    return {
      label: String(row.label ?? ''),
      contasAReceber,
      vendaBalcao,
      mercadoLivre,
      despesa,
      contasAPagar,
      resultado: realizadoResultado(contasAReceber, vendaBalcao, mercadoLivre, despesa, contasAPagar),
    }
  })
}

function currentYear(): number {
  return new Date().getFullYear()
}

function formatMoney(v: number): string {
  return moneyPt.format(v)
}

function moneyCellClass(value: number, kind: 'default' | 'inadimplencia' | 'resultado'): string {
  const base = 'text-end'
  if (kind === 'inadimplencia' && value > 0.0001) return `${base} text-warning`
  if (kind === 'resultado' && value < -0.0001) return `${base} text-danger`
  if (value < -0.0001) return `${base} text-danger`
  return base
}

function MoneyTd({
  value,
  kind = 'default',
}: {
  value: number
  kind?: 'default' | 'inadimplencia' | 'resultado'
}) {
  return (
    <td className={moneyCellClass(value, kind)} style={cellNowrap}>
      {formatMoney(value)}
    </td>
  )
}

function buildReceberPagarChartConfig(
  chartRows: Array<{ label: string; contasAReceber: number; contasAPagar: number }>
) {
  const categories = chartRows.map((r) => r.label.split('/')[0] ?? r.label)
  const series = [
    { name: 'A receber', data: chartRows.map((r) => r.contasAReceber) },
    { name: 'A pagar', data: chartRows.map((r) => r.contasAPagar) },
  ]
  const options: ApexOptions = {
    chart: {
      type: 'bar',
      toolbar: { show: false },
      fontFamily: 'inherit',
      height: 320,
    },
    plotOptions: {
      bar: {
        columnWidth: '55%',
        borderRadius: 2,
      },
    },
    dataLabels: { enabled: false },
    colors: ['#0d6efd', '#dc3545'],
    legend: {
      position: 'top',
      horizontalAlign: 'right',
      fontSize: '11px',
      itemMargin: { horizontal: 8, vertical: 0 },
    },
    xaxis: {
      categories,
      labels: { style: { fontSize: '11px' } },
    },
    yaxis: {
      labels: {
        formatter: (v) =>
          new Intl.NumberFormat('pt-BR', {
            notation: 'compact',
            compactDisplay: 'short',
            maximumFractionDigits: 1,
          }).format(v),
      },
    },
    tooltip: {
      y: {
        formatter: (v) => formatMoney(v),
      },
    },
    grid: {
      borderColor: '#e9ecef',
      strokeDashArray: 4,
    },
  }
  return { series, options }
}

export default function FluxoDeCaixaPage() {
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [ano, setAno] = useState(currentYear)
  const [anos, setAnos] = useState<number[]>([currentYear()])
  const [rows, setRows] = useState<ARealizarRow[]>([])
  const [rowsRealizado, setRowsRealizado] = useState<RealizadoRow[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('ano', String(ano))
      const qs = params.toString()
      const [resARealizar, resRealizado] = await Promise.all([
        fetch(`/api/financeiro/fluxo-de-caixa/a-realizar?${qs}`),
        fetch(`/api/financeiro/fluxo-de-caixa/realizado?${qs}`),
      ])
      if (resARealizar.status === 403 || resRealizado.status === 403) {
        setForbidden(true)
        setRows([])
        setRowsRealizado([])
        return
      }
      const [jsonARealizar, jsonRealizado] = await Promise.all([
        resARealizar.json().catch(() => null),
        resRealizado.json().catch(() => null),
      ])
      if (!jsonARealizar?.ok) {
        setRows([])
        setRowsRealizado([])
        return
      }
      setForbidden(false)
      const anosA = Array.isArray(jsonARealizar.anos)
        ? jsonARealizar.anos.map((y: unknown) => Number(y)).filter((y: number) => Number.isFinite(y))
        : []
      const anosR = Array.isArray(jsonRealizado?.anos)
        ? jsonRealizado.anos.map((y: unknown) => Number(y)).filter((y: number) => Number.isFinite(y))
        : []
      const anosList = [...new Set([...anosA, ...anosR, currentYear()])].sort((a, b) => b - a)
      setAnos(anosList)
      const anoResp = Number(jsonARealizar.ano)
      if (Number.isFinite(anoResp) && anoResp !== ano) setAno(anoResp)
      const list = Array.isArray(jsonARealizar.rows) ? jsonARealizar.rows : []
      setRows(
        list.map((r: Record<string, unknown>) => ({
          label: String(r.label ?? ''),
          contasAReceber: Number(r.contasAReceber) || 0,
          inadimplencia: Number(r.inadimplencia) || 0,
          contasAPagar: Number(r.contasAPagar) || 0,
          resultado: Number(r.resultado) || 0,
        }))
      )
      setRowsRealizado(
        jsonRealizado?.ok && Array.isArray(jsonRealizado.rows)
          ? mapRealizadoRows(jsonRealizado.rows)
          : []
      )
    } finally {
      setLoading(false)
    }
  }, [ano])

  useEffect(() => {
    void load()
  }, [load])

  const totais = useMemo(() => {
    const sums = rows.reduce(
      (acc, r) => ({
        contasAReceber: acc.contasAReceber + r.contasAReceber,
        inadimplencia: acc.inadimplencia + r.inadimplencia,
        contasAPagar: acc.contasAPagar + r.contasAPagar,
      }),
      { contasAReceber: 0, inadimplencia: 0, contasAPagar: 0 }
    )
    return {
      ...sums,
      resultado: fluxoCaixaResultado(sums.contasAReceber, sums.inadimplencia, sums.contasAPagar),
    }
  }, [rows])

  const totaisRealizado = useMemo(() => {
    const sums = rowsRealizado.reduce(
      (acc, r) => ({
        contasAReceber: acc.contasAReceber + r.contasAReceber,
        vendaBalcao: acc.vendaBalcao + r.vendaBalcao,
        mercadoLivre: acc.mercadoLivre + r.mercadoLivre,
        despesa: acc.despesa + r.despesa,
        contasAPagar: acc.contasAPagar + r.contasAPagar,
      }),
      { contasAReceber: 0, vendaBalcao: 0, mercadoLivre: 0, despesa: 0, contasAPagar: 0 }
    )
    return {
      ...sums,
      resultado: realizadoResultado(
        sums.contasAReceber,
        sums.vendaBalcao,
        sums.mercadoLivre,
        sums.despesa,
        sums.contasAPagar
      ),
    }
  }, [rowsRealizado])

  const chartConfig = useMemo(() => buildReceberPagarChartConfig(rows), [rows])

  const chartConfigRealizado = useMemo(() => buildReceberPagarChartConfig(rowsRealizado), [rowsRealizado])

  if (forbidden) {
    return (
      <div className="container-fluid py-3">
        <p className="text-muted mb-0">Acesso restrito a administradores.</p>
      </div>
    )
  }

  return (
    <div className="container-fluid py-3">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <h4 className="mb-0">Fluxo de caixa</h4>
        <Form.Group controlId="fluxo-caixa-ano" className="mb-0 d-flex align-items-center gap-2 flex-shrink-0">
          <Form.Label className="small text-muted mb-0 text-nowrap">Ano</Form.Label>
          <Form.Select
            size="sm"
            value={String(ano)}
            onChange={(e) => setAno(Number(e.target.value))}
            disabled={loading || anos.length === 0}
            style={{ width: 'auto', minWidth: '5.5rem' }}
          >
            {anos.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
      </div>

      <Row className="g-3 align-items-start">
        <Col lg={7}>
          <Card className="mb-0">
            <Card.Header className="py-2">
              <strong>A realizar</strong>
            </Card.Header>
            <Card.Body className="p-0">
              {loading ? (
                <div className="text-center py-4">
                  <Spinner animation="border" size="sm" role="status" />
                </div>
              ) : (
                <Table size="sm" striped bordered hover className="mb-0 align-middle w-100">
                  <thead className="table-light">
                    <tr>
                      <th style={cellNowrap}>Mês</th>
                      <th className="text-end" style={cellNowrap}>
                        Contas a receber
                      </th>
                      <th className="text-end" style={cellNowrap}>
                        Despesa
                      </th>
                      <th className="text-end text-warning" style={cellNowrap}>
                        Inadimplência
                      </th>
                      <th className="text-end" style={cellNowrap}>
                        Contas a pagar
                      </th>
                      <th className="text-end" style={cellNowrap}>
                        Resultado
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.label}>
                        <td style={cellNowrap}>{r.label}</td>
                        <MoneyTd value={r.contasAReceber} />
                        <td className="text-end text-muted" style={cellNowrap}>
                          —
                        </td>
                        <MoneyTd value={r.inadimplencia} kind="inadimplencia" />
                        <MoneyTd value={r.contasAPagar} />
                        <MoneyTd value={r.resultado} kind="resultado" />
                      </tr>
                    ))}
                  </tbody>
                  {!loading && rows.length > 0 && (
                    <tfoot className="table-light fw-semibold">
                      <tr>
                        <td style={cellNowrap}>Total</td>
                        <MoneyTd value={totais.contasAReceber} />
                        <td className="text-end text-muted" style={cellNowrap}>
                          —
                        </td>
                        <MoneyTd value={totais.inadimplencia} kind="inadimplencia" />
                        <MoneyTd value={totais.contasAPagar} />
                        <MoneyTd value={totais.resultado} kind="resultado" />
                      </tr>
                    </tfoot>
                  )}
                </Table>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col lg={5}>
          <Card className="mb-0">
            <Card.Header className="py-2">
              <strong>A receber / A pagar</strong>
            </Card.Header>
            <Card.Body className="py-2 px-2">
              {loading ? (
                <div className="text-center py-3">
                  <Spinner animation="border" size="sm" role="status" />
                </div>
              ) : rows.length === 0 ? (
                <p className="text-muted mb-0 small">Sem dados para o ano.</p>
              ) : (
                <ReactApexChart
                  type="bar"
                  height={320}
                  width="100%"
                  options={chartConfig.options}
                  series={chartConfig.series}
                  className="apex-charts w-100"
                />
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row className="g-3 mt-4 align-items-start">
        <Col lg={7}>
          <Card className="mb-0">
            <Card.Header className="py-2">
              <strong>Faturado / Realizado</strong>
            </Card.Header>
            <Card.Body className="p-0">
              {loading ? (
                <div className="text-center py-4">
                  <Spinner animation="border" size="sm" role="status" />
                </div>
              ) : (
                <Table size="sm" striped bordered hover className="mb-0 align-middle w-100">
                  <thead className="table-light">
                    <tr>
                      <th style={cellNowrap}>Mês</th>
                      <th className="text-end" style={cellNowrap}>
                        Contas a receber
                      </th>
                      <th className="text-end" style={cellNowrap}>
                        Venda balcão
                      </th>
                      <th className="text-end" style={cellNowrap}>
                        Mercado Livre
                      </th>
                      <th className="text-end" style={cellNowrap}>
                        Despesa
                      </th>
                      <th className="text-end" style={cellNowrap}>
                        Contas a pagar
                      </th>
                      <th className="text-end" style={cellNowrap}>
                        Resultado
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsRealizado.map((r) => (
                      <tr key={r.label}>
                        <td style={cellNowrap}>{r.label}</td>
                        <MoneyTd value={r.contasAReceber} />
                        <MoneyTd value={r.vendaBalcao} />
                        <MoneyTd value={r.mercadoLivre} />
                        <MoneyTd value={r.despesa} />
                        <MoneyTd value={r.contasAPagar} />
                        <MoneyTd value={r.resultado} kind="resultado" />
                      </tr>
                    ))}
                  </tbody>
                  {!loading && rowsRealizado.length > 0 && (
                    <tfoot className="table-light fw-semibold">
                      <tr>
                        <td style={cellNowrap}>Total</td>
                        <MoneyTd value={totaisRealizado.contasAReceber} />
                        <MoneyTd value={totaisRealizado.vendaBalcao} />
                        <MoneyTd value={totaisRealizado.mercadoLivre} />
                        <MoneyTd value={totaisRealizado.despesa} />
                        <MoneyTd value={totaisRealizado.contasAPagar} />
                        <MoneyTd value={totaisRealizado.resultado} kind="resultado" />
                      </tr>
                    </tfoot>
                  )}
                </Table>
              )}
            </Card.Body>
          </Card>
        </Col>

        <Col lg={5}>
          <Card className="mb-0">
            <Card.Header className="py-2">
              <strong>A receber / A pagar</strong>
            </Card.Header>
            <Card.Body className="py-2 px-2">
              {loading ? (
                <div className="text-center py-3">
                  <Spinner animation="border" size="sm" role="status" />
                </div>
              ) : rowsRealizado.length === 0 ? (
                <p className="text-muted mb-0 small">Sem dados para o ano.</p>
              ) : (
                <ReactApexChart
                  type="bar"
                  height={320}
                  width="100%"
                  options={chartConfigRealizado.options}
                  series={chartConfigRealizado.series}
                  className="apex-charts w-100"
                />
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
