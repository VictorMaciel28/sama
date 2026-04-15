Pesquisar Cadastros API 2.0
Serviço destinado a fazer consulta de cadastros (clientes, fornecedores, vendedores, etc.)

REST
REST URL
https://api.tiny.com.br/api2/contatos.pesquisa.php
Parâmetros do serviço
Elemento	Tipo	Ocorrência	Descrição
token	string	obrigatório	Chave gerada para identificar sua empresa
pesquisa	string	obrigatório	Nome ou código (ou parte) do contato que deseja consultar
formato	string	obrigatório	Formato do retorno (json)
cpf_cnpj	string	opcional	CPF ou CNPJ do contato que deseja consultar
idVendedor (1)	int	opcional	Número de identificação do vendedor na Olist
nomeVendedor (1) (2)	string	opcional	Nome do vendedor na Olist
situacao (3)	string	opcional	Situação do contato (Ativo ou Excluido)
pagina (4)	int	opcional	Número da página
dataCriacao	string	opcional	Data de criação do contato. Formato dd/mm/aaaa hh:mm:ss
dataMinimaAtualizacao	string	opcional	Data mínima de atualização do contato. Formato dd/mm/aaaa hh:mm:ss
(1) - Caso o vendedor não seja localizado na Olist a consulta não retornará registros.
(2) - Este valor será desconsiderado caso seja informado valor para o parâmetro idVendedor.
(3) - Caso não seja enviado valor neste parâmetro todas as situações serão consideradas.
(4) - Número da página de contatos que deseja obter (por padrão são listados 100 registros por página), caso não seja informado o valor padrão é 1.

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
retorno.contatos[ ] (2)	list	-	condicional	Lista de resultados da pesquisa
retorno.contatos[ ].contato (2)	object	-	condicional	Elemento utilizado para representar um contato.
retorno.contatos[ ].contato.id	int	-	condicional	Número de identificação do contato na Olist
retorno.contatos[ ].contato.codigo	string	30	condicional	Código do contato
retorno.contatos[ ].contato.nome	string	50	condicional	Nome ou razão social do contato
retorno.contatos[ ].contato.fantasia	string	60	condicional	Nome fatansia do contato
retorno.contatos[ ].contato.tipo_pessoa	string	1	condicional	Tipo de pessoa (F - Física, J - Jurídica, E - Estrangeiro)
retorno.contatos[ ].contato.cpf_cnpj	string	18	condicional	CPF ou CNPJ do contato
retorno.contatos[ ].contato.endereco	string	50	condicional	Endereço do contato
retorno.contatos[ ].contato.numero	string	10	condicional	Número do endereço do contato
retorno.contatos[ ].contato.complemento	string	50	condicional	Complemento do endereço do contato
retorno.contatos[ ].contato.bairro	string	30	condicional	Bairro do contato
retorno.contatos[ ].contato.cep	string	10	condicional	Cep do contato
retorno.contatos[ ].contato.cidade	string	30	condicional	Nome da cidade conforme a Tabela de Cidades
retorno.contatos[ ].contato.uf	string	30	condicional	UF do contato
retorno.contatos[ ].contato.email	string	50	condicional	E-mail do contato
retorno.contatos[ ].contato.fone	string	30	condicional	Fone do contato
retorno.contatos[ ].contato.id_lista_preco	int	-	condicional	Número de identificação da lista de preço na Olist
retorno.contatos[ ].contato.id_vendedor	int	15	condicional	Número de identificação do vendedor associado ao contato
retorno.contatos[ ].contato.nome_vendedor	int	15	condicional	Nome do vendedor associado ao contato
retorno.contatos[ ].contato.situacao	string	15	condicional	Situação do Contato (Ativo,Excluido)
retorno.contatos[ ].contato.data_criacao	string	19	condicional	Data de criação do contato. Formato dd/mm/aaaa hh:mm:ss
(1) - Somente estará presente no retorno caso o elemento "status" seja "Erro".
(2) - Somente estará presente no retorno caso o elemento "status" seja "OK".
(3) - Estes campos somente serão informados caso o retorno contenha erros.

Exemplos de chamada da API
Exemplos da chamada em REST

$url = 'https://api.tiny.com.br/api2/contatos.pesquisa.php';
$token = 'coloque aqui a sua chave da api';
$pesquisa = 'xxxxx';
$formato = 'JSON';
$data = "token=$token&pesquisa=$pesquisa&formato=$formato";

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
    "status_processamento": 3,
    "status": "OK",
    "pagina": "1",
    "numero_paginas": "1",
    "contatos": [
      {
        "contato": {
          "id": 46829055,
          "codigo": 123,
          "nome": "Contato Teste",
          "tipo_pessoa": "F",
          "fantasia": "Teste",
          "cpf_cnpj": "00000000000",
          "endereco": "Rua Teste",
          "numero": "123",
          "complemento": "sala 1",
          "bairro": "Centro",
          "cep": "95700-000",
          "cidade": "Bento Gonçalves",
          "uf": "RS",
          "email": "teste@teste.com.br",
          "situacao": "Ativo",
          "id_vendedor": "123456",
          "nome_vendedor": "Vendedor Teste",
          "data_criacao": ""
        }
      },
      {
        "contato": {
          "id": 46829059,
          "codigo": 125,
          "nome": "Contato Teste 2",
          "tipo_pessoa": "F",
          "fantasia": "Teste 2",
          "cpf_cnpj": "00000000001",
          "endereco": "Rua Teste",
          "numero": "123",
          "complemento": "sala 1",
          "bairro": "Centro",
          "cep": "95700-000",
          "cidade": "Bento Gonçalves",
          "uf": "RS",
          "email": "teste2@teste.com.br",
          "situacao": "Ativo",
          "id_vendedor": "",
          "nome_vendedor": "",
          "data_criacao": ""
        }
      }
    ]
  }
}