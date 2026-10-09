# Planning Poker — auditoria da v1.0

Data: 08/10/2026. Escopo: a lista completa de 106 critérios fornecida pelo usuário.

**Resultado: APROVADO COM RESSALVAS.**

> Atualização em 09/10/2026: regressão 45/45 e soak passaram; dois critérios resolvidos, três permanecem parciais. Consulte [o encerramento e seus limites](encerramento-auditoria-v1.0.md). Os resultados narrados abaixo são da execução original de 08/10, salvo os dois itens atualizados na matriz.


O fluxo funcional exercitado passou após cinco correções pontuais. A aprovação
original não abrangia os cinco critérios então parciais; três continuam pendentes após a revisão de 09/10. Não
certifica ausência de vazamentos de memória, touch real ou execução em outro host.
Nenhum item foi aprovado somente pela leitura do código.

## Resumo dos resultados originais — 08/10/2026

- Testes automatizados únicos na execução final: **42**.
- Aprovados: **42** — backend **25/25**, frontend **17/17**.
- Reprovados na execução final: **0**.
- Não executados/pulados pelos runners das duas suítes: **0**.
- Verificação adicional no Docker: backend **25/25** e subconjunto frontend
  **7/7**, repetindo casos já contados; não são 32 testes únicos adicionais.
- Critérios da solicitação: **106**, com **101 aprovados e 5 parciais/pendentes**.
  Os cinco parciais não são contabilizados como sucesso.
- Problemas confirmados e corrigidos: **5**; diagnóstico de console ainda pendente: **1**.
- Builds Vite local e no container passaram. Construção das duas imagens,
  inicialização pelo README, reinício e validação do Compose passaram.

Os testes de integração criam servidores HTTP/Socket.IO e clientes reais em
portas locais efêmeras. Os testes de expiração usam prazos reduzidos para
exercitar a rotina de remoção sem esperar 60 segundos em cada caso. O prazo
normal permanece em 60 segundos. A queda do transporte também foi exercitada
com reconexão automática do cliente Socket.IO.

O teste frontend que compara catálogo/prévia com o backend exige o checkout
completo. O volume do serviço frontend monta somente frontend; por isso nele
foi executado um subconjunto explícito de sete testes, e não a suíte inteira.
A suíte inteira foi executada no checkout.

## Arquitetura e regras verificadas

- Vue 3/Vite, Pinia e Vue Router renderizam Home/Sala. Componentes apresentam
  controles; a store envia os eventos e aplica o estado canônico do servidor.
- Node/Express/Socket.IO mantêm salas em um Map. Reiniciar o backend perde as
  salas; isso foi observado na interface, com retorno a entrada e sala inexistente.
- UUID público identifica a pessoa; token privado persistido permite recuperar
  a identidade. socket.id identifica a conexão atual e limita suas ações.
- Disconnect reserva a participação por 60 segundos. Leave é imediato. Após
  remoção do host, o primeiro participante restante assume; sala vazia é removida.
- Estados de votação: aguardando, votando e revelada. Mudar deck limpa a rodada;
  salvar deck equivalente na mesma ordem preserva estado, votos e roundId.
- Votos antes do reveal são projetados por destinatário: só o próprio valor é
  transmitido. Participantes têm status de voto, sem o valor alheio.
- Reações são efêmeras, validadas por allowlist e cooldown, com alvo e remetente
  associados pelo servidor. Não entram no estado persistido da sala.

Eventos usados: room:create, room:join, room:leave, room:transfer-host,
room:start-voting, room:vote, room:reveal-votes, room:configure-deck,
room:reaction; respostas room:state, room:error, room:left e room:replaced.

## Problemas corrigidos

### 1. Assumir a identidade/host com UUID público — alta

Reprodução: uma segunda conexão envia room:join com o ID e nome do host, ambos
visíveis na sala, e uma credencial diferente. Antes da correção a entrada era
aceita e a conexão legítima era substituída.

