/**
 * Datas só-dia (coluna DATE / `<input type="date">`): evitar misturar meia-noite UTC
 * com getters locais — causa “um dia a menos” em fusos como America/Sao_Paulo.
 */

/** Serializa valor típico de coluna DATE (meia-noite UTC no driver) para YYYY-MM-DD. */
export function formatSqlDateOnly(d: Date): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Interpreta YYYY-MM-DD do formulário para gravar em coluna DATE (meia-noite UTC). */
export function parseYmdToSqlDate(ymd: string): Date {
  const s = String(ymd || '').trim().slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return new Date()
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  return new Date(Date.UTC(y, mo - 1, d))
}

/** “Hoje” no calendário local — correto para valor inicial de `<input type="date">`. */
export function todayCalendarYmdLocal(): string {
  const n = new Date()
  const y = n.getFullYear()
  const mo = String(n.getMonth() + 1).padStart(2, '0')
  const day = String(n.getDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

/** Fallback quando o servidor precisa inventar uma data (sem body): dia civil UTC. */
export function todayCalendarYmdUtc(): string {
  const n = new Date()
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, '0')}-${String(n.getUTCDate()).padStart(2, '0')}`
}

/** Para cálculos na UI (parcelas): YYYY-MM-DD como dia civil local, não como UTC midnight. */
export function parseYmdToLocalDate(ymd: string): Date {
  const s = String(ymd || '').trim().slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return new Date()
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  return new Date(y, mo - 1, d)
}

/** YYYY-MM-DD no calendário local (ex.: datas de parcela na UI antes de enviar ao Tiny). */
export function formatLocalDateYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Coluna DATE / `YYYY-MM-DD` → dd/mm/aaaa (dia civil gravado; não usar toLocale em Date UTC midnight). */
export function formatDateOnlyPtBr(value: Date | string): string {
  const ymd =
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim().slice(0, 10))
      ? value.trim().slice(0, 10)
      : value instanceof Date && !Number.isNaN(value.getTime())
        ? formatSqlDateOnly(value)
        : ''
  if (!ymd || ymd.length < 10) return ''
  const [y, m, d] = ymd.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/**
 * Linha “Emitido em” no PDF/email: usa `created_at` (momento real no banco);
 * se não houver, cai no dia da coluna `data` sem deslocar fuso.
 */
export function formatEmitidoPedidoDoc(
  createdAt: Date | string | null | undefined,
  dataPedido: Date | string
): string {
  if (createdAt != null && createdAt !== '') {
    const d = typeof createdAt === 'string' ? new Date(createdAt) : createdAt
    if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toLocaleDateString('pt-BR')
  }
  return formatDateOnlyPtBr(dataPedido)
}
