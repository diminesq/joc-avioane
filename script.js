const socket = io();
const BOARD_SIZE = 10;

let playerName = '';
let currentRoom = '';
let myBoard = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(0));
let myPlanesList = [];
let planesPlaced = 0;
const MAX_PLANES = 3;
let currentDirection = 0; // 0: SUS, 1: DREAPTA, 2: JOS, 3: STÂNGA
const directions = ['SUS', 'DREAPTA', 'JOS', 'STÂNGA'];
let isMyTurn = false;
let currentHoveredCell = null;

// Auto-completare camera din link (?room=...)
window.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const roomFromUrl = urlParams.get('room');
  if (roomFromUrl) {
    document.getElementById('roomIdInput').value = roomFromUrl;
  }
});

// ASCULTĂM TASTA "R" GLOBAL
window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') {
    // Daca utilizatorul scrie intr-un camp de text (username/cod), lasam litera sa se scrie
    if (e.target.tagName === 'INPUT') return;

    // Rotim avionul doar daca suntem in faza de plasare
    if (planesPlaced < MAX_PLANES) {
      e.preventDefault();
      rotatePlane();
    }
  }
});

function generateAndCopyInvite() {
  let currentCode = document.getElementById('roomIdInput').value.trim();
  if (!currentCode) {
    currentCode = Math.random().toString(36).substring(2, 7).toUpperCase();
    document.getElementById('roomIdInput').value = currentCode;
  }

  const inviteLink = `${window.location.origin}/?room=${currentCode}`;

  navigator.clipboard.writeText(inviteLink).then(() => {
    const inviteBtn = document.getElementById('inviteBtn');
    const originalText = inviteBtn.innerText;
    inviteBtn.innerText = 'Copiat! ✔';
    setTimeout(() => {
      inviteBtn.innerText = originalText;
    }, 2000);
  }).catch(() => {
    prompt('Copiază link-ul:', inviteLink);
  });
}

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
    alert('Vă rugăm să introduceți sau să generați un cod!');
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
      // Grila din stanga (proprie)
      const cell = document.createElement('div');
      cell.classList.add('cell');
      cell.dataset.r = r;
      cell.dataset.c = c;
      cell.onclick = () => tryPlacePlane(r, c);
      cell.onmouseenter = () => {
        currentHoveredCell = { r, c };
        showPreview(r, c);
      };
      cell.onmouseleave = () => clearPreview();
      myBoardEl.appendChild(cell);

      // Grila din dreapta (inamic)
      const eCell = document.createElement('div');
      eCell.classList.add('cell');
      eCell.dataset.r = r;
      eCell.dataset.c = c;
      eCell.onclick = () => attackEnemy(r, c);
      enemyBoardEl.appendChild(eCell);
    }
  }

  myBoardEl.onmouseleave = () => {
    currentHoveredCell = null;
    clearPreview();
  };
}

function rotatePlane() {
  currentDirection = (currentDirection + 1) % 4;
  const dirEl = document.getElementById('dir-name');
  if (dirEl) {
    dirEl.innerText = directions[currentDirection];
  }

  // Daca mouse-ul este deja deasupra unei casute, re-desenam preview-ul instant in noua pozitie
  if (currentHoveredCell) {
    showPreview(currentHoveredCell.r, currentHoveredCell.c);
  }
}

function clearPreview() {
  document.querySelectorAll('#my-board .cell').forEach(c => {
    c.classList.remove('preview-valid', 'preview-invalid');
  });
}

