const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const { io: connect } = require('socket.io-client');
const { createRoomRepository } = require('../src/rooms');
const { registerRoomEvents } = require('../src/socket');

test('validação, unicidade de códigos, nomes e reentrada por identidade', () => {
    const rooms = createRoomRepository();
    const participantId = randomUUID();
    for (const data of [null, {}, { participantId: 'invalid', name: 'Ana' },
        { participantId, name: ' ' }, { participantId, name: 'Ana', cards: [] },
        { participantId, name: 'Ana', cards: [NaN] }, { participantId, name: 'Ana', cards: [-1] }]) {
        assert.throws(() => rooms.create(data, 'socket'));
    }
    const codes = new Set();
    for (let i = 0; i < 100; i++) {
        const room = rooms.create({ participantId, name: ' Viviane ', cards: [0, 0.5, 1, 1] }, 'old');
        assert.match(room.code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
        assert.ok(!codes.has(room.code));
        codes.add(room.code);
        assert.equal(room.hostId, participantId);
        assert.deepEqual(room.config.cards, [0, 0.5, 1]);
        assert.throws(() => rooms.join({ roomCode: room.code, participantId: randomUUID(), name: ' VIVIANE ' }, 'other'), { code: 'DUPLICATE_NAME' });
        rooms.join({ roomCode: ` ${room.code.toLowerCase()} `, participantId, name: 'Viviane' }, 'new');
        assert.equal(room.participants.length, 1);
        assert.equal(room.participants[0].socketId, 'new');
    }
    assert.throws(() => rooms.join({ roomCode: 'ABSENT', participantId, name: 'Ana' }, 's'), { code: 'ROOM_NOT_FOUND' });
});

function next(socket, event, predicate = () => true) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Timeout: ${event}`)), 3000);
        const listener = value => { if (predicate(value)) { clearTimeout(timeout); socket.off(event, listener); resolve(value); } };
        socket.on(event, listener);
    });
}

test('dois clientes recebem o estado; erros não alteram a sala; reentrada preserva host', async t => {
    const http = createServer();
    const io = new Server(http);
    registerRoomEvents(io);
    await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
    const clients = [];
    t.after(async () => {
        clients.forEach(client => client.disconnect());
        await new Promise(resolve => io.close(resolve));
    });
    async function client() {
        const socket = connect(`http://127.0.0.1:${http.address().port}`, { forceNew: true });
        clients.push(socket);
        await next(socket, 'connect');
        return socket;
    }
    const a = await client();
    const b = await client();
    const hostId = randomUUID();
    let stateA = next(a, 'room:state');
    assert.deepEqual(await a.emitWithAck('room:create', { participantId: hostId, name: 'Viviane' }), { ok: true });
    const initial = await stateA;
    const guestId = randomUUID();
    const errorEvent = next(b, 'room:error');
    const duplicate = await b.emitWithAck('room:join', { roomCode: initial.code, participantId: guestId, name: ' VIVIANE ' });
    assert.equal(duplicate.error.code, 'DUPLICATE_NAME');
    assert.deepEqual(await errorEvent, duplicate.error);
    stateA = next(a, 'room:state');
    const stateB = next(b, 'room:state');
    assert.equal((await b.emitWithAck('room:join', { roomCode: initial.code.toLowerCase(), participantId: guestId, name: 'Ana' })).ok, true);
    const shared = await stateA;
    assert.deepEqual(await stateB, shared);
    assert.equal(shared.participants.length, 2);
    const c = await client();
    stateA = next(c, 'room:state');
    await c.emitWithAck('room:join', { roomCode: initial.code, participantId: hostId, name: 'Viviane' });
    const rejoined = await stateA;
    assert.equal(rejoined.participants.length, 2);
    assert.equal(rejoined.hostId, hostId);
    assert.equal(rejoined.participants[0].socketId, undefined);
});


