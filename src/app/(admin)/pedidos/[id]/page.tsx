"use client";

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import PageTitle from '@/components/PageTitle'
import { Card, Row, Col, Form, Button, Table, Modal, Spinner, OverlayTrigger, Tooltip } from 'react-bootstrap'
import { getPedidoByNumero, Pedido, PedidoStatus, getNextPedidoNumero, savePedido as savePedidoRemote } from '@/services/pedidos2'
import { createProposta, updateProposta } from '@/services/propostas'
import IconifyIcon from '@/components/wrappers/IconifyIcon'
import {
  formatPaymentConditionSelectValue,
  parsePaymentConditionSelectValue,
  resolvePaymentCondition,
  tierToMarkupDecimal,
  PAYMENT_ADMIN_TIER_LABELS,
  PAYMENT_ADMIN_TIER_ORDER,
  type PaymentConditionRow,
} from '@/lib/paymentConditions'
import {
  formatLocalDateYmd,
  parseYmdToLocalDate,
  todayCalendarYmdLocal,
} from '@/lib/calendarDate'

const requestCache = new Map<string, { ts: number; data: any }>()
const requestInFlight = new Map<string, Promise<any>>()

async function fetchJsonCached(url: string, ttlMs = 4000) {
  const now = Date.now()
  const cached = requestCache.get(url)
  if (cached && now - cached.ts < ttlMs) return cached.data

  const inFlight = requestInFlight.get(url)
  if (inFlight) return inFlight

  const p = (async () => {
    const res = await fetch(url)
    const json = await res.json().catch(() => null)
    requestCache.set(url, { ts: Date.now(), data: json })
    return json
  })()

  requestInFlight.set(url, p)
  try {
    return await p
  } finally {
    requestInFlight.delete(url)
  }
}

