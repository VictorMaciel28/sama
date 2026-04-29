# **Alterar Pedido** API 2.0

destinado a fazer alteração de alguns dados de Pedidos.

- ++[REST](https://tiny.com.br/api-docs/api2-pedidos-alterar#rest-service)++

REST URL

### **Parâmetros do serviço**


| Elemento | Tipo   | Ocorrência  | Descrição                                 |
| -------- | ------ | ----------- | ----------------------------------------- |
| token    | string | obrigatório | Chave gerada para identificar sua empresa |
| id       | -      | obrigatório | Id do pedido de venda a ser alterado      |


### **Conteúdo do body**


| Elemento         | Tipo   | Ocorrência  | Descrição                       |
| ---------------- | ------ | ----------- | ------------------------------- |
| dados_pedido (1) | object | obrigatório | Dados do pedido conforme layout |


#### [(1) - Layout do parâmetro pedido](https://tiny.com.br/api-docs/api2-pedidos-alterar#layout-parametro-pedido)

### **Retorno do serviço**


| Elemento                     | Tipo   | Tamanho | Ocorrência         | Descrição                                                                                                |
| ---------------------------- | ------ | ------- | ------------------ | -------------------------------------------------------------------------------------------------------- |
| retorno                      | object | -       | obrigatório        | Elemento raiz do retorno                                                                                 |
| retorno.status_processamento | int    | -       | obrigatório        | Conforme tabela "++[Status de Processamento](https://tiny.com.br/api-docs/api2-tabelas-processamento)++" |
| retorno.status               | string | -       | obrigatório        | Contém o status do retorno “OK” ou “Erro”. Para o caso de conter erros estes serão descritos abaixo      |
| retorno.codigo_erro (1)      | int    | -       | obrigatório        | Conforme tabela "++[Códigos de erro](https://tiny.com.br/api-docs/api2-tabelas-processamento)++"         |
| retorno.erros[ ] (1) (3)     | list   | -       | condicional [0..n] | Contém a lista dos erros encontrados.                                                                    |
| retorno.erros[ ].erro (3)    | string | -       | condicional        | Mensagem contendo a descrição do erro                                                                    |
| retorno.erros[ ].campo (3)   | string | -       | condicional        | Nome do campo do body com problema(s) de validação                                                       |


(1) - Somente estará presente no retorno caso o elemento "status" seja "Erro".  
(2) - Somente estará presente no retorno caso o elemento "status" seja diferente de "OK".  
(3) - Estes campos somente serão informados caso o retorno contenha erros.

### **Exemplos do parâmetro pedido**

#### **[Exemplos do parâmetro pedido em JSON](https://tiny.com.br/api-docs/api2-pedidos-alterar#exemplos-parametro-json)**

```javascript
{
  "dados_pedido": {
    "parcelas": [
      {
        "data": "20/01/2022",
        "valor": 5177.72,
        "obs": "",
        "destino": "Caixa",
        "forma_pagamento": "dinheiro"
      },
      {
        "data": "20/02/2022",
        "valor": 5200,
        "obs": "",
        "destino": "Caixa",
        "forma_pagamento": "boleto",
        "meio_pagamento": "Banco Inter"
      }
    ],
    "data_prevista": "15/05/2022",
    "data_envio": "05/02/2022 08:00:00",
    "obs": "teste api",
    "obs_interna": "observacao interna teste api",
    "pagamentos_integrados": [
      {
        "tipo_pagamento": "17",
        "valor": "29.99",
        "cnpj_intermediador": "21018182000106",
        "codigo_autorizacao": "E0000020820250904130544849357542",
        "codigo_bandeira": "2"
      }
    ]
  }
}
```

### **Exemplos de chamada da API**

#### **[Exemplos da chamada em REST](https://tiny.com.br/api-docs/api2-pedidos-alterar#exemplos-chamada-rest)**

```php

					$url = 'https://api.tiny.com.br/api2/pedido.alterar.php';
					$token = 'coloque aqui a sua chave da api';
					$id = '12345';
					$data = "token=$token&id=$id";

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

```javascript

```

### **Exemplos de retorno da API**

#### **[Exemplos do retorno do serviço em JSON](https://tiny.com.br/api-docs/api2-pedidos-alterar#exemplos-retorno-json)**

```javascript
{
  "retorno": {
    "status_processamento": "2",
    "status": "Erro",
    "codigo_erro": 10,
    "erros": [
      {
        "erro": "O campo valor deve ser um número decimal utilizando  como separador.",
        "campo": "parcelas.[1].valor"
      }
    ]
  }
}
```

```javascript
{
  "retorno": {
    "status_processamento": "2",
    "status": "Erro",
    "codigo_erro": 10,
    "erros": [
      {
        "erro": "O valor total das parcelas deve ser igual ao valor total da venda.",
        "campo": "parcelas"
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

