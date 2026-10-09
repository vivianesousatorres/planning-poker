const { generateRoomCode } = require('./utils/roomCode');

const { DEFAULT_CARDS, normalizeCards } = require('./deck');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class RoomError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

function validateParticipant(data) {
    if (!data || typeof data !== 'object' || typeof data.participantId !== 'string' || !UUID.test(data.participantId)) {
        throw new RoomError('INVALID_PARTICIPANT_ID', 'Identidade do participante inválida.');
    }
    if (typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 60) {
        throw new RoomError('INVALID_NAME', 'Informe um nome com até 60 caracteres.');
    }
    if (typeof data.participantToken !== 'string' || !UUID.test(data.participantToken)) {
        throw new RoomError('INVALID_SESSION', 'Credencial da sessão inválida.');
    }
    return { id: data.participantId.toLowerCase(), name: data.name.trim(), participantToken: data.participantToken.toLowerCase() };
}

function createRoomRepository() {
    const rooms = new Map();
    return {
        create(data, socketId) {
            const participant = validateParticipant(data);
            let cards;
            try { cards = normalizeCards(data.cards === undefined ? DEFAULT_CARDS : data.cards); }
            catch (error) { throw new RoomError('INVALID_CARDS', error.message); }
            const code = generateRoomCode(rooms);
            const room = {
                code,
                hostId: participant.id,
                votacao: { status: 'aguardando', votos: {}, roundId: 0 },
                participants: [{ ...participant, socketId, online: true }],
                config: { cards: [...new Set(cards)] },
            };
            rooms.set(code, room);
            return room;
        },
        join(data, socketId) {
            const participant = validateParticipant(data);
            const code = typeof data.roomCode === 'string' ? data.roomCode.trim().toUpperCase() : '';
            const room = rooms.get(code);
            if (!room) throw new RoomError('ROOM_NOT_FOUND', 'Sala não encontrada. Confira o código.');
            const existing = room.participants.find(person => person.id === participant.id);
            if (existing && existing.participantToken !== participant.participantToken) {
                throw new RoomError('INVALID_SESSION', 'Não foi possível recuperar esta identidade.');
            }
            if (room.participants.some(person => person.id !== participant.id &&
                person.name.toLowerCase() === participant.name.toLowerCase())) {
                throw new RoomError('DUPLICATE_NAME', 'Já existe um participante com esse nome na sala.');
            }
            if (existing) Object.assign(existing, participant, { socketId, online: true });
            else room.participants.push({ ...participant, socketId, online: true });
            return room;
        },
        disconnect(code, participantId, socketId) {
            const room = rooms.get(code);
            const person = room?.participants.find(p => p.id === participantId && p.socketId === socketId);
            if (!person) return null;
            person.online = false;
            return room;
        },
        // Lifecycle: socket ownership protects reassociations from stale disconnects.
        remove(code, participantId, socketId) {
            const room = rooms.get(code);
            const person = room?.participants.find(p => p.id === participantId && p.socketId === socketId);
            if (!person) return null;
            room.participants = room.participants.filter(p => p !== person);
            delete room.votacao.votos[participantId];
            if (!room.participants.length) rooms.delete(code);
            else if (room.hostId === participantId) room.hostId = room.participants[0].id;
            return room;
        },
        requireMember(code, participantId, socketId) {
            const room = rooms.get(code);
            if (!room) throw new RoomError('ROOM_NOT_FOUND', 'Sala não encontrada. Confira o código.');
            if (!room.participants.some(p => p.id === participantId && p.socketId === socketId)) {
                throw new RoomError('NOT_IN_ROOM', 'Esta conexão não está associada ao participante da sala.');
            }
            return room;
        },
        transferHost(code, participantId, socketId, targetParticipantId) {
            const room = this.requireMember(code, participantId, socketId);
            if (room.hostId !== participantId) throw new RoomError('HOST_ONLY', 'Somente o host pode realizar esta ação.');
            if (!room.participants.some(person => person.id === targetParticipantId)) {
                throw new RoomError('PARTICIPANT_NOT_FOUND', 'Participante não encontrado nesta sala.');
            }
            room.hostId = targetParticipantId;
            return room;
        },
        vote(code, participantId, socketId, card) {
            const room = this.requireMember(code, participantId, socketId);
            if (room.votacao.status !== 'votando') throw new RoomError('VOTING_CLOSED', 'A votação não está aberta.');
            if (!room.config.cards.includes(card)) throw new RoomError('INVALID_CARD', 'Escolha uma carta configurada na sala.');
            room.votacao.votos[participantId] = card;
            return room;
        },
        configureDeck(code, participantId, socketId, input) {
            const room = this.requireMember(code, participantId, socketId);
            if (room.hostId !== participantId) throw new RoomError('HOST_ONLY', 'Somente o host pode realizar esta ação.');
            let cards;
            try { cards = normalizeCards(input); }
            catch (error) { throw new RoomError('INVALID_CARDS', error.message); }
            if (cards.length !== room.config.cards.length || cards.some((card, index) => card !== room.config.cards[index])) {
                room.config.cards = cards;
                room.votacao = { status: 'aguardando', votos: {}, roundId: room.votacao.roundId + 1 };
            }
            return room;
        },
        startVoting(code, participantId, socketId) {
            const room = this.requireMember(code, participantId, socketId);
            if (room.hostId !== participantId) throw new RoomError('HOST_ONLY', 'Somente o host pode realizar esta ação.');
            if (room.votacao.status === 'votando') throw new RoomError('VOTING_OPEN', 'A votação já está aberta.');
            room.votacao = { status: 'votando', votos: {}, roundId: room.votacao.roundId + 1 };
            return room;
        },
        revealVotes(code, participantId, socketId) {
            const room = this.requireMember(code, participantId, socketId);
            if (room.hostId !== participantId) throw new RoomError('HOST_ONLY', 'Somente o host pode realizar esta ação.');
            if (room.votacao.status !== 'votando') throw new RoomError('VOTING_CLOSED', 'A votação não está aberta.');
            room.votacao.status = 'revelada';
            return room;
        },
    };
}

// Never serialize the internal room: every recipient gets an explicit allowlist.
function projectRoom(room, recipientId) {
    const votos = {};
    const participants = room.participants.map(({ id, name, online }) => {
        const votou = Object.hasOwn(room.votacao.votos, id);
        if (votou && (room.votacao.status === 'revelada' || id === recipientId)) {
            votos[id] = room.votacao.votos[id];
        }
        return { id, name, online, votou };
    });
    return {
        code: room.code, hostId: room.hostId, participants,
        config: { cards: [...room.config.cards] },
        votacao: { status: room.votacao.status, votos, roundId: room.votacao.roundId },
    };
}

module.exports = { createRoomRepository, RoomError, projectRoom };
