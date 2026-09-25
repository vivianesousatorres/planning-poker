<script setup>
defineProps({ titulo: Boolean })
</script>

<template>
  <router-link to="/" class="brand-link" aria-label="Voltar para a página inicial">
    <span class="brand-mark" aria-hidden="true">♠</span>
    <h1 v-if="titulo">Planning Poker</h1>
    <template v-else>Planning Poker</template>
  </router-link>
</template>