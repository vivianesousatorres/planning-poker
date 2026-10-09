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
- `frontend/src/stores/participante.js`: UUID persistido na chave existente `planning-poker:participante-id` e credencial privada em `planning-poker:participante-token`; o nome fica em memória. Identificadores antigos inválidos são substituídos por UUID. Com armazenamento bloqueado, a identidade dura apenas a sessão.
- `frontend/src/stores/sala.js`: estado recebido do backend, conexão, erros, ações `createRoom`/`joinRoom` e getters `me`, `isHost`, `participants`, `participantId` e `participantName`. Os listeners são registrados uma vez por instância da store.
- `frontend/src/views/Home.vue` e `Sala.vue`: telas existentes, nas rotas `/` e `/sala/:codigo`.

## Criação e entrada

### Componentes de interface

Home, Sala e ConfiguracaoSala reutilizam `CampoTexto` (label/input com `v-model` e slot para ajuda), `BotaoBase` (variantes primary, secondary e quiet) e `MensagemErro` (alerta acessível). `MarcaApp` e `StatusConexao` são compartilhados entre Home e Sala. Os componentes ficam em `frontend/src/components`, não acessam stores nem Socket.IO e preservam as classes CSS existentes. `CampoTexto` encaminha atributos como `required`, `maxlength`, `class` e `aria-describedby` ao input; `BotaoBase` usa `type="button"` por padrão e encaminha eventos e atributos ao botão nativo. Formulários informam explicitamente `type="submit"`.

A tela chama a store, que envia `room:create` com `{ participantId, participantToken, name, cards }`. O backend valida UUID, credencial privada, nome (1 a 60 caracteres após trim) e cartas (1 a 100 números não negativos ou rótulos válidos), gera o código, registra o criador como host e associa o socket à sala. Cartas omitidas usam `[0, 0.5, 1, 2, 3, 5, 8, 13, 21]`, preservando o conjunto existente; valores repetidos são rejeitados após normalização.

Na entrada, a store envia `room:join` com `{ roomCode, participantId, participantToken, name }`. O servidor normaliza o código, verifica a existência da sala e impede nomes duplicados ignorando maiúsculas/minúsculas e espaços nas extremidades. O mesmo ID pode reentrar com a credencial privada correspondente: sua conexão e nome são atualizados sem duplicar o participante nem perder o papel de host. Um novo nome também passa pela verificação de duplicidade.

Após cada operação válida, `room:state` entrega uma projeção individual da sala para cada socket associado. O objeto interno nunca é transmitido diretamente: `socketId` e `participantToken` não são expostos, e votos de terceiros só aparecem após a revelação. O acknowledgement `{ ok: true }` confirma a operação sem carregar outro estado. Em falhas, o servidor envia `room:error` com `{ code, message }` e confirma `{ ok: false, error }`.
O erro de nome duplicado é `DUPLICATE_NAME`, com a mensagem `Já existe um participante com esse nome na sala.`. Outros erros incluem `INVALID_PARTICIPANT_ID`, `INVALID_SESSION`, `INVALID_NAME`, `INVALID_CARDS` e `ROOM_NOT_FOUND`. A interface bloqueia envios durante uma operação e sem conexão, e trata timeout de oito segundos.

## Votação

O backend mantém `votacao: { status: 'aguardando', votos: {}, roundId: 0 }`. Os estados são `aguardando`, `votando` e `revelada`. Os comandos usam a sala e a identidade associadas ao socket, validadas no servidor:

- `room:start-voting`: somente host, a partir de aguardando ou revelada; limpa votos e abre a rodada. Também atende “Nova votação”. Não reinicia uma rodada já aberta.
- `room:vote`: recebe `card`, valida participação, rodada aberta e pertencimento exato às cartas configuradas. Um voto por identidade; outra carta substitui o voto anterior.
- `room:reveal-votes`: somente host, durante votação; permite revelar com participantes pendentes e bloqueia alterações posteriores.

Voto, início, reveal e configuração de deck enviam o `roundId` atual. Ele incrementa ao iniciar uma rodada ou mudar o deck; versão ausente/antiga é rejeitada com `STALE_ROUND`. Salvar o mesmo deck preserva a versão. Todos usam o evento existente `room:state`. Cada participante recebe `participants[].votou` e, antes da revelação, somente o próprio valor em `votacao.votos`. Após revelar, todos recebem os valores, a interface mostra quem não votou, quantidade de votos e média informativa. A média considera apenas números finitos, incluindo zero e decimais; cartas não numéricas são ignoradas. Não existe escolha automática de consenso nem histórico.

