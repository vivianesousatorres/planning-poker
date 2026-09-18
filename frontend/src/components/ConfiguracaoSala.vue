<script setup>
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
        <button
          type="button"
          class="btn btn-quiet modal__close"
          aria-label="Fechar configurações"
          @click="emit('fechar')"
        >
          ×
        </button>
      </header>
      <p id="descricao-configuracao">
        Defina as cartas disponíveis para a próxima escolha.
      </p>
      <div class="form-group">
        <label for="cartas">Cartas</label>
        <input
          id="cartas"
          v-model="cartas"
          autofocus
          autocomplete="off"
          :aria-invalid="Boolean(erro)"
          aria-describedby="dica-cartas erro-cartas"
        />
        <small id="dica-cartas">
          Separe por vírgulas e use ponto nos decimais. Ex.: 0, 0.5, 1, 2, 3, 5.
        </small>
      </div>
      <p class="modal__note">
        Salvar limpa a seleção atual. Valores repetidos aparecem uma única vez.
      </p>
      <p id="erro-cartas" class="form-error" role="alert">{{ erro }}</p>
      <footer class="modal__footer">
        <button type="button" class="btn btn-secondary" @click="emit('fechar')">
          Cancelar
        </button>
        <button type="submit" class="btn btn-primary">Salvar</button>
      </footer>
    </form>
  </dialog>
</template>
