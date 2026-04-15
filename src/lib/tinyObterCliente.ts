import type { PrismaClient } from '@prisma/client'

/**
 * O JSON do `pedido.obter` costuma vir plano (`{ codigo, nome, ... }`), mas em alguns retornos
 * o nó vem como `{ cliente: { codigo, nome, ... } }`. Sem esse unwrap, `codigo`/`id` ficam "vazios"
 * e o vínculo por `pedido.obter` nunca acontece.
 */
export function unwrapTinyObterCliente(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const o = raw as Record<string, unknown>
  const inner = o.cliente
  if (!inner || typeof inner !== 'object') return raw
  const topNome = o.nome != null && String(o.nome).trim() !== ''
  const topCod = o.codigo != null && String(o.codigo).trim() !== ''
  const topId = o.id != null && String(o.id).trim() !== ''
  if (topNome || topCod || topId) return raw
  const innerObj = inner as Record<string, unknown>
  const innerHas =
    (innerObj.nome != null && String(innerObj.nome).trim() !== '') ||
    (innerObj.codigo != null && String(innerObj.codigo).trim() !== '') ||
    (innerObj.id != null && String(innerObj.id).trim() !== '') ||
    (innerObj.cpf_cnpj != null && String(innerObj.cpf_cnpj).trim() !== '')
  return innerHas ? inner : raw
}

/**
 * ID externo do contato na base local = `cliente.codigo` do pedido.obter (Tiny), se for só dígitos.
 * Caso contrário, tenta `id` / `idContato` / `id_cliente` numéricos.
 */
export function parseExternalIdFromTinyClienteObter(cli: unknown): bigint | null {
  const resolved = unwrapTinyObterCliente(cli)
  if (!resolved || typeof resolved !== 'object') return null
  const c = resolved as Record<string, unknown>
  const rawCod = String(c.codigo ?? '').trim()
  if (rawCod && /^\d+$/.test(rawCod)) {
    try {
      const n = BigInt(rawCod)
      if (n > 0n) return n
    } catch {
      /* ignore */
    }
  }
  const idRaw = c.id ?? c.idContato ?? c.id_cliente
  if (idRaw != null) {
    const n = Number(idRaw)
    if (Number.isFinite(n) && n > 0) return BigInt(Math.trunc(n))
  }
  return null
}

function str(v: unknown, max: number) {
  if (v == null) return null
  const s = String(v).trim()
  if (!s) return null
  return s.slice(0, max)
}

/** Grava/atualiza `cliente` a partir do bloco `retorno.pedido.cliente` do pedido.obter. */
export async function upsertClienteFromTinyObterPayload(prisma: PrismaClient, cli: unknown): Promise<bigint | null> {
  const extId = parseExternalIdFromTinyClienteObter(cli)
  if (!extId) return null
  const resolved = unwrapTinyObterCliente(cli)
  if (!resolved || typeof resolved !== 'object') return extId
  const c = resolved as Record<string, unknown>
  const nomeFant = c.nome_fantasia ?? c.nomeFantasia
  const dataCommon = {
    codigo: str(c.codigo, 30),
    nome: str(c.nome, 200) || 'Sem nome',
    fantasia: nomeFant ? str(nomeFant, 200) : null,
    endereco: str(c.endereco, 200),
    numero: str(c.numero, 20),
    complemento: str(c.complemento, 100),
    bairro: str(c.bairro, 100),
    cep: str(c.cep, 20),
    cidade: str(c.cidade, 100),
    estado: (() => {
      const u = str(c.uf, 30)
      if (!u) return null
      return u.toUpperCase().slice(0, 2)
    })(),
    email: str(c.email, 150),
    fone: str(c.fone, 50),
    tipo_pessoa: str(c.tipo_pessoa, 1),
    cpf_cnpj: str(c.cpf_cnpj, 20),
    ie_rg: str(c.ie ?? c.rg, 20),
    situacao: str(c.situacao, 15),
  }
  await prisma.cliente.upsert({
    where: { external_id: extId },
    create: { external_id: extId, ...dataCommon },
    update: dataCommon,
  })
  return extId
}
