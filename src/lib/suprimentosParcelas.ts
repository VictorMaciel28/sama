/** Parcelas para ordem de compra (datas a partir da data prevista). */

export type ParcelaForm = {
  dias: number
  dataVencimento: string
  valor: number
  contaContabil: { id: number }
  meioPagamento: number
  observacoes: string
}

export function addDaysIsoDate(baseYmd: string, days: number): string {
  const d = new Date(baseYmd.slice(0, 10) + 'T12:00:00')
  if (Number.isNaN(d.getTime())) return baseYmd.slice(0, 10)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function parcelasAvista(total: number, dataPrevistaYmd: string): ParcelaForm[] {
  const t = Math.max(0, Number(total) || 0)
  return [
    {
      dias: 0,
      dataVencimento: dataPrevistaYmd.slice(0, 10),
      valor: Math.round(t * 100) / 100,
      contaContabil: { id: 0 },
      meioPagamento: 1,
      observacoes: '',
    },
  ]
}

/** Três parcelas com vencimento em +30, +60 e +90 dias a partir da data prevista. */
export function parcelas306090(total: number, dataPrevistaYmd: string): ParcelaForm[] {
  return parcelasFromDiasList(total, dataPrevistaYmd, [30, 60, 90])
}

/** N parcelas iguais em valor; vencimentos em (data prevista + dias[i]). */
export function parcelasFromDiasList(total: number, dataPrevistaYmd: string, diasList: number[]): ParcelaForm[] {
  const t = Math.max(0, Number(total) || 0)
  const base = dataPrevistaYmd.slice(0, 10)
  const n = diasList.length
  if (n === 0) return []
  const each = Math.round((t / n) * 100) / 100
  const rest = Math.round((t - each * (n - 1)) * 100) / 100
  return diasList.map((dias, i) => ({
    dias,
    dataVencimento: addDaysIsoDate(base, dias),
    valor: i === n - 1 ? rest : each,
    contaContabil: { id: 0 },
    meioPagamento: 1,
    observacoes: '',
  }))
}

const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/**
 * Extrai lista de dias: "30/60/90", "15, 30" ou "30 60 90" / "30 60" (só espaços).
 */
function extractDiasList(raw: string): number[] | null {
  const slash = raw.match(/\d+\s*(?:[/,;]\s*\d+)+/)
  if (slash) {
    const nums = slash[0].match(/\d+/g)?.map((x) => parseInt(x, 10))
    if (nums && nums.length >= 2) {
      const ok = nums.filter((n) => n >= 0 && n <= 3650)
      if (ok.length >= 2) return ok
    }
  }

  const space = raw.match(/\b(\d{1,4}(?:\s+\d{1,4}){1,})\b/)
  if (space) {
    const inner = space[1].trim()
    if (/^\d{1,4}(\s+\d{1,4})+$/.test(inner)) {
      const nums = inner.split(/\s+/).map((x) => parseInt(x, 10))
      const ok = nums.filter((n) => n >= 0 && n <= 3650)
      if (ok.length >= 2) return ok
    }
  }

  return null
}

/** Interpreta texto livre de condição de pagamento e monta parcelas (à vista, 30/60/90, listas de dias etc.). */
export function parcelasFromCondicaoText(cond: string, total: number, dataPrevistaYmd: string): ParcelaForm[] {
  const t = norm(cond)
  if (!t) return []

  if (
    /\b30\b.*\b60\b.*\b90\b|30\s*\/\s*60\s*\/\s*90|30\s*[,;]\s*60\s*[,;]\s*90|30\s+60\s+90/.test(t)
  ) {
    return parcelas306090(total, dataPrevistaYmd)
  }

  const fromList = extractDiasList(cond)
  if (fromList) {
    return parcelasFromDiasList(total, dataPrevistaYmd, fromList)
  }

  if (
    /\b(avista|a\s*vista|^vista$|pix|dinheiro|transferencia|ted|doc)\b/.test(t) ||
    /\b(boleto\s*a\s*vista|boleto\s*na\s*entrega)\b/.test(t) ||
    /\b(cartao\s*)?debito\b/.test(t) ||
    /pagamento\s*unico|pagamento\s*a\s*vista|a\s*prazo\s*0|^\s*0\s*$|^\s*0\s*dias?\s*$/.test(t)
  ) {
    return parcelasAvista(total, dataPrevistaYmd)
  }

  const emDias = t.match(/(?:^|\s)(?:em\s+)?(\d{1,4})\s*dias?\s*$/i)
  if (emDias) {
    const d = parseInt(emDias[1], 10)
    if (d >= 0 && d <= 3650) {
      return parcelasFromDiasList(total, dataPrevistaYmd, [d])
    }
  }

  return []
}
