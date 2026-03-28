const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const SCORES_FILE = path.join(__dirname, 'scores.json');

app.use(express.static('public'));

// ---------- Scoreboard (file-based) ----------
let scoreboard = {};
function loadScores() {
  try {
    if (fs.existsSync(SCORES_FILE)) {
      const raw = fs.readFileSync(SCORES_FILE, 'utf8');
      scoreboard = JSON.parse(raw) || {};
    } else scoreboard = {};
  } catch (e) {
    console.error('Error leyendo scores.json', e);
    scoreboard = {};
  }
}
function saveScores() {
  try {
    fs.writeFileSync(SCORES_FILE, JSON.stringify(scoreboard, null, 2), 'utf8');
  } catch (e) { console.error('Error guardando scores.json', e); }
}
function ensureUser(username) {
  if (!username) return;
  if (!scoreboard[username]) scoreboard[username] = { wins: 0, losses: 0, draws: 0 };
}
function recordWin(winner, loser) {
  ensureUser(winner);
  ensureUser(loser);
  scoreboard[winner].wins++;
  scoreboard[loser].losses++;
  saveScores();
}
function recordDraw(u1, u2) {
  ensureUser(u1);
  ensureUser(u2);
  scoreboard[u1].draws++;
  scoreboard[u2].draws++;
  saveScores();
}
function getTop(n = 10) {
  const arr = Object.keys(scoreboard).map(u => {
    const s = scoreboard[u];
    return { username: u, wins: s.wins, losses: s.losses, draws: s.draws, score: s.wins*3 + s.draws };
  });
  arr.sort((a,b) => b.score - a.score || b.wins - a.wins || b.draws - a.draws);
  return arr.slice(0,n);
}

loadScores();

// ---------- Game logic ----------
function createEmptyBoard(){ return Array(9).fill(null); }
function checkWinner(board){
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  for (const [a,b,c] of lines) if (board[a] && board[a] === board[b] && board[a] === board[c]) return { winner: board[a], line: [a,b,c] };
  if (board.every(cell => cell !== null)) return { winner: 'draw' };
  return null;
}

// rooms structure:
// rooms[roomId] = {
//   board: [...],
//   players: { username1: { socketId, symbol, connected }, username2: {...} },
//   turn: 'X',
//   createdAt: Date,
//   chat: [ {username,text,time} ]
// }
const rooms = {};

function publicRoomState(roomId) {
  const r = rooms[roomId];
  if (!r) return null;
  // players order: first X then O if available
  const p = Object.keys(r.players).map(u => ({ username: u, symbol: r.players[u].symbol, connected: r.players[u].connected }));
  return { board: r.board, players: p, turn: r.turn, chat: r.chat || [] };
}

