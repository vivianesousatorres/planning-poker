const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const tokens = new Map();
function tokenFor(id) { if (!tokens.has(id)) tokens.set(id, randomUUID()); return tokens.get(id); }
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const { io: connect } = require('socket.io-client');
const { createRoomRepository } = require('../src/rooms');
const { registerRoomEvents } = require('../src/socket');
const { createReactionService } = require('../src/reactions');

test('cooldown segue sala/participante na troca de socket e permite limpeza da sala', () => {
    const repository = createRoomRepository();
    const id = randomUUID(), target = randomUUID();
    const room = repository.create({ participantId: id, participantToken: tokenFor(id), name: 'Jane' }, 'old');
    repository.join({ roomCode: room.code, participantId: target, participantToken: tokenFor(target), name: 'Viviane' }, 'target');
    let now = 0;
    const service = createReactionService(repository, () => now);
    const data = { roomCode: room.code, targetParticipantId: target, emoji: '😂' };
    assert.ok(service.send(room.code, id, 'old', data));
    repository.join({ roomCode: room.code, participantId: id, participantToken: tokenFor(id), name: 'Jane' }, 'new');
    assert.throws(() => service.send(room.code, id, 'old', data), { code: 'NOT_IN_ROOM' });
    assert.equal(service.send(room.code, id, 'new', data), null);
    now = 699;
    assert.equal(service.send(room.code, id, 'new', data), null);
    now = 700;
    assert.ok(service.send(room.code, id, 'new', data));
    service.clearRoom(room.code);
    assert.ok(service.send(room.code, id, 'new', data));
});

