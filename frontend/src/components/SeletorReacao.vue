<script setup>
import { ref, toRef, onMounted, onBeforeUnmount } from 'vue'
import { EMOJIS_RAPIDOS } from '../constants/catalogoEmojis.js'
import { Plus } from 'lucide-vue-next'
import { usePosicionamentoPopover, estaNaAreaReacao } from '../composables/usePosicionamentoPopover.js'

const props = defineProps({ nome: { type: String, required: true }, participantId: { type: String, required: true }, ancora: Object, bloqueado: Boolean,
  emojis: { type: Array, default: () => EMOJIS_RAPIDOS },
})
const emit = defineEmits(['fechar', 'reagir', 'abrirPicker'])
const painel = ref(null)
const { estilo } = usePosicionamentoPopover(toRef(props, 'ancora'), painel, motivo => emit('fechar', motivo))
function saiu(event) {
  if (event.type === 'focusout' && (!event.relatedTarget || event.relatedTarget === document.body)) return
  if (!painel.value?.contains(event.relatedTarget) && !props.ancora?.contains(event.relatedTarget)) emit('fechar', 'saida')
}
function acompanharMouse(event) {
  if (event.pointerType === 'touch' || !painel.value || !props.ancora) return
  const carta = props.ancora.getBoundingClientRect()
  const balao = painel.value.getBoundingClientRect()
  if (!estaNaAreaReacao(event.clientX, event.clientY, carta, balao)) emit('fechar', 'saida')
}
onMounted(() => document.addEventListener('pointermove', acompanharMouse))
onBeforeUnmount(() => document.removeEventListener('pointermove', acompanharMouse))
</script>

<template>
  <Teleport to="body">
    <div ref="painel" class="quick-reactions" :style="estilo" :data-reaction-target="participantId" role="group"
      :aria-label="`Reações rápidas para ${nome}`" @click.stop @focusout="saiu"
      @keydown.esc.stop.prevent="emit('fechar', 'escape')">
      <button v-for="emoji in emojis" :key="emoji" type="button" :disabled="bloqueado"
        :aria-label="`Enviar reação ${emoji} para ${nome}`" @click="emit('reagir', emoji)">{{ emoji }}</button>
      <button type="button" class="quick-reactions__more" :aria-label="`Mostrar mais reações para ${nome}`"
        aria-haspopup="dialog" @click="emit('abrirPicker')"><Plus :size="20" aria-hidden="true" /></button>
    </div>
  </Teleport>
</template>

<style scoped>
.quick-reactions { position: fixed; z-index: 100; display: flex; align-items: center; gap: 2px; width: 256px; padding: 5px; border: 1px solid #73618f; border-radius: 999px; background: #222032; box-shadow: 0 8px 24px #0006; }
/* Bridge the 8px anchor gap so leaving the card enters this popover directly. */
.quick-reactions::before { content: ''; position: absolute; inset: -10px 0; z-index: -1; }
.quick-reactions button { display: grid; place-items: center; flex: 1; min-width: 0; height: 34px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: #ded4ff; font-size: 1.35rem; cursor: pointer; }
.quick-reactions button:hover { background: #49385f; }
.quick-reactions button:focus-visible { outline: 2px solid #c7b5ff; outline-offset: 1px; }
.quick-reactions button:disabled { opacity: .5; cursor: default; }
.quick-reactions .quick-reactions__more { line-height: 1; }
.quick-reactions__more svg { display: block; flex-shrink: 0; }
</style>
