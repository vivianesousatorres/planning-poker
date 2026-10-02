export const CATEGORIAS_EMOJI = Object.freeze([
  { id: 'emocoes', nome: 'Emoções', icone: '😂' },
  { id: 'gestos', nome: 'Gestos', icone: '👍' },
  { id: 'coracoes', nome: 'Corações', icone: '❤️' },
  { id: 'festa', nome: 'Festa', icone: '🎉' },
  { id: 'diversao', nome: 'Diversão', icone: '💩' },
].map(Object.freeze))

const grupos = {
  emocoes: [
    ['😂', 'Chorando de rir', 'risada engraçado hahaha'], ['😮', 'Surpreso', 'surpresa espanto'],
    ['😢', 'Triste', 'choro lágrima'], ['😎', 'Óculos escuros', 'legal estiloso'],
    ['🤔', 'Pensativo', 'pensar dúvida'], ['😍', 'Apaixonado', 'amor olhos coração'],
    ['🥳', 'Comemorando', 'festa parabéns'], ['😭', 'Chorando muito', 'triste lágrimas'],
    ['😡', 'Bravo', 'raiva irritado'], ['😴', 'Dormindo', 'sono cansado'],
    ['😱', 'Assustado', 'medo susto'], ['🤯', 'Cabeça explodindo', 'chocado surpresa'],
  ],
  gestos: [
    ['👍', 'Curtir', 'positivo sim aprovado'], ['👎', 'Não curtir', 'negativo não reprovado'],
    ['👏', 'Palmas', 'aplauso parabéns'], ['🙏', 'Mãos juntas', 'obrigado oração gratidão'],
    ['👋', 'Acenando', 'oi tchau'], ['👌', 'Tudo certo', 'ok perfeito'],
    ['✌️', 'Vitória', 'paz dois'], ['🤞', 'Dedos cruzados', 'sorte torcida'],
    ['💪', 'Força', 'músculo forte'], ['🙌', 'Mãos levantadas', 'celebração viva'],
    ['🤝', 'Aperto de mãos', 'acordo parceria'], ['🫶', 'Mãos em coração', 'carinho amor'],
  ],
  coracoes: [
    ['❤️', 'Coração vermelho', 'amor'], ['🧡', 'Coração laranja', 'amor'],
    ['💛', 'Coração amarelo', 'amor'], ['💚', 'Coração verde', 'amor'],
    ['💙', 'Coração azul', 'amor'], ['💜', 'Coração roxo', 'amor'],
    ['🖤', 'Coração preto', 'amor'], ['🤍', 'Coração branco', 'amor'],
    ['🤎', 'Coração marrom', 'amor'], ['💔', 'Coração partido', 'triste'],
    ['💕', 'Dois corações', 'amor carinho'], ['💖', 'Coração brilhante', 'amor brilho'],
  ],
  festa: [
    ['🔥', 'Fogo', 'quente incrível'], ['🎉', 'Confete', 'festa parabéns celebração'],
    ['🎊', 'Bola de confete', 'festa celebração'], ['🚀', 'Foguete', 'lançamento rápido'],
    ['✨', 'Brilhos', 'especial magia'], ['⭐', 'Estrela', 'destaque'],
    ['🌟', 'Estrela brilhante', 'destaque brilho'], ['🏆', 'Troféu', 'campeão prêmio'],
    ['🥇', 'Medalha de ouro', 'primeiro vencedor'], ['🎯', 'Alvo', 'acerto precisão'],
    ['🎈', 'Balão', 'festa aniversário'], ['🎁', 'Presente', 'surpresa aniversário'],
  ],
  diversao: [
    ['💩', 'Cocô', 'coco porcaria'], ['👀', 'Olhos', 'olhando atenção'],
    ['🤡', 'Palhaço', 'piada brincadeira'], ['👻', 'Fantasma', 'susto'],
    ['💀', 'Caveira', 'morte'], ['🤖', 'Robô', 'tecnologia'],
    ['👽', 'Alienígena', 'alien espaço'], ['🐱', 'Gato', 'gatinho animal'],
    ['🐶', 'Cachorro', 'cão animal'], ['🍕', 'Pizza', 'comida fome'],
    ['☕', 'Café', 'pausa energia'], ['💡', 'Ideia', 'lâmpada solução'],
  ],
}

export const CATALOGO_EMOJIS = Object.freeze(Object.entries(grupos).flatMap(([categoria, emojis]) =>
  emojis.map(([emoji, nome, palavrasChave]) => Object.freeze({ emoji, nome, categoria, palavrasChave }))))
export const EMOJIS_RAPIDOS = Object.freeze(['👍', '❤️', '😂', '😮', '😢', '🙏'])
export const EMOJIS_PERMITIDOS = Object.freeze(CATALOGO_EMOJIS.map(item => item.emoji))

const normalizar = texto => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR').trim()
export function filtrarEmojis(busca = '', categoria = 'todos') {
  const termos = normalizar(busca).split(/\s+/).filter(Boolean)
  return CATALOGO_EMOJIS.filter(item => (categoria === 'todos' || item.categoria === categoria) &&
    termos.every(termo => normalizar(`${item.nome} ${item.palavrasChave} ${item.emoji}`).includes(termo)))
}
