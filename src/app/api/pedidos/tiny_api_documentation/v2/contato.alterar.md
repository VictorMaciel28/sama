# **Alterar Contato** API 2.0

Serviço destinado a fazer alteração de Contatos.

- ++[REST](https://tiny.com.br/api-docs/api2-contatos-alterar#rest-service)++

REST URL

### **Parâmetros do serviço**


| Elemento    | Tipo   | Ocorrência  | Descrição                                 |
| ----------- | ------ | ----------- | ----------------------------------------- |
| token       | string | obrigatório | Chave gerada para identificar sua empresa |
| contato (1) | -      | obrigatório | Dados do contato conforme layout          |
| formato     | string | obrigatório | Formato do retorno (json)                 |


#### **[(1) - Layout do parâmetro contato](https://tiny.com.br/api-docs/api2-contatos-alterar#layout-parametro-contato)**


| Elemento                                                                            | Tipo    | Tamanho | Ocorrência  | Descrição                                                                                                           |
| ----------------------------------------------------------------------------------- | ------- | ------- | ----------- | ------------------------------------------------------------------------------------------------------------------- |
| contatos[ ]                                                                         | list    | -       | obrigatório | Elemento utilizado para representar um conjunto Contatos.                                                           |
| contatos[ ].contato                                                                 | object  | -       | obrigatório | Elemento utilizado para representar um Contato.                                                                     |
| contatos[ ].contato.sequencia                                                       | inteiro | -       | obrigatório | Número sequencial utilizado para identificar cada contato.                                                          |
| contatos[ ].[contato.id](http://contato.id) (1)                                     | int     |         | opcional    | Número de identificação do Contato na Olist.                                                                        |
| contatos[ ].contato.codigo (1)                                                      | string  | 30      | opcional    | Código do contato                                                                                                   |
| contatos[ ].contato.nome                                                            | string  | 50      | obrigatório | Nome ou razão social do contato                                                                                     |
| contatos[ ].contato.fantasia                                                        | string  | 60      | opcional    | Nome fatansia do contato                                                                                            |
| contatos[ ].contato.tipo_pessoa                                                     | string  | 1       | opcional    | Tipo de pessoa (F - Física, J - Jurídica, E - Estrangeiro)                                                          |
| contatos[ ].contato.cpf_cnpj (1)                                                    | string  | 18      | opcional    | CPF ou CNPJ do contato                                                                                              |
| contatos[ ].[contato.ie](http://contato.ie)                                         | string  | 18      | opcional    | Inscrição estadual do contato                                                                                       |
| contatos[ ].contato.rg                                                              | string  | 10      | opcional    | RG do contato                                                                                                       |
| contatos[ ].[contato.im](http://contato.im)                                         | string  | 18      | opcional    | Inscrição municipal do contato                                                                                      |
| contatos[ ].contato.endereco                                                        | string  | 50      | opcional    | Endereço do contato                                                                                                 |
| contatos[ ].contato.numero                                                          | string  | 10      | opcional    | Número do endereço do contato                                                                                       |
| contatos[ ].contato.complemento                                                     | string  | 50      | opcional    | Complemento do endereço do contato                                                                                  |
| contatos[ ].contato.bairro                                                          | string  | 30      | opcional    | Bairro do contato                                                                                                   |
| contatos[ ].contato.cep                                                             | string  | 10      | opcional    | Cep do contato                                                                                                      |
| contatos[ ].contato.cidade                                                          | string  | 30      | opcional    | Nome da cidade de cobrança conforme a ++[Tabela de Cidades](https://tiny.com.br/api-docs/api2-tabelas-municipios)++ |
| contatos[ ].contato.uf                                                              | string  | 30      | opcional    | UF do contato                                                                                                       |
| contatos[ ].contato.pais                                                            | string  | 50      | opcional    | Nome do País conforme ++[Tabela de Países](https://tiny.com.br/api-docs/api2-tabelas-paises)++                      |
| contatos[ ].contato.endereco_cobranca (2)                                           | string  | 50      | opcional    | Endereço de cobrança do contato                                                                                     |
| contatos[ ].contato.numero_cobranca (2)                                             | string  | 10      | opcional    | Número do endereço de cobrança do contato                                                                           |
| contatos[ ].contato.complemento_cobranca (2)                                        | string  | 50      | opcional    | Complemento do endereço de cobrança do contato                                                                      |
| contatos[ ].contato.bairro_cobranca (2)                                             | string  | 30      | opcional    | Bairro de cobrança do contato                                                                                       |
| contatos[ ].contato.cep_cobranca (2)                                                | string  | 10      | opcional    | Cep de cobrança do contato                                                                                          |
| contatos[ ].contato.cidade_cobranca (2)                                             | string  | 30      | opcional    | Nome da cidade de cobrança conforme a ++[Tabela de Cidades](https://tiny.com.br/api-docs/api2-tabelas-municipios)++ |
| contatos[ ].contato.uf_cobranca (2)                                                 | string  | 30      | opcional    | UF de cobrança do contato                                                                                           |
| contatos[ ].contato.contatos                                                        | string  | 100     | opcional    | Pessoas de Contato                                                                                                  |
| contatos[ ].contato.fone                                                            | string  | 40      | opcional    | Telefone do Contato                                                                                                 |
| contatos[ ].contato.fax                                                             | string  | 40      | opcional    | Fax do Contato                                                                                                      |
| contatos[ ].contato.celular                                                         | string  | 40      | opcional    | Telefone Celular do Contato                                                                                         |
| contatos[ ].[contato.email](http://contato.email)                                   | string  | 50      | opcional    | Email do Contato                                                                                                    |
| contatos[ ].[contato.email](http://contato.email)_nfe                               | string  | 50      | opcional    | Email para envio de nfe do Contato                                                                                  |
| contatos[ ].[contato.site](http://contato.site)                                     | string  | 40      | opcional    | Site do Contato                                                                                                     |
| contatos[ ].contato.crt (10)                                                        | int     | 1       | opcional    | Código de regime tributário:- 0 - Não informado- 1 - Simples Nacional- 3 - Regime Normal                           |
| contatos[ ].contato.estadoCivil (3)                                                 | int     | -       | opcional    | Código conforme ++[Tabela Estado Civil](https://tiny.com.br/api-docs/api2-tabelas-contatos)++                       |
| contatos[ ].contato.profissao (3)                                                   | string  | 50      | opcional    | Profissão do Contato                                                                                                |
| contatos[ ].contato.sexo (3)                                                        | string  | 10      | opcional    | Sexo do Contato - ("masculino","feminino")                                                                          |
| contatos[ ].[contato.data](http://contato.data)_nascimento (3) (4)                  | string  | 10      | opcional    | Data de nascimento do contato                                                                                       |
| contatos[ ].contato.naturalidade (3)                                                | string  | 40      | opcional    | Naturalidade do contato                                                                                             |
| contatos[ ].contato.nome_pai (3)                                                    | string  | 100     | opcional    | Nome do pai do contato                                                                                              |
| contatos[ ].contato.cpf_pai (3)                                                     | string  | 18      | opcional    | CPF do pai do contato                                                                                               |
| contatos[ ].contato.nome_mae (3)                                                    | string  | 100     | opcional    | Nome da mãe do contato                                                                                              |
| contatos[ ].contato.cpf_mae (3)                                                     | string  | 18      | opcional    | CPF da mãe do contato                                                                                               |
| contatos[ ].contato.limite_credito (5)                                              | decimal | -       | opcional    | Limite de crédito docontato                                                                                         |
| contatos[ ].[contato.id](http://contato.id)_vendedor (6)                            | int     | -       | opcional    | Número de identificação do Vendedor cadastrado na Olist.                                                            |
| contatos[ ].contato.nome_vendedor (6) (7)                                           | string  | 50      | opcional    | Nome do Vendedor cadastrado na Olist.                                                                               |
| contatos[ ].contato.tipos_contato[ ]                                                | list    | -       | opcional    | Lista de tipos do contato                                                                                           |
| contatos[ ].contato.tipos_contato[ ].tipo (8)                                       | string  | 30      | opcional    | Descrição do tipo do contato, conforme a tabela de tipos de contatos na sua conta Olist                             |
| contatos[ ].contato.pessoas_contato[ ]                                              | list    | -       | condicional | Lista de pessoas de contato                                                                                         |
| contatos[ ].contato.pessoas_contato[ ].pessoa_contato (9)                           | object  | -       | condicional | Elemento utilizado para representar uma pessoa de contato                                                           |
| contatos[ ].contato.pessoas_contato[ ].pessoa_contato.nome                          | string  | 50      | condicional | Nome da pessoa de contato                                                                                           |
| contatos[ ].contato.pessoas_contato[ ].pessoa_contato.telefone                      | string  | 30      | condicional | Telefone da pessoa de contato                                                                                       |
| contatos[ ].contato.pessoas_contato[ ].pessoa_contato.ramal                         | string  | 20      | condicional | Ramal da pessoa de contato                                                                                          |
| contatos[ ].contato.pessoas_contato[ ].pessoa_[contato.email](http://contato.email) | string  | 50      | condicional | e-mail da pessoa de contato                                                                                         |
| contatos[ ].contato.pessoas_contato[ ].pessoa_contato.departamento                  | string  | 50      | condicional | Departamento da pessoa de contato                                                                                   |
| contatos[ ].contato.situacao                                                        | string  | 1       | obrigatório | Situação do Contato ("A" - Ativo,"I" - Inativo,"S" - Sem Movimento)                                                 |
| contatos[ ].contato.obs                                                             | string  | 200     | opcional    | Observações gerais sobre o contato.                                                                                 |


(1) - Estes campos são utilizados para localizar o contato que será alterado, a ordem de busca é, id, codigo e cpf_cnpj.  
(2) - O endereço de cobrança é opcional, deve ser informado somente caso ele seja diferente do endereço do contato.  
(3) - Estes campos são opcionais, e devem ser informados somente caso o contato seja pessoa física.  
(4) - Estes campos devem ser informados no formato dd/mm/yyyy, exemplo "01/01/2012".  
(5) - Estes campos utilizam “.” (ponto) como separador de decimais, exemplo "5.25".  
(6) - Caso o vendedor não seja localizado será apresentado um erro de validação.  
(7) - Este campo será desconsiderado caso haja valor no campo id_vendedor.  
(8) - Este campo somente adiciona novos tipos para o contato, não removendo ou alterando os tipos já existentes.  
(9) - Este campo somente adiciona novas pessoas de contato, não removendo ou alterando os contatos. Caso o nome de contato já exista, não será adicionado.  
(10) - Este campo será desconsiderado se o campo "tipo_pessoa" for igual a "F".

### **Retorno do serviço**


| Elemento                                               | Tipo   | Tamanho | Ocorrência         | Descrição                                                                                                |
| ------------------------------------------------------ | ------ | ------- | ------------------ | -------------------------------------------------------------------------------------------------------- |
| retorno                                                | object | -       | obrigatório        | Elemento raiz do retorno                                                                                 |
| retorno.status_processamento                           | int    | -       | obrigatório        | Conforme tabela "++[Status de Processamento](https://tiny.com.br/api-docs/api2-tabelas-processamento)++" |
| retorno.status                                         | string | -       | obrigatório        | Contém o status do retorno “OK” ou “Erro”. Para o caso de conter erros estes serão descritos abaixo      |
| retorno.codigo_erro (1)                                | int    | -       | obrigatório        | Conforme tabela "++[Códigos de erro](https://tiny.com.br/api-docs/api2-tabelas-processamento)++"         |
| retorno.erros[ ] (1) (3)                               | list   | -       | condicional [0..n] | Contém a lista dos erros encontrados.                                                                    |
| retorno.erros[ ].erro                                  | string | -       | condicional        | Mensagem contendo a descrição do erro                                                                    |
| retorno.registros [](2)                                | list   | -       | condicional        | Lista de resultados do retorno                                                                           |
| retorno.registros[ ].registro (2)                      | object | -       | condicional        | Elemento utilizado para representar um contato.                                                          |
| retorno.registros[ ].registro.sequencia                | int    | -       | condicional        | Número sequencial utilizado para identificar cada produto.                                               |
| retorno.registros[ ].registro.status                   | string | -       | condicional        | Contém o status do registro “OK” ou “Erro”. Para o caso de conter erros estes serão descritos abaixo     |
| retorno.registros[ ].registro.codigo_erro              | int    | -       | condicional        | Conforme tabela "Códigos de erro"                                                                        |
| retorno.registros[ ].registro.erros[ ] (3)             | list   | -       | condicional [0..n] | Contém a lista dos erros encontrados.                                                                    |
| retorno.registros[ ].registro.erros[ ].erro            | string | -       | condicional        | Mensagem contendo a descrição do erro                                                                    |
| retorno.registros[ ].[registro.id](http://registro.id) | int    | -       | condicional        | Número de identificação do contato na Olist                                                              |


(1) - Somente estará presente no retorno caso o elemento "status" seja "Erro".  
(2) - Somente estará presente no retorno caso o elemento "status" seja diferente de "OK".  
(3) - Estes campos somente serão informados caso o retorno contenha erros.

### **Exemplos do parâmetro contato**

#### **[Exemplos do parâmetro contato em JSON](https://tiny.com.br/api-docs/api2-contatos-alterar#exemplos-parametro-json)**

```javascript
{
  "contatos": [
    {
      "contato": {
        "sequencia": "1",
        "codigo": "1234",
        "nome": "Contato Teste 1 Alterado",
        "situacao": "A"
      }
    },
    {
      "contato": {
        "sequencia": "2",
        "codigo": "1235",
        "nome": "Contato Teste 2 Alterado",
        "tipo_pessoa": "F",
        "cpf_cnpj": "22755777850",
        "ie": "",
        "rg": "1234567890",
        "im": "",
        "endereco": "Rua Teste",
        "numero": "123",
        "complemento": "sala 2",
        "bairro": "Teste",
        "cep": "95700-000",
        "cidade": "Bento Gonçalves",
        "uf": "RS",
        "pais": "",
        "contatos": "Contato Teste",
        "fone": "(54) 3055 3808",
        "fax": "",
        "celular": "",
        "email": "teste@teste.com.br",
        "id_vendedor": "123",
        "situacao": "A",
        "obs": "teste de obs"
      }
    }
  ]
}
```

### **Exemplos de chamada da API**

#### **[Exemplos da chamada em REST](https://tiny.com.br/api-docs/api2-contatos-alterar#exemplos-chamada-rest)**

```php

$url = 'https://api.tiny.com.br/api2/contato.alterar.php';
$token = 'coloque aqui a sua chave da api';
$contato = '<contatos>...</contatos>';
$data = "token=$token&contato=$contato&formato=JSON";

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

#### **[Exemplos do retorno do serviço em JSON](https://tiny.com.br/api-docs/api2-contatos-alterar#exemplos-retorno-json)**

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
    "status_processamento": "2",
    "status": "Erro",
    "registros": [
      {
        "registro": {
          "sequencia": "",
          "status": "Erro",
          "codigo_erro": "31",
          "erros": [
            {
              "erro": "O número de sequência deve ser informado"
            },
            {
              "erro": "O nome do contato deve ser informado"
            },
            {
              "erro": "A situação do contato deve ser informada"
            }
          ]
        }
      },
      {
        "registro": {
          "sequencia": "",
          "status": "Erro",
          "codigo_erro": "31",
          "erros": [
            {
              "erro": "O número de sequência deve ser informado"
            },
            {
              "erro": "O nome do contato deve ser informado"
            },
            {
              "erro": "A situação do contato deve ser informada"
            }
          ]
        }
      }
    ]
  }
}
```

```javascript
{
  "retorno": {
    "status_processamento": 2,
    "status": "OK",
    "registros": [
      {
        "registro": {
          "sequencia": "1",
          "status": "OK",
          "id": "49644545"
        }
      },
      {
        "registro": {
          "sequencia": "2",
          "status": "OK",
          "id": "49644545"
        }
      }
    ]
  }
}
```

