<script setup>
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { ArrowRightLeft } from 'lucide-vue-next'
import BotaoBase from './BotaoBase.vue'
import SeletorReacao from './SeletorReacao.vue'
import EmojiPickerPopover from './EmojiPickerPopover.vue'
import { DURACAO_ANIMACAO_REACAO_MS } from '../constants/reacoes.js'
import { EMOJIS_RAPIDOS } from '../constants/catalogoEmojis.js'

const props = defineProps({
  pessoa: { type: Object, required: true },
  atual: Boolean,
  host: Boolean,
  revelada: Boolean,
  voto: [Number, String],
  podeTransferir: Boolean,
  bloqueado: Boolean,
  reacoes: { type: Array, default: () => [] },
  seletorAberto: Boolean,
  pickerAberto: Boolean,
  reacaoBloqueada: Boolean,
  emojisRapidos: { type: Array, default: () => EMOJIS_RAPIDOS },
})
const emit = defineEmits(['transferir', 'reagir', 'abrirReacoes', 'fecharReacoes', 'abrirPicker'])
const carta = ref(null)
let ignorarFoco = false
let abrindoPicker = false
watch(() => props.seletorAberto, aberto => { if (aberto) abrindoPicker = false })
function abrirPicker() {
  abrindoPicker = true
  emit('abrirPicker')
}
function fecharRapido(motivo) {
  if (!abrindoPicker) fechar(motivo)
}
async function navegarParaReacoes(event) {
  if (props.atual || event.shiftKey || event.target !== carta.value) return
  event.preventDefault()
  emit('abrirReacoes', 'focus')
  await nextTick()
  const popover = Array.from(document.querySelectorAll('[data-reaction-target]')).find(p => p.dataset.reactionTarget === props.pessoa.id)
  popover?.querySelector('button')?.focus()
}
function restaurarFoco() {
  ignorarFoco = true
  carta.value?.focus({ preventScroll: true })
  ignorarFoco = false
}
function fechar(motivo) {
  emit('fecharReacoes')
  if (motivo === 'escape') restaurarFoco()
}
function escolher(emoji) {
  emit('reagir', emoji)
  emit('fecharReacoes')
  restaurarFoco()
}
function sairDaCarta(event) {
  // Mouse exit is coordinated by the quick popover, including the gap to its anchor.
  if (event.type === 'mouseleave') return
  if (props.pickerAberto) return
  if (event.type === 'focusout' && (!event.relatedTarget || event.relatedTarget === document.body)) return
  const destino = event.relatedTarget
  if (carta.value?.contains(destino) || destino?.closest?.('[data-reaction-target]')?.dataset.reactionTarget === props.pessoa.id) return
  fechar('saida')
}
const mostrarValor = computed(() => props.pessoa.votou && props.revelada)
const valor = ref(null)
let observadorValor
function ajustarValor() {
  const elemento = valor.value
  if (!elemento) return
  elemento.style.fontSize = ''
  const largura = elemento.parentElement.clientWidth - 12
  const tamanho = parseFloat(getComputedStyle(elemento).fontSize)
  if (elemento.scrollWidth > largura) {
    elemento.style.fontSize = `${tamanho * largura / elemento.scrollWidth}px`
  }
}
onMounted(() => {
  observadorValor = new ResizeObserver(ajustarValor)
  observadorValor.observe(valor.value.parentElement)
  ajustarValor()
})
watch(() => [props.voto, mostrarValor.value], async () => { await nextTick(); ajustarValor() })
onBeforeUnmount(() => observadorValor?.disconnect())
function estiloReacao(reacao, indice) {
  const deslocamento = (indice % 3 - 1) * 14
  const x = reacao.trajeto?.x ?? 0
  const y = reacao.trajeto?.y ?? 0
  return {
    left: `calc(50% + ${deslocamento}px)`,
    '--reaction-origin-x': `${x - deslocamento}px`,
    '--reaction-origin-y': `${y}px`,
    '--reaction-quarter-x': `${(x - deslocamento) * .75}px`,
    '--reaction-quarter-y': `${y * .75 - 55}px`,
    '--reaction-mid-x': `${(x - deslocamento) / 2}px`,
    '--reaction-mid-y': `${y / 2 - 75}px`,
    '--reaction-end-x': `${(x - deslocamento) * .25}px`,
    '--reaction-end-y': `${y * .25 - 55}px`,
    animationDuration: `${DURACAO_ANIMACAO_REACAO_MS}ms`,
  }
}
</script>

