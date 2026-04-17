import { NextResponse } from 'next/server'
import { tinyV2Post } from '@/lib/tinyOAuth'

function tinyErroMensagem(json: any): string {
  const erros = json?.retorno?.erros
  if (Array.isArray(erros) && erros[0]?.erro) return String(erros[0].erro)
  return 'Não foi possível carregar os dados da nota fiscal.'
}

function montarEndereco(e: any): string {
  if (!e) return ''
  const linha1 = [e.endereco, e.numero].filter(Boolean).join(', ')
  const compl = e.complemento ? ` — ${e.complemento}` : ''
  const linha2 = [e.bairro, e.cidade, e.uf].filter(Boolean).join(' — ')
  const cep = e.cep ? `CEP ${e.cep}` : ''
  return [linha1 + compl, linha2, cep].filter(Boolean).join('\n')
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const id = String(body?.id ?? '').trim()
    if (!id || !/^\d+$/.test(id)) {
      return NextResponse.json({ ok: false, error: 'Identificador da nota inválido.' }, { status: 400 })
    }

    const json = await tinyV2Post('nota.fiscal.obter.php', { id })

    const status = String(json?.retorno?.status || '')
    if (status.toUpperCase() !== 'OK') {
      return NextResponse.json({ ok: false, error: tinyErroMensagem(json) }, { status: 404 })
    }

    const nf = json?.retorno?.nota_fiscal
    if (!nf) {
      return NextResponse.json({ ok: false, error: 'Nota fiscal não encontrada.' }, { status: 404 })
    }

    const itensRaw = Array.isArray(nf.itens) ? nf.itens : []
    const itens = itensRaw.map((wrap: any, idx: number) => {
      const it = wrap?.item || wrap
      return {
        indice: idx,
        id_produto: it?.id_produto != null ? String(it.id_produto) : null,
        codigo: it?.codigo != null ? String(it.codigo) : null,
        descricao: String(it?.descricao || 'Item'),
        unidade: String(it?.unidade || ''),
        quantidade: String(it?.quantidade ?? '0'),
        valor_unitario: String(it?.valor_unitario ?? '0'),
        valor_total: String(it?.valor_total ?? '0'),
      }
    })

    return NextResponse.json({
      ok: true,
      data: {
        id: String(nf.id),
        numero: String(nf.numero ?? ''),
        serie: nf.serie != null ? String(nf.serie) : '',
        data_emissao: nf.data_emissao ? String(nf.data_emissao) : '',
        natureza_operacao: nf.natureza_operacao ? String(nf.natureza_operacao) : '',
        cliente: {
          nome: String(nf.cliente?.nome || ''),
          cpf_cnpj: String(nf.cliente?.cpf_cnpj || ''),
        },
        endereco_entrega: montarEndereco(nf.endereco_entrega || nf.cliente),
        valor_nota: String(nf.valor_nota ?? nf.valor_faturado ?? '0'),
        valor_produtos: String(nf.valor_produtos ?? '0'),
        valor_frete: String(nf.valor_frete ?? '0'),
        situacao: nf.descricao_situacao != null ? String(nf.descricao_situacao) : '',
        itens,
      },
    })
  } catch (e: any) {
    console.error('[revisar-pedido/obter]', e)
    return NextResponse.json(
      { ok: false, error: e?.message || 'Erro ao carregar a nota. Tente novamente mais tarde.' },
      { status: 500 }
    )
  }
}
