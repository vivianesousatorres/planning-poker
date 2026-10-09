import { defineStore } from 'pinia'

const STORAGE_KEY = 'planning-poker:participante-id'
const TOKEN_KEY = 'planning-poker:participante-token'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function gerarUuid() {
  if (globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID()
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 15) | 64
  bytes[8] = (bytes[8] & 63) | 128
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export const useParticipanteStore = defineStore('participante', {
  state: () => ({ id: null, token: null, nome: '' }),
  actions: {
    inicializar() {
      if (this.id && this.token) return
      try {
        this.id = localStorage.getItem(STORAGE_KEY)
        this.token = localStorage.getItem(TOKEN_KEY)
      } catch { /* Sem armazenamento, a identidade dura apenas nesta sessão. */ }
      this.id = UUID.test(this.id ?? '') ? this.id.toLowerCase() : gerarUuid()
      this.token = UUID.test(this.token ?? '') ? this.token.toLowerCase() : gerarUuid()
      try {
        localStorage.setItem(STORAGE_KEY, this.id)
        localStorage.setItem(TOKEN_KEY, this.token)
      } catch { /* O navegador pode bloquear o armazenamento. */ }
    },
  },
})