<template>
  <article ref="carta" class="participant-card" :class="{
    'participant-card--voted': pessoa.votou,
    'participant-card--revealed': revelada && pessoa.votou,
    'participant-card--current': atual,
  }" :style="{ zIndex: seletorAberto ? 10 : undefined }" :aria-label="pessoa.name" :data-participant-id="pessoa.id"
    :tabindex="atual ? undefined : 0" :aria-description="atual ? undefined : 'Passe o mouse, toque ou use o teclado para enviar uma reação'"
    @focus="!atual && !ignorarFoco && emit('abrirReacoes', 'focus')" @click="!atual && emit('abrirReacoes', 'click')"
    @mouseenter="!atual && emit('abrirReacoes', 'hover')" @mouseleave="sairDaCarta" @focusout="sairDaCarta"
    @keydown.tab="navegarParaReacoes"
    @keydown.esc.stop.prevent="fechar('escape')">
    <div class="participant-card__vote" :aria-label="mostrarValor ? `Voto: ${voto}` : pessoa.votou ? 'Voto oculto' : revelada ? 'Não votou' : 'Aguardando voto'">
      <span ref="valor" class="participant-card__value" aria-hidden="true">{{ mostrarValor ? voto : '♠' }}</span>
      <div class="participant-card__reactions" aria-hidden="true">
        <span v-for="(reacao, indice) in reacoes" :key="reacao.id" class="participant-card__reaction"
          :style="estiloReacao(reacao, indice)">{{ reacao.emoji }}</span>
      </div>
    </div>
    <strong class="participant-card__name" :title="pessoa.name">{{ pessoa.name }}</strong>
    <small>{{ atual ? 'Você' : 'Participante' }}<span v-if="host"> · Host</span></small>
    <span class="participant-card__status">{{ pessoa.votou ? (revelada ? 'Revelado' : '✓ Votou') : (revelada ? 'Não votou' : 'Aguardando') }}</span>
    <SeletorReacao v-if="!atual && seletorAberto" :nome="pessoa.name" :participant-id="pessoa.id" :ancora="carta"
      :emojis="emojisRapidos"
      :bloqueado="reacaoBloqueada" @abrir-picker="abrirPicker" @fechar="fecharRapido" @reagir="emit('reagir', $event)" />
    <EmojiPickerPopover v-if="!atual && pickerAberto" :nome="pessoa.name" :participant-id="pessoa.id" :ancora="carta"
      :bloqueado="reacaoBloqueada" @fechar="fechar" @reagir="escolher" />
    <BotaoBase v-if="podeTransferir" class="participant-card__transfer" variante="quiet" tamanho="icon"
      :title="`Transferir host para ${pessoa.name}`" :aria-label="`Transferir host para ${pessoa.name}`"
      :disabled="bloqueado" @click.stop="$emit('transferir')">
      <ArrowRightLeft :size="14" aria-hidden="true" />
    </BotaoBase>
  </article>
</template>

<style scoped>
.participant-card__reactions { position: absolute; inset: 0; pointer-events: none; z-index: 12; }
.participant-card__reaction { position: absolute; top: 50%; font-size: 2rem; line-height: 1; animation: participant-reaction .8s linear forwards; }
@keyframes participant-reaction {
  from { transform: translate(calc(-50% + var(--reaction-origin-x)), calc(-50% + var(--reaction-origin-y))) scale(.65) rotate(-30deg); opacity: 1; }
  18% { transform: translate(calc(-50% + var(--reaction-quarter-x)), calc(-50% + var(--reaction-quarter-y))) scale(.8) rotate(60deg); }
  36% { transform: translate(calc(-50% + var(--reaction-mid-x)), calc(-50% + var(--reaction-mid-y))) scale(.9) rotate(150deg); }
  54% { transform: translate(calc(-50% + var(--reaction-end-x)), calc(-50% + var(--reaction-end-y))) scale(.8) rotate(240deg); }
  72% { transform: translate(-50%, -50%) scale(1.1) rotate(330deg); opacity: 1; }
  82% { transform: translate(-50%, -42%) scale(.75) rotate(360deg); opacity: .7; }
  to { transform: translate(-50%, -25%) scale(.4) rotate(380deg); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .participant-card__reaction { animation: participant-reaction-fade .8s linear forwards; }
}
@keyframes participant-reaction-fade {
  from, 70% { transform: translate(-50%, -50%); opacity: 1; }
  to { transform: translate(-50%, -50%); opacity: 0; }
}
.participant-card { position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px; width: 124px; min-width: 0; text-align: center; }
.participant-card__vote { position: relative; display: grid; place-items: center; width: 64px; min-height: 74px; padding: 6px; border: 1px solid #55546c; border-radius: 12px; background: linear-gradient(145deg, #292b3e, #191c2b); color: #9da3bb; font-size: 1.65rem; font-weight: 700; overflow-wrap: anywhere; }
.participant-card__value { min-width: 0; max-width: 100%; white-space: nowrap; line-height: 1; }
.participant-card--voted .participant-card__vote { border-color: #a88ce9; background: #3a2e53; color: #e0d4ff; }
.participant-card--revealed .participant-card__vote { background: #c7b5ff; color: #241735; }
.participant-card--current .participant-card__vote { outline: 2px solid #b9a4ff; outline-offset: 4px; }
.participant-card__name { width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 5px; font-size: .85rem; }
.participant-card__status { font-size: .72rem; color: #a4adc4; }
.participant-card--voted .participant-card__status { color: #8bdfbe; }
.participant-card__transfer {
  position: absolute;
  top: 0;
  right: 0;
  width: 24px;
  height: 28px;
  padding: 0;
  opacity: 0;
  pointer-events: none;
}
.participant-card:hover .participant-card__transfer,
.participant-card:focus-within .participant-card__transfer {
  opacity: 1;
  pointer-events: auto;
}
@media (hover: none), (pointer: coarse) {
  .participant-card__transfer { opacity: 1; pointer-events: auto; }
}
@media (max-width: 700px) {
  .participant-card { width: 112px; }
  .participant-card__vote { width: 58px; min-height: 70px; font-size: 1.5rem; }
}
</style>
