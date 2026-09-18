# Planning Poker

Frontend de estudo em Vue 3, Vite, Vue Router e Pinia. Tema escuro e responsivo, sem framework CSS adicional.

## Executar com Docker

O arquivo existente é `compose.yaml`; o serviço é `app` e o container é `planning-poker`.

```sh
docker compose up -d --build
```

Acesse http://localhost:5173.

Se as dependências mudarem e o volume de node_modules já existir:

```sh
docker compose exec -T app npm ci
docker compose restart app
```

Para compilar:

```sh
docker compose exec -T app npm run build
```

Não há script de lint configurado.

## Estrutura e fluxo

- `src/main.js`: registra Pinia e router.
- `src/App.vue`: shell com RouterView.
- `src/router/index.js`: rotas `/` (Home.vue) e `/sala/:codigo` (Sala.vue).
- `src/stores/participante.js`: identidade e nome; persiste apenas o ID na chave `planning-poker:participante-id` do localStorage, quando disponível.
- `src/stores/sala.js`: estado local da sala, cartas, voto e configuração do host.
- `src/components/ConfiguracaoSala.vue`: modal com validação das cartas.
- `src/style.css`: estilos compartilhados e responsivos.

Criar sala gera um código temporário e define o participante atual como host. Entrar aceita qualquer código não vazio, sem verificar existência. Abrir uma URL diretamente ou recarregar pede o nome novamente. A sala, as cartas e o papel de host ficam em memória e não são recuperados após recarregar.

A lista mostra apenas o participante local. Selecionar outra carta substitui o voto anterior; revelar exibe somente a estimativa local. Apenas o host vê e pode aplicar configurações. As cartas aceitam números não negativos, incluindo decimais com ponto, separados por vírgula. Duplicatas são removidas; salvar limpa o voto e a revelação.

## Validação manual

1. Em `/`, tente criar com nome vazio ou espaços: deve impedir o avanço.
2. Crie com um nome: deve navegar para `/sala/:codigo`, mostrar Host, nove cartas e o participante aguardando.
3. Selecione 0 e depois 0.5: apenas a última carta fica selecionada e o status muda para Votou.
4. Revele: a estimativa local aparece. Copie o código e confira o feedback.
5. Como host, abra Configurações. Valores como `0, texto, 1,` devem apresentar erro.
6. Salve `0, 0.5, 1.5, 3, 3`: quatro cartas devem aparecer, com voto e revelação limpos. Cancelar ou Escape não deve salvar.
7. Saia e entre com código e nome: deve abrir a sala sem Host nem Configurações.
8. Abra `/sala/TESTE` diretamente: deve pedir nome e permitir entrar sem quebrar a tela.
9. Confira Home, sala e modal em largura de celular e navegação por teclado.

## Próximas etapas

Não há backend, Socket.IO, comunicação em tempo real ou verificação compartilhada de salas. Os controles de host atuais são apenas de interface, não autorização de segurança.

A futura camada de servidor deverá garantir nomes únicos por sala, permissões do host, transferência automática e explícita do host, destruição de salas vazias e entrada de participantes durante a votação. A configuração de cartas deverá ser sincronizada. Média de estimativas não é prioridade.