async function setup(t, grace = 1000) {
    const http = createServer();
    const io = new Server(http);
    registerRoomEvents(io, createRoomRepository(), { reconnectGraceMs: grace });
    await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
    const clients = [];
    t.after(async () => {
        clients.forEach(c => c.socket.disconnect());
        await new Promise(resolve => io.close(resolve));
    });
    async function client(id = randomUUID()) {
        const socket = connect(`http://127.0.0.1:${http.address().port}`, { forceNew: true });
        const c = { socket, id, state: null, packets: [] };
        socket.onAny((event, ...args) => c.packets.push({ event, args }));
        socket.on('room:state', state => { c.state = state; });
        clients.push(c);
        await next(socket, 'connect');
        c.send = async (event, payload = {}) => {
            const ack = await socket.emitWithAck(event, { roomCode: c.state?.code, participantId: id, ...payload });
            c.packets.push({ event: 'ack', args: [ack] });
            return ack;
        };
        return c;
    }
    const host = await client();
    await host.send('room:create', { name: 'Host', cards: [0, 0.5, 3, 5, 13] });
    const guest = await client();
    await guest.send('room:join', { name: 'Guest', roomCode: host.state.code });
    return { host, guest, client };
}

test('votação: autorização, privacidade de todos os payloads, alteração, entrada tardia e nova rodada', async t => {
    const { host, guest, client } = await setup(t);
    assert.equal(host.state.votacao.status, 'aguardando');
    assert.equal((await guest.send('room:start-voting')).error.code, 'HOST_ONLY');
    assert.equal((await host.send('room:vote', { card: 3 })).error.code, 'VOTING_CLOSED');
    assert.equal((await host.send('room:start-voting')).ok, true);
    assert.equal((await host.send('room:start-voting')).error.code, 'VOTING_OPEN');
    assert.equal((await guest.send('room:vote', { card: 99 })).error.code, 'INVALID_CARD');
    assert.equal((await guest.send('room:vote', { card: '3' })).error.code, 'INVALID_CARD');
    assert.equal((await guest.send('room:vote', { participantId: host.id, card: 3 })).error.code, 'INVALID_PARTICIPANT_ID');
    assert.equal((await guest.send('room:vote', { card: 3 })).ok, true);
    assert.equal(guest.state.votacao.votos[guest.id], 3);
    assert.equal((await guest.send('room:vote', { card: 0.5 })).ok, true);
    assert.deepEqual(guest.state.votacao.votos, { [guest.id]: 0.5 });
    await host.send('room:vote', { card: 0 });
    const late = await client();
    await late.send('room:join', { name: 'Late', roomCode: host.state.code });
    assert.equal(late.state.votacao.status, 'votando');
    assert.deepEqual(late.state.votacao.votos, {});
    assert.equal(late.state.participants.find(p => p.id === late.id).votou, false);
    await late.send('room:vote', { card: 13 });
    assert.equal((await guest.send('room:reveal-votes')).error.code, 'HOST_ONLY');
    // Inspect every outbound event/ack, not just the most recent snapshot.
    // Configured cards are necessarily public; no foreign vote mapping/value may exist.
    for (const c of [host, guest, late]) {
        for (const { event, args } of c.packets) {
            if (event === 'room:state') {
                const state = args[0];
                assert.deepEqual(Object.keys(state).sort(), ['code', 'config', 'hostId', 'participants', 'votacao']);
                assert.deepEqual(Object.keys(state.votacao).sort(), ['status', 'votos']);
                assert.ok(Object.keys(state.votacao.votos).every(id => id === c.id));
                for (const p of state.participants) assert.deepEqual(Object.keys(p).sort(), ['id', 'name', 'votou']);
            } else {
                assert.ok(['ack', 'room:error'].includes(event));
                assert.equal(JSON.stringify(args).includes('votos'), false);
            }
        }
    }
    const pending = await client();
    await pending.send('room:join', { name: 'Pending', roomCode: host.state.code });
    await host.send('room:reveal-votes');
    // A command/ack on this client ensures its preceding state has been processed.
    assert.equal((await pending.send('room:vote', { card: 5 })).error.code, 'VOTING_CLOSED');
    assert.deepEqual(pending.state.votacao.votos, { [guest.id]: 0.5, [host.id]: 0, [late.id]: 13 });
    assert.equal(pending.state.participants.find(p => p.id === pending.id).votou, false);
    await host.send('room:start-voting');
    assert.deepEqual(host.state.votacao.votos, {});
    assert.equal(host.state.participants.length, 4);
    assert.ok(host.state.participants.every(p => !p.votou));
    assert.deepEqual(host.state.config.cards, [0, 0.5, 3, 5, 13]);
    const outsider = await client();
    assert.equal((await outsider.send('room:vote', { roomCode: host.state.code, card: 3 })).error.code, 'NOT_IN_ROOM');
});

