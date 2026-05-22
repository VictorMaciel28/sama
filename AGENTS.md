# Instruções para o agente (ler a cada iteração)

Leia este arquivo **no início de cada iteração** junto com o pedido do usuário.

## Documentação Tiny API (arquivos `.md`)

- **Tiny v2 (referência em Markdown):** `src/app/api/pedidos/tiny_api_documentation/v2/`
  - Exemplos: `pedido.obter.md`, `pedidos.pesquisa.md`, `produtos.pesquisar.md`, `notas.fiscais.pesquisar.md`, `codigo.erros.md`, etc.
- **Tiny v3 (quando existir):** `src/app/api/pedidos/tiny_api_documentation/v3/`

## UI — textos que o usuário não pediu

- **Não** adicionar na interface (labels, subtítulos, parágrafos de ajuda, tooltips longos, mensagens estáticas) textos **explicativos ou didáticos** que o usuário **não solicitou explicitamente**.
- Manter copy **mínima**: só o que for necessário para rótulos/ações já combinados (títulos de página, nomes de botões pedidos, erros retornados pela API, etc.).
- Exemplo do que **evitar**: blocos do tipo *"Pedidos com status X. Ao clicar, Y acontece…"* sem o usuário ter pedido essa explicação na tela.

## Banco de dados — Prisma

- **Não criar migrations** (`prisma/migrations/...`) como parte do fluxo padrão de alteração de schema.
- O projeto usa **`npx prisma db push`**: basta manter o **`schema.prisma`** correto e alinhado ao banco; o usuário sincroniza quando quiser.

## Scripts `.js` e trabalhos incompletos

- **Não** criar arquivos **`.js`** (scripts soltos, one-off) esperando que eles “resolvam” o problema no lugar de uma solução integrada ao app.
- Se não for possível concluir a ação pedida (limitações de API, ambiente, escopo ambíguo), **explicar** as melhores alternativas em texto (passos, trade-offs, o que falta), em vez de entregar um script frágil.

## Confirmações e feedback — evitar `alert` / `confirm` nativos

- **Não** usar `alert()`, `confirm()` ou `prompt()` do navegador para confirmação ou avisos ao usuário.
- Usar **modais / componentes já adotados no sistema** (ex.: `react-bootstrap` `Modal`, toasts já existentes como `react-toastify`, padrões das telas admin).

## Confirmação de ações — tooltips do sistema

- Quando fizer sentido e o projeto já tiver o padrão, **preferir confirmar ações** (ou reforçar o que um controle faz) com **tooltips / títulos (`title`) / padrões de UX já usados no sistema**, em vez de texto extra fixo na página.
