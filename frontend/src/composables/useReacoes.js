import { ref, watch, onScopeDispose } from 'vue'
import { DURACAO_REACAO_MS, COOLDOWN_REACAO_MS, EMOJIS_REACAO } from '../constants/reacoes.js'

export function useReacoes(sala, obterTrajeto = () => null, confirmarEnvio = () => {}) {
  const reacoesAtivas = ref([])
  const emCooldown = ref(false)
  const timers = new Map()
  let cooldownTimer
  function remover(id) {
    clearTimeout(timers.get(id))
    timers.delete(id)
    reacoesAtivas.value = reacoesAtivas.value.filter(r => r.id !== id)
  }
  function limpar() {
    timers.forEach(clearTimeout)
    timers.clear()
    clearTimeout(cooldownTimer)
    emCooldown.value = false
    reacoesAtivas.value = []
  }
  const cancelarAssinatura = sala.assinarReacoes(reaction => {
    if (!sala.connected || !sala.me || !EMOJIS_REACAO.includes(reaction?.emoji) ||
      !sala.participants.some(p => p.id === reaction.targetParticipantId) || timers.has(reaction.id)) return
    reacoesAtivas.value.push({ ...reaction, trajeto: obterTrajeto(reaction) })
    if (reaction.fromParticipantId === sala.participantId) confirmarEnvio(reaction.emoji)
    timers.set(reaction.id, setTimeout(() => remover(reaction.id), DURACAO_REACAO_MS))
  })
  watch(() => [sala.codigo, sala.connected, sala.me?.id], limpar)
  watch(() => sala.participants.map(p => p.id), ids => {
    reacoesAtivas.value.filter(r => !ids.includes(r.targetParticipantId)).forEach(r => remover(r.id))
  })
  function reagir(targetParticipantId, emoji) {
    if (emCooldown.value || !sala.connected || !sala.me || sala.restoring || targetParticipantId === sala.participantId) return
    emCooldown.value = true
    cooldownTimer = setTimeout(() => { emCooldown.value = false }, COOLDOWN_REACAO_MS)
    return sala.enviarReacao(targetParticipantId, emoji)
  }
  onScopeDispose(() => { cancelarAssinatura(); limpar() })
  return { reacoesAtivas, emCooldown, reagir }
}
