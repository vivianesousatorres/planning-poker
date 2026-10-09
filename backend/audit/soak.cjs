// Isolated audit server: no production rooms or processes are touched.
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { randomUUID } = require('node:crypto');
const { createHook } = require('node:async_hooks');
const { writeFileSync } = require('node:fs');
const { Server } = require('socket.io');
const { io: connect } = require('socket.io-client');
const { createRoomRepository } = require('../src/rooms');
const { registerRoomEvents } = require('../src/socket');
const duration = Number(process.argv.find(a => a.startsWith('--duration='))?.split('=')[1] ?? 180000);
const output = process.argv.find(a => a.startsWith('--output='))?.slice(9);
assert.ok(global.gc, 'Run with node --expose-gc');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const pending = new Set();
const hook = createHook({ init(id, type, trigger, resource) {
    if (type === 'Timeout' && /src[\\/]socket\.js/.test(new Error().stack)) pending.add(resource);
} }).enable();
const repo = createRoomRepository();
const known = new Set();
const originalCreate = repo.create;
repo.create = (...args) => { const room = originalCreate(...args); known.add(room.code); return room; };
const originalRemove = repo.remove;
repo.remove = (...args) => {
    const room = originalRemove(...args);
    if (room && !room.participants.length) {
        assert.throws(() => repo.requireMember(room.code, 'absent', 'absent'), { code: 'ROOM_NOT_FOUND' });
        known.delete(room.code);
    }
    return room;
};
const http = createServer();
const io = new Server(http);
registerRoomEvents(io, repo, { reconnectGraceMs: 75 });
const clients = new Set();
let roomsCreated = 0, clientsCreated = 0, reactionsReceived = 0, reconnections = 0;
function listenerCounts() {
    return [http, io, io.engine, io.sockets].map(emitter => Object.fromEntries(
        emitter.eventNames().map(name => [String(name), emitter.listenerCount(name)])));
}
async function client(identity = { participantId: randomUUID(), participantToken: randomUUID(), name: `Pessoa ${clientsCreated}` }) {
    const socket = connect(`http://127.0.0.1:${http.address().port}`, { forceNew: true, reconnection: false, transports: ['websocket'] });
    clients.add(socket); clientsCreated++;
    socket.on('room:state', state => { socket.auditState = state; });
    socket.auditReactions = 0;
    socket.on('room:reaction', () => { reactionsReceived++; socket.auditReactions++; });
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    return { socket, identity };
}
async function emit(person, event, data = {}) {
    const state = person.socket.auditState;
    const result = await person.socket.timeout(3000).emitWithAck(event, {
        ...person.identity, ...(state ? { roomCode: state.code, roundId: state.votacao.roundId } : {}), ...data,
    });
    assert.equal(result.ok, true, JSON.stringify(result));
}
function disconnect(person) {
    person.socket.disconnect(); person.socket.removeAllListeners(); clients.delete(person.socket);
}
async function roomCycle(index) {
    const people = await Promise.all(Array.from({ length: 5 }, () => client()));
    await emit(people[0], 'room:create'); roomsCreated++;
    const code = people[0].socket.auditState.code;
    await Promise.all(people.slice(1).map(person => emit(person, 'room:join', { roomCode: code })));
    await emit(people[0], 'room:start-voting');
    await pause(5);
    await Promise.all(people.map((person, i) => emit(person, 'room:vote', { card: [1, 2, 3, 5, 8][i] })));
    await emit(people[0], 'room:reveal-votes');
    await pause(5);
    assert.equal(Object.keys(people[4].socket.auditState.votacao.votos).length, 5);
    const countReactions = () => people.reduce((sum, person) => sum + person.socket.auditReactions, 0);
    const before = countReactions();
    await Promise.all(people.map((person, i) => emit(person, 'room:reaction', {
        targetParticipantId: people[(i + 1) % 5].identity.participantId, emoji: '😂',
    })));
    await pause(5);
    assert.equal(countReactions() - before, 25);
    // Replacement followed by the old socket disconnect, then a temporary disconnect/rejoin.
    const replacement = await client(people[1].identity);
    await emit(replacement, 'room:join', { roomCode: code });
    disconnect(people[1]); people[1] = replacement; reconnections++;
    disconnect(people[2]);
    await pause(10);
    people[2] = await client(people[2].identity);
    await emit(people[2], 'room:join', { roomCode: code }); reconnections++;
    await pause(85);
    assert.equal(repo.requireMember(code, people[2].identity.participantId, people[2].socket.id).participants.length, 5);
    await emit(people[0], 'room:start-voting');
    for (const [i, person] of people.entries()) {
        if ((index + i) % 2 === 0) await emit(person, 'room:leave');
        disconnect(person);
    }
    await pause(100);
    assert.throws(() => repo.requireMember(code, 'absent', 'absent'), { code: 'ROOM_NOT_FOUND' });
}
async function sample(batch) {
    for (const timer of pending) if (timer._destroyed) pending.delete(timer);
    assert.equal(known.size, 0);
    assert.equal(io.sockets.sockets.size, 0);
    assert.equal(io.engine.clientsCount, 0);
    assert.equal(io.sockets.adapter.rooms.size, 0);
    assert.equal(pending.size, 0);
    assert.equal(clients.size, 0);
    global.gc(); await pause(10); global.gc();
    return { batch, elapsedMs: Date.now() - started, rooms: known.size, sockets: io.sockets.sockets.size,
        connections: io.engine.clientsCount, adapterRooms: io.sockets.adapter.rooms.size,
        departureTimers: pending.size, listeners: listenerCounts(), ...process.memoryUsage() };
}
let started;
(async () => {
    await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
    started = Date.now();
    const samples = [];
    let batch = 0;
    do {
        await Promise.all([0, 1, 2].map(i => roomCycle(batch * 3 + i)));
        const current = await sample(++batch);
        if (batch === 5 || batch % 20 === 0) {
            samples.push(current);
            console.log(JSON.stringify({ batch, roomsCreated, clientsCreated, heapUsed: current.heapUsed, rss: current.rss }));
        }
        await pause(150);
    } while (Date.now() - started < duration || batch < 10);
    samples.push(await sample(batch));
    const baseline = samples[0], final = samples.at(-1);
    assert.deepEqual(final.listeners, baseline.listeners);
    // Allow normal V8/JIT/cache warmup; fail on substantial retained growth after forced GC.
    assert.ok(final.heapUsed - baseline.heapUsed < Math.max(2 * 1024 * 1024, baseline.heapUsed * .2), 'Persistent retained heap growth');
    const result = { durationMs: Date.now() - started, batches: batch, roomsCreated, clientsCreated,
        reactionsReceived, reconnections, graceMs: 75, samples,
        heapDeltaBytes: final.heapUsed - baseline.heapUsed, rssDeltaBytes: final.rss - baseline.rss };
    if (output) writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ result: 'PASS', ...result, samples: samples.length }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    for (const socket of clients) { socket.disconnect(); socket.removeAllListeners(); }
    await pause(100);
    await new Promise(resolve => io.close(resolve)); hook.disable();
});
