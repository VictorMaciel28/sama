Pesquisar Pedidos API 2.0
Serviço destinado a fazer consulta de Pedidos.

REST
REST URL
https://api.tiny.com.br/api2/pedidos.pesquisa.php
Parâmetros do serviço
Elemento	Tipo	Ocorrência	Descrição
token	string	obrigatório	Chave gerada para identificar sua empresa
formato	string	obrigatório	Formato do retorno (json)
numero (1)	string	opcional	Número do pedido (na Olist)
cliente (1)	string	opcional	Nome ou código (ou parte) do cliente
cpf_cnpj (1)	string	opcional	CPF ou CNPJ do cliente
dataInicial (1)	string	opcional	Data de cadastramento inicial dos pedidos que deseja consultar no formato dd/mm/yyyy
dataFinal (1)	string	opcional	Data de cadastramento final dos pedidos que deseja consultar no formato dd/mm/yyyy
dataAtualizacao (1)	string	opcional	Data da última atualização feita nos pedidos que deseja consultar no formato dd/mm/yyyy hh:mm:ss
situacao (1)	string	opcional	Situação do pedido conforme tabela de Situações dos Pedidos
numeroEcommerce (1)	string	opcional	Número do pedido no ecommerce (ou no seu sistema)
idVendedor (1) (2)	string	opcional	Número de identificação do vendedor na Olist
nomeVendedor (1) (2) (3)	string	opcional	Nome do vendedor na Olist
marcador (1) (6)	string	opcional	Descrição do marcador na Olist
dataInicialOcorrencia	string	opcional	Data de ocorrência inicial dos pedidos que deseja consultar no formato dd/mm/yyyy
dataFinalOcorrencia	string	opcional	Data de ocorrência final dos pedidos que deseja consultar no formato dd/mm/yyyy
situacaoOcorrencia (5)	string	opcional	Situação da ocorrência conforme tabela de Situações dos Pedidos
pagina (4)	int	opcional	Número da página
sort	string	opcional	Ordenação dos pedidos (ASC ou DESC)
(1) - Ao menos um desses parâmetros deve ser informado.
(2) - Caso o vendedor não seja localizado na Olist a consulta não retornará registros.
(3) - Este valor será desconsiderado caso seja informado valor para o parâmetro idVendedor.
(4) - Número da página que deseja obter (por padrão são listados 100 registros por página), caso não seja informado o valor padrão é 1.
(5) - Esse campo só será considerado se os campos dataInicialOcorrencia e/ou dataFinalOcorrencia forem preenchidos.
(6) - Caso o marcador não seja localizado na Olist a consulta não retornará registros.

Retorno do serviço
Elemento	Tipo	Tamanho	Ocorrência	Descrição
retorno	object	-	obrigatório	Elemento raiz do retorno
retorno.status_processamento	int	-	obrigatório	Conforme tabela "Status de Processamento"
retorno.status	string	-	obrigatório	Contém o status do retorno “OK” ou “Erro”. Para o caso de conter erros estes serão descritos abaixo
retorno.codigo_erro (1)	int	-	condicional	Conforme tabela "Códigos de erro"
retorno.erros[ ] (1) (3)	list	-	condicional [0..n]	Contém a lista dos erros encontrados.
retorno.erros[ ].erro	string	-	condicional	Mensagem contendo a descrição do erro
retorno.pagina	int	-	obrigatório	Número da página que está sendo retornada
retorno.numero_paginas	int	-	obrigatório	Número de paginas do retorno
retorno.pedidos[ ] (2)	list	-	condicional	Lista de resultados da pesquisa
retorno.pedidos[ ].pedido (2)	object	-	condicional	Elemento utilizado para representar um pedido.
retorno.pedidos[ ].pedido.id	int	-	condicional	Número de identificação do pedido na Olist
retorno.pedidos[ ].pedido.numero	int	-	condicional	Número do pedido na Olist
retorno.pedidos[ ].pedido.numero_ecommerce	string	50	condicional	Número do pedido no ecommerce(ou sistema)
retorno.pedidos[ ].pedido.data_pedido (4)	date	10	condicional	Data do pedido
retorno.pedidos[ ].pedido.data_prevista (4)	date	10	condicional	Data de previsão do pedido
retorno.pedidos[ ].pedido.nome	string	50	condicional	Nome do cliente
retorno.pedidos[ ].pedido.valor (5)	decimal	-	condicional	Valor total do pedido
retorno.pedidos[ ].pedido.id_vendedor	int	15	condicional	Número de identificação do vendedor associado ao pedido
retorno.pedidos[ ].pedido.nome_vendedor	int	15	condicional	Nome do vendedor associado ao pedido
retorno.pedidos[ ].pedido.situacao	string	15	condicional	Situação do pedido conforme tabela de Situações dos Pedidos
retorno.pedidos[ ].pedido.codigo_rastreamento	string	25	condicional	Código de rastreamento do pedido
(1) - Somente estará presente no retorno caso o elemento "status" seja "Erro".
(2) - Somente estará presente no retorno caso o elemento "status" seja "OK".
(3) - Estes campos somente serão informados caso o retorno contenha erros.
(4) - Estes campos utilizam o formato dd/mm/yyyy, exemplo "01/01/2012".
(5) - Estes campos utilizam “.” (ponto) como separador de decimais, exemplo "5.25".



Exemplos da chamada em REST

$url = 'https://api.tiny.com.br/api2/pedidos.pesquisa.php';
$token = 'coloque aqui a sua chave da api';
$numero = 'xxxxx';
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
    "status_processamento": 3,
    "status": "OK",
    "pagina": "1",
    "numero_paginas": "1",
    "pedidos": [
      {
        "pedido": {
          "id": 123456,
          "numero": 123456,
          "numero_ecommerce": "12",
          "data_pedido": "01/01/2013",
          "data_prevista": "10/01/2013",
          "nome": "Cliente Teste",
          "valor": "100.25",
          "id_vendedor": "123456",
          "nome_vendedor": "Vendedor Teste",
          "situacao": "Atendido"
        }
      },
      {
        "pedido": {
          "id": 123456,
          "numero": 123458,
          "numero_ecommerce": "15",
          "data_pedido": "01/01/2013",
          "data_prevista": "10/01/2013",
          "nome": "Cliente Teste 3",
          "valor": "50.25",
          "id_vendedor": "",
          "nome_vendedor": "",
          "situacao": "Aberto"
        }
      }
    ]
  }
}