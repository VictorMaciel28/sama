import { prisma } from '@/lib/prisma'

const TINY_OAUTH_TOKEN_URL =
  'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token'
const TINY_V3_BASE_URL = 'https://api.tiny.com.br/public-api/v3'

/** Refresh token revogado/expirado — só resolve com novo fluxo OAuth (authorization code). */
export class TinyOAuthReauthRequiredError extends Error {
  readonly code = 'TINY_OAUTH_REAUTH_REQUIRED' as const

  constructor(
    message: string,
    public readonly tinyPayload?: unknown
  ) {
    super(message)
    this.name = 'TinyOAuthReauthRequiredError'
  }
}

export function isTinyOAuthReauthRequired(e: unknown): e is TinyOAuthReauthRequiredError {
  return e instanceof TinyOAuthReauthRequiredError
}

/** Defina `TINY_OAUTH_DEBUG=1` no `.env` para logs de expiração / refresh (sem expor tokens). */
function tinyOAuthDebugEnabled() {
  return process.env.TINY_OAUTH_DEBUG === '1'
}

function tinyTokenErrorNeedsReauth(tokenJson: unknown): boolean {
  if (!tokenJson || typeof tokenJson !== 'object') return false
  const o = tokenJson as Record<string, unknown>
  if (o.error === 'invalid_grant') return true
  const desc = String(o.error_description ?? '')
  if (/not active|revoked|invalid.?refresh/i.test(desc)) return true
  return false
}

/**
 * Lê o `exp` do access token JWT (segundos Unix → ms).
 * Útil quando `token_expires_at` no MySQL foi preenchido manualmente e não bate com o JWT.
 */
function accessTokenJwtExpMs(accessToken: string | null | undefined): number | null {
  if (!accessToken) return null
  const parts = accessToken.split('.')
  if (parts.length < 2) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    const json = Buffer.from(b64 + pad, 'base64').toString('utf8')
    const payload = JSON.parse(json) as { exp?: number }
    const exp = Number(payload.exp)
    return Number.isFinite(exp) ? exp * 1000 : null
  } catch {
    return null
  }
}

export async function getActiveTinyOAuthAccount() {
  return prisma.tiny_oauth_account.findFirst({
    where: { active: true },
    orderBy: { id: 'asc' },
  })
}

