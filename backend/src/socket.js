const { createRoomRepository, RoomError, projectRoom } = require('./rooms');

function registerRoomEvents(io, repository = createRoomRepository(), { reconnectGraceMs = 60000 } = {}) {
    const departures = new Map();
    const key = (code, id) => `${code}:${id}`;
    function cancelDeparture(code, id) {
        const entry = key(code, id);
        clearTimeout(departures.get(entry));
        departures.delete(entry);
    }
    function publish(room) {
        for (const person of room.participants) {
            io.to(person.socketId).emit('room:state', projectRoom(room, person.id));
        }
    }
    io.on('connection', socket => {
        function handle(action) {
            return async (data, acknowledge) => {
                try {
                    const joining = action === 'create' || action === 'join';
                    let room;
                    if (joining) {
                        if (socket.data.roomCode && (action === 'create' ||
                            socket.data.roomCode !== String(data?.roomCode ?? '').trim().toUpperCase())) {
                            throw new RoomError('ALREADY_IN_ROOM', 'Esta conexão já está em uma sala.');
                        }
                        if (socket.data.participantId && socket.data.participantId !==
                            (typeof data?.participantId === 'string' ? data.participantId.toLowerCase() : null)) {
                            throw new RoomError('INVALID_PARTICIPANT_ID', 'A identidade desta conexão não pode ser alterada.');
                        }
                        room = repository[action](data, socket.id);
                        const participantId = data.participantId.toLowerCase();
                        cancelDeparture(room.code, participantId);
                        // A second tab takes ownership; the old socket cannot act or receive votes.
                        for (const other of io.sockets.sockets.values()) {
                            if (other.id !== socket.id && other.data.roomCode === room.code &&
                                other.data.participantId === participantId) {
                                other.leave(room.code);
                                other.data = {};
                                other.emit('room:replaced');
                            }
                        }
                        socket.data.roomCode = room.code;
                        socket.data.participantId = participantId;
                        await socket.join(room.code);
                    } else {
                        const { roomCode, participantId } = socket.data;
                        if (!roomCode) throw new RoomError('NOT_IN_ROOM', 'Entre na sala antes de realizar esta ação.');
                        if (data?.roomCode !== roomCode || data?.participantId !== participantId) {
                            throw new RoomError('INVALID_PARTICIPANT_ID', 'A ação deve usar a identidade e sala desta conexão.');
                        }
                        if (action === 'leave') {
                            repository.requireMember(roomCode, participantId, socket.id);
                            cancelDeparture(roomCode, participantId);
                            room = repository.remove(roomCode, participantId, socket.id);
                            await socket.leave(roomCode);
                            socket.data = {};
                            socket.emit('room:left');
                        } else if (action === 'transferHost') {
                            room = repository.transferHost(roomCode, participantId, socket.id, data?.targetParticipantId);
                        } else room = repository[action](roomCode, participantId, socket.id, data?.card);
                    }
                    publish(room);
                    if (typeof acknowledge === 'function') acknowledge({ ok: true });
                } catch (error) {
                    const payload = error instanceof RoomError
                        ? { code: error.code, message: error.message }
                        : { code: 'INTERNAL_ERROR', message: 'Não foi possível processar a sala.' };
                    if (!(error instanceof RoomError)) console.error(error);
                    socket.emit('room:error', payload);
                    if (typeof acknowledge === 'function') acknowledge({ ok: false, error: payload });
                }
            };
        }
        socket.on('room:create', handle('create'));
        socket.on('room:join', handle('join'));
        socket.on('room:leave', handle('leave'));
        socket.on('room:transfer-host', handle('transferHost'));
        socket.on('room:start-voting', handle('startVoting'));
        socket.on('room:vote', handle('vote'));
        socket.on('room:reveal-votes', handle('revealVotes'));
        socket.on('disconnect', () => {
            const { roomCode, participantId } = socket.data;
            if (!roomCode) return;
            cancelDeparture(roomCode, participantId);
            const timer = setTimeout(() => {
                departures.delete(key(roomCode, participantId));
                const room = repository.remove(roomCode, participantId, socket.id);
                if (room) publish(room);
            }, reconnectGraceMs);
            timer.unref();
            departures.set(key(roomCode, participantId), timer);
        });
    });
}

module.exports = { registerRoomEvents };
