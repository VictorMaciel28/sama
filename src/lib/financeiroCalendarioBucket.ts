/**
 * `payment_status` (cadastro típico): code 1 = Pago, 2 = Cancelada, 3 = Antecipado.
 * `payment_date.status` referencia `payment_status.code`.
 */
import { formatSqlDateOnly, todayCalendarYmdLocal } from '@/lib/calendarDate'

export const PAYMENT_STATUS_CODE = {
  PAGO: 1,
  CANCELADA: 2,
  ANTECIPADO: 3,
} as const

export type FinanceiroCalendarioBucket =
  | 'a_receber'
  | 'recebido'
  | 'inadimplencia'
  | 'a_pagar'
  | 'a_pagar_realizado'
  | 'antecipado'

export const FINANCEIRO_CALENDARIO_BUCKETS_ORDER: FinanceiroCalendarioBucket[] = [
  'a_receber',
  'recebido',
  'inadimplencia',
  'a_pagar',
  'a_pagar_realizado',
  'antecipado',
]

/** Legenda fixa (cores) — alinhada ao pedido do financeiro. */
export const FINANCEIRO_CALENDARIO_LEGEND = [
  { key: 'a_receber' as const, label: 'A receber', color: '#198754' },
  { key: 'recebido' as const, label: 'Recebido', color: '#0d6efd' },
  { key: 'inadimplencia' as const, label: 'Inadimplência', color: '#fd7e14' },
  { key: 'a_pagar' as const, label: 'A pagar', color: '#dc3545' },
  { key: 'a_pagar_realizado' as const, label: 'A pagar realizado', color: '#7c3aed' },
  { key: 'antecipado' as const, label: 'Antecipado', color: '#ffc107' },
] as const

/** Só para legenda / card de total do mês (não é bucket de parcela). */
export const FINANCEIRO_CALENDARIO_LEGEND_RESULTADO = {
  key: 'resultado' as const,
  label: 'Resultado',
  color: '#495057',
}

/**
 * Classifica uma parcela para o calendário (`income` + `status` + vencimento vs hoje).
 * **Inadimplência**: a receber pendente com vencimento **anterior** ao dia civil de hoje (local).
 * **Cancelada (2)** não entra em nenhum bucket (retorna `null`).
 */
export function parcelFinanceiroCalendarioBucket(args: {
  income: number
  statusCode: number
  parcelDate: Date
  /** `YYYY-MM-DD` civil local — default “hoje” do servidor. */
  todayYmd?: string
}): FinanceiroCalendarioBucket | null {
  const income = args.income === 1 ? 1 : 0
  const s = args.statusCode

  if (s === PAYMENT_STATUS_CODE.CANCELADA) return null
  if (s === PAYMENT_STATUS_CODE.ANTECIPADO) return 'antecipado'
  if (s === PAYMENT_STATUS_CODE.PAGO) {
    return income === 1 ? 'recebido' : 'a_pagar_realizado'
  }

  const venc = formatSqlDateOnly(args.parcelDate).slice(0, 10)
  const today = (args.todayYmd ?? todayCalendarYmdLocal()).trim().slice(0, 10)
  if (income === 1 && venc && today && venc < today) return 'inadimplencia'

  return income === 1 ? 'a_receber' : 'a_pagar'
}

/**
 * Contribuição ao “resultado” do mês (entradas − saídas), pelo vencimento.
 * Inadimplência e demais pendências não entram.
 */
export function parcelFinanceiroResultadoContribution(args: {
  income: number
  bucket: FinanceiroCalendarioBucket
  parcelValue: number
}): number {
  const income = args.income === 1 ? 1 : 0
  const v = Number(args.parcelValue) || 0
  switch (args.bucket) {
    case 'recebido':
      return v
    case 'a_pagar_realizado':
      return -v
    case 'antecipado':
      return income === 1 ? v : -v
    default:
      return 0
  }
}

export function emptyFinanceiroCalendarioDayTotals(): Record<FinanceiroCalendarioBucket, number> {
  return {
    a_receber: 0,
    recebido: 0,
    inadimplencia: 0,
    a_pagar: 0,
    a_pagar_realizado: 0,
    antecipado: 0,
  }
}