io.on('connection', socket => {
  console.log('conexión:', socket.id);

  // Create room: payload = username
  socket.on('createRoom', (username, cb) => {
    username = (username || 'Anon').trim().slice(0,20);
    const roomId = Math.random().toString(36).slice(2,8).toUpperCase();
    rooms[roomId] = {
      board: createEmptyBoard(),
      players: {},
      turn: 'X',
      createdAt: Date.now(),
      chat: []
    };
    rooms[roomId].players[username] = { socketId: socket.id, symbol: 'X', connected: true };
    socket.join(roomId);
    socket.data.username = username;
    socket.data.roomId = roomId;
    if (cb) cb({ ok: true, roomId, symbol: 'X' });
    io.to(roomId).emit('roomUpdate', publicRoomState(roomId));
  });

  // Join room: payload = {roomId, username}
  socket.on('joinRoom', (roomId, username, cb) => {
    username = (username || 'Anon').trim().slice(0,20);
    const room = rooms[roomId];
    if (!room) return cb && cb({ ok: false, error: 'Sala no encontrada' });
    const existingPlayers = Object.keys(room.players || {});
    if (existingPlayers.length >= 2 && !room.players[username]) return cb && cb({ ok: false, error: 'Sala llena' });
    // determine symbol
    const symbol = existingPlayers.length === 0 ? 'X' : (existingPlayers.length === 1 ? 'O' : (room.players[username] ? room.players[username].symbol : 'O'));
    room.players[username] = { socketId: socket.id, symbol, connected: true };
    socket.join(roomId);
    socket.data.username = username;
    socket.data.roomId = roomId;
    if (cb) cb({ ok: true, roomId, symbol });
    io.to(roomId).emit('roomUpdate', publicRoomState(roomId));
    io.to(roomId).emit('message', `${username} se unió a la sala.`);
  });

  // Attempt automatic reconnection: payload = {roomId, username}
  socket.on('reconnectToRoom', (roomId, username, cb) => {
    username = (username || '').trim().slice(0,20);
    const room = rooms[roomId];
    if (!room || !room.players[username]) {
      if (cb) cb({ ok: false, error: 'No se encontró la sala/usuario para reconectar' });
      return;
    }
    // attach new socketId
    room.players[username].socketId = socket.id;
    room.players[username].connected = true;
    socket.join(roomId);
    socket.data.username = username;
    socket.data.roomId = roomId;
    io.to(roomId).emit('message', `${username} se reconectó.`);
    io.to(roomId).emit('roomUpdate', publicRoomState(roomId));
    if (cb) cb({ ok: true, room: publicRoomState(roomId), symbol: room.players[username].symbol });
  });

  // Move: payload {roomId, index}
  socket.on('move', ({roomId, index}, cb) => {
    const room = rooms[roomId];
    if (!room) return cb && cb({ ok: false, error: 'Sala no existe' });
    const username = socket.data.username;
    if (!username) return cb && cb({ ok: false, error: 'No identificado' });
    const player = room.players[username];
    if (!player) return cb && cb({ ok: false, error: 'No eres jugador de esta sala' });
    const symbol = player.symbol;
    if (room.turn !== symbol) return cb && cb({ ok: false, error: 'No es tu turno' });
    if (typeof index !== 'number' || index < 0 || index > 8) return cb && cb({ ok: false, error: 'Índice inválido' });
    if (room.board[index] !== null) return cb && cb({ ok: false, error: 'Casilla ocupada' });

    room.board[index] = symbol;
    // evaluate board
    const res = checkWinner(room.board);
    if (res && res.winner && res.winner !== 'draw') {
      // find winner username and loser username
      const players = Object.keys(room.players);
      let winnerName = null, loserName = null;
      for (const u of players) {
        if (room.players[u].symbol === res.winner) winnerName = u;
        else loserName = u;
      }
      if (winnerName && loserName) recordWin(winnerName, loserName);
      io.to(roomId).emit('gameOver', { winner: res.winner, board: room.board, winnerName, winLine: res.line || [] });
    } else if (res && res.winner === 'draw') {
      const players = Object.keys(room.players);
      if (players.length >= 2) recordDraw(players[0], players[1]);
      io.to(roomId).emit('gameOver', { winner: 'draw', board: room.board });
    } else {
      room.turn = (room.turn === 'X' ? 'O' : 'X');
      io.to(roomId).emit('roomUpdate', publicRoomState(roomId));
    }
    if (cb) cb({ ok: true });
  });

  // request rematch
  socket.on('requestRematch', (roomId) => {
    const room = rooms[roomId];
    if (!room) return;
    room.board = createEmptyBoard();
    room.turn = 'X';
    room.chat = room.chat || [];
    io.to(roomId).emit('rematch', publicRoomState(roomId));
  });

  // chat messages
  socket.on('chatMessage', ({ roomId, text }, cb) => {
    const username = socket.data.username || 'Anon';
    const room = rooms[roomId];
    if (!room) return cb && cb({ ok: false, error: 'Sala no existe' });
    const msg = { username, text: (text||'').toString().slice(0,400), time: Date.now() };
    room.chat = room.chat || [];
    room.chat.push(msg);
    // keep chat length limited
    if (room.chat.length > 200) room.chat.shift();
    io.to(roomId).emit('chatMessage', msg);
    if (cb) cb({ ok: true });
  });

  // get leaderboard
  socket.on('getLeaderboard', (n, cb) => {
    if (cb) cb({ ok: true, top: getTop(n || 10) });
    else socket.emit('leaderboard', getTop(n || 10));
  });

  // leave room intentionally
  socket.on('leaveRoom', (roomId) => {
    const room = rooms[roomId];
    if (!room) return;
    const username = socket.data.username;
    if (username && room.players[username]) {
      room.players[username].connected = false;
      room.players[username].socketId = null;
    }
    socket.leave(roomId);
    io.to(roomId).emit('message', `${username || 'Un jugador'} salió de la sala.`);
    // if both players disconnected, we keep room for a while to allow reconnection.
    // OPTIONAL: implement room cleanup after timeout (not necessary now)
  });

  socket.on('disconnect', () => {
    // mark player disconnected but keep state to allow reconnection
    const username = socket.data.username;
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId] && username && rooms[roomId].players[username]) {
      rooms[roomId].players[username].connected = false;
      rooms[roomId].players[username].socketId = null;
      io.to(roomId).emit('message', `${username} se desconectó. Esperando reconexión...`);
    }
  });
});

http.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});