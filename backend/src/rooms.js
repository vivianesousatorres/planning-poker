const { generateRoomCode } = require('./utils/roomCode');

const DEFAULT_CARDS = [0, 0.5, 1, 2, 3, 5, 8, 13, 21];
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
    return { id: data.participantId.toLowerCase(), name: data.name.trim() };
}

function createRoomRepository() {
    const rooms = new Map();
    return {
        create(data, socketId) {
            const participant = validateParticipant(data);
            const cards = data.cards === undefined ? DEFAULT_CARDS : data.cards;
            if (!Array.isArray(cards) || !cards.length || cards.length > 100 ||
                cards.some(card => typeof card !== 'number' || !Number.isFinite(card) || card < 0)) {
                throw new RoomError('INVALID_CARDS', 'Informe de 1 a 100 cartas numéricas não negativas.');
            }
            const code = generateRoomCode(rooms);
            const room = {
                code,
                hostId: participant.id,
                votacao: { status: 'aguardando', votos: {} },
                participants: [{ ...participant, socketId }],
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
            if (room.participants.some(person => person.id !== participant.id &&
                person.name.toLowerCase() === participant.name.toLowerCase())) {
                throw new RoomError('DUPLICATE_NAME', 'Já existe um participante com esse nome na sala.');
            }
            const existing = room.participants.find(person => person.id === participant.id);
            if (existing) Object.assign(existing, participant, { socketId });
            else room.participants.push({ ...participant, socketId });
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
        vote(code, participantId, socketId, card) {
            const room = this.requireMember(code, participantId, socketId);
            if (room.votacao.status !== 'votando') throw new RoomError('VOTING_CLOSED', 'A votação não está aberta.');
            if (!room.config.cards.includes(card)) throw new RoomError('INVALID_CARD', 'Escolha uma carta configurada na sala.');
            room.votacao.votos[participantId] = card;
            return room;
        },
        startVoting(code, participantId, socketId) {
            const room = this.requireMember(code, participantId, socketId);
            if (room.hostId !== participantId) throw new RoomError('HOST_ONLY', 'Somente o host pode realizar esta ação.');
            if (room.votacao.status === 'votando') throw new RoomError('VOTING_OPEN', 'A votação já está aberta.');
            room.votacao = { status: 'votando', votos: {} };
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
    const participants = room.participants.map(({ id, name }) => {
        const votou = Object.hasOwn(room.votacao.votos, id);
        if (votou && (room.votacao.status === 'revelada' || id === recipientId)) {
            votos[id] = room.votacao.votos[id];
        }
        return { id, name, votou };
    });
    return {
        code: room.code, hostId: room.hostId, participants,
        config: { cards: [...room.config.cards] },
        votacao: { status: room.votacao.status, votos },
    };
}

module.exports = { createRoomRepository, RoomError, projectRoom };
