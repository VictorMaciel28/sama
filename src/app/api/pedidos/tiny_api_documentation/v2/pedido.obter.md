Obter Pedido API 2.0
Serviço destinado a obter os dados de um Pedido.

REST
REST URL
[https://api.tiny.com.br/api2/pedido.obter.php](https://api.tiny.com.br/api2/pedido.obter.php)

Parâmetros do serviço
Elemento	Tipo	Ocorrência	Descrição
token	string	obrigatório	Chave gerada para identificar sua empresa
id	int	obrigatório	Número de identificação do pedido na Olist
formato	string	obrigatório	Formato do retorno (json)

Retorno do serviço
Elemento	Tipo	Tamanho	Ocorrência	Descrição
retorno	-	-	obrigatório	Elemento raiz do retorno
retorno.status_processamento	int	-	obrigatório	Conforme tabela "Status de Processamento"
retorno.status	string	-	obrigatório	Contém o status do retorno “OK” ou “Erro”. Para o caso de conter erros estes serão descritos abaixo
retorno.codigo_erro (1)	int	-	condicional	Conforme tabela "Códigos de erro"
retorno.erros[ ] (1) (3)	list	-	condicional [0..n]	Contém a lista dos erros encontrados.
retorno.erros[ ].erro	string	-	condicional	Mensagem contendo a descrição do erro
retorno.pedido (2)	object	-	condicional	Elemento utilizado para representar um pedido.
retorno.pedido.id	int	-	condicional	Número de identificação do pedido na Olist
retorno.pedido.numero	int	-	condicional	Número do pedido na Olist
retorno.pedido.numero_ecommerce	string	50	condicional	Número do pedido no ecommerce(ou sistema)
retorno.pedido.data_pedido (4)	date	10	opcional	Data do pedido
retorno.pedido.data_prevista (4)	date	10	opcional	Data de previsão do pedido
retorno.pedido.data_faturamento (4)	date	10	opcional	Data de faturamento do pedido
retorno.pedido.data_envio (4)	date	10	opcional	Data de envio do pedido
retorno.pedido.data_entrega (4)	date	10	opcional	Data de entrega do pedido
retorno.pedido.id_lista_preco	object		opcional	Número de identificação da lista de preços na Olist
retorno.pedido.descricao_lista_preco	object		opcional	Descrição da lista de preços
retorno.pedido.cliente	object		obrigatório	Elemento utilizado para representar o cliente
retorno.pedido.cliente.codigo	string	30	opcional	Código do cliente
retorno.pedido.cliente.nome	string	30	obrigatório	Nome do cliente
retorno.pedido.cliente.nome_fantasia	string	60	opcional	Nome fantasia do cliente
retorno.pedido.cliente.tipo_pessoa	string	1	opcional	Tipo de pessoa (F - Física, J - Jurídica, E - Estrangeiro)
retorno.pedido.cliente.cpf_cnpj	string	18	opcional	CPF ou CNPJ do cliente
retorno.pedido.cliente.ie	string	18	opcional	Inscrição estadual do cliente
retorno.pedido.cliente.rg	string	10	opcional	RG do cliente
retorno.pedido.cliente.endereco	string	50	opcional	Endereço do cliente
retorno.pedido.cliente.numero	string	10	opcional	Número do endereço do cliente
retorno.pedido.cliente.complemento	string	50	opcional	Complemento do endereço do cliente
retorno.pedido.cliente.bairro	string	30	opcional	Bairro do cliente
retorno.pedido.cliente.cep	string	10	opcional	Cep do cliente
retorno.pedido.cliente.cidade	string	30	opcional	Nome da cidade do cliente conforme a Tabela de Cidades
retorno.pedido.cliente.uf	string	30	opcional	UF do cliente
retorno.pedido.cliente.pais	string	50	opcional	Nome do País do cliente conforme Tabela de Países
retorno.pedido.cliente.fone	string	40	opcional	Telefone do cliente
retorno.pedido.cliente.email	string	50	opcional	Email do cliente
retorno.pedido.endereco_entrega	object		opcional	Elemento utilizado para representar o endereço de entrega, caso seja diferente do endereço do cliente
retorno.pedido.endereco_entrega.tipo_pessoa	string	1	opcional	Tipo de pessoa (F - Física, J - Jurídica, E - Estrangeiro)
retorno.pedido.endereco_entrega.cpf_cnpj	string	18	opcional	CPF ou CNPJ de entrega
retorno.pedido.endereco_entrega.endereco	string	50	opcional	Endereço de entrega
retorno.pedido.endereco_entrega.numero	string	10	opcional	Número do endereço de entrega
retorno.pedido.endereco_entrega.complemento	string	50	opcional	Complemento do endereço de entrega
retorno.pedido.endereco_entrega.bairro	string	30	opcional	Bairro de entrega
retorno.pedido.endereco_entrega.cep	string	10	opcional	Cep de entrega
retorno.pedido.endereco_entrega.cidade	string	30	opcional	Nome da cidade de entrega conforme a Tabela de Cidades
retorno.pedido.endereco_entrega.uf	string	30	opcional	UF de entrega
retorno.pedido.endereco_entrega.fone	string	40	opcional	Telefone de entrega
retorno.pedido.endereco_entrega.nome_destinatario	string	60	opcional	Nome do destinatário da entrega
retorno.pedido.endereco_entrega.ie	string	18	opcional	Inscrição estadual de entrega
retorno.pedido.itens[ ]	list		obrigatório	Lista de itens do pedido
retorno.pedido.itens[ ].item	object		obrigatório	Elemento utilizado para representar um item do pedido
retorno.pedido.itens[ ].item.id_produto	int	-	opcional	Número de identificação do produto na Olist
retorno.pedido.itens[ ].item.codigo	string	20	opcional	Código do Produto
retorno.pedido.itens[ ].item.descricao	string	120	obrigatório	Descrição do Produto
retorno.pedido.itens[ ].item.unidade	string	3	obrigatório	Unidade do produto
retorno.pedido.itens[ ].item.quantidade (5)	decimal	-	obrigatório	Quantidade do produto
retorno.pedido.itens[ ].item.valor_unitario (5)	decimal	-	obrigatório	Valor unitário do produto
retorno.pedido.itens[ ].item.info_adicional	string	-	opcional	Informação adicional do item no pedido de venda
retorno.pedido.condicao_pagamento	string	30	opcional	Descrição da condição de pagamento
retorno.pedido.forma_pagamento	string	30	obrigatório	Código conforme tabela de Formas de pagamento
retorno.pedido.meio_pagamento	string	100	opcional	Descrição do meio de pagamento
retorno.pedido.parcelas[ ]	list		opcional	Lista de parcelas do pedido
retorno.pedido.parcelas[ ].parcela	object		opcional	Elemento utilizado para representar uma parcela do pedido
retorno.pedido.parcelas[ ].parcela.dias	int	20	opcional	Dias de Vencimento da Parcela
retorno.pedido.parcelas[ ].parcela.data (4)	date	10	opcional	Data de Vencimento da Parcela
retorno.pedido.parcelas[ ].parcela.valor (5)	decimal	-	opcional	Valor da parcela
retorno.pedido.parcelas[ ].parcela.obs	string	100	opcional	Observação da parcela
retorno.pedido.parcelas[ ].parcela.forma_pagamento	string	30	obrigatório	Código conforme tabela de Formas de pagamento
retorno.pedido.parcelas[ ].parcela.meio_pagamento	string	100	opcional	Descrição do meio de pagamento
retorno.pedido.marcadores[ ]	list		opcional	Lista de marcadores do pedido
retorno.pedido.marcadores[ ].marcador	object		opcional	Elemento utilizado para representar um marcador do pedido
retorno.pedido.marcadores[ ].marcador.id	int	-	opcional	Identificação do marcador na Olist
retorno.pedido.marcadores[ ].marcador.descricao	string	50	opcional	Descrição do marcador
retorno.pedido.marcadores[ ].marcador.cor	string	-	opcional	Hexadecimal da cor do marcador
retorno.pedido.nome_transportador	string	30	opcional	Nome do transportador
retorno.pedido.frete_por_conta	string	1	opcional	R - Contratação do Frete por conta do Remetente (CIF), D - Contratação do Frete por conta do Destinatário (FOB), T - Contratação do Frete por conta de Terceiros, 3 - Transporte Próprio por conta do Remetente, 4 - Transporte Próprio por conta do Destinatário, S - Sem Ocorrência de Transporte
retorno.pedido.forma_frete	string	30	opcional	Forma de frete de acordo com o cadastro na Olist
retorno.pedido.valor_frete (5)	decimal	-	opcional	Valor do frete do pedido
retorno.pedido.valor_desconto (5)	decimal	-	opcional	Valor do desconto do pedido
retorno.pedido.outras_despesas	decimal	-	opcional	Outras despesas do pedido
retorno.pedido.total_produtos (5)	decimal	-	opcional	Valor total dos produtos
retorno.pedido.total_pedido (5)	decimal	-	opcional	Valor total do pedido
retorno.pedido.situacao	string	15	opcional	Situação do pedido conforme tabela de Situações dos Pedidos
retorno.pedido.numero_ordem_compra	string	10	opcional	Número de ordem de compra
retorno.pedido.id_vendedor	int	-	opcional	Número de identificação do Vendedor associado ao pedido.
retorno.pedido.nome_vendedor	string	50	opcional	Nome do Vendedor associado ao pedido.
retorno.pedido.obs	string	100	opcional	Observação do pedido
retorno.pedido.obs_interna	string	100	opcional	Observação interna do pedido
retorno.pedido.codigo_rastreamento	string	20	opcional	Código de rastreamento do pedido
retorno.pedido.url_rastreamento	string	120	opcional	URL de rastreamento do pedido
retorno.pedido.id_nota_fiscal	int	-	opcional	Identificador da nota fiscal referenciada pela venda
retorno.pedido.deposito	string	-	opcional	Nome do depósito vinculado pela venda
retorno.pedido.ecommerce	object		opcional	E-commerce
retorno.pedido.forma_envio	string	30	opcional	Forma de envio, conforme Tabela de forma de envio
retorno.pedido.ecommerce.id	int	-	opcional	Identificador do e-commerce na Olist
retorno.pedido.ecommerce.numeroPedidoEcommerce	string	-	opcional	Número do pedido no e-commerce
retorno.pedido.ecommerce.numeroPedidoCanalVenda	string	-	opcional	Número do pedido no canal de venda
retorno.pedido.ecommerce.nomeEcommerce	string	-	opcional	Nome do e-commerce
retorno.pedido.ecommerce.canalVenda	string	-	opcional	Descrição do canal de venda vinculado ao e-commerce
retorno.pedido.intermediador	object		opcional	Intermediador
retorno.pedido.intermediador.nome	string	60	obrigatório	Nome no intermediador
retorno.pedido.intermediador.cnpj	string	18	obrigatório	CNPJ do intermediador
retorno.pedido.intermediador.cnpjPagamento	string	18	opcional	CNPJ da instituição de pagamento do intermediador
retorno.pedido.id_natureza_operacao	string	-	opcional	Identificador da natureza de operação
retorno.pedido.pagamentos_integrados[]	list	[0..n]	obrigatório	Lista de pagamentos integrados do pedido
retorno.pedido.pagamentos_integrados[].valor	decimal	-	obrigatório	Valor do pagamento
retorno.pedido.pagamentos_integrados[].tipo_pagamento	int	-	obrigatório	Código da forma de pagamento conforme Tabela de Meios de pagamento de NFe
retorno.pedido.pagamentos_integrados[].cnpj_intermediador	string	14	obrigatório	CNPJ do Intermediador
retorno.pedido.pagamentos_integrados[].codigo_autorizacao	string	-	obrigatório	Código de autorização da transação
retorno.pedido.pagamentos_integrados[].codigo_bandeira	int	-	obrigatório	Bandeira da operadora de cartão.
(1) - Somente estará presente no retorno caso o elemento "status" seja "Erro".
(2) - Somente estará presente no retorno caso o elemento "status" seja "OK".
(3) - Estes campos somente serão informados caso o retorno contenha erros.
(4) - Estes campos devem ser informados no formato dd/mm/yyyy, exemplo "01/01/2012".
(5) - Estes campos utilizam “.” (ponto) como separador de decimais, exemplo "5.25".

$url = '[https://api.tiny.com.br/api2/pedido.obter.php](https://api.tiny.com.br/api2/pedido.obter.php)';
$token = 'coloque aqui a sua chave da api';
$id = 'xxxxx';
$formato = 'JSON';
$data = "token=$token&id=$id&formato='$formato'";

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
    "codigo_erro": 32,
    "erros": [
      {
        "erro": "Pedido não localizado"
      }
    ]
  }
}
{
  "retorno": {
    "status_processamento": "3",
    "status": "OK",
    "pedido": {
      "id": "123456",
      "numero": "123",
      "data_pedido": "01/01/2012",
      "data_prevista": "10/01/2012",
      "data_faturamento": "09/01/2012",
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
        "fone": "5412345678"
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
      "parcelas": [
        {
          "parcela": {
            "dias": "30",
            "data": "29/11/2012",
            "valor": "53.84",
            "obs": "Obs Parcela 1"
          }
        },
        {
          "parcela": {
            "dias": "60",
            "data": "29/12/2012",
            "valor": "53.83",
            "obs": "Obs Parcela 2"
          }
        },
        {
          "parcela": {
            "dias": "90",
            "data": "27/01/2013",
            "valor": "53.83",
            "obs": "Obs Parcela 3"
          }
        }
      ],
      "marcadores": [
        {
          "marcador": {
            "id": "149238",
            "descricao": "Teste",
            "cor": "#808080"
          }
        }
      ],
      "condicao_pagamento": "30 60 90",
      "forma_pagamento": "crediario",
      "meio_pagamento": "Dinheiro",
      "nome_transportador": "transportador teste",
      "frete_por_conta": "E",
      "valor_frete": "35.00",
      "valor_desconto": "35.00",
      "total_produtos": "161.50",
      "total_pedido": "161.50",
      "numero_ordem_compra": "123",
      "deposito": "Teste",
      "forma_envio": "C",
      "forma_frete": "SEDEX - CONTRATO (40436)",
      "situacao": "Em aberto",
      "obs": "Observação Teste",
      "id_vendedor": "0",
      "nome_vendedor": "",
      "codigo_rastreamento": "TINY90831920321BR",
      "url_rastreamento": "[http://urlrastreamento.com.br](http://urlrastreamento.com.br)",
      "id_nota_fiscal": "0",
      "pagamentos_integrados": [
        {
          "pagamento_integrado": {
            "valor": 10,
            "tipo_pagamento": 1,
            "cnpj_intermediador": "49525029000186",
            "codigo_autorizacao": "JFAUTH0000020820250904130544849357542",
            "codigo_bandeira": 1
          }
        }
      ]
    }
  }
}