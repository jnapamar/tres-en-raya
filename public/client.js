// Inicializamos socket.io. 
// Al estar hospedado en Render, io() detecta automáticamente el dominio actual.
const socket = io();

// Elementos del DOM
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

// Funciones Auxiliares
function setInfo(txt) { 
  if (infoDiv) infoDiv.textContent = txt || ''; 
}

function renderBoard(winIndices = []) {
  if (!boardDiv) return;
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
  
  if (roomSection) roomSection.style.display = 'none';
  if (loginSection) loginSection.style.display = '';
  if (roomIdSpan) roomIdSpan.textContent = '—'; 
  if (mySymbolSpan) mySymbolSpan.textContent = '—';
  if (player1Span) player1Span.textContent = '—'; 
  if (player2Span) player2Span.textContent = '—';
  
  setInfo('Has salido de la sala.');
}

// Eventos de los Botones

// 1. Crear Sala
if (createBtn) {
  createBtn.onclick = () => {
    const name = (nameInput.value || 'Anon').trim();
    if (!name) return alert('Ingresa tu nombre');
    
    socket.emit('createRoom', name, res => {
      if (res && res.ok) {
        currentRoom = res.roomId;
        mySymbol = res.symbol;
        if (roomIdSpan) roomIdSpan.textContent = currentRoom;
        if (mySymbolSpan) mySymbolSpan.textContent = mySymbol;
        
        if (roomSection) roomSection.style.display = '';
        if (loginSection) loginSection.style.display = 'none';
        
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
}

// 2. Unirse a Sala
if (joinBtn) {
  joinBtn.onclick = () => {
    const name = (nameInput.value || 'Anon').trim();
    const r = (roomInput.value || '').trim().toUpperCase();
    if (!name) return alert('Ingresa tu nombre');
    if (!r) return alert('Ingresa código de sala');
    
    socket.emit('joinRoom', r, name, res => {
      if (res && res.ok) {
        currentRoom = res.roomId;
        mySymbol = res.symbol;
        if (roomIdSpan) roomIdSpan.textContent = currentRoom;
        if (mySymbolSpan) mySymbolSpan.textContent = mySymbol;
        
        if (roomSection) roomSection.style.display = '';
        if (loginSection) loginSection.style.display = 'none';
        
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
}

function tryMove(index) {
  if (!currentRoom || gameOver) return;
  socket.emit('move', { roomId: currentRoom, index }, res => {
    if (res && !res.ok) setInfo(res.error || 'Movimiento no válido');
  });
}

if (rematchBtn) {
  rematchBtn.onclick = () => {
    if (!currentRoom) return;
    socket.emit('requestRematch', currentRoom);
  };
}

if (leaveBtn) {
  leaveBtn.onclick = () => {
    if (!currentRoom) return;
    socket.emit('leaveRoom', currentRoom);
    resetUI();
  };
}

// 3. Menú de Ranking
if (showLeaderboardBtn) {
  showLeaderboardBtn.onclick = () => {
    requestLeaderboard();
    if (leaderboardBox) leaderboardBox.style.display = '';
  };
}

if (closeLeaderboard) {
  closeLeaderboard.onclick = () => {
    if (leaderboardBox) leaderboardBox.style.display = 'none';
  };
}

if (refreshBtn) {
  refreshBtn.onclick = () => {
    requestLeaderboard();
    setInfo('Actualizado');
  };
}

function requestLeaderboard() {
  socket.emit('getLeaderboard', 10, res => {
    if (res && res.ok) {
      renderLeaderboard(res.top);
    }
  });
}

function renderLeaderboard(list) {
  if (!leaderList) return;
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

// Escuchadores de eventos de Socket.io
socket.on('roomUpdate', room => {
  if (!room) return;
  board = room.board;
  gameOver = false;
  renderBoard();
  
  if (roomIdSpan) roomIdSpan.textContent = currentRoom || roomIdSpan.textContent;
  if (mySymbolSpan) mySymbolSpan.textContent = mySymbol || '—';
  
  const turnInfo = document.getElementById('turnInfo');
  if (turnInfo) turnInfo.textContent = room.turn || '—';
  
  const players = Object.values(room.players || {});
  if (player1Span) player1Span.textContent = players[0] ? `${players[0].username} (${players[0].symbol})` : '—';
  if (player2Span) player2Span.textContent = players[1] ? `${players[1].username} (${players[1].symbol})` : '—';
  
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

socket.on('rematch', room => {
  if (!room) return;
  board = room.board;
  gameOver = false;
  renderBoard();
  setInfo('Revancha iniciada. Empieza X.');
});

// Carga Inicial
renderBoard();
requestLeaderboard();
