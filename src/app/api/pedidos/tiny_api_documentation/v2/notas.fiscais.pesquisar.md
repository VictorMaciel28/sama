Pesquisar Notas Fiscais API 2.0
Serviço destinado a fazer consulta de Notas Fiscais.

REST
REST URL
https://api.tiny.com.br/api2/notas.fiscais.pesquisa.php
Parâmetros do serviço
Elemento	Tipo	Ocorrência	Descrição
token	string	obrigatório	Chave gerada para identificar sua empresa
formato	string	obrigatório	Formato do retorno (json)
tipoNota (1)	string	opcional	Tipo da nota (E/S) E=Entrada, S=Saída
numero (1)	string	opcional	Número da nota (na Olist)
cliente (1)	string	opcional	Nome ou código (ou parte) do cliente
cpf_cnpj (1)	string	opcional	CPF ou CNPJ do cliente
dataInicial (1)	string	opcional	Data incial das notas fiscais que deseja consultar no formato dd/mm/yyyy
dataFinal (1)	string	opcional	Data final das notas fiscais que deseja consultar no formato dd/mm/yyyy
situacao (1) (2)	string	opcional	Exibir notas fiscais na situação
numeroEcommerce (1)	string	opcional	Número do pedido no ecommerce(ou no seu sistema)
idVendedor (3)	int	opcional	Número de identificação do vendedor na Olist
idFormaEnvio (3)	int	opcional	Número de identifcação da forma de envio na Olist
nomeVendedor (3) (4)	string	opcional	Nome do vendedor na Olist
pagina (5)	int	opcional	Número da página
(1) - Ao menos um desses parâmetros deve ser informado.
(2) - Código da situação conforme tabela de "Situações das Notas Fiscais".
(3) - Caso estes campos não sejam localizados na Olist, a consulta não retornará registros.
(4) - Este valor será desconsiderado caso seja informado valor para o parâmetro idVendedor.
(5) - Numero da página que deseja obter (por padrão são listados 100 registros por página), caso não seja informado o valor padrão é 1.

