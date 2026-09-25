# Planning Poker

Vue 3 + Vite + Pinia no frontend; Node + Express + Socket.IO no backend. Salas e participantes são compartilhados em tempo real, com estado somente em memória.

## Executar com Docker

```sh
docker compose up -d --build
```

Frontend: http://localhost:5173. Backend: http://localhost:3000/health.
Os serviços são `frontend` e `backend`, em containers separados. Se os volumes de dependências já existirem:

```sh
docker compose exec -T frontend npm ci
docker compose exec -T backend npm ci
docker compose restart frontend backend
```

O backend usa `nodemon --legacy-watch --watch src`, verificando alterações por polling. Isso permite reiniciar o processo quando arquivos do volume são editados no Windows/Docker Desktop. Sem essa opção, a conexão Socket.IO pode funcionar enquanto o processo ainda executa código antigo, causando timeout ao criar a sala. Após mudar o comando de desenvolvimento, execute `docker compose restart backend` e recarregue a página.

## Estrutura

- `backend/src/server.js`: Express, HTTP, configuração Socket.IO e inicialização.
- `backend/src/socket.js`: eventos, associação à sala e publicação de estado/erros.
- `backend/src/rooms.js`: Map privado de salas e validações de criação/entrada.
- `backend/src/utils/roomCode.js`: códigos únicos de seis caracteres, sem 0, O, 1, I ou L.
- `frontend/src/services/socket.js`: conexão Socket.IO existente.
- `frontend/src/stores/participante.js`: UUID persistido na chave existente `planning-poker:participante-id`; o nome fica em memória. Identificadores antigos inválidos são substituídos por UUID. Com armazenamento bloqueado, a identidade dura apenas a sessão.
- `frontend/src/stores/sala.js`: estado recebido do backend, conexão, erros, ações `createRoom`/`joinRoom` e getters `me`, `isHost`, `participants`, `participantId` e `participantName`. Os listeners são registrados uma vez por instância da store.
- `frontend/src/views/Home.vue` e `Sala.vue`: telas existentes, nas rotas `/` e `/sala/:codigo`.

## Criação e entrada

### Componentes de interface

Home, Sala e ConfiguracaoSala reutilizam `CampoTexto` (label/input com `v-model` e slot para ajuda), `BotaoBase` (variantes primary, secondary e quiet) e `MensagemErro` (alerta acessível). `MarcaApp` e `StatusConexao` são compartilhados entre Home e Sala. Os componentes ficam em `frontend/src/components`, não acessam stores nem Socket.IO e preservam as classes CSS existentes. `CampoTexto` encaminha atributos como `required`, `maxlength`, `class` e `aria-describedby` ao input; `BotaoBase` usa `type="button"` por padrão e encaminha eventos e atributos ao botão nativo. Formulários informam explicitamente `type="submit"`.

A tela chama a store, que envia `room:create` com `{ participantId, name, cards }`. O backend valida UUID, nome (1 a 60 caracteres após trim) e cartas (1 a 100 números finitos não negativos), gera o código, registra o criador como host e associa o socket à sala. Cartas omitidas usam `[0, 0.5, 1, 2, 3, 5, 8, 13, 21]`, preservando o conjunto existente; valores repetidos são removidos.

Na entrada, a store envia `room:join` com `{ roomCode, participantId, name }`. O servidor normaliza o código, verifica a existência da sala e impede nomes duplicados ignorando maiúsculas/minúsculas e espaços nas extremidades. O mesmo ID pode reentrar: sua conexão e nome são atualizados sem duplicar o participante nem perder o papel de host. Um novo nome também passa pela verificação de duplicidade.

Após cada operação válida, `room:state` entrega uma projeção individual da sala para cada socket associado. O objeto interno nunca é transmitido diretamente: `socketId` não é exposto, e votos de terceiros só aparecem após a revelação. O acknowledgement `{ ok: true }` confirma a operação sem carregar outro estado. Em falhas, o servidor envia `room:error` com `{ code, message }` e confirma `{ ok: false, error }`.
O erro de nome duplicado é `DUPLICATE_NAME`, com a mensagem `Já existe um participante com esse nome na sala.`. Outros erros incluem `INVALID_PARTICIPANT_ID`, `INVALID_NAME`, `INVALID_CARDS` e `ROOM_NOT_FOUND`. A interface bloqueia envios durante uma operação e sem conexão, e trata timeout de oito segundos.

## Votação

O backend mantém `votacao: { status: 'aguardando', votos: {} }`. Os estados são `aguardando`, `votando` e `revelada`. Os comandos usam a sala e a identidade associadas ao socket, validadas no servidor:

