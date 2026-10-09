export const presets = {
  Fibonacci: '0, 0.5, 1, 2, 3, 5, 8, 13, 21',
  Sequencial: '0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10',
  'T-Shirt': 'XS, S, M, L, XL, XXL',
}

// Preview only; the server remains authoritative for validation and normalization.
export function previewDeck(text) {
  return text.split(',').map(value => value.trim().replace(/\s+/g, ' ')).filter(Boolean)
    .map(value => /^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value)) ? String(Number(value)) : value)
    .map(value => /^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value)) ? String(Number(value)) : value)
}
