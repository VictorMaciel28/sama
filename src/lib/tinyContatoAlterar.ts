import { getActiveTinyOAuthAccount } from '@/lib/tinyOAuth'

/**
 * Atualiza o vendedor do contato no Tiny (API 2 `contato.alterar.php`).
 * Mesmo formato de corpo que `/api/clientes/alterar` (contato + contatos duplicados).
 */
export async function tinyContatoAlterarIdVendedor(
  contactTinyId: bigint | number,
  idVendedorTiny: string
): Promise<{ ok: boolean; erro: string | null; raw: unknown }> {
  const vid = String(idVendedorTiny || '').trim()
  if (!vid) return { ok: false, erro: 'id_vendedor ausente', raw: null }

  const account = await getActiveTinyOAuthAccount()
  if (!account?.apiv2_key) {
    return { ok: false, erro: 'Chave API v2 Tiny não configurada na conta OAuth', raw: null }
  }

  const idStr = String(typeof contactTinyId === 'bigint' ? contactTinyId.toString() : contactTinyId)
  const payload = {
    contatos: [
      {
        contato: {
          sequencia: '1',
          id: idStr,
          id_vendedor: vid,
        },
      },
    ],
  }
  const jsonStr = JSON.stringify(payload)
  const formData = new URLSearchParams()
  formData.append('token', account.apiv2_key)
  formData.append('formato', 'JSON')
  formData.append('contato', jsonStr)
  formData.append('contatos', jsonStr)

  const res = await fetch('https://api.tiny.com.br/api2/contato.alterar.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: formData.toString(),
  })

  const data = await res.json().catch(() => null)
  const status = String((data as any)?.retorno?.status ?? '').toUpperCase()
  if (status !== 'OK') {
    const top =
      Array.isArray((data as any)?.retorno?.erros) && (data as any).retorno.erros[0]?.erro
        ? String((data as any).retorno.erros[0].erro)
        : null
    const msg = top || 'Falha ao alterar contato no Tiny'
    return { ok: false, erro: msg, raw: data }
  }

  return { ok: true, erro: null, raw: data }
}

/**
 * Remove o vendedor do contato no Tiny (`id_vendedor` vazio no `contato.alterar`).
 * Se a API não aceitar string vazia, o chamador pode tratar `ok: false` e manter só o desligamento local.
 */
export async function tinyContatoRemoverVendedorTiny(
  contactTinyId: bigint | number
): Promise<{ ok: boolean; erro: string | null; raw: unknown }> {
  const account = await getActiveTinyOAuthAccount()
  if (!account?.apiv2_key) {
    return { ok: false, erro: 'Chave API v2 Tiny não configurada na conta OAuth', raw: null }
  }

  const idStr = String(typeof contactTinyId === 'bigint' ? contactTinyId.toString() : contactTinyId)
  const payload = {
    contatos: [
      {
        contato: {
          sequencia: '1',
          id: idStr,
          id_vendedor: '',
        },
      },
    ],
  }
  const jsonStr = JSON.stringify(payload)
  const formData = new URLSearchParams()
  formData.append('token', account.apiv2_key)
  formData.append('formato', 'JSON')
  formData.append('contato', jsonStr)
  formData.append('contatos', jsonStr)

  const res = await fetch('https://api.tiny.com.br/api2/contato.alterar.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: formData.toString(),
  })

  const data = await res.json().catch(() => null)
  const status = String((data as any)?.retorno?.status ?? '').toUpperCase()
  if (status !== 'OK') {
    const top =
      Array.isArray((data as any)?.retorno?.erros) && (data as any).retorno.erros[0]?.erro
        ? String((data as any).retorno.erros[0].erro)
        : null
    const msg = top || 'Falha ao remover vendedor do contato no Tiny'
    return { ok: false, erro: msg, raw: data }
  }

  return { ok: true, erro: null, raw: data }
}