test('ciclo de vida: reconexão preserva voto, socket antigo não remove, saída transfere host e exclui sala', async t => {
    const { host, guest, client } = await setup(t);
    const code = host.state.code;
    await host.send('room:start-voting');
    await host.send('room:vote', { card: 5 });
    host.socket.disconnect();
    const restored = await client(host.id);
    await restored.send('room:join', { roomCode: code, name: 'Host' });
    assert.equal(restored.state.hostId, host.id);
    assert.equal(restored.state.votacao.votos[host.id], 5);
    assert.equal(restored.state.participants.length, 2);
    const replacement = await client(host.id);
    await replacement.send('room:join', { roomCode: code, name: 'Host' });
    assert.equal((await restored.send('room:vote', { card: 3 })).error.code, 'NOT_IN_ROOM');
    restored.socket.disconnect();
    assert.equal((await replacement.send('room:reveal-votes')).ok, true);
    assert.equal(replacement.state.votacao.votos[host.id], 5);
    const updated = next(guest.socket, 'room:state', state => state.participants.length === 1);
    await replacement.send('room:leave');
    const remaining = await updated;
    assert.equal(remaining.hostId, guest.id);
    assert.deepEqual(remaining.votacao.votos, {});
    await guest.send('room:leave');
    const outsider = await client();
    assert.equal((await outsider.send('room:join', { roomCode: code, name: 'Other' })).error.code, 'ROOM_NOT_FOUND');
});

test('abandono após tolerância remove voto e transfere host; sala vazia é destruída', async t => {
    const { host, guest, client } = await setup(t, 40);
    const code = host.state.code;
    await host.send('room:start-voting');
    await host.send('room:vote', { card: 5 });
    const updated = next(guest.socket, 'room:state', state => state.participants.length === 1);
    host.socket.disconnect();
    const remaining = await updated;
    assert.equal(remaining.hostId, guest.id);
    assert.equal(remaining.participants.length, 1);
    await guest.send('room:reveal-votes');
    assert.deepEqual(guest.state.votacao.votos, {});
    guest.socket.disconnect();
    await new Promise(resolve => setTimeout(resolve, 100));
    const outsider = await client();
    assert.equal((await outsider.send('room:join', { roomCode: code, name: 'Other' })).error.code, 'ROOM_NOT_FOUND');
});

test('repositório ignora remoção por socket antigo e valida sala inexistente', () => {
    const repo = createRoomRepository();
    const participantId = randomUUID();
    const room = repo.create({ participantId, name: 'Host' }, 'old');
    repo.startVoting(room.code, participantId, 'old');
    repo.vote(room.code, participantId, 'old', 0.5);
    repo.join({ participantId, name: 'Host', roomCode: room.code }, 'new');
    assert.equal(repo.remove(room.code, participantId, 'old'), null);
    assert.equal(room.votacao.votos[participantId], 0.5);
    assert.throws(() => repo.vote('ABSENT', participantId, 'new', 1), { code: 'ROOM_NOT_FOUND' });
});


test('mesmo cliente Socket.IO reconecta e mantém voto após o prazo original de remoção', async t => {
    const { host, guest } = await setup(t, 200);
    const code = host.state.code;
    await host.send('room:start-voting');
    await guest.send('room:vote', { card: 0.5 });
    guest.socket.disconnect();
    const connected = next(guest.socket, 'connect');
    guest.socket.connect();
    await connected;
    await guest.send('room:join', { roomCode: code, name: 'Guest' });
    assert.equal(guest.state.votacao.votos[guest.id], 0.5);
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal((await guest.send('room:vote', { card: 3 })).ok, true);
    await host.send('room:reveal-votes');
    assert.equal(host.state.votacao.votos[guest.id], 3);
    assert.equal(host.state.participants.length, 2);
});
