import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia, setActivePinia } from 'pinia'
import { useParticipanteStore } from '../src/stores/participante.js'

test('identidade e credencial privada persistem após recriar a store; storage inválido é recuperado', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const storage = new Map()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  } })
  try {
    setActivePinia(createPinia())
    const first = useParticipanteStore()
    first.inicializar()
    assert.notEqual(first.id, first.token)
    assert.equal(storage.get('planning-poker:participante-token'), first.token)
    setActivePinia(createPinia())
    const restored = useParticipanteStore()
    restored.inicializar()
    assert.equal(restored.id, first.id)
    assert.equal(restored.token, first.token)
    storage.set('planning-poker:participante-id', 'invalid')
    storage.set('planning-poker:participante-token', 'invalid')
    setActivePinia(createPinia())
    const repaired = useParticipanteStore()
    repaired.inicializar()
    assert.notEqual(repaired.id, 'invalid')
    assert.notEqual(repaired.token, 'invalid')
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else delete globalThis.localStorage
  }
})

test('armazenamento bloqueado preserva identidade e credencial em memória', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked') } })
  try {
    setActivePinia(createPinia())
    const participant = useParticipanteStore()
    participant.inicializar()
    const { id, token } = participant
    participant.inicializar()
    assert.equal(participant.id, id)
    assert.equal(participant.token, token)
    assert.notEqual(id, token)
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else delete globalThis.localStorage
  }
})