Causa: reentrada comparava apenas o identificador público. Correção:
participantToken aleatório independente do ID, persistido no localStorage e
validado antes de reassociar um participante existente. O token não é publicado
nas projeções, reações ou acknowledgements.

Arquivos: backend/src/rooms.js, frontend/src/stores/participante.js,
frontend/src/stores/sala.js, backend/test/rooms.test.js,
backend/test/reactions.test.js, frontend/test/participante.test.js e
frontend/test/sala.test.js.

Resultado: teste de invasão falhou antes e passou depois; reconexão legítima,
F5, substituição de aba e proteção contra socket antigo continuaram passando.
Clientes antigos precisam atualizar o frontend para enviar a credencial.

### 2. Comando atrasado afetava rodada posterior — média

Reprodução: guardar o comando de voto da rodada A, revelar A, iniciar B e enviar
o comando guardado. Antes da correção, o voto era aceito em B.

Causa: comando identificava somente sala/pessoa/carta. Correção: roundId
publicado no estado e enviado em vote/start/reveal/configure-deck. Iniciar uma
rodada ou mudar o deck incrementa roundId; comandos com versão ausente,
inválida ou diferente são rejeitados com STALE_ROUND.

Arquivos: backend/src/rooms.js, backend/src/socket.js,
frontend/src/stores/sala.js, backend/test/rooms.test.js e frontend/test/sala.test.js.

Resultado: teste falhou antes e passou depois, rejeitando voto, reveal, start e
deck de rodada antiga sem alterar o estado atual. Clientes aguardam o estado
correto antes de comandar a nova rodada; os testes também aguardam esse estado.

### 3. Evento sem payload ficava sem acknowledgement — média

Reprodução: emitWithAck('room:vote') sem objeto. O callback ocupava o primeiro
argumento do handler, que não o reconhecia; a resposta terminava em timeout.

Correção: reconhecer o callback isolado e tratar o payload como ausente, com
rejeição normal e acknowledgement. Não houve mudança na regra de autorização.

Arquivos: backend/src/socket.js e backend/test/rooms.test.js.
Resultado: teste de vote/reaction/join sem payload falhou antes e passou depois,
sem timeout ou INTERNAL_ERROR. Payloads nulos, escalares, arrays e objetos
incompletos também foram rejeitados sem alterar a sala.

### 4. Prévia divergente da normalização numérica — baixa

Reprodução: digitar 0.50 e 01; prévia mostrava esses rótulos, mas o deck salvo
continha 0.5 e 1. Correção: a prévia normaliza a representação dos números válidos,
mantendo a validação definitiva no servidor.

Arquivos: frontend/src/utils/deck.js e frontend/test/deck.test.js.
Resultado: comparação de presets/prévia com normalizeCards falhou antes e passou
depois; no navegador a prévia e o deck salvo mostraram 0.5, XS, ?, ☕.

### 5. Overflow em viewport estreito com barra de rolagem — baixa

Reprodução: frame de 320 px, com área útil de 304 px. O body mantinha largura
mínima de 320 px; scrollWidth era maior que clientWidth.

Correção: remover a largura mínima fixa do body, preservando os layouts.
Arquivo: frontend/src/style.css.
Resultado visual: depois da correção scrollWidth e clientWidth foram iguais
em frames de 320, 390 e 768 px. As cartas permaneceram dentro da área útil.
Foi verificado nome longo, votação por teclado e atualização da interface.

## Evidências e execução

### A — testes backend

backend/test/rooms.test.js e backend/test/reactions.test.js, 25 testes:
validação/unicidade, dois clientes, credencial privada, isolamento entre salas,
entrada depois do reveal, comandos antigos, entradas/votos simultâneos,
voto concorrente com reveal, saída de host durante votação, nomes concorrentes,
reações simultâneas, payloads inesperados/ausentes, queda do transporte,
transferência/permissões, privacidade de todos os payloads, reconexão/aba antiga,
expiração, sala vazia, cooldown e configuração do deck.