- `room:start-voting`: somente host, a partir de aguardando ou revelada; limpa votos e abre a rodada. Também atende “Nova votação”. Não reinicia uma rodada já aberta.
- `room:vote`: recebe `card`, valida participação, rodada aberta e pertencimento exato às cartas configuradas. Um voto por identidade; outra carta substitui o voto anterior.
- `room:reveal-votes`: somente host, durante votação; permite revelar com participantes pendentes e bloqueia alterações posteriores.

Todos usam o evento existente `room:state`. Cada participante recebe `participants[].votou` e, antes da revelação, somente o próprio valor em `votacao.votos`. Após revelar, todos recebem os valores, a interface mostra quem não votou, quantidade de votos e média informativa. A média considera apenas números finitos, incluindo zero e decimais; cartas futuras não numéricas são ignoradas. Não existe escolha automática de consenso nem histórico.

## Ciclo de vida e recuperação

O ciclo de vida é tratado separadamente das operações de votação. `room:leave` remove imediatamente participante e voto. Se era host, o primeiro participante restante assume; uma sala sem participantes é excluída.

O host pode usar **Transferir host** junto ao nome de outro participante. A store envia `room:transfer-host` com `{ roomCode, participantId, targetParticipantId }`: `participantId` é o solicitante e `targetParticipantId` é o destinatário. O backend valida a sala, a associação ao socket atual, a permissão de host (`HOST_ONLY`) e a presença do destinatário na mesma sala (`PARTICIPANT_NOT_FOUND`). Somente `hostId` muda; cartas, rodada e votos permanecem. O novo host recebe imediatamente o controle da votação, e o anterior perde essa permissão. A interface aguarda `room:state`, sem mudança local antecipada nem evento redundante.

**Sair da sala** está disponível para todos. Após confirmação do servidor, a participação é limpa e a tela volta ao início. Apenas `planning-poker:sala` é removida do localStorage; o UUID em `planning-poker:participante-id` e outras chaves são preservados. Tentar entrar em uma sala destruída retorna o mesmo `ROOM_NOT_FOUND` de um código inexistente.

Uma desconexão temporária reserva a participação por **60 segundos**. Reentrar com o mesmo ID durante esse prazo preserva identidade, papel, participação e voto da rodada atual. O frontend tenta reassociar automaticamente no evento `connect`, usando o UUID existente e a chave `planning-poker:sala` (código/nome) no localStorage. Recarregar também permite recuperar a participação. Se o prazo expirar, a saída torna-se definitiva e o voto é removido; uma entrada posterior começa sem voto. O servidor continua sendo a fonte da verdade, inclusive se a rodada mudar durante a queda.

Ao abrir a mesma identidade em outra aba, a conexão mais recente assume a participação. A anterior recebe `room:replaced`, deixa de receber estados e não pode votar. Seu disconnect não remove a nova associação. O host desconectado mantém o papel durante a tolerância; a transferência ocorre na saída definitiva.

A configuração de cartas na criação permanece disponível no backend; a edição posterior pela interface continua desabilitada. Reiniciar o backend apaga as salas em memória. O UUID persistido identifica o participante, mas não substitui autenticação. Se o navegador bloquear localStorage, a recuperação fica limitada aos dados em memória.
## Testar com dois contextos do navegador

1. Abra http://localhost:5173 em uma aba normal, crie uma sala como `Viviane` e copie o código. Confira o selo Host e a lista com uma pessoa.
2. Abra uma janela anônima ou outro perfil e entre com o código e o nome `Ana`. As duas telas devem mostrar as mesmas duas pessoas e o mesmo host imediatamente.
3. Antes de entrar como Ana, também é possível tentar ` viviane ` nesse segundo contexto: deve aparecer o erro de nome duplicado, sem adicionar participante.
4. Recarregue a aba normal durante o prazo de recuperação: a participação é reassociada automaticamente, mantendo host e voto.
5. Em outro contexto, tente um código inexistente: deve aparecer Sala não encontrada. Nome vazio também deve impedir entrada.
6. Abra `/sala/CODIGO` diretamente: o formulário existente permite entrar na sala real após informar o nome.

Duas abas comuns no mesmo perfil compartilham localStorage e representam a mesma pessoa. Para testar essa situação, abra o código em outra aba normal e use o mesmo nome: a lista não deve duplicar a pessoa. Use normal + anônima para testar duas identidades; duas janelas anônimas também podem compartilhar armazenamento entre si.

## Validação automatizada

```sh
docker compose exec -T backend npm test
docker compose exec -T frontend npm run build
```

Ou localmente, após instalar as dependências em cada pasta:

```sh
npm --prefix backend test
npm --prefix frontend run build
```

