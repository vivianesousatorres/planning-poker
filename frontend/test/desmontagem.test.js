import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { dirname, resolve, extname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse, compileScript } from '@vue/compiler-sfc'
import { createRenderer, h, nextTick, reactive } from 'vue'
import { useReacoes } from '../src/composables/useReacoes.js'

// Real SFC client render functions, real Vue lifecycle; deterministic DOM/layout doubles.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cache = await mkdtemp(resolve(root, '.audit-components-'))
const compiled = new Map()
async function compile(file) {
  file = resolve(root, 'src/components', file)
  if (compiled.has(file)) return compiled.get(file)
  const output = resolve(cache, `${compiled.size}.mjs`)
  compiled.set(file, output)
  const { descriptor } = parse(await readFile(file, 'utf8'), { filename: file })
  let code = compileScript(descriptor, { id: `audit-${compiled.size}`, inlineTemplate: true }).content
  for (const [, source] of [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)]) {
    if (!source.startsWith('.')) continue
    let target = resolve(dirname(file), source)
    if (source.endsWith('.vue')) target = await compile(target)
    else if (!extname(target)) target += '.js'
    code = code.replaceAll(`'${source}'`, `'${pathToFileURL(target).href}'`).replaceAll(`"${source}"`, `"${pathToFileURL(target).href}"`)
  }
  await writeFile(output, code)
  return output
}
class NodeDouble {
  constructor(tag) { this.tag = tag; this.children = []; this.parentElement = null; this.style = {}; this.props = {}; this.clientWidth = 200; this.scrollWidth = 20 }
  addEventListener() {}
  removeEventListener() {}
  contains(node) { return node === this || this.children.some(child => child.contains(node)) }
  closest() { return table }
  getBoundingClientRect() { return { left: 100, top: 100, right: 300, bottom: 250, width: 200, height: 150 } }
  focus() { focusCalls++ }
}
const body = new NodeDouble('body'), table = new NodeDouble('table')
let focusCalls = 0
function remove(node) { const parent = node.parentElement; if (parent) parent.children.splice(parent.children.indexOf(node), 1); node.parentElement = null }
const renderer = createRenderer({
  createElement: tag => new NodeDouble(tag), createText: () => new NodeDouble('#text'), createComment: () => new NodeDouble('#comment'),
  setText() {}, setElementText() {}, patchProp(node, key, old, value) { node.props[key] = value },
  insert(node, parent, anchor) { remove(node); node.parentElement = parent; const at = parent.children.indexOf(anchor); parent.children.splice(at < 0 ? parent.children.length : at, 0, node) },
  remove, parentNode: node => node.parentElement,
  nextSibling: node => node.parentElement?.children[node.parentElement.children.indexOf(node) + 1] ?? null,
  querySelector: () => body,
})
function instrument(t) {
  const observers = new Set(), frames = new Map(), timers = new Map(), listeners = []
  const replace = (key, value) => { const previous = Object.getOwnPropertyDescriptor(globalThis, key); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); t.after(() => previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key]) }
  const eventTarget = () => ({
    addEventListener(type, callback, capture = false) { listeners.push({ target: this, type, callback, capture }) },
    removeEventListener(type, callback, capture = false) { const at = listeners.findIndex(entry => entry.target === this && entry.type === type && entry.callback === callback && entry.capture === capture); if (at >= 0) listeners.splice(at, 1) },
  })
  replace('document', { ...eventTarget(), body, documentElement: { clientWidth: 1280 } })
  replace('window', { ...eventTarget(), innerHeight: 720 })
  replace('getComputedStyle', () => ({ fontSize: '26', gridTemplateColumns: '1fr 1fr 1fr' }))
  replace('ResizeObserver', class {
    constructor(callback) { this.callback = callback; this.targets = new Set(); observers.add(this) }
    observe(node) { assert.ok(node instanceof NodeDouble); this.targets.add(node) }
    disconnect() { this.targets.clear(); observers.delete(this) }
  })
  let id = 0
  replace('requestAnimationFrame', callback => { frames.set(++id, callback); return id })
  replace('cancelAnimationFrame', key => frames.delete(key))
  replace('setTimeout', callback => { timers.set(++id, callback); return id })
  replace('clearTimeout', key => timers.delete(key))
  const clean = () => {
    assert.equal(observers.size, 0, 'ResizeObservers retained')
    assert.equal(listeners.length, 0, 'global event listeners retained')
    assert.equal(frames.size, 0, 'animation frames retained')
    assert.equal(timers.size, 0, 'reaction timers retained')
    assert.equal(body.children.length, 0, 'teleported nodes retained')
  }
  t.after(clean)
  return { observers, frames, timers, listeners, clean }
}
let Carta, Picker
test.before(async () => {
  Carta = (await import(pathToFileURL(await compile('CartaParticipante.vue')).href)).default
  Picker = (await import(pathToFileURL(await compile('EmojiPickerPopover.vue')).href)).default
})
test.after(async () => { assert.equal(dirname(cache), root); await rm(cache, { recursive: true, force: true }) })