### B — testes frontend

frontend/test: 17 testes cobrindo identidade/token, armazenamento bloqueado,
store canônica/permissões/erros, inicialização única, eventos de reação e
cancelamento da assinatura, expiração/limpeza no effectScope, catálogo, busca,
preferências, geometria de popovers e paridade da prévia/presets com o backend.

### N — navegador desktop e telas menores

A aplicação real foi usada com o backend Docker. Desktop confirmou criação,
entrada, nomes duplicados, votos/alteração/privacidade/reveal, nova rodada,
F5, troca de aba, transferência/saída do host e sala vazia. Na continuação:
presets Sequencial e T-Shirt na prévia, T-Shirt salvo nos dois clientes,
deck personalizado, erro de vazio/duplicado, mesma configuração preservando
rodada, média com carta não numérica, reação recebida em ambos os clientes,
expiração, busca de emoji em português e Escape devolvendo foco à carta.

O comando de viewport do navegador integrado não alterou a largura efetiva
da página principal. Foi usada uma página temporária com iframe que carregava
a aplicação original: os frames tiveram larguras de 320/390/768 px, com áreas
úteis medidas de 304/375/753 px por causa das barras de rolagem. Os breakpoints
CSS reais foram exercitados, sem alterar componentes para simular o resultado.
Isso valida layout em viewport menor, mas não eventos touch em aparelho físico.

Foi observado Sem conexão e os controles administrativos desabilitados ao
parar somente o backend. Após start/health 200, o cliente reconectou; a sala
inexistente foi informada porque o reinício perde o Map, conforme a regra atual.

As entradas temporárias de QA e as abas foram removidas. A segunda identidade
usou outra origem e WebSocket direto para contornar o CORS exclusivamente no
teste; a configuração original de CORS não foi modificada.

### D — Docker e build

Foram executados docker compose build, docker compose up -d --build,
docker compose restart, stop/start somente do backend, config --quiet e ps.
As duas imagens construíram e ambos os serviços terminaram ativos.
O frontend acessou http://backend:3000/health na rede Docker e recebeu HTTP 200.
require.resolve confirmou Vue/Vite e Express/Socket.IO nos volumes node_modules.

Frontend: HMR registrado nos logs e ausência de overflow atualizada ao vivo após
editar o CSS. Backend: alteração temporária inofensiva em server.js foi detectada
pelo nodemon --legacy-watch, com restart e startup; a alteração foi desfeita.
Não foram removidos volumes nem alterados outros projetos Docker.

Comandos de regressão no checkout:

```sh
npm test --prefix backend
npm test --prefix frontend
npm run build --prefix frontend
```

Comandos adicionais executados nos containers:

```sh
docker compose exec -T backend npm test
docker compose exec -T frontend node --test test/sala.test.js test/participante.test.js test/reacoes.test.js
docker compose exec -T frontend npm run build
```

O build da imagem apresentou aviso de depreciação de lucide-vue-next e o Node 22
apresentou ExperimentalWarning da API MockTimers usada nos testes. Não houve
falha de build/teste; migração de dependências não foi incluída nesta auditoria.

## Pendências registradas em 08/10/2026 — situação atual no relatório de encerramento

1. Touch/navegadores móveis reais: o layout foi exercitado em viewport menor,
   mas toque, teclado virtual e Safari/Android físicos não foram executados.
2. Console na automação responsiva: uma ocorrência de
   "Failed to execute 'observe' on 'MutationObserver': parameter 1 is not of type 'Node'"
   apareceu ao usar a aplicação dentro do frame. Não houve avisos Vue nos fluxos
   observados da página principal, nem há MutationObserver em frontend/src.
   A origem do erro não foi confirmada; não foi ocultado ou contado como aprovado.
   Um clique automatizado no frame também não iniciou uma rodada; o comando por
   teclado funcionou. Interação por ponteiro no frame/touch merece revalidação.
