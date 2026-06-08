 "use client";
 
import { useEffect, useMemo, useState } from 'react'

function formatEmpresaCnpj(cnpj: string) {
  const digits = String(cnpj || '').replace(/\D/g, '')
  if (digits.length !== 14) return cnpj
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

type EmpresaOption = { id: string; nome: string; cnpj: string }
import { Card, Form, Table, Badge, Row, Col, Button, Modal, Spinner } from "react-bootstrap";
 import PageTitle from '@/components/PageTitle'
import { Pedido, PedidoStatus } from '@/services/pedidos2'
import IconifyIcon from '@/components/wrappers/IconifyIcon'
import {
  fetchComercialPedidosLista,
  getComercialOrcamentos,
  getComercialPedidoByNumero,
  saveComercialPedido,
} from '@/services/comercialPedidos'
 import { useRouter } from 'next/navigation'
 import { useNotificationContext } from '@/context/useNotificationContext'
import useSWR from 'swr'

interface ComercialPedidosListaProps {
  entity: 'pedido' | 'orcamento'
  title?: string
  subName?: string
}
 
type SyncModalState =
  | null
  | { mode: 'confirm' }
  | { mode: 'syncing' }
  | { mode: 'result'; data: Record<string, unknown> }
  | { mode: 'import_confirm'; data: Record<string, unknown>; unmatched: string[] }
  | { mode: 'importing' }
  | { mode: 'import_done'; data: Record<string, unknown> }

export default function ComercialPedidosLista({ entity, title, subName }: ComercialPedidosListaProps) {
  const itemRouteBase = entity === 'orcamento' ? '/comercial/orcamentos' : '/comercial/pedidos'
  const newPath = `${itemRouteBase}/0`
   const router = useRouter()
   const { showNotification } = useNotificationContext()
   const [itemsProposta, setItemsProposta] = useState<Pedido[]>([])
  const [pdfLoadingPedidoNumero, setPdfLoadingPedidoNumero] = useState<number | null>(null)
  /** `${numeroPedido}:${idNotaFiscal}` enquanto baixa PDF da NF (link Tiny) */
  const [nfPdfLoadingKey, setNfPdfLoadingKey] = useState<string | null>(null)
  const [syncModal, setSyncModal] = useState<SyncModalState>(null)
  const [deleteModal, setDeleteModal] = useState<{ mode: 'pedido' | 'orcamento'; numero: number } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const loadItems = async () => {
    const rows = await getComercialOrcamentos()
    setItemsProposta(rows)
  }
 
   useEffect(() => {
    if (entity === 'pedido') return
     (async () => {
      await loadItems()
     })()
  }, [entity])
 
   const [termoBusca, setTermoBusca] = useState("");
  const [termoBuscaDebounced, setTermoBuscaDebounced] = useState("")
   const [statusFiltro, setStatusFiltro] = useState("");
   const [dataInicio, setDataInicio] = useState("");
   const [dataFim, setDataFim] = useState("");
  const [paginaAtual, setPaginaAtual] = useState(1)
  const [itensPorPagina, setItensPorPagina] = useState(20)
  const [sortBy, setSortBy] = useState<'numero' | 'data' | 'cliente'>('numero')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [isAdmin, setIsAdmin] = useState(false)
  const [isSupervisor, setIsSupervisor] = useState(false)
  const [meVendedorExterno, setMeVendedorExterno] = useState('')
  const [meVendedorNome, setMeVendedorNome] = useState('')
  const [vendedorFiltro, setVendedorFiltro] = useState('')
  const [vendedoresOptions, setVendedoresOptions] = useState<Array<{ id_vendedor_externo: string; nome: string }>>([])
  /** Lista completa de vendedores (admin) para restaurar o filtro ao limpar “Supervisão”. */
  const [adminVendedoresFull, setAdminVendedoresFull] = useState<Array<{ id_vendedor_externo: string; nome: string }>>([])
  const [supervisorFiltroExterno, setSupervisorFiltroExterno] = useState('')
  const [supervisoresRows, setSupervisoresRows] = useState<
    Array<{ id: number; id_vendedor_externo: string | null; nome: string | null; supervised?: { vendedor_externo: string; nome: string | null }[] }>
  >([])
  const [empresas, setEmpresas] = useState<EmpresaOption[]>([])
  const [empresaFiltro, setEmpresaFiltro] = useState('')

  useEffect(() => {
    const ac = new AbortController()
    ;(async () => {
      try {
        const res = await fetch('/api/comercial/empresas', { signal: ac.signal })
        const json = await res.json().catch(() => null)
        if (res.ok && json?.ok && Array.isArray(json.data)) setEmpresas(json.data)
      } catch {
        /* ignore */
      }
    })()
    return () => ac.abort()
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setTermoBuscaDebounced(termoBusca), 350)
    return () => clearTimeout(t)
  }, [termoBusca])

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
    if (!canUseVendorFilter || entity !== 'pedido') {
      setAdminVendedoresFull([])
      return
    }
    const controller = new AbortController()
    ;(async () => {
      try {
        if (isSupervisor && meVendedorExterno) {
          setAdminVendedoresFull([])
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
        setAdminVendedoresFull(mapped)
      } catch {
        setVendedoresOptions([])
        setAdminVendedoresFull([])
      }
    })()
    return () => controller.abort()
  }, [entity, isAdmin, isSupervisor, meVendedorExterno, meVendedorNome])

  useEffect(() => {
    if (!isAdmin || entity !== 'pedido') {
      setSupervisoresRows([])
      return
    }
    const ac = new AbortController()
    ;(async () => {
      try {
        const res = await fetch('/api/supervisores', { signal: ac.signal })
        const json = await res.json().catch(() => null)
        if (!res.ok || !json?.ok) {
          setSupervisoresRows([])
          return
        }
        setSupervisoresRows(Array.isArray(json.data) ? json.data : [])
      } catch {
        setSupervisoresRows([])
      }
    })()
    return () => ac.abort()
  }, [isAdmin, entity])

  /** Com “Supervisão” ativa, o filtro “Vendedor” lista só o supervisor e os representantes vinculados. */
  useEffect(() => {
    if (!isAdmin || entity !== 'pedido') return
    if (!supervisorFiltroExterno) {
      if (adminVendedoresFull.length > 0) setVendedoresOptions(adminVendedoresFull)
      return
    }
    const row = supervisoresRows.find((s) => String(s?.id_vendedor_externo || '') === supervisorFiltroExterno)
    if (!row?.id_vendedor_externo) return
    const extNome = new Map(adminVendedoresFull.map((v) => [v.id_vendedor_externo, v.nome]))
    const supExt = String(row.id_vendedor_externo)
    const team: { id_vendedor_externo: string; nome: string }[] = [
      {
        id_vendedor_externo: supExt,
        nome: String(row.nome || extNome.get(supExt) || supExt),
      },
      ...(Array.isArray(row.supervised) ? row.supervised : []).map((v) => {
        const ext = String(v?.vendedor_externo || '')
        return {
          id_vendedor_externo: ext,
          nome: String(v?.nome || extNome.get(ext) || ext),
        }
      }),
    ].filter((t) => t.id_vendedor_externo)
    setVendedoresOptions(Array.from(new Map(team.map((t) => [t.id_vendedor_externo, t])).values()))
  }, [isAdmin, entity, supervisorFiltroExterno, supervisoresRows, adminVendedoresFull])

  const pedidosListaUrl = useMemo(() => {
    if (entity !== 'pedido') return null
    const qs = new URLSearchParams()
    qs.set('limit', String(itensPorPagina))
    qs.set('offset', String((paginaAtual - 1) * itensPorPagina))
    if (termoBuscaDebounced.trim()) qs.set('search', termoBuscaDebounced.trim())
    if (statusFiltro) qs.set('status', statusFiltro)
    if (vendedorFiltro) qs.set('vendedor', vendedorFiltro)
    if (isAdmin && supervisorFiltroExterno) qs.set('supervisor_externo', supervisorFiltroExterno)
    if (dataInicio) qs.set('dataInicio', dataInicio)
    if (dataFim) qs.set('dataFim', dataFim)
    if (empresaFiltro) qs.set('company_id', empresaFiltro)
    qs.set('sortBy', sortBy)
    qs.set('sortDir', sortDir)
    return `/api/comercial/pedidos?${qs.toString()}`
  }, [
    entity,
    paginaAtual,
    itensPorPagina,
    termoBuscaDebounced,
    statusFiltro,
    vendedorFiltro,
    supervisorFiltroExterno,
    isAdmin,
    dataInicio,
    dataFim,
    empresaFiltro,
    sortBy,
    sortDir,
  ])

  const {
    data: pedidosListaData,
    error: pedidosListaError,
    isValidating: pedidosListaValidating,
    mutate: mutatePedidosLista,
  } = useSWR(entity === 'pedido' ? pedidosListaUrl : null, fetchComercialPedidosLista, {
    revalidateOnFocus: true,
    dedupingInterval: 3000,
  })

  useEffect(() => {
    if (entity !== 'pedido' || !pedidosListaError) return
    console.error('Erro ao listar pedidos paginados', pedidosListaError)
  }, [entity, pedidosListaError])

  const totalPedidosApi = entity === 'pedido' ? Number(pedidosListaData?.paginacao?.total ?? 0) : 0
  const totalValorFiltradoApi = entity === 'pedido' ? Number(pedidosListaData?.paginacao?.total_valor ?? 0) : 0

  const listaItens: Pedido[] =
    entity === 'pedido' ? (pedidosListaData?.data ?? []) : itemsProposta
 
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
 
  const itensFiltrados = listaItens.filter((p) => {
     const termo = termoBusca.trim().toLowerCase();
     const atendeBusca = !termo
       || String(p.numero).includes(termo)
       || p.cliente.toLowerCase().includes(termo)
       || p.cnpj.toLowerCase().includes(termo)
       || (p.order_vendor_nome && p.order_vendor_nome.toLowerCase().includes(termo))
       || (p.order_vendor_externo && String(p.order_vendor_externo).toLowerCase().includes(termo));
     const atendeStatus = !statusFiltro || p.status === statusFiltro;
     const atendePeriodo = dentroDoPeriodo(p.data);
     const atendeEmpresa = !empresaFiltro || String(p.company_id || '') === empresaFiltro;
     return atendeBusca && atendeStatus && atendePeriodo && atendeEmpresa;
   });

  const itensOrdenados = [...itensFiltrados].sort((a, b) => {
    let cmp = 0
    if (sortBy === 'numero') cmp = Number(a.numero) - Number(b.numero)
    else if (sortBy === 'data') cmp = new Date(a.data).getTime() - new Date(b.data).getTime()
    else cmp = String(a.cliente || '').localeCompare(String(b.cliente || ''), 'pt-BR', { sensitivity: 'base' })
    return sortDir === 'asc' ? cmp : -cmp
  })

  const totalBase = entity === 'pedido' ? totalPedidosApi : itensOrdenados.length
  const totalPaginas = Math.max(1, Math.ceil(totalBase / itensPorPagina))
  const totalValorExibido = useMemo(
    () =>
      entity === 'pedido' && !isAdmin
        ? itensOrdenados.reduce((acc, p) => acc + (p.total || 0), 0)
        : totalValorFiltradoApi,
    [entity, isAdmin, itensOrdenados, totalValorFiltradoApi],
  )
  const paginaSegura = Math.min(paginaAtual, totalPaginas)
  const inicio = (paginaSegura - 1) * itensPorPagina
  const fim = inicio + itensPorPagina
  const itensPaginados = entity === 'pedido' ? itensOrdenados : itensOrdenados.slice(inicio, fim)

  useEffect(() => {
    setPaginaAtual(1)
  }, [termoBuscaDebounced, statusFiltro, vendedorFiltro, supervisorFiltroExterno, dataInicio, dataFim, empresaFiltro, itensPorPagina, sortBy, sortDir])

  useEffect(() => {
    if (paginaAtual > totalPaginas) setPaginaAtual(totalPaginas)
  }, [paginaAtual, totalPaginas])
 
  const labelPlural = entity === 'orcamento' ? 'Orçamentos' : 'Pedidos'
  const computeItemUrl = (numero: number) => `${itemRouteBase}/${numero}`

  const handleDownloadPedidoPdf = async (e: React.MouseEvent, numero: number) => {
    e.stopPropagation()
    setPdfLoadingPedidoNumero(numero)
    try {
      const qs = entity === 'orcamento' ? '?entity=proposta' : ''
      const res = await fetch(`/api/pedidos/${numero}/pdf${qs}`)
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error((json && typeof json?.error === 'string' && json.error) || 'Falha ao gerar o PDF')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = entity === 'orcamento' ? `proposta-${numero}.pdf` : `pedido-${numero}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      showNotification({
        message: `PDF do ${entity === 'orcamento' ? 'proposta' : 'pedido'} #${numero} baixado.`,
        variant: 'success',
        delay: 4500,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Não foi possível baixar o PDF'
      showNotification({
        message: msg,
        variant: 'danger',
        delay: 7000,
      })
    } finally {
      setPdfLoadingPedidoNumero(null)
    }
  }

  const handleDownloadNotaFiscalPdf = async (e: React.MouseEvent, p: Pedido) => {
    e.stopPropagation()
    const idNota = p.id_nota_fiscal != null ? String(p.id_nota_fiscal).trim() : ''
    if (!idNota) return
    const loadKey = `${p.numero}:${idNota}`
    setNfPdfLoadingKey(loadKey)
    try {
      const res = await fetch(`/api/pedidos/nota-fiscal-pdf?id=${encodeURIComponent(idNota)}`)
      if (!res.ok) {
        const json = await res.json().catch(() => null)
        throw new Error((json && typeof json?.error === 'string' && json.error) || 'Falha ao baixar a nota fiscal')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const cd = res.headers.get('Content-Disposition')
      const m = cd && /filename="([^"]+)"/.exec(cd)
      a.download = m?.[1] || `danfe-nfe-${p.numero}-${idNota}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      showNotification({
        message: `PDF da nota fiscal baixado (pedido #${p.numero}).`,
        variant: 'success',
        delay: 4500,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Não foi possível baixar o PDF da nota fiscal'
      showNotification({
        message: msg,
        variant: 'danger',
        delay: 7000,
      })
    } finally {
      setNfPdfLoadingKey(null)
    }
  }

  const openDeleteModal = (e: React.MouseEvent, numero: number) => {
    e.stopPropagation()
    setDeleteModal({ mode: entity === 'orcamento' ? 'orcamento' : 'pedido', numero })
  }

  const closeDeleteModal = () => {
    if (deleteBusy) return
    setDeleteModal(null)
  }

  const confirmDelete = async () => {
    if (!deleteModal) return
    setDeleteBusy(true)
    const { mode, numero } = deleteModal
    try {
      if (mode === 'orcamento') {
        const res = await fetch(`/api/comercial/orcamentos?id=${numero}`, { method: 'DELETE' })
        const json = await res.json()
        if (!res.ok || !json?.ok) throw new Error(json?.error || 'Falha ao excluir orçamento')
        setItemsProposta((arr) => arr.filter((it) => it.numero !== numero))
        showNotification({
          message: `Orçamento #${numero} removido.`,
          variant: 'success',
          delay: 4500,
        })
      } else {
        const res = await fetch(`/api/comercial/pedidos/${numero}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'cancel' }),
        })
        const json = await res.json().catch(() => null)
        if (!res.ok || !json?.ok) throw new Error(json?.error || 'Falha ao cancelar pedido')
        await mutatePedidosLista()
        const tinyErr = json?.tinyError ? String(json.tinyError) : ''
        if (tinyErr) {
          showNotification({
            message: `Pedido #${numero} cancelado no SAMA. Aviso do Tiny: ${tinyErr}`,
            variant: 'warning',
            delay: 9000,
          })
        } else {
          showNotification({
            message: `Pedido #${numero} cancelado.`,
            variant: 'success',
            delay: 4500,
          })
        }
      }
      setDeleteModal(null)
    } catch (err: any) {
      showNotification({
        message: err?.message || 'Erro ao excluir',
        variant: 'danger',
        delay: 6000,
      })
    } finally {
      setDeleteBusy(false)
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
      const full = await getComercialPedidoByNumero(evolveItem.numero, 'orcamento')
      if (!full) {
        setEvolveError(
          'Não foi possível carregar os dados completos do orçamento. Abra o orçamento na tela de edição e tente novamente.'
        )
        return
      }
      const res = await saveComercialPedido({
        ...full,
        forma_recebimento: full.forma_recebimento ?? evolveItem.forma_recebimento ?? null,
        condicao_pagamento: full.condicao_pagamento ?? evolveItem.condicao_pagamento ?? null,
        juros_ligado: full.juros_ligado ?? evolveItem.juros_ligado ?? true,
        status: 'Pendente',
      })
      const numero = (res as Pedido)?.numero ?? (res as { numero?: number })?.numero
      if (numero) {
        setItemsProposta((arr) => arr.filter((it) => it.numero !== evolveItem.numero))
        setShowEvolveModal(false)
        router.push('/comercial/pedidos')
      } else {
        setEvolveError('O orçamento não foi transformado em pedido.')
      }
    } catch (err: any) {
      setEvolveError(err?.message || 'Falha ao evoluir orçamento')
    } finally {
      setIsEvolving(false)
    }
  }

  const syncBusy = syncModal?.mode === 'syncing' || syncModal?.mode === 'importing'

  const openSyncModal = () => {
    if (entity !== 'pedido') return
    setSyncModal({ mode: 'confirm' })
  }

  const closeSyncModal = () => {
    setSyncModal(null)
  }

  const runSyncPedidos = async () => {
    if (entity !== 'pedido') return
    setSyncModal({ mode: 'syncing' })
    try {
      const res = await fetch('/api/pedidos/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        console.error('Erro ao sincronizar pedidos', { status: res.status, response: json })
        setSyncModal({ mode: 'result', data: { ok: false, error: json?.error || 'Falha ao sincronizar pedidos' } })
        return
      }
      await mutatePedidosLista()
      const unmatched = Array.isArray(json?.unmatchedClienteNomes) ? (json.unmatchedClienteNomes as string[]) : []
      if (unmatched.length > 0) {
        setSyncModal({ mode: 'import_confirm', data: json as Record<string, unknown>, unmatched })
      } else {
        setSyncModal({ mode: 'result', data: json as Record<string, unknown> })
      }
    } catch (err: any) {
      console.error('Falha na sincronização de pedidos', err)
      setSyncModal({ mode: 'result', data: { ok: false, error: err?.message || String(err) } })
    }
  }

  const runImportUnmatchedClients = async () => {
    if (syncModal?.mode !== 'import_confirm') return
    const nomes = syncModal.unmatched
    setSyncModal({ mode: 'importing' })
    try {
      const res = await fetch('/api/pedidos/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'importClients', nomes }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok) {
        setSyncModal({
          mode: 'import_done',
          data: { ok: false, error: json?.error || 'Falha ao importar clientes' },
        })
        return
      }
      setSyncModal({ mode: 'import_done', data: json as Record<string, unknown> })
      await mutatePedidosLista()
    } catch (err: any) {
      setSyncModal({ mode: 'import_done', data: { ok: false, error: err?.message || String(err) } })
    }
  }

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
        title={title ?? (entity === 'orcamento' ? 'Orçamentos' : 'Pedidos de Venda')}
        subName={subName ?? 'Comercial'}
        compactRight
        actions={
          <div className="d-flex align-items-center gap-2">
            {/* Botão “Sincronizar Pedidos” (Tiny) — temporariamente desativado
            {entity === 'pedido' && (
              <>
                <Button size="sm" variant="outline-primary" onClick={openSyncModal} disabled={syncBusy}>
                  {syncBusy ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-2" />
                      Aguarde…
                    </>
                  ) : (
                    'Sincronizar Pedidos'
                  )}
                </Button>
              </>
            )}
            */}
            <Button size="sm" onClick={() => router.push(newPath)}>
              Novo {entity === 'orcamento' ? 'Orçamento' : 'Pedido'}
            </Button>
          </div>
        }
      />

      <section className="filtros pt-1 pb-2">
         <Card className="border-0 shadow-sm">
           <Card.Body>
             <Row className="g-3 align-items-end">
              <Col lg={3} md={6}>
                 <Form.Label>{entity === 'orcamento' ? 'Filtrar orçamentos' : 'Filtrar pedidos'}</Form.Label>
                 <Form.Control
                   type="text"
                   placeholder="Buscar por N°, Cliente ou CNPJ"
                   value={termoBusca}
                   onChange={(e) => setTermoBusca(e.target.value)}
                 />
               </Col>
              <Col lg={3} md={6}>
                <Form.Label>Empresa</Form.Label>
                <Form.Select value={empresaFiltro} onChange={(e) => setEmpresaFiltro(e.target.value)}>
                  <option value="">Todas</option>
                  {empresas.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nome} — CNPJ {formatEmpresaCnpj(emp.cnpj)}
                    </option>
                  ))}
                </Form.Select>
              </Col>
              {isAdmin && entity === 'pedido' && (
                <Col lg={2} md={6}>
                  <Form.Label>Supervisão</Form.Label>
                  <Form.Select
                    value={supervisorFiltroExterno}
                    onChange={(e) => {
                      setSupervisorFiltroExterno(e.target.value)
                      setVendedorFiltro('')
                    }}
                  >
                    <option value="">Todos</option>
                    {supervisoresRows.map((s) => {
                      const ext = String(s.id_vendedor_externo || '')
                      if (!ext) return null
                      return (
                        <option key={s.id} value={ext}>
                          {String(s.nome || ext)}
                        </option>
                      )
                    })}
                  </Form.Select>
                </Col>
              )}
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
                   onChange={(e) => setDataFim(e.target.value)}
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
         <Card
           className={`border-0 shadow-sm${entity === 'pedido' && pedidosListaValidating && pedidosListaData ? ' opacity-75' : ''}`}
           style={entity === 'pedido' && pedidosListaValidating && pedidosListaData ? { transition: 'opacity 0.15s ease' } : undefined}
         >
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
                    {entity === 'pedido' && <th>Representante</th>}
                    <th>CNPJ</th>
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
                      const canTrashPedido =
                        entity === 'pedido' &&
                        (isAdmin || isSupervisor) &&
                        p.status !== 'Cancelado'
                      /** DELETE /api/propostas: admin ou dono (`id_vendedor_externo`). Lista já filtra por mim quando não sou admin. */
                      const canTrashProposta =
                        entity === 'orcamento' &&
                        (isAdmin ||
                          (Boolean(meVendedorExterno) &&
                            String(p.id_vendedor_externo ?? '') === String(meVendedorExterno)))
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
                         {entity === 'pedido' && (
                           <td>{p.order_vendor_nome || p.order_vendor_externo || '—'}</td>
                         )}
                         <td>{p.cnpj}</td>
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
                              <>
                                <Button
                                  variant="outline-warning"
                                  size="sm"
                                  onClick={(e) => e.stopPropagation()}
                                  title="Pedido vindo do Tiny"
                                  style={{ backgroundColor: '#fff', whiteSpace: 'nowrap' }}
                                >
                                  Origem: Tiny
                                </Button>
                                {entity === 'pedido' &&
                                  p.id_nota_fiscal &&
                                  String(p.id_nota_fiscal).trim() !== '' && (
                                    <Button
                                      variant="outline-secondary"
                                      size="sm"
                                      className="p-1 lh-1"
                                      title="Baixar PDF da nota fiscal (Tiny)"
                                      disabled={nfPdfLoadingKey === `${p.numero}:${String(p.id_nota_fiscal).trim()}`}
                                      onClick={(e) => handleDownloadNotaFiscalPdf(e, p)}
                                    >
                                      {nfPdfLoadingKey === `${p.numero}:${String(p.id_nota_fiscal).trim()}` ? (
                                        <Spinner animation="border" size="sm" />
                                      ) : (
                                        <IconifyIcon icon="ri:file-pdf-2-line" />
                                      )}
                                    </Button>
                                  )}
                                <Button
                                  variant="outline-secondary"
                                  size="sm"
                                  disabled={pdfLoadingPedidoNumero === p.numero}
                                  onClick={(e) => handleDownloadPedidoPdf(e, p.numero)}
                                  title="Baixar PDF do pedido (ordem de compra)"
                                >
                                  {pdfLoadingPedidoNumero === p.numero ? (
                                    <Spinner animation="border" size="sm" />
                                  ) : (
                                    <IconifyIcon icon="ri:download-line" />
                                  )}
                                </Button>
                                {canTrashPedido && (
                                  <Button
                                    variant="outline-danger"
                                    size="sm"
                                    onClick={(e) => openDeleteModal(e, p.numero)}
                                    title="Cancelar pedido"
                                  >
                                    <IconifyIcon icon="ri:delete-bin-line" />
                                  </Button>
                                )}
                              </>
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
                                 {entity === 'orcamento' && (
                                   <Button
                                     variant="outline-success"
                                     size="sm"
                                     onClick={(e) => openEvolve(e, p)}
                                     title="Evoluir para pedido"
                                   >
                                     <IconifyIcon icon="ri:money-dollar-circle-line" />
                                   </Button>
                                 )}
                                  {canTrashProposta && (
                                    <Button
                                      variant="outline-danger"
                                      size="sm"
                                      onClick={(e) => openDeleteModal(e, p.numero)}
                                      title="Excluir orçamento"
                                    >
                                      <IconifyIcon icon="ri:delete-bin-line" />
                                    </Button>
                                  )}
                                  {canTrashPedido && (
                                    <Button
                                      variant="outline-danger"
                                      size="sm"
                                      onClick={(e) => openDeleteModal(e, p.numero)}
                                      title="Cancelar pedido"
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
                       <td colSpan={entity === 'pedido' ? 8 : 7} className="text-center text-muted py-4">Nenhum {entity === 'orcamento' ? 'orçamento' : 'pedido'} encontrado com os filtros atuais</td>
                     </tr>
                   )}
                 </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={entity === 'pedido' ? 5 : 4} className="text-end fw-semibold">
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

      <Modal
        show={syncModal != null}
        onHide={() => {
          if (syncModal?.mode === 'syncing' || syncModal?.mode === 'importing') return
          closeSyncModal()
        }}
        centered
        backdrop={syncModal?.mode === 'syncing' || syncModal?.mode === 'importing' ? 'static' : true}
      >
        <Modal.Header closeButton={syncModal?.mode !== 'syncing' && syncModal?.mode !== 'importing'}>
          <Modal.Title>
            {syncModal?.mode === 'confirm' && 'Sincronizar pedidos'}
            {syncModal?.mode === 'syncing' && 'Sincronizando…'}
            {syncModal?.mode === 'result' && 'Resultado da sincronização'}
            {syncModal?.mode === 'import_confirm' && 'Clientes não encontrados'}
            {syncModal?.mode === 'importing' && 'Importando clientes…'}
            {syncModal?.mode === 'import_done' && 'Resultado da importação'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {syncModal?.mode === 'confirm' && (
            <p className="mb-0">
              Esta ação <strong>exclui e reimporta</strong> todos os pedidos locais a partir do Tiny. Pedidos são
              vinculados a clientes da base por CNPJ, ID do Tiny e <strong>nome da empresa</strong> quando houver
              correspondência.
            </p>
          )}
          {syncModal?.mode === 'syncing' && (
            <div className="d-flex align-items-center gap-3 py-2">
              <Spinner animation="border" />
              <span>Buscando pedidos no Tiny e gravando na plataforma…</span>
            </div>
          )}
          {syncModal?.mode === 'result' && (
            <div>
              {syncModal.data.ok === false ? (
                <div className="text-danger">{String(syncModal.data.error || 'Erro desconhecido')}</div>
              ) : (
                <>
                  <p className="mb-2">
                    Foram recebidos <strong>{Number(syncModal.data.totalRecebido ?? 0)}</strong> pedidos do Tiny e
                    gravados <strong>{Number(syncModal.data.imported ?? 0)}</strong> na base local.
                  </p>
                  <p className="mb-0 text-muted small">
                    Com cliente local (carteira): <strong>{Number(syncModal.data.comClienteLocal ?? 0)}</strong>
                    {syncModal.data.pedidosEnriquecidosObter != null ? (
                      <> · Consultas detalhadas (obter pedido): {Number(syncModal.data.pedidosEnriquecidosObter)}</>
                    ) : null}
                  </p>
                </>
              )}
            </div>
          )}
          {syncModal?.mode === 'import_confirm' && (
            <div>
              <p className="mb-2">
                A sincronização terminou, mas estes <strong>clientes</strong> dos pedidos não bateram com ninguém na
                base local. Deseja <strong>buscar no Tiny</strong> (contatos), importar/atualizar o cadastro e{' '}
                <strong>vincular de novo</strong> os pedidos que ficaram sem cliente?
              </p>
              <div
                className="border rounded p-2 mb-3 bg-light"
                style={{ maxHeight: 220, overflowY: 'auto', fontSize: '0.9rem' }}
              >
                <ul className="mb-0 ps-3">
                  {syncModal.unmatched.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
              <p className="small text-muted mb-2">
                Resumo da última etapa: {Number(syncModal.data.imported ?? 0)} pedidos gravados;{' '}
                {Number(syncModal.data.comClienteLocal ?? 0)} já com vínculo local.
              </p>
              {Array.isArray(syncModal.data.pedidosSemClienteVinculo) &&
                (syncModal.data.pedidosSemClienteVinculo as { numero: number; tiny_id: number | null; cliente: string }[])
                  .length > 0 && (
                  <div>
                    <p className="small fw-semibold mb-1">
                      Pedidos sem cliente vinculado — <code className="small">tiny_id</code> é o parâmetro{' '}
                      <code className="small">id</code> do <code className="small">pedido.obter</code>:
                    </p>
                    <div
                      className="border rounded p-2 bg-white"
                      style={{ maxHeight: 200, overflowY: 'auto', fontSize: '0.85rem' }}
                    >
                      <ul className="mb-0 ps-3">
                        {(syncModal.data.pedidosSemClienteVinculo as { numero: number; tiny_id: number | null; cliente: string }[]).map(
                          (p) => (
                            <li key={p.numero}>
                              <code>{p.tiny_id != null && Number(p.tiny_id) > 0 ? p.tiny_id : '—'}</code>
                              {' · nº '}
                              <strong>{p.numero}</strong>
                              {' · '}
                              {String(p.cliente || '')}
                            </li>
                          )
                        )}
                      </ul>
                    </div>
                  </div>
                )}
            </div>
          )}
          {syncModal?.mode === 'importing' && (
            <div className="d-flex align-items-center gap-3 py-2">
              <Spinner animation="border" />
              <span>Consultando Tiny, gravando contatos e atualizando pedidos…</span>
            </div>
          )}
          {syncModal?.mode === 'import_done' && (
            <div>
              {syncModal.data.ok === false ? (
                <div className="text-danger">{String(syncModal.data.error || 'Erro')}</div>
              ) : (
                <>
                  <p className="mb-2">
                    Contatos importados ou atualizados: <strong>{Number(syncModal.data.importedOrUpdated ?? 0)}</strong>
                    . Pedidos reassociados por nome: <strong>{Number(syncModal.data.relinkedPedidos ?? 0)}</strong>
                    {'. '}
                    Pelo <code className="small">contatos.pesquisa</code> (nome/CNPJ):{' '}
                    <strong>
                      {Number(
                        syncModal.data.relinkedViaContatosPesquisa ?? syncModal.data.relinkedViaPedidoObter ?? 0
                      )}
                    </strong>{' '}
                    pedido(s) reassociado(s).
                  </p>
                  {Array.isArray(syncModal.data.failedNomes) && (syncModal.data.failedNomes as string[]).length > 0 && (
                    <p className="small text-warning mb-2">
                      Sem resultado na busca Tiny: {(syncModal.data.failedNomes as string[]).join('; ')}
                    </p>
                  )}
                  {Array.isArray(syncModal.data.stillUnmatched) && (syncModal.data.stillUnmatched as string[]).length > 0 && (
                    <p className="small text-muted mb-2">
                      Ainda sem vínculo (nomes distintos na base): {(syncModal.data.stillUnmatched as string[]).slice(0, 12).join('; ')}
                      {(syncModal.data.stillUnmatched as string[]).length > 12 ? '…' : ''}
                    </p>
                  )}
                  {Array.isArray(syncModal.data.pedidosSemClienteVinculo) &&
                    (syncModal.data.pedidosSemClienteVinculo as { numero: number; tiny_id: number | null; cliente: string }[])
                      .length > 0 && (
                      <div>
                        <p className="small fw-semibold mb-1">
                          Pedidos ainda sem cliente — <code className="small">tiny_id</code> = parâmetro{' '}
                          <code className="small">id</code> do <code className="small">pedido.obter</code>:
                        </p>
                        <div
                          className="border rounded p-2 bg-light"
                          style={{ maxHeight: 220, overflowY: 'auto', fontSize: '0.85rem' }}
                        >
                          <ul className="mb-0 ps-3">
                            {(
                              syncModal.data.pedidosSemClienteVinculo as {
                                numero: number
                                tiny_id: number | null
                                cliente: string
                              }[]
                            ).map((p) => (
                              <li key={p.numero}>
                                <code>{p.tiny_id != null && Number(p.tiny_id) > 0 ? p.tiny_id : '—'}</code>
                                {' · nº '}
                                <strong>{p.numero}</strong>
                                {' · '}
                                {String(p.cliente || '')}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                </>
              )}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          {syncModal?.mode === 'confirm' && (
            <>
              <Button variant="secondary" onClick={closeSyncModal}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={runSyncPedidos}>
                Continuar
              </Button>
            </>
          )}
          {syncModal?.mode === 'result' && (
            <Button variant="primary" onClick={closeSyncModal}>
              OK
            </Button>
          )}
          {syncModal?.mode === 'import_confirm' && (
            <>
              <Button variant="secondary" onClick={closeSyncModal}>
                Não importar
              </Button>
              <Button variant="primary" onClick={runImportUnmatchedClients}>
                Importar do Tiny e vincular
              </Button>
            </>
          )}
          {syncModal?.mode === 'import_done' && (
            <Button variant="primary" onClick={closeSyncModal}>
              OK
            </Button>
          )}
        </Modal.Footer>
      </Modal>

      <Modal show={deleteModal != null} onHide={closeDeleteModal} centered backdrop={deleteBusy ? 'static' : true}>
        <Modal.Header closeButton={!deleteBusy}>
          <Modal.Title>
            {deleteModal?.mode === 'orcamento' ? 'Excluir orçamento' : 'Cancelar pedido'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {!deleteModal ? null : deleteModal.mode === 'orcamento' ? (
            <p className="mb-0">
              Confirma a exclusão do orçamento <strong>#{deleteModal.numero}</strong>? Esta ação não pode ser desfeita.
            </p>
          ) : (
            <p className="mb-0">
              O pedido <strong>#{deleteModal.numero}</strong> será marcado como <strong>Cancelado</strong>. Deseja continuar?
            </p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeDeleteModal} disabled={deleteBusy}>
            Voltar
          </Button>
          <Button variant="danger" onClick={confirmDelete} disabled={deleteBusy}>
            {deleteBusy ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Processando…
              </>
            ) : deleteModal?.mode === 'orcamento' ? (
              'Excluir'
            ) : (
              'Confirmar cancelamento'
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showEvolveModal} onHide={() => setShowEvolveModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Evoluir orçamento</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>Deseja evoluir este orçamento para pedido de venda comercial?</p>
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
