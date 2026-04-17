Obter Nota Fiscal API 2.0
Serviço destinado a obter os dados de uma Nota Fiscal.

REST
REST URL
https://api.tiny.com.br/api2/nota.fiscal.obter.php
Parâmetros do serviço
Elemento	Tipo	Ocorrência	Descrição
token	string	obrigatório	Chave gerada para identificar sua empresa
id	int	obrigatório	Número de identificação da nota fiscal na Olist
formato	string	obrigatório	Formato do retorno (json)
Retorno do serviço
Elemento	Tipo	Tamanho	Ocorrência	Descrição
retorno	-	-	obrigatório	Elemento raiz do retorno
retorno.status_processamento	int	-	obrigatório	Conforme tabela "Status de Processamento"
retorno.status	string	-	obrigatório	Contém o status do retorno “OK” ou “Erro”. Para o caso de conter erros estes serão descritos abaixo
retorno.codigo_erro (1)	int	-	condicional	Conforme tabela "Códigos de erro"
retorno.erros[ ] (1) (3)	list	-	condicional [0..n]	Contém a lista dos erros encontrados.
retorno.erros[ ].erro	string	-	condicional	Mensagem contendo a descrição do erro
retorno.nota_fiscal (2)	object	-	condicional	Nodo utilizado para representar uma nota fiscal.
retorno.nota_fiscal.id	int	-	condicional	Número de identificação da nota fiscal na Olist
retorno.nota_fiscal.tipo_nota	string	1	condicional	Código conforme Tabela de tipos da nota fiscal
retorno.nota_fiscal.natureza_operacao	string	80	condicional	Natureza de operação da nota fiscal
retorno.nota_fiscal.regime_tributario	int	-	condicional	Código conforme Tabela de regime tributário da nota fiscal
retorno.nota_fiscal.finalidade	int	i	condicional	Código conforme Tabela de finalidade da nota fiscal
retorno.nota_fiscal.serie	int	-	condicional	Número de série da nota fiscal
retorno.nota_fiscal.numero	int	-	condicional	Número da nota fiscal
retorno.nota_fiscal.numero_ecommerce	string	50	condicional	Número do pedido no ecommerce(ou sistema)
retorno.nota_fiscal.data_emissao (4)	date	10	opcional	Data de emissão da nota fiscal
retorno.nota_fiscal.data_saida (4)	date	10	opcional	Data de saída da nota fiscal
retorno.nota_fiscal.hora_saida (6)	string	10	opcional	Hora de saída da nota fiscal
retorno.nota_fiscal.cliente	object	10	opcional	Elemento utilizado para representar o cliente
retorno.nota_fiscal.cliente.nome	string	30	obrigatório	Nome do cliente
retorno.nota_fiscal.cliente.tipo_pessoa	string	1	opcional	Tipo de pessoa (F - Física, J - Jurídica, E - Estrangeiro)
retorno.nota_fiscal.cliente.cpf_cnpj	string	18	opcional	CPF ou CNPJ do cliente
retorno.nota_fiscal.cliente.ie	string	18	opcional	Inscrição estadual do cliente
retorno.nota_fiscal.cliente.endereco	string	50	opcional	Endereço do cliente
retorno.nota_fiscal.cliente.numero	string	10	opcional	Número do endereço do cliente
retorno.nota_fiscal.cliente.complemento	string	50	opcional	Complemento do endereço do cliente
retorno.nota_fiscal.cliente.bairro	string	30	opcional	Bairro do cliente
retorno.nota_fiscal.cliente.cep	string	10	opcional	Cep do cliente
retorno.nota_fiscal.cliente.cidade	string	30	opcional	Nome da cidade do cliente conforme a Tabela de Cidades
retorno.nota_fiscal.cliente.uf	string	30	opcional	UF do cliente
retorno.nota_fiscal.cliente.fone	string	40	opcional	Telefone do cliente
retorno.nota_fiscal.cliente.email	string	40	opcional	E-mail do cliente
retorno.nota_fiscal.endereco_entrega	object		opcional	Elemento utilizado para representar o endereço de entrega (se não houver, será retornado o mesmo de cobrança).
retorno.nota_fiscal.endereco_entrega.tipo_pessoa	string	1	opcional	Tipo de pessoa (F - Física, J - Jurídica, E - Estrangeiro)
retorno.nota_fiscal.endereco_entrega.cpf_cnpj	string	18	opcional	CPF ou CNPJ de entrega
retorno.nota_fiscal.endereco_entrega.endereco	string	50	opcional	Endereço de entrega
retorno.nota_fiscal.endereco_entrega.numero	string	10	opcional	Número do endereço de entrega
retorno.nota_fiscal.endereco_entrega.complemento	string	50	opcional	Complemento do endereço de entrega
retorno.nota_fiscal.endereco_entrega.bairro	string	30	opcional	Bairro de entrega
retorno.nota_fiscal.endereco_entrega.cep	string	10	opcional	Cep de entrega
retorno.nota_fiscal.endereco_entrega.cidade	string	30	opcional	Nome da cidade de entrega conforme a Tabela de Cidades
retorno.nota_fiscal.endereco_entrega.uf	string	30	opcional	UF de entrega
retorno.nota_fiscal.endereco_entrega.fone	string	40	opcional	Telefone de entrega
retorno.nota_fiscal.endereco_entrega.nome_destinatario	string	60	opcional	Nome do destinatário da entrega
retorno.nota_fiscal.endereco_entrega.ie	string	18	opcional	Inscrição estadual de entrega
retorno.nota_fiscal.itens[ ]	list		obrigatório	Lista de itens da nota fiscal
retorno.nota_fiscal.itens[ ].item	object		obrigatório	Elemento utilizado para representar um item da nota fiscal
retorno.nota_fiscal.itens[ ].item.id_produto	int	-	opcional	Número de identificação do produto na Olist
retorno.nota_fiscal.itens[ ].item.codigo	string	60	opcional	Código do item
retorno.nota_fiscal.itens[ ].item.descricao	string	120	obrigatório	Descrição do item
retorno.nota_fiscal.itens[ ].item.unidade	string	3	obrigatório	Unidade do item
retorno.nota_fiscal.itens[ ].item.ncm	string	10	obrigatório	NCM do item
retorno.nota_fiscal.itens[ ].item.quantidade (5)	decimal	-	obrigatório	Quantidade do item
retorno.nota_fiscal.itens[ ].item.valor_unitario (5)	decimal	-	obrigatório	Valor unitário do item
retorno.nota_fiscal.itens[ ].item.valor_total (5)	decimal	-	obrigatório	Valor total do item
retorno.nota_fiscal.itens[ ].item.cfop	string	4	obrigatório	CFOP do item
retorno.nota_fiscal.itens[ ].item.natureza	string	80	obrigatório	Natureza de operação do item
retorno.nota_fiscal.base_icms (5)	decimal		opcional	Valor da base do ICMS da nota fiscal
retorno.nota_fiscal.valor_icms (5)	decimal		opcional	Valor do ICMS da nota fiscal
retorno.nota_fiscal.base_icms_st (5)	decimal		opcional	Valor da base do ICMS ST da nota fiscal
retorno.nota_fiscal.valor_icms_st (5)	decimal		opcional	Valor do ICMS ST da nota fiscal
retorno.nota_fiscal.valor_servicos (5)	decimal		opcional	Valor dos serviços da nota fiscal
retorno.nota_fiscal.valor_produtos (5)	decimal		opcional	Valor dos produtos da nota fiscal
retorno.nota_fiscal.valor_frete (5)	decimal		opcional	Valor do frete da nota fiscal
retorno.nota_fiscal.valor_seguro (5)	decimal		opcional	Valor do seguro da nota fiscal
retorno.nota_fiscal.valor_outras (5)	decimal		opcional	Valor das outras despesas da nota fiscal
retorno.nota_fiscal.valor_ipi (5)	decimal		opcional	Valor do IPI da nota fiscal
retorno.nota_fiscal.valor_issqn (5)	decimal		opcional	Valor do ISSQN da nota fiscal
retorno.nota_fiscal.valor_nota (5)	decimal		opcional	Valor da Nota Fiscal
retorno.nota_fiscal.valor_desconto (5)	decimal		opcional	Valor do desconto da Nota Fiscal
retorno.nota_fiscal.valor_faturado (5)	decimal		opcional	Valor total faturado da Nota Fiscal
retorno.nota_fiscal.frete_por_conta	string	1	opcional	R - Contratação do Frete por conta do Remetente (CIF), D - Contratação do Frete por conta do Destinatário (FOB), T - Contratação do Frete por conta de Terceiros, 3 - Transporte Próprio por conta do Remetente, 4 - Transporte Próprio por conta do Destinatário, S - Sem Ocorrência de Transporte
retorno.nota_fiscal.valor_total_ibs_uf (5)	decimal		opcional	Valor do IBS UF da nota fiscal
retorno.nota_fiscal.valor_total_cbs (5)	decimal		opcional	Valor do CBS da nota fiscal
retorno.nota_fiscal.transportador	object	10	opcional	Elemento utilizado para representar o transportador
retorno.nota_fiscal.transportador.nome	string	30	obrigatório	Nome do transportador
retorno.nota_fiscal.transportador.cpf_cnpj	string	18	opcional	CPF ou CNPJ do transportador
retorno.nota_fiscal.transportador.ie	string	18	opcional	Inscrição estadual do transportador
retorno.nota_fiscal.transportador.endereco	string	50	opcional	Endereço do transportador
retorno.nota_fiscal.transportador.cidade	string	30	opcional	Nome da cidade do transportador conforme a Tabela de Cidades
retorno.nota_fiscal.transportador.uf	string	30	opcional	UF do transportador
retorno.nota_fiscal.placa	string	8	opcional	Placa do veículo transportador
retorno.nota_fiscal.uf_placa	string	8	opcional	UF da placa do veículo transportador
retorno.nota_fiscal.quantidade_volumes	int		opcional	Quantidade de volumes da Nota Fiscal
retorno.nota_fiscal.especie_volumes	string	20	opcional	Espécie dos volumes da Nota Fiscal
retorno.nota_fiscal.marca_volumes	string	20	opcional	Marca dos volumes da Nota Fiscal
retorno.nota_fiscal.numero_volumes	string	10	opcional	Número dos volumes da Nota Fiscal
retorno.nota_fiscal.peso_bruto (5)	decimal		opcional	Peso Bruto da Nota Fiscal
retorno.nota_fiscal.peso_liquido (5)	decimal		opcional	Peso Líquido da Nota Fiscal
retorno.nota_fiscal.forma_envio.id	int		opcional	Código da forma de envio
retorno.nota_fiscal.forma_envio.descricao	string	30	opcional	Descrição da forma de envio
retorno.nota_fiscal.forma_frete.id	int		opcional	Código da forma de frete
retorno.nota_fiscal.forma_frete.descricao	string	60	opcional	Descrição da forma de frete da Nota Fiscal
retorno.nota_fiscal.codigo_rastreamento	string	20	condicional	Código de rastreamento da Nota Fiscal
retorno.nota_fiscal.url_rastreamento	string	120	condicional	URL de rastreamento da Nota Fiscal
retorno.nota_fiscal.forma_pagamento	string	30	obrigatório	Código conforme tabela de Formas de pagamento
retorno.nota_fiscal.meio_pagamento	string	100	opcional	Descrição do meio de pagamento
retorno.nota_fiscal.condicao_pagamento	string	30	opcional	Descrição da condição de pagamento
retorno.nota_fiscal.parcelas[ ]	list		opcional	Lista de parcelas da Nota Fiscal
retorno.nota_fiscal.parcelas[ ].parcela	object		opcional	Elemento utilizado para representar uma parcela da Nota Fiscal
retorno.nota_fiscal.parcelas[ ].parcela.dias	int	20	opcional	Dias de Vencimento da Parcela
retorno.nota_fiscal.parcelas[ ].parcela.data (4)	date	10	opcional	Data de Vencimento da Parcela
retorno.nota_fiscal.parcelas[ ].parcela.valor (5)	decimal	-	opcional	Valor da parcela
retorno.nota_fiscal.parcelas[ ].parcela.obs	string	100	opcional	Observação da parcela
retorno.nota_fiscal.parcelas[ ].parcela.forma_pagamento	string	30	obrigatório	Código conforme tabela de Formas de pagamento
retorno.nota_fiscal.parcelas[ ].parcela.meio_pagamento	string	100	opcional	Descrição do meio de pagamento
retorno.nota_fiscal.id_venda	int	-	condicional	Número de identificação da venda associada à nota fiscal.
retorno.nota_fiscal.id_vendedor	int	-	opcional	Número de identificação do Vendedor associado a nota fiscal.
retorno.nota_fiscal.nome_vendedor	string	50	opcional	Nome do Vendedor associado a nota fiscal.
retorno.nota_fiscal.situacao	int	-	opcional	Código conforme Tabela de situações da nota fiscal
retorno.nota_fiscal.descricao_situacao	string	30	opcional	Descrição conforme Tabela de situações da nota fiscal
retorno.nota_fiscal.obs	string	100	opcional	Observação da Nota Fiscal
retorno.nota_fiscal.chave_acesso	string	100	opcional	Chave de acesso da Nota Fiscal
retorno.nota_fiscal.marcadores[ ]	list		opcional	Lista de marcadores da Nota Fiscal
retorno.nota_fiscal.marcadores[ ].marcador	object		opcional	Elemento utilizado para representar um marcador da Nota Fiscal
retorno.nota_fiscal.marcadores[ ].marcador.id	int	-	opcional	Identificação do marcador na Olist
retorno.nota_fiscal.marcadores[ ].marcador.descricao	string	50	opcional	Descrição do marcador
retorno.nota_fiscal.marcadores[ ].marcador.cor	string	-	opcional	Hexadecimal da cor do marcador
retorno.nota_fiscal.intermediador	object		opcional	Intermediador
retorno.nota_fiscal.intermediador.nome	string	60	obrigatório	Nome no intermediador
retorno.nota_fiscal.intermediador.cnpj	string	18	obrigatório	CNPJ do intermediador
retorno.nota_fiscal.intermediador.cnpjPagamento	string	18	opcional	CNPJ da instituição de pagamento do intermediador
retorno.nota_fiscal.pagamentos_integrados[]	list	[0..n]	obrigatório	Lista de pagamentos integrados do pedido
retorno.nota_fiscal.pagamentos_integrados[].pagamento_integrado	object	-	obrigatório	Elemento utilizado para representar o pagamento integrado
retorno.nota_fiscal.pagamentos_integrados[].pagamento_integrado.valor	decimal	-	obrigatório	Valor do pagamento
retorno.nota_fiscal.pagamentos_integrados[].pagamento_integrado.tipo_pagamento	int	-	obrigatório	Código da forma de pagamento conforme Tabela de Meios de pagamento de NFe
retorno.nota_fiscal.pagamentos_integrados[].pagamento_integrado.cnpj_intermediador	string	14	obrigatório	CNPJ do Intermediador
retorno.nota_fiscal.pagamentos_integrados[].pagamento_integrado.codigo_autorizacao	string	-	obrigatório	Código de autorização da transação
retorno.nota_fiscal.pagamentos_integrados[].pagamento_integrado.codigo_bandeira	int	-	obrigatório	Bandeira da operadora de cartão.
(1) - Somente estará presente no retorno caso o elemento "status" seja "Erro".
(2) - Somente estará presente no retorno caso o elemento "status" seja "OK".
(3) - Estes campos somente serão informados caso o retorno contenha erros.
(4) - Estes campos devem ser informados no formato dd/mm/yyyy, exemplo "01/01/2012".
(5) - Estes campos utilizam “.” (ponto) como separador de decimais, exemplo "5.25".
(6) - Estes campos utilizam o formato hh:mm:ss, exemplo "10:45:01".