Retorno do serviço
Elemento	Tipo	Tamanho	Ocorrência	Descrição
retorno	-	-	obrigatório	Elemento raiz do retorno
retorno.status_processamento	int	-	obrigatório	Conforme tabela "Status de Processamento"
retorno.status	string	-	obrigatório	Contém o status do retorno “OK” ou “Erro”. Para o caso de conter erros estes serão descritos abaixo
retorno.codigo_erro (1)	int	-	opcional	Conforme tabela "Códigos de erro"
retorno.erros[ ] (1) (3)	list	-	opcional [0..n]	Contém a lista dos erros encontrados.
retorno.erros[ ].erro	string	-	opcional	Mensagem contendo a descrição do erro
retorno.pagina	int	-	obrigatório	Número da página que está sendo retornada
retorno.numero_paginas	int	-	obrigatório	Número de paginas do retorno
retorno.notas_fiscais[ ] (2)	list	-	opcional	Lista de resultados da pesquisa
retorno.notas_fiscais[ ].nota_fiscal (2)	object	-	opcional	Elemento utilizado para representar uma nota fiscal.
retorno.notas_fiscais[ ].nota_fiscal.id	int	-	opcional	Número de identificação da nota fiscal na Olist
retorno.notas_fiscais[ ].nota_fiscal.tipo	string	1	opcional	Tipo da nota fiscal (E/S)
retorno.notas_fiscais[ ].nota_fiscal.serie	int	-	opcional	Número de série da nota fiscal
retorno.notas_fiscais[ ].nota_fiscal.numero	int	-	opcional	Número da nota fiscal
retorno.notas_fiscais[ ].nota_fiscal.numero_ecommerce	string	50	opcional	Número do pedido no ecommerce(ou sistema)
retorno.notas_fiscais[ ].nota_fiscal.data_emissao (4)	date	10	opcional	Data de emissão da nota fiscal
retorno.notas_fiscais[ ].nota_fiscal.nome	string	50	opcional	Nome do cliente
retorno.notas_fiscais[ ].nota_fiscal.cliente	object	10	opcional	Elemento utilizado para representar o cliente
retorno.notas_fiscais[ ].nota_fiscal.cliente.nome	string	50	obrigatório	Nome do cliente
retorno.notas_fiscais[ ].nota_fiscal.cliente.tipo_pessoa	string	1	opcional	Tipo de pessoa (F - Física, J - Jurídica, E - Estrangeiro)
retorno.notas_fiscais[ ].nota_fiscal.cliente.cpf_cnpj	string	18	opcional	CPF ou CNPJ do cliente
retorno.notas_fiscais[ ].nota_fiscal.cliente.ie	string	18	opcional	Inscrição estadual do cliente
retorno.notas_fiscais[ ].nota_fiscal.cliente.endereco	string	50	opcional	Endereço do cliente
retorno.notas_fiscais[ ].nota_fiscal.cliente.numero	string	10	opcional	Número do endereço do cliente
retorno.notas_fiscais[ ].nota_fiscal.cliente.complemento	string	50	opcional	Complemento do endereço do cliente
retorno.notas_fiscais[ ].nota_fiscal.cliente.bairro	string	30	opcional	Bairro do cliente
retorno.notas_fiscais[ ].nota_fiscal.cliente.cep	string	10	opcional	Cep do cliente
retorno.notas_fiscais[ ].nota_fiscal.cliente.cidade	string	30	opcional	Nome da cidade do cliente conforme a Tabela de Cidades
retorno.notas_fiscais[ ].nota_fiscal.cliente.uf	string	30	opcional	UF do cliente
retorno.notas_fiscais[ ].nota_fiscal.cliente.fone	string	40	opcional	Telefone do cliente
retorno.notas_fiscais[ ].nota_fiscal.cliente.email	string	40	opcional	E-mail do cliente
retorno.notas_fiscais[ ].nota_fiscal.endereco_entrega	object		opcional	Elemento utilizado para representar o endereço de entrega (se não houver, será retornado o mesmo de cobrança).
retorno.notas_fiscais[ ].nota_fiscal.endereco_entrega.tipo_pessoa	string	1	opcional	Tipo de pessoa (F - Física, J - Jurídica, E - Estrangeiro)
retorno.notas_fiscais[ ].nota_fiscal.endereco_entrega.cpf_cnpj	string	18	opcional	CPF ou CNPJ de entrega
retorno.notas_fiscais[ ].nota_fiscal.endereco_entrega.endereco	string	50	opcional	Endereço de entrega
retorno.notas_fiscais[ ].nota_fiscal.endereco_entrega.numero	string	10	opcional	Número do endereço de entrega
retorno.notas_fiscais[ ].nota_fiscal.endereco_entrega.complemento	string	50	opcional	Complemento do endereço de entrega
retorno.notas_fiscais[ ].nota_fiscal.endereco_entrega.bairro	string	30	opcional	Bairro de entrega
retorno.notas_fiscais[ ].nota_fiscal.endereco_entrega.cep	string	10	opcional	Cep de entrega
retorno.notas_fiscais[ ].nota_fiscal.endereco_entrega.cidade	string	30	opcional	Nome da cidade de entrega conforme a Tabela de Cidades
retorno.notas_fiscais[ ].nota_fiscal.endereco_entrega.uf	string	30	opcional	UF de entrega
retorno.notas_fiscais[ ].nota_fiscal.endereco_entrega.fone	string	40	opcional	Telefone de entrega
retorno.notas_fiscais[ ].nota_fiscal.endereco_entrega.nome_destinatario	string	60	opcional	Nome do destinatário da entrega
retorno.notas_fiscais[ ].nota_fiscal.transportador	object	-	opcional	Elemento utilizado para representar o transportador
retorno.notas_fiscais[ ].nota_fiscal.transportador.nome	string	30	obrigatório	Nome do transportador
retorno.notas_fiscais[ ].nota_fiscal.valor (5)	decimal	-	opcional	Valor total da nota fiscal
retorno.notas_fiscais[ ].nota_fiscal.valor_produtos (5)	decimal		opcional	Valor dos produtos da nota fiscal
retorno.notas_fiscais[ ].nota_fiscal.valor_frete (5)	decimal		opcional	Valor do frete da nota fiscal
retorno.notas_fiscais[ ].nota_fiscal.id_vendedor	int	15	opcional	Número de identificação do vendedor associado a nota fiscal
retorno.notas_fiscais[ ].nota_fiscal.nome_vendedor	string	50	opcional	Nome do vendedor associado a nota fiscal
retorno.notas_fiscais[ ].nota_fiscal.situacao	int	-	opcional	Código conforme tabela de "Situações das Notas Fiscais"
retorno.notas_fiscais[ ].nota_fiscal.descricao_situacao	string	25	opcional	Descrição conforme tabela de "Situações das Notas Fiscais"
retorno.notas_fiscais[ ].nota_fiscal.chave_acesso	string	100	opcional	Chave de acesso da Nota Fiscal
retorno.notas_fiscais[ ].nota_fiscal.id_forma_frete	string	11	opcional	Número de identificação da forma de frete associado a nota fiscal
retorno.notas_fiscais[ ].nota_fiscal.id_forma_envio	string	11	opcional	Número de identificação da forma de envio associado a nota fiscall
retorno.notas_fiscais[ ].nota_fiscal.codigo_rastreamento	string	25	opcional	Código de rastreamento da nota fiscal
retorno.notas_fiscais[ ].nota_fiscal.url_rastreamento	string	120	opcional	URL de rastreamento da Nota Fiscal
(1) - Somente estará presente no retorno caso o elemento "status" seja "Erro".
(2) - Somente estará presente no retorno caso o elemento "status" seja "OK".
(3) - Estes campos somente serão informados caso o retorno contenha erros.
(4) - Estes campos utilizam o formato dd/mm/yyyy, exemplo "01/01/2012".
(5) - Estes campos utilizam “.” (ponto) como separador de decimais, exemplo "5.25".

