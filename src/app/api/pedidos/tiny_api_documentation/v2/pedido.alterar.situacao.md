# **Atualizar situação do pedido** API 2.0

Serviço destinado para atualizar a situação de um pedido de venda.

- ++[REST](https://tiny.com.br/api-docs/api2-pedidos-alterar-situacao#rest-service)++

REST URL

### **Parâmetros do serviço**


| Elemento | Tipo   | Ocorrência  | Descrição                                                                                                            |
| -------- | ------ | ----------- | -------------------------------------------------------------------------------------------------------------------- |
| token    | string | obrigatório | Chave gerada para identificar sua empresa                                                                            |
| id       | int    | obrigatório | Número de identificação do pedido na Olist                                                                           |
| situacao | string | obrigatório | Situação do pedido conforme tabela de ++[Situações dos Pedidos](https://tiny.com.br/api-docs/api2-tabelas-pedidos)++ |
| formato  | string | obrigatório | Formato do retorno (json)                                                                                            |


### **Retorno do serviço**


| Elemento                     | Tipo   | Tamanho | Ocorrência         | Descrição                                                                                                |
| ---------------------------- | ------ | ------- | ------------------ | -------------------------------------------------------------------------------------------------------- |
| retorno                      | -      | -       | obrigatório        | Elemento raiz do retorno                                                                                 |
| retorno.status_processamento | int    | -       | obrigatório        | Conforme tabela "++[Status de Processamento](https://tiny.com.br/api-docs/api2-tabelas-processamento)++" |
| retorno.status               | string | -       | obrigatório        | Contém o status do retorno “OK” ou “Erro”. Para o caso de conter erros estes serão descritos abaixo      |
| retorno.codigo_erro (1)      | int    | -       | condicional        | Conforme tabela "++[Códigos de erro](https://tiny.com.br/api-docs/api2-tabelas-processamento)++"         |
| retorno.erros[ ] (1) (2)     | list   | -       | condicional [0..n] | Contém a lista dos erros encontrados.                                                                    |
| retorno.erros[ ].erro        | string | -       | condicional        | Mensagem contendo a descrição do erro                                                                    |


(1) - Somente estará presente no retorno caso o elemento "status" seja "Erro".  
(2) - Estes campos somente serão informados caso o retorno contenha erros.

### **Exemplos de chamada da API**

#### **[Exemplos da chamada em REST](https://tiny.com.br/api-docs/api2-pedidos-alterar-situacao#exemplos-chamada-rest)**

```php

$url = 'https://api.tiny.com.br/api2/pedido.alterar.situacao';
$token = 'coloque aqui a sua chave da api';
$id = 'xxxxx';
$formato = 'JSON';
$situacao = "aprovado";
$data = "token=$token&id=$id&situacao=$situacao&formato=$formato";

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

#### **[Exemplos do retorno do serviço em JSON](https://tiny.com.br/api-docs/api2-pedidos-alterar-situacao#exemplos-retorno-json)**

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
    "codigo_erro": 32,
    "erros": [
      {
        "erro": "Pedido não localizado"
      }
    ]
  }
}
```

```javascript
{
  "retorno": {
    "status_processamento": "3",
    "status": "OK"
  }
}
```

# **Tabelas Auxiliares do Pedido**

### **1 - Situações dos Pedidos**


| Descrição           | Código           |
| ------------------- | ---------------- |
| Em aberto           | aberto           |
| Aprovado            | aprovado         |
| Preparando envio    | preparando_envio |
| Faturado (atendido) | faturado         |
| Pronto para envio   | pronto_envio     |
| Enviado             | enviado          |
| Entregue            | entregue         |
| Não Entregue        | nao_entregue     |
| Cancelado           | cancelado        |


