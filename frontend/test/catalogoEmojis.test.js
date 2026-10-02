import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { CATALOGO_EMOJIS, EMOJIS_RAPIDOS, EMOJIS_PERMITIDOS, filtrarEmojis } from '../src/constants/catalogoEmojis.js'
import { calcularPosicaoPopover, estaNaAreaReacao } from '../src/composables/usePosicionamentoPopover.js'
const require = createRequire(import.meta.url)
const { REACTION_EMOJIS } = require('../../backend/src/reactionEmojis.js')

test('hover permanece aberto no espaço entre carta e balão, acima ou abaixo, e fecha fora', () => {
  const carta = { left: 700, right: 824, top: 500, bottom: 650 }
  const acima = { left: 634, right: 890, top: 448, bottom: 492 }
  const abaixo = { left: 634, right: 890, top: 658, bottom: 702 }
  assert.equal(estaNaAreaReacao(762, 496, carta, acima), true)
  assert.equal(estaNaAreaReacao(762, 654, carta, abaixo), true)
  assert.equal(estaNaAreaReacao(654, 470, carta, acima), true)
  assert.equal(estaNaAreaReacao(900, 496, carta, acima), false)
  assert.equal(estaNaAreaReacao(762, 720, carta, abaixo), false)
})

test('catálogo tem 60 emojis únicos e corresponde exatamente à allowlist do backend', () => {
  assert.equal(CATALOGO_EMOJIS.length, 60)
  assert.equal(new Set(EMOJIS_PERMITIDOS).size, 60)
  assert.deepEqual([...EMOJIS_PERMITIDOS].sort(), [...REACTION_EMOJIS].sort())
  assert.deepEqual(EMOJIS_RAPIDOS, ['👍', '❤️', '😂', '😮', '😢', '🙏'])
  assert.ok(EMOJIS_RAPIDOS.every(emoji => EMOJIS_PERMITIDOS.includes(emoji)))
  assert.ok(CATALOGO_EMOJIS.every(item => item.nome && item.categoria && item.palavrasChave))
})

test('busca em português ignora acentos, usa palavras-chave e combina categoria', () => {
  assert.deepEqual(filtrarEmojis('FOGUETE').map(e => e.emoji), ['🚀'])
  assert.equal(filtrarEmojis('coracao').length, 13)
  assert.deepEqual(filtrarEmojis('gratidao').map(e => e.emoji), ['🙏'])
  assert.deepEqual(filtrarEmojis('coração azul').map(e => e.emoji), ['💙'])
  assert.equal(filtrarEmojis('', 'gestos').length, 12)
  assert.equal(filtrarEmojis('foguete', 'gestos').length, 0)
  assert.equal(filtrarEmojis('sem resultado').length, 0)
})

test('popover respeita mesa e viewport estreito, incluindo redução de largura/altura', () => {
  const mesa = { left: 16, right: 359, top: 100, bottom: 650 }
  const viewport = { width: 375, height: 600 }
  for (const ancora of [
    { left: 24, width: 112, top: 112, bottom: 260 },
    { left: 239, width: 112, top: 500, bottom: 640 },
  ]) {
    const resultado = calcularPosicaoPopover(ancora, mesa, { width: 400, height: 700 }, viewport)
    assert.ok(resultado.left >= 24)
    assert.ok(resultado.left + resultado.maxWidth <= 351)
    assert.ok(resultado.top >= 108)
    assert.ok(resultado.top + resultado.maxHeight <= 592)
  }
})

test('picker expandido prefere a lateral quando há espaço na mesa', () => {
  const posicao = calcularPosicaoPopover(
    { left: 740, width: 124, top: 270, bottom: 420 },
    { left: 300, right: 1250, top: 250, bottom: 700 },
    { width: 320, height: 360 }, { width: 1280, height: 800 },
  )
  assert.equal(posicao.left, 872)
  assert.equal(posicao.top, 270)
})