Os testes usam `node:test`, um servidor Socket.IO em porta temporária e clientes reais. Cobrem validações, códigos, nomes duplicados, sincronização, reentrada e preservação do host. Não há script de lint configurado.

## Roteiro de votação e recuperação

1. Com host e convidado em contextos distintos, inicie a votação pelo host. O convidado não deve ter controles administrativos.
2. Vote 3 e depois 5: apenas 5 permanece selecionado. Teste também zero e 0.5.
3. Inspecione `room:state` no convidado: o voto do host não pode aparecer em `votacao.votos`; apenas seu indicador `votou` é público. A lista de cartas configuradas é pública por definição.
4. Entre em um terceiro contexto durante a votação: deve aparecer como Aguardando e poder votar, sem limpar a rodada.
5. Revele com alguém ainda sem votar: confira valores, Não votou, contagem e média. As cartas ficam bloqueadas.
6. Inicie Nova votação: mesmos participantes/cartas, nenhum voto anterior.
7. Provoque uma queda temporária e retome em menos de 60 segundos: participação e voto devem voltar. Abra a mesma identidade em outra aba e feche a antiga: a nova permanece ativa.
8. Use Sair no host: o próximo participante assume, e o voto do antigo host desaparece. Confira também abandono superior a 60 segundos e remoção da última pessoa.

Os testes automatizados incluem projeções de todos os eventos/acknowledgements antes da revelação, permissões, troca de voto, entrada tardia, reconexão, socket antigo, transferência de host e destruição da sala. A inspeção visual em navegador é uma validação separada do build.

Teste de regressão da store de votação: `node --test frontend/test/sala.test.js`. Garante que iniciar/votar não repete a inicialização nem dispara reentrada que bloqueie o comando.

## Roteiro do host e saída

Use três perfis independentes para Ana (criadora), Bruno e Carlos:

1. Bruno usa Sair da sala: Ana continua host e Carlos permanece; Bruno retorna ao início.
2. Em uma sala com os três, Ana transfere para Carlos: todos veem Carlos como host, Ana perde os controles e Carlos pode controlar a rodada existente sem perder votos.
3. Em outra sala com os três nessa ordem de entrada, Ana sai: Bruno assume e Carlos permanece.
4. Ana cria uma sala sozinha e sai: tentar entrar pelo código retorna sala não encontrada.
5. Ana e Bruno estão na sala; Ana atualiza a página e reconecta em menos de 60 segundos: mantém identidade, host e voto, sem duplicar a participação.
6. Um participante comum envia `room:transfer-host` diretamente: recebe `HOST_ONLY` e o host não muda. Destinatários ausentes são rejeitados sem modificar a sala.

Os testes de backend exercitam clientes Socket.IO reais, incluindo transferência, sincronização para três clientes, privacidade dos votos e mudança de permissões. Os testes da store verificam a espera pelo estado do servidor e a limpeza seletiva do localStorage. Execute também `node --test frontend/test/sala.test.js` e o build do frontend; a validação visual segue o roteiro acima.

## Estilização com Tailwind

Tailwind CSS 4 é integrado pelo plugin @tailwindcss/vite em frontend/vite.config.js e importado em frontend/src/style.css. As dependências já estão registradas no package.json e lockfile. Novos estilos devem usar utilities Tailwind; cores compartilhadas ficam em @theme (accent, line e surface). Use classes completas em mapas de variantes, evitando interpolar nomes de utilities.

Sala.vue e BotaoBase.vue foram migrados. Os limites responsivos de 700 e 1000 px, cores, espaçamentos e estados foram preservados. Os componentes compartilhados de campo, marca, erro e conexão continuam usando o CSS legado em @layer components; estilos globais ficam em @layer base. Não duplique propriedades nos dois sistemas. O layout dos botões da Home usa mt-auto e w-full. BotaoBase não usa a classe genérica btn, evitando conflito com regras Bootstrap de folhas de estilo injetadas no navegador. As regras exclusivas da sala e as antigas variantes de botão foram removidas.

Os ícones são imports individuais de lucide-vue-next. Transferir host usa ArrowRightLeft em botão de 32 px, com title, aria-label e confirmação nativa antes de chamar a store. Os outros ícones acompanham os textos das ações. Socket.IO e regras do backend não foram modificados nesta migração.

Com os containers ativos, sincronize dependências e valide:

~~~sh
docker compose exec -T frontend npm ci
docker compose restart frontend
docker compose exec -T frontend npm run build
docker compose exec -T frontend node --test test/sala.test.js
docker compose exec -T backend npm test
~~~

Para iniciar o ambiente: docker compose up -d --build. Não é necessário excluir volumes. Confira Home e Sala em desktop e celular, incluindo foco por teclado, seleção de cartas, confirmação/cancelamento de transferência e estados de conexão.