## Ciclo de vida e recuperação

O ciclo de vida é tratado separadamente das operações de votação. `room:leave` remove imediatamente participante e voto. Se era host, o primeiro participante restante assume; uma sala sem participantes é excluída.

O host pode usar **Transferir host** junto ao nome de outro participante. A store envia `room:transfer-host` com `{ roomCode, participantId, targetParticipantId }`: `participantId` é o solicitante e `targetParticipantId` é o destinatário. O backend valida a sala, a associação ao socket atual, a permissão de host (`HOST_ONLY`) e a presença do destinatário na mesma sala (`PARTICIPANT_NOT_FOUND`). Somente `hostId` muda; cartas, rodada e votos permanecem. O novo host recebe imediatamente o controle da votação, e o anterior perde essa permissão. A interface aguarda `room:state`, sem mudança local antecipada nem evento redundante.

**Sair da sala** está disponível para todos. Após confirmação do servidor, a participação é limpa e a tela volta ao início. Apenas `planning-poker:sala` é removida do localStorage; o UUID em `planning-poker:participante-id` e outras chaves são preservados. Tentar entrar em uma sala destruída retorna o mesmo `ROOM_NOT_FOUND` de um código inexistente.

Uma desconexão temporária reserva a participação por **60 segundos**. Reentrar com o mesmo ID e credencial privada durante esse prazo preserva identidade, papel, participação e voto da rodada atual. O frontend tenta reassociar automaticamente no evento `connect`, usando o UUID, a credencial privada e a chave `planning-poker:sala` (código/nome) no localStorage. Recarregar também permite recuperar a participação. Se o prazo expirar, a saída torna-se definitiva e o voto é removido; uma entrada posterior começa sem voto. O servidor continua sendo a fonte da verdade, inclusive se a rodada mudar durante a queda.

Ao abrir a mesma identidade em outra aba, a conexão mais recente assume a participação. A anterior recebe `room:replaced`, deixa de receber estados e não pode votar. Seu disconnect não remove a nova associação. O host desconectado mantém o papel durante a tolerância; a transferência ocorre na saída definitiva.

A configuração de cartas está disponível na interface para o host e é validada no backend. Reiniciar o backend apaga as salas em memória. O UUID persistido identifica o participante, mas não substitui autenticação. Se o navegador bloquear localStorage, a recuperação fica limitada aos dados em memória.
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

Ao desconectar, o participante permanece na sala com `online: false` e a carta
exibe **Offline**. O servidor publica a mudança em `room:state` para os demais,
preservando o voto e o host durante os 60 segundos de reconexão. A reentrada
com a mesma identidade e credencial restaura `online: true` e cancela a remoção.
Sem reentrada nesse prazo, o participante e seu voto são removidos e todos
recebem o estado atualizado. Se era o host, o primeiro participante restante
assume, seguindo a regra existente. Sair explicitamente continua sendo imediato.

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

## Fase 4B — Reações em tempo real

Ao passar o mouse, clicar/tocar ou focar a carta de outro participante, aparece uma pílula de reações rápidas: **👍 ❤️ 😂 😮 😢 🙏 [+]**. A própria carta não oferece seletor. O botão **+**, com o rótulo “Mostrar mais reações para <nome>”, abre um picker separado com busca em português, categorias e grade rolável. Não há biblioteca adicional.

O catálogo `frontend/src/constants/catalogoEmojis.js` contém 60 itens `{ emoji, nome, categoria, palavrasChave }`, organizados em cinco categorias com 12 emojis cada: Emoções, Gestos, Corações, Festa e Diversão. `EMOJIS_RAPIDOS` define os seis atalhos padrão; `EMOJIS_PERMITIDOS` deriva os valores enviados. A busca combina nome/palavras-chave, ignora maiúsculas e acentos e pode ser filtrada por categoria. As opções anteriores, incluindo 💩, permanecem no catálogo.

`usePreferenciasReacoes.js` personaliza as seis posições por frequência de uso e, em caso de empate, uso mais recente. Completa com os padrões sem repetir emojis. Persiste somente `{ emoji: { count, lastUsedAt } }` na chave local `planning-poker:preferencias-reacoes`, sem enviar preferências ao backend ou incluí-las na sala. Registra apenas o evento efetivamente emitido pelo servidor para uma reação do próprio participante: o acknowledgement de uma tentativa ignorada pelo cooldown não conta. Dados inválidos ou armazenamento indisponível retornam silenciosamente aos padrões. O balão acompanha a lista atualizada após a confirmação do envio, inclusive se já estiver aberto; o picker completo mantém os 60 emojis.

