<script setup>
import CampoTexto from './CampoTexto.vue'
import BotaoBase from './BotaoBase.vue'
import MensagemErro from './MensagemErro.vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { presets, previewDeck } from '../utils/deck'
import { useSalaStore } from '../stores/sala'

const emit = defineEmits(['fechar'])
const sala = useSalaStore()
const dialog = ref(null)
const cartas = ref(sala.cartas.join(', '))
const erro = ref('')
const preset = ref(Object.keys(presets).find(key => presets[key] === cartas.value) ?? 'Personalizado')
const previa = computed(() => previewDeck(cartas.value))
function escolherPreset() {
  if (presets[preset.value]) cartas.value = presets[preset.value]
  erro.value = ''
}

onMounted(() => dialog.value.showModal())
onBeforeUnmount(() => dialog.value.close())

async function salvar() {
  erro.value = ''
  if (await sala.configurarCartas(cartas.value)) emit('fechar')
  else erro.value = sala.error?.message ?? 'Não foi possível salvar. Tente novamente.'
}
</script>

<template>
  <dialog
    ref="dialog"
    class="modal panel"
    aria-labelledby="titulo-configuracao"
    aria-describedby="descricao-configuracao"
    @cancel.prevent="emit('fechar')"
    @click="$event.target === dialog && emit('fechar')"
  >
    <form @submit.prevent="salvar">
      <header class="modal__header">
        <div>
          <span class="eyebrow">DO SEU JEITO</span>
          <h2 id="titulo-configuracao">Configurações da sala</h2>
        </div>
        <BotaoBase
          type="button"
          variante="quiet" tamanho="close"
          aria-label="Fechar configurações"
          @click="emit('fechar')"
        >
          ×
        </BotaoBase>
      </header>
      <p id="descricao-configuracao">
        Defina as cartas disponíveis para todos os participantes.
      </p>
      <label class="preset">Preset
        <select v-model="preset" aria-label="Preset" @change="escolherPreset">
          <option v-for="(_, nome) in presets" :key="nome">{{ nome }}</option>
          <option>Personalizado</option>
        </select>
      </label>
      <CampoTexto
        id="cartas" label="Cartas"
        v-model="cartas"
        @input="preset = 'Personalizado'; erro = ''"
        autofocus
        autocomplete="off"
        :aria-invalid="Boolean(erro)"
        aria-describedby="dica-cartas erro-cartas"
      >
        <small id="dica-cartas">
          Separe por vírgulas e use ponto nos decimais. Ex.: 0, 0.5, 1, ?, ☕.
        </small>
      </CampoTexto>
      <p class="modal__note">
        Alterar o deck limpa todos os votos e resultados. Salvar o mesmo deck preserva a rodada.
      </p>
      <div class="deck-preview" aria-label="Prévia das cartas" aria-live="polite">
        <span v-for="(carta, indice) in previa" :key="indice">{{ carta }}</span>
      </div>
      <MensagemErro id="erro-cartas">{{ erro }}</MensagemErro>
      <footer class="modal__footer">
        <BotaoBase type="button" variante="secondary" @click="emit('fechar')">
          Cancelar
        </BotaoBase>
        <BotaoBase type="submit" variante="primary" :disabled="sala.pending || !sala.connected || sala.restoring || !sala.ehHost">{{ sala.pending ? 'Salvando…' : 'Salvar' }}</BotaoBase>
      </footer>
    </form>
  </dialog>
</template>

<style scoped>
.modal { width: min(560px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); margin: auto; padding: 24px; overflow-y: auto; color: #d2d7ea; background: #181b29; border: 1px solid #514367; border-radius: 22px; }
.modal::backdrop { background: #0009; }
.modal__header, .modal__footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.modal__header { margin-bottom: 16px; }
.modal__footer { justify-content: flex-end; margin-top: 20px; }
.modal__note { margin: 14px 0; font-size: .8rem; }
.eyebrow { font-size: .68rem; color: #b9a4ff; }
.preset { display: grid; gap: 8px; margin-top: 16px; }
select { width: 100%; padding: 10px; border: 1px solid #414961; border-radius: 8px; background: #242838; color: inherit; }
.deck-preview { display: flex; flex-wrap: wrap; gap: 8px; }
.deck-preview span { display: grid; place-items: center; min-width: 48px; max-width: 100%; min-height: 64px; padding: 8px; overflow-wrap: anywhere; border: 1px solid #a28ace; border-radius: 10px; background: #242838; }
</style>
