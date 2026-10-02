<script setup>
import CartaParticipante from '../components/CartaParticipante.vue'
import CampoTexto from '../components/CampoTexto.vue'
import BotaoBase from '../components/BotaoBase.vue'
import MensagemErro from '../components/MensagemErro.vue'
import MarcaApp from '../components/MarcaApp.vue'
import StatusConexao from '../components/StatusConexao.vue'
import { Copy, LogOut, Settings, Play, Eye, RotateCcw } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useParticipanteStore } from '../stores/participante'
import { useSalaStore } from '../stores/sala'
import { useReacoes } from '../composables/useReacoes'
import { usePreferenciasReacoes } from '../composables/usePreferenciasReacoes'

const route = useRoute()
const router = useRouter()
async function sair() { if (await sala.sair()) router.push('/') }
const participante = useParticipanteStore()
const sala = useSalaStore()
const mesa = ref(null)
function obterTrajeto(reacao) {
  const cartas = Array.from(mesa.value?.querySelectorAll('[data-participant-id]') ?? [])
  const localizar = id => cartas.find(carta => carta.dataset.participantId === id)
    ?.querySelector('.participant-card__vote')?.getBoundingClientRect()
  const origem = localizar(reacao.fromParticipantId)
  const alvo = localizar(reacao.targetParticipantId)
  if (!origem || !alvo) return null
  return {
    x: origem.left + origem.width / 2 - alvo.left - alvo.width / 2,
    y: origem.top + origem.height / 2 - alvo.top - alvo.height / 2,
  }
}
const { emojisRapidos, registrarUso } = usePreferenciasReacoes()
const { reacoesAtivas, emCooldown, reagir } = useReacoes(sala, obterTrajeto, registrarUso)
const seletorReacao = ref(null)
function abrirSeletor(id, modo = 'rapido', interacao = 'click') {
  if (interacao === 'hover' && seletorReacao.value?.modo === 'completo') return
  seletorReacao.value = { participantId: id, modo }
}
function fecharSeletor(id) {
  if (seletorReacao.value?.participantId === id) seletorReacao.value = null
}
watch(() => [sala.codigo, sala.connected, sala.me?.id], () => { seletorReacao.value = null })
watch(() => sala.participants.map(p => p.id), ids => {
  if (seletorReacao.value && !ids.includes(seletorReacao.value.participantId)) seletorReacao.value = null
})
const mensagemCopia = ref('')
const nome = ref(participante.nome)
const erro = ref('')
// CSS wraps two balanced rails; no layouts specific to participant counts.
const lugares = computed(() => {
  const metade = Math.ceil(sala.participants.length / 2)
  return [sala.participants.slice(0, metade), sala.participants.slice(metade)]
})
const codigo = computed(() => String(route.params.codigo).trim().toUpperCase())
const estaNaSala = computed(() => sala.codigo === codigo.value && Boolean(sala.me))

async function entrar() {
  erro.value = ''
  if (!await sala.joinRoom(codigo.value, nome.value)) erro.value = sala.error?.message ?? ''
}

async function transferirHost(pessoa) {
  if (window.confirm(`Transferir host para ${pessoa.name}?`)) {
    await sala.transferirHost(pessoa.id)
  }
}

async function copiarCodigo() {
  try {
    await navigator.clipboard.writeText(codigo.value)
    mensagemCopia.value = 'Código copiado!'
  } catch {
    mensagemCopia.value =
      'Não foi possível copiar. Selecione o código e copie manualmente.'
  }
}

</script>

