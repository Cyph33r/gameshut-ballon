import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Allow CORS for local development. On Render, it will serve from same origin.
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// Game State
const COLORS = ['red', 'blue', 'green', 'yellow'];
let gameState = 'waiting'; // waiting, playing, end
let primeInventory = {};
let players = {}; 
/* 
players = {
  [socketId]: { 
    score: 0, 
    inventory: {red:1, blue:1, green:1, yellow:1},
    lastClick: null
  }
}
*/
let currentTarget = null;
let targetTime = null;
let turnTimeout = null;

function broadcastState() {
  io.emit('state_update', {
    gameState,
    primeInventory,
    players,
    currentTarget,
    targetTime
  });
}

function startTurn() {
  const availableColors = COLORS.filter(c => primeInventory[c] > 0);
  
  if (availableColors.length === 0) {
    gameState = 'end';
    broadcastState();
    return;
  }

  const randomColor = availableColors[Math.floor(Math.random() * availableColors.length)];
  currentTarget = randomColor;
  primeInventory[randomColor]--;

  // Server sets target time exactly 3000ms from now
  targetTime = Date.now() + 3000;

  // Clear previous clicks for this turn
  for (let id in players) {
    players[id].lastClick = null;
  }

  broadcastState();

  // Process the end of the turn 1.5 seconds after target drop
  turnTimeout = setTimeout(() => {
    finishTurn();
  }, 4500);
}

function finishTurn() {
  currentTarget = null;
  targetTime = null;
  broadcastState();
  
  // Wait a moment before next turn
  setTimeout(startTurn, 2000);
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // NTP Sync: Client sends their current time, server replies with client time + server time
  socket.on('sync_ping', (clientTime) => {
    socket.emit('sync_pong', clientTime, Date.now());
  });

  // Initialize player with no username initially
  players[socket.id] = {
    username: 'Guest',
    isAdmin: false,
    score: 0,
    inventory: { red: 1, blue: 1, green: 1, yellow: 1 },
    lastClick: null
  };
  
  broadcastState();

  socket.on('join_game', (username) => {
    if (players[socket.id]) {
      players[socket.id].username = username || 'Guest';
      // Simple admin check based on special username
      if (username.toLowerCase() === 'admin' || username.toLowerCase() === 'prime') {
        players[socket.id].isAdmin = true;
      }
      broadcastState();
    }
  });

  socket.on('start_game', () => {
    const player = players[socket.id];
    if (!player || !player.isAdmin) return; // Only Admin can start the game
    if (gameState === 'playing') return;
    
    gameState = 'playing';
    primeInventory = { red: 1, blue: 1, green: 1, yellow: 1 };
    
    // Reset all connected players
    for (let id in players) {
      players[id].score = 0;
      players[id].inventory = { red: 1, blue: 1, green: 1, yellow: 1 };
      players[id].lastClick = null;
    }
    
    startTurn();
  });

  socket.on('player_click', (data) => {
    const { color, clickTime } = data; // clickTime is in Server Time (client calculates it)
    
    if (gameState !== 'playing' || !currentTarget) return;
    
    const player = players[socket.id];
    if (player.inventory[color] <= 0 || player.lastClick) return; // already clicked this turn or out of balloons

    player.inventory[color]--;
    
    if (color !== currentTarget) {
      player.lastClick = { color, points: 0, msg: 'Wrong Color!' };
    } else {
      // Calculate score using the synced click time
      const diffMs = clickTime - targetTime;
      const diffSecs = Math.abs(diffMs) / 1000;
      
      let points = 10 - Math.floor(diffSecs * 10);
      if (points < 0) points = 0;
      
      player.score += points;
      
      let msg = points === 10 ? 'Perfect!' : (diffMs < 0 ? `Early!` : `Late!`);
      if (points === 0) msg = 'Too far off!';
      
      player.lastClick = { color, points, msg };
    }
    
    broadcastState();
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete players[socket.id];
    
    // End game if no players left
    if (Object.keys(players).length === 0) {
      gameState = 'waiting';
      clearTimeout(turnTimeout);
    }
    broadcastState();
  });
});

// Serve Vite frontend for Render deployment
app.use(express.static(path.join(__dirname, 'dist')));
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
