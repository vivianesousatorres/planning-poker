import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { useSalaStore } from '../src/stores/sala.js'
import { socket } from '../src/services/socket.js'

test('iniciar votação após receber a sala não repete inicialização nem dispara reentrada', async () => {
  socket.disconnect()
  setActivePinia(createPinia())
  const sala = useSalaStore()
  sala.inicializar()
  const listenerCount = socket.listeners('room:state').length
  sala.room = { code: 'ABCDEF', hostId: sala.participantId, participants: [], config: { cards: [1, 3] }, votacao: { status: 'aguardando', votos: {} } }
  sala.session = { roomCode: 'ABCDEF', name: 'Teste' }
  const sent = []
  const originalTimeout = socket.timeout
  socket.connected = true
  socket.timeout = () => ({ emitWithAck: async (event, payload) => {
    sent.push({ event, payload })
    return { ok: true }
  } })
  try {
    assert.equal(await sala.iniciarVotacao(), true)
    assert.deepEqual(sent.map(item => item.event), ['room:start-voting'])
    assert.equal(sent[0].payload.roomCode, 'ABCDEF')
    assert.equal(sala.pending, false)
    assert.equal(socket.listeners('room:state').length, listenerCount)
    assert.equal(await sala.votar(3), true)
    assert.deepEqual(sent.map(item => item.event), ['room:start-voting', 'room:vote'])
  } finally {
    socket.timeout = originalTimeout
    socket.connected = false
    socket.removeAllListeners()
    socket.disconnect()
  }
})
