const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createRoomRepository } = require('../src/rooms');
const { createReactionService } = require('../src/reactions');
const { REACTION_EMOJIS } = require('../src/reactionEmojis');

test('todos os 60 emojis do catálogo são aceitos; texto livre continua rejeitado', () => {
    const repository = createRoomRepository();
    const id = randomUUID(), target = randomUUID();
    const room = repository.create({ participantId: id, name: 'Jane' }, 'sender');
    repository.join({ roomCode: room.code, participantId: target, name: 'Viviane' }, 'target');
    const before = structuredClone(room);
    let now = 0;
    const service = createReactionService(repository, () => now);
    const ids = new Set();
    for (const emoji of REACTION_EMOJIS) {
        const result = service.send(room.code, id, 'sender', { roomCode: room.code, targetParticipantId: target, emoji });
        assert.equal(result.emoji, emoji);
        ids.add(result.id);
        now += 700;
    }
    assert.equal(ids.size, 60);
    assert.deepEqual(room, before);
    for (const emoji of ['texto livre', '👍 texto', '❤', '', ['👍'], null]) {
        assert.throws(() => service.send(room.code, id, 'sender', { roomCode: room.code, targetParticipantId: target, emoji }), { code: 'INVALID_EMOJI' });
    }
});
