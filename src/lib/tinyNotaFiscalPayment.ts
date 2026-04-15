import { prisma } from '@/lib/prisma'

/** Mesmo `emiter` usado em `handleAutorizedNfe` para casar com linhas da tabela `payment`. */
export const PAYMENT_EMITER_ALIANCA = 'L1 ALIANCA MERCANTIL'

type TinyNotaDados = {
  numero?: unknown
  serie?: unknown
  urlDanfe?: unknown
  idNotaFiscalTiny?: unknown
}

/**
 * Atualiza `payment` pela combinação (number, serie, emiter) com dados do webhook Tiny `nota_fiscal`.
 */
export async function persistTinyNotaFiscalOnPayment(
  dados: TinyNotaDados | null | undefined,
  emiter: string = PAYMENT_EMITER_ALIANCA
) {
  if (!dados || typeof dados !== 'object') {
    return { ok: false as const, reason: 'no_dados', count: 0 }
  }

  const numeroRaw = dados.numero
  const serieRaw = dados.serie
  if (numeroRaw == null || serieRaw == null || String(numeroRaw).trim() === '') {
    return { ok: false as const, reason: 'missing_numero_or_serie', count: 0 }
  }

  const digitsNum = String(numeroRaw).replace(/\D/g, '')
  if (!digitsNum) {
    return { ok: false as const, reason: 'invalid_numero', count: 0 }
  }
  const number = BigInt(digitsNum)

  const serie = parseInt(String(serieRaw).replace(/\D/g, ''), 10)
  if (!Number.isFinite(serie)) {
    return { ok: false as const, reason: 'invalid_serie', count: 0 }
  }

  const urlDanfe = String(dados.urlDanfe ?? '').trim() || null
  const idRaw = dados.idNotaFiscalTiny
  const idStr = idRaw != null ? String(idRaw).trim() : ''
  const idNota = idStr && idStr !== '0' ? idStr : null

  const data: { url_danfe_tiny?: string; id_nota_fiscal_tiny?: string } = {}
  if (urlDanfe) data.url_danfe_tiny = urlDanfe
  if (idNota) data.id_nota_fiscal_tiny = idNota
  if (Object.keys(data).length === 0) {
    return { ok: true as const, reason: 'nothing_to_write', count: 0 }
  }

  const r = await prisma.payment.updateMany({
    where: {
      number,
      serie,
      emiter,
    },
    data,
  })

  return { ok: true as const, count: r.count }
}
