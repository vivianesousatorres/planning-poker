<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useParticipanteStore } from '../stores/participante'
import { useSalaStore } from '../stores/sala'
import ConfiguracaoSala from '../components/ConfiguracaoSala.vue'

const route = useRoute()
const router = useRouter()
const participante = useParticipanteStore()
const sala = useSalaStore()
const configuracaoAberta = ref(false)
const botaoConfiguracao = ref(null)
const mensagemCopia = ref('')
const nome = ref(participante.nome)
const erro = ref('')
const codigo = computed(() => String(route.params.codigo).trim().toUpperCase())
const estaNaSala = computed(() =>
  sala.participantes.some(({ id }) => id === participante.id),
)

watch(
  codigo,
  () => {
    configuracaoAberta.value = false
    mensagemCopia.value = ''
    if (sala.codigo !== codigo.value) sala.$reset()
  },
  { immediate: true },
)

function entrar() {
  if (!participante.definirParticipante(nome.value)) {
    erro.value = 'Informe seu nome para entrar.'
    return
  }
  if (!sala.iniciar(codigo.value))
    erro.value = 'O código da sala não pode estar vazio.'
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

function sair() {
  sala.$reset()
  router.push({ name: 'home' })
}

async function fecharConfiguracao() {
  configuracaoAberta.value = false
  await nextTick()
  botaoConfiguracao.value?.focus()
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
        <button class="btn btn-quiet" type="button" @click="sair">Sair</button>
      </div>
    </header>
    <p class="copy-feedback" role="status">{{ mensagemCopia }}</p>
    <form v-if="!estaNaSala" class="join-panel panel" @submit.prevent="entrar">
      <span class="eyebrow">SEU LUGAR À MESA</span>
      <h2>Entre na sala {{ codigo }}</h2>
      <p>Informe seu nome para abrir a prévia local desta sala.</p>
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
      <p id="erro-direto" class="form-error" role="alert">{{ erro }}</p>
      <button class="btn btn-primary" type="submit">Entrar</button>
    </form>
    <template v-else>
      <div class="sala__intro">
        <div>
          <span class="eyebrow">ESPAÇO DO TIME</span>
          <h2>Uma carta, uma perspectiva.</h2>
          <p>Escolha sua estimativa e comece a conversa.</p>
        </div>
        <!-- TODO: remover o selo temporário na próxima fase, com sincronização via socket. -->
        <span class="local-label">
          <span class="status-dot"></span>
          Prévia local
        </span>
      </div>
      <div class="sala__content">
        <aside class="participantes panel">
          <div class="participantes__header">
            <h2>Participantes</h2>
            <span class="count">{{ sala.participantes.length }}</span>
          </div>
          <ul class="participantes__lista">
            <li
              v-for="pessoa in sala.participantes"
              :key="pessoa.id"
              class="participante"
            >
              <span class="participante__avatar">
                {{ pessoa.nome.slice(0, 1).toUpperCase() }}
              </span>
              <div class="participante__info">
                <strong>{{ pessoa.nome }}</strong>
                <small>
                  {{ pessoa.id === participante.id ? 'Você' : 'Participante' }}
                  <span v-if="pessoa.id === sala.hostId">· Host</span>
                </small>
                <span
                  class="participante__status"
                  :class="{
                    'participante__status--votou': pessoa.voto !== null,
                  }"
                >
                  {{ pessoa.voto !== null ? '✓ Votou' : '◷ Aguardando' }}
                </span>
              </div>
            </li>
          </ul>
          <!-- TODO: remover este aviso quando a lista receber participantes reais via socket. -->
          <p class="participantes__note">
            Por enquanto, apenas você aparece aqui. A participação do time
            chegará em uma próxima etapa.
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
              ref="botaoConfiguracao"
              class="btn btn-quiet"
              type="button"
              @click="configuracaoAberta = true"
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
              :class="{ 'carta--selected': sala.votoAtual === carta }"
              :aria-pressed="sala.votoAtual === carta"
              :aria-label="`Estimar ${carta}`"
              @click="sala.votar(carta)"
            >
              <strong>{{ carta }}</strong>
              <span class="carta__suit" aria-hidden="true">♠</span>
            </button>
          </div>
          <div class="votacao__acao">
            <p role="status">
              {{
                sala.votoAtual !== null
                  ? `Sua escolha: ${sala.votoAtual}`
                  : 'Sua próxima estimativa começa aqui.'
              }}
            </p>
            <button
              type="button"
              class="btn btn-primary"
              :disabled="sala.votoAtual === null || sala.votosRevelados"
              @click="sala.revelarVotos"
            >
              Revelar votos
            </button>
          </div>
          <div v-if="sala.votosRevelados" class="resultado" role="status">
            <span class="eyebrow">ESTIMATIVA LOCAL REVELADA</span>
            <p>
              {{ participante.nome }} escolheu
              <strong>{{ sala.votoAtual }}</strong>
              .
            </p>
          </div>
          <p class="votacao__note">
            A seleção e a revelação funcionam somente nesta sessão, sem
            sincronização com outras pessoas.
          </p>
        </section>
      </div>
    </template>
    <ConfiguracaoSala
      v-if="configuracaoAberta && sala.ehHost"
      @fechar="fecharConfiguracao"
    />
  </main>
</template>
