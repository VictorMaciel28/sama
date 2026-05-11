# **Obter Link da Nota Fiscal** API 2.0

Serviço destinado a obter os dados de uma Nota Fiscal.

- ++[REST](https://tiny.com.br/api-docs/api2-notas-fiscais-obter-link#rest-service)++

REST URL

### **Parâmetros do serviço**


| Elemento | Tipo   | Ocorrência  | Descrição                                       |
| -------- | ------ | ----------- | ----------------------------------------------- |
| token    | string | obrigatório | Chave gerada para identificar sua empresa       |
| id       | int    | obrigatório | Número de identificação da nota fiscal na Olist |
| formato  | string | obrigatório | Formato do retorno (json)                       |


### **Retorno do serviço**

string


| Elemento                                    | Tipo   | Tamanho     | Ocorrência                       | Descrição                                                                                                |
| ------------------------------------------- | ------ | ----------- | -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| retorno                                     | object | -           | obrigatório                      | Nodo raiz do retorno                                                                                     |
| retorno.status_processamento                | int    | -           | obrigatório                      | Conforme tabela "++[Status de Processamento](https://tiny.com.br/api-docs/api2-tabelas-processamento)++" |
| retorno.status                              | string | -           | obrigatório                      | Contém o status do retorno “OK” ou “Erro”. Para o caso de conter erros estes serão descritos abaixo      |
| retorno.codigo_erro (1)                     | int    | -           | condicional                      | Conforme tabela "++[Códigos de erro](https://tiny.com.br/api-docs/api2-tabelas-processamento)++"         |
| retorno.erros[ ] (1) (3)                    | list   | -           | condicional [0..n]               | Contém a lista dos erros encontrados.                                                                    |
| retorno.erros[ ].erro                       | string | string      | condicional                      | Mensagem contendo a descrição do erro                                                                    |
| [retorno.link](http://retorno.link)_nfe (2) | 200    | condicional | Link para acessar a nota fiscal. |                                                                                                          |


(1) - Somente estará presente no retorno caso o elemento "status" seja "Erro".  
(2) - Somente estará presente no retorno caso o elemento "status" seja "OK".  
(3) - Estes campos somente serão informados caso o retorno contenha erros.

### **Exemplos de chamada da API**

#### **[Exemplos da chamada em REST](https://tiny.com.br/api-docs/api2-notas-fiscais-obter-link#exemplos-chamada-rest)**

```php

$url = 'https://api.tiny.com.br/api2/nota.fiscal.obter.link.php';
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

```

### **Exemplos de retorno da API**

#### **[Exemplos do retorno do serviço em JSON](https://tiny.com.br/api-docs/api2-notas-fiscais-obter-link#exemplos-retorno-json)**

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
        "erro": "Nota fiscal não localizada"
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
    "codigo_erro": 32,
    "link_nfe": "https://tiny.com.br/doc.view.php?id=39e98a4ff6addfbcd8185f20428dc381"
  }
}
```

