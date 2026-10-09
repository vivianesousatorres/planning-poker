const DEFAULT_CARDS = [0, 0.5, 1, 2, 3, 5, 8, 13, 21];

function normalizeCards(input) {
    const values = typeof input === 'string' ? input.split(',') : input;
    if (!Array.isArray(values) || !values.length || values.length > 100) {
        throw new Error('Informe de 1 a 100 cartas.');
    }
    const cards = values.map(value => {
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
        if (typeof value !== 'string') throw new Error('Carta inválida.');
        const label = value.trim().replace(/\s+/g, ' ');
        if (!label || label.length > 20 || label.includes(',') || /[\x00-\x1f\x7f]/.test(label)) {
            throw new Error('Cada carta deve ter de 1 a 20 caracteres e não pode estar vazia.');
        }
        if (/^\d+(?:\.\d+)?$/.test(label)) {
            const number = Number(label);
            if (!Number.isFinite(number)) throw new Error('Número inválido.');
            return number;
        }
        if (/^[+-]?\d/.test(label)) throw new Error('Use números não negativos com ponto nos decimais.');
        return label;
    });
    if (new Set(cards.map(card => String(card).toLowerCase())).size !== cards.length) {
        throw new Error('Não repita valores no deck.');
    }
    return cards;
}

module.exports = { DEFAULT_CARDS, normalizeCards };