function showPreview(headR, headC) {
  if (planesPlaced >= MAX_PLANES) return;
  clearPreview();

  const parts = planeTemplates[currentDirection];
  let isValid = true;

  // Verificam spatiul si coliziunile
  for (let [dr, dc] of parts) {
    let nr = headR + dr, nc = headC + dc;
    if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE || myBoard[nr][nc] !== 0) {
      isValid = false;
      break;
    }
  }

  // Aplicam clasele vizuale
  for (let [dr, dc] of parts) {
    let nr = headR + dr, nc = headC + dc;
    if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
      const cell = document.querySelector(`#my-board .cell[data-r='${nr}'][data-c='${nc}']`);
      if (cell && !cell.classList.contains('plane-head') && !cell.classList.contains('plane-body')) {
        cell.classList.add(isValid ? 'preview-valid' : 'preview-invalid');
      }
    }
  }
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

  const planeCells = [];
  parts.forEach(([dr, dc], index) => {
    let nr = headR + dr, nc = headC + dc;
    myBoard[nr][nc] = (index === 0) ? 'head' : 'body';
    planeCells.push([nr, nc]);

    const cell = document.querySelector(`#my-board .cell[data-r='${nr}'][data-c='${nc}']`);
    cell.classList.add(index === 0 ? 'plane-head' : 'plane-body');
  });

  myPlanesList.push({
    head: [headR, headC],
    cells: planeCells
  });

  planesPlaced++;
  clearPreview();

  document.getElementById('readyBtn').innerText = `Gata de Luptă (${planesPlaced}/${MAX_PLANES})`;
  if (planesPlaced === MAX_PLANES) {
    document.getElementById('readyBtn').disabled = false;
    currentHoveredCell = null;
  } else if (currentHoveredCell) {
    showPreview(currentHoveredCell.r, currentHoveredCell.c);
  }
}

function confirmReady() {
  document.getElementById('controls').classList.add('hidden');
  document.getElementById('status-text').innerText = 'Așteptăm inamicul să își termine plasarea...';
  socket.emit('ready', { 
    roomId: currentRoom, 
    board: myBoard, 
    planesList: myPlanesList, 
    headsCount: MAX_PLANES 
  });
}

function attackEnemy(r, c) {
  if (!isMyTurn) return;
  const cell = document.querySelector(`#enemy-board .cell[data-r='${r}'][data-c='${c}']`);
  if (cell.classList.contains('miss') || cell.classList.contains('hit') || cell.classList.contains('kill') || cell.classList.contains('revealed-body')) {
    return;
  }

  socket.emit('attack', { roomId: currentRoom, row: r, col: c });
}

socket.on('joined', () => {
  document.getElementById('welcome-screen').classList.add('hidden');
  document.getElementById('status-bar').classList.remove('hidden');
  document.getElementById('game-container').classList.remove('hidden');

  // Scoatem focusul de pe orice buton anterior pentru ca tasta R sa functioneze imediat
  if (document.activeElement) {
    document.activeElement.blur();
  }

  createGrids();
});

socket.on('roomFull', () => {
  alert('Camera cu acest cod este deja plină!');
});

socket.on('gameStart', ({ turn, opponentName }) => {
  if (opponentName) {
    document.getElementById('boardOpponentName').innerText = opponentName;
  }
  isMyTurn = (turn === socket.id);
  document.getElementById('status-text').innerText = isMyTurn ? 'Rândul TĂU să ataci!' : `Rândul lui ${opponentName || 'inamic'} să atace...`;
});

socket.on('turnChanged', ({ turn }) => {
  isMyTurn = (turn === socket.id);
  const oppName = document.getElementById('boardOpponentName').innerText;
  document.getElementById('status-text').innerText = isMyTurn ? 'Rândul TĂU să ataci!' : `Rândul lui ${oppName} să atace...`;
});

socket.on('attackResult', ({ row, col, result, revealedPlane }) => {
  const targetCell = document.querySelector(`#enemy-board .cell[data-r='${row}'][data-c='${col}']`);
  targetCell.classList.add(result);
  targetCell.innerText = result === 'kill' ? 'X' : (result === 'hit' ? '●' : '—');

  // Daca s-a nimerit capul, dezvaluim restul avionului automat
  if (result === 'kill' && revealedPlane) {
    revealedPlane.forEach(([pr, pc]) => {
      if (pr === row && pc === col) return;
      const bodyCell = document.querySelector(`#enemy-board .cell[data-r='${pr}'][data-c='${pc}']`);
      if (bodyCell) {
        bodyCell.classList.remove('miss');
        bodyCell.classList.add('revealed-body');
        bodyCell.innerText = '●';
      }
    });
  }
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
