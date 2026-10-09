import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { useSalaStore } from '../src/stores/sala.js'
import { useParticipanteStore } from '../src/stores/participante.js'
import { socket } from '../src/services/socket.js'

test('transferência aguarda estado do servidor e saída limpa apenas a sessão da sala', async () => {
  socket.disconnect()
  const storage = new Map([['outra-chave', 'preservar']])
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  } })
  setActivePinia(createPinia())
  const sala = useSalaStore()
  sala.inicializar()
  const id = sala.participantId
  const room = { code: 'ABCDEF', hostId: id, participants: [{ id, name: 'Ana' }, { id: 'destino', name: 'Carlos' }], config: { cards: [3] }, votacao: { roundId: 1, status: 'votando', votos: { [id]: 3 } } }
  const receive = (event, value) => socket.listeners(event).forEach(listener => listener(value))
  receive('room:state', room)
  const originalTimeout = socket.timeout
  socket.connected = true
  const sent = []
  socket.timeout = () => ({ emitWithAck: async (event, payload) => {
    sent.push({ event, payload })
    return { ok: true }
  } })
  try {
    assert.equal(await sala.transferirHost('destino'), true)
    assert.deepEqual(sent[0], { event: 'room:transfer-host', payload: { roomCode: 'ABCDEF', participantId: id, targetParticipantId: 'destino' } })
    assert.equal(sala.hostId, id)
    receive('room:state', { ...room, hostId: 'destino' })
    assert.equal(sala.isHost, false)
    assert.equal(sala.meuVoto, 3)
    receive('disconnect')
    assert.equal(sala.session.roomCode, 'ABCDEF')
    await sala.recuperar()
    assert.deepEqual(sent[1], { event: 'room:join', payload: { roomCode: 'ABCDEF', name: 'Ana', participantId: id, participantToken: useParticipanteStore().token } })
    await sala.sair()
    assert.ok(storage.has('planning-poker:sala'))
    receive('room:left')
    assert.equal(sala.room, null)
    assert.equal(sala.session, null)
    assert.equal(storage.has('planning-poker:sala'), false)
    assert.equal(storage.get('planning-poker:participante-id'), id)
    assert.equal(storage.get('outra-chave'), 'preservar')
  } finally {
    socket.timeout = originalTimeout
    socket.connected = false
    socket.removeAllListeners()
    socket.disconnect()
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage)
    else delete globalThis.localStorage
  }
})

test('iniciar votação após receber a sala não repete inicialização nem dispara reentrada', async () => {
  socket.disconnect()
  setActivePinia(createPinia())
  const sala = useSalaStore()
  sala.inicializar()
  const listenerCount = socket.listeners('room:state').length
  sala.room = { code: 'ABCDEF', hostId: sala.participantId, participants: [], config: { cards: [1, 3] }, votacao: { roundId: 0, status: 'aguardando', votos: {} } }
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
    assert.equal(sent[0].payload.roundId, 0)
    assert.equal(sala.pending, false)
    assert.equal(socket.listeners('room:state').length, listenerCount)
    assert.equal(await sala.votar(3), true)
    assert.deepEqual(sent.map(item => item.event), ['room:start-voting', 'room:vote'])
    assert.equal(sent[1].payload.roundId, 0)
  } finally {
    socket.timeout = originalTimeout
    socket.connected = false
    socket.removeAllListeners()
    socket.disconnect()
  }
})

test('reação usa payload mínimo sem bloquear votação e assinatura pode ser removida', async () => {
  socket.disconnect()
  setActivePinia(createPinia())
  const sala = useSalaStore()
  const id = sala.participantId
  sala.room = { code: 'ABCDEF', hostId: id, participants: [{ id, name: 'Jane' }], config: { cards: [3] }, votacao: { roundId: 1, status: 'votando', votos: {} } }
  sala.pending = true
  socket.connected = true
  const originalTimeout = socket.timeout
  const sent = []
  socket.timeout = () => ({ emitWithAck: async (event, payload) => { sent.push({ event, payload }); return { ok: true } } })
  let received
  const stop = sala.assinarReacoes(value => { received = value })
  try {
    assert.equal(await sala.enviarReacao('viviane', '😂'), true)
    assert.deepEqual(sent, [{ event: 'room:reaction', payload: { roomCode: 'ABCDEF', targetParticipantId: 'viviane', emoji: '😂' } }])
    assert.equal(sala.pending, true)
    assert.equal('reacoesAtivas' in sala.$state, false)
    const reaction = { id: '1', fromParticipantId: id, targetParticipantId: 'viviane', emoji: '😂' }
    socket.listeners('room:reaction').forEach(listener => listener(reaction))
    assert.equal(received, reaction)
    stop()
    assert.equal(socket.listeners('room:reaction').length, 0)
  } finally {
    stop()
    socket.timeout = originalTimeout
    socket.connected = false
    socket.removeAllListeners()
    socket.disconnect()
  }
})

test('configuração aguarda estado canônico e preserva erro do servidor', async () => {
  socket.disconnect()
  setActivePinia(createPinia())
  const sala = useSalaStore()
  sala.inicializar()
  const id = sala.participantId
  const room = { code: 'ABCDEF', hostId: id, participants: [{ id, name: 'Host' }], config: { cards: [3] }, votacao: { roundId: 1, status: 'revelada', votos: { [id]: 3 } } }
  socket.listeners('room:state').forEach(listener => listener(room))
  socket.connected = true
  const originalTimeout = socket.timeout
  const sent = []
  let response = { ok: true }
  socket.timeout = () => ({ emitWithAck: async (event, payload) => { sent.push({ event, payload }); return response } })
  try {
    assert.equal(await sala.configurarCartas('S, M, ?, ☕'), true)
    assert.deepEqual(sent[0], { event: 'room:configure-deck', payload: { roomCode: room.code, participantId: id, roundId: sala.roundId, cards: 'S, M, ?, ☕' } })
    assert.deepEqual(sala.cartas, [3])
    assert.equal(sala.meuVoto, 3)
    const updated = { ...room, config: { cards: ['S', 'M', '?', '☕'] }, votacao: { roundId: 0, status: 'aguardando', votos: {} } }
    socket.listeners('room:state').forEach(listener => listener(updated))
    assert.deepEqual(sala.cartas, updated.config.cards)
    assert.equal(sala.meuVoto, undefined)
    assert.equal(sala.resultado, null)
    response = { ok: false, error: { code: 'INVALID_CARDS', message: 'Não repita valores no deck.' } }
    assert.equal(await sala.configurarCartas('S, S'), false)
    assert.equal(sala.error.code, 'INVALID_CARDS')
    assert.deepEqual(sala.cartas, updated.config.cards)
  } finally {
    socket.timeout = originalTimeout
    socket.connected = false
    socket.removeAllListeners()
    socket.disconnect()
  }
})
