import crypto from 'crypto'

/** TTL do link assinado (ex.: etiqueta impressa). */
const TTL_SEC = 86400 * 365 * 3

function hmacSecret(): string {
  return (process.env.EMBALAGEM_PUBLIC_HMAC_SECRET || process.env.NEXTAUTH_SECRET || '').trim()
}

export function canSignEmbalagemPublicLink(): boolean {
  return hmacSecret().length > 0
}

/** Assina `id` + expiração `e` (unix segundos). */
export function signEmbalagemPublicQuery(separationId: number): { e: number; sig: string } | null {
  const secret = hmacSecret()
  if (!secret || !Number.isFinite(separationId) || separationId < 1) return null
  const e = Math.floor(Date.now() / 1000) + TTL_SEC
  const sig = crypto.createHmac('sha256', secret).update(`${separationId}.${e}`).digest('hex')
  return { e, sig }
}

export function verifyEmbalagemPublicQuery(separationId: number, e: number, sig: string): boolean {
  const secret = hmacSecret()
  if (!secret || !Number.isFinite(separationId) || separationId < 1) return false
  if (!Number.isFinite(e) || typeof sig !== 'string' || sig.length < 32) return false
  if (e * 1000 < Date.now()) return false
  const expected = crypto.createHmac('sha256', secret).update(`${separationId}.${e}`).digest('hex')
  if (sig.length !== expected.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expected, 'utf8'))
  } catch {
    return false
  }
}
