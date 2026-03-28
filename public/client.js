const socket = io();

// DOM elements
const nameInput = document.getElementById('nameInput');
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const roomInput = document.getElementById('roomInput');
const showLeaderboardBtn = document.getElementById('showLeaderboardBtn');
const refreshBtn = document.getElementById('refreshBtn');

const loginSection = document.getElementById('loginSection');
const roomSection = document.getElementById('roomSection');
const boardDiv = document.getElementById('board');
const roomIdSpan = document.getElementById('roomId');
const mySymbolSpan = document.getElementById('mySymbol');
const player1Span = document.getElementById('player1');
const player2Span = document.getElementById('player2');
const turnInfo = document.getElementById('turnInfo');
const infoDiv = document.getElementById('info');
const rematchBtn = document.getElementById('rematchBtn');
const leaveBtn = document.getElementById('leaveBtn');

const chatBox = document.getElementById('chatBox');
const chatInput = document.getElementById('chatInput');
const sendChatBtn = document.getElementById('sendChatBtn');

const leaderboardBox = document.getElementById('leaderboard');
const leaderList = document.getElementById('leaderList');
const closeLeaderboard = document.getElementById('closeLeaderboard');

let currentRoom = null;
let mySymbol = null;
let myName = null;
let board = Array(9).fill(null);
let gameOver = false;
let winLine = [];

// --- Helpers ---
function setInfo(txt){ infoDiv.textContent = txt || ''; }
function renderBoard() {
  boardDiv.innerHTML = '';
  for (let i=0;i<9;i++){
    const c = document.createElement('div');
    c.className = 'cell' + (gameOver ? ' disabled' : '');
    if (winLine.includes(i)) c.classList.add('win');
    c.dataset.index = i;
    c.textContent = board[i] ? board[i] : '';
    c.addEventListener('click', () => tryMove(i));
    boardDiv.appendChild(c);
  }
}

function addChatMessage({username, text, time}) {
  const wrap = document.createElement('div');
  wrap.className = 'chatMessage';
  const who = document.createElement('span');
  who.className = 'who';
  who.textContent = username;
  const when = document.createElement('span');
  when.className = 'time';
  const d = new Date(time);
  when.textContent = d.toLocaleTimeString();
  const txt = document.createElement('div');
  txt.className = 'text';
  txt.textContent = text;
  wrap.appendChild(who);
  wrap.appendChild(when);
  wrap.appendChild(document.createElement('br'));
  wrap.appendChild(txt);
  chatBox.appendChild(wrap);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function resetUI() {
  currentRoom = null; mySymbol = null; myName = null; board = Array(9).fill(null); gameOver = false;
  loginSection.style.display = ''; roomSection.style.display = 'none';
  roomIdSpan.textContent='—'; mySymbolSpan.textContent='—'; player1Span.textContent='—'; player2Span.textContent='—';
  setInfo('Saliste de la sala.');
  localStorage.removeItem('r_username');
  localStorage.removeItem('r_roomId');
}

// --- Actions ---
createBtn.onclick = () => {
  const name = (nameInput.value || '').trim();
  if (!name) return alert('Ingresa tu nombre');
  socket.emit('createRoom', name, res => {
    if (res && res.ok) {
      myName = name;
      currentRoom = res.roomId;
      mySymbol = res.symbol;
      // persist locally for reconnection
      localStorage.setItem('r_username', myName);
      localStorage.setItem('r_roomId', currentRoom);
      roomIdSpan.textContent = currentRoom;
      mySymbolSpan.textContent = mySymbol;
      loginSection.style.display = 'none';
      roomSection.style.display = '';
      board = Array(9).fill(null);
      gameOver = false;
      renderBoard();
      setInfo('Sala creada. Comparte el código con un amigo.');
      requestLeaderboard();
    } else {
      alert('Error creando sala');
    }
  });
};

joinBtn.onclick = () => {
  const name = (nameInput.value || '').trim();
  const r = (roomInput.value || '').trim().toUpperCase();
  if (!name) return alert('Ingresa tu nombre');
  if (!r) return alert('Ingresa código de sala');
  socket.emit('joinRoom', r, name, res => {
    if (res && res.ok) {
      myName = name;
      currentRoom = res.roomId;
      mySymbol = res.symbol;
      localStorage.setItem('r_username', myName);
      localStorage.setItem('r_roomId', currentRoom);
      roomIdSpan.textContent = currentRoom;
      mySymbolSpan.textContent = mySymbol;
      loginSection.style.display = 'none';
      roomSection.style.display = '';
      board = Array(9).fill(null);
      gameOver = false;
      renderBoard();
      setInfo('Conectado. Espera a que ambos jugadores estén listos.');
      requestLeaderboard();
    } else {
      alert(res.error || 'No se pudo unir');
    }
  });
};

function tryMove(index) {
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

// Chat
sendChatBtn.onclick = () => {
  const text = (chatInput.value || '').trim();
  if (!text) return;
  if (!currentRoom) return alert('No estás en una sala.');
  socket.emit('chatMessage', { roomId: currentRoom, text }, res => {
    if (res && res.ok) {
      chatInput.value = '';
    } else {
      alert('Error enviando mensaje');
    }
  });
};
chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChatBtn.click(); });