3. Portabilidade: construção/inicialização passaram na máquina atual, com
   caminhos relativos no Compose. Não foi executado checkout limpo em outra
   máquina. O endpoint/CORS atuais usam localhost; acesso remoto/LAN exige uma
   decisão de configuração e não foi habilitado durante os testes.
4. Recursos ao desmontar: assinaturas/timers do composable foram verificados
   com effectScope, e modais/pickers foram abertos/fechados na interface.
   Não houve instrumentação que contasse todos os ResizeObservers e listeners
   DOM após cada desmontagem; esse critério completo permanece parcial.
5. Memória/erros em uso prolongado: os testes e cleanup exercitado passaram;
   não foi executado soak test ou perfil de heap. Ausência geral de vazamentos
   não pode ser afirmada a partir desta execução.

## Decisões funcionais registradas

- As salas continuam somente em memória; persistência após restart não foi
  acrescentada. Esse comportamento precisa ser aceitável para a publicação.
- Os testes concorrentes aceitam as duas ordens válidas de voto/reveal: voto
  processado antes do reveal entra no resultado; depois é rejeitado. Não existe
  garantia de chegada no mesmo instante físico a todos os navegadores; foi
  comprovada convergência do estado entregue a todos os clientes.
- Dentro de uma mesma rodada, vale a última alteração de voto aceita pelo
  servidor. Comandos de rodada anterior são rejeitados, e a associação ao socket
  protege contra comandos de uma conexão substituída.
- Mobile físico, host de implantação e persistência após restart não foram
  assumidos como novas regras nem implementados por iniciativa da auditoria.

## Matriz dos 106 critérios

Legenda: A = testes backend; B = testes frontend; N = execução no navegador;
D = execução Docker/build. PARCIAL significa que o critério completo não foi
aprovado, mesmo quando alguma parte foi exercitada. A descrição das evidências
acima identifica os testes/cenários executados, sem transformar leitura em teste.


### 1. Salas e participantes

- [x] Criar uma sala com sucesso. Evidência: A/B/N.
- [x] Entrar em uma sala existente. Evidência: A/B/N.
- [x] Impedir a entrada em uma sala inexistente. Evidência: A/B/N.
- [x] Impedir nomes duplicados na mesma sala. Evidência: A/B/N.
- [x] Permitir nomes iguais em salas diferentes. Evidência: A/B/N.
- [x] Sincronizar a lista de participantes em tempo real. Evidência: A/B/N.
- [x] Garantir que cada participante tenha um identificador único. Evidência: A/B/N.
- [x] Verificar persistência da identidade no localStorage. Evidência: A/B/N.
- [x] Atualizar a página sem duplicar o participante. Evidência: A/B/N.
- [x] Reconectar após perda temporária de conexão. Evidência: A/B/N.
- [x] Impedir que uma conexão antiga remova uma sessão reconectada. Evidência: A/B/N.
- [x] Destruir a sala quando todos os participantes saírem definitivamente. Evidência: A/B/N.
- [x] Diferenciar desconexão temporária de saída definitiva, conforme as regras existentes. Evidência: A/B/N.

### 2. Host e permissões

- [x] O criador da sala é definido como host. Evidência: A/B/N.
- [x] Apenas o host pode executar ações administrativas. Evidência: A/B/N.
- [x] O host pode transferir sua função para outro participante. Evidência: A/B/N.
- [x] Todos recebem a atualização do novo host. Evidência: A/B/N.
- [x] O antigo host perde imediatamente suas permissões. Evidência: A/B/N.
- [x] O novo host recebe imediatamente suas permissões. Evidência: A/B/N.
- [x] Quando o host sai, outro participante assume automaticamente. Evidência: A/B/N.
- [x] O novo host mantém as configurações da sala. Evidência: A/B/N.
- [x] Um participante comum não consegue executar ações administrativas enviando eventos Socket.IO diretamente. Evidência: A/B/N.
- [x] Validar autorização no backend, nunca apenas no frontend. Evidência: A/B/N.

