import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { presets, previewDeck } from '../src/utils/deck.js'
const { normalizeCards } = createRequire(import.meta.url)('../../backend/src/deck.js')

test('todos os presets e prévias correspondem ao deck normalizado no servidor', () => {
  for (const text of [...Object.values(presets), ' 0.50 , 01, XS, ? , ☕ ', '0, 0.5, 1, Nome   longo']) {
    assert.deepEqual(previewDeck(text).map(String), normalizeCards(text).map(String))
  }
})