Exemplos de chamada da API
Exemplos da chamada em REST

$url = 'https://api.tiny.com.br/api2/notas.fiscais.pesquisa.php';
$token = 'coloque aqui a sua chave da api';
$numero= 'xxxxx';
$data = "token=$token&numero=$numero&formato=JSON";

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
    "codigo_erro": 20,
    "erros": [
      {
        "erro": "A Consulta não retornou registros"
      }
    ]
  }
}
{
  "retorno": {
    "status_processamento": "3",
    "status": "OK",
    "pagina": 1,
    "numero_paginas": 1,
    "notas_fiscais": [
      {
        "nota_fiscal": {
          "id": "439995226",
          "tipo": "S",
          "serie": "1",
          "numero": "000148",
          "numero_ecommerce": null,
          "data_emissao": "11/01/2018",
          "nome": "henrique teste 1",
          "cliente": {
            "nome": "henrique teste 1",
            "tipo_pessoa": "F",
            "cpf_cnpj": "182.334.983-86",
            "ie": "",
            "endereco": "Rua teste",
            "numero": "4",
            "complemento": "casa",
            "bairro": "Centro",
            "cep": "95.700-000",
            "cidade": "Bento Gonçalves",
            "uf": "RS",
            "fone": "(54) 1234-1234",
            "email": "henrique1@tiny.com.br"
          },
          "endereco_entrega": {
            "tipo_pessoa": "F",
            "cpf_cnpj": "182.334.983-86",
            "endereco": "Rua teste",
            "numero": "4",
            "complemento": "casa",
            "bairro": "Centro",
            "cep": "95.700-000",
            "cidade": "Bento Gonçalves",
            "uf": "RS",
            "fone": "(54) 1234-1234",
            "nome_destinatario": "henrique teste 1"
          },
          "transportador": {
            "nome": ""
          },
          "valor": "165.51",
          "valor_produtos": "152.34",
          "valor_frete": "8.15",
          "id_vendedor": "0",
          "nome_vendedor": "",
          "situacao": "1",
          "descricao_situacao": "Pendente",
          "codigo_rastreamento": "EE201798383BR",
          "url_rastreamento": "http://www.issoehumaurl.com"
        }
      }
    ]
  }
}