test('validação, unicidade de códigos, nomes e reentrada por identidade', () => {
    const rooms = createRoomRepository();
    const participantId = randomUUID();
    for (const data of [null, {}, { participantId: 'invalid', name: 'Ana' },
        { participantId, participantToken: tokenFor(participantId), name: ' ' }, { participantId, participantToken: tokenFor(participantId), name: 'Ana', cards: [] },
        { participantId, participantToken: tokenFor(participantId), name: 'Ana', cards: [NaN] }, { participantId, participantToken: tokenFor(participantId), name: 'Ana', cards: [-1] }]) {
        assert.throws(() => rooms.create(data, 'socket'));
    }
    const codes = new Set();
    for (let i = 0; i < 100; i++) {
        const room = rooms.create({ participantId, participantToken: tokenFor(participantId), name: ' Viviane ', cards: [0, 0.5, 1] }, 'old');
        assert.match(room.code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
        assert.ok(!codes.has(room.code));
        codes.add(room.code);
        assert.equal(room.hostId, participantId);
        assert.deepEqual(room.config.cards, [0, 0.5, 1]);
        assert.throws(() => rooms.join({ roomCode: room.code, participantId: randomUUID(), participantToken: randomUUID(), name: ' VIVIANE ' }, 'other'), { code: 'DUPLICATE_NAME' });
        rooms.join({ roomCode: ` ${room.code.toLowerCase()} `, participantId, participantToken: tokenFor(participantId), name: 'Viviane' }, 'new');
        assert.equal(room.participants.length, 1);
        assert.equal(room.participants[0].socketId, 'new');
    }
    assert.throws(() => rooms.join({ roomCode: 'ABSENT', participantId, participantToken: tokenFor(participantId), name: 'Ana' }, 's'), { code: 'ROOM_NOT_FOUND' });
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
    assert.deepEqual(await a.emitWithAck('room:create', { participantId: hostId, participantToken: tokenFor(hostId), name: 'Viviane' }), { ok: true });
    const initial = await stateA;
    const guestId = randomUUID();
    const errorEvent = next(b, 'room:error');
    const duplicate = await b.emitWithAck('room:join', { roomCode: initial.code, participantId: guestId, participantToken: tokenFor(guestId), name: ' VIVIANE ' });
    assert.equal(duplicate.error.code, 'DUPLICATE_NAME');
    assert.deepEqual(await errorEvent, duplicate.error);
    stateA = next(a, 'room:state');
    const stateB = next(b, 'room:state');
    assert.equal((await b.emitWithAck('room:join', { roomCode: initial.code.toLowerCase(), participantId: guestId, participantToken: tokenFor(guestId), name: 'Ana' })).ok, true);
    const shared = await stateA;
    assert.deepEqual(await stateB, shared);
    assert.equal(shared.participants.length, 2);
    const c = await client();
    stateA = next(c, 'room:state');
    await c.emitWithAck('room:join', { roomCode: initial.code, participantId: hostId, participantToken: tokenFor(hostId), name: 'Viviane' });
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
            const ack = await socket.emitWithAck(event, { roomCode: c.state?.code, participantId: id, participantToken: tokenFor(id), roundId: c.state?.votacao.roundId, ...payload });
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

test('UUID público não permite assumir a sessão nem permissões do host', async t => {
    const { host, guest, client } = await setup(t);
    const attacker = await client(host.id);
    const result = await attacker.send('room:join', { roomCode: guest.state.code, name: 'Host', participantToken: randomUUID() });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'INVALID_SESSION');
    assert.equal((await attacker.send('room:start-voting')).error.code, 'NOT_IN_ROOM');
    assert.equal((await host.send('room:start-voting')).ok, true);
    assert.equal(JSON.stringify(guest.packets).includes(tokenFor(host.id)), false);
    for (const participantToken of [undefined, null, 'invalid']) {
        assert.equal((await attacker.send('room:join', { roomCode: guest.state.code, name: 'Host', participantToken })).error.code, 'INVALID_SESSION');
    }
});

test('salas isolam nomes, participantes e votação; entrada após reveal e nova rodada sincronizam todos', async t => {
    const { host, guest, client } = await setup(t);
    const other = await client();
    assert.equal((await other.send('room:create', { name: 'Host' })).ok, true);
    assert.notEqual(other.state.code, host.state.code);
    assert.equal(other.state.participants.length, 1);
    const opening = next(guest.socket, 'room:state', s => s.votacao.status === 'votando');
    await host.send('room:start-voting');
    await opening;
    const voted = next(host.socket, 'room:state', s => s.participants.some(p => p.id === guest.id && p.votou));
    await guest.send('room:vote', { card: 3 });
    assert.deepEqual((await voted).votacao.votos, {});
    await host.send('room:vote', { card: 5 });
    const reveals = [host, guest].map(c => next(c.socket, 'room:state', s => s.votacao.status === 'revelada'));
    await host.send('room:reveal-votes');
    for (const state of await Promise.all(reveals)) assert.deepEqual(state.votacao.votos, { [guest.id]: 3, [host.id]: 5 });
    const late = await client();
    await late.send('room:join', { roomCode: host.state.code, name: 'Late reveal' });
    assert.equal(late.state.votacao.status, 'revelada');
    assert.deepEqual(late.state.votacao.votos, host.state.votacao.votos);
    assert.equal(new Set(late.state.participants.map(p => p.id)).size, 3);
    const resets = [host, guest, late].map(c => next(c.socket, 'room:state', s => s.votacao.status === 'votando'));
    await host.send('room:start-voting');
    for (const state of await Promise.all(resets)) {
        assert.deepEqual(state.votacao.votos, {});
        assert.ok(state.participants.every(p => !p.votou));
        assert.deepEqual(state.config.cards, host.state.config.cards);
    }
    assert.equal(other.packets.filter(p => p.event === 'room:state').length, 1);
    assert.equal(other.state.votacao.status, 'aguardando');
});

test('comandos atrasados e duplicados não alteram uma rodada posterior', async t => {
    const { host, guest } = await setup(t);
    await host.send('room:start-voting');
    const roundId = host.state.votacao.roundId;
    await host.send('room:reveal-votes');
    await host.send('room:start-voting');
    const before = structuredClone(host.state);
    for (const [client, event, payload] of [
        [guest, 'room:vote', { card: 3 }],
        [host, 'room:reveal-votes', {}],
        [host, 'room:start-voting', {}],
        [host, 'room:configure-deck', { cards: 'S, M' }],
    ]) {
        const result = await client.send(event, { ...payload, roundId });
        assert.equal(result.ok, false);
        assert.equal(result.error.code, 'STALE_ROUND');
        assert.deepEqual(host.state, before);
    }
});

test('entradas simultâneas e cinco votos simultâneos convergem sem duplicação', async t => {
    const { host, guest, client } = await setup(t);
    const newcomers = await Promise.all([client(), client(), client()]);
    const all = [host, guest, ...newcomers];
    const joined = next(host.socket, 'room:state', s => s.participants.length === 5);
    const acks = await Promise.all(newcomers.map((c, i) => c.send('room:join', { roomCode: host.state.code, name: `Time ${i}` })));
    assert.ok(acks.every(a => a.ok));
    assert.equal(new Set((await joined).participants.map(p => p.id)).size, 5);
    const opening = all.map(c => next(c.socket, 'room:state', s => s.votacao.status === 'votando'));
    await host.send('room:start-voting');
    await Promise.all(opening);
    const cards = [0, 0.5, 3, 5, 13];
    const voted = next(host.socket, 'room:state', s => s.participants.every(p => p.votou));
    assert.ok((await Promise.all(all.map((c, i) => c.send('room:vote', { card: cards[i] })))).every(a => a.ok));
    assert.deepEqual((await voted).votacao.votos, { [host.id]: 0 });
    const reveals = all.map(c => next(c.socket, 'room:state', s => s.votacao.status === 'revelada'));
    await host.send('room:reveal-votes');
    const expected = Object.fromEntries(all.map((c, i) => [c.id, cards[i]]));
    for (const state of await Promise.all(reveals)) assert.deepEqual(state.votacao.votos, expected);
});

test('voto concorrente com reveal e saída do host durante votação preservam consistência', async t => {
    const { host, guest } = await setup(t);
    const opening = next(guest.socket, 'room:state', s => s.votacao.status === 'votando');
    await host.send('room:start-voting');
    await opening;
    const revealed = next(guest.socket, 'room:state', s => s.votacao.status === 'revelada');
    const [vote, reveal] = await Promise.all([guest.send('room:vote', { card: 3 }), host.send('room:reveal-votes')]);
    assert.equal(reveal.ok, true);
    if (!vote.ok) assert.equal(vote.error.code, 'VOTING_CLOSED');
    const state = await revealed;
    assert.deepEqual(state.votacao.votos, vote.ok ? { [guest.id]: 3 } : {});
    const reopened = next(guest.socket, 'room:state', s => s.votacao.status === 'votando');
    await host.send('room:start-voting');
    await reopened;
    await guest.send('room:vote', { card: 5 });
    const succession = next(guest.socket, 'room:state', s => s.hostId === guest.id && s.participants.length === 1);
    await host.send('room:leave');
    const remaining = await succession;
    assert.equal(remaining.votacao.status, 'votando');
    assert.deepEqual(remaining.votacao.votos, { [guest.id]: 5 });
    assert.deepEqual(remaining.config.cards, [0, 0.5, 3, 5, 13]);
    assert.equal((await guest.send('room:reveal-votes')).ok, true);
});

test('nome duplicado em entradas concorrentes é aceito apenas uma vez', async t => {
    const { host, client } = await setup(t);
    const [a, b] = await Promise.all([client(), client()]);
    const joined = next(host.socket, 'room:state', s => s.participants.length === 3);
    const results = await Promise.all([a, b].map(c => c.send('room:join', { roomCode: host.state.code, name: 'Concorrente' })));
    assert.equal(results.filter(r => r.ok).length, 1);
    assert.equal(results.find(r => !r.ok).error.code, 'DUPLICATE_NAME');
    assert.equal((await joined).participants.filter(p => p.name === 'Concorrente').length, 1);
});

test('reações simultâneas de remetentes distintos chegam a todos sem alterar estado', async t => {
    const { host, guest, client } = await setup(t);
    const third = await client();
    await third.send('room:join', { roomCode: host.state.code, name: 'Terceiro' });
    const before = structuredClone(host.state);
    const received = [host, guest, third].map(c => Promise.all([
        next(c.socket, 'room:reaction', r => r.fromParticipantId === guest.id),
        next(c.socket, 'room:reaction', r => r.fromParticipantId === third.id),
    ]));
    assert.ok((await Promise.all([
        guest.send('room:reaction', { targetParticipantId: host.id, emoji: '👍' }),
        third.send('room:reaction', { targetParticipantId: host.id, emoji: '🔥' }),
    ])).every(r => r.ok));
    const reactions = await Promise.all(received);
    for (const pair of reactions) {
        assert.notEqual(pair[0].id, pair[1].id);
        assert.ok(pair.every(r => r.targetParticipantId === host.id));
        assert.deepEqual(pair, reactions[0]);
    }
    assert.deepEqual(host.state, before);
});

test('payloads inesperados não causam erro interno nem alteração da sala', async t => {
    const { host, guest, client } = await setup(t);
    const outsider = await client();
    const before = structuredClone(host.state);
    for (const payload of [null, [], 'texto', 7, true, {}, { name: 'x' }]) {
        for (const event of ['room:create', 'room:join']) {
            const response = await outsider.socket.timeout(1000).emitWithAck(event, payload);
            assert.equal(response.ok, false);
            assert.notEqual(response.error.code, 'INTERNAL_ERROR');
        }
        for (const event of ['room:vote', 'room:start-voting', 'room:reveal-votes', 'room:configure-deck', 'room:transfer-host', 'room:reaction', 'room:leave']) {
            const response = await guest.socket.timeout(1000).emitWithAck(event, payload);
            assert.equal(response.ok, false);
            assert.notEqual(response.error.code, 'INTERNAL_ERROR');
        }
    }
    assert.deepEqual(host.state, before);
    assert.equal((await host.send('room:start-voting')).ok, true);
});

test('evento sem payload recebe rejeição e acknowledgement sem timeout', async t => {
    const { guest } = await setup(t);
    for (const event of ['room:vote', 'room:reaction', 'room:join']) {
        const response = await guest.socket.timeout(500).emitWithAck(event);
        assert.equal(response.ok, false);
        assert.notEqual(response.error.code, 'INTERNAL_ERROR');
    }
});

test('queda real do transporte reconecta automaticamente e preserva voto/identidade', async t => {
    const { host, guest } = await setup(t, 2000);
    const opening = next(guest.socket, 'room:state', s => s.votacao.status === 'votando');
    await host.send('room:start-voting');
    await opening;
    await guest.send('room:vote', { card: 0.5 });
    const code = guest.state.code;
    guest.socket.io.reconnectionDelay(10);
    guest.socket.io.reconnectionDelayMax(10);
    const restored = next(guest.socket, 'connect');
    guest.socket.io.engine.close();
    await restored;
    assert.equal((await guest.send('room:join', { roomCode: code, name: 'Guest' })).ok, true);
    assert.equal(guest.state.votacao.votos[guest.id], 0.5);
    assert.equal(guest.state.participants.length, 2);
    assert.equal(guest.state.hostId, host.id);
});

test('transferência manual sincroniza todos, valida permissões e preserva a rodada', async t => {
    const { host, guest, client } = await setup(t);
    const third = await client();
    await third.send('room:join', { roomCode: host.state.code, name: 'Carlos' });
    await host.send('room:start-voting');
    await host.send('room:vote', { card: 5 });
    await guest.send('room:vote', { card: 3 });
    assert.equal((await guest.send('room:transfer-host', { targetParticipantId: third.id })).error.code, 'HOST_ONLY');
    for (const targetParticipantId of [undefined, null, randomUUID(), {}]) {
        assert.equal((await host.send('room:transfer-host', { targetParticipantId })).error.code, 'PARTICIPANT_NOT_FOUND');
    }
    assert.equal(host.state.hostId, host.id);
    const updates = [host, guest, third].map(c => next(c.socket, 'room:state', state => state.hostId === third.id));
    assert.equal((await host.send('room:transfer-host', { targetParticipantId: third.id })).ok, true);
    const states = await Promise.all(updates);
    for (const state of states) {
        assert.equal(state.hostId, third.id);
        assert.equal(state.participants.length, 3);
        assert.equal(state.votacao.status, 'votando');
        assert.deepEqual(state.config.cards, [0, 0.5, 3, 5, 13]);
    }
    assert.deepEqual(states.map(state => state.votacao.votos), [{ [host.id]: 5 }, { [guest.id]: 3 }, {}]);
    assert.equal((await host.send('room:transfer-host', { targetParticipantId: guest.id })).error.code, 'HOST_ONLY');
    assert.equal((await host.send('room:reveal-votes')).error.code, 'HOST_ONLY');
    assert.equal((await third.send('room:reveal-votes')).ok, true);
    assert.deepEqual(third.state.votacao.votos, { [host.id]: 5, [guest.id]: 3 });
    assert.equal((await host.send('room:start-voting')).error.code, 'HOST_ONLY');
    assert.equal((await third.send('room:start-voting')).ok, true);
});

test('saída voluntária do participante e do host respeita a ordem dos participantes', async t => {
    const { host, guest, client } = await setup(t);
    const third = await client();
    await third.send('room:join', { roomCode: host.state.code, name: 'Carlos' });
    const updates = [host, third].map(c => next(c.socket, 'room:state', state => state.participants.length === 2));
    const left = next(guest.socket, 'room:left');
    assert.equal((await guest.send('room:leave')).ok, true);
    await left;
    for (const state of await Promise.all(updates)) {
        assert.equal(state.hostId, host.id);
        assert.deepEqual(state.participants.map(p => p.id), [host.id, third.id]);
    }
    assert.equal((await guest.send('room:vote', { card: 3 })).error.code, 'NOT_IN_ROOM');
    await guest.send('room:join', { roomCode: host.state.code, name: 'Guest' });
    const transferred = next(third.socket, 'room:state', state => state.participants.length === 2);
    await host.send('room:leave');
    assert.equal((await transferred).hostId, third.id);
});

test('transferência exige sala existente e associação ao socket atual', () => {
    const repo = createRoomRepository();
    const id = randomUUID();
    const room = repo.create({ participantId: id, participantToken: tokenFor(id), name: 'Ana' }, 'old');
    repo.join({ participantId: id, participantToken: tokenFor(id), name: 'Ana', roomCode: room.code }, 'new');
    assert.throws(() => repo.transferHost(room.code, id, 'old', id), { code: 'NOT_IN_ROOM' });
    assert.throws(() => repo.transferHost('ABSENT', id, 'new', id), { code: 'ROOM_NOT_FOUND' });
});

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
                assert.deepEqual(Object.keys(state.votacao).sort(), ['roundId', 'status', 'votos']);
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
    const room = repo.create({ participantId, participantToken: tokenFor(participantId), name: 'Host' }, 'old');
    repo.startVoting(room.code, participantId, 'old');
    repo.vote(room.code, participantId, 'old', 0.5);
    repo.join({ participantId, participantToken: tokenFor(participantId), name: 'Host', roomCode: room.code }, 'new');
    assert.equal(repo.remove(room.code, participantId, 'old'), null);
    assert.equal(room.votacao.votos[participantId], 0.5);
    assert.throws(() => repo.vote('ABSENT', participantId, 'new', 1), { code: 'ROOM_NOT_FOUND' });
});


