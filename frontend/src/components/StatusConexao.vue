<script setup>
defineProps({
  conectado: Boolean,
  tag: { type: String, default: 'span' },
  textoConectado: { type: String, default: 'Conectado' },
  textoDesconectado: { type: String, default: 'Sem conexão' },
})
</script>

<template>
  <component :is="tag">
    <span class="status-dot"></span>
    {{ conectado ? textoConectado : textoDesconectado }}
  </component>
</template>