`SeletorReacao.vue` renderiza somente a pílula rápida. `EmojiPickerPopover.vue` renderiza o picker completo: foco inicial na busca, Tab entre controles, setas/Home/End na grade, fechamento por seleção, clique fora, perda de foco para fora ou Esc. Esc e seleção devolvem o foco à carta. O picker completo permanece aberto ao mover o mouse entre a carta e o painel. Clicar em outra carta troca o alvo; hover não interrompe um picker completo aberto.

`Sala.vue` mantém uma única referência local `{ participantId, modo: 'rapido' | 'completo' }`, ou `null`, garantindo apenas um popover aberto por vez. `CartaParticipante.vue` integra os componentes e emite `reagir(emoji)` sem acessar Socket.IO. Ao perder a sessão, desconectar, mudar de sala ou remover o alvo, o seletor é fechado.

Os popovers são ancorados à carta com `Teleport` para o body e posicionamento fixo. `usePosicionamentoPopover.js` centraliza o painel na carta, prefere a lateral quando há espaço, ou escolhe acima/abaixo e limita posição, largura e altura à interseção entre mesa e viewport, com margem de 8 px. A grade possui scroll interno; não há scroll horizontal da página. ResizeObserver, resize e scroll recalculam o posicionamento. Todos os observers/listeners e o frame de foco são cancelados ao desmontar.

O cliente envia `room:reaction` com `{ roomCode, targetParticipantId, emoji }`. O backend identifica o remetente por `socket.data`, valida a associação ao socket atual com `requireMember()`, sala, alvo, autorreação e allowlist. Emite o mesmo evento para todos na sala, inclusive o remetente, com `{ id, fromParticipantId, targetParticipantId, emoji }`; `id` é um UUID gerado no servidor. Não publica `room:state` nem altera votação, reveal ou host. Erros seguem `room:error` e acknowledgement `{ ok: false, error }`. `backend/src/reactionEmojis.js` mantém a allowlist exata dos 60 emojis: não aceita texto livre ou variantes fora da coleção.

O cooldown de 700 ms continua em memória no backend: `Map<roomCode, Map<participantId, timestamp>>`. Trocar/reconectar o socket não reinicia o intervalo. Envios durante o cooldown recebem `{ ok: true }`, sem emissão e sem erro visual. Registros expirados são descartados no próximo envio válido; o mapa inteiro da sala é removido quando o último participante sai, inclusive após o prazo de desconexão. Não há timers de cooldown no backend.

A store apenas envia e assina o evento. `useReacoes.js` mantém a lista visual temporária e um timer por reação. **A animação CSS dura 0,8 segundo: o emoji percorre um arco com giro, como uma bolinha de papel, atinge a carta em aproximadamente 0,58 segundo e desaparece nos 0,22 segundo seguintes.** A remoção do estado continua após 2 segundos, mas o elemento já fica transparente ao terminar a animação. Cada navegador calcula o trajeto entre as cartas localmente, sem enviar coordenadas. Reações simultâneas têm IDs e posições diferentes. `prefers-reduced-motion` usa apenas fade no alvo, sem deslocamento ou giro.

O composable também controla o bloqueio visual de 700 ms, remove reações de alvos ausentes e limpa a lista/timers quando muda a sala, ocorre desconexão ou a sessão é perdida. Ao desmontar, cancela todos os timers e remove sua assinatura Socket.IO. Reações não entram em `room`, sessão, localStorage, banco ou histórico. Votação, nova rodada, reveal, host e Docker permanecem iguais.

Validação automatizada, a partir do checkout completo:

```sh
npm --prefix backend test
node --test frontend/test/*.test.js
npm --prefix frontend run build
```

O teste de equivalência importa tanto o catálogo frontend quanto a allowlist backend; execute-o no checkout completo, pois os containers atuais montam cada serviço separadamente. Não é necessário alterar Docker.

Resultado: 13 testes de backend e 13 de frontend passaram, além do build Vite. As verificações cobrem os 60 emojis, rejeição de texto livre, paridade do catálogo, busca sem acentos, categorias, limites de posicionamento em viewport estreito, cooldown, isolamento entre salas, identidade, autorreação, lista simultânea, remoção aos 2 segundos e cleanup. Os testes de preferência cobrem ordenação/complemento, desempate, persistência, armazenamento inválido/indisponível e registro apenas após emissão aceita. As regressões existentes de votação/reveal/transferência continuam passando.

