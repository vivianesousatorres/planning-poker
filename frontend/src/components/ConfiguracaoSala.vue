<script setup>
import CampoTexto from './CampoTexto.vue'
import BotaoBase from './BotaoBase.vue'
import MensagemErro from './MensagemErro.vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useSalaStore } from '../stores/sala'

const emit = defineEmits(['fechar'])
const sala = useSalaStore()
const dialog = ref(null)
const cartas = ref(sala.cartas.join(', '))
const erro = ref('')

onMounted(() => dialog.value.showModal())
onBeforeUnmount(() => dialog.value.close())

function salvar() {
  erro.value = sala.configurarCartas(cartas.value) ?? ''
  if (!erro.value) emit('fechar')
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
        Defina as cartas disponíveis para a próxima escolha.
      </p>
      <CampoTexto
        id="cartas" label="Cartas"
        v-model="cartas"
        autofocus
        autocomplete="off"
        :aria-invalid="Boolean(erro)"
        aria-describedby="dica-cartas erro-cartas"
      >
        <small id="dica-cartas">
          Separe por vírgulas e use ponto nos decimais. Ex.: 0, 0.5, 1, 2, 3, 5.
        </small>
      </CampoTexto>
      <p class="modal__note">
        Salvar limpa a seleção atual. Valores repetidos aparecem uma única vez.
      </p>
      <MensagemErro id="erro-cartas">{{ erro }}</MensagemErro>
      <footer class="modal__footer">
        <BotaoBase type="button" variante="secondary" @click="emit('fechar')">
          Cancelar
        </BotaoBase>
        <BotaoBase type="submit" variante="primary">Salvar</BotaoBase>
      </footer>
    </form>
  </dialog>
</template>
