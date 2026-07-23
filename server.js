const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;
const SCORES_FILE = path.join(__dirname, 'scores.json');

// --- Middlewares ---
app.use(cors());
app.use(express.json());

// Servir la carpeta estática 'Public' (P mayúscula _obligatoria para Linux/Render)
app.use(express.static(path.join(__dirname, 'public')));

// --- Rutas de navegación ---
app.get(['/', '/juego'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Puntuaciones persistentes en scores.json ---
let scoreboard = {}; // { username: { wins, losses, draws } }

function loadScores() {
    try {
        if (fs.existsSync(SCORES_FILE)) {
            const raw = fs.readFileSync(SCORES_FILE, 'utf8');
            scoreboard = JSON.parse(raw) || {};
        } else {
            scoreboard = {};
        }
    } catch (err) {
        console.error('Error leyendo scores.json:', err);
        scoreboard = {};
    }
}

function saveScores() {
    try {
        fs.writeFileSync(SCORES_FILE, JSON.stringify(scoreboard, null, 2), 'utf8');
    } catch (err) {
        console.error('Error guardando scores.json:', err);
    }
}

function ensureUser(username) {
    if (!username) return;
    if (!scoreboard[username]) {
        scoreboard[username] = { wins: 0, losses: 0, draws: 0 };
    }
}

function recordResult(winner, loser, isDraw = false) {
    if (isDraw) {
        ensureUser(winner);
        ensureUser(loser);
        scoreboard[winner].draws++;
        scoreboard[loser].draws++;
    } else {
        ensureUser(winner);
        ensureUser(loser);
        scoreboard[winner].wins++;
        scoreboard[loser].losses++;
    }
    saveScores();
}

function getTop(n = 5) {
    const arr = Object.keys(scoreboard).map(u => {
        const s = scoreboard[u];
        return { username: u, wins: s.wins, losses: s.losses, draws: s.draws, score: s.wins * 3 + s.draws };
    });
    arr.sort((a, b) => b.score - a.score || b.wins - a.wins || b.draws - a.draws);
    return arr.slice(0, n);
}

loadScores();

// --- Lógica del juego Tres en Raya ---
function createEmptyBoard() {
    return Array(9).fill(null);
}

function checkWinner(board) {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6]
    ];
    for (const [a, b, c] of lines) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    }
    if (board.every(cell => cell !== null)) return 'draw';
    return null;
}

// Estado de las salas: { roomId: { board, players: {socketId: {symbol, username}}, turn: symbol, sockets: [id,id] } }
const rooms = {};

