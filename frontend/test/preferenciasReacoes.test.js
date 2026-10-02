import { test } from 'node:test'
import assert from 'node:assert/strict'
import { usePreferenciasReacoes, selecionarEmojisRapidos, CHAVE_PREFERENCIAS_REACOES } from '../src/composables/usePreferenciasReacoes.js'
import { EMOJIS_RAPIDOS } from '../src/constants/catalogoEmojis.js'
import { reactive, effectScope } from 'vue'
import { useReacoes } from '../src/composables/useReacoes.js'

function storage(valor) {
  const dados = new Map(valor === undefined ? [] : [[CHAVE_PREFERENCIAS_REACOES, valor]])
  return { dados, getItem: key => dados.get(key) ?? null, setItem: (key, value) => dados.set(key, value) }
}

test('sem uso mantém padrões; ranking completa seis posições únicas e desempata por recência', () => {
  assert.deepEqual(selecionarEmojisRapidos({}), EMOJIS_RAPIDOS)
  assert.deepEqual(selecionarEmojisRapidos({ '💩': { count: 15, lastUsedAt: 1 }, '😂': { count: 10, lastUsedAt: 2 }, '🔥': { count: 6, lastUsedAt: 3 } }), ['💩', '😂', '🔥', '👍', '❤️', '😮'])
  assert.deepEqual(selecionarEmojisRapidos({ '💩': { count: 1, lastUsedAt: 1 }, '🔥': { count: 1, lastUsedAt: 2 } }), ['🔥', '💩', '👍', '❤️', '😂', '😮'])
  const usados = Object.fromEntries(['🚀', '🎉', '😎', '🤔', '👀', '💩', '🔥'].map((emoji, i) => [emoji, { count: 8 - i, lastUsedAt: 1 }]))
  assert.equal(selecionarEmojisRapidos(usados).length, 6)
})

test('salva somente count/lastUsedAt e recupera preferências na próxima montagem', () => {
  const local = storage()
  local.dados.set('planning-poker:sala', 'preservar')
  const preferencias = usePreferenciasReacoes(() => local, () => 123456789)
  preferencias.registrarUso('💩')
  preferencias.registrarUso('💩')
  preferencias.registrarUso('🔥')
  assert.deepEqual(JSON.parse(local.getItem(CHAVE_PREFERENCIAS_REACOES)), {
    '💩': { count: 2, lastUsedAt: 123456789 }, '🔥': { count: 1, lastUsedAt: 123456789 },
  })
  assert.equal(local.getItem('planning-poker:sala'), 'preservar')
  assert.deepEqual(usePreferenciasReacoes(() => local).emojisRapidos.value, ['💩', '🔥', '👍', '❤️', '😂', '😮'])
})

test('storage inválido, leitura/escrita indisponível e emoji arbitrário retornam padrões sem erro', () => {
  for (const valor of ['json inválido', 'null', '[]', '"texto"', '{"💩":{"count":-1,"lastUsedAt":1}}', '{"💩":{"count":1,"lastUsedAt":"ontem"}}']) {
    assert.deepEqual(usePreferenciasReacoes(() => storage(valor)).emojisRapidos.value, EMOJIS_RAPIDOS)
  }
  const inacessivel = usePreferenciasReacoes(() => { throw new Error('blocked') })
  assert.doesNotThrow(() => inacessivel.registrarUso('💩'))
  assert.deepEqual(inacessivel.emojisRapidos.value, EMOJIS_RAPIDOS)
  const local = storage(JSON.stringify({ '💩': { count: 1, lastUsedAt: 1 } }))
  local.setItem = () => { throw new Error('quota') }
  const semEscrita = usePreferenciasReacoes(() => local)
  semEscrita.registrarUso('🔥')
  assert.deepEqual(semEscrita.emojisRapidos.value, EMOJIS_RAPIDOS)
  const vazio = storage()
  usePreferenciasReacoes(() => vazio).registrarUso('texto livre')
  assert.equal(vazio.dados.size, 0)
})

test('uso só é registrado pelo broadcast aceito do próprio remetente, nunca por ack, erro ou terceiros', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let receive
  const local = storage()
  const preferencias = usePreferenciasReacoes(() => local, () => 10)
  const sala = reactive({ codigo: 'ABCDEF', participantId: 'jane', connected: true, me: { id: 'jane' }, restoring: false,
    participants: [{ id: 'jane' }, { id: 'viviane' }],
    assinarReacoes(listener) { receive = listener; return () => {} },
    enviarReacao: async () => true, // Also true for server-silenced cooldown: insufficient alone.
  })
  const scope = effectScope()
  const reacoes = scope.run(() => useReacoes(sala, () => null, preferencias.registrarUso))
  await reacoes.reagir('viviane', '💩')
  assert.equal(local.dados.size, 0)
  receive({ id: '1', fromParticipantId: 'viviane', targetParticipantId: 'jane', emoji: '🔥' })
  assert.equal(local.dados.size, 0)
  const aceito = { id: '2', fromParticipantId: 'jane', targetParticipantId: 'viviane', emoji: '💩' }
  receive(aceito)
  receive(aceito)
  assert.equal(JSON.parse(local.getItem(CHAVE_PREFERENCIAS_REACOES))['💩'].count, 1)
  t.mock.timers.tick(700)
  sala.enviarReacao = async () => false
  await reacoes.reagir('viviane', '🔥')
  assert.equal(JSON.parse(local.getItem(CHAVE_PREFERENCIAS_REACOES))['🔥'], undefined)
  assert.equal('preferencias' in sala, false)
  scope.stop()
})