### 3. Votação

- [x] Todos visualizam as mesmas cartas disponíveis. Evidência: A/N.
- [x] Cada participante consegue selecionar uma carta. Evidência: A/N.
- [x] O participante pode alterar o voto antes da revelação. Evidência: A/N.
- [x] A seleção de um participante não interfere na seleção dos demais. Evidência: A/N.
- [x] Antes da revelação, ninguém consegue visualizar os valores dos votos alheios. Evidência: A/N.
- [x] O status de quem já votou é sincronizado em tempo real. Evidência: A/N.
- [x] Apenas o host pode revelar os votos. Evidência: A/N.
- [x] Todos recebem os votos revelados simultaneamente. Evidência: A/N.
- [x] Um participante que entra após a revelação recebe o estado correto. Evidência: A/N.
- [x] Reiniciar uma rodada limpa todos os votos. Evidência: A/N.
- [x] Reiniciar uma rodada oculta novamente os resultados. Evidência: A/N.
- [x] Um voto antigo não aparece na rodada seguinte. Evidência: A/N.
- [x] O backend rejeita votos com valores fora do deck. Evidência: A/N.
- [x] Eventos atrasados de uma rodada anterior não alteram o estado da rodada atual. Evidência: A/N.
- [x] Participantes desconectados não provocam inconsistências na votação. Evidência: A/N.

### 4. Configuração do deck

- [x] Apenas o host pode alterar o deck. Evidência: A/B/N.
- [x] O deck padrão é carregado corretamente. Evidência: A/B/N.
- [x] Os presets funcionam conforme implementados. Evidência: A/B/N.
- [x] É possível configurar cartas personalizadas. Evidência: A/B/N.
- [x] São aceitos valores decimais com ponto, como 0.5. Evidência: A/B/N.
- [x] Os valores são separados por vírgula. Evidência: A/B/N.
- [x] Espaços excedentes são tratados corretamente. Evidência: A/B/N.
- [x] Valores vazios são rejeitados. Evidência: A/B/N.
- [x] Valores duplicados são rejeitados. Evidência: A/B/N.
- [x] A prévia das cartas corresponde à configuração. Evidência: A/B/N.
- [x] Todos recebem a alteração em tempo real. Evidência: A/B/N.
- [x] Participantes que entram depois recebem o deck atual. Evidência: A/B/N.
- [x] Alterar o deck reinicia a votação, quando necessário. Evidência: A/B/N.
- [x] Salvar um deck idêntico não reinicia desnecessariamente a votação. Evidência: A/B/N.
- [x] A transferência de host não modifica o deck. Evidência: A/B/N.
- [x] Um participante comum não consegue alterar o deck enviando eventos diretamente ao backend. Evidência: A/B/N.

### 5. Reações com emojis

- [x] Um participante consegue enviar uma reação. Evidência: A/B/N.
- [x] Todos os participantes recebem a reação em tempo real. Evidência: A/B/N.
- [x] O emoji é associado ao participante correto, quando aplicável. Evidência: A/B/N.
- [x] Emojis simultâneos de participantes diferentes funcionam. Evidência: A/B/N.
- [x] Reações não modificam votos ou configurações. Evidência: A/B/N.
- [x] Emojis inválidos ou payloads inesperados não provocam erros no servidor. Evidência: A/B/N.
- [x] Reações não ficam permanentemente visíveis após o período previsto pela implementação. Evidência: A/B/N.

### 6. Conexão e sincronização