test('mesmo cliente Socket.IO reconecta e mantém voto após o prazo original de remoção', async t => {
    const { host, guest } = await setup(t, 200);
    const code = host.state.code;
    const guestOpening = next(guest.socket, 'room:state', s => s.votacao.status === 'votando');
    await host.send('room:start-voting');
    await guestOpening;
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

test('reações sincronizam somente a sala em qualquer fase, sem modificar votação ou host', async t => {
    const { host, guest, client } = await setup(t);
    const outsider = await client();
    await outsider.send('room:create', { name: 'Outra sala' });
    const data = { targetParticipantId: guest.id, emoji: '😂' };
    const original = structuredClone(host.state);
    const received = [host, guest].map(c => next(c.socket, 'room:reaction'));
    assert.equal((await host.send('room:reaction', { ...data, participantId: outsider.id })).ok, true);
    const [a, b] = await Promise.all(received);
    assert.deepEqual(a, b);
    assert.deepEqual(Object.keys(a).sort(), ['emoji', 'fromParticipantId', 'id', 'targetParticipantId']);
    assert.equal(a.fromParticipantId, host.id);
    assert.deepEqual(host.state, original);
    assert.equal((await host.send('room:reaction', data)).ok, true);
    assert.equal(host.packets.filter(p => p.event === 'room:reaction').length, 1);
    const reverse = next(host.socket, 'room:reaction', r => r.fromParticipantId === guest.id);
    await guest.send('room:reaction', { targetParticipantId: host.id, emoji: '💩' });
    assert.notEqual((await reverse).id, a.id);
    for (const emoji of ['x', '<script>', '❤', null, {}]) {
        assert.equal((await host.send('room:reaction', { ...data, emoji })).error.code, 'INVALID_EMOJI');
    }
    assert.equal((await host.send('room:reaction', { ...data, targetParticipantId: host.id })).error.code, 'SELF_REACTION');
    assert.equal((await host.send('room:reaction', { ...data, targetParticipantId: outsider.id })).error.code, 'PARTICIPANT_NOT_FOUND');
    assert.equal((await host.send('room:reaction', { ...data, roomCode: outsider.state.code })).error.code, 'NOT_IN_ROOM');
    const unattached = await client();
    assert.equal((await unattached.send('room:reaction', { ...data, roomCode: host.state.code })).error.code, 'NOT_IN_ROOM');
    await host.send('room:start-voting');
    await host.send('room:vote', { card: 5 });
    await guest.send('room:vote', { card: 3 });
    for (const phase of ['votando', 'revelada']) {
        await new Promise(resolve => setTimeout(resolve, 710));
        if (phase === 'revelada') await host.send('room:reveal-votes');
        const before = structuredClone(host.state);
        const event = next(guest.socket, 'room:reaction');
        await host.send('room:reaction', { ...data, emoji: '🔥' });
        await event;
        assert.deepEqual(host.state, before);
    }
    const transferred = next(guest.socket, 'room:state', s => s.hostId === guest.id);
    await host.send('room:transfer-host', { targetParticipantId: guest.id });
    await transferred;
    assert.equal((await guest.send('room:start-voting')).ok, true);
    assert.equal(outsider.packets.some(p => p.event === 'room:reaction'), false);
    await guest.send('room:leave');
    assert.equal((await host.send('room:reaction', data)).error.code, 'PARTICIPANT_NOT_FOUND');
});

test('deck valida normalização, vazios, duplicados e autorização sem alterar estado', () => {
    const repo = createRoomRepository();
    const id = randomUUID(), guest = randomUUID();
    const room = repo.create({ participantId: id, participantToken: tokenFor(id), name: 'Host' }, 'host');
    assert.deepEqual(room.config.cards, [0, 0.5, 1, 2, 3, 5, 8, 13, 21]);
    repo.join({ participantId: guest, participantToken: tokenFor(guest), name: 'Guest', roomCode: room.code }, 'guest');
    const original = structuredClone(room);
    for (const cards of ['', '1,,2', '1,', '1, 1.0', 'XS, xs', [-1], [Infinity], [null], {}, Array(101).fill('x'), 'a'.repeat(21), '0, -1', '1e2']) {
        assert.throws(() => repo.configureDeck(room.code, id, 'host', cards), { code: 'INVALID_CARDS' });
        assert.deepEqual(room, original);
    }
    assert.throws(() => repo.configureDeck(room.code, guest, 'guest', 'S, M'), { code: 'HOST_ONLY' });
    assert.throws(() => repo.configureDeck(room.code, id, 'old', 'S, M'), { code: 'NOT_IN_ROOM' });
    repo.configureDeck(room.code, id, 'host', ' 0.50 , XS , ? , ☕ ');
    assert.deepEqual(room.config.cards, [0.5, 'XS', '?', '☕']);
    for (const status of ['votando', 'revelada']) {
        room.votacao = { status, votos: { [id]: '?' }, roundId: room.votacao.roundId };
        repo.configureDeck(room.code, id, 'host', [0.5, 'XS', '?', '☕']);
        assert.equal(room.votacao.status, status);
        assert.equal(room.votacao.votos[id], '?');
        repo.configureDeck(room.code, id, 'host', 'S, M');
        assert.equal(room.votacao.status, 'aguardando');
        assert.deepEqual(room.votacao.votos, {});
        repo.configureDeck(room.code, id, 'host', '0.5, XS, ?, ☕');
    }
});

test('deck sincroniza limpeza, entrada, reconexão e transferência; voto antigo é rejeitado', async t => {
    const { host, guest, client } = await setup(t);
    const guestOpening = next(guest.socket, 'room:state', s => s.votacao.status === 'votando');
    await host.send('room:start-voting');
    await guestOpening;
    await guest.send('room:vote', { card: 3 });
    await host.send('room:reveal-votes');
    assert.equal((await guest.send('room:configure-deck', { cards: 'S, M' })).error.code, 'HOST_ONLY');
    const updates = [host, guest].map(c => next(c.socket, 'room:state', s => s.config.cards.includes('☕')));
    assert.equal((await host.send('room:configure-deck', { cards: ' 0.5, S, M, ?, ☕ ' })).ok, true);
    for (const state of await Promise.all(updates)) {
        assert.deepEqual(state.config.cards, [0.5, 'S', 'M', '?', '☕']);
        assert.equal(state.votacao.status, 'aguardando');
        assert.deepEqual(state.votacao.votos, {});
        assert.ok(state.participants.every(p => !p.votou));
    }
    const opening = next(guest.socket, 'room:state', s => s.votacao.status === 'votando');
    await host.send('room:start-voting');
    await opening;
    assert.equal((await guest.send('room:vote', { card: 3 })).error.code, 'INVALID_CARD');
    assert.equal((await guest.send('room:vote', { card: '?' })).ok, true);
    await host.send('room:configure-deck', { cards: '0.50, S, M, ?, ☕' });
    assert.equal(host.state.votacao.status, 'votando');
    const late = await client();
    await late.send('room:join', { roomCode: host.state.code, name: 'Late' });
    assert.deepEqual(late.state.config, host.state.config);
    guest.socket.disconnect();
    const restored = await client(guest.id);
    await restored.send('room:join', { roomCode: host.state.code, name: 'Guest' });
    assert.deepEqual(restored.state.config, host.state.config);
    assert.equal(restored.state.votacao.votos[guest.id], '?');
    await host.send('room:transfer-host', { targetParticipantId: guest.id });
    const changed = next(restored.socket, 'room:state', s => s.config.cards.length === 2);
    assert.equal((await restored.send('room:configure-deck', { cards: 'S, M' })).ok, true);
    assert.equal((await changed).votacao.status, 'aguardando');
    assert.deepEqual(restored.state.votacao.votos, {});
    assert.equal((await host.send('room:configure-deck', { cards: '1, 2' })).error.code, 'HOST_ONLY');
});