Exemplos de chamada da API
Exemplos da chamada em REST

$url = 'https://api.tiny.com.br/api2/nota.fiscal.obter.php';
$token = 'coloque aqui a sua chave da api';
$id = 'xxxxx';
$data = "token=$token&id=$id&formato=JSON";

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
Exemplos de retorno da API
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
        "erro": "Nota fiscal não localizada"
      }
    ]
  }
}
{
  "retorno": {
    "status_processamento": "3",
    "status": "OK",
    "nota_fiscal": {
      "id": "441591831",
      "tipo_nota": "N",
      "natureza_operacao": "Venda de mercadorias",
      "regime_tributario": "1",
      "finalidade": "1",
      "serie": "1",
      "numero": "000010",
      "numero_ecommerce": "",
      "data_emissao": "16/06/2020",
      "data_saida": "16/06/2020",
      "hora_saida": "16:26",
      "cliente": {
        "nome": "Joao Kleber",
        "tipo_pessoa": "F",
        "cpf_cnpj": "210.257.841-03",
        "ie": "",
        "endereco": "Rua das Flores",
        "numero": "41",
        "complemento": "",
        "bairro": "Icaraí",
        "cep": "61620-430",
        "cidade": "Caucaia",
        "uf": "CE",
        "fone": "",
        "email": ""
      },
      "endereco_entrega": {
        "tipo_pessoa": "F",
        "cpf_cnpj": "210.257.841-03",
        "ie": "",
        "endereco": "Rua das Flores",
        "numero": "41",
        "complemento": "",
        "bairro": "Icaraí",
        "cep": "61620-430",
        "cidade": "Caucaia",
        "uf": "CE",
        "fone": "",
        "nome_destinatario": "Joao Kleber"
      },
      "itens": [
        {
          "item": {
            "id_produto": "441309693",
            "codigo": "CMS-AZUL-m",
            "descricao": "Camisa Azul Tiny - M",
            "unidade": "un",
            "ncm": "4343",
            "quantidade": "2.00",
            "valor_unitario": "50.00",
            "valor_total": "100.00",
            "cfop": "6102",
            "natureza": "Venda de mercadorias"
          }
        }
      ],
      "base_icms": "0.00",
      "valor_icms": "0.00",
      "base_icms_st": "0.00",
      "valor_icms_st": "0.00",
      "valor_servicos": "0.00",
      "valor_produtos": "100.00",
      "valor_frete": "0.00",
      "valor_seguro": "0.00",
      "valor_outras": "0.00",
      "valor_ipi": "0.00",
      "valor_issqn": "0.00",
      "valor_nota": "100.00",
      "valor_desconto": "0.00",
      "valor_faturado": "100.00",
      "frete_por_conta": "D",
      "valor_total_ibs_uf": "0.00",
      "valor_total_cbs": "0.00",
      "transportador": {
        "nome": "Joao",
        "cpf_cnpj": "",
        "ie": "",
        "endereco": "",
        "cidade": "",
        "uf": "CE"
      },
      "placa": "",
      "uf_placa": "",
      "quantidade_volumes": "1",
      "especie_volumes": "",
      "marca_volumes": "",
      "numero_volumes": "",
      "peso_bruto": "0.60",
      "peso_liquido": "0.40",
      "forma_envio": {
        "id": "441239677",
        "descricao": "Correios"
      },
      "forma_frete": [
        {
          "id": "440504596",
          "descricao": "SEDEX"
        }
      ],
      "codigo_rastreamento": "",
      "url_rastreamento": "",
      "condicao_pagamento": "30",
      "forma_pagamento": "boleto",
      "meio_pagamento": "Banco do Brasil",
      "parcelas": [
        {
          "parcela": {
            "dias": "30",
            "data": "16/07/2020",
            "valor": "100.00",
            "obs": "",
            "forma_pagamento": "boleto",
            "meio_pagamento": "Banco do Brasil"
          }
        }
      ],
      "pagamentos_integrados": [
        {
          "pagamento_integrado": {
            "valor": 29.99,
            "tipo_pagamento": 17,
            "cnpj_intermediador": "21018182000106",
            "codigo_autorizacao": "E0000020820250904130544849357542",
            "codigo_bandeira": 0
          }
        }
      ],
      "id_venda": "441591827",
      "id_vendedor": "441479382",
      "nome_vendedor": "Lucas Massi",
      "situacao": "1",
      "descricao_situacao": "Pendente",
      "obs": "Tributos aproximados: R$ 20,49 (Federal) e R$ 6,06 (Municipal). Fonte: IBPT A5G7R1\r\n"
    }
  }
}