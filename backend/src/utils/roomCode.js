const { randomInt } = require('node:crypto');

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateRoomCode(rooms) {
    let code;
    do {
        code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    } while (rooms.has(code));
    return code;
}

module.exports = { generateRoomCode };
