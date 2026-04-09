 "use client";
 
import { useEffect, useMemo, useState } from "react";
import { Card, Form, Table, Badge, Row, Col, Button, Modal, Spinner } from "react-bootstrap";
 import PageTitle from '@/components/PageTitle'
import { Pedido, PedidoStatus } from '@/services/pedidos2'
import IconifyIcon from '@/components/wrappers/IconifyIcon'
import { savePedido as savePedidoRemote } from '@/services/pedidos2'
 import { useRouter } from 'next/navigation'
 
 interface PedidosListaProps {
   entity?: 'pedido' | 'proposta'
   title?: string
   subName?: string
   fetchFn: () => Promise<Pedido[]>
   newItemPath?: string
   itemRouteBase?: string
 }
 
type ShareTarget = {
  numero: number
  cliente: string
  total: number
  status: PedidoStatus
  email: string | null
}

 export default function PedidosLista({
   entity = 'pedido',
   title,
   subName,
   fetchFn,
   newItemPath,
   itemRouteBase = '/pedidos',
 }: PedidosListaProps) {
   const router = useRouter()
   const [items, setItems] = useState<Pedido[]>([])
  const [shareModalVisible, setShareModalVisible] = useState(false)
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null)
  const [shareEmailInput, setShareEmailInput] = useState('')
  const [shareLoadingPedidoNumero, setShareLoadingPedidoNumero] = useState<number | null>(null)
  const [shareSending, setShareSending] = useState(false)
  const [shareModalError, setShareModalError] = useState<string | null>(null)
  const [shareNotice, setShareNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isSyncingPedidos, setIsSyncingPedidos] = useState(false)

  const loadItems = async () => {
    const rows = await fetchFn()
    setItems(rows)
  }
 
   useEffect(() => {
    if (entity === 'pedido') return
     (async () => {
      await loadItems()
     })()
  }, [fetchFn, entity])
 
   const [termoBusca, setTermoBusca] = useState("");
  const [termoBuscaDebounced, setTermoBuscaDebounced] = useState("")
   const [statusFiltro, setStatusFiltro] = useState("");
   const [dataInicio, setDataInicio] = useState("");
   const [dataFim, setDataFim] = useState("");
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [itensPorPagina, setItensPorPagina] = useState(20)
  const [sortBy, setSortBy] = useState<'numero' | 'data' | 'cliente'>('numero')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [totalPedidos, setTotalPedidos] = useState(0)
  const [totalValorFiltrado, setTotalValorFiltrado] = useState(0)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isSupervisor, setIsSupervisor] = useState(false)
  const [meVendedorExterno, setMeVendedorExterno] = useState('')
  const [meVendedorNome, setMeVendedorNome] = useState('')
  const [vendedorFiltro, setVendedorFiltro] = useState('')
  const [vendedoresOptions, setVendedoresOptions] = useState<Array<{ id_vendedor_externo: string; nome: string }>>([])
  const showOrderVendorColumn = entity === 'pedido' && !isAdmin
  const extraColumnCount = showOrderVendorColumn ? 1 : 0
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
  const cycleOptions = cycleData.options
  const [selectedCycle, setSelectedCycle] = useState(() => cycleData.defaultId || '')

  useEffect(() => {
    const t = setTimeout(() => setTermoBuscaDebounced(termoBusca), 350)
    return () => clearTimeout(t)
  }, [termoBusca])

  useEffect(() => {
    if (!selectedCycle) return
    const cycle = cycleOptions.find((option) => option.id === selectedCycle)
    if (cycle) {
      setDataInicio(cycle.start)
      setDataFim(cycle.end)
    }
  }, [selectedCycle, cycleOptions])

  useEffect(() => {
    const controller = new AbortController()
    ;(async () => {
      try {
        const res = await fetch('/api/me/vendedor', { signal: controller.signal })
        const json = await res.json().catch(() => null)
        setIsAdmin(Boolean(json?.ok && json?.data?.is_admin))
        setIsSupervisor(Boolean(json?.ok && json?.data?.is_supervisor))
        setMeVendedorExterno(String(json?.data?.id_vendedor_externo || ''))
        setMeVendedorNome(String(json?.data?.nome || ''))
      } catch {
        setIsAdmin(false)
        setIsSupervisor(false)
        setMeVendedorExterno('')
        setMeVendedorNome('')
      }
    })()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const canUseVendorFilter = isAdmin || isSupervisor
    if (!canUseVendorFilter || entity !== 'pedido') return
    const controller = new AbortController()
    ;(async () => {
      try {
        if (isSupervisor && meVendedorExterno) {
          const [supRes, vendRes] = await Promise.all([
            fetch('/api/supervisores', { signal: controller.signal }),
            fetch('/api/vendedores', { signal: controller.signal }),
          ])
          const supJson = await supRes.json().catch(() => null)
          const vendJson = await vendRes.json().catch(() => null)
          if (!supRes.ok || !supJson?.ok || !vendRes.ok || !vendJson?.ok) return

          const allVendedores = Array.isArray(vendJson?.data) ? vendJson.data : []
          const vendByExt = new Map(
            allVendedores
              .filter((v: any) => v?.id_vendedor_externo)
              .map((v: any) => [String(v.id_vendedor_externo), String(v.nome || v.id_vendedor_externo)])
          )

          const supRows = Array.isArray(supJson?.data) ? supJson.data : []
          const currentSup = supRows.find((s: any) => String(s?.id_vendedor_externo || '') === meVendedorExterno)
          const supervised = Array.isArray(currentSup?.supervised) ? currentSup.supervised : []
          const mappedSupervised = supervised
            .filter((v: any) => v?.vendedor_externo)
            .map((v: any) => {
              const ext = String(v.vendedor_externo)
              return {
                id_vendedor_externo: ext,
                nome: String(v.nome || vendByExt.get(ext) || ext),
              }
            })
          const mapped = [
            {
              id_vendedor_externo: meVendedorExterno,
              nome: meVendedorNome || vendByExt.get(meVendedorExterno) || meVendedorExterno,
            },
            ...mappedSupervised,
          ].filter((v) => v.id_vendedor_externo)

          const dedup = Array.from(
            new Map(mapped.map((v) => [v.id_vendedor_externo, v])).values()
          )
          setVendedoresOptions(dedup)
          return
        }

        const res = await fetch('/api/vendedores', { signal: controller.signal })
        const json = await res.json().catch(() => null)
        if (!res.ok || !json?.ok) return
        const arr = Array.isArray(json?.data) ? json.data : []
        const mapped = arr
          .filter((v: any) => v?.id_vendedor_externo)
          .map((v: any) => ({
            id_vendedor_externo: String(v.id_vendedor_externo),
            nome: String(v.nome || v.id_vendedor_externo),
          }))
        setVendedoresOptions(mapped)
      } catch {
        setVendedoresOptions([])
      }
    })()
    return () => controller.abort()
  }, [entity, isAdmin, isSupervisor, meVendedorExterno, meVendedorNome])
 
   const dentroDoPeriodo = (dataISO: string) => {
     if (!dataInicio && !dataFim) return true;
     const d = new Date(dataISO);
     if (dataInicio) {
       const ini = new Date(dataInicio);
       if (d < new Date(ini.getFullYear(), ini.getMonth(), ini.getDate())) return false;
     }
     if (dataFim) {
       const fim = new Date(dataFim);
       const fimAjustado = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate(), 23, 59, 59, 999);
       if (d > fimAjustado) return false;
     }
     return true;
   };
 
  const itensFiltrados = items.filter((p) => {
     const termo = termoBusca.trim().toLowerCase();
     const atendeBusca = !termo
       || String(p.numero).includes(termo)
       || p.cliente.toLowerCase().includes(termo)
       || p.cnpj.toLowerCase().includes(termo);
     const atendeStatus = !statusFiltro || p.status === statusFiltro;
     const atendePeriodo = dentroDoPeriodo(p.data);
     return atendeBusca && atendeStatus && atendePeriodo;
   });

  const itensOrdenados = [...itensFiltrados].sort((a, b) => {
    let cmp = 0
    if (sortBy === 'numero') cmp = Number(a.numero) - Number(b.numero)
    else if (sortBy === 'data') cmp = new Date(a.data).getTime() - new Date(b.data).getTime()
    else cmp = String(a.cliente || '').localeCompare(String(b.cliente || ''), 'pt-BR', { sensitivity: 'base' })
    return sortDir === 'asc' ? cmp : -cmp
  })

  const totalBase = entity === 'pedido' ? totalPedidos : itensOrdenados.length
  const totalPaginas = Math.max(1, Math.ceil(totalBase / itensPorPagina))
  const totalValorExibido = useMemo(
    () =>
      entity === 'pedido' && !isAdmin
        ? itensOrdenados.reduce((acc, p) => acc + (p.total || 0), 0)
        : totalValorFiltrado,
    [entity, isAdmin, itensOrdenados, totalValorFiltrado],
  )
  const paginaSegura = Math.min(paginaAtual, totalPaginas)
  const inicio = (paginaSegura - 1) * itensPorPagina
  const fim = inicio + itensPorPagina
  const itensPaginados = entity === 'pedido' ? itensOrdenados : itensOrdenados.slice(inicio, fim)

  useEffect(() => {
    setPaginaAtual(1)
  }, [termoBuscaDebounced, statusFiltro, vendedorFiltro, dataInicio, dataFim, itensPorPagina, sortBy, sortDir])

  useEffect(() => {
    if (paginaAtual > totalPaginas) setPaginaAtual(totalPaginas)
  }, [paginaAtual, totalPaginas])
 
   const labelPlural = entity === 'proposta' ? 'Propostas' : 'Pedidos'
  const newPath = newItemPath ?? `${itemRouteBase}/0`

  const computeItemUrl = (numero: number) => {
    if (entity === 'proposta') return `/pedidos/${numero}?entity=proposta`
    return `${itemRouteBase}/${numero}`
  }

  const closeShareModal = () => {
    setShareModalVisible(false)
    setShareTarget(null)
    setShareEmailInput('')
    setShareModalError(null)
  }

  const openShareModal = async (e: React.MouseEvent, pedidoNumero: number) => {
    e.stopPropagation()
    setShareModalError(null)
    setShareNotice(null)
    setShareLoadingPedidoNumero(pedidoNumero)
    try {
      const res = await fetch(`/api/pedidos/${pedidoNumero}`)
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'Falha ao carregar o pedido')
      }
      const data = json.data
      const defaultEmail = data?.selected_client?.email || ''
      setShareTarget({
        numero: data.numero,
        cliente: data.cliente,
        total: Number(data.total || 0),
        status: data.status,
        email: defaultEmail || null,
      })
      setShareEmailInput(defaultEmail || '')
      setShareModalVisible(true)
    } catch (err: any) {
      setShareNotice({
        type: 'error',
        message: err?.message || 'Não foi possível abrir o compartilhamento',
      })
    } finally {
      setShareLoadingPedidoNumero(null)
    }
  }

  const handleShareSend = async () => {
    if (!shareTarget) return
    const recipient = shareEmailInput.trim()
    if (!recipient) {
      setShareModalError('Email obrigatório')
      return
    }
    setShareModalError(null)
    setShareSending(true)
    const targetNumero = shareTarget.numero
    try {
      const res = await fetch('/api/pedidos/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero: shareTarget.numero, email: recipient }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'Falha ao enviar o email')
      }
      closeShareModal()
      setShareNotice({
        type: 'success',
        message: `Pedido #${targetNumero} enviado para ${recipient}`,
      })
    } catch (err: any) {
      setShareModalError(err?.message || 'Falha ao enviar o email')
    } finally {
      setShareSending(false)
    }
  }

  const handleDelete = async (e: React.MouseEvent, numero: number) => {
    e.stopPropagation()
    if (!confirm('Confirma exclusão?')) return
    try {
      if (entity === 'proposta') {
        const res = await fetch(`/api/propostas?id=${numero}`, { method: 'DELETE' })
        const json = await res.json()
        if (!res.ok || !json?.ok) throw new Error(json?.error || 'Falha ao deletar proposta')
        setItems((arr) => arr.filter((it) => it.numero !== numero))
      } else {
        // mock delete for pedidos (preserve existing behaviour)
      }
    } catch (err: any) {
      alert('Erro ao excluir: ' + (err?.message || err))
    }
  }

  // Evolve proposal -> pedido
  const [showEvolveModal, setShowEvolveModal] = useState(false)
  const [evolveItem, setEvolveItem] = useState<Pedido | null>(null)
  const [isEvolving, setIsEvolving] = useState(false)
  const [evolveError, setEvolveError] = useState<string | null>(null)

  const openEvolve = (e: React.MouseEvent, item: Pedido) => {
    e.stopPropagation()
    setEvolveItem(item)
    setEvolveError(null)
    setShowEvolveModal(true)
  }

  const confirmEvolve = async () => {
    if (!evolveItem) return
    setIsEvolving(true)
    setEvolveError(null)
    try {
      const res = await savePedidoRemote({ ...evolveItem, status: 'Pendente' })
      // Only remove the proposal from the list if backend returned a platform numero (pedido created)
      if (res && (res as any).numero) {
        setItems((arr) => arr.filter((it) => it.numero !== evolveItem.numero))
        setShowEvolveModal(false)
      } else {
        // Do not remove; surface error to user for inspection
        console.debug('Evolve response', res)
        setEvolveError('A proposta não foi transformada em pedido: o serviço não retornou um número de pedido.')
      }
    } catch (err: any) {
      setEvolveError(err?.message || 'Falha ao evoluir proposta')
    } finally {
      setIsEvolving(false)
    }
  }

  const syncPedidos = async () => {
    if (entity !== 'pedido') return
    if (!confirm('Esta ação excluirá e reimportará todos os pedidos locais. Deseja continuar?')) return
    setIsSyncingPedidos(true)
    try {
      const res = await fetch('/api/pedidos/sync', { method: 'POST' })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        console.error('Erro ao sincronizar pedidos', {
          status: res.status,
          statusText: res.statusText,
          response: json,
        })
        throw new Error(json?.error || 'Falha ao sincronizar pedidos')
      }
      await loadItems()
      alert(`Sincronização concluída. ${json?.imported ?? 0} pedidos importados.`)
    } catch (err: any) {
      console.error('Falha na sincronização de pedidos', err)
      alert('Erro ao sincronizar pedidos: ' + (err?.message || err))
    } finally {
      setIsSyncingPedidos(false)
    }
  }

  useEffect(() => {
    if (entity !== 'pedido') return
    const controller = new AbortController()
    ;(async () => {
      try {
        const qs = new URLSearchParams()
        qs.set('limit', String(itensPorPagina))
        qs.set('offset', String((paginaSegura - 1) * itensPorPagina))
        if (termoBuscaDebounced.trim()) qs.set('search', termoBuscaDebounced.trim())
        if (statusFiltro) qs.set('status', statusFiltro)
        if (vendedorFiltro) qs.set('vendedor', vendedorFiltro)
        if (dataInicio) qs.set('dataInicio', dataInicio)
        if (dataFim) qs.set('dataFim', dataFim)
        qs.set('sortBy', sortBy)
        qs.set('sortDir', sortDir)
        const res = await fetch(`/api/pedidos?${qs.toString()}`, { signal: controller.signal })
        const json = await res.json().catch(() => null)
        if (!res.ok || !json?.ok) throw new Error(json?.error || 'Falha ao listar pedidos')
        setItems(Array.isArray(json?.data) ? json.data : [])
        setTotalPedidos(Number(json?.paginacao?.total || 0))
        setTotalValorFiltrado(Number(json?.paginacao?.total_valor || 0))
      } catch (e: any) {
        if (e?.name === 'AbortError') return
        console.error('Erro ao listar pedidos paginados', e)
      }
    })()
    return () => controller.abort()
  }, [entity, paginaSegura, itensPorPagina, termoBuscaDebounced, statusFiltro, vendedorFiltro, dataInicio, dataFim, sortBy, sortDir])

  const toggleSort = (field: 'numero' | 'data' | 'cliente') => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortBy(field)
    setSortDir(field === 'cliente' ? 'asc' : 'desc')
  }

  const sortArrow = (field: 'numero' | 'data' | 'cliente') => {
    if (sortBy !== field) return '↕'
    return sortDir === 'asc' ? '↑' : '↓'
  }
 
  const formatBrDate = (iso: string) => {
    if (!iso) return ''
    const [year, month, day] = iso.split('-')
    return `${day}/${month}/${year}`
  }

  return (
     <>
      <PageTitle
        title={title ?? (entity === 'proposta' ? 'Propostas Comerciais' : 'Pedidos')}
        subName={subName ?? (entity === 'proposta' ? 'Consulta e acompanhamento' : 'Consulta e acompanhamento')}
        compactRight
        actions={
          <div className="d-flex align-items-center gap-2">
            {entity === 'pedido' && (
              <>
                <Button size="sm" variant="outline-primary" onClick={syncPedidos} disabled={isSyncingPedidos}>
                  {isSyncingPedidos ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-2" />
                      Sincronizando
                    </>
                  ) : (
                    'Sincronizar Pedidos'
                  )}
                </Button>
              </>
            )}
            <Button size="sm" onClick={() => router.push(newPath)}>
              Novo {entity === 'proposta' ? 'Proposta' : 'Pedido'}
            </Button>
          </div>
        }
      />
      {shareNotice && (
        <div className={`alert alert-${shareNotice.type === 'success' ? 'success' : 'danger'} mt-3`}>
          {shareNotice.message}
        </div>
      )}

      <section className="filtros pt-1 pb-2">
         <Card className="border-0 shadow-sm">
           <Card.Body>
             <Row className="g-3 align-items-end">
              <Col lg={3} md={6}>
                 <Form.Label>Filtrar pedidos</Form.Label>
                 <Form.Control
                   type="text"
                   placeholder="Buscar por N°, Cliente ou CNPJ"
                   value={termoBusca}
                   onChange={(e) => setTermoBusca(e.target.value)}
                 />
               </Col>
              <Col lg={3} md={6}>
                 <Form.Label>Ciclo</Form.Label>
                 <Form.Select value={selectedCycle} onChange={(e) => setSelectedCycle(e.target.value)}>
                   <option value="">Nenhum</option>
                   {cycleOptions.map((cycle) => (
                     <option key={cycle.id} value={cycle.id}>
                       {cycle.label}
                     </option>
                   ))}
                 </Form.Select>
               </Col>
              {(isAdmin || isSupervisor) && (
                <Col lg={3} md={6}>
                  <Form.Label>Vendedor</Form.Label>
                  <Form.Select value={vendedorFiltro} onChange={(e) => setVendedorFiltro(e.target.value)}>
                    <option value="">
                      {isSupervisor ? 'Todos vendedores supervisionados' : 'Todos'}
                    </option>
                    {vendedoresOptions.map((v) => (
                      <option key={v.id_vendedor_externo} value={v.id_vendedor_externo}>
                        {v.nome}
                      </option>
                    ))}
                  </Form.Select>
                </Col>
              )}
              <Col lg={2} md={6}>
                 <Form.Label>Data Início</Form.Label>
                 <Form.Control
                   type="date"
                   value={dataInicio}
                   onChange={(e) => {
                     setDataInicio(e.target.value)
                     setSelectedCycle('')
                   }}
                 />
               </Col>
              <Col lg={2} md={6}>
                 <Form.Label>Data Fim</Form.Label>
                 <Form.Control
                   type="date"
                   value={dataFim}
                   onChange={(e) => {
                     setDataFim(e.target.value)
                     setSelectedCycle('')
                   }}
                 />
               </Col>
              <Col lg={2} md={6}>
                 <Form.Label>Status</Form.Label>
                 <Form.Select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)}>
                   <option value="">Todos</option>
                  <option value="Aprovado">Aprovado na Analise</option>
                  <option value="Pendente">Pendente</option>
                   <option value="Faturado">Faturado</option>
                  <option value="Enviado">Enviado</option>
                   <option value="Entregue">Entregue</option>
                  <option value="Cancelado">Cancelado</option>
                  <option value="Dados incompletos">Dados incompletos</option>
                 </Form.Select>
               </Col>
             </Row>
            <div className="d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
              <div className="text-muted small">
                Mostrando {itensPaginados.length} resultados de {totalBase}
              </div>
              <div className="d-flex align-items-center gap-2 flex-wrap justify-content-end">
                Por página:
                <Form.Select
                  size="sm"
                  style={{ width: 100 }}
                  value={itensPorPagina}
                  onChange={(e) => setItensPorPagina(Number(e.target.value))}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </Form.Select>
                <Button
                  size="sm"
                  variant="outline-secondary"
                  disabled={paginaSegura <= 1}
                  onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                <Form.Select
                  size="sm"
                  style={{ width: 90 }}
                  value={paginaSegura}
                  onChange={(e) => setPaginaAtual(Number(e.target.value))}
                >
                  {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Form.Select>
                <Button
                  size="sm"
                  variant="outline-secondary"
                  disabled={paginaSegura >= totalPaginas}
                  onClick={() => setPaginaAtual((p) => Math.min(totalPaginas, p + 1))}
                >
                  Próxima
                </Button>
              </div>
            </div>
           </Card.Body>
         </Card>
       </section>
 
      <section className="pedidos-lista pt-0 pb-3">
         <Card className="border-0 shadow-sm">
           <Card.Body>
             <div className="table-responsive">
               <Table hover className="mb-0">
                 <thead>
                   <tr>
                    <th role="button" onClick={() => toggleSort('numero')} style={{ userSelect: 'none' }}>
                      N° {sortArrow('numero')}
                    </th>
                    <th role="button" onClick={() => toggleSort('data')} style={{ userSelect: 'none' }}>
                      Data {sortArrow('data')}
                    </th>
                    <th role="button" onClick={() => toggleSort('cliente')} style={{ userSelect: 'none' }}>
                      Cliente {sortArrow('cliente')}
                    </th>
                     <th>CNPJ</th>
                    {showOrderVendorColumn && <th>Vendedor no Pedido</th>}
                     <th>Total</th>
                     <th>Status</th>
                     <th style={{ width: 110 }}>Ações</th>
                   </tr>
                 </thead>
                 <tbody>
                  {itensPaginados.length > 0 ? (
                   itensPaginados.map((p) => {
                      const isTinyOrigin = String(p.sistema_origem || 'sama').toLowerCase() === 'tiny'
                      const canEditPedido = entity === 'pedido' ? (isAdmin || p.status === 'Dados incompletos') : true
                      const canDeletePedido = entity === 'pedido' ? isAdmin : true
                      return (
                      <tr
                        key={p.numero}
                        style={{ cursor: 'pointer' }}
                        onClick={() => {
                          router.push(computeItemUrl(p.numero))
                        }}
                      >
                         <td>{p.numero}</td>
                         <td>{formatBrDate(p.data)}</td>
                         <td>{p.cliente}</td>
                         <td>{p.cnpj}</td>
                         {showOrderVendorColumn && (
                           <td>
                             {p.order_vendor_nome || p.order_vendor_externo || '—'}
                           </td>
                         )}
                         <td>{p.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                         <td>
                          {p.status === 'Faturado' && (<Badge bg="success">{p.status}</Badge>)}
                          {p.status === 'Aprovado' && (<Badge bg="primary">{p.status}</Badge>)}
                          {p.status === 'Enviado' && (<Badge bg="primary">{p.status}</Badge>)}
                          {p.status === 'Pendente' && (<Badge bg="warning" text="dark">{p.status}</Badge>)}
                          {p.status === 'Entregue' && (<Badge bg="info">{p.status}</Badge>)}
                          {p.status === 'Cancelado' && (<Badge bg="danger">{p.status}</Badge>)}
                          {p.status === 'Dados incompletos' && (<Badge bg="secondary">{p.status}</Badge>)}
                          {p.status === 'Proposta' && (<Badge bg="dark">{p.status}</Badge>)}
                         </td>
                         <td>
                           <div className="d-flex gap-2">
                            {isTinyOrigin ? (
                              <Button
                                variant="outline-warning"
                                size="sm"
                                onClick={(e) => e.stopPropagation()}
                                title="Pedido vindo do Tiny"
                                style={{ backgroundColor: '#fff', whiteSpace: 'nowrap' }}
                              >
                                Origem: Tiny
                              </Button>
                            ) : (
                              <>
                                {canEditPedido && (
                                  <Button
                                    variant="outline-secondary"
                                    size="sm"
                                    onClick={(e) => { e.stopPropagation(); router.push(computeItemUrl(p.numero)) }}
                                    title="Editar"
                                  >
                                     <IconifyIcon icon="ri:edit-line" />
                                   </Button>
                                )}
                                <Button
                                  variant="outline-info"
                                  size="sm"
                                  disabled={shareLoadingPedidoNumero === p.numero}
                                  onClick={(e) => openShareModal(e, p.numero)}
                                  title="Compartilhar"
                                >
                                  {shareLoadingPedidoNumero === p.numero ? (
                                    <Spinner animation="border" size="sm" />
                                  ) : (
                                    <IconifyIcon icon="ri:share-forward-line" />
                                  )}
                                </Button>
                                 {entity === 'proposta' && (
                                   <Button
                                     variant="outline-success"
                                     size="sm"
                                     onClick={(e) => openEvolve(e, p)}
                                     title="Evoluir para pedido"
                                   >
                                     <IconifyIcon icon="ri:money-dollar-circle-line" />
                                   </Button>
                                 )}
                                  {canDeletePedido && (
                                    <Button
                                      variant="outline-danger"
                                      size="sm"
                                      onClick={(e) => handleDelete(e, p.numero)}
                                      title="Excluir"
                                    >
                                       <IconifyIcon icon="ri:delete-bin-line" />
                                     </Button>
                                  )}
                              </>
                            )}
                           </div>
                         </td>
                       </tr>
                      )
                    })
                   ) : (
                     <tr>
                       <td colSpan={7 + extraColumnCount} className="text-center text-muted py-4">Nenhum {entity === 'proposta' ? 'proposta' : 'pedido'} encontrado com os filtros atuais</td>
                     </tr>
                   )}
                 </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4 + extraColumnCount} className="text-end fw-semibold">
                      Total dos pedidos filtrados
                    </td>
                    <td className="fw-semibold">
                      {totalValorExibido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
               </Table>
             </div>
           </Card.Body>
         </Card>
       </section>

      <Modal show={shareModalVisible} onHide={closeShareModal} centered>
        <Modal.Header closeButton>
          <Modal.Title>Compartilhar pedido</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {shareTarget && (
            <>
              <p className="mb-1">
                Enviar pedido <strong>#{shareTarget.numero}</strong> — {shareTarget.cliente}
              </p>
              <div className="small text-muted mb-3">
                Total:{' '}
                <strong>
                  {shareTarget.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </strong>
              </div>
              <Form.Group className="mb-3">
                <Form.Label>Email do destinatário</Form.Label>
                <Form.Control
                  type="email"
                  value={shareEmailInput}
                  onChange={(e) => setShareEmailInput(e.target.value)}
                  placeholder="cliente@empresa.com"
                />
              </Form.Group>
              {shareModalError && <div className="alert alert-danger">{shareModalError}</div>}
              <div className="small text-muted">Será enviado um PDF com os detalhes do pedido.</div>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeShareModal} disabled={shareSending}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleShareSend}
            disabled={shareSending || !shareEmailInput.trim()}
          >
            {shareSending ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Enviando...
              </>
            ) : (
              'Enviar por email'
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showEvolveModal} onHide={() => setShowEvolveModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Evoluir proposta</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>Deseja evoluir proposta comercial para pedido?</p>
          {evolveItem && (
            <div className="small text-muted">N° {evolveItem.numero} — {evolveItem.cliente}</div>
          )}
          {evolveError && <div className="text-danger mt-2">{evolveError}</div>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowEvolveModal(false)}>Cancelar</Button>
          <Button variant="primary" onClick={confirmEvolve} disabled={isEvolving}>
            {isEvolving ? (<><Spinner animation="border" size="sm" className="me-2" />Processando</>) : 'Confirmar'}
          </Button>
        </Modal.Footer>
      </Modal>
     </>
  );
}