export async function refreshTinyAccessToken(accountId: number) {
  if (tinyOAuthDebugEnabled()) {
    console.log('[tiny-oauth] refreshTinyAccessToken: iniciando POST token (grant_type=refresh_token)', {
      accountId,
      nowIso: new Date().toISOString(),
    })
  }

  const acc = await prisma.tiny_oauth_account.findUnique({ where: { id: accountId } })
  if (!acc) throw new Error('Conta OAuth Tiny não encontrada')
  if (!acc.client_id || !acc.client_secret) {
    throw new Error('Credenciais OAuth Tiny não configuradas')
  }
  if (!acc.refresh_token) {
    throw new Error('Refresh token ausente. Reautorize a conta OAuth no Tiny.')
  }

  const form = new URLSearchParams()
  form.append('grant_type', 'refresh_token')
  form.append('client_id', acc.client_id)
  form.append('client_secret', acc.client_secret)
  form.append('refresh_token', acc.refresh_token)

  const tokenRes = await fetch(TINY_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  const tokenJson = await tokenRes.json().catch(() => null)
  if (!tokenRes.ok || !tokenJson?.access_token) {
    const errObj =
      tokenJson && typeof tokenJson === 'object'
        ? {
            httpStatus: tokenRes.status,
            error: (tokenJson as Record<string, unknown>).error,
            error_description: String(
              (tokenJson as Record<string, unknown>).error_description ?? ''
            ).slice(0, 200),
          }
        : { httpStatus: tokenRes.status, parse: 'json_fail' }
    console.warn('[tiny-oauth] refreshTinyAccessToken: falha na resposta do servidor OAuth', errObj)
    if (tinyTokenErrorNeedsReauth(tokenJson)) {
      throw new TinyOAuthReauthRequiredError(
        'O token de atualização do Tiny não é mais válido (expirou, foi revogado ou a sessão foi encerrada). É necessário conectar o OAuth do Tiny de novo no painel administrativo.',
        tokenJson
      )
    }
    throw new Error(`Falha ao renovar token OAuth Tiny: ${JSON.stringify(tokenJson)}`)
  }

  const expiresIn = Number(tokenJson?.expires_in || 0)
  const expiresAt = expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null
  if (tinyOAuthDebugEnabled()) {
    console.log('[tiny-oauth] refreshTinyAccessToken: sucesso; novo token_expires_at calculado', {
      accountId,
      expiresInSec: expiresIn,
      newTokenExpiresAtIso: expiresAt?.toISOString() ?? null,
      nowIso: new Date().toISOString(),
    })
  }
  return prisma.tiny_oauth_account.update({
    where: { id: acc.id },
    data: {
      access_token: tokenJson.access_token,
      refresh_token: tokenJson.refresh_token || acc.refresh_token,
      token_expires_at: expiresAt,
    },
  })
}

export async function getValidTinyAccessToken(accountId?: number) {
  const account = accountId
    ? await prisma.tiny_oauth_account.findUnique({ where: { id: accountId } })
    : await getActiveTinyOAuthAccount()
  if (!account) throw new Error('Conta OAuth Tiny ativa não encontrada')

  const slackMs = 60_000
  const nowMs = Date.now()
  const dbExpMs = account.token_expires_at ? account.token_expires_at.getTime() : null
  const jwtExpMs = accessTokenJwtExpMs(account.access_token)
  /** O que expirar primeiro: coluna do banco ou claim `exp` do JWT (evita INSERT manual incoerente). */
  const expMs =
    dbExpMs != null && jwtExpMs != null ? Math.min(dbExpMs, jwtExpMs) : dbExpMs ?? jwtExpMs
  const expired = !expMs || expMs <= nowMs + slackMs

  if (tinyOAuthDebugEnabled()) {
    const msUntilExpiry = expMs != null ? expMs - nowMs : null
    console.log('[tiny-oauth] getValidTinyAccessToken', {
      accountId: account.id,
      nowIso: new Date(nowMs).toISOString(),
      tokenExpiresAtDbIso: account.token_expires_at?.toISOString() ?? null,
      accessTokenJwtExpIso: jwtExpMs != null ? new Date(jwtExpMs).toISOString() : null,
      effectiveExpIso: expMs != null ? new Date(expMs).toISOString() : null,
      msUntilExpiry,
      slackMs,
      expiredComputed: expired,
      hasAccessToken: !!account.access_token,
      decision: !expired && account.access_token ? 'use_cached_access_token' : 'call_refresh_token',
    })
  }

  if (!expired && account.access_token) {
    return { account, accessToken: account.access_token }
  }

  const refreshed = await refreshTinyAccessToken(account.id)
  if (!refreshed.access_token) throw new Error('Access token OAuth Tiny ausente')
  if (tinyOAuthDebugEnabled()) {
    console.log('[tiny-oauth] getValidTinyAccessToken: após refresh, usando novo access_token', {
      accountId: account.id,
      tokenExpiresAtIso: refreshed.token_expires_at?.toISOString() ?? null,
    })
  }
  return { account: refreshed, accessToken: refreshed.access_token }
}

export async function tinyV3Fetch(
  path: string,
  init: RequestInit = {},
  accountId?: number
) {
  const { account, accessToken } = await getValidTinyAccessToken(accountId)
  const headersBase: Record<string, string> = {
    Accept: 'application/json',
    ...(init.headers as Record<string, string> | undefined),
    Authorization: `Bearer ${accessToken}`,
  }

  const url = `${TINY_V3_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
  let res = await fetch(url, { ...init, headers: headersBase })
  if (res.status !== 401) return res

  if (tinyOAuthDebugEnabled()) {
    console.log('[tiny-oauth] tinyV3Fetch: HTTP 401 na API v3; tentando refresh e repetindo request', {
      path,
      accountId: account.id,
      nowIso: new Date().toISOString(),
    })
  }
  const refreshed = await refreshTinyAccessToken(account.id)
  if (!refreshed.access_token) return res

  const retryHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(init.headers as Record<string, string> | undefined),
    Authorization: `Bearer ${refreshed.access_token}`,
  }
  res = await fetch(url, { ...init, headers: retryHeaders })
  return res
}

export async function exchangeTinyAuthorizationCode(args: {
  accountId: number
  code: string
  redirectUri: string
}) {
  const account = await prisma.tiny_oauth_account.findUnique({
    where: { id: args.accountId },
  })
  if (!account?.client_id || !account?.client_secret) {
    throw new Error('Credenciais OAuth Tiny não configuradas')
  }

  const form = new URLSearchParams()
  form.append('grant_type', 'authorization_code')
  form.append('client_id', account.client_id)
  form.append('client_secret', account.client_secret)
  form.append('redirect_uri', args.redirectUri)
  form.append('code', args.code)

  const tokenRes = await fetch(TINY_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  const tokenJson = await tokenRes.json().catch(() => null)
  if (!tokenRes.ok || !tokenJson?.access_token) {
    throw new Error(`Falha no exchange OAuth Tiny: ${JSON.stringify(tokenJson)}`)
  }

  const expiresInSec = Number(tokenJson.expires_in || 0)
  const expiresAt = expiresInSec > 0 ? new Date(Date.now() + expiresInSec * 1000) : null

  await prisma.tiny_oauth_account.update({
    where: { id: args.accountId },
    data: {
      access_token: tokenJson.access_token || null,
      refresh_token: tokenJson.refresh_token || null,
      token_expires_at: expiresAt,
    },
  })

  return { expiresAt }
}