- [x] Dois participantes entrando simultaneamente. Evidência: A/N.
- [x] Cinco participantes votando simultaneamente. Evidência: A/N.
- [x] Dois participantes escolhendo cartas diferentes no mesmo instante. Evidência: A/N.
- [x] Host revelando votos enquanto outro participante vota. Evidência: A/N.
- [x] Host saindo durante a votação. Evidência: A/N.
- [x] Participante reconectando após queda de rede. Evidência: A/N.
- [x] Participante atualizando a página. Evidência: A/N.
- [x] Duas abas tentando utilizar a mesma identidade. Evidência: A/N.
- [x] Participante entrando com votação em andamento. Evidência: A/N.
- [x] Participante entrando com votos revelados. Evidência: A/N.
- [x] Host transferindo sua função durante uma votação. Evidência: A/N.
- [x] Alteração de deck durante uma rodada. Evidência: A/N.
- [x] Último participante encerrando sua sessão. Evidência: A/N.

### 7. Interface e responsividade

- [x] Layout em desktop. Evidência: N/B.
- [ ] **PARCIAL** — Layout em telas menores e dispositivos móveis. N; viewport exercitado, touch físico pendente (pendência 1).
- [x] Cartas não ultrapassam a largura da tela. Evidência: N/B.
- [x] Lista de participantes permanece legível. Evidência: N/B.
- [x] Botões exclusivos do host são exibidos corretamente. Evidência: N/B.
- [x] Interface atualiza sem precisar recarregar a página. Evidência: N/B.
- [x] Mensagens de erro são compreensíveis. Evidência: N/B.
- [x] Estado de conexão/desconexão possui feedback adequado. Evidência: N/B.
- [ ] **PARCIAL** — Não existem erros inesperados no console. N; diagnóstico MutationObserver no frame ainda sem origem confirmada (pendência 2).
- [x] Não existem avisos relevantes do Vue. Evidência: N/B.
- [x] Teclado e controles básicos permanecem utilizáveis. Evidência: N/B.

### 8. Docker e execução

- [x] Docker Compose constrói os serviços corretamente. Evidência: D/N.
- [x] Frontend inicia sem erros. Evidência: D/N.
- [x] Backend inicia sem erros. Evidência: D/N.
- [x] Frontend conecta ao Socket.IO. Evidência: D/N.
- [x] Os serviços se comunicam corretamente na rede Docker. Evidência: D/N.
- [x] Os volumes não sobrescrevem dependências de forma incorreta. Evidência: D/N.
- [x] O hot reload funciona durante o desenvolvimento. Evidência: D/N.
- [x] Reiniciar containers não provoca erros inesperados. Evidência: D/N.
- [x] O projeto sobe seguindo as instruções do README. Evidência: D/N.
- [ ] **PARCIAL** — Não existem configurações locais ou caminhos absolutos impedindo a execução em outra máquina. D; outra máquina não executada, endpoint/CORS localhost (pendência 3).

### 9. Qualidade e segurança

- [x] Validar payloads recebidos nos eventos Socket.IO. Evidência: A/B/N/D.
- [x] Tratar salas inexistentes. Evidência: A/B/N/D.
- [x] Tratar participantes inexistentes. Evidência: A/B/N/D.
- [x] Rejeitar ações não autorizadas. Evidência: A/B/N/D.
- [x] Impedir que um cliente altere o estado de outro participante indevidamente. Evidência: A/B/N/D.
- [x] Garantir que informações secretas da votação não sejam enviadas antes da revelação. Evidência: A/B/N/D.
- [x] Tratar eventos duplicados e fora de ordem. Evidência: A/B/N/D.
- [x] Evitar listeners duplicados no frontend. Evidência: A/B/N/D.
- [x] Remover listeners e recursos quando componentes forem desmontados. Revisão 09/10: três testes com hooks reais Vue e recursos instrumentados, 100 ciclos cada; DOM/layout simulado, conforme limites no relatório de encerramento.
- [x] Verificar erros não tratados e possíveis vazamentos de memória. Revisão 09/10: soak de três minutos, 1.083 salas, contagens após limpeza iguais a zero e memória estabilizada; não certifica ausência geral de vazamentos, conforme relatório de encerramento.
- [x] Executar build de produção e testes existentes. Evidência: A/B/N/D.


