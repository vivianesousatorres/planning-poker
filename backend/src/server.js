const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { registerRoomEvents } = require('./socket');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'planning-poker-backend',
    });
});

const io = new Server(server, {
    cors: {
        origin: 'http://localhost:5173',
        methods: ['GET', 'POST'],
    },
});

registerRoomEvents(io);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend rodando na porta ${PORT}`);
});
