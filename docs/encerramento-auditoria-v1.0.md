# Encerramento da auditoria v1.0 — 09/10/2026

**Resultado: APROVADO COM RESSALVAS.** Dois dos cinco critérios parciais da auditoria anterior foram resolvidos no escopo automatizado. A homologação integral ainda depende de reprodução manual do erro de console, touch físico e execução em outra máquina. Nenhum defeito adicional da aplicação foi reproduzido; nenhum código de produção foi alterado nesta revisão.

## Desmontagem de componentes — resolvida no escopo dos testes

Foram adicionados três testes em `frontend/test/desmontagem.test.js`, incluídos em `npm test`. Eles compilam os SFCs existentes e usam o renderer e os hooks reais do Vue, com doubles de DOM/layout e instrumentação de recursos globais. Cada caso executa 100 ciclos:

- CartaParticipante + SeletorReacao + EmojiPickerPopover: observers, pointerdown, pointermove, resize, scroll com capture, requestAnimationFrame e nós de Teleport são liberados após a troca/desmontagem.
- Desmontagem imediata, antes de nextTick: nenhum foco ou posicionamento tardio é agendado.
- Componente com useReacoes: timers de expiração/cooldown, assinatura e watchers são limpos; mudanças posteriores da sala não executam o watcher desmontado.

Os testes verificam recursos ativos antes e contagem zero após cada desmontagem. Não usam snapshots nem reproduzem o código de cleanup. Não são uma medição de retenção de objetos DOM no heap de um navegador real.

## Uso prolongado e memória — resolvidos no ensaio executado

Comando, a partir da raiz:

```powershell
node --expose-gc backend/audit/soak.cjs --duration=180000 --output=docs/soak-v1.0.json
```

O servidor isolado usa as implementações existentes de repositório, eventos e reações. Três salas são exercitadas simultaneamente, com cinco pessoas cada. O ciclo cria/entra, vota, revela, transmite reações, substitui uma conexão, reconecta outra pessoa, inicia nova rodada e combina saída explícita com abandono. O servidor usa porta efêmera; não toca salas de uso normal.

Resultados da execução de 180.274 ms:

- 361 lotes; 1.083 salas criadas e destruídas.
- 7.581 clientes Socket.IO criados; 2.166 substituições/reentradas.
- 5.415 reações aceitas, com 27.075 entregas verificadas aos cinco clientes.
- Após cada lote: zero salas conhecidas, sockets, conexões Engine.IO, salas do adapter e timers de saída ativos. Cada remoção de sala também é confirmada por ROOM_NOT_FOUND no repositório real.
- 20 amostras de memória após GC; listeners de HTTP/Socket.IO/Engine.IO/namespace iguais em todas as amostras.
- Heap usado: 12.560.256 → 13.008.144 bytes; aumento de 447.888 bytes (0,43 MiB). Nas cinco últimas amostras, variação de apenas 5.120 bytes.
- RSS: 77.004.800 → 93.794.304 bytes; aumento de 16.789.504 bytes (16,01 MiB). Nas cinco últimas amostras, faixa de 421.888 bytes. External/ArrayBuffers terminaram estáveis em 4.311.530/294.015 bytes.

O heap e o RSS estabilizaram após aquecimento; não houve crescimento persistente dos recursos contados nem sinal de retenção progressiva no heap neste ensaio. RSS inclui memória reservada por V8/alocador e não precisa voltar ao valor inicial após GC. O ensaio não demonstra ausência de todos os vazamentos possíveis ou estabilidade durante horas/dias. A tolerância de abandono foi reduzida para 75 ms no servidor de teste, permitindo repetir a rotina de limpeza muitas vezes; o prazo de produção de 60 segundos permanece inalterado. Os clientes usam WebSocket; polling e reconexão automática continuam cobertos pela regressão anterior.

Métricas brutas: [soak-v1.0.json](soak-v1.0.json). O teste falha com recursos remanescentes, listeners finais diferentes ou aumento substancial do heap pós-GC (> maior valor entre 2 MiB e 20% da primeira amostra). As métricas intermediárias também foram comparadas nesta revisão.

## MutationObserver — investigação avançou, origem ainda pendente

Não existem chamadas MutationObserver nas fontes da aplicação. A busca completa, incluindo arquivos ignorados de node_modules, identificou essas chamadas no runtime Vue: useCssVars observa o pai da raiz; custom elements observam o próprio elemento. A aplicação não usa useCssVars, CSS v-bind ou defineCustomElement nos arquivos examinados. Esses caminhos do Vue não permaneceram no bundle de produção.

O bundle de produção contém uma chamada do polyfill modulepreload do Vite, que observa `document` quando o navegador não suporta modulepreload. Esse alvo é um Document válido em execução normal; não se reproduziu a passagem de um alvo inválido nesse código. A presença dessas chamadas em dependências não permite atribuir a ocorrência anterior ao Vue ou ao Vite.

Não foi possível repetir a interação visual nesta revisão: duas tentativas de inicialização do navegador expiraram. O launcher restrito do terminal também apresentou CreateProcessSecurityEnvironment/HRESULT 0x800700E1; comandos de testes foram recuperados por execução autorizada fora desse launcher. Esta falha atual do ambiente não prova que o erro MutationObserver anterior tenha a mesma origem.

Foi preparado `frontend/audit/mutation-observer.html`, separado da entrada/build da aplicação. A fixture importa o main.js existente, preserva a exceção original e registra pilha, chamador e alvo de observe inválido. Também captura error/unhandledrejection e recarrega a aplicação em iframe vinte vezes, por botão próprio, sem depender de comandos de automação. A sintaxe foi verificada, mas a fixture não foi executada num navegador nesta revisão.

Reprodução manual necessária:

1. Com o frontend de desenvolvimento ativo, abrir diretamente em Chrome/Edge `http://localhost:5173/audit/mutation-observer.html`, fora do navegador de automação.
2. Exercitar criação/entrada, votação, cartas e pickers na página principal; conferir o console e o painel de erros.
3. Usar “Recarregar a aplicação em iframe 20 vezes” e repetir o fluxo em iframe quando necessário. Guardar a pilha caso o erro apareça.
4. Comparar com a aplicação normal e com o preview de produção. Uma pilha é necessária para classificar aplicação, dependência, extensão ou ambiente de automação.

Não foi ocultado o erro, alterada dependência ou aplicada correção especulativa. O critério de console continua parcial.

## Regressão, build e conclusão

- Backend: **25/25** testes passaram.
- Frontend: **20/20** testes passaram, incluindo os três novos.
- Total: **45/45**, zero falhas, cancelamentos ou testes pulados.
- Build Vite de produção: passou, 1.793 módulos transformados.
- Soak: passou; executado separadamente, não contado como teste unitário adicional.

Os dois critérios sobre cleanup e ensaio de vazamentos agora têm evidência automatizada: a matriz passa de 101/106 aprovados e cinco parciais para **103/106 aprovados e três parciais**, respeitando os limites descritos acima. Permanecem manuais: console/MutationObserver, touch em dispositivos móveis físicos e checkout/execução em outra máquina.

A aplicação passou pela validação técnica automatizada disponível e pode seguir para homologação final da v1.0. Não considero a v1.0 integralmente homologada enquanto essas três ressalvas permanecerem. Não há novo defeito confirmado da aplicação bloqueando os cenários executados.
