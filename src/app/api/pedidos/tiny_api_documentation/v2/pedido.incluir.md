Incluir Pedido API 2.0
destinado a fazer inclusão de Pedidos.

REST
REST URL
https://api.tiny.com.br/api2/pedido.incluir.php
Parâmetros do serviço
Elemento	Tipo	Ocorrência	Descrição
token	string	obrigatório	Chave gerada para identificar sua empresa
pedido (1)	-	obrigatório	Dados do pedido conforme layout
formato	string	obrigatório	Formato do retorno (json)
(1) - Layout do parâmetro pedido
Retorno do serviço
Elemento	Tipo	Tamanho	Ocorrência	Descrição
retorno	object	-	obrigatório	Elemento raiz do retorno
retorno.status_processamento	int	-	obrigatório	Conforme tabela "Status de Processamento"
retorno.status	string	-	obrigatório	Contém o status do retorno “OK” ou “Erro”. Para o caso de conter erros estes serão descritos abaixo
retorno.codigo_erro (1)	int	-	obrigatório	Conforme tabela "Códigos de erro"
retorno.erros[ ] (1) (3)	list	-	condicional [0..n]	Contém a lista dos erros encontrados.
retorno.erros[ ].erro	string	-	condicional	Mensagem contendo a descrição do erro
retorno.registros[ ] (2)	list	-	condicional	Lista de resultados da pesquisa
retorno.registros[ ].registro (2)	object	-	condicional	Elemento utilizado para representar um pedido.
retorno.registros[ ].registro.sequencia	int	-	condicional	Número sequencial utilizado para identificar cada pedido.
retorno.registros[ ].registro.status	string	-	condicional	Contém o status do registro “OK” ou “Erro”. Para o caso de conter erros estes serão descritos abaixo
retorno.registros[ ].registro.codigo_erro	int	-	condicional	Conforme tabela "Códigos de erro"
retorno.registros[ ].registro.erros[ ] (3)	list	-	condicional [0..n]	Contém a lista dos erros encontrados.
retorno.registros[ ].registro.erros[ ].erro	string	-	condicional	Mensagem contendo a descrição do erro
retorno.registros[ ].registro.id	int	-	condicional	Número de identificação do Pedido na Olist
retorno.registros[ ].registro.numero	int	-	condicional	Número do Pedido na Olist
(1) - Somente estará presente no retorno caso o elemento "status" seja "Erro".
(2) - Somente estará presente no retorno caso o elemento "status" seja diferente de "OK".
(3) - Estes campos somente serão informados caso o retorno contenha erros.


Exemplos do parâmetro pedido em JSON
{
  "pedido": {
    "data_pedido": "20/10/2014",
    "data_prevista": "22/10/2014",
    "cliente": {
      "codigo": "1235",
      "nome": "Contato Teste 2",
      "nome_fantasia": "Fantasia Contato Teste 2",
      "tipo_pessoa": "F",
      "cpf_cnpj": "22755777850",
      "ie": "",
      "rg": "1234567890",
      "endereco": "Rua Teste",
      "numero": "123",
      "complemento": "sala 2",
      "bairro": "Teste",
      "cep": "95700000",
      "cidade": "Bento Gonçalves",
      "uf": "RS",
      "fone": "5430553808",
      "cpfConsumidorFinal": "22755777850"
    },
    "itens": [
      {
        "item": {
          "codigo": "1234",
          "descricao": "Produto Teste 1",
          "unidade": "UN",
          "quantidade": "2",
          "valor_unitario": "50.25"
        }
      },
      {
        "item": {
          "codigo": "1235",
          "descricao": "Produto Teste 2",
          "unidade": "UN",
          "quantidade": "4",
          "valor_unitario": "15.25"
        }
      }
    ],
    "marcadores": [
      {
        "marcador": {
          "descricao": "abcdef"
        }
      },
      {
        "marcador": {
          "id": "1234",
          "descricao": ""
        }
      },
      {
        "marcador": {
          "id": "1234"
        }
      }
    ],
    "parcelas": [
      {
        "parcela": {
          "dias": "30",
          "data": "29/11/2014",
          "valor": "53.84",
          "obs": "Obs Parcela 1",
          "forma_pagamento": "boleto",
          "meio_pagamento": "Bradesco X"
        }
      },
      {
        "parcela": {
          "dias": "60",
          "data": "29/12/2014",
          "valor": "53.83",
          "obs": "Obs Parcela 2",
          "forma_pagamento": "dinheiro"
        }
      },
      {
        "parcela": {
          "dias": "90",
          "data": "27/01/2015",
          "valor": "53.83",
          "obs": "Obs Parcela 3"
        }
      }
    ],
    "nome_transportador": "transportador teste",
    "forma_pagamento": "multiplas",
    "frete_por_conta": "E",
    "valor_frete": "35.00",
    "valor_desconto": "35.00",
    "numero_ordem_compra": "",
    "numero_pedido_ecommerce": "123",
    "situacao": "Aberto",
    "obs": "Observações do Pedido",
    "forma_envio": "c",
    "forma_frete": "PAC",
    "intermediador": {
      "nome": "Intermediador Teste",
      "cnpj": "00.000.000/0000-00",
      "cnpjPagamento": "00.000.000/0000-00"
    },
    "pagamentos_integrados": [
      {
        "pagamento_integrado": {
          "tipo_pagamento": "17",
          "valor": "29.99",
          "cnpj_intermediador": "21018182000106",
          "codigo_autorizacao": "E0000020820250904130544849357542",
          "codigo_bandeira": "2"
        }
      }
    ]
  }
}


Exemplos da chamada em REST

$url = 'https://api.tiny.com.br/api2/pedido.incluir.php';
$token = 'coloque aqui a sua chave da api';
$pedido = '<pedido>...</pedido>';
$data = "token=$token&pedido=$pedido&formato=JSON";

enviarREST($url, $data);    

function enviarREST($url, $data, $optional_headers = null) {
	$params = array('http' => array(
		'method' => 'POST',
	    'content' => $data
	));
	
	if ($optional_headers !== null) {
		$params['http']['header'] = $optional_headers;
	}
	
	$ctx = stream_context_create($params);
	$fp = @fopen($url, 'rb', false, $ctx);
	if (!$fp) {
		throw new Exception("Problema com $url, $php_errormsg");
	}
	$response = @stream_get_contents($fp);
	if ($response === false) {
		throw new Exception("Problema obtendo retorno de $url, $php_errormsg");
	}
	
	return $response;
}


Exemplos do retorno do serviço em JSON
{
  "retorno": {
    "status_processamento": 1,
    "status": "Erro",
    "codigo_erro": 2,
    "erros": [
      {
        "erro": "token invalido"
      }
    ]
  }
}
{
  "retorno": {
    "status_processamento": 2,
    "status": "Erro",
    "registros": [
      {
        "registro": {
          "sequencia": "1",
          "status": "Erro",
          "codigo_erro": "30",
          "erros": [
            {
              "erro": "Registro em duplicidade"
            }
          ]
        }
      }
    ]
  }
}
{
  "retorno": {
    "status_processamento": 3,
    "status": "OK",
    "registros": {
      "registro": {
        "sequencia": "1",
        "status": "OK",
        "id": "37644545",
        "numero": "37644545"
      }
    }
  }
}