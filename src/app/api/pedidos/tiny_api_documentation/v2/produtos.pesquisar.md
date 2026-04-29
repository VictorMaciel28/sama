# **Pesquisar Produtos** API 2.0

Serviço destinado a fazer consulta de Produtos.

- ++[REST](https://tiny.com.br/api-docs/api2-produtos-pesquisar#rest-service)++

REST URL

### **Parâmetros do serviço**


| Elemento         | Tipo   | Ocorrência  | Descrição                                                            |
| ---------------- | ------ | ----------- | -------------------------------------------------------------------- |
| token            | string | obrigatório | Chave gerada para identificar sua empresa                            |
| formato          | string | obrigatório | Formato do retorno (json)                                            |
| pesquisa         | string | obrigatório | Nome ou código (ou parte) do produto que deseja consultar            |
| idTag            | int    | opcional    | Número de identificação da tag na Olist                              |
| idListaPreco (1) | int    | opcional    | Número de identificação da lista de preço na Olist                   |
| pagina (2)       | int    | opcional    | Número da página                                                     |
| gtin             | string | opcional    | GTIN/EAN do produto                                                  |
| situacao (3)     | string | opcional    | Situação dos produtos ("A" - Ativo, "I" - Inativo ou "E" - Excluído) |
| dataCriacao      | string | opcional    | Data de criação do produto. Formato dd/mm/aaaa hh:mm:ss              |


(1) - Os preços de venda retornados serão calculados de acordo com a lista de preço informada.  
(2) - Número da página de produtos que deseja obter (por padrão são listados 100 registros por página), caso não seja informado o valor padrão é 1.  
(3) - Caso o parâmetro não seja enviado, serão assumidos os produtos nas situações Ativo e Inativo.

### **Retorno do serviço**


| Elemento                                                        | Tipo    | Tamanho | Ocorrência         | Descrição                                                                                                |
| --------------------------------------------------------------- | ------- | ------- | ------------------ | -------------------------------------------------------------------------------------------------------- |
| retorno                                                         | object  | -       | obrigatório        | Elemento raiz do retorno                                                                                 |
| retorno.status_processamento                                    | int     | -       | obrigatório        | Conforme tabela "++[Status de Processamento](https://tiny.com.br/api-docs/api2-tabelas-processamento)++" |
| retorno.status                                                  | string  | -       | obrigatório        | Contém o status do retorno “OK” ou “Erro”. Para o caso de conter erros estes serão descritos abaixo      |
| retorno.codigo_erro (1)                                         | int     | -       | condicional        | Conforme tabela "++[Códigos de erro](https://tiny.com.br/api-docs/api2-tabelas-processamento)++"         |
| retorno.erros[ ] (1) (3)                                        | list    | -       | condicional [0..n] | Contém a lista dos erros encontrados.                                                                    |
| retorno.erros[ ].erro                                           | string  | -       | condicional        | Mensagem contendo a descrição do erro                                                                    |
| retorno.pagina                                                  | int     | -       | obrigatório        | Número da página que está sendo retornada                                                                |
| retorno.numero_paginas                                          | int     | -       | obrigatório        | Número de paginas do retorno                                                                             |
| retorno.produtos[ ] (2)                                         | list    | -       | condicional        | Lista de resultados da pesquisa                                                                          |
| retorno.produtos[ ].produto (2)                                 | object  | -       | condicional        | Elemento utilizado para representar um produto.                                                          |
| retorno.produtos[ ].[produto.id](http://produto.id)             | int     | -       | obrigatório        | Número de identificação do produto na Olist                                                              |
| retorno.produtos[ ].produto.nome                                | string  | 120     | obrigatório        | Nome do produto                                                                                          |
| retorno.produtos[ ].produto.codigo                              | string  | 30      | condicional        | Código do produto                                                                                        |
| retorno.produtos[ ].produto.preco (4)                           | decimal | -       | obrigatório        | Preço de venda do produto                                                                                |
| retorno.produtos[ ].produto.preco_promocional (4)               | decimal | -       | obrigatório        | Preço promocional do produto                                                                             |
| retorno.produtos[ ].produto.preco_custo (4)                     | decimal | -       | condicional        | Preço de custo do produto                                                                                |
| retorno.produtos[ ].produto.preco_custo_medio (4)               | decimal | -       | condicional        | Preço médio de custo do produto                                                                          |
| retorno.produtos[ ].produto.unidade                             | string  | 3       | condicional        | Unidade do produto                                                                                       |
| retorno.produtos[ ].produto.gtin                                | string  | 14      | condicional        | GTIN/EAN do produto                                                                                      |
| retorno.produtos[ ].produto.tipoVariacao                        | string  | 1       | obrigatório        | Tipo de variação "N" - Normal, "P" - Pai, "V" - Variação                                                 |
| retorno.produtos[ ].produto.localizacao                         | string  | 50      | condicional        | Localização física no estoque                                                                            |
| retorno.produtos[ ].produto.situacao                            | string  | 1       | condicional        | Situação dos produtos ("A" - Ativo, "I" - Inativo, "E" - Excluído)                                       |
| retorno.produtos[ ].[produto.data](http://produto.data)_criacao | string  | 19      | condicional        | Data de criação do produto. Formato dd/mm/aaaa hh:mm:ss                                                  |


(1) - Somente estará presente no retorno caso o elemento "status" seja "Erro".  
(2) - Somente estará presente no retorno caso o elemento "status" seja "OK".  
(3) - Estes campos somente serão informados caso o retorno contenha erros.  
(4) - Estes campos utilizam “.” (ponto) como separador de decimais, exemplo "5.25".

### **Exemplos de chamada da API**

#### **[Exemplos da chamada em REST](https://tiny.com.br/api-docs/api2-produtos-pesquisar#exemplos-chamada-rest)**

```php

$url = 'https://api.tiny.com.br/api2/produtos.pesquisa.php';
$token = 'coloque aqui a sua chave da api';
$pesquisa = 'xxxxx';
$data = "token=$token&pesquisa=$pesquisa&formato=JSON";

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

```

### **Exemplos de retorno da API**

#### **[Exemplos do retorno do serviço em JSON](https://tiny.com.br/api-docs/api2-produtos-pesquisar#exemplos-retorno-json)**

```javascript
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
```

```javascript
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
```

```javascript
{
  "retorno": {
    "status_processamento": 3,
    "status": "OK",
    "pagina": "1",
    "numero_paginas": "1",
    "produtos": [
      {
        "produto": {
          "id": 46829062,
          "codigo": 123,
          "nome": "produto teste",
          "preco": "1.20",
          "preco_promocional": "1.10",
          "preco_custo": "1.05",
          "preco_custo_medio": "1.02",
          "unidade": "UN",
          "tipoVariacao": "P"
        }
      },
      {
        "produto": {
          "id": 46829066,
          "codigo": 1234,
          "nome": "produto teste 2",
          "preco": "15.25",
          "preco_promocional": "13.10",
          "preco_custo": "12.75",
          "preco_custo_medio": "11.89",
          "unidade": "PC",
          "tipoVariacao": "N"
        }
      }
    ]
  }
}
```

