/**
 * Configuração SMTP interna usada por webhooks (ex.: NF) e envios da plataforma (ex.: pedido).
 * Prioriza as mesmas variáveis que `handleAutorizedNfe` (SMTP_*), com fallback para MAIL_*.
 */

const DEFAULT_HOST = 'br590.hostgator.com.br'
const DEFAULT_PORT = 587
const DEFAULT_USER = 'sama@aliancamercantil.com'
/** Fallback alinhado ao webhook de NF — override com SMTP_PASS / MAIL_PASSWORD em produção. */
const DEFAULT_PASS = 'sama@aliancamercantil.com'

export type InternalSmtpConfig = {
  host: string
  port: number
  user: string
  pass: string
  /** Remetente envelope (mesma regra do webhook de NF) */
  from: string
}

export function getInternalSmtpConfig(): InternalSmtpConfig {
  const host = process.env.SMTP_HOST || process.env.MAIL_HOST || DEFAULT_HOST
  const port = Number(process.env.SMTP_PORT || process.env.MAIL_PORT || String(DEFAULT_PORT))
  const user =
    process.env.SMTP_USER || process.env.MAIL_USERNAME || process.env.MAIL_USER || DEFAULT_USER
  const pass =
    process.env.SMTP_PASS || process.env.MAIL_PASSWORD || process.env.MAIL_PASS || DEFAULT_PASS
  const from = process.env.EMAIL_FROM || process.env.MAIL_FROM || user

  return {
    host,
    port,
    user,
    pass,
    from: String(from || user).trim(),
  }
}