Na validação da preferência no navegador, uma reação recebida da outra identidade manteve os padrões; o envio próprio de 💩 colocou o emoji na primeira posição na próxima abertura e preservou essa ordem após recarregar a página.

Validação no navegador integrado com Jane e Viviane: pílula rápida, abertura pelo +, foco na busca, pesquisa “coracao azul”, categorias, setas, envio recebido pelas duas identidades, permanência visível após 1,1 segundo e remoção aos 2 segundos, fechamento por seleção/clique fora/Esc e retorno de foco. Um terceiro participante confirmou a troca de alvo com apenas um seletor aberto. O picker apresentou scroll interno, ficou dentro da mesa e não gerou scroll horizontal. A segunda identidade utilizou uma entrada temporária de QA com WebSocket em outra origem, removida após o teste; nenhuma configuração de produção foi alterada. A conferência em celular/touch real continua pendente; os limites de viewport estreito são cobertos por testes de geometria.

O fechamento por hover considera uma área contínua entre carta e pílula, incluindo o espaço de 8 px. Uma ponte transparente e a verificação de posição do ponteiro permitem atravessar essa área devagar sem fechar o balão. O balão rápido permanece aberto após escolher uma reação e fecha ao sair da área conjunta; clique fora e Esc continuam disponíveis. O picker expandido fecha após a seleção. O listener de pointermove é removido quando a pílula desmonta. O teste de regressão cobre o espaço acima/abaixo da carta; no navegador, uma pausa no espaço seguida de clique enviou 👍 corretamente.

## Auditoria funcional e técnica — 08/10/2026

A lista completa de 106 critérios foi auditada: **APROVADO COM RESSALVAS**.
A execução final teve **25/25 testes backend e 17/17 frontend aprovados**,
com build local/Docker, construção e reinício dos containers e interface real.
O relatório detalha cinco correções, os cenários exercitados e cinco critérios
parciais que não foram aprovados. Consulte [o relatório da auditoria](docs/auditoria-v1.0.md).

Comandos de regressão: `npm test --prefix backend`,
`npm test --prefix frontend` e `npm run build --prefix frontend`.

## Configuração do deck

O host abre **Configurar deck** (engrenagem junto às cartas), escolhe Fibonacci,
Sequencial, T-Shirt ou Personalizado e confere a prévia antes de salvar.
Fibonacci é o padrão: `0, 0.5, 1, 2, 3, 5, 8, 13, 21`.
Valores são separados por vírgulas; decimais usam ponto. Rótulos como `XS`, `?`
e `☕` são aceitos. O servidor remove espaços extras, normaliza números e rejeita
vazios, duplicados (inclusive `1, 1.0` e `XS, xs`), números negativos e decks
fora do limite de 1 a 100 cartas com até 20 caracteres por rótulo.

`room:configure-deck` usa a associação da conexão e exige o host atual.
O deck é publicado no `room:state`, inclusive na entrada e reconexão, e é mantido
na transferência de host. Um deck diferente (inclusive ordem diferente) limpa
os votos, oculta os resultados e retorna ao estado `aguardando`; o host inicia
a nova votação. Salvar valores equivalentes na mesma ordem preserva a rodada.
Os votos precisam corresponder exatamente a um valor do deck; rótulos não entram
na média numérica. As salas continuam em memória e desaparecem ao reiniciar o backend.

Para validar: execute `npm --prefix backend test`, `node --test frontend/test/*.test.js`
e `npm --prefix frontend run build`. Com Docker, execute os comandos dentro dos
serviços correspondentes. Em dois perfis de navegador, vote e revele, altere o
deck no host e confira a limpeza e atualização nos dois clientes; inicie novamente,
vote `?` ou `☕`, salve o mesmo deck e confira que a rodada permanece. Recarregue o
participante e transfira o host para conferir a persistência e as permissões.

### Encerramento das pendências — 09/10/2026

Regressão **45/45** (25 backend + 20 frontend), build aprovado e soak de três
minutos com **1.083 salas e 7.581 clientes**. Limpeza de recursos e comportamento
de memória foram verificados no escopo automatizado; continuam pendentes a
origem do MutationObserver no navegador, touch físico e outra máquina.
Nenhum código de produção foi alterado nesta revisão.
Consulte [o encerramento da auditoria](docs/encerramento-auditoria-v1.0.md).

Para repetir o soak, a partir da raiz:
`node --expose-gc backend/audit/soak.cjs --duration=180000 --output=docs/soak-v1.0.json`.
O ensaio cria um servidor isolado e usa tolerância de abandono de 75 ms;
a configuração de produção permanece em 60 segundos.
