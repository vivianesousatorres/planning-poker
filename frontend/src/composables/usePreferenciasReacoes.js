import { computed, ref } from 'vue'
import { EMOJIS_RAPIDOS, EMOJIS_PERMITIDOS } from '../constants/catalogoEmojis.js'

export const CHAVE_PREFERENCIAS_REACOES = 'planning-poker:preferencias-reacoes'

export function validarPreferenciasReacoes(valor) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {}
  const preferencias = {}
  for (const [emoji, uso] of Object.entries(valor)) {
    if (!EMOJIS_PERMITIDOS.includes(emoji)) continue
    if (!uso || !Number.isSafeInteger(uso.count) || uso.count <= 0 ||
      !Number.isSafeInteger(uso.lastUsedAt) || uso.lastUsedAt < 0) return {}
    preferencias[emoji] = { count: uso.count, lastUsedAt: uso.lastUsedAt }
  }
  return preferencias
}

export function selecionarEmojisRapidos(preferencias) {
  const maisUsados = Object.entries(validarPreferenciasReacoes(preferencias))
    .sort((a, b) => b[1].count - a[1].count || b[1].lastUsedAt - a[1].lastUsedAt)
    .map(([emoji]) => emoji)
  return [...new Set([...maisUsados, ...EMOJIS_RAPIDOS])].slice(0, 6)
}

export function usePreferenciasReacoes(obterStorage = () => globalThis.localStorage, agora = () => Date.now()) {
  const preferencias = ref({})
  let storage
  try {
    storage = obterStorage()
    preferencias.value = validarPreferenciasReacoes(JSON.parse(storage.getItem(CHAVE_PREFERENCIAS_REACOES) || '{}'))
  } catch { /* Invalid or unavailable storage silently falls back to defaults. */ }
  const emojisRapidos = computed(() => selecionarEmojisRapidos(preferencias.value))
  function registrarUso(emoji) {
    if (!EMOJIS_PERMITIDOS.includes(emoji)) return
    try {
      if (!storage) { preferencias.value = {}; return }
      const atuais = validarPreferenciasReacoes(JSON.parse(storage.getItem(CHAVE_PREFERENCIAS_REACOES) || '{}'))
      const atualizado = { ...atuais, [emoji]: {
        count: Math.min((atuais[emoji]?.count ?? 0) + 1, Number.MAX_SAFE_INTEGER),
        lastUsedAt: agora(),
      } }
      storage.setItem(CHAVE_PREFERENCIAS_REACOES, JSON.stringify(atualizado))
      preferencias.value = atualizado
    } catch { preferencias.value = {} }
  }
  return { emojisRapidos, registrarUso }
}