// Leaderboard UI
showLeaderboardBtn.onclick = () => {
  requestLeaderboard();
  leaderboardBox.style.display = '';
};
closeLeaderboard && (closeLeaderboard.onclick = () => leaderboardBox.style.display = 'none');
refreshBtn.onclick = () => { requestLeaderboard(); setInfo('Actualizado'); };

function requestLeaderboard() {
  socket.emit('getLeaderboard', 10, res => {
    if (res && res.ok) renderLeaderboard(res.top);
  });
}
function renderLeaderboard(list) {
  leaderList.innerHTML = '';
  if (!list || list.length === 0) leaderList.innerHTML = '<li>No hay jugadores aún</li>';
  else list.forEach(item => {
    const li = document.createElement('li');
    li.textContent = `${item.username} — P:${item.score} (W:${item.wins} D:${item.draws} L:${item.losses})`;
    leaderList.appendChild(li);
  });
}

// --- Socket events ---
socket.on('roomUpdate', room => {
  if (!room) return;
  board = room.board || Array(9).fill(null);
  gameOver = false;
  winLine = [];
  renderBoard();
  // update UI fields
  roomIdSpan.textContent = currentRoom || roomIdSpan.textContent;
  mySymbolSpan.textContent = mySymbol || '—';
  turnInfo.textContent = room.turn || '—';
  // players (ordered)
  const p = room.players || [];
  player1Span.textContent = p[0] ? `${p[0].username} (${p[0].symbol})${p[0].connected ? '' : ' — (offline)'}` : '—';
  player2Span.textContent = p[1] ? `${p[1].username} (${p[1].symbol})${p[1].connected ? '' : ' — (offline)'}` : '—';
  setInfo((p.length < 2) ? 'Esperando segundo jugador...' : `Turno: ${room.turn}`);
  // populate chat
  if (room.chat && room.chat.length) {
    chatBox.innerHTML = '';
    room.chat.forEach(m => addChatMessage(m));
  }
});

socket.on('message', txt => setInfo(txt));

socket.on('gameOver', ({ winner, board: b, winnerName, winLine: line }) => {
  board = b || board;
  gameOver = true;
  winLine = line || [];
  renderBoard();
  if (winner === 'draw') setInfo('Empate 😐');
  else setInfo(`¡Ganador: ${winner} — ${winnerName || ''}!`);
  requestLeaderboard();
});

socket.on('rematch', room => {
  if (!room) return;
  board = room.board || Array(9).fill(null);
  gameOver = false;
  winLine = [];
  renderBoard();
  setInfo('Revancha iniciada. Empieza X.');
});

socket.on('chatMessage', msg => {
  addChatMessage(msg);
});

// --- Reconnection on page load ---
function attemptAutoReconnect() {
  const savedName = localStorage.getItem('r_username');
  const savedRoom = localStorage.getItem('r_roomId');
  if (savedName && savedRoom) {
    // try to reconnect
    socket.emit('reconnectToRoom', savedRoom, savedName, res => {
      if (res && res.ok && res.room) {
        myName = savedName;
        currentRoom = savedRoom;
        mySymbol = res.symbol || null;
        roomIdSpan.textContent = currentRoom;
        mySymbolSpan.textContent = mySymbol || '—';
        loginSection.style.display = 'none';
        roomSection.style.display = '';
        // load state
        const room = res.room;
        board = room.board || Array(9).fill(null);
        renderBoard();
        // fill chat
        chatBox.innerHTML = '';
        (room.chat || []).forEach(m => addChatMessage(m));
        // show players
        const p = room.players || [];
        player1Span.textContent = p[0] ? `${p[0].username} (${p[0].symbol})${p[0].connected ? '' : ' — (offline)'}` : '—';
        player2Span.textContent = p[1] ? `${p[1].username} (${p[1].symbol})${p[1].connected ? '' : ' — (offline)'}` : '—';
        setInfo('Reconectado automáticamente a la sala.');
        requestLeaderboard();
      } else {
        // cleanup stale local storage if reconnection failed
        localStorage.removeItem('r_username');
        localStorage.removeItem('r_roomId');
      }
    });
  }
}

// run reconnect attempt once loaded
attemptAutoReconnect();

// initial rendering
renderBoard();
requestLeaderboard();