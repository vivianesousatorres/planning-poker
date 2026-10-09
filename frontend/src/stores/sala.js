import { acceptHMRUpdate, defineStore } from 'pinia'
import { socket } from '../services/socket.js'
import { useParticipanteStore } from './participante.js'

const SESSION_KEY = 'planning-poker:sala'
function savedSession(value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
    if (value === null) localStorage.removeItem(SESSION_KEY)
    else localStorage.setItem(SESSION_KEY, JSON.stringify(value))
  } catch { /* Recovery remains available in memory if storage is blocked. */ }
}

export const useSalaStore = defineStore('sala', {
  state: () => ({ room: null, connected: socket.connected, error: null, pending: false, session: savedSession(), restoring: false, generation: 0, initialized: false }),
  getters: {
    participantId: () => useParticipanteStore().id,
    participantName: () => useParticipanteStore().nome,
    me: state => state.room?.participants.find(person => person.id === useParticipanteStore().id) ?? null,
    isHost: state => Boolean(state.room && state.room.hostId === useParticipanteStore().id),
    participants: state => state.room?.participants ?? [],
    codigo: state => state.room?.code ?? null,
    hostId: state => state.room?.hostId ?? null,
    cartas: state => state.room?.config.cards ?? [],
    status: state => state.room?.votacao.status ?? 'aguardando',
    roundId: state => state.room?.votacao.roundId,
    meuVoto: state => state.room?.votacao.votos[useParticipanteStore().id],
    resultado: state => {
      if (state.room?.votacao.status !== 'revelada') return null
      const votes = Object.values(state.room.votacao.votos)
      const numeric = votes.filter(v => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(Number(v))).map(Number)
      return { quantidade: votes.length, media: numeric.length ? numeric.reduce((sum, v) => sum + v / numeric.length, 0) : null }
    },
    ehHost() { return this.isHost },
  },
  actions: {
    assinarReacoes(listener) {
      socket.on('room:reaction', listener)
      return () => socket.off('room:reaction', listener)
    },
    async enviarReacao(targetParticipantId, emoji) {
      if (!socket.connected || !this.me || this.restoring) return false
      try {
        const response = await socket.timeout(8000).emitWithAck('room:reaction', {
          roomCode: this.codigo, targetParticipantId, emoji,
        })
        return response.ok
      } catch { return false }
    },
    limparSessao() {
      this.room = null
      this.session = null
      savedSession(null)
    },
    async recuperar() {
      if (!this.session || this.restoring) return
      this.restoring = true
      try {
        const ok = await this.joinRoom(this.session.roomCode, this.session.name)
        if (!ok && this.error?.code === 'ROOM_NOT_FOUND') this.limparSessao()
      } finally { this.restoring = false }
    },
    inicializar() {
      useParticipanteStore().inicializar()
      if (this.initialized) return
      this.initialized = true
      socket.on('connect', () => { this.connected = true; this.recuperar() })
      socket.on('disconnect', () => {
        this.connected = false
        this.pending = false
        this.restoring = false
        this.generation++
      })
      socket.on('connect_error', () => {
        this.connected = false
        this.error = { code: 'CONNECTION_ERROR', message: 'Não foi possível conectar ao servidor.' }
      })
      socket.on('room:state', room => {
        this.room = room
        useParticipanteStore().nome = this.me?.name ?? ''
        this.session = { roomCode: room.code, name: this.me?.name }
        savedSession(this.session)
        this.error = null
      })
      socket.on('room:left', () => this.limparSessao())
      socket.on('room:replaced', () => {
        // Do not erase shared localStorage: the new tab owns the same identity.
        this.room = null
        this.session = null
        this.error = { code: 'SESSION_REPLACED', message: 'Sua participação foi aberta em outra aba.' }
      })
      socket.on('room:error', error => { this.error = error })
      if (socket.connected) this.recuperar()
    },
    async enviar(event, payload) {
      this.inicializar()
      if (this.pending) return false
      this.error = null
      if (!socket.connected) {
        this.error = { code: 'NOT_CONNECTED', message: 'Aguarde a conexão com o servidor e tente novamente.' }
        return false
      }
      this.pending = true
      const generation = this.generation
      try {
        const response = await socket.timeout(8000).emitWithAck(event, {
          ...payload, participantId: this.participantId,
        })
        if (generation !== this.generation) return false
        if (!response.ok) this.error = response.error
        return response.ok
      } catch {
        if (generation === this.generation) this.error = { code: 'REQUEST_TIMEOUT', message: 'O servidor não confirmou a operação. Confira a conexão antes de tentar novamente.' }
        return false
      } finally {
        if (generation === this.generation) this.pending = false
      }
    },
    createRoom(name, cards) { this.inicializar(); return this.enviar('room:create', { name, cards, participantToken: useParticipanteStore().token }) },
    joinRoom(roomCode, name) { this.inicializar(); return this.enviar('room:join', { roomCode, name, participantToken: useParticipanteStore().token }) },
    iniciarVotacao() { return this.enviar('room:start-voting', { roomCode: this.codigo, roundId: this.roundId }) },
    votar(card) { return this.enviar('room:vote', { roomCode: this.codigo, roundId: this.roundId, card }) },
    configurarCartas(cards) { return this.enviar('room:configure-deck', { roomCode: this.codigo, roundId: this.roundId, cards }) },
    revelarVotos() { return this.enviar('room:reveal-votes', { roomCode: this.codigo, roundId: this.roundId }) },
    sair() { return this.enviar('room:leave', { roomCode: this.codigo }) },
    transferirHost(targetParticipantId) { return this.enviar('room:transfer-host', { roomCode: this.codigo, targetParticipantId }) },
  },
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSalaStore, import.meta.hot))
}