test('100 montagens de carta/popovers liberam observers, listeners globais e frames de foco', async t => {
  const resources = instrument(t)
  for (let cycle = 0; cycle < 100; cycle++) {
    const props = reactive({ pessoa: { id: 'guest', name: 'Pessoa', votou: true }, voto: 5, revelada: false, seletorAberto: true, pickerAberto: false })
    const app = renderer.createApp({ setup: () => () => h(Carta, props) })
    app.mount(new NodeDouble('root'))
    await nextTick()
    assert.equal(resources.observers.size, 2)
    assert.equal(resources.listeners.length, 4)
    props.seletorAberto = false; props.pickerAberto = true
    await nextTick(); await nextTick()
    assert.equal(resources.observers.size, 2)
    assert.equal(resources.listeners.length, 3)
    assert.equal(resources.frames.size, 1)
    props.voto = 100000; props.revelada = true
    app.unmount()
    await nextTick()
    resources.clean()
  }
})

test('desmontagem imediata durante nextTick não agenda foco nem posicionamento tardio', async t => {
  const resources = instrument(t)
  const before = focusCalls
  for (let cycle = 0; cycle < 100; cycle++) {
    const app = renderer.createApp(Picker, { nome: 'Pessoa', participantId: 'guest', ancora: new NodeDouble('anchor') })
    app.mount(new NodeDouble('root'))
    app.unmount()
    await nextTick()
    resources.clean()
  }
  assert.equal(focusCalls, before)
})

test('desmontagem com reações ativas cancela timers, cooldown, assinatura e watchers', async t => {
  const resources = instrument(t)
  let callback, unsubscribed = 0, trajectoryCalls = 0
  const sala = reactive({ codigo: 'ABCDEF', connected: true, me: { id: 'me' }, participantId: 'me', restoring: false,
    participants: [{ id: 'me' }, { id: 'guest' }],
    assinarReacoes(receive) { callback = receive; return () => { callback = null; unsubscribed++ } }, enviarReacao() { return true },
  })
  for (let cycle = 0; cycle < 100; cycle++) {
    let reactions
    const app = renderer.createApp({ setup() {
      reactions = useReacoes(sala, () => { trajectoryCalls++; return null })
      return () => h('div')
    } })
    app.mount(new NodeDouble('root'))
    callback({ id: `${cycle}`, fromParticipantId: 'me', targetParticipantId: 'guest', emoji: '😂' })
    reactions.reagir('guest', '😂')
    assert.equal(resources.timers.size, 2)
    app.unmount()
    const cleared = reactions.reacoesAtivas.value
    sala.codigo = `ROOM${cycle}`; sala.connected = !sala.connected
    await nextTick()
    assert.equal(reactions.reacoesAtivas.value, cleared, 'watcher ran after unmount')
    assert.equal(reactions.emCooldown.value, false)
    assert.equal(callback, null)
    resources.clean()
    sala.connected = true
  }
  assert.equal(unsubscribed, 100)
  assert.equal(trajectoryCalls, 100)
})


