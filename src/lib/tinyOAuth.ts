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

function tinyTokenErrorNeedsReauth(tokenJson: unknown): boolean {
  if (!tokenJson || typeof tokenJson !== 'object') return false
  const o = tokenJson as Record<string, unknown>
  if (o.error === 'invalid_grant') return true
  const desc = String(o.error_description ?? '')
  if (/not active|revoked|invalid.?refresh/i.test(desc)) return true
  return false
}

export async function getActiveTinyOAuthAccount() {
  return prisma.tiny_oauth_account.findFirst({
    where: { active: true },
    orderBy: { id: 'asc' },
  })
}

export async function refreshTinyAccessToken(accountId: number) {
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

  const expired =
    !account.token_expires_at || account.token_expires_at.getTime() <= Date.now() + 60_000
  if (!expired && account.access_token) {
    return { account, accessToken: account.access_token }
  }

  const refreshed = await refreshTinyAccessToken(account.id)
  if (!refreshed.access_token) throw new Error('Access token OAuth Tiny ausente')
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
