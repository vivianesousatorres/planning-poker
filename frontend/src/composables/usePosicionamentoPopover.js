import { ref, nextTick, onMounted, onScopeDispose } from 'vue'

export function estaNaAreaReacao(x, y, carta, balao) {
  return x >= Math.min(carta.left, balao.left) && x <= Math.max(carta.right, balao.right) &&
    y >= Math.min(carta.top, balao.top) - 10 && y <= Math.max(carta.bottom, balao.bottom) + 10
}

export function calcularPosicaoPopover(ancora, mesa, painel, viewport) {
  const esquerda = Math.max(8, mesa.left + 8)
  const direita = Math.min(viewport.width - 8, mesa.right - 8)
  const topo = Math.max(8, mesa.top + 8)
  const fundo = Math.min(viewport.height - 8, mesa.bottom - 8)
  const maxWidth = Math.max(0, direita - esquerda)
  const maxHeight = Math.max(0, fundo - topo)
  const width = Math.min(painel.width, maxWidth)
  const height = Math.min(painel.height, maxHeight)
  let left = Math.max(esquerda, Math.min(ancora.left + ancora.width / 2 - width / 2, direita - width))
  const acima = ancora.top - height - 8
  let preferido = acima >= topo ? acima : ancora.bottom + 8
  // Expanded pickers prefer the side when there is room, keeping the table controls visible.
  if (height > 96 && ancora.left + ancora.width + 8 + width <= direita) {
    left = ancora.left + ancora.width + 8
    preferido = ancora.top
  } else if (height > 96 && ancora.left - width - 8 >= esquerda) {
    left = ancora.left - width - 8
    preferido = ancora.top
  }
  const top = Math.max(topo, Math.min(preferido, fundo - height))
  return { left, top, maxWidth, maxHeight }
}

export function usePosicionamentoPopover(ancora, painel, fechar) {
  const estilo = ref({ visibility: 'hidden' })
  let observer
  let desmontado = false
  async function posicionar() {
    const elemento = ancora.value
    const alvo = painel.value
    if (!elemento || !alvo || desmontado) return
    const mesa = elemento.closest('.poker-table')?.getBoundingClientRect()
    if (!mesa) return
    const viewport = { width: document.documentElement.clientWidth, height: window.innerHeight }
    let posicao = calcularPosicaoPopover(elemento.getBoundingClientRect(), mesa, alvo.getBoundingClientRect(), viewport)
    estilo.value = { ...estilo.value, maxWidth: `${posicao.maxWidth}px`, maxHeight: `${posicao.maxHeight}px` }
    await nextTick()
    if (desmontado || !painel.value || !ancora.value) return
    posicao = calcularPosicaoPopover(ancora.value.getBoundingClientRect(), mesa, painel.value.getBoundingClientRect(), viewport)
    estilo.value = { left: `${posicao.left}px`, top: `${posicao.top}px`, maxWidth: `${posicao.maxWidth}px`, maxHeight: `${posicao.maxHeight}px` }
  }
  function fora(event) {
    if (!painel.value?.contains(event.target) && !ancora.value?.contains(event.target)) fechar('fora')
  }
  onMounted(() => {
    posicionar()
    observer = new ResizeObserver(posicionar)
    if (ancora.value) observer.observe(ancora.value)
    if (painel.value) observer.observe(painel.value)
    const mesa = ancora.value?.closest('.poker-table')
    if (mesa) observer.observe(mesa)
    document.addEventListener('pointerdown', fora)
    window.addEventListener('resize', posicionar)
    window.addEventListener('scroll', posicionar, true)
  })
  onScopeDispose(() => {
    desmontado = true
    observer?.disconnect()
    document.removeEventListener('pointerdown', fora)
    window.removeEventListener('resize', posicionar)
    window.removeEventListener('scroll', posicionar, true)
  })
  return { estilo }
}
