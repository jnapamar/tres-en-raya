//https://tres-en-raya-9726.onrender.com

// CONFIGURACIÓN DE CONEXIÓN:
// Si estás en producción, cambia esta URL por la dirección real de tu servidor backend en Render.
// Ej: 'https://mi-servidor-tres-en-raya.onrender.com'
const https://tres-en-raya-9726.onrender.com = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000' 
  : 'https://https://tres-en-raya-9726.onrender.com.onrender.com'; // <--- Pon tu URL de backend de Render aquí

// Inicializamos socket.io apuntando a la URL correcta
const socket = io(https://tres-en-raya-9726.onrender.com);

// DOM
const nameInput = document.getElementById('nameInput');
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const roomInput = document.getElementById('roomInput');
const showLeaderboardBtn = document.getElementById('showLeaderboardBtn');
const refreshBtn = document.getElementById('refreshBtn');

const roomSection = document.getElementById('roomSection');
const loginSection = document.getElementById('loginSection');
const roomIdSpan = document.getElementById('roomId');
const mySymbolSpan = document.getElementById('mySymbol');
const player1Span = document.getElementById('player1');
const player2Span = document.getElementById('player2');
const boardDiv = document.getElementById('board');
const infoDiv = document.getElementById('info');
const rematchBtn = document.getElementById('rematchBtn');
const leaveBtn = document.getElementById('leaveBtn');

const leaderboardBox = document.getElementById('leaderboard');
const leaderList = document.getElementById('leaderList');
const closeLeaderboard = document.getElementById('closeLeaderboard');

let currentRoom = null;
let mySymbol = null;
let board = Array(9).fill(null);
let gameOver = false;

// helpers
function setInfo(txt){ infoDiv.textContent = txt || ''; }

function renderBoard(winIndices = []) {
  boardDiv.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const c = document.createElement('div');
    c.className = 'cell' + (gameOver ? ' disabled' : '');
    if (winIndices.includes(i)) c.classList.add('win');
    c.dataset.index = i;
    c.textContent = board[i] ? board[i] : '';
    c.addEventListener('click', () => tryMove(i));
    boardDiv.appendChild(c);
  }
}

function resetUI() {
  currentRoom = null; 
  mySymbol = null; 
  board = Array(9).fill(null); 
  gameOver = false;
  roomSection.style.display = 'none';
  loginSection.style.display = '';
  roomIdSpan.textContent = '—'; 
  mySymbolSpan.textContent = '—';
  player1Span.textContent = '—'; 
  player2Span.textContent = '—';
  setInfo('Has salido de la sala.');
}

// actions
createBtn.onclick = () => {
  const name = (nameInput.value || 'Anon').trim();
  if (!name) return alert('Ingresa tu nombre');
  socket.emit('createRoom', name, res => {
    if (res.ok) {
      currentRoom = res.roomId;
      mySymbol = res.symbol;
      roomIdSpan.textContent = currentRoom;
      mySymbolSpan.textContent = mySymbol;
      roomSection.style.display = '';
      loginSection.style.display = 'none';
      setInfo('Sala creada. Comparte el código con un amigo.');
      board = Array(9).fill(null);
      gameOver = false;
      renderBoard();
      requestLeaderboard();
    } else {
      alert('Error creando sala');
    }
  });
};

joinBtn.onclick = () => {
  const name = (nameInput.value || 'Anon').trim();
  const r = (roomInput.value || '').trim().toUpperCase();
  if (!name) return alert('Ingresa tu nombre');
  if (!r) return alert('Ingresa código de sala');
  socket.emit('joinRoom', r, name, res => {
    if (res.ok) {
      currentRoom = res.roomId;
      mySymbol = res.symbol;
      roomIdSpan.textContent = currentRoom;
      mySymbolSpan.textContent = mySymbol;
      roomSection.style.display = '';
      loginSection.style.display = 'none';
      setInfo('Conectado. Espera a que ambos jugadores estén listos.');
      board = Array(9).fill(null);
      gameOver = false;
      renderBoard();
      requestLeaderboard();
    } else {
      alert(res.error || 'No se pudo unir');
    }
  });
};

function tryMove(index){
  if (!currentRoom || gameOver) return;
  socket.emit('move', { roomId: currentRoom, index }, res => {
    if (!res.ok) setInfo(res.error || 'Movimiento no válido');
  });
}

rematchBtn.onclick = () => {
  if (!currentRoom) return;
  socket.emit('requestRematch', currentRoom);
};

leaveBtn.onclick = () => {
  if (!currentRoom) return;
  socket.emit('leaveRoom', currentRoom);
  resetUI();
};

// leaderboard UI
showLeaderboardBtn.onclick = () => {
  requestLeaderboard();
  leaderboardBox.style.display = '';
};

if (closeLeaderboard) {
  closeLeaderboard.onclick = () => {
    leaderboardBox.style.display = 'none';
  };
}

refreshBtn.onclick = () => {
  requestLeaderboard();
  setInfo('Actualizado');
};

function requestLeaderboard() {
  socket.emit('getLeaderboard', 10, res => {
    if (res && res.ok) {
      renderLeaderboard(res.top);
    }
  });
}

function renderLeaderboard(list) {
  leaderList.innerHTML = '';
  if (!list || list.length === 0) {
    leaderList.innerHTML = '<li>No hay jugadores aún</li>';
    return;
  }
  list.forEach(item => {
    const li = document.createElement('li');
    li.textContent = `${item.username} — Puntos:${item.score} (W:${item.wins} D:${item.draws} L:${item.losses})`;
    leaderList.appendChild(li);
  });
}

// socket listeners
socket.on('roomUpdate', room => {
  if (!room) return;
  board = room.board;
  gameOver = false;
  renderBoard();
  roomIdSpan.textContent = currentRoom || roomIdSpan.textContent;
  mySymbolSpan.textContent = mySymbol || '—';
  document.getElementById('turnInfo').textContent = room.turn || '—';
  
  // players
  const players = Object.values(room.players || {});
  player1Span.textContent = players[0] ? `${players[0].username} (${players[0].symbol})` : '—';
  player2Span.textContent = players[1] ? `${players[1].username} (${players[1].symbol})` : '—';
  if (players.length < 2) setInfo('Esperando segundo jugador...');
  else setInfo(`Turno: ${room.turn}`);
});

socket.on('message', txt => setInfo(txt));

socket.on('gameOver', ({ winner, board: b, winnerName }) => {
  board = b;
  gameOver = true;
  renderBoard();
  if (winner === 'draw') setInfo('Empate 😐');
  else setInfo(`¡Ganador: ${winner} — ${winnerName || ''}!`);
  requestLeaderboard();
});

// rematch resets board
socket.on('rematch', room => {
  if (!room) return;
  board = room.board;
  gameOver = false;
  renderBoard();
  setInfo('Revancha iniciada. Empieza X.');
});

// on initial load
renderBoard();
requestLeaderboard();
