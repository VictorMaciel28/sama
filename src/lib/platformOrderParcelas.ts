import { prisma } from '@/lib/prisma'
import { parsePaymentConditionSelectValue } from '@/lib/paymentConditions'
import type { ShareParcelaResumo } from '@/lib/platformOrderSharePayload'
import { formatSqlDateOnly, parseYmdToLocalDate } from '@/lib/calendarDate'

function normForma(s: string | null | undefined): string {
  return String(s || '').trim().toLowerCase()
}

/**
 * Mesma regra de `diasParcelas` em `pedidos/[id]/page.tsx` (boleto + texto da condição).
 */
export function extractDiasParcelasPedidoUi(
  formaRecebimento: string | null | undefined,
  condicaoPagamento: string,
  nomeParcelasFonte: string
): number[] {
  if (normForma(formaRecebimento) !== 'boleto') return []
  const condTrim = String(condicaoPagamento || '').trim()
  if (!condTrim) return []

  const nv = String(nomeParcelasFonte || '').trim()
  if (nv === '7 dias' || condTrim === '7 dias') return [7]

  const raw = String(nomeParcelasFonte || condicaoPagamento || '')
  if (/\bdireto\b/i.test(raw) && !/\d+\s*\/\s*\d+/.test(raw)) {
    const m = raw.match(/\d+/)
    return m ? [Number(m[0])].filter((n) => !isNaN(n)) : []
  }
  const matches = raw.match(/\d+/g) || []
  return matches.map((d) => Number(d)).filter((n) => !isNaN(n))
}

function parseOrderDataToDate(data: unknown): Date {
  if (data instanceof Date && !isNaN(data.getTime())) {
    return parseYmdToLocalDate(formatSqlDateOnly(data))
  }
  const s = String(data ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return parseYmdToLocalDate(s.slice(0, 10))
  }
  const d = new Date(s)
  return !isNaN(d.getTime()) ? d : new Date()
}

/**
 * Parcelas com datas e valores alinhados à UI do pedido/proposta (total do pedido dividido pelos vencimentos).
 */
export async function computeParcelasResumoForPlatformOrder(order: any): Promise<ShareParcelaResumo[]> {
  const forma = order.forma_recebimento ?? null
  const condPersist = String(order.condicao_pagamento ?? '').trim()

  let nomeFonte = condPersist
  const pcId = parsePaymentConditionSelectValue(condPersist)
  if (pcId != null) {
    const row = await prisma.payment_condition.findUnique({
      where: { id: pcId },
      select: { name: true },
    })
    if (row?.name?.trim()) {
      nomeFonte = row.name.trim()
    } else {
      return []
    }
  }

  const dias = extractDiasParcelasPedidoUi(forma, condPersist, nomeFonte)
  const total = Number(order.total ?? 0)
  if (dias.length === 0 || total <= 0) return []

  const baseDate = parseOrderDataToDate(order.data)
  const n = dias.length
  const each = Math.round((total / n) * 100) / 100
  const rest = Math.round((total - each * (n - 1)) * 100) / 100

  return dias.map((offsetDays, idx) => {
    const due = new Date(baseDate)
    due.setDate(due.getDate() + offsetDays)
    return {
      numero: idx + 1,
      vencimento: due.toLocaleDateString('pt-BR'),
      valor: idx === n - 1 ? rest : each,
    }
  })
}
