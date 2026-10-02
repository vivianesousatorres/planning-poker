import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reactive, effectScope, nextTick } from 'vue'
import { useReacoes } from '../src/composables/useReacoes.js'

test('reações simultâneas expiram individualmente, saída remove alvo e unmount cancela assinatura/timers', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let receive, unsubscribed = 0, sends = 0
  const sala = reactive({ codigo: 'ABCDEF', connected: true, me: { id: 'jane' }, participantId: 'jane', restoring: false,
    participants: [{ id: 'jane' }, { id: 'viviane' }],
    assinarReacoes(callback) { receive = callback; return () => { unsubscribed++ } },
    enviarReacao() { sends++; return true },
  })
  const scope = effectScope()
  const trajetos = []
  const reactions = scope.run(() => useReacoes(sala, reaction => {
    trajetos.push([reaction.fromParticipantId, reaction.targetParticipantId])
    return { x: 120, y: -200 }
  }))
  const reaction = { id: '1', fromParticipantId: 'jane', targetParticipantId: 'viviane', emoji: '😂' }
  receive(reaction)
  assert.deepEqual(trajetos, [['jane', 'viviane']])
  assert.deepEqual(reactions.reacoesAtivas.value[0].trajeto, { x: 120, y: -200 })
  t.mock.timers.tick(700)
  receive({ ...reaction, id: '2', emoji: '🔥' })
  assert.equal(reactions.reacoesAtivas.value.length, 2)
  receive({ ...reaction, id: '2' })
  receive({ ...reaction, id: 'invalid', emoji: 'x' })
  assert.equal(reactions.reacoesAtivas.value.length, 2)
  t.mock.timers.tick(400)
  assert.equal(reactions.reacoesAtivas.value.length, 2)
  t.mock.timers.tick(900)
  assert.deepEqual(reactions.reacoesAtivas.value.map(r => r.id), ['2'])
  sala.participants = [{ id: 'jane' }]
  await nextTick()
  assert.equal(reactions.reacoesAtivas.value.length, 0)
  sala.participants.push({ id: 'viviane' })
  receive({ ...reaction, id: '3' })
  reactions.reagir('jane', '😂')
  assert.equal(sends, 0)
  reactions.reagir('viviane', '😂')
  reactions.reagir('viviane', '🔥')
  assert.equal(sends, 1)
  assert.equal(reactions.emCooldown.value, true)
  t.mock.timers.tick(700)
  assert.equal(reactions.emCooldown.value, false)
  sala.connected = false
  await nextTick()
  assert.equal(reactions.reacoesAtivas.value.length, 0)
  sala.connected = true
  await nextTick()
  receive({ ...reaction, id: '4' })
  reactions.reagir('viviane', '👏')
  scope.stop()
  assert.equal(unsubscribed, 1)
  assert.equal(reactions.reacoesAtivas.value.length, 0)
  assert.equal(reactions.emCooldown.value, false)
  t.mock.timers.tick(10000)
  assert.equal(reactions.reacoesAtivas.value.length, 0)
})
