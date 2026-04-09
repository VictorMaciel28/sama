Get para https://api.tiny.com.br/public-api/v3/pedidos/{idPedido}

Resposta:

{
description:	
id	integer
nullable: true
numeroPedido	integer
nullable: true
idNotaFiscal	integer
nullable: true
dataFaturamento	string
nullable: true
valorTotalProdutos	number($float)
nullable: true
valorTotalPedido	number($float)
nullable: true
listaPreco	{
description:	
id	[...]
nome	[...]
acrescimoDesconto	[...]
}
cliente	{
description:	
nome	[...]
codigo	[...]
fantasia	[...]
tipoPessoa	[...]
cpfCnpj	[...]
inscricaoEstadual	[...]
rg	[...]
telefone	[...]
celular	[...]
email	[...]
endereco	{...}
id	[...]
}
enderecoEntrega	{
description:	
endereco	[...]
numero	[...]
complemento	[...]
bairro	[...]
municipio	[...]
cep	[...]
uf	[...]
pais	[...]
nomeDestinatario	[...]
cpfCnpj	[...]
tipoPessoa	[...]
telefone	[...]
inscricaoEstadual	[...]
}
ecommerce	{
description:	
id	[...]
nome	[...]
numeroPedidoEcommerce	[...]
numeroPedidoCanalVenda	[...]
canalVenda	[...]
}
transportador	{
description:	
id	[...]
nome	[...]
fretePorConta	[...]
formaEnvio	{...}
formaFrete	{...}
codigoRastreamento	[...]
urlRastreamento	[...]
}
deposito	{
description:	
id	[...]
nome	[...]
}
vendedor	{
description:	
id	[...]
nome	[...]
}
naturezaOperacao	{
description:	
id	[...]
nome	[...]
}
intermediador	{
description:	
id	[...]
nome	[...]
cnpj	[...]
cnpjPagamentoInstituicao	[...]
}
pagamento	{
description:	
formaRecebimento	{...}
meioPagamento	{...}
condicaoPagamento	[...]
parcelas	[...]
}
itens	[
nullable: true
{
description:	
produto	{...}
quantidade	[...]
valorUnitario	[...]
infoAdicional	[...]
}]
pagamentosIntegrados	[
nullable: true
{
description:	
valor	[...]
tipoPagamento	[...]
cnpjIntermediador	[...]
codigoAutorizacao	[...]
codigoBandeira	[...]
}]
situacao	integer
nullable: true
8 - Dados Incompletos
0 - Aberta
3 - Aprovada
4 - Preparando Envio
1 - Faturada
7 - Pronto Envio
5 - Enviada
6 - Entregue
2 - Cancelada
9 - Nao Entregue
Enum:
Array [ 10 ]
data	string
example: 2024-01-01
nullable: true
dataEntrega	string
example: 2024-01-01
nullable: true
numeroOrdemCompra	string
nullable: true
valorDesconto	number($float)
nullable: true
valorFrete	number($float)
nullable: true
valorOutrasDespesas	number($float)
nullable: true
dataPrevista	string
example: 2024-01-01
nullable: true
dataEnvio	string
example: 2024-01-01 00:00:00
nullable: true
observacoes	string
nullable: true
observacoesInternas	string
nullable: true
origemPedido	integer
nullable: true
Origem do pedido (0 = Pedido de Venda, 1 = PDV)

}

Exemplo de resposta

{
  "id": 0,
  "numeroPedido": 0,
  "idNotaFiscal": 0,
  "dataFaturamento": "string",
  "valorTotalProdutos": 0,
  "valorTotalPedido": 0,
  "listaPreco": {
    "id": 0,
    "nome": "string",
    "acrescimoDesconto": 0
  },
  "cliente": {
    "nome": "string",
    "codigo": "string",
    "fantasia": "string",
    "tipoPessoa": "J",
    "cpfCnpj": "string",
    "inscricaoEstadual": "string",
    "rg": "string",
    "telefone": "string",
    "celular": "string",
    "email": "string",
    "endereco": {
      "endereco": "string",
      "numero": "string",
      "complemento": "string",
      "bairro": "string",
      "municipio": "string",
      "cep": "string",
      "uf": "string",
      "pais": "string"
    },
    "id": 0
  },
  "enderecoEntrega": {
    "endereco": "string",
    "numero": "string",
    "complemento": "string",
    "bairro": "string",
    "municipio": "string",
    "cep": "string",
    "uf": "string",
    "pais": "string",
    "nomeDestinatario": "string",
    "cpfCnpj": "string",
    "tipoPessoa": "string",
    "telefone": "string",
    "inscricaoEstadual": "string"
  },
  "ecommerce": {
    "id": 0,
    "nome": "string",
    "numeroPedidoEcommerce": "string",
    "numeroPedidoCanalVenda": "string",
    "canalVenda": "string"
  },
  "transportador": {
    "id": 0,
    "nome": "string",
    "fretePorConta": "R",
    "formaEnvio": {
      "id": 0,
      "nome": "string"
    },
    "formaFrete": {
      "id": 0,
      "nome": "string"
    },
    "codigoRastreamento": "string",
    "urlRastreamento": "string"
  },
  "deposito": {
    "id": 0,
    "nome": "string"
  },
  "vendedor": {
    "id": 0,
    "nome": "string"
  },
  "naturezaOperacao": {
    "id": 0,
    "nome": "string"
  },
  "intermediador": {
    "id": 0,
    "nome": "string",
    "cnpj": "string",
    "cnpjPagamentoInstituicao": "string"
  },
  "pagamento": {
    "formaRecebimento": {
      "id": 0,
      "nome": "string"
    },
    "meioPagamento": {
      "id": 0,
      "nome": "string"
    },
    "condicaoPagamento": "string",
    "parcelas": [
      {
        "dias": 0,
        "data": "2024-01-01",
        "valor": 0,
        "observacoes": "string",
        "formaRecebimento": {
          "id": 0,
          "nome": "string"
        },
        "meioPagamento": {
          "id": 0,
          "nome": "string"
        }
      }
    ]
  },
  "itens": [
    {
      "produto": {
        "id": 0,
        "sku": "string",
        "descricao": "string",
        "tipo": "P"
      },
      "quantidade": 0,
      "valorUnitario": 0,
      "infoAdicional": "string"
    }
  ],
  "pagamentosIntegrados": [
    {
      "valor": 0,
      "tipoPagamento": 0,
      "cnpjIntermediador": "string",
      "codigoAutorizacao": "string",
      "codigoBandeira": 0
    }
  ],
  "situacao": 8,
  "data": "2024-01-01",
  "dataEntrega": "2024-01-01",
  "numeroOrdemCompra": "string",
  "valorDesconto": 0,
  "valorFrete": 0,
  "valorOutrasDespesas": 0,
  "dataPrevista": "2024-01-01",
  "dataEnvio": "2024-01-01 00:00:00",
  "observacoes": "string",
  "observacoesInternas": "string",
  "origemPedido": 0
}

{
  "mensagem": "Ocorreram erros de validação",
  "detalhes": [
    {
      "campo": "codigo",
      "mensagem": "O campo código é obrigatório"
    }
  ]
}