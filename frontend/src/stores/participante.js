import { defineStore } from 'pinia'

const STORAGE_KEY = 'planning-poker:participante-id'

export const useParticipanteStore = defineStore('participante', {
  state: () => ({ id: null, nome: '' }),
  actions: {
    definirParticipante(nome) {
      const nomeNormalizado = nome.trim()
      if (!nomeNormalizado) return false
      if (!this.id) {
        try {
          this.id = localStorage.getItem(STORAGE_KEY)
        } catch {
          // A sessão também funciona com o armazenamento bloqueado.
        }
        this.id ||=
          globalThis.crypto?.randomUUID?.() ??
          `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
        try {
          localStorage.setItem(STORAGE_KEY, this.id)
        } catch {
          // Sem armazenamento, a identidade dura apenas nesta sessão.
        }
      }
      this.nome = nomeNormalizado
      return true
    },
  },
})
