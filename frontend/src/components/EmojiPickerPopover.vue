<script setup>
import { computed, ref, toRef, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { CATEGORIAS_EMOJI, filtrarEmojis } from '../constants/catalogoEmojis.js'
import { usePosicionamentoPopover } from '../composables/usePosicionamentoPopover.js'

const props = defineProps({ nome: { type: String, required: true }, participantId: { type: String, required: true }, ancora: Object, bloqueado: Boolean })
const emit = defineEmits(['fechar', 'reagir'])
const painel = ref(null)
const buscaInput = ref(null)
const busca = ref('')
const categoria = ref('todos')
const resultados = computed(() => filtrarEmojis(busca.value, categoria.value))
const { estilo } = usePosicionamentoPopover(toRef(props, 'ancora'), painel, motivo => emit('fechar', motivo))
let frameFoco
let desmontado = false
onMounted(async () => {
  await nextTick()
  if (desmontado) return
  frameFoco = requestAnimationFrame(() => buscaInput.value?.focus({ preventScroll: true }))
})
onBeforeUnmount(() => { desmontado = true; cancelAnimationFrame(frameFoco) })
function saiu(event) {
  if (!painel.value?.contains(event.relatedTarget) && !props.ancora?.contains(event.relatedTarget)) emit('fechar', 'saida')
}
function navegar(event) {
  const botoes = Array.from(painel.value.querySelectorAll('.emoji-picker__grid button'))
  const indice = botoes.indexOf(event.target)
  if (indice < 0) return
  const colunas = getComputedStyle(event.currentTarget).gridTemplateColumns.split(' ').length
  const passos = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: colunas, ArrowUp: -colunas }
  if (!(event.key in passos) && event.key !== 'Home' && event.key !== 'End') return
  event.preventDefault()
  const destino = event.key === 'Home' ? 0 : event.key === 'End' ? botoes.length - 1 : Math.max(0, Math.min(botoes.length - 1, indice + passos[event.key]))
  botoes[destino]?.focus()
}
</script>

<template>
  <Teleport to="body">
    <section ref="painel" class="emoji-picker" :style="estilo" :data-reaction-target="participantId" role="dialog"
      :aria-label="`Escolher reação para ${nome}`" @click.stop @focusout="saiu"
      @keydown.esc.stop.prevent="emit('fechar', 'escape')">
      <header class="emoji-picker__header">
        <strong>Reagir a {{ nome }}</strong>
        <button type="button" aria-label="Fechar seletor de emojis" @click="emit('fechar', 'escape')">×</button>
      </header>
      <input ref="buscaInput" v-model="busca" type="search" placeholder="Buscar emoji…" aria-label="Buscar emoji em português" />
      <div class="emoji-picker__categories" role="group" aria-label="Categorias de emojis">
        <button type="button" :aria-pressed="categoria === 'todos'" @click="categoria = 'todos'">Todos</button>
        <button v-for="item in CATEGORIAS_EMOJI" :key="item.id" type="button" :title="item.nome"
          :aria-label="item.nome" :aria-pressed="categoria === item.id" @click="categoria = item.id">{{ item.icone }}</button>
      </div>
      <div class="emoji-picker__grid" role="group" aria-label="Emojis disponíveis" @keydown="navegar">
        <button v-for="item in resultados" :key="item.emoji" type="button" :disabled="bloqueado" :title="item.nome"
          :aria-label="`Enviar reação ${item.emoji} para ${nome}: ${item.nome}`" @click="emit('reagir', item.emoji)">{{ item.emoji }}</button>
        <p v-if="!resultados.length" role="status">Nenhum emoji encontrado.</p>
      </div>
      <small role="status">{{ resultados.length }} emojis</small>
    </section>
  </Teleport>
</template>

<style scoped>
.emoji-picker { position: fixed; z-index: 101; display: flex; flex-direction: column; gap: 10px; width: 320px; height: 360px; padding: 12px; border: 1px solid #73618f; border-radius: 18px; background: #222032; color: #e2dff0; box-shadow: 0 12px 40px #0008; overflow: hidden; }
.emoji-picker__header { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-shrink: 0; }
.emoji-picker__header strong { font-size: .85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.emoji-picker button { border: 0; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; }
.emoji-picker__header button { width: 28px; height: 28px; font-size: 1.4rem; flex-shrink: 0; }
.emoji-picker input { width: 100%; min-width: 0; flex-shrink: 0; padding: 9px 10px; border: 1px solid #55546c; border-radius: 9px; background: #181b29; color: #eeeaf8; font-size: .85rem; }
.emoji-picker__categories { display: flex; gap: 3px; flex-shrink: 0; }
.emoji-picker__categories button { flex: 1; min-width: 0; padding: 5px 3px; font-size: .8rem; }
.emoji-picker__categories button[aria-pressed='true'] { background: #49385f; color: #f4edff; }
.emoji-picker__grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); align-content: start; gap: 4px; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; }
.emoji-picker__grid button { display: grid; place-items: center; min-height: 38px; min-width: 0; font-size: 1.5rem; }
.emoji-picker__grid p { grid-column: 1 / -1; padding: 12px 0; font-size: .8rem; }
.emoji-picker button:hover { background: #49385f; }
.emoji-picker button:disabled { opacity: .5; cursor: default; }
.emoji-picker :focus-visible { outline: 2px solid #c7b5ff; outline-offset: 1px; }
.emoji-picker small { font-size: .7rem; color: #aaa5bf; }
</style>