io.on('connection', socket => {
    console.log('Nuevo cliente conectado:', socket.id);

    // Crear Sala
    socket.on('createRoom', (username, callback) => {
        username = (username || 'Anon').trim().slice(0, 20);
        const roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
        rooms[roomId] = {
            board: createEmptyBoard(),
            players: {},
            turn: 'X',
            sockets: []
        };
        socket.join(roomId);
        rooms[roomId].players[socket.id] = { symbol: 'X', username };
        rooms[roomId].sockets.push(socket.id);
        socket.data.roomId = roomId;
        socket.data.username = username;
        
        if (typeof callback === 'function') {
            callback({ ok: true, roomId, symbol: 'X' });
        }
        io.to(roomId).emit('roomUpdate', publicRoomState(roomId));
    });

    // Unirse a Sala
    socket.on('joinRoom', (roomId, username, callback) => {
        username = (username || 'Anon').trim().slice(0, 20);
        const room = rooms[roomId];
        if (!room) {
            if (typeof callback === 'function') callback({ ok: false, error: 'Sala no encontrada' });
            return;
        }
        if (room.sockets.length >= 2) {
            if (typeof callback === 'function') callback({ ok: false, error: 'Sala llena' });
            return;
        }
        socket.join(roomId);
        room.players[socket.id] = { symbol: 'O', username };
        room.sockets.push(socket.id);
        socket.data.roomId = roomId;
        socket.data.username = username;
        
        if (typeof callback === 'function') {
            callback({ ok: true, roomId, symbol: 'O' });
        }
        io.to(roomId).emit('roomUpdate', publicRoomState(roomId));
        io.to(roomId).emit('message', `¡${username} se unió! Empieza X.`);
    });

    // Movimiento
    socket.on('move', ({ roomId, index }, callback) => {
        const room = rooms[roomId];
        if (!room) {
            if (typeof callback === 'function') callback({ ok: false, error: 'Sala no existe' });
            return;
        }
        const player = room.players[socket.id];
        if (!player) {
            if (typeof callback === 'function') callback({ ok: false, error: 'No eres parte de la sala' });
            return;
        }
        const symbol = player.symbol;
        if (room.turn !== symbol) {
            if (typeof callback === 'function') callback({ ok: false, error: 'No es tu turno' });
            return;
        }
        if (room.board[index] !== null) {
            if (typeof callback === 'function') callback({ ok: false, error: 'Casilla ocupada' });
            return;
        }

        room.board[index] = symbol;
        const result = checkWinner(room.board);

        if (result === 'X' || result === 'O') {
            const sockets = room.sockets;
            const p0 = room.players[sockets[0]];
            const p1 = room.players[sockets[1]];
            let winnerName = null;
            let loserName = null;

            if (p0 && p0.symbol === result) { 
                winnerName = p0.username; 
                loserName = p1 ? p1.username : null; 
            } else if (p1 && p1.symbol === result) { 
                winnerName = p1.username; 
                loserName = p0 ? p0.username : null; 
            }

            if (winnerName && loserName) {
                recordResult(winnerName, loserName, false);
            }
            io.to(roomId).emit('gameOver', { winner: result, board: room.board, winnerName });
        } else if (result === 'draw') {
            const sockets = room.sockets;
            const p0 = room.players[sockets[0]];
            const p1 = room.players[sockets[1]];
            if (p0 && p1) {
                recordResult(p0.username, p1.username, true);
            }
            io.to(roomId).emit('gameOver', { winner: 'draw', board: room.board });
        } else {
            room.turn = (room.turn === 'X') ? 'O' : 'X';
            io.to(roomId).emit('roomUpdate', publicRoomState(roomId));
        }

        if (typeof callback === 'function') {
            callback({ ok: true });
        }
    });

    // Solicitar revancha
    socket.on('requestRematch', roomId => {
        const room = rooms[roomId];
        if (!room) return;
        room.board = createEmptyBoard();
        room.turn = 'X';
        io.to(roomId).emit('rematch', publicRoomState(roomId));
    });

    // Salir de la sala
    socket.on('leaveRoom', roomId => {
        socket.leave(roomId);
        const room = rooms[roomId];
        if (!room) return;
        room.sockets = room.sockets.filter(id => id !== socket.id);
        delete room.players[socket.id];
        io.to(roomId).emit('message', 'Un jugador se fue. Sala cerrada.');
        delete rooms[roomId];
    });

    // Obtener tabla de clasificación
    socket.on('getLeaderboard', (n, cb) => {
        const top = getTop(n || 10);
        if (typeof cb === 'function') cb({ ok: true, top });
        else socket.emit('leaderboard', top);
    });

    // Desconexión
    socket.on('disconnect', () => {
        for (const roomId of Object.keys(rooms)) {
            const room = rooms[roomId];
            if (room && room.players[socket.id]) {
                const username = room.players[socket.id].username;
                room.sockets = room.sockets.filter(id => id !== socket.id);
                delete room.players[socket.id];
                io.to(roomId).emit('message', `El jugador ${username} se desconectó. Sala cerrada.`);
                delete rooms[roomId];
            }
        }
    });
});

function publicRoomState(roomId) {
    const r = rooms[roomId];
    if (!r) return null;
    const players = {};
    for (const sid of Object.keys(r.players)) {
        players[sid] = { symbol: r.players[sid].symbol, username: r.players[sid].username };
    }
    return { board: r.board, players, turn: r.turn, sockets: r.sockets };
}

// Listener adaptado para producción y Render
http.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