export default function PedidoFormPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const entityParam = searchParams?.get('entity') ?? ''
  const idParam = useMemo(() => Number(params?.id ?? 0), [params])
  const isNew = idParam === 0

  const [form, setForm] = useState<Pedido>({
    numero: 0,
    data: todayCalendarYmdLocal(),
    cliente: '',
    cnpj: '',
    total: 0,
    status: entityParam === 'proposta' ? 'Proposta' : 'Pendente',
  })

  const [formaRecebimento, setFormaRecebimento] = useState('Boleto')
  const [condicaoPagamento, setCondicaoPagamento] = useState('')
  const [descontoPercent, setDescontoPercent] = useState<number>(0)
  const [receiveForms, setReceiveForms] = useState<Array<{ id: number; nome: string; situacao: number }>>([])

  type ItemPedido = { id: number; nome: string; sku?: string; quantidade: number; unidade: string; preco: number; estoque?: number; produtoId?: number; imagemUrl?: string }
  const [itens, setItens] = useState<ItemPedido[]>([])
  // Keep original unit price so we can reapply markups without compounding
  type ItemPedidoWithOriginal = ItemPedido & { originalPreco?: number }

  const [showPreview, setShowPreview] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(false)

  // Catálogo de produtos (listagem com rolagem e busca)
  type CatalogItem = { id: number; nome: string; codigo?: string; preco?: number; imagem?: string | null }
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogSelected, setCatalogSelected] = useState<CatalogItem | null>(null)
  const [showCatalogDetail, setShowCatalogDetail] = useState(false)
  const catalogDebounceRef = useRef<any>(null)
  const [catalogDetail, setCatalogDetail] = useState<{ nome?: string; codigo?: string; preco?: number; unidade?: string; imagem?: string | null; descricao?: string | null; estoque?: number | null } | null>(null)
  const [catalogDetailLoading, setCatalogDetailLoading] = useState(false)
  const [catalogDetailError, setCatalogDetailError] = useState<string | null>(null)
  const [showCatalogListModal, setShowCatalogListModal] = useState(false)
  const [showQtyModal, setShowQtyModal] = useState(false)
  const [qtyModalProduct, setQtyModalProduct] = useState<CatalogItem | null>(null)
  const [qtyModalValue, setQtyModalValue] = useState<number>(1)
  const [qtyModalStock, setQtyModalStock] = useState<number | null>(null)
  const [qtyModalLoading, setQtyModalLoading] = useState(false)
  const [qtyModalError, setQtyModalError] = useState<string | null>(null)
  const [catalogQtyError, setCatalogQtyError] = useState<string | null>(null)
  const [showTinyResult, setShowTinyResult] = useState(false)
  const [tinyResult, setTinyResult] = useState<any>(null)
  const [sentObjectResult, setSentObjectResult] = useState<any>(null)

  // Histórico de produtos
  type HistoryItem = {
    id: number
    pedido_id: number
    produto_id: number
    codigo: string | null
    nome: string | null
    preco: string | number | null
    quantidade: string | number
    created_at: string
    tiny_orders?: { cliente_nome?: string | null; numero_pedido?: string | null }
  }
  const [showHistory, setShowHistory] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([])

  type Suggestion = { id: number; nome: string; codigo?: string }
  const [suggestionsByItem, setSuggestionsByItem] = useState<Record<number, Suggestion[]>>({})
  const [showSuggestForItem, setShowSuggestForItem] = useState<Record<number, boolean>>({})
  const debounceTimers = useRef<Record<number, any>>({})

  // Sugestões de clientes + papel do usuário
  type ClientSuggestion = {
    id: number
    external_id?: string | null
    nome: string
    cpf_cnpj?: string
    id_vendedor_externo?: string | null
    nome_vendedor?: string | null
    cidade?: string | null
    endereco?: string | null
    numero?: string | null
    complemento?: string | null
    bairro?: string | null
    cep?: string | null
    uf?: string | null
    fone?: string | null
    email?: string | null
  }
  const [clientSuggestions, setClientSuggestions] = useState<ClientSuggestion[]>([])
  const [showClientSuggest, setShowClientSuggest] = useState<boolean>(false)
  const clientDebounceRef = useRef<any>(null)
  const [selectedClient, setSelectedClient] = useState<ClientSuggestion | null>(null)
  const [showContactAccordion, setShowContactAccordion] = useState(false)
  const [contactMode, setContactMode] = useState<'new' | 'existing'>('new')
  const [isSavingContact, setIsSavingContact] = useState(false)
  const [isLoadingContactInfo, setIsLoadingContactInfo] = useState(false)
  const [contactResponse, setContactResponse] = useState<any>(null)
  const [showContactResultModal, setShowContactResultModal] = useState(false)
  const [contactFormErrors, setContactFormErrors] = useState<Record<string, string>>({})
  const [isDifferentDeliveryAddress, setIsDifferentDeliveryAddress] = useState(false)
  const [deliveryAddress, setDeliveryAddress] = useState({
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cep: '',
    cidade: '',
    uf: '',
  })
  const [contactForm, setContactForm] = useState({
    codigo: '',
    nome: '',
    tipo_pessoa: 'J',
    cpf_cnpj: '',
    ie: '',
    rg: '',
    im: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cep: '',
    cidade: '',
    uf: '',
    pais: '',
    contatos: '',
    fone: '',
    fax: '',
    celular: '',
    email: '',
    id_vendedor: '',
    situacao: 'A',
    obs: '',
    contribuinte: '1',
  })
  const [meVendedor, setMeVendedor] = useState<{
    tipo?: 'VENDEDOR' | 'TELEVENDAS' | null
    id_vendedor_externo?: string | null
    nome?: string | null
  } | null>(null)
  const [isAdminUser, setIsAdminUser] = useState(false)

  useEffect(() => {
    if (!isNew) return
    ;(async () => {
      try {
        const res = await fetch('/api/me/vendedor')
        const j = await res.json()
        if (j?.ok) setMeVendedor(j.data)
      } catch {}
    })()

    ;(async () => {
      try {
        const res = await fetch('/api/me/vendedor')
        const json = await res.json()
        setIsAdminUser(Boolean(json?.ok && json?.data?.is_admin))
      } catch {
        setIsAdminUser(false)
      }
    })()
  }, [isNew])

  // Submissão Tiny
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const formatDateBR = (isoOrDate: string | Date) => {
    const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    return `${dd}/${mm}/${yyyy}`
  }

  const toTinyDecimal = (num: number) => {
    return Number(num ?? 0).toFixed(2).replace(/,/g, '.')
  }

  const onlyDigits = (s: string) => (s || '').replace(/\D/g, '')
  const maskCpfCnpj = (value: string) => {
    const digits = onlyDigits(value).slice(0, 14)
    if (digits.length <= 11) {
      return digits
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1-$2')
    }
    return digits
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
  }
  const maskPhone = (value: string) => {
    const digits = onlyDigits(value).slice(0, 11)
    if (digits.length <= 10) {
      return digits
        .replace(/^(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{4})(\d)/, '$1-$2')
    }
    return digits
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
  }

  const addItem = () => {
    setItens((arr) => {
      const nextId = arr.reduce((m, it) => Math.max(m, it.id), 0) + 1
      return [...arr, { id: nextId, nome: '', quantidade: 1, unidade: 'PC', preco: 0 }]
    })
  }

  const roundQty = (n: number) => {
    if (!Number.isFinite(n)) return 0
    return Math.round(n)
  }

  const getQtdInOrderByProductId = (produtoId?: number) => {
    if (!produtoId) return 0
    const pid = Number(produtoId || 0)
    if (!Number.isFinite(pid) || pid <= 0) return 0
    return itens
      .filter((it) => Number(it.produtoId || 0) === pid)
      .reduce((acc, it) => acc + Number(it.quantidade || 0), 0)
  }

  const getAvailableMaxForProduct = async (produtoId: number) => {
    const currentQty = getQtdInOrderByProductId(produtoId)
    try {
      const est = await fetchJsonCached(`/api/produtos/${produtoId}/estoque`, 4000)
      const stock = est?.totalEstoque != null ? Number(est.totalEstoque) : null
      if (stock == null || !Number.isFinite(stock) || stock < 0) {
        // If stock is unknown, allow at least keeping current qty.
        return { maxAllowed: currentQty, stock: null as number | null, currentQty }
      }
      // Rule: user must be able to return to the already-loaded order quantity,
      // even if live stock is lower (order has already "reserved" that amount).
      const maxAllowed = Math.max(currentQty, stock)
      return { maxAllowed, stock, currentQty }
    } catch {
      return { maxAllowed: currentQty, stock: null as number | null, currentQty }
    }
  }

  const removeItem = (id: number) => {
    setItens((arr) => arr.filter((it) => it.id !== id))
  }

  useEffect(() => {
    (async () => {
      if (!isNew) {
        const existing = await getPedidoByNumero(idParam)
        if (existing) {
          setForm(existing)
          const loadedItems = Array.isArray((existing as any)?.itens) ? (existing as any).itens : []
          setItens(
            loadedItems.map((it: any, idx: number) => ({
              id: idx + 1,
              produtoId: it?.produtoId != null ? Number(it.produtoId) : undefined,
              nome: String(it?.nome || ''),
              sku: it?.codigo ? String(it.codigo) : undefined,
              quantidade: Number(it?.quantidade || 0),
              unidade: String(it?.unidade || 'UN'),
              preco: Number(it?.preco || 0),
              // `originalPreco` fica indefinido: o efeito de taxa infere o preço base a partir do gravado + condição.
            }))
          )
          setFormaRecebimento(existing.forma_recebimento || 'Boleto')
          setCondicaoPagamento(existing.condicao_pagamento || '')
          const addr = (existing as any)?.endereco_entrega || {}

          const linkedVendedor = (existing as any)?.selected_vendedor
          if (linkedVendedor?.id_vendedor_externo) {
            setMeVendedor({
              id_vendedor_externo: String(linkedVendedor.id_vendedor_externo),
              nome: linkedVendedor?.nome || null,
              tipo: linkedVendedor?.tipo || null,
            })
          }

          // Prefer local DB relation via platform_order.id_client_externo -> cliente.external_id.
          const linkedClient = (existing as any)?.selected_client
          if (linkedClient) {
            setSelectedClient({
              id: Number(linkedClient?.id ?? 0),
              external_id: linkedClient?.external_id != null ? String(linkedClient.external_id) : null,
              nome: linkedClient?.nome || '',
              cpf_cnpj: linkedClient?.cpf_cnpj || '',
              id_vendedor_externo: linkedClient?.id_vendedor_externo ?? null,
              nome_vendedor: linkedClient?.nome_vendedor ?? null,
              cidade: linkedClient?.cidade ?? null,
              endereco: linkedClient?.endereco ?? null,
              numero: linkedClient?.numero ?? null,
              complemento: linkedClient?.complemento ?? null,
              bairro: linkedClient?.bairro ?? null,
              cep: linkedClient?.cep ?? null,
              uf: linkedClient?.uf ?? null,
            })
          }

          const hasEnderecoEntrega =
            !!(addr?.endereco || addr?.numero || addr?.bairro || addr?.cep || addr?.cidade || addr?.uf)
          const fallbackEndereco = {
            endereco: linkedClient?.endereco || '',
            numero: linkedClient?.numero || '',
            complemento: linkedClient?.complemento || '',
            bairro: linkedClient?.bairro || '',
            cep: linkedClient?.cep || '',
            cidade: linkedClient?.cidade || '',
            uf: linkedClient?.uf || '',
          }

          setIsDifferentDeliveryAddress(Boolean(addr?.endereco_diferente))
          setDeliveryAddress(
            hasEnderecoEntrega
              ? {
                  endereco: addr?.endereco || '',
                  numero: addr?.numero || '',
                  complemento: addr?.complemento || '',
                  bairro: addr?.bairro || '',
                  cep: addr?.cep || '',
                  cidade: addr?.cidade || '',
                  uf: addr?.uf || '',
                }
              : fallbackEndereco
          )
        }
      } else {
        setForm((f) => ({ ...f, numero: 0 }))
      }
    })()
  }, [idParam, isNew])

  // Carregar catálogo inicial (100 itens) e buscar com debounce quando query >= 3
  useEffect(() => {
    const run = async (q: string) => {
      setCatalogLoading(true)
      try {
        const data = await fetchJsonCached(`/api/produtos?q=${encodeURIComponent(q)}`, 3000)
        const items: CatalogItem[] = (data?.retorno?.produtos || []).map((p: any) => ({
          id: Number(p?.produto?.id ?? 0),
          nome: p?.produto?.nome ?? '',
          codigo: p?.produto?.codigo ?? undefined,
          preco: p?.produto?.preco != null ? Number(p?.produto?.preco) : undefined,
          imagem: p?.produto?.imagem ?? null,
        })).filter((x: CatalogItem) => !!x.nome)
        setCatalog(items)
      } finally {
        setCatalogLoading(false)
      }
    }

    if (!catalogQuery || catalogQuery.trim().length === 0) {
      if (!isNew) return
      run('')
      return
    }
    if (catalogQuery.trim().length < 3) return
    if (catalogDebounceRef.current) clearTimeout(catalogDebounceRef.current)
    catalogDebounceRef.current = setTimeout(() => run(catalogQuery.trim()), 600)
  }, [catalogQuery, isNew])

  const displayedCatalog = useMemo(() => {
    if (!catalogQuery || catalogQuery.trim().length === 0) {
      if (!isNew) {
        return (itens || [])
          .map((it) => {
            const withOrig = it as ItemPedidoWithOriginal
            const base =
              withOrig.originalPreco != null && Number.isFinite(Number(withOrig.originalPreco))
                ? Number(withOrig.originalPreco)
                : Number(it.preco || 0)
            return {
              id: Number(it.produtoId || 0),
              nome: String(it.nome || ''),
              codigo: it.sku ? String(it.sku) : undefined,
              preco: base,
              imagem: it.imagemUrl || null,
            }
          })
          .filter((x) => !!x.nome)
      }
    }
    return catalog
  }, [catalogQuery, isNew, itens, catalog])

  const addFromCatalog = (p: CatalogItem) => {
    ;(async () => {
      try {
        const currentQty = getQtdInOrderForCatalogRow(p)
        const { maxAllowed } = await getAvailableMaxForProduct(p.id)
        const nextQty = roundQty(currentQty + 1)
        if (nextQty > maxAllowed) {
          setCatalogQtyError(`Estoque não disponível para aumentar. Máximo permitido: ${maxAllowed}`)
          return
        }
        // proceed to add
        setItens((arr) => {
          const idx = findOrderItemIndexForCatalog(p, arr)
          if (idx >= 0) {
            const next = [...arr]
            next[idx] = {
              ...next[idx],
              quantidade: roundQty(next[idx].quantidade + 1),
              produtoId: next[idx].produtoId ?? p.id,
            }
            return next
          }
          const nextId = arr.reduce((m, it) => Math.max(m, it.id), 0) + 1
          return [
            ...arr,
            {
              id: nextId,
              produtoId: p.id,
              nome: p.nome,
              sku: p.codigo,
              quantidade: 1,
              unidade: 'PC',
              preco: Number(p.preco || 0),
              originalPreco: Number(p.preco || 0),
              imagemUrl: p.imagem || undefined,
            } as ItemPedidoWithOriginal,
          ]
        })
        setCatalogQtyError(null)
      } catch (e) {
        // ignore errors here to avoid disrupting catalog state
      }
    })()
  }

  const removeFromCatalog = (p: CatalogItem) => {
    setItens((arr) => {
      const idx = findOrderItemIndexForCatalog(p, arr)
      if (idx < 0) return arr
      const curr = arr[idx]
      const next = [...arr]
      if (Number(curr.quantidade || 0) > 1) {
        next[idx] = { ...curr, quantidade: roundQty(Number(curr.quantidade || 0) - 1) }
      } else {
        next.splice(idx, 1)
      }
      return next
    })
  }

  const setQtyForCatalogItem = (p: CatalogItem, qtyRaw: number) => {
    ;(async () => {
      const qty = roundQty(qtyRaw)
      if (qty <= 0) {
        setItens((arr) =>
          arr.filter((it) => {
            if (Number(p.id) > 0 && Number(it.produtoId || 0) === Number(p.id)) return false
            const code = (p.codigo || '').trim().toLowerCase()
            if (code && (it.sku || '').toLowerCase() === code) return false
            return true
          })
        )
        setCatalogQtyError(null)
        return
      }

      const { maxAllowed } = await getAvailableMaxForProduct(p.id)
      if (qty > maxAllowed) {
        setCatalogQtyError(`Estoque não disponível. Máximo permitido: ${maxAllowed}`)
        return
      }

      setItens((arr) => {
        const idx = findOrderItemIndexForCatalog(p, arr)
        if (idx >= 0) {
          const next = [...arr]
          next[idx] = { ...next[idx], quantidade: qty, produtoId: next[idx].produtoId ?? p.id }
          return next
        }
        const nextId = arr.reduce((m, it) => Math.max(m, it.id), 0) + 1
        return [
          ...arr,
          {
            id: nextId,
            produtoId: p.id,
            nome: p.nome,
            sku: p.codigo,
            quantidade: qty,
            unidade: 'PC',
            preco: Number(p.preco || 0),
            originalPreco: Number(p.preco || 0),
            imagemUrl: p.imagem || undefined,
          } as ItemPedidoWithOriginal,
        ]
      })
      setCatalogQtyError(null)
    })()
  }

  const openCatalogDetail = (p: CatalogItem) => {
    setCatalogSelected(p)
    setCatalogDetail(null)
    setCatalogDetailError(null)
    setShowCatalogDetail(true)
    ;(async () => {
      setCatalogDetailLoading(true)
      try {
        const [prodRes, estoqueRes] = await Promise.all([
          fetch(`/api/produtos/${p.id}`),
          fetch(`/api/produtos/${p.id}/estoque`),
        ])
        const prod = await prodRes.json()
        const est = await estoqueRes.json().catch(() => ({ totalEstoque: null }))
        setCatalogDetail({
          nome: prod?.nome ?? p.nome,
          codigo: prod?.codigo ?? p.codigo,
          preco: prod?.preco != null ? Number(prod.preco) : (p.preco ?? undefined),
          unidade: prod?.unidade ?? undefined,
          imagem: prod?.imagem ?? p.imagem ?? null,
          descricao: prod?.descricao ?? null,
          estoque: est?.totalEstoque != null ? Number(est.totalEstoque) : null,
        })
      } catch (e: any) {
        setCatalogDetailError('Falha ao carregar detalhes do produto')
      } finally {
        setCatalogDetailLoading(false)
      }
    })()
  }

  const openQtyEditor = async (p: CatalogItem, initialValue?: number) => {
    setQtyModalError(null)
    setQtyModalProduct(p)
    setQtyModalLoading(true)
    try {
      const res = await fetch(`/api/produtos/${p.id}/estoque`)
      const est = await res.json().catch(() => ({ totalEstoque: null }))
      const stock = est?.totalEstoque != null ? Number(est.totalEstoque) : null
      setQtyModalStock(stock)
      const currentQty = getQtdInOrderBySku(p.codigo)
      setQtyModalValue(typeof initialValue === 'number' ? initialValue : currentQty || 1)
      if (stock != null && (typeof initialValue === 'number' ? initialValue : currentQty || 1) > stock) {
        setQtyModalError(`Estoque não disponível, estoque atual: ${stock}`)
      }
      setShowQtyModal(true)
    } catch (e: any) {
      setQtyModalError('Falha ao verificar estoque')
      setShowQtyModal(true)
    } finally {
      setQtyModalLoading(false)
    }
  }

  const getQtdInOrderBySku = (sku?: string) => {
    if (!sku) return 0
    const s = (sku || '').toLowerCase()
    return itens.filter((it) => (it.sku || '').toLowerCase() === s).reduce((acc, it) => acc + (it.quantidade || 0), 0)
  }

  const getQtdInOrderForCatalogRow = (p: CatalogItem) => {
    const pid = Number(p.id || 0)
    if (pid > 0) return getQtdInOrderByProductId(pid)
    return getQtdInOrderBySku(p.codigo)
  }

  /** Match catálogo ↔ linha do pedido: prioriza produtoId, depois SKU. */
  const findOrderItemIndexForCatalog = (p: CatalogItem, arr: ItemPedido[]) => {
    const pid = Number(p.id || 0)
    if (pid > 0) {
      const idx = arr.findIndex((it) => Number(it.produtoId || 0) === pid)
      if (idx >= 0) return idx
    }
    const code = (p.codigo || '').trim().toLowerCase()
    if (code) {
      return arr.findIndex((it) => (it.sku || '').toLowerCase() === code)
    }
    return -1
  }

  /** Limite total de unidades do produto no pedido (respeita estoque e qtde já comprometida no pedido). */
  const getMaxTotalQtyForProductLine = async (produtoId: number, lineId: number) => {
    const line = itens.find((it) => it.id === lineId)
    const oldQty = Number(line?.quantidade || 0)
    const sumOthers = itens
      .filter((it) => it.id !== lineId && Number(it.produtoId || 0) === produtoId)
      .reduce((a, it) => a + Number(it.quantidade || 0), 0)
    const currentTotal = sumOthers + oldQty
    try {
      const est = await fetchJsonCached(`/api/produtos/${produtoId}/estoque`, 4000)
      const stock = est?.totalEstoque != null ? Number(est.totalEstoque) : null
      if (stock == null || !Number.isFinite(stock) || stock < 0) {
        return { maxTotal: currentTotal }
      }
      return { maxTotal: Math.max(currentTotal, stock) }
    } catch {
      return { maxTotal: currentTotal }
    }
  }

  const setQtyForLineItem = (lineId: number, qtyRaw: number) => {
    void (async () => {
      const qty = roundQty(qtyRaw)
      const line = itens.find((it) => it.id === lineId)
      if (!line) return
      if (qty <= 0) {
        removeItem(lineId)
        setCatalogQtyError(null)
        return
      }
      const pid = Number(line.produtoId || 0)
      if (pid > 0) {
        const { maxTotal } = await getMaxTotalQtyForProductLine(pid, lineId)
        const sumOthers = itens
          .filter((it) => it.id !== lineId && Number(it.produtoId || 0) === pid)
          .reduce((a, it) => a + Number(it.quantidade || 0), 0)
        const maxForLine = maxTotal - sumOthers
        if (qty > maxForLine) {
          setCatalogQtyError(`Estoque não disponível. Máximo permitido nesta linha: ${maxForLine}`)
          return
        }
      }
      setItens((arr) => {
        const idx = arr.findIndex((it) => it.id === lineId)
        if (idx < 0) return arr
        const next = [...arr]
        next[idx] = { ...next[idx], quantidade: qty }
        return next
      })
      setCatalogQtyError(null)
    })()
  }

  const handleChange = (key: keyof Pedido, value: string | number | PedidoStatus) => {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const onClienteChange = (value: string) => {
    setForm((f) => ({ ...f, cliente: value }))
    setSelectedClient(null)
    if (clientDebounceRef.current) clearTimeout(clientDebounceRef.current)
    const trimmed = value.trim()
    if (trimmed.length >= 3) {
      clientDebounceRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/clientes?q=${encodeURIComponent(trimmed)}`, { credentials: 'same-origin' })
          const data = await res.json()
          console.debug('clientes search res', res.status, data)
          const options: ClientSuggestion[] = (data?.data || []).map((c: any) => ({
            id: Number(c?.id ?? 0),
            external_id: c?.external_id != null ? String(c.external_id) : (c?.id != null ? String(c.id) : null),
            nome: c?.nome || '',
            cpf_cnpj: c?.cpf_cnpj || '',
            id_vendedor_externo: c?.id_vendedor_externo ?? null,
            nome_vendedor: c?.nome_vendedor ?? null,
            cidade: c?.cidade ?? null,
            endereco: c?.endereco ?? null,
            numero: c?.numero ?? null,
            complemento: c?.complemento ?? null,
            bairro: c?.bairro ?? null,
            cep: c?.cep ?? null,
            uf: c?.uf ?? null,
          })).filter((c: ClientSuggestion) => !!c.nome)
          setClientSuggestions(options)
          setShowClientSuggest(options.length > 0)
        } catch (e) {
          console.error('Erro buscando clientes', e)
          setClientSuggestions([])
          setShowClientSuggest(false)
        }
      }, 1000)
    } else {
      setShowClientSuggest(false)
      setClientSuggestions([])
    }
  }

  const selectCliente = (opt: ClientSuggestion) => {
    setForm((f) => ({ ...f, cliente: opt.nome, cnpj: opt.cpf_cnpj || '' }))
    setSelectedClient(opt)
    setIsDifferentDeliveryAddress(false)
    setDeliveryAddress({
      endereco: opt.endereco || '',
      numero: opt.numero || '',
      complemento: opt.complemento || '',
      bairro: opt.bairro || '',
      cep: opt.cep || '',
      cidade: opt.cidade || '',
      uf: opt.uf || '',
    })
    setShowClientSuggest(false)
  }

  const openNewContact = () => {
    setContactMode('new')
    setContactFormErrors({})
    setForm((f) => ({ ...f, cliente: '', cnpj: '' }))
    setSelectedClient(null)
    setShowClientSuggest(false)
    setClientSuggestions([])
    setIsDifferentDeliveryAddress(false)
    setDeliveryAddress({
      endereco: '',
      numero: '',
      complemento: '',
      bairro: '',
      cep: '',
      cidade: '',
      uf: '',
    })
    setContactForm({
      codigo: '',
      nome: '',
      tipo_pessoa: 'J',
      cpf_cnpj: '',
      ie: '',
      rg: '',
      im: '',
      endereco: '',
      numero: '',
      complemento: '',
      bairro: '',
      cep: '',
      cidade: '',
      uf: '',
      pais: '',
      contatos: '',
      fone: '',
      fax: '',
      celular: '',
      email: '',
      id_vendedor: meVendedor?.id_vendedor_externo || '',
      situacao: 'A',
      obs: '',
      contribuinte: '1',
    })
    setShowContactAccordion(true)
  }

  const openExistingContactInfo = async () => {
    if (!selectedClient) return
    setContactMode('existing')
    setContactFormErrors({})
    setShowContactAccordion(true)
    setIsLoadingContactInfo(true)
    try {
      const tinyContactId = selectedClient.external_id || String(selectedClient.id)
      const res = await fetch(`/api/clientes/obter?id=${encodeURIComponent(String(tinyContactId))}`)
      const data = await res.json().catch(() => null)
      const tinyContato = data?.retorno?.contato
      if (!tinyContato) {
        setContactResponse(data ?? { erro: 'Contato não localizado no Tiny' })
        setShowContactResultModal(true)
        return
      }
      setContactForm({
        codigo: tinyContato?.codigo || '',
        nome: tinyContato?.nome || selectedClient.nome || '',
        tipo_pessoa: tinyContato?.tipo_pessoa || (onlyDigits(selectedClient.cpf_cnpj || '').length === 11 ? 'F' : 'J'),
        cpf_cnpj: tinyContato?.cpf_cnpj || selectedClient.cpf_cnpj || '',
        ie: tinyContato?.ie || '',
        rg: tinyContato?.rg || '',
        im: tinyContato?.im || '',
        endereco: tinyContato?.endereco || '',
        numero: tinyContato?.numero || '',
        complemento: tinyContato?.complemento || '',
        bairro: tinyContato?.bairro || '',
        cep: tinyContato?.cep || '',
        cidade: tinyContato?.cidade || '',
        uf: tinyContato?.uf || '',
        pais: tinyContato?.pais || '',
        contatos: tinyContato?.contatos || tinyContato?.nome || '',
        fone: tinyContato?.fone || '',
        fax: tinyContato?.fax || '',
        celular: tinyContato?.celular || '',
        email: tinyContato?.email || '',
        id_vendedor: selectedClient.id_vendedor_externo || meVendedor?.id_vendedor_externo || '',
        situacao: tinyContato?.situacao || 'A',
        obs: tinyContato?.obs || '',
        contribuinte: tinyContato?.contribuinte || '1',
      })
      setIsDifferentDeliveryAddress(false)
      setDeliveryAddress({
        endereco: tinyContato?.endereco || '',
        numero: tinyContato?.numero || '',
        complemento: tinyContato?.complemento || '',
        bairro: tinyContato?.bairro || '',
        cep: tinyContato?.cep || '',
        cidade: tinyContato?.cidade || '',
        uf: tinyContato?.uf || '',
      })
    } catch {
      setContactResponse({ erro: 'Falha ao carregar informações do contato' })
      setShowContactResultModal(true)
    } finally {
      setIsLoadingContactInfo(false)
    }
  }

  const saveContact = async () => {
    const errors: Record<string, string> = {}
    if (!contactForm.nome.trim()) errors.nome = 'Nome é obrigatório'
    if (onlyDigits(contactForm.cpf_cnpj).length < 11) errors.cpf_cnpj = 'CPF/CNPJ é obrigatório'
    if (!contactForm.email.trim()) errors.email = 'Email é obrigatório'
    if (onlyDigits(contactForm.fone).length < 10) errors.fone = 'Telefone é obrigatório'
    if (!/^\d+$/.test((contactForm.ie || '').trim())) errors.ie = 'Inscrição Estadual deve conter apenas números'

    setContactFormErrors(errors)
    if (Object.keys(errors).length > 0) {
      return
    }

    setIsSavingContact(true)
    try {
      const payloadContato: any = {
        ...contactForm,
        tipo_pessoa: 'J',
        situacao: 'A',
      }
      const endpoint = contactMode === 'existing' ? '/api/clientes/alterar' : '/api/clientes/incluir'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contato: payloadContato }),
      })
      const data = await res.json().catch(() => ({ erro: 'Resposta inválida' }))
      setContactResponse(data)
      setShowContactResultModal(true)

      const status = String(data?.retorno?.status || '').toUpperCase()
      const registros = data?.retorno?.registros || []
      const allOk = status === 'OK' && Array.isArray(registros) && registros.length > 0 && registros.every((r: any) => String(r?.registro?.status || '').toUpperCase() === 'OK')
      if (allOk || status === 'OK') {
        const createdId = registros?.[0]?.registro?.id ? String(registros[0].registro.id) : null
        setForm((f) => ({ ...f, cliente: contactForm.nome, cnpj: contactForm.cpf_cnpj }))
        setSelectedClient({
          id: createdId ? Number(createdId) : 0,
          external_id: createdId,
          nome: contactForm.nome,
          cpf_cnpj: contactForm.cpf_cnpj,
          id_vendedor_externo: contactForm.id_vendedor || null,
          nome_vendedor: null,
          cidade: contactForm.cidade || null,
          endereco: contactForm.endereco || null,
          numero: contactForm.numero || null,
          complemento: contactForm.complemento || null,
          bairro: contactForm.bairro || null,
          cep: contactForm.cep || null,
          uf: contactForm.uf || null,
          fone: contactForm.fone || null,
          email: contactForm.email || null,
        })
        setShowContactAccordion(false)
      }
    } catch (e: any) {
      setContactResponse({ erro: 'Falha ao salvar contato' })
      setShowContactResultModal(true)
    } finally {
      setIsSavingContact(false)
    }
  }

  const extractTinyContactErrors = (resp: any): string[] => {
    const messages: string[] = []
    const topErrors = resp?.retorno?.erros
    if (Array.isArray(topErrors)) {
      for (const item of topErrors) {
        const msg = item?.erro
        if (typeof msg === 'string' && msg.trim()) messages.push(msg.trim())
      }
    }

    const registros = resp?.retorno?.registros
    if (Array.isArray(registros)) {
      for (const entry of registros) {
        const regErrors = entry?.registro?.erros
        if (!Array.isArray(regErrors)) continue
        for (const err of regErrors) {
          const msg = err?.erro
          if (typeof msg === 'string' && msg.trim()) messages.push(msg.trim())
        }
      }
    }

    return Array.from(new Set(messages))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)
    setIsSubmitting(true)

    try {
      // Block submit if parcel validation fails
      if (pagamentoParceladoErro) {
        setSubmitError(pagamentoParceladoErro)
        setIsSubmitting(false)
        return
      }
      // Envio para Tiny desabilitado temporariamente: salvar apenas na plataforma
      const cpfCnpjDigits = onlyDigits(form.cnpj)
      const tipoPessoa = cpfCnpjDigits.length === 11 ? 'F' : (cpfCnpjDigits.length === 14 ? 'J' : '')

      const tinyItens: any[] = []

      const descontoValor = Math.max(0, (itens.reduce((acc, it) => acc + (it.quantidade * (it.preco || 0)), 0)) - (totalComDesconto || 0))

      const tinyParcelas: any[] | undefined = undefined

      // Determine if this submission is a proposta via search param
      if (entityParam === 'proposta') {
        // prepare payload ensuring cliente is an object with nome and cpf_cnpj
        const payloadProposal: any = {
          ...form,
          status: 'Proposta',
          total: totalComDesconto,
          forma_recebimento: formaRecebimento,
          condicao_pagamento: condicaoPagamento,
          idContato: selectedClient?.external_id ? Number(selectedClient.external_id) : 0,
          vendedor: {
            id: Number(meVendedor?.id_vendedor_externo || 0),
          },
        }
        payloadProposal.cliente =
          !payloadProposal.cliente || typeof payloadProposal.cliente === 'string'
            ? {
                id: selectedClient?.external_id ? Number(selectedClient.external_id) : undefined,
                external_id: selectedClient?.external_id || undefined,
                nome: String(form.cliente || '').trim(),
                cpf_cnpj: String(form.cnpj || '').trim(),
              }
            : {
                ...(payloadProposal.cliente || {}),
                id:
                  payloadProposal.cliente.id ??
                  (selectedClient?.external_id ? Number(selectedClient.external_id) : undefined),
                external_id: payloadProposal.cliente.external_id ?? selectedClient?.external_id ?? undefined,
                cpf_cnpj: String(form.cnpj || '').trim(),
                nome: payloadProposal.cliente.nome || String(form.cliente || '').trim(),
              }
        // remove top-level cnpj to avoid duplication when sending to Tiny via backend
        delete payloadProposal.cnpj
        // Include items in platform format so they are persisted with the proposal (not sent to Tiny yet)
        if (itens && itens.length > 0) {
          payloadProposal.itens = itens.map((it) => ({
            produtoId: it.produtoId ?? null,
            nome: it.nome,
            quantidade: it.quantidade,
            unidade: it.unidade,
            preco: it.preco,
          }))
        }
        payloadProposal.endereco_entrega = {
          ...deliveryAddress,
          endereco_diferente: isDifferentDeliveryAddress,
        }
        payloadProposal.juros_ligado = true
        if (isNew) {
          await createProposta(payloadProposal as any)
        } else {
          const n = Number(form.numero || 0)
          if (!n) {
            setSubmitError('Número da proposta inválido')
            setIsSubmitting(false)
            return
          }
          await updateProposta(n, payloadProposal as any)
        }
        router.push('/propostas')
        return
      }

      // Apenas salvar localmente na plataforma (pedido)
      const formExt = form as unknown as Record<string, unknown>
      const idContato =
        selectedClient?.external_id != null && String(selectedClient.external_id).trim() !== ''
          ? Number(selectedClient.external_id)
          : formExt.id_client_externo != null && String(formExt.id_client_externo).trim() !== ''
            ? Number(String(formExt.id_client_externo).replace(/\D/g, '')) || 0
            : 0
      const vendedorIdNum = Number(
        meVendedor?.id_vendedor_externo ||
          formExt.id_vendedor_externo ||
          0
      )
      const payloadToSend: any = {
        ...form,
        total: totalComDesconto,
        forma_recebimento: formaRecebimento,
        condicao_pagamento: condicaoPagamento,
        juros_ligado: true,
        idContato,
        vendedor: {
          id: Number.isFinite(vendedorIdNum) && vendedorIdNum > 0 ? vendedorIdNum : 0,
        },
      }
      payloadToSend.cliente =
        !payloadToSend.cliente || typeof payloadToSend.cliente === 'string'
          ? {
              id: idContato || undefined,
              external_id: selectedClient?.external_id || undefined,
              nome: String(form.cliente || '').trim(),
              cpf_cnpj: String(form.cnpj || '').trim(),
            }
          : {
              ...(payloadToSend.cliente || {}),
              id:
                payloadToSend.cliente.id ??
                (idContato || undefined),
              external_id: payloadToSend.cliente.external_id ?? selectedClient?.external_id ?? undefined,
              cpf_cnpj: String(form.cnpj || '').trim(),
              nome: payloadToSend.cliente.nome || String(form.cliente || '').trim(),
            }
      delete payloadToSend.cnpj
      /** Não remover `id_vendedor_externo`: o POST /api/pedidos usa esse campo se `vendedor.id` vier zerado. */
      payloadToSend.endereco_entrega = {
        ...deliveryAddress,
        endereco_diferente: isDifferentDeliveryAddress,
      }
      payloadToSend.pagamento = {
        formaRecebimento: { id: selectedFormaRecebimentoId },
        meioPagamento: { id: 0 },
        parcelas: (parcelas || []).map((p) => {
          const baseDate = parseYmdToLocalDate(form.data || todayCalendarYmdLocal())
          const due = new Date(p.data)
          const ms = due.getTime() - baseDate.getTime()
          const dias = Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)))
          return {
            dias,
            data: formatLocalDateYmd(due),
            valor: Number(p.valor || 0),
            observacoes: '',
            formaRecebimento: { id: selectedFormaRecebimentoId },
            meioPagamento: { id: 0 },
          }
        }),
      }
      if (itens && itens.length > 0) {
        const mappedItems = itens
          .map((it) => {
            const descricao = it.nome?.toString().trim()
            const quantidade = Number(it.quantidade || 0)
            const produtoId = Number(it.produtoId || 0)
            if (!descricao || quantidade <= 0 || !produtoId) return null
            return {
              produtoId,
              nome: descricao,
              quantidade,
              unidade: it.unidade || 'UN',
              preco: Number(it.preco || 0),
            }
          })
          .filter(Boolean)
        if (mappedItems.length > 0) {
          payloadToSend.itens = mappedItems
        }
      }
      const saved = await savePedidoRemote(payloadToSend)
      // After successful order submission, always return to order listing.
      router.push('/pedidos')
      return
    } catch (err: any) {
      setSubmitError('Erro inesperado ao enviar o pedido')
    } finally {
      setIsSubmitting(false)
    }
  }

  const subtotal = useMemo(() => {
    if (!isNew && itens.length === 0) return Number(form.total || 0)
    return itens.reduce((acc, it) => acc + (it.quantidade * (it.preco || 0)), 0)
  }, [itens, form.total, isNew])

  const descontoHabilitado = useMemo(() => {
    const forma = String(formaRecebimento || '').trim().toLowerCase()
    if (forma === 'pix') return true
    if (forma === 'boleto' && condicaoPagamento === '7 dias') return true
    return false
  }, [formaRecebimento, condicaoPagamento])

  const totalComDesconto = useMemo(() => {
    if (!isNew && itens.length === 0) return Number(form.total || 0)
    const perc = descontoHabilitado ? Math.min(2, Math.max(0, descontoPercent)) : 0
    const tot = subtotal * (1 - perc / 100)
    return tot < 0 ? 0 : tot
  }, [subtotal, descontoPercent, descontoHabilitado, form.total, isNew, itens.length])

  // Payment conditions are loaded from server (payment_condition table).
  const [paymentConditions, setPaymentConditions] = useState<PaymentConditionRow[]>([])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const json = await fetchJsonCached('/api/condicoes-pagamento', 10000)
        if (mounted && json?.ok && Array.isArray(json.data)) {
          setPaymentConditions(
            json.data.map((r: any) => {
              const vm = r.valor_minimo != null ? Number(r.valor_minimo) : null
              const tierRaw = Number(r.admin_tier ?? 0)
              const admin_tier = tierRaw === 2 ? 2 : tierRaw === 1 ? 1 : 0
              return {
                id: Number(r.id),
                name: String(r.name),
                percent: Number(r.percent || 0),
                admin_tier,
                valor_minimo: vm != null && Number.isFinite(vm) && vm > 0 ? vm : null,
                valor_minimo_sem_taxa: null,
              }
            })
          )
        }
      } catch (e) {
        // ignore
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const resolvedCondicao = useMemo(
    () => resolvePaymentCondition(condicaoPagamento, paymentConditions),
    [condicaoPagamento, paymentConditions]
  )

  /** Condições antigas gravadas só com o nome: associa ao id do cadastro (prioriza faixa isenta, depois 3%, 5%). */
  useEffect(() => {
    if (!condicaoPagamento) return
    if (parsePaymentConditionSelectValue(condicaoPagamento) != null) return
    const same = paymentConditions.filter((c) => c.name === condicaoPagamento)
    if (same.length >= 1) {
      const pick = [...same].sort((a, b) => a.admin_tier - b.admin_tier)[0]
      setCondicaoPagamento(formatPaymentConditionSelectValue(pick.id))
    }
  }, [paymentConditions, condicaoPagamento])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const json = await fetchJsonCached('/api/tiny/receive-forms', 10000)
        if (mounted && json?.ok && Array.isArray(json.data)) {
          const forms = json.data
            .map((r: any) => ({
              id: Number(r.id),
              nome: String(r.nome),
              situacao: Number(r.situacao || 0),
            }))
            .filter((r: any) => r.id > 0 && r.situacao === 1)
          setReceiveForms(forms)
        }
      } catch {
        // ignore
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  const selectedFormaRecebimentoId = useMemo(() => {
    const current = String(formaRecebimento || '').trim().toLowerCase()
    const found = receiveForms.find((f) => String(f.nome || '').trim().toLowerCase() === current)
    return found?.id ?? 0
  }, [receiveForms, formaRecebimento])

  const isTinyOrder = String((form as any)?.sistema_origem || '').toLowerCase() === 'tiny'

  /** Condição atual não bate com nenhum cadastro (ex.: Tiny legado). */
  const condicaoDespadronizada = useMemo(() => {
    if (!condicaoPagamento) return false
    const byId = parsePaymentConditionSelectValue(condicaoPagamento)
    if (byId != null) return !paymentConditions.some((c) => c.id === byId)
    if (paymentConditions.some((c) => c.name === condicaoPagamento)) return false
    if (condicaoPagamento === 'À vista' || condicaoPagamento === '7 dias') return false
    return true
  }, [condicaoPagamento, paymentConditions])

  const nomeParcelasFonte = useMemo(() => {
    if (parsePaymentConditionSelectValue(condicaoPagamento) != null) {
      return resolvedCondicao?.name ?? ''
    }
    return condicaoPagamento
  }, [condicaoPagamento, resolvedCondicao])

  const diasParcelas: number[] = useMemo(() => {
    if (String(formaRecebimento || '').trim().toLowerCase() !== 'boleto') return []
    if (!condicaoPagamento) return []
    if (nomeParcelasFonte === '7 dias' || condicaoPagamento === '7 dias') return [7]
    const raw = String(nomeParcelasFonte || condicaoPagamento)
    // "45 dias direto", "60 dias direto": um único vencimento (só o 1º número), evita dígitos extras no texto.
    if (/\bdireto\b/i.test(raw) && !/\d+\s*\/\s*\d+/.test(raw)) {
      const m = raw.match(/\d+/)
      return m ? [Number(m[0])].filter((n) => !isNaN(n)) : []
    }
    const matches = raw.match(/\d+/g) || []
    return matches.map((d) => Number(d)).filter((n) => !isNaN(n))
  }, [formaRecebimento, condicaoPagamento, nomeParcelasFonte])

  const parcelas = useMemo(() => {
    if (String(formaRecebimento || '').trim().toLowerCase() !== 'boleto' || diasParcelas.length === 0) return []
    const baseDate = parseYmdToLocalDate(form.data || todayCalendarYmdLocal())
    const qtd = diasParcelas.length
    const valorParcela = qtd > 0 ? totalComDesconto / qtd : 0
    return diasParcelas.map((dias, idx) => {
      const d = new Date(baseDate)
      d.setDate(d.getDate() + dias)
      return { numero: idx + 1, data: d, valor: valorParcela }
    })
  }, [diasParcelas, totalComDesconto, form.data, formaRecebimento])

  const markupPct = useMemo(() => {
    if (String(formaRecebimento || '').trim().toLowerCase() !== 'boleto') return 0
    if (resolvedCondicao) return tierToMarkupDecimal(resolvedCondicao.admin_tier)
    // Fallback: derive from first day (condição livre / legado)
    let firstDay: number | null = null
    if (diasParcelas && diasParcelas.length > 0) firstDay = diasParcelas[0]
    if (firstDay == null || Number.isNaN(firstDay)) {
      const m = String(nomeParcelasFonte || condicaoPagamento || '').match(/\d+/)
      firstDay = m ? Number(m[0]) : NaN
    }
    if (Number.isNaN(firstDay) || firstDay == null) return 0
    if (firstDay < 30) return 0.02
    if (firstDay >= 30 && firstDay < 40) return 0.03
    return 0.04
  }, [formaRecebimento, diasParcelas, condicaoPagamento, nomeParcelasFonte, paymentConditions, resolvedCondicao])

  const pagamentoParceladoErro = useMemo(() => {
    if (String(formaRecebimento || '').trim().toLowerCase() !== 'boleto' || !condicaoPagamento) return ''
    const cfg = resolvedCondicao
    if (!cfg) return ''
    const min = cfg.valor_minimo != null && cfg.valor_minimo > 0 ? cfg.valor_minimo : null
    if (min == null) return ''
    if (totalComDesconto < min) {
      const fmt = min.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      return `O valor mínimo do pedido deve ser de ${fmt}, de acordo com a condição de pagamento escolhida.`
    }
    return ''
  }, [formaRecebimento, condicaoPagamento, resolvedCondicao, totalComDesconto])

  /** Quando troca produto/preço base de uma linha (sem mudar só a quantidade), reaplica markup. Não incluir `preco` exibido (evita loop). */
  const itensBaseSignature = useMemo(
    () => itens.map((it: any) => `${it.id}:${it.produtoId ?? ''}:${it.originalPreco ?? ''}`).join('|'),
    [itens]
  )

  // Recalcula preço unitário dos itens conforme taxa administrativa da faixa escolhida (markupPct).
  useEffect(() => {
    const forma = String(formaRecebimento || '').trim().toLowerCase()
    if (forma === 'boleto' && String(condicaoPagamento || '').trim() && paymentConditions.length === 0) {
      return
    }
    const aplicarTaxa = forma === 'boleto' && Boolean(condicaoPagamento) && markupPct > 0
    const fator = aplicarTaxa ? 1 + (Number.isFinite(markupPct) ? markupPct : 0) : 1

    setItens((arr) => {
      if (arr.length === 0) return arr
      let anyChange = false
      const next = arr.map((it: any) => {
        const rawLine = Number(it.preco || 0)
        const hasOrig =
          it.originalPreco != null && Number.isFinite(Number(it.originalPreco)) && Number(it.originalPreco) > 0
        let baseCatalog: number
        if (hasOrig) {
          baseCatalog = Number(it.originalPreco)
        } else {
          // Pedido carregado do servidor: `preco` costuma ser o valor já com a taxa da condição gravada.
          baseCatalog =
            forma === 'boleto' &&
            String(condicaoPagamento || '').trim() &&
            markupPct > 0 &&
            rawLine > 0
              ? Math.round((rawLine / (1 + markupPct)) * 100) / 100
              : Math.round(rawLine * 100) / 100
        }
        const baseArred = Math.round(baseCatalog * 100) / 100
        const novo = Math.round(baseArred * fator * 100) / 100
        if (Math.abs(Number(it.preco) - novo) > 0.0001 || Math.abs(Number(it.originalPreco ?? 0) - baseArred) > 0.0001) {
          anyChange = true
        }
        return { ...it, originalPreco: baseArred, preco: novo }
      })
      return anyChange ? next : arr
    })
  }, [
    formaRecebimento,
    condicaoPagamento,
    markupPct,
    itens.length,
    itensBaseSignature,
    paymentConditions.length,
  ])

  const onNomeChange = (itemId: number, value: string) => {
    setItens((arr) => arr.map((it) => it.id === itemId ? { ...it, nome: value } : it))
    if (debounceTimers.current[itemId]) {
      clearTimeout(debounceTimers.current[itemId])
    }
    const trimmed = value.trim()
    const wordCount = trimmed.split(/\s+/).filter(Boolean).length
    if (wordCount >= 3 || trimmed.length >= 3) {
      debounceTimers.current[itemId] = setTimeout(async () => {
        try {
          const res = await fetch(`/api/produtos?q=${encodeURIComponent(value)}`)
          const data = await res.json()
          const options: Suggestion[] = (data?.retorno?.produtos || []).map((p: any) => ({ id: Number(p.produto.id), nome: p.produto.nome, codigo: p.produto.codigo }))
          setSuggestionsByItem((prev) => ({ ...prev, [itemId]: options }))
          setShowSuggestForItem((prev) => ({ ...prev, [itemId]: true }))
        } catch (e) {
          setSuggestionsByItem((prev) => ({ ...prev, [itemId]: [] }))
          setShowSuggestForItem((prev) => ({ ...prev, [itemId]: false }))
        }
      }, 1000)
    } else {
      setShowSuggestForItem((prev) => ({ ...prev, [itemId]: false }))
    }
  }

  const selectProduto = async (itemId: number, produtoId: number) => {
    try {
      const [prodRes, estoqueRes] = await Promise.all([
        fetch(`/api/produtos/${produtoId}`),
        fetch(`/api/produtos/${produtoId}/estoque`),
      ])
      const prod = await prodRes.json()
      const est = await estoqueRes.json()
      setItens((arr) => arr.map((it) => it.id === itemId ? {
        ...it,
        produtoId,
        nome: prod?.nome || it.nome,
        sku: prod?.codigo || it.sku,
        unidade: prod?.unidade || it.unidade,
        preco: Number(prod?.preco || 0),
        originalPreco: Number(prod?.preco || 0),
        estoque: Number(est?.totalEstoque ?? 0),
        imagemUrl: prod?.imagem || it.imagemUrl,
      } : it))
      setShowSuggestForItem((prev) => ({ ...prev, [itemId]: false }))
    } catch (e) {
      // ignore
    }
  }

  const openHistory = async () => {
    if (!form.cliente || !form.cliente.trim()) {
      setHistoryError('Informe o cliente para ver o histórico')
      setShowHistory(true)
      return
    }
    setShowHistory(true)
    setHistoryLoading(true)
    setHistoryError(null)
    try {
      const res = await fetch(`/api/historico-produtos?cliente=${encodeURIComponent(form.cliente)}`)
      const data = await res.json()
      if (!res.ok || data?.erro) {
        setHistoryError(data?.erro || 'Falha ao carregar histórico')
        setHistoryItems([])
      } else {
        setHistoryItems(Array.isArray(data.items) ? data.items : [])
      }
    } catch (e) {
      setHistoryError('Erro ao carregar histórico')
      setHistoryItems([])
    } finally {
      setHistoryLoading(false)
    }
  }

  const closeHistory = () => {
    setShowHistory(false)
  }

  const getRowVariantByDate = (iso: string) => {
    const now = new Date()
    const dt = new Date(iso)
    const ms = now.getTime() - dt.getTime()
    const days = Math.floor(ms / (1000 * 60 * 60 * 24))
    if (days <= 30) return 'success'
    if (days <= 90) return 'warning'
    return 'danger'
  }

  const headerTitle = (() => {
    if (entityParam === 'proposta') {
      return isNew ? `Proposta de venda` : `Proposta de venda ${form.numero}`
    }
    return isNew ? `Pedido de venda ${getNextPedidoNumero()}` : `Pedido de venda ${form.numero}`
  })()

  return (
    <>
      <PageTitle title={headerTitle} subName={isNew ? 'Criação' : 'Edição'} />

      {/* Sessão 1 - Cliente e Vendedor */}
      <Card className="border-0 shadow-sm mb-3">
        <Card.Body>
          <Row className="g-3 align-items-end">
            <style jsx global>{`
              /* Hide number input spinners (we use +/- buttons) */
              .qty-input::-webkit-outer-spin-button,
              .qty-input::-webkit-inner-spin-button {
                -webkit-appearance: none;
                margin: 0;
              }
              .qty-input[type='number'] {
                -moz-appearance: textfield;
                appearance: textfield;
              }
              /* dialogClassName aplica no próprio .modal-dialog (não em ancestral) */
              .modal-dialog.pedido-modal-wide {
                max-width: 80vw;
                width: 80vw;
                margin: 1.75rem auto;
              }
              /*
                O Bootstrap centraliza o .modal-dialog no viewport inteiro; o admin usa .page-content
                com margin-left igual à largura do menu. Padding-left no .modal reproduz isso e alinha
                o centro do modal com o formulário (e não com a tela cheia).
              */
              .modal.pedido-modal-align-page {
                padding-left: var(--bs-main-nav-width, 260px);
              }
              html[data-menu-size='condensed'] .modal.pedido-modal-align-page,
              html[data-menu-size='sm-hover'] .modal.pedido-modal-align-page,
              html[data-menu-size='sm-hover-active'] .modal.pedido-modal-align-page {
                padding-left: var(--bs-main-nav-width-sm, 75px);
              }
              html[data-menu-size='hidden']:not(.sidebar-enable) .modal.pedido-modal-align-page {
                padding-left: 0;
              }
              html[data-menu-size='hidden'].sidebar-enable .modal.pedido-modal-align-page {
                padding-left: var(--bs-main-nav-width, 260px);
              }
              .pedido-line-items-table {
                table-layout: fixed;
                width: 100%;
              }
              .pedido-line-items-table th,
              .pedido-line-items-table td {
                vertical-align: middle;
                word-wrap: break-word;
              }
              .pedido-line-items-table .col-nome {
                word-break: break-word;
              }
            `}</style>
            <Col lg={4}>
              <Form.Label>Cliente</Form.Label>
              <div className="position-relative">
                <Form.Control
                  type="text"
                  placeholder="Pesquise pelo nome da empresa ou CNPJ"
                  value={form.cliente}
                  onChange={(e) => onClienteChange(e.target.value)}
                />
                {showClientSuggest && clientSuggestions.length > 0 && (
                  <div className="border rounded bg-white shadow position-absolute w-100 mt-1" style={{ zIndex: 2000, maxHeight: 300, overflowY: 'auto' }}>
                    {clientSuggestions.map((opt) => (
                      <div
                        key={opt.id}
                        className="px-2 py-1 hover-bg"
                        style={{ cursor: 'pointer' }}
                        onClick={() => selectCliente(opt)}
                      >
                        <div className="fw-semibold small">{opt.nome}</div>
                        <div className="text-muted small">{opt.cpf_cnpj || '-'}</div>
                      </div>
                    ))}
                  </div>
                )}
                {meVendedor?.tipo === 'TELEVENDAS' && selectedClient && (
                  <div className="small mt-2">
                    <span className="text-muted">Vendedor do cliente: </span>
                    <span className="fw-semibold">{selectedClient.nome_vendedor || (selectedClient.id_vendedor_externo ? selectedClient.id_vendedor_externo : '—')}</span>
                    <span className="ms-2">•</span>
                    <span className="ms-2">
                      Comissão: {selectedClient.id_vendedor_externo ? '1%' : '5%'}
                    </span>
                  </div>
                )}
              </div>
            </Col>
            <Col lg={2}>
              <Form.Label>Vendedor</Form.Label>
              <Form.Control type="text" value={meVendedor?.nome || meVendedor?.id_vendedor_externo || ''} disabled />
            </Col>
            <Col lg={2}>
              <Form.Label>Forma de recebimento</Form.Label>
              <Form.Select value={formaRecebimento} onChange={(e) => { setFormaRecebimento(e.target.value); setCondicaoPagamento(''); setDescontoPercent(0) }}>
                {receiveForms.length > 0 ? (
                  receiveForms.map((rf) => (
                    <option key={rf.id} value={rf.nome}>{rf.nome}</option>
                  ))
                ) : (
                  <>
                    <option value="Boleto">Boleto</option>
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                    <option value="Pix">Pix</option>
                    <option value="Dinheiro">Dinheiro</option>
                  </>
                )}
              </Form.Select>
            </Col>
            <Col lg={4}>
              <Form.Label>Condição de pagamento</Form.Label>
              <Form.Select
                value={condicaoPagamento}
                onChange={(e) => setCondicaoPagamento(e.target.value)}
              >
                <option value="">Selecione</option>
                {condicaoDespadronizada && condicaoPagamento ? (
                  <option value={condicaoPagamento}>
                    {isTinyOrder ? `${condicaoPagamento} (Despadronizado)` : condicaoPagamento}
                  </option>
                ) : null}
                {!paymentConditions.some((c) => c.name.trim() === 'À vista') ? (
                  <option value="À vista">À vista</option>
                ) : null}
                {!paymentConditions.some((c) => c.name.trim() === '7 dias') ? (
                  <option value="7 dias">7 dias</option>
                ) : null}
                {PAYMENT_ADMIN_TIER_ORDER.map((tier) => {
                  const tierConds = paymentConditions.filter((c) => c.admin_tier === tier)
                  if (tierConds.length === 0) return null
                  return (
                    <optgroup key={tier} label={PAYMENT_ADMIN_TIER_LABELS[tier] ?? `Faixa ${tier}`}>
                      {tierConds.map((c) => {
                        const minStr =
                          c.valor_minimo != null && c.valor_minimo > 0
                            ? Number(c.valor_minimo).toLocaleString('pt-BR', {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 2,
                              })
                            : ''
                        const labelText = minStr !== '' ? `${c.name} (Min. ${minStr})` : c.name
                        return (
                          <option key={c.id} value={formatPaymentConditionSelectValue(c.id)}>
                            {labelText}
                          </option>
                        )
                      })}
                    </optgroup>
                  )
                })}
              </Form.Select>
            </Col>
            {/* removed extra placeholder column */}
          </Row>
          <Row className="mt-2">
            <Col lg={4}>
              <div className="d-flex gap-3">
                <Button variant="link" className="p-0 text-primary" style={{ textDecoration: 'underline' }} onClick={openNewContact}>
                  Novo cliente
                </Button>
                {selectedClient && (
                  <Button
                    variant="link"
                    className="p-0 text-primary"
                    style={{ textDecoration: 'underline' }}
                    onClick={openExistingContactInfo}
                    disabled={isLoadingContactInfo}
                  >
                    Dados do cliente
                  </Button>
                )}
              </div>
            </Col>
          </Row>
          {showContactAccordion && (
            <div className="mt-3 border rounded p-3 bg-light">
              <div className="fw-semibold mb-3">{contactMode === 'new' ? 'Criar contato' : 'Informações sobre o cliente'}</div>
              <Row className="g-3">
                <Col md={6}>
                  <Form.Label>Nome</Form.Label>
                  <Form.Control value={contactForm.nome} onChange={(e) => { setContactForm((s) => ({ ...s, nome: e.target.value })); setContactFormErrors((err) => ({ ...err, nome: '' })) }} />
                  {contactFormErrors.nome && <div className="text-danger small mt-1">{contactFormErrors.nome}</div>}
                </Col>
                <Col md={3}>
                  <Form.Label>CPF/CNPJ</Form.Label>
                  <Form.Control value={contactForm.cpf_cnpj} onChange={(e) => { setContactForm((s) => ({ ...s, cpf_cnpj: maskCpfCnpj(e.target.value) })); setContactFormErrors((err) => ({ ...err, cpf_cnpj: '' })) }} />
                  {contactFormErrors.cpf_cnpj && <div className="text-danger small mt-1">{contactFormErrors.cpf_cnpj}</div>}
                </Col>
                <Col md={3}>
                  <Form.Label>Inscrição Estadual</Form.Label>
                  <Form.Control value={contactForm.ie} onChange={(e) => { setContactForm((s) => ({ ...s, ie: e.target.value })); setContactFormErrors((err) => ({ ...err, ie: '' })) }} />
                  {contactFormErrors.ie && <div className="text-danger small mt-1">{contactFormErrors.ie}</div>}
                </Col>
                <Col md={3}>
                  <Form.Label>Contribuinte</Form.Label>
                  <Form.Select value={contactForm.contribuinte} onChange={(e) => setContactForm((s) => ({ ...s, contribuinte: e.target.value }))}>
                    <option value="1">Sim</option>
                    <option value="0">Não</option>
                  </Form.Select>
                </Col>
                <Col md={3}>
                  <Form.Label>Contato</Form.Label>
                  <Form.Control value={contactForm.contatos} onChange={(e) => setContactForm((s) => ({ ...s, contatos: e.target.value }))} />
                </Col>
                <Col md={3}>
                  <Form.Label>Telefone</Form.Label>
                  <Form.Control value={contactForm.fone} onChange={(e) => { setContactForm((s) => ({ ...s, fone: maskPhone(e.target.value) })); setContactFormErrors((err) => ({ ...err, fone: '' })) }} />
                  {contactFormErrors.fone && <div className="text-danger small mt-1">{contactFormErrors.fone}</div>}
                </Col>
                <Col md={3}>
                  <Form.Label>Email</Form.Label>
                  <Form.Control value={contactForm.email} onChange={(e) => { setContactForm((s) => ({ ...s, email: e.target.value })); setContactFormErrors((err) => ({ ...err, email: '' })) }} />
                  {contactFormErrors.email && <div className="text-danger small mt-1">{contactFormErrors.email}</div>}
                </Col>
                <Col md={12}>
                  <Form.Label>Observações</Form.Label>
                  <Form.Control as="textarea" rows={2} value={contactForm.obs} readOnly />
                </Col>
              </Row>
              <div className="d-flex justify-content-end gap-2 mt-3">
                <Button variant="secondary" onClick={() => setShowContactAccordion(false)}>Cancelar</Button>
                <Button variant="primary" onClick={saveContact} disabled={isSavingContact}>
                  {isSavingContact ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          )}
        </Card.Body>
      </Card>

      {/* Sessão 2 - Produtos */} 
      {condicaoPagamento && (
        <Card className="border-0 shadow-sm mb-3">
          <Card.Body>
          <div className="mb-3">
            <Form.Label className="fw-semibold">Adicionar produtos </Form.Label>
            <Form.Control
              type="text"
              placeholder="Digite código SKU ou nome do produto"
              value={catalogQuery}
              onChange={(e) => setCatalogQuery(e.target.value)}
            />
            {catalogQtyError && (
              <div className="text-danger small mt-2">{catalogQtyError}</div>
            )}
            <div className="mt-2 border rounded d-none d-md-block" style={{ maxHeight: 320, overflowY: 'auto' }}>
              {catalogLoading ? (
                <div className="p-2 small text-muted">Carregando produtos...</div>
              ) : displayedCatalog.length === 0 ? (
                <div className="p-2 small text-muted">Nenhum produto encontrado.</div>
              ) : (
                <div className="list-group list-group-flush">
                  {displayedCatalog.map((p) => (
                    <div key={`${p.id}-${p.codigo || 'x'}`} className="list-group-item py-2 d-flex justify-content-between align-items-center gap-2">
                      <div className="me-2 flex-grow-1 min-w-0">
                        <div className="fw-semibold small">{p.nome}</div>
                        <div className="text-muted small">SKU: {p.codigo || '-'}</div>
                        {p.preco != null && (
                          <div className="text-muted small">
                            Preço:{' '}
                            {Number(((p.preco || 0) * (1 + markupPct)) || 0).toLocaleString('pt-BR', {
                              style: 'currency',
                              currency: 'BRL',
                            })}
                          </div>
                        )}
                      </div>
                      <div className="d-flex gap-1 flex-shrink-0 align-items-center">
                        <Button variant="outline-secondary" size="sm" title="Detalhes" onClick={() => openCatalogDetail(p)}>
                          <IconifyIcon icon="ri:search-line" />
                        </Button>
                        <Button variant="outline-secondary" size="sm" title="Diminuir 1" onClick={() => setQtyForCatalogItem(p, getQtdInOrderForCatalogRow(p) - 1)}>
                          <IconifyIcon icon="ri:subtract-line" />
                        </Button>
                        <Form.Control
                          size="sm"
                          type="number"
                          inputMode="numeric"
                          step={1}
                          min={0}
                          className="qty-input"
                          style={{ width: 64 }}
                          value={getQtdInOrderForCatalogRow(p) || 0}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            if (!Number.isFinite(v)) return
                            setQtyForCatalogItem(p, v)
                          }}
                        />
                        <Button variant="primary" size="sm" title="Aumentar 1" onClick={() => setQtyForCatalogItem(p, getQtdInOrderForCatalogRow(p) + 1)}>
                          <IconifyIcon icon="ri:add-line" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-2 border rounded d-md-none" style={{ maxHeight: 360, overflowY: 'auto' }}>
              {catalogLoading ? (
                <div className="p-2 small text-muted">Carregando produtos...</div>
              ) : displayedCatalog.length === 0 ? (
                <div className="p-2 small text-muted">Nenhum produto encontrado.</div>
              ) : (
                <div className="list-group list-group-flush">
                  {displayedCatalog.map((p) => (
                    <div key={`m-${p.id}-${p.codigo || 'x'}`} className="list-group-item py-2">
                      <div className="fw-semibold small">{p.nome}</div>
                      <div className="text-muted small">SKU: {p.codigo || '-'}</div>
                      {p.preco != null && (
                        <div className="text-muted small mb-2">
                          Preço:{' '}
                          {Number(((p.preco || 0) * (1 + markupPct)) || 0).toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </div>
                      )}
                      <div className="d-flex gap-1 align-items-center flex-wrap">
                        <Button variant="outline-secondary" size="sm" title="Detalhes" onClick={() => openCatalogDetail(p)}>
                          <IconifyIcon icon="ri:search-line" />
                        </Button>
                        <Button variant="outline-secondary" size="sm" title="Diminuir 1" onClick={() => setQtyForCatalogItem(p, getQtdInOrderForCatalogRow(p) - 1)}>
                          <IconifyIcon icon="ri:subtract-line" />
                        </Button>
                        <Form.Control
                          size="sm"
                          type="number"
                          inputMode="numeric"
                          step={1}
                          min={0}
                          className="qty-input"
                          style={{ width: 64 }}
                          value={getQtdInOrderForCatalogRow(p) || 0}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            if (!Number.isFinite(v)) return
                            setQtyForCatalogItem(p, v)
                          }}
                        />
                        <Button variant="primary" size="sm" title="Aumentar 1" onClick={() => setQtyForCatalogItem(p, getQtdInOrderForCatalogRow(p) + 1)}>
                          <IconifyIcon icon="ri:add-line" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="d-flex justify-content-end mt-2">
              <Button size="sm" variant="outline-secondary" onClick={() => setShowCatalogListModal(true)}>Ver lista</Button>
            </div>

          </div>

          <div className="d-flex justify-content-start mt-3">
            <Button
              variant="link"
              className="p-0 text-primary"
              style={{ textDecoration: 'underline' }}
              onClick={openHistory}
            >
              Histórico de produtos do cliente
            </Button>
          </div>
          </Card.Body>
        </Card>
      )}

      {/* Sessão 3 - Pagamento */} 
      {condicaoPagamento && (
        <Card className="border-0 shadow-sm">
          <Card.Header className="bg-white fw-semibold">Pagamento</Card.Header>
          <Card.Body>
            <Form onSubmit={handleSubmit}>
            <Row className="g-3">
              <Col md={4}>
                <Form.Label>Data da venda</Form.Label>
                <Form.Control type="date" value={form.data} onChange={(e) => handleChange('data', e.target.value)} />
              </Col>
              {/* Forma de recebimento moved to header */} 
            </Row>

            <Row className="g-3 mt-1">
              <Col md={4}>
                <Form.Label>Subtotal</Form.Label>
                <Form.Control type="text" value={subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} disabled />
              </Col>
              <Col md={4}>
                <Form.Label>Desconto (%)</Form.Label>
                <Form.Control
                  type="number"
                  min={0}
                  max={2}
                  step={0.01}
                  disabled={!descontoHabilitado}
                  value={descontoHabilitado ? descontoPercent : 0}
                  onChange={(e) => setDescontoPercent(Math.min(2, Math.max(0, Number(e.target.value))))}
                />
                {descontoHabilitado ? (
                  <small className="text-muted">Máx. 2%</small>
                ) : (
                  <small className="text-muted">Desconto disponível para Pix ou Boleto 7 dias</small>
                )}
              </Col>
              <Col md={4}>
                <Form.Label>Total do Pedido</Form.Label>
                <Form.Control type="text" value={totalComDesconto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} disabled />
              </Col>
            </Row>

            {String(formaRecebimento || '').trim().toLowerCase() === 'boleto' && condicaoPagamento && (
              <div className="mt-3">
                {parcelas.length > 0 && (
                  <>
                    <div className="fw-semibold mb-2">Parcelas</div>
                    <div className="table-responsive">
                      <Table size="sm" className="mb-0">
                        <thead>
                          <tr>
                            <th>Parcela</th>
                            <th>Vencimento</th>
                            <th>Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parcelas.map((p) => (
                            <tr key={p.numero}>
                              <td>{p.numero}</td>
                              <td>{p.data.toLocaleDateString('pt-BR')}</td>
                              <td>{p.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  </>
                )}
                {pagamentoParceladoErro && (
                  <div className={`text-danger ${parcelas.length > 0 ? 'mt-2' : ''}`}>{pagamentoParceladoErro}</div>
                )}
              </div>
            )}

            <div className="mt-3 border rounded p-3">
              <div className="fw-semibold mb-2">Endereço de entrega</div>
              <Form.Check
                id="endereco-diferente-entrega"
                type="checkbox"
                label="Informar endereço diferente para entrega"
                checked={isDifferentDeliveryAddress}
                onChange={(e) => setIsDifferentDeliveryAddress(e.target.checked)}
                className="mb-3"
              />
              <Row className="g-2">
                <Col md={5}>
                  <Form.Label>Endereço</Form.Label>
                  <Form.Control
                    value={deliveryAddress.endereco}
                    disabled={!isDifferentDeliveryAddress}
                    onChange={(e) => setDeliveryAddress((s) => ({ ...s, endereco: e.target.value }))}
                  />
                </Col>
                <Col md={2}>
                  <Form.Label>Número</Form.Label>
                  <Form.Control
                    value={deliveryAddress.numero}
                    disabled={!isDifferentDeliveryAddress}
                    onChange={(e) => setDeliveryAddress((s) => ({ ...s, numero: e.target.value }))}
                  />
                </Col>
                <Col md={5}>
                  <Form.Label>Complemento</Form.Label>
                  <Form.Control
                    value={deliveryAddress.complemento}
                    disabled={!isDifferentDeliveryAddress}
                    onChange={(e) => setDeliveryAddress((s) => ({ ...s, complemento: e.target.value }))}
                  />
                </Col>
                <Col md={4}>
                  <Form.Label>Bairro</Form.Label>
                  <Form.Control
                    value={deliveryAddress.bairro}
                    disabled={!isDifferentDeliveryAddress}
                    onChange={(e) => setDeliveryAddress((s) => ({ ...s, bairro: e.target.value }))}
                  />
                </Col>
                <Col md={3}>
                  <Form.Label>CEP</Form.Label>
                  <Form.Control
                    value={deliveryAddress.cep}
                    disabled={!isDifferentDeliveryAddress}
                    onChange={(e) => setDeliveryAddress((s) => ({ ...s, cep: e.target.value }))}
                  />
                </Col>
                <Col md={3}>
                  <Form.Label>Cidade</Form.Label>
                  <Form.Control
                    value={deliveryAddress.cidade}
                    disabled={!isDifferentDeliveryAddress}
                    onChange={(e) => setDeliveryAddress((s) => ({ ...s, cidade: e.target.value }))}
                  />
                </Col>
                <Col md={2}>
                  <Form.Label>UF</Form.Label>
                  <Form.Control
                    value={deliveryAddress.uf}
                    disabled={!isDifferentDeliveryAddress}
                    onChange={(e) => setDeliveryAddress((s) => ({ ...s, uf: e.target.value }))}
                  />
                </Col>
              </Row>
            </div>

            <div className="d-flex align-items-center justify-content-between gap-2 mt-4">
              <Button variant="secondary" onClick={() => router.push(entityParam === 'proposta' ? '/propostas' : '/pedidos')}>
                Cancelar
              </Button>
              {(entityParam === 'proposta' || isAdminUser || isNew) && (
                <Button
                  type="submit"
                  disabled={!!pagamentoParceladoErro || isSubmitting}
                >
                  {entityParam === 'proposta'
                    ? isNew
                      ? 'Enviar Proposta'
                      : 'Salvar alterações'
                    : 'Enviar Pedido'}
                </Button>
              )}
            </div>
          </Form>
          </Card.Body>
        </Card>
      )}

      <Modal show={showPreview} onHide={() => setShowPreview(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Pré-visualização</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="text-center">
            {previewUrl ? (
              <img src={previewUrl} alt="Pré-visualização" className="img-fluid" />
            ) : (
              <div className="text-muted">Sem imagem disponível</div>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowPreview(false)}>Fechar</Button>
        </Modal.Footer>
      </Modal>

      {/* Modal: Resultado da chamada ao Tiny (mostrar retorno e objeto enviado) */}
      <Modal show={showTinyResult} onHide={() => { setShowTinyResult(false); setTinyResult(null); setSentObjectResult(null) }} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>Resposta do Tiny</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="mb-3">
            <div className="fw-semibold">Objeto enviado</div>
            <pre style={{ maxHeight: 240, overflow: 'auto', background: '#f8f9fa', padding: 12 }}>{JSON.stringify(sentObjectResult, null, 2)}</pre>
          </div>
          <div>
            <div className="fw-semibold">Resposta da API Tiny</div>
            <pre style={{ maxHeight: 320, overflow: 'auto', background: '#f8f9fa', padding: 12 }}>{JSON.stringify(tinyResult, null, 2)}</pre>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => { setShowTinyResult(false); setTinyResult(null); setSentObjectResult(null) }}>Fechar</Button>
        </Modal.Footer>
      </Modal>

      {/* Detalhes do produto do catálogo */}
      <Modal show={showCatalogDetail} onHide={() => setShowCatalogDetail(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Detalhes do produto</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {catalogDetailLoading ? (
            <div className="d-flex align-items-center gap-2"><Spinner animation="border" size="sm" /><span>Carregando detalhes...</span></div>
          ) : catalogDetailError ? (
            <div className="text-danger small">{catalogDetailError}</div>
          ) : !catalogSelected ? (
            <div className="text-muted small">Nenhum produto selecionado.</div>
          ) : (
            <div>
              <div className="mb-2"><strong>Nome:</strong> {catalogDetail?.nome ?? catalogSelected.nome}</div>
              <div className="mb-2"><strong>SKU:</strong> {(catalogDetail?.codigo ?? catalogSelected.codigo) || '-'}</div>
              <div className="mb-2"><strong>Preço:</strong> {Number(((catalogDetail?.preco ?? catalogSelected.preco) * (1 + markupPct)) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
              {catalogDetail?.unidade && <div className="mb-2"><strong>Unidade:</strong> {catalogDetail.unidade}</div>}
              {catalogDetail?.estoque != null && <div className="mb-2"><strong>Estoque:</strong> {catalogDetail.estoque}</div>}
              {catalogDetail?.descricao && <div className="mb-2"><strong>Descrição:</strong> <div className="small text-muted">{catalogDetail.descricao}</div></div>}
              <div className="text-center">
                {(catalogDetail?.imagem ?? catalogSelected.imagem) ? (
                  <img src={(catalogDetail?.imagem ?? catalogSelected.imagem) as string} alt={catalogDetail?.nome ?? catalogSelected.nome} className="img-fluid" />
                ) : (
                  <div className="text-muted">Sem imagem disponível</div>
                )}
              </div>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          {catalogSelected && !catalogDetailLoading && (
            <Button variant="primary" onClick={() => { addFromCatalog({ ...catalogSelected, preco: catalogDetail?.preco ?? catalogSelected.preco, imagem: catalogDetail?.imagem ?? catalogSelected.imagem }); setShowCatalogDetail(false) }}>
              Adicionar ao pedido
            </Button>
          )}
          <Button variant="secondary" onClick={() => setShowCatalogDetail(false)}>Fechar</Button>
        </Modal.Footer>
      </Modal>

      {/* Modal: edição de quantidade do item (usado pelo badge e quando + excede estoque) */}
      <Modal show={showQtyModal} onHide={() => { setShowQtyModal(false); setQtyModalError(null) }} centered>
        <Modal.Header closeButton>
          <Modal.Title>Editar quantidade</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {qtyModalLoading ? (
            <div className="d-flex align-items-center gap-2"><Spinner animation="border" size="sm" /><span>Verificando estoque...</span></div>
          ) : (
            <>
              <div className="mb-2 fw-semibold">{qtyModalProduct?.nome}</div>
              <Form.Group>
                <Form.Label>Quantidade desejada</Form.Label>
                <Form.Control type="number" min={1} value={qtyModalValue} onChange={(e) => setQtyModalValue(Math.max(1, Number(e.target.value)))} />
              </Form.Group>
              {qtyModalStock != null && (
                <div className="small text-muted mt-2">Estoque atual: {qtyModalStock}</div>
              )}
              {qtyModalError && (
                <div className="text-danger mt-2">{qtyModalError}</div>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => { setShowQtyModal(false); setQtyModalError(null) }}>Fechar</Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!qtyModalProduct) return
              if (qtyModalStock != null && qtyModalValue > qtyModalStock) {
                setQtyModalError(`Estoque não disponível, estoque atual: ${qtyModalStock}`)
                return
              }
              // apply quantity
              setItens((arr) => {
                const idx = arr.findIndex((it) => (it.sku || '').toLowerCase() === (qtyModalProduct?.codigo || '').toLowerCase())
                if (idx >= 0) {
                  const next = [...arr]
                  next[idx] = { ...next[idx], quantidade: qtyModalValue }
                  return next
                }
                const nextId = arr.reduce((m, it) => Math.max(m, it.id), 0) + 1
                return [
                  ...arr,
                  {
                    id: nextId,
                    produtoId: qtyModalProduct.id,
                    nome: qtyModalProduct.nome,
                    sku: qtyModalProduct.codigo,
                    quantidade: qtyModalValue,
                    unidade: 'PC',
                    preco: Number(qtyModalProduct.preco || 0),
                    originalPreco: Number(qtyModalProduct.preco || 0),
                    imagemUrl: qtyModalProduct.imagem || undefined,
                  },
                ]
              })
              setShowQtyModal(false)
              setQtyModalError(null)
            }}
          >
            Salvar
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Modal: Lista completa de itens (abre pela lista rolável) */}
      <Modal
        className="pedido-modal-align-page"
        show={showCatalogListModal}
        onHide={() => setShowCatalogListModal(false)}
        centered
        scrollable
        dialogClassName="pedido-modal-wide"
      >
        <Modal.Header closeButton>
          <Modal.Title>Lista de itens</Modal.Title>
        </Modal.Header>
        <Modal.Body className="pt-0">
          {catalogQtyError && (
            <div className="text-danger small py-2">{catalogQtyError}</div>
          )}
          <div className="d-none d-md-block" style={{ overflowX: 'hidden', overflowY: 'auto', maxHeight: 'min(72vh, 720px)' }}>
            <Table hover size="sm" className="mb-0 pedido-line-items-table">
              <thead>
                <tr>
                  <th style={{ width: '3%' }}>N°</th>
                  <th className="col-nome" style={{ width: '26%' }}>Nome</th>
                  <th style={{ width: '9%' }}>SKU</th>
                  <th style={{ width: '14%' }}>Qtde</th>
                  <th style={{ width: '6%' }}>Un.</th>
                  <th style={{ width: '6%' }}>Est.</th>
                  <th style={{ width: '10%' }}>Preço un.</th>
                  <th style={{ width: '10%' }}>Total</th>
                  <th style={{ width: '8%' }} className="text-end">Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item, idx) => {
                  const totalItem = item.quantidade * item.preco
                  return (
                    <tr key={item.id}>
                      <td>{idx + 1}</td>
                      <td className="col-nome">
                        <div className="d-flex gap-2 align-items-center">
                          {item.imagemUrl ? (
                            <img
                              src={item.imagemUrl}
                              alt="Produto"
                              style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6, cursor: 'pointer' }}
                              onClick={() => { setPreviewUrl(item.imagemUrl || null); setShowPreview(true) }}
                              className="flex-shrink-0"
                            />
                          ) : null}
                          <span>{item.nome}</span>
                        </div>
                      </td>
                      <td className="small">{item.sku || '—'}</td>
                      <td>
                        <div className="d-flex gap-1 align-items-center justify-content-center">
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            className="px-2 py-0"
                            title="Diminuir 1"
                            onClick={() => setQtyForLineItem(item.id, item.quantidade - 1)}
                          >
                            <IconifyIcon icon="ri:subtract-line" />
                          </Button>
                          <Form.Control
                            size="sm"
                            type="number"
                            inputMode="numeric"
                            step={1}
                            min={0}
                            className="qty-input text-center"
                            style={{ width: 56 }}
                            value={item.quantidade}
                            onChange={(e) => {
                              const v = Number(e.target.value)
                              if (!Number.isFinite(v)) return
                              setQtyForLineItem(item.id, v)
                            }}
                          />
                          <Button
                            variant="primary"
                            size="sm"
                            className="px-2 py-0"
                            title="Aumentar 1"
                            onClick={() => setQtyForLineItem(item.id, item.quantidade + 1)}
                          >
                            <IconifyIcon icon="ri:add-line" />
                          </Button>
                        </div>
                      </td>
                      <td>{item.unidade}</td>
                      <td>{item.estoque ?? '—'}</td>
                      <td className="small">
                        {item.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="small fw-semibold">
                        {totalItem.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                      <td className="text-end">
                        <Button variant="outline-danger" size="sm" onClick={() => removeItem(item.id)} title="Remover">
                          <IconifyIcon icon="ri:delete-bin-line" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </div>
          {/* Mobile (sm) - Itens empilhados dentro do modal */}
          <div className="d-block d-md-none mt-3">
            {itens.map((item, idx) => {
              const totalItem = item.quantidade * item.preco
              return (
                <div key={item.id} className="border rounded p-2 mb-2">
                  <div className="small text-muted">N° {idx + 1}</div>
                  <Form.Group className="mt-1">
                    <Form.Label className="mb-1">Nome</Form.Label>
                    <div className="d-flex gap-2 align-items-center">
                      {item.imagemUrl ? (
                        <img
                          src={item.imagemUrl}
                          alt="Produto"
                          style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, cursor: 'pointer' }}
                          onClick={() => { setPreviewUrl(item.imagemUrl || null); setShowPreview(true) }}
                          className="flex-shrink-0"
                        />
                      ) : null}
                      <div className="flex-grow-1">{item.nome}</div>
                    </div>
                  </Form.Group>
                  <Row className="g-2 mt-1">
                    <Col xs={6}>
                      <Form.Label className="mb-1">SKU</Form.Label>
                      <div className="form-control-plaintext">{item.sku || ''}</div>
                    </Col>
                    <Col xs={6}>
                      <Form.Label className="mb-1">Estoque</Form.Label>
                      <div className="form-control-plaintext">{item.estoque ?? 0}</div>
                    </Col>
                  </Row>
                  <Row className="g-2 mt-1">
                    <Col xs={12}>
                      <Form.Label className="mb-1">Qtde</Form.Label>
                      <div className="d-flex gap-1 align-items-center">
                        <Button
                          variant="outline-secondary"
                          size="sm"
                          title="Diminuir 1"
                          onClick={() => setQtyForLineItem(item.id, item.quantidade - 1)}
                        >
                          <IconifyIcon icon="ri:subtract-line" />
                        </Button>
                        <Form.Control
                          size="sm"
                          type="number"
                          inputMode="numeric"
                          step={1}
                          min={0}
                          className="qty-input text-center"
                          style={{ width: 64 }}
                          value={item.quantidade}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            if (!Number.isFinite(v)) return
                            setQtyForLineItem(item.id, v)
                          }}
                        />
                        <Button
                          variant="primary"
                          size="sm"
                          title="Aumentar 1"
                          onClick={() => setQtyForLineItem(item.id, item.quantidade + 1)}
                        >
                          <IconifyIcon icon="ri:add-line" />
                        </Button>
                      </div>
                    </Col>
                    <Col xs={6}>
                      <Form.Label className="mb-1">Unidade</Form.Label>
                      <div className="form-control-plaintext">{item.unidade}</div>
                    </Col>
                    <Col xs={6}>
                      <Form.Label className="mb-1">Preço un</Form.Label>
                      <div className="form-control-plaintext">{item.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                    </Col>
                    <Col xs={6}>
                      <Form.Label className="mb-1">Total</Form.Label>
                      <div className="form-control-plaintext">{totalItem.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                    </Col>
                  </Row>
                  <div className="d-flex justify-content-end gap-2 mt-2">
                    <Button variant="outline-danger" size="sm" onClick={() => removeItem(item.id)} title="Remover">
                      <IconifyIcon icon="ri:delete-bin-line" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowCatalogListModal(false)}>Fechar</Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showSearch} onHide={() => setShowSearch(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Buscar produto</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Em breve: busca de produtos por descrição, SKU ou código.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowSearch(false)}>Fechar</Button>
        </Modal.Footer>
      </Modal>

      <Modal
        className="pedido-modal-align-page"
        show={showHistory}
        onHide={closeHistory}
        centered
        scrollable
        dialogClassName="pedido-modal-wide"
      >
        <Modal.Header closeButton>
          <Modal.Title>Histórico de produtos</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {historyLoading ? (
            <div className="d-flex align-items-center gap-2"><Spinner animation="border" size="sm" /><span>Carregando histórico...</span></div>
          ) : historyError ? (
            <div className="text-danger small">{historyError}</div>
          ) : historyItems.length === 0 ? (
            <div className="text-muted small">Nenhum histórico encontrado para este cliente.</div>
          ) : (
            <>
              {catalogQtyError && (
                <div className="text-danger small pb-2">{catalogQtyError}</div>
              )}
              <div
                className="d-flex flex-wrap gap-3 align-items-start small text-body-secondary mb-3 pb-2 border-bottom"
                role="note"
                aria-label="Legenda das cores por idade da venda"
              >
                <div className="d-flex align-items-center gap-2">
                  <span
                    className="d-inline-block rounded flex-shrink-0"
                    style={{
                      width: 14,
                      height: 14,
                      backgroundColor: 'var(--bs-success-bg-subtle, #d1e7dd)',
                      border: '1px solid var(--bs-success-border-subtle, #a3cfbb)',
                    }}
                    aria-hidden
                  />
                  <span>
                    <strong className="text-body">Verde:</strong> venda nos últimos 30 dias (até cerca de 1 mês).
                  </span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span
                    className="d-inline-block rounded flex-shrink-0"
                    style={{
                      width: 14,
                      height: 14,
                      backgroundColor: 'var(--bs-warning-bg-subtle, #fff3cd)',
                      border: '1px solid var(--bs-warning-border-subtle, #ffe69c)',
                    }}
                    aria-hidden
                  />
                  <span>
                    <strong className="text-body">Laranja:</strong> venda entre 31 dias e 3 meses atrás.
                  </span>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span
                    className="d-inline-block rounded flex-shrink-0"
                    style={{
                      width: 14,
                      height: 14,
                      backgroundColor: 'var(--bs-danger-bg-subtle, #f8d7da)',
                      border: '1px solid var(--bs-danger-border-subtle, #f1aeb5)',
                    }}
                    aria-hidden
                  />
                  <span>
                    <strong className="text-body">Vermelho:</strong> venda há mais de 3 meses.
                  </span>
                </div>
              </div>
              <div style={{ overflowX: 'hidden', overflowY: 'auto', maxHeight: 'min(70vh, 640px)' }}>
                <Table hover size="sm" className="mb-0 pedido-line-items-table">
                  <thead>
                    <tr>
                      <th style={{ width: '10%' }}>Data</th>
                      <th style={{ width: '10%' }}>SKU</th>
                      <th style={{ width: '22%' }}>Nome</th>
                      <th style={{ width: '9%' }}>Preço</th>
                      <th style={{ width: '7%' }}>Qtd.</th>
                      <th style={{ width: '9%' }}>Nº ped.</th>
                      <th style={{ width: '18%' }}>Neste pedido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyItems.map((h) => {
                      const variant = getRowVariantByDate(h.created_at)
                      const precoNum = typeof h.preco === 'string' ? Number(h.preco) : (h.preco || 0)
                      const qtdNum = typeof h.quantidade === 'string' ? Number(h.quantidade) : h.quantidade
                      const histAsCatalog: CatalogItem = {
                        id: h.produto_id,
                        nome: h.nome || '',
                        codigo: h.codigo || undefined,
                        preco: Number.isFinite(Number(precoNum)) ? Number(precoNum) : undefined,
                      }
                      const podeEditarPedido = Number(h.produto_id) > 0
                      const qtdPedido = getQtdInOrderForCatalogRow(histAsCatalog)
                      return (
                        <tr key={h.id} className={`table-${variant}`}>
                          <td className="small">{new Date(h.created_at).toLocaleDateString('pt-BR')}</td>
                          <td className="small">{h.codigo || '—'}</td>
                          <td className="small col-nome">{h.nome || '—'}</td>
                          <td className="small">{Number(precoNum || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                          <td className="small">{Number(qtdNum || 0)}</td>
                          <td className="small">{h.tiny_orders?.numero_pedido || '—'}</td>
                          <td>
                            {podeEditarPedido ? (
                              <div className="d-flex gap-1 align-items-center flex-wrap justify-content-end">
                                <Button
                                  variant="outline-secondary"
                                  size="sm"
                                  className="px-2 py-0"
                                  title="Diminuir 1 no pedido atual"
                                  onClick={() => setQtyForCatalogItem(histAsCatalog, qtdPedido - 1)}
                                >
                                  <IconifyIcon icon="ri:subtract-line" />
                                </Button>
                                <Form.Control
                                  size="sm"
                                  type="number"
                                  inputMode="numeric"
                                  step={1}
                                  min={0}
                                  className="qty-input text-center"
                                  style={{ width: 52 }}
                                  value={qtdPedido}
                                  onChange={(e) => {
                                    const v = Number(e.target.value)
                                    if (!Number.isFinite(v)) return
                                    setQtyForCatalogItem(histAsCatalog, v)
                                  }}
                                />
                                <Button
                                  variant="primary"
                                  size="sm"
                                  className="px-2 py-0"
                                  title="Aumentar 1 no pedido atual"
                                  onClick={() => setQtyForCatalogItem(histAsCatalog, qtdPedido + 1)}
                                >
                                  <IconifyIcon icon="ri:add-line" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-muted small">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </Table>
              </div>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeHistory}>Fechar</Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showContactResultModal} onHide={() => setShowContactResultModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Resultado do contato</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {String(contactResponse?.retorno?.status || '').toUpperCase() === 'ERRO' && (
            <div className="mb-3">
              <div className="fw-semibold text-danger mb-2">Erros encontrados</div>
              <ul className="mb-0">
                {extractTinyContactErrors(contactResponse).map((msg, idx) => (
                  <li key={`${msg}-${idx}`} className="text-danger">{msg}</li>
                ))}
              </ul>
            </div>
          )}
          {String(contactResponse?.retorno?.status || '').toUpperCase() === 'OK' && (
            <div className="text-success">Contato salvo com sucesso.</div>
          )}
          {!contactResponse?.retorno && !contactResponse?.erro && (
            <div className="text-muted">Sem detalhes para exibir.</div>
          )}
          {contactResponse?.erro && (
            <div className="text-danger">{String(contactResponse.erro)}</div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowContactResultModal(false)}>Fechar</Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}


