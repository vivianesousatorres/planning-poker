<script setup>
import CampoTexto from '../components/CampoTexto.vue'
import BotaoBase from '../components/BotaoBase.vue'
import MensagemErro from '../components/MensagemErro.vue'
import MarcaApp from '../components/MarcaApp.vue'
import StatusConexao from '../components/StatusConexao.vue'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useParticipanteStore } from '../stores/participante'
import { useSalaStore } from '../stores/sala'

const router = useRouter()
const participante = useParticipanteStore()
const sala = useSalaStore()
const nomeCriador = ref(participante.nome)
const nomeParticipante = ref(participante.nome)
const codigo = ref('')
const erroCriar = ref('')
const erroEntrar = ref('')

async function criarSala() {
  erroCriar.value = ''
  if (await sala.createRoom(nomeCriador.value)) {
    router.push({ name: 'sala', params: { codigo: sala.codigo } })
  } else erroCriar.value = sala.error?.message ?? ''
}

async function entrarSala() {
  erroEntrar.value = ''
  if (await sala.joinRoom(codigo.value, nomeParticipante.value)) {
    router.push({ name: 'sala', params: { codigo: sala.codigo } })
  } else erroEntrar.value = sala.error?.message ?? ''
}
</script>

<template>
  <main class="home">
    <MarcaApp class="home__brand" />
    <section class="home__card panel" aria-labelledby="titulo-home">
      <header class="home__header">
        <span class="eyebrow">MENOS SUPOSIÇÕES. MAIS CONVERSA.</span>
        <h1 id="titulo-home">
          Planning
          <span>Poker</span>
        </h1>
        <p>
          Grandes entregas começam com boas estimativas.
          <br />
          Prepare a próxima rodada com seu time.
        </p>
        <div class="home__deck" aria-hidden="true">
          <span>3</span>
          <span>5</span>
          <span>8</span>
        </div>
      </header>
      <div class="home__content">
        <form class="home__section" @submit.prevent="criarSala">
          <span class="section-icon" aria-hidden="true">＋</span>
          <h2>Comece uma rodada</h2>
          <p>Crie uma sala e prepare as cartas do time.</p>
          <CampoTexto
            id="nomeCriador" label="Seu nome"
            v-model="nomeCriador"
            placeholder="Como podemos chamar você?"
            autocomplete="given-name"
            maxlength="60"
            required
            :aria-invalid="Boolean(erroCriar)"
            aria-describedby="erro-criar"
          />
          <MensagemErro id="erro-criar">{{ erroCriar }}</MensagemErro>
          <BotaoBase class="mt-auto w-full" variante="primary" type="submit" :disabled="sala.pending || !sala.connected">
            Criar sala
            <span aria-hidden="true">↗</span>
          </BotaoBase>
        </form>
        <div class="home__divider"><span>ou</span></div>
        <form class="home__section" @submit.prevent="entrarSala">
          <span class="section-icon" aria-hidden="true">↗</span>
          <h2>Entre em uma sala</h2>
          <p>Já tem um código? Seu lugar está aqui.</p>
          <CampoTexto
            id="codigoSala" label="Código da sala"
            v-model="codigo"
            class="code-input"
            placeholder="Ex: AB12CD"
            autocomplete="off"
            maxlength="64"
            required
            :aria-invalid="Boolean(erroEntrar)"
            aria-describedby="erro-entrar"
          />
          <CampoTexto
            id="nomeParticipante" label="Seu nome"
            v-model="nomeParticipante"
            placeholder="Como podemos chamar você?"
            autocomplete="given-name"
            maxlength="60"
            required
            :aria-invalid="Boolean(erroEntrar)"
            aria-describedby="erro-entrar"
          />
          <MensagemErro id="erro-entrar">
            {{ erroEntrar }}
          </MensagemErro>
          <BotaoBase class="mt-auto w-full" variante="secondary" type="submit" :disabled="sala.pending || !sala.connected">
            Entrar
            <span aria-hidden="true">→</span>
          </BotaoBase>
        </form>
      </div>
    </section>
    <StatusConexao class="home__footnote" tag="p" :conectado="sala.connected"
      texto-conectado="Conectado · Salas compartilhadas em tempo real."
      texto-desconectado="Aguardando conexão com o servidor…" />
  </main>
</template>
