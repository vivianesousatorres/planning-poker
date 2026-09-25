<script setup>
defineOptions({ inheritAttrs: false })
defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
})
const model = defineModel({ type: String, default: '' })
</script>

<template>
  <div class="form-group">
    <label :for="id">{{ label }}</label>
    <input :id="id" v-model="model" v-bind="$attrs" />
    <slot />
  </div>
</template>
