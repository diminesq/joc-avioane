const socket = io();
const BOARD_SIZE = 10;

let playerName = '';
let currentRoom = '';
let myBoard = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(0));
let planesPlaced = 0;
const MAX_PLANES = 3;
let currentDirection = 0; // 0: Sus, 1: Dreapta, 2: Jos, 3: Stânga
const directions = ['SUS', 'DREAPTA', 'JOS', 'STÂNGA'];
let isMyTurn = false;

const planeTemplates = {
  0: [ [0,0], [1,-2],[1,-1],[1,0],[1,1],[1,2], [2,0], [3,-1],[3,0],[3,1] ], // SUS
  1: [ [0,0], [-2,-1],[-1,-1],[0,-1],[1,-1],[2,-1], [0,-2], [-1,-3],[0,-3],[1,-3] ], // DREAPTA
  2: [ [0,0], [-1,-2],[-1,-1],[-1,0],[-1,1],[-1,2], [-2,0], [-3,-1],[-3,0],[-3,1] ], // JOS
  3: [ [0,0], [-2,1],[-1,1],[0,1],[1,1],[2,1], [0,2], [-1,3],[0,3],[1,3] ]   // STÂNGA
};

function handlePlay() {
  const name = document.getElementById('usernameInput').value.trim();
  const room = document.getElementById('roomIdInput').value.trim();

  if (!name) {
    alert('Vă rugăm să introduceți numele dumneavoastră!');
    return;
  }
  if (!room) {
    alert('Vă rugăm să introduceți codul jocului!');
    return;
  }

  playerName = name;
  currentRoom = room;

  document.getElementById('boardPlayerName').innerText = playerName;
  socket.emit('joinRoom', { roomId: currentRoom, playerName });
}

document.getElementById('usernameInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handlePlay();
});
document.getElementById('roomIdInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handlePlay();
});

function createGrids() {
  const myBoardEl = document.getElementById('my-board');
  const enemyBoardEl = document.getElementById('enemy-board');
  myBoardEl.innerHTML = '';
  enemyBoardEl.innerHTML = '';

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement('div');
      cell.classList.add('cell');
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.onclick = () => tryPlacePlane(r, c);
      myBoardEl.appendChild(cell);

      const eCell = document.createElement('div');
      eCell.classList.add('cell');
      eCell.dataset.r = r;
      eCell.dataset.c = c;
      eCell.onclick = () => attackEnemy(r, c);
      enemyBoardEl.appendChild(eCell);
    }
  }
}

function rotatePlane() {
  currentDirection = (currentDirection + 1) % 4;
  document.getElementById('dir-name').innerText = directions[currentDirection];
}

function tryPlacePlane(headR, headC) {
  if (planesPlaced >= MAX_PLANES) return;
  const parts = planeTemplates[currentDirection];

  for (let [dr, dc] of parts) {
    let nr = headR + dr, nc = headC + dc;
    if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE || myBoard[nr][nc] !== 0) {
      alert('Avionul nu încape aici sau se suprapune!');
      return;
    }
  }

  parts.forEach(([dr, dc], index) => {
    let nr = headR + dr, nc = headC + dc;
    myBoard[nr][nc] = (index === 0) ? 'head' : 'body';
    const cell = document.querySelector(`#my-board .cell[data-r='${nr}'][data-c='${nc}']`);
    cell.classList.add(index === 0 ? 'plane-head' : 'plane-body');
  });

  planesPlaced++;
  document.getElementById('readyBtn').innerText = `Gata de Luptă (${planesPlaced}/${MAX_PLANES})`;
  if (planesPlaced === MAX_PLANES) {
    document.getElementById('readyBtn').disabled = false;
  }
}

function confirmReady() {
  document.getElementById('controls').classList.add('hidden');
  document.getElementById('status-text').innerText = 'Așteptăm inamicul să își termine plasarea...';
  socket.emit('ready', { roomId: currentRoom, board: myBoard, headsCount: MAX_PLANES });
}

function attackEnemy(r, c) {
  if (!isMyTurn) return;
  const cell = document.querySelector(`#enemy-board .cell[data-r='${r}'][data-c='${c}']`);
  if (cell.classList.contains('miss') || cell.classList.contains('hit') || cell.classList.contains('kill')) return;

  socket.emit('attack', { roomId: currentRoom, row: r, col: c });
}

socket.on('joined', () => {
  document.getElementById('welcome-screen').classList.add('hidden');
  document.getElementById('status-bar').classList.remove('hidden');
  document.getElementById('game-container').classList.remove('hidden');
  createGrids();
});

socket.on('roomFull', () => {
  alert('Camera cu acest cod este deja plină!');
});

socket.on('gameStart', ({ turn }) => {
  isMyTurn = (turn === socket.id);
  document.getElementById('status-text').innerText = isMyTurn ? 'Rândul TĂU să ataci!' : 'Rândul inamicului să atace...';
});

socket.on('turnChanged', ({ turn }) => {
  isMyTurn = (turn === socket.id);
  document.getElementById('status-text').innerText = isMyTurn ? 'Rândul TĂU să ataci!' : 'Rândul inamicului să atace...';
});

socket.on('attackResult', ({ row, col, result }) => {
  const cell = document.querySelector(`#enemy-board .cell[data-r='${row}'][data-c='${col}']`);
  cell.classList.add(result);
  cell.innerText = result === 'kill' ? 'X' : (result === 'hit' ? '●' : '—');
});

socket.on('defenseResult', ({ row, col, result }) => {
  const cell = document.querySelector(`#my-board .cell[data-r='${row}'][data-c='${col}']`);
  cell.classList.add(result);
  cell.innerText = result === 'kill' ? 'X' : (result === 'hit' ? '●' : '—');
});

socket.on('gameOver', ({ won }) => {
  alert(won ? 'VICTORIE! Ai doborât toate avioanele inamice!' : 'ÎNFRÂNGERE! Flota ta aeriană a fost distrusă!');
  location.reload();
});

socket.on('opponentLeft', () => {
  alert('Adversarul s-a deconectat.');
  location.reload();
});