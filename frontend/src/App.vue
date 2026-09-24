<script setup>
import { RouterView } from 'vue-router'
import { useSalaStore } from './stores/sala.js'

useSalaStore().inicializar()
</script>

<template>
  <RouterView />
</template>
