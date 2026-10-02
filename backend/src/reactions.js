const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { RoomError } = require('./rooms');

const { REACTION_EMOJIS } = require('./reactionEmojis');
const REACTION_COOLDOWN_MS = 700;

function createReactionService(repository, now = () => performance.now()) {
    // One map per room; ownership follows participant identity across sockets.
    const cooldowns = new Map();
    return {
        send(roomCode, participantId, socketId, data) {
            const room = repository.requireMember(roomCode, participantId, socketId);
            if (data?.roomCode !== roomCode) throw new RoomError('NOT_IN_ROOM', 'A reação deve usar a sala desta conexão.');
            if (!room.participants.some(p => p.id === data.targetParticipantId)) {
                throw new RoomError('PARTICIPANT_NOT_FOUND', 'Participante não encontrado nesta sala.');
            }
            if (data.targetParticipantId === participantId) throw new RoomError('SELF_REACTION', 'Escolha outro participante para reagir.');
            if (!REACTION_EMOJIS.includes(data.emoji)) throw new RoomError('INVALID_EMOJI', 'Reação não permitida.');
            const time = now();
            const entries = cooldowns.get(roomCode) ?? new Map();
            for (const [id, last] of entries) {
                if (time - last >= REACTION_COOLDOWN_MS) entries.delete(id);
            }
            if (entries.has(participantId) && time - entries.get(participantId) < REACTION_COOLDOWN_MS) return null;
            entries.set(participantId, time);
            cooldowns.set(roomCode, entries);
            return { id: randomUUID(), fromParticipantId: participantId, targetParticipantId: data.targetParticipantId, emoji: data.emoji };
        },
        clearRoom(roomCode) { cooldowns.delete(roomCode); },
    };
}

module.exports = { createReactionService, REACTION_EMOJIS, REACTION_COOLDOWN_MS };