<template>
  <main class="mx-auto max-w-[1320px] px-9 pb-10 [@media(max-width:700px)]:px-4 [@media(max-width:700px)]:pb-7">
    <header class="flex min-h-[100px] flex-wrap items-center gap-[22px] border-b border-line py-[22px] [@media(max-width:700px)]:gap-x-3 [@media(max-width:700px)]:gap-y-[18px]">
      <MarcaApp class="flex min-w-0 items-center gap-3 [&_h1]:text-[1.15rem] [&_h1]:whitespace-nowrap" titulo />
      <div class="ml-[18px] flex min-w-0 items-center gap-3 text-[0.8rem] text-[#d7dbea] [&_strong]:font-mono [&_strong]:text-base [&_strong]:font-semibold [&_strong]:tracking-[0.1em] [&_strong]:text-[#ded4ff] [&_strong]:[overflow-wrap:anywhere] [&_strong]:select-all [@media(max-width:1000px)]:ml-0 [@media(max-width:700px)]:order-3 [@media(max-width:700px)]:w-full [@media(max-width:700px)]:flex-wrap">
        <span>Sala</span>
        <strong>{{ codigo }}</strong>
        <BotaoBase variante="quiet" type="button" tamanho="small" @click="copiarCodigo">
          <Copy :size="16" aria-hidden="true" /> Copiar código
        </BotaoBase>
      </div>
      <div class="ml-auto flex min-w-0 items-center gap-3 text-[0.85rem] [@media(max-width:700px)]:flex-wrap">
        <template v-if="estaNaSala">
          <span class="[overflow-wrap:anywhere]">{{ participante.nome }}</span>
          <span v-if="sala.ehHost" class="rounded-md border border-[#5e477e] bg-[#34274e] px-2 py-1 text-[0.65rem] text-[#cebaff]">Host</span>
        </template>
        <BotaoBase v-if="estaNaSala" variante="quiet" type="button" :disabled="sala.pending || !sala.connected || sala.restoring" @click="sair"><LogOut :size="16" aria-hidden="true" /> Sair da sala</BotaoBase>
      </div>
    </header>
    <p class="mt-2 text-[0.8rem] empty:hidden" role="status">{{ mensagemCopia }}</p>
    <form v-if="!estaNaSala" class="rounded-[22px] border border-line bg-surface shadow-[0_20px_70px_#00000020] mx-auto my-[60px] max-w-[470px] p-[30px] [overflow-wrap:anywhere] [&_h2]:mb-3" @submit.prevent="entrar">
      <span class="mb-3 block text-[0.68rem] font-bold tracking-[0.16em] text-accent">SEU LUGAR À MESA</span>
      <h2>Entre na sala {{ codigo }}</h2>
      <p>Informe seu nome para entrar nesta sala.</p>
      <CampoTexto
        id="nomeDireto" label="Seu nome"
        v-model="nome"
        autocomplete="given-name"
        maxlength="60"
        required
        aria-describedby="erro-direto"
      />
      <MensagemErro id="erro-direto">{{ erro || sala.error?.message }}</MensagemErro>
      <BotaoBase variante="primary" class="mt-[22px] w-full" type="submit" :disabled="sala.pending || !sala.connected">Entrar</BotaoBase>
    </form>
    <template v-else>
      <div class="flex items-center justify-between room-intro gap-4 pt-5 pb-4 [&_h2]:mb-2 [&_h2]:text-[clamp(1.5rem,3vw,2rem)] [&_p]:text-[0.9rem] [@media(max-width:700px)]:flex-col [@media(max-width:700px)]:items-start [@media(max-width:700px)]:pt-4">
        <div>
          <span class="mb-3 block text-[0.68rem] font-bold tracking-[0.16em] text-accent">ESPAÇO DO TIME</span>
          <h2>Uma carta, uma perspectiva.</h2>
          <p>Convide seu time usando o código da sala.</p>
        </div>
        <StatusConexao class="rounded-[30px] border border-[#322d41] bg-[#1b1926] px-3 py-2 text-[0.72rem] whitespace-nowrap text-[#b7afcd]" :conectado="sala.connected" />
      </div>
      <div class="room-layout">
        <section ref="mesa" class="poker-table" aria-label="Mesa de Planning Poker">
          <div v-for="(grupo, indice) in lugares" :key="indice" class="poker-table__rail" :class="indice === 0 ? 'poker-table__rail--top' : 'poker-table__rail--bottom'">
            <CartaParticipante v-for="pessoa in grupo" :key="pessoa.id"
              :pessoa="pessoa" :atual="pessoa.id === participante.id" :host="pessoa.id === sala.hostId"
              :revelada="sala.status === 'revelada'" :voto="sala.room.votacao.votos[pessoa.id]"
              :pode-transferir="sala.ehHost && pessoa.id !== sala.hostId"
              :bloqueado="sala.pending || !sala.connected || sala.restoring"
              :reacoes="reacoesAtivas.filter(r => r.targetParticipantId === pessoa.id)"
              :emojis-rapidos="emojisRapidos"
              :seletor-aberto="seletorReacao?.participantId === pessoa.id && seletorReacao.modo === 'rapido'"
              :picker-aberto="seletorReacao?.participantId === pessoa.id && seletorReacao.modo === 'completo'"
              :reacao-bloqueada="emCooldown || !sala.connected || sala.restoring"
              @abrir-reacoes="abrirSeletor(pessoa.id, 'rapido', $event)"
              @abrir-picker="abrirSeletor(pessoa.id, 'completo')"
              @fechar-reacoes="fecharSeletor(pessoa.id)"
              @reagir="reagir(pessoa.id, $event)"
              @transferir="transferirHost(pessoa)" />
          </div>
          <div class="round-control">
            <p v-if="!sala.ehHost" role="status">{{ sala.status === 'aguardando' ? 'Aguardando o host iniciar.' : sala.status === 'votando' ? 'Aguardando revelação.' : 'Votos revelados.' }}</p>
            <BotaoBase v-if="sala.ehHost" type="button" variante="primary"
              :disabled="sala.pending || !sala.connected || sala.restoring"
              @click="sala.status === 'votando' ? sala.revelarVotos() : sala.iniciarVotacao()">
              <component :is="sala.status === 'votando' ? Eye : sala.status === 'revelada' ? RotateCcw : Play" :size="16" aria-hidden="true" />
              {{ sala.status === 'votando' ? 'Revelar votos' : sala.status === 'revelada' ? 'Nova rodada' : 'Iniciar votação' }}
            </BotaoBase>
          </div>

        </section>
        <section class="voting-deck panel" aria-labelledby="titulo-votacao">
          <header class="voting-deck__header">
            <div>
              <span class="mb-3 block text-[0.68rem] font-bold tracking-[0.16em] text-accent">SUA ESTIMATIVA</span>
              <h2 id="titulo-votacao">Escolha uma carta</h2>
              <p>Quanto esforço essa tarefa precisa?</p>
            </div>
            <BotaoBase
              v-if="sala.ehHost"
              class="voting-deck__settings"
              variante="icon"
              tamanho="icon"
              type="button"
              aria-label="Configurações da sala — disponível em uma próxima etapa"
              disabled title="Configurações — disponível em uma próxima etapa"
            >
              <Settings :size="16" aria-hidden="true" />
            </BotaoBase>
          </header>
          <div class="voting-deck__cards" role="group" aria-label="Cartas de estimativa">
            <button
              v-for="carta in sala.cartas"
              :key="carta"
              type="button"
              class="voting-deck__card relative flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1 rounded-[10px] border px-2 py-2 [overflow-wrap:anywhere] transition-[transform,background,border-color] duration-150 hover:-translate-y-[5px] motion-reduce:transition-none [&_strong]:max-w-full [&_strong]:text-[1.3rem] [&_strong]:font-semibold"
              :aria-label="`Carta ${carta}`"
              :class="sala.meuVoto === carta ? '-translate-y-[5px] border-[#d7c9ff] bg-accent text-[#241735] shadow-[0_8px_24px_#a582ff22]' : 'border-[#414961] bg-[linear-gradient(145deg,#242838,#1a1e2b)] text-[#d2d7ea] hover:border-[#a28ace]'"
              :aria-pressed="sala.meuVoto === carta"
              :disabled="sala.status !== 'votando' || sala.pending || !sala.connected || sala.restoring"
              @click="sala.votar(carta)"
            >
              <strong>{{ carta }}</strong>
              <span class="text-[0.85rem] opacity-55" aria-hidden="true">♠</span>
            </button>
          </div>
          <p v-if="sala.resultado" class="voting-deck__note" role="status">
            {{ sala.resultado.quantidade }} voto(s).
            Média numérica: {{ sala.resultado.media === null ? '—' : sala.resultado.media.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) }}.
          </p>
          <p v-else class="voting-deck__note">Seu voto é visível para você. Os demais só o verão após a revelação.</p>
          <MensagemErro v-if="sala.error">{{ sala.error.message }}</MensagemErro>
        </section>
      </div>
    </template>
  </main>
