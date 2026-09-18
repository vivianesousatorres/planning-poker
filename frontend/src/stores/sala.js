import { defineStore } from 'pinia'
import { useParticipanteStore } from './participante.js'

const CARTAS_INICIAIS = [0, 0.5, 1, 2, 3, 5, 8, 13, 21]

export const useSalaStore = defineStore('sala', {
  state: () => ({
    codigo: null,
    hostId: null,
    participantes: [],
    cartas: [...CARTAS_INICIAIS],
    votoAtual: null,
    votosRevelados: false,
  }),
  getters: {
    ehHost: (state) =>
      Boolean(state.hostId && state.hostId === useParticipanteStore().id),
  },
  actions: {
    // Estado provisório: existência, nomes únicos e host serão validados pelo servidor.
    iniciar(codigo, criar = false) {
      const participante = useParticipanteStore()
      if (!participante.id || !participante.nome || !codigo.trim()) return false
      this.$reset()
      this.codigo = codigo.trim().toUpperCase()
      this.hostId = criar ? participante.id : null
      this.participantes = [
        { id: participante.id, nome: participante.nome, voto: null },
      ]
      return true
    },
    votar(carta) {
      const atual = this.participantes.find(
        ({ id }) => id === useParticipanteStore().id,
      )
      if (!atual || !this.cartas.includes(carta)) return
      this.votoAtual = carta
      atual.voto = carta
      this.votosRevelados = false
    },
    revelarVotos() {
      if (this.votoAtual !== null) this.votosRevelados = true
    },
    configurarCartas(texto) {
      if (!this.ehHost) return 'Somente o host pode alterar as cartas.'
      const valores = texto.split(',').map((valor) => valor.trim())
      if (
        valores.some(
          (valor) =>
            !/^\d+(\.\d+)?$/.test(valor) || !Number.isFinite(Number(valor)),
        )
      ) {
        return 'Informe números separados por vírgula. Use ponto nos decimais, como 0.5.'
      }
      this.cartas = [...new Set(valores.map(Number))]
      this.votoAtual = null
      this.votosRevelados = false
      this.participantes.forEach((participante) => {
        participante.voto = null
      })
      return null
    },
  },
})
