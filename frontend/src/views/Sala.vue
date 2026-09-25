<script setup>
import CampoTexto from '../components/CampoTexto.vue'
import BotaoBase from '../components/BotaoBase.vue'
import MensagemErro from '../components/MensagemErro.vue'
import MarcaApp from '../components/MarcaApp.vue'
import StatusConexao from '../components/StatusConexao.vue'
import { ArrowRightLeft, Copy, LogOut, Settings, Play, Eye, RotateCcw } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useParticipanteStore } from '../stores/participante'
import { useSalaStore } from '../stores/sala'

const route = useRoute()
const router = useRouter()
async function sair() { if (await sala.sair()) router.push('/') }
const participante = useParticipanteStore()
const sala = useSalaStore()
const mensagemCopia = ref('')
const nome = ref(participante.nome)
const erro = ref('')
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
      <div class="flex items-center justify-between gap-5 pt-10 pb-7 [&_h2]:mb-2 [&_h2]:text-[clamp(1.5rem,3vw,2rem)] [&_p]:text-[0.9rem] [@media(max-width:700px)]:flex-col [@media(max-width:700px)]:items-start [@media(max-width:700px)]:pt-7">
        <div>
          <span class="mb-3 block text-[0.68rem] font-bold tracking-[0.16em] text-accent">ESPAÇO DO TIME</span>
          <h2>Uma carta, uma perspectiva.</h2>
          <p>Convide seu time usando o código da sala.</p>
        </div>
        <StatusConexao class="rounded-[30px] border border-[#322d41] bg-[#1b1926] px-3 py-2 text-[0.72rem] whitespace-nowrap text-[#b7afcd]" :conectado="sala.connected" />
      </div>
      <div class="grid grid-cols-[265px_minmax(0,1fr)] items-start gap-6 [@media(max-width:1000px)]:grid-cols-[220px_minmax(0,1fr)] [@media(max-width:1000px)]:gap-[18px] [@media(max-width:700px)]:grid-cols-1">
        <aside class="rounded-[22px] border border-line bg-surface shadow-[0_20px_70px_#00000020] px-5 py-6 [@media(max-width:700px)]:py-5">
          <div class="flex items-center justify-between [&_h2]:text-[0.95rem]">
            <h2>Participantes</h2>
            <span class="rounded-[7px] bg-[#292c3c] px-[9px] py-[3px] text-[0.72rem] text-[#c9c9df]">{{ sala.participants.length }}</span>
          </div>
          <ul class="my-6 list-none p-0 [@media(max-width:700px)]:my-[14px]">
            <li
              v-for="pessoa in sala.participants"
              :key="pessoa.id"
              class="flex items-start gap-3 border-t border-line py-[15px]"
            >
              <span class="grid size-[38px] shrink-0 place-items-center rounded-xl border border-[#534269] bg-[#332b49] text-[#d3baff]">
                {{ pessoa.name.slice(0, 1).toUpperCase() }}
              </span>
              <div class="flex min-w-0 flex-1 flex-col gap-0.5 [&_strong]:text-[0.88rem] [&_strong]:[overflow-wrap:anywhere]">
                <strong>{{ pessoa.name }}</strong>
                <small>
                  {{ pessoa.id === participante.id ? 'Você' : 'Participante' }}
                  <span v-if="pessoa.id === sala.hostId">· Host</span>
                </small>
                <span class="mt-2 text-[0.72rem]" :class="pessoa.votou ? 'text-[#8bdfbe]' : 'text-[#a4adc4]'">
                  {{ sala.status === 'revelada' ? (pessoa.votou ? `Voto: ${sala.room.votacao.votos[pessoa.id]}` : 'Não votou') : (pessoa.votou ? '✓ Votou' : '◷ Aguardando') }}
                </span>
              </div>
                <BotaoBase v-if="sala.ehHost && pessoa.id !== sala.hostId"
                  variante="icon" tamanho="icon" type="button"
                  :title="`Transferir host para ${pessoa.name}`"
                  :aria-label="`Transferir host para ${pessoa.name}`"
                  :disabled="sala.pending || !sala.connected || sala.restoring"
                  @click="transferirHost(pessoa)">
                  <ArrowRightLeft :size="16" aria-hidden="true" />
                </BotaoBase>
            </li>
          </ul>
          <p class="border-t border-line pt-[18px] text-[0.73rem] [@media(max-width:700px)]:pt-3">
            Participantes e votos são sincronizados em tempo real.
          </p>
        </aside>
        <section class="rounded-[22px] border border-line bg-surface shadow-[0_20px_70px_#00000020] p-8 [@media(max-width:1000px)]:p-6 [@media(max-width:700px)]:px-5" aria-labelledby="titulo-votacao">
          <header class="flex items-center justify-between gap-5 [&_h2]:mb-2 [&_h2]:text-2xl [&_p]:text-[0.85rem] [@media(max-width:1000px)]:flex-col [@media(max-width:1000px)]:items-start">
            <div>
              <span class="mb-3 block text-[0.68rem] font-bold tracking-[0.16em] text-accent">SUA ESTIMATIVA</span>
              <h2 id="titulo-votacao">Escolha uma carta</h2>
              <p>Quanto esforço essa tarefa precisa?</p>
            </div>
            <BotaoBase
              v-if="sala.ehHost"

              variante="quiet"
              type="button"
              disabled title="Disponível em uma próxima etapa"
            >
              <Settings :size="16" aria-hidden="true" /> Configurações
            </BotaoBase>
          </header>
          <div class="mt-[38px] mb-[30px] grid grid-cols-5 gap-[14px] [@media(max-width:1000px)]:grid-cols-3 [@media(max-width:700px)]:mt-7 [@media(max-width:700px)]:gap-3" role="group" aria-label="Cartas de estimativa">
            <button
              v-for="carta in sala.cartas"
              :key="carta"
              type="button"
              class="relative flex min-h-[135px] min-w-0 flex-col items-center justify-center gap-2.5 rounded-[13px] border px-2 pt-[30px] pb-[18px] [overflow-wrap:anywhere] transition-[transform,background,border-color] duration-150 hover:-translate-y-[5px] motion-reduce:transition-none [&_strong]:max-w-full [&_strong]:text-[1.9rem] [&_strong]:font-semibold [@media(max-width:700px)]:min-h-[120px]"
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
          <div class="flex items-center justify-between gap-4 border-t border-line pt-6 [&_p]:text-[0.8rem] [@media(max-width:700px)]:flex-col [@media(max-width:700px)]:items-stretch">
            <p role="status">{{ sala.status === 'aguardando' ? 'Aguardando o host iniciar.' : sala.status === 'votando' ? 'Votação em andamento. Você pode alterar sua carta.' : 'Votos revelados.' }}</p>
            <BotaoBase v-if="sala.ehHost" type="button" variante="primary"
              :disabled="sala.pending || !sala.connected || sala.restoring"
              @click="sala.status === 'votando' ? sala.revelarVotos() : sala.iniciarVotacao()">
              <component :is="sala.status === 'votando' ? Eye : sala.status === 'revelada' ? RotateCcw : Play" :size="16" aria-hidden="true" />
              {{ sala.status === 'votando' ? 'Revelar votos' : sala.status === 'revelada' ? 'Nova votação' : 'Iniciar votação' }}
            </BotaoBase>
          </div>
          <p v-if="sala.resultado" class="mt-6 text-[0.72rem]" role="status">
            {{ sala.resultado.quantidade }} voto(s).
            Média numérica: {{ sala.resultado.media === null ? '—' : sala.resultado.media.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) }}.
          </p>
          <p v-else class="mt-6 text-[0.72rem]">Os votos permanecem privados até o host revelar.</p>
          <MensagemErro v-if="sala.error">{{ sala.error.message }}</MensagemErro>
        </section>
      </div>
    </template>
  </main>
</template>
