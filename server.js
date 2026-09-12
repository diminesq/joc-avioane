const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const rooms = {};

io.on('connection', (socket) => {
  socket.on('joinRoom', ({ roomId, playerName }) => {
    if (!rooms[roomId]) {
      rooms[roomId] = { players: {}, turn: null, started: false };
    }

    const room = rooms[roomId];
    const playerIds = Object.keys(room.players);

    if (playerIds.length >= 2 && !room.players[socket.id]) {
      socket.emit('roomFull');
      return;
    }

    socket.join(roomId);
    room.players[socket.id] = {
      id: socket.id,
      name: playerName || 'Anonim',
      board: null,
      planesList: [],
      ready: false,
      headsRemaining: 0
    };

    socket.emit('joined', { roomId });
  });

  socket.on('ready', ({ roomId, board, planesList, headsCount }) => {
    const room = rooms[roomId];
    if (!room || !room.players[socket.id]) return;

    room.players[socket.id].board = board;
    room.players[socket.id].planesList = planesList || [];
    room.players[socket.id].ready = true;
    room.players[socket.id].headsRemaining = headsCount;

    const players = Object.values(room.players);
    if (players.length === 2 && players.every(p => p.ready)) {
      room.started = true;
      room.turn = players[0].id;

      const p1 = players[0];
      const p2 = players[1];

      // Trimitem fiecarui jucator numele celuilalt
      io.to(p1.id).emit('gameStart', { turn: room.turn, opponentName: p2.name });
      io.to(p2.id).emit('gameStart', { turn: room.turn, opponentName: p1.name });
    }
  });

  socket.on('attack', ({ roomId, row, col }) => {
    const room = rooms[roomId];
    if (!room || !room.started || room.turn !== socket.id) return;

    const opponentId = Object.keys(room.players).find(id => id !== socket.id);
    const opponent = room.players[opponentId];
    const targetCell = opponent.board[row][col];

    let result = 'miss';
    let revealedPlane = null;

    if (targetCell === 'head') {
      result = 'kill';
      opponent.headsRemaining--;
      // Cautam intregul avion caruia ii apartine capul
      const hitPlane = opponent.planesList.find(p => p.head[0] === row && p.head[1] === col);
      if (hitPlane) {
        revealedPlane = hitPlane.cells;
      }
    } else if (targetCell === 'body') {
      result = 'hit';
    }

    socket.emit('attackResult', { row, col, result, revealedPlane });
    io.to(opponentId).emit('defenseResult', { row, col, result });

    if (opponent.headsRemaining <= 0) {
      socket.emit('gameOver', { won: true });
      io.to(opponentId).emit('gameOver', { won: false });
      delete rooms[roomId];
    } else {
      room.turn = opponentId;
      io.to(roomId).emit('turnChanged', { turn: room.turn });
    }
  });

  socket.on('disconnect', () => {
    for (const roomId in rooms) {
      if (rooms[roomId].players[socket.id]) {
        delete rooms[roomId];
        io.to(roomId).emit('opponentLeft');
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Serverul ruleaza pe portul ${PORT}`));
