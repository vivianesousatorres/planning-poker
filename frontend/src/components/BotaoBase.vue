<script setup>
defineProps({
  variante: {
    type: String,
    default: 'primary',
    validator: value => ['primary', 'secondary', 'quiet', 'icon'].includes(value),
  },
  type: { type: String, default: 'button' },
  tamanho: { type: String, default: 'normal', validator: value => ['normal', 'small', 'icon', 'close'].includes(value) },
})
const variantes = {
  primary: 'border-transparent bg-accent text-[#211737] shadow-[0_4px_20px_#9b79ff16] enabled:hover:bg-[#cbbaff]',
  secondary: 'border-[#363d52] bg-[#242938] text-[#edf0f7] enabled:hover:bg-[#30374b]',
  quiet: 'border-line bg-transparent text-[#bac0d2] enabled:hover:bg-[#252938] enabled:hover:text-white',
  icon: 'border-transparent bg-transparent text-[#bac0d2] enabled:hover:bg-[#252938] enabled:hover:text-white',
}
const tamanhos = {
  normal: 'min-h-11 gap-[18px] px-[19px] py-[11px] text-[0.88rem]',
  small: 'min-h-9 gap-2 px-3 py-[7px] text-[0.8rem]',
  icon: 'size-8 shrink-0 p-0',
  close: 'min-h-11 px-[13px] py-[3px] text-[1.4rem]',
}
</script>

<template>
  <button :type="type"
    class="inline-flex items-center justify-center rounded-[10px] border font-semibold transition-[background,border-color] duration-150 motion-reduce:transition-none"
    :class="[variantes[variante], tamanhos[tamanho]]"><slot /></button>
</template>
