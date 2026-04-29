import { tinyV2Post } from '@/lib/tinyOAuth'

function tinyRetornoOk(data: unknown): boolean {
  return String((data as any)?.retorno?.status ?? '').toUpperCase() === 'OK'
}

export async function tinyContatosPesquisa(pesquisa: string, pagina = 1) {
  const data = await tinyV2Post('contatos.pesquisa.php', {
    pesquisa: pesquisa.trim(),
    pagina,
  })
  if (!tinyRetornoOk(data)) {
    const msg = Array.isArray((data as any)?.retorno?.erros) ? String((data as any).retorno.erros[0]?.erro || '') : ''
    throw new Error(msg || 'contatos.pesquisa Tiny não retornou OK')
  }
  return (data as any)?.retorno
}

export async function tinyContatoObter(idTiny: number) {
  const data = await tinyV2Post('contato.obter.php', { id: idTiny })
  if (!tinyRetornoOk(data)) {
    const msg = Array.isArray((data as any)?.retorno?.erros) ? String((data as any).retorno.erros[0]?.erro || '') : ''
    throw new Error(msg || 'contato.obter Tiny não retornou OK')
  }
  return (data as any)?.retorno?.contato ?? (data as any)?.retorno
}

function str(v: unknown, max: number): string | null {
  if (v == null) return null
  const s = String(v).trim()
  if (!s) return null
  return s.slice(0, max)
}

/** Monta dados para create/update em `cliente` a partir do contato Tiny (`contato.obter` / pesquisa). */
export function prismaClientePayloadFromTinyContato(
  ct: Record<string, unknown>,
  vend: { id: number; nome: string | null; id_vendedor_externo: string }
) {
  const idTiny = Number(ct.id)
  if (!Number.isFinite(idTiny) || idTiny <= 0) throw new Error('Contato Tiny sem id válido')

  const ufRaw = str(ct.uf ?? ct.estado, 10)
  const estado = ufRaw ? ufRaw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) : null

  return {
    external_id: BigInt(idTiny),
    codigo: str(ct.codigo, 30),
    nome: str(ct.nome, 200) || 'Sem nome',
    fantasia: str(ct.fantasia ?? ct.nome_fantasia ?? ct.nomeFantasia, 200),
    endereco: str(ct.endereco, 200),
    numero: str(ct.numero, 20),
    complemento: str(ct.complemento, 100),
    bairro: str(ct.bairro, 100),
    cep: str(ct.cep, 20),
    cidade: str(ct.cidade, 100),
    estado,
    email: str(ct.email, 150),
    fone: str(ct.fone ?? ct.telefone, 50),
    tipo_pessoa: str(ct.tipo_pessoa, 1),
    cpf_cnpj: str(ct.cpf_cnpj ?? ct.cnpj, 20),
    lista_preco: ct.id_lista_preco != null ? String(ct.id_lista_preco).slice(0, 100) : null,
    id_vendedor_externo: vend.id_vendedor_externo,
    nome_vendedor: vend.nome ? String(vend.nome).slice(0, 150) : null,
    vendedor_id: vend.id,
    situacao: str(ct.situacao, 15),
  }
}