</template>

<style scoped>
.room-intro .mb-3 { margin-bottom: 6px; }
.room-layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  grid-template-areas: 'deck table';
  align-items: start;
  gap: 20px;
  min-width: 0;
}
.voting-deck { position: relative; grid-area: deck; min-width: 0; padding: 16px; }
.voting-deck__settings { position: absolute; top: 8px; right: 8px; }
.voting-deck__header { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.voting-deck__header h2 { margin-bottom: 4px; font-size: 1.15rem; }
.voting-deck__header p { font-size: .8rem; }
.voting-deck__header .mb-3 { margin-bottom: 4px; padding-right: 28px; }
.voting-deck__note { margin-top: 6px; font-size: .68rem; color: #969db2; line-height: 1.5; }
.poker-table { grid-area: table; min-width: 0; display: grid; grid-template-areas: 'top' 'center' 'bottom'; gap: 16px; padding: 12px; border: 1px solid #514367; border-radius: 32px; background: radial-gradient(ellipse at center, #302842, #181b29 75%); box-shadow: inset 0 0 0 7px #ffffff03, 0 20px 70px #00000020; }
.poker-table__rail { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px 20px; min-width: 0; }
.poker-table__rail--top { grid-area: top; }
.poker-table__rail--bottom { grid-area: bottom; }
.poker-table__rail:empty { display: none; }
.round-control {
  grid-area: center;
  justify-self: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: min(100%, 250px);
  min-height: 64px;
  padding: 8px 12px;
  border: 1px solid #b9a4ff24;
  border-radius: 14px;
  background: #0c0e152e;
  text-align: center;
}
.round-control p { font-size: .82rem; }
.voting-deck__cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 12px 0 8px; }
.voting-deck__card { width: 100%; }
.voting-deck__card[aria-pressed='true']:disabled { opacity: 1; }
@media (max-width: 900px) {
  .room-layout { grid-template-columns: minmax(0, 1fr); grid-template-areas: 'table' 'deck'; gap: 16px; }
  .voting-deck__cards { grid-template-columns: repeat(auto-fit, minmax(54px, 64px)); justify-content: center; }
}
@media (max-width: 700px) {
  .poker-table { padding: 12px; gap: 16px; border-radius: 26px; }
  .poker-table__rail { gap: 12px 8px; }
  .round-control { min-height: 60px; }
  .voting-deck__cards { gap: 10px; }

}
</style>
