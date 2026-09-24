<script setup>
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
  <main class="sala">
    <header class="sala__header">
      <div class="sala__brand">
        <span class="brand-mark" aria-hidden="true">♠</span>
        <h1>Planning Poker</h1>
      </div>
      <div class="sala__codigo">
        <span>Sala</span>
        <strong>{{ codigo }}</strong>
        <button class="btn btn-quiet" type="button" @click="copiarCodigo">
          Copiar código
        </button>
      </div>
      <div class="sala__usuario">
        <template v-if="estaNaSala">
          <span class="user-name">{{ participante.nome }}</span>
          <span v-if="sala.ehHost" class="badge">Host</span>
        </template>
        <button v-if="estaNaSala" class="btn btn-quiet" type="button" :disabled="sala.pending || !sala.connected || sala.restoring" @click="sair">Sair</button>
      </div>
    </header>
    <p class="copy-feedback" role="status">{{ mensagemCopia }}</p>
    <form v-if="!estaNaSala" class="join-panel panel" @submit.prevent="entrar">
      <span class="eyebrow">SEU LUGAR À MESA</span>
      <h2>Entre na sala {{ codigo }}</h2>
      <p>Informe seu nome para entrar nesta sala.</p>
      <div class="form-group">
        <label for="nomeDireto">Seu nome</label>
        <input
          id="nomeDireto"
          v-model="nome"
          autocomplete="given-name"
          maxlength="60"
          required
          aria-describedby="erro-direto"
        />
      </div>
      <p id="erro-direto" class="form-error" role="alert">{{ erro || sala.error?.message }}</p>
      <button class="btn btn-primary" type="submit" :disabled="sala.pending || !sala.connected">Entrar</button>
    </form>
    <template v-else>
      <div class="sala__intro">
        <div>
          <span class="eyebrow">ESPAÇO DO TIME</span>
          <h2>Uma carta, uma perspectiva.</h2>
          <p>Convide seu time usando o código da sala.</p>
        </div>
        <span class="local-label">
          <span class="status-dot"></span>
          {{ sala.connected ? 'Conectado' : 'Sem conexão' }}
        </span>
      </div>
      <div class="sala__content">
        <aside class="participantes panel">
          <div class="participantes__header">
            <h2>Participantes</h2>
            <span class="count">{{ sala.participants.length }}</span>
          </div>
          <ul class="participantes__lista">
            <li
              v-for="pessoa in sala.participants"
              :key="pessoa.id"
              class="participante"
            >
              <span class="participante__avatar">
                {{ pessoa.name.slice(0, 1).toUpperCase() }}
              </span>
              <div class="participante__info">
                <strong>{{ pessoa.name }}</strong>
                <small>
                  {{ pessoa.id === participante.id ? 'Você' : 'Participante' }}
                  <span v-if="pessoa.id === sala.hostId">· Host</span>
                </small>
                <span class="participante__status" :class="{ 'participante__status--votou': pessoa.votou }">
                  {{ sala.status === 'revelada' ? (pessoa.votou ? `Voto: ${sala.room.votacao.votos[pessoa.id]}` : 'Não votou') : (pessoa.votou ? '✓ Votou' : '◷ Aguardando') }}
                </span>
              </div>
            </li>
          </ul>
          <p class="participantes__note">
            Participantes e votos são sincronizados em tempo real.
          </p>
        </aside>
        <section class="votacao panel" aria-labelledby="titulo-votacao">
          <header class="votacao__header">
            <div>
              <span class="eyebrow">SUA ESTIMATIVA</span>
              <h2 id="titulo-votacao">Escolha uma carta</h2>
              <p>Quanto esforço essa tarefa precisa?</p>
            </div>
            <button
              v-if="sala.ehHost"

              class="btn btn-quiet"
              type="button"
              disabled title="Disponível em uma próxima etapa"
            >
              Configurações
            </button>
          </header>
          <div class="cartas" role="group" aria-label="Cartas de estimativa">
            <button
              v-for="carta in sala.cartas"
              :key="carta"
              type="button"
              class="carta"
              :aria-label="`Carta ${carta}`"
              :class="{ 'carta--selected': sala.meuVoto === carta }"
              :aria-pressed="sala.meuVoto === carta"
              :disabled="sala.status !== 'votando' || sala.pending || !sala.connected || sala.restoring"
              @click="sala.votar(carta)"
            >
              <strong>{{ carta }}</strong>
              <span class="carta__suit" aria-hidden="true">♠</span>
            </button>
          </div>
          <div class="votacao__acao">
            <p role="status">{{ sala.status === 'aguardando' ? 'Aguardando o host iniciar.' : sala.status === 'votando' ? 'Votação em andamento. Você pode alterar sua carta.' : 'Votos revelados.' }}</p>
            <button v-if="sala.ehHost" type="button" class="btn btn-primary"
              :disabled="sala.pending || !sala.connected || sala.restoring"
              @click="sala.status === 'votando' ? sala.revelarVotos() : sala.iniciarVotacao()">
              {{ sala.status === 'votando' ? 'Revelar votos' : sala.status === 'revelada' ? 'Nova votação' : 'Iniciar votação' }}
            </button>
          </div>
          <p v-if="sala.resultado" class="votacao__note" role="status">
            {{ sala.resultado.quantidade }} voto(s).
            Média numérica: {{ sala.resultado.media === null ? '—' : sala.resultado.media.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) }}.
          </p>
          <p v-else class="votacao__note">Os votos permanecem privados até o host revelar.</p>
          <p v-if="sala.error" class="form-error" role="alert">{{ sala.error.message }}</p>
        </section>
      </div>
    </template>
  </main>
</template>
