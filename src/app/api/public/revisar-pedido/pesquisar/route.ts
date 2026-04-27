import { NextResponse } from 'next/server'
import { tinyV2Post } from '@/lib/tinyOAuth'

function onlyDigits(v: string | null | undefined) {
  return (v || '').replace(/\D/g, '')
}

function numerosNotaIguais(input: string, apiNum: unknown) {
  const a = onlyDigits(input)
  const b = onlyDigits(String(apiNum ?? ''))
  if (a && b && a === b) return true
  const na = parseInt(a, 10)
  const nb = parseInt(b, 10)
  return Number.isFinite(na) && Number.isFinite(nb) && na > 0 && na === nb
}

function docClienteIgualCnpj(nf: any, cnpjDigits: string) {
  const d =
    onlyDigits(nf?.cliente?.cpf_cnpj) || onlyDigits(nf?.endereco_entrega?.cpf_cnpj)
  return d === cnpjDigits
}

function tinyErroMensagem(json: any): string {
  const erros = json?.retorno?.erros
  if (Array.isArray(erros) && erros[0]?.erro) return String(erros[0].erro)
  return 'Não foi possível consultar a nota fiscal.'
}

function montarEnderecoEntrega(nf: any): string {
  const e = nf?.endereco_entrega || nf?.cliente
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
    const numeroRaw = String(body?.numero ?? '').trim()
    const cnpjRaw = String(body?.cnpj ?? '').trim()

    if (!numeroRaw) {
      return NextResponse.json(
        { ok: false, error: 'Informe o número da nota fiscal para pesquisar.' },
        { status: 400 }
      )
    }

    const cnpjDigits = onlyDigits(cnpjRaw)
    const cnpjInformado = cnpjRaw.length > 0
    if (cnpjInformado && cnpjDigits.length !== 14) {
      return NextResponse.json({ ok: false, error: 'CNPJ inválido. Informe os 14 dígitos ou deixe em branco.' }, { status: 400 })
    }

    if (!/\d/.test(numeroRaw)) {
      return NextResponse.json({ ok: false, error: 'Número da nota fiscal inválido.' }, { status: 400 })
    }

    const tinyParams: Record<string, string> = { numero: numeroRaw }
    if (cnpjInformado && cnpjDigits.length === 14) {
      tinyParams.cpf_cnpj = cnpjRaw
    }

    const json = await tinyV2Post('notas.fiscais.pesquisa.php', tinyParams)

    const status = String(json?.retorno?.status || '')
    if (status.toUpperCase() !== 'OK') {
      const code = json?.retorno?.codigo_erro
      if (code === 20 || /não retornou registros/i.test(tinyErroMensagem(json))) {
        return NextResponse.json({ ok: false, error: 'Nenhuma nota encontrada com esses dados.' }, { status: 404 })
      }
      return NextResponse.json({ ok: false, error: tinyErroMensagem(json) }, { status: 400 })
    }

    const rawList = json?.retorno?.notas_fiscais
    const lista = Array.isArray(rawList) ? rawList : []
    const notas = lista
      .map((x: any) => x?.nota_fiscal || x)
      .filter((nf: any) => nf && nf.id != null)

    if (notas.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Nenhuma nota encontrada com esses dados.' },
        { status: 404 }
      )
    }

    let filtradas = notas.filter((nf: any) => numerosNotaIguais(numeroRaw, nf.numero))

    if (cnpjInformado && cnpjDigits.length === 14) {
      filtradas = filtradas.filter((nf: any) => docClienteIgualCnpj(nf, cnpjDigits))
    }

    if (filtradas.length === 0) {
      const hint = cnpjInformado
        ? 'Nenhuma nota encontrada com esse número e CNPJ.'
        : 'Nenhuma nota encontrada com esse número. Se existir mais de uma nota com o mesmo número, informe também o CNPJ do destinatário.'
      return NextResponse.json({ ok: false, error: hint }, { status: 404 })
    }

    if (filtradas.length > 1 && !cnpjInformado) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Foram encontradas várias notas com esse número. Informe também o CNPJ do destinatário para identificar a nota correta.',
          code: 'MULTIPLAS_NOTAS_SEM_CNPJ',
        },
        { status: 409 }
      )
    }

    if (filtradas.length > 1) {
      filtradas.sort((a: any, b: any) => {
        const sa = String(a?.serie ?? '')
        const sb = String(b?.serie ?? '')
        return sa.localeCompare(sb)
      })
    }

    const nf = filtradas[0]
    const valor = nf.valor != null ? String(nf.valor) : String(nf.valor_nota ?? '0')

    return NextResponse.json({
      ok: true,
      data: {
        id: String(nf.id),
        numero: String(nf.numero ?? ''),
        serie: nf.serie != null ? String(nf.serie) : '',
        data_emissao: nf.data_emissao ? String(nf.data_emissao) : '',
        cliente_nome: String(nf.cliente?.nome || nf.nome || ''),
        cliente_cnpj: String(nf.cliente?.cpf_cnpj || ''),
        endereco_entrega: montarEnderecoEntrega(nf),
        valor,
        situacao: nf.descricao_situacao != null ? String(nf.descricao_situacao) : '',
      },
    })
  } catch (e: any) {
    console.error('[revisar-pedido/pesquisar]', e)
    return NextResponse.json(
      { ok: false, error: e?.message || 'Erro ao consultar. Tente novamente mais tarde.' },
      { status: 500 }
    )
  }
}
