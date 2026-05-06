import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  perMessageDeflate: false,
});

const PORT = process.env.PORT || 3000;

// ─── Constants ─────────────────────────────────────────────────────────────────

const COLORS          = ['red', 'blue', 'green', 'yellow'];
const INVENTORY_SIZE  = 150; // 150 of each color in the prime inventory
const CLICK_LEAD_MS   = 3000; // countdown before primeTime
const CLICK_WINDOW_MS = 2000; // accept clicks up to 2s after primeTime
const GM_USERNAME     = 'admin'; // case-insensitive special username

// ─── Server State ──────────────────────────────────────────────────────────────

// Prime (game master) inventory: 150 of each color
const primeInventory = {
  red:    INVENTORY_SIZE,
  blue:   INVENTORY_SIZE,
  green:  INVENTORY_SIZE,
  yellow: INVENTORY_SIZE,
};

let round = {
  id:        0,
  color:     null,   // which color was dispensed
  primeTime: null,   // absolute server timestamp target
  isOpen:    false,  // whether clicks are accepted
};

let roundCloseTimeout = null;

// Map of socketId → { username, isGM, score, inventory, clickedThisRound }
const players = new Map();

// ─── Round Lifecycle ───────────────────────────────────────────────────────────

/**
 * Called when the game master selects a color from the prime inventory.
 * Starts a new round for all connected players.
 */
function startRound(color) {
  // Clear any pending close from prior round
  if (roundCloseTimeout) {
    clearTimeout(roundCloseTimeout);
    roundCloseTimeout = null;
  }

  // Deduct from prime inventory
  primeInventory[color]--;

  // Advance round
  round.id++;
  round.color     = color;
  round.primeTime = Date.now() + CLICK_LEAD_MS;
  round.isOpen    = false;

  // Reset every player's per-round flag
  for (const [, p] of players) {
    p.clickedThisRound = false;
  }

  // Broadcast round start — clients use primeTime + their offset for countdown
  io.emit('round_start', {
    roundId:      round.id,
    color:        round.color,
    primeTime:    round.primeTime,
    primeInventory,
  });

  // Open click window 500ms before primeTime
  setTimeout(() => { round.isOpen = true; }, CLICK_LEAD_MS - 500);

  // Close click window after primeTime + CLICK_WINDOW_MS
  roundCloseTimeout = setTimeout(() => {
    round.isOpen = false;
    io.emit('round_closed', { roundId: round.id });
    // Broadcast updated GM inventory to everyone (so GM UI refreshes)
    io.emit('inventory_update', { primeInventory });
  }, CLICK_LEAD_MS + CLICK_WINDOW_MS);
}

// ─── Socket Handlers ───────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} | total: ${io.engine.clientsCount}`);

  players.set(socket.id, {
    username:        'Guest',
    isGM:            false,
    score:           0,
    inventory:       { red: 1, blue: 1, green: 1, yellow: 1 },
    clickedThisRound: false,
  });

  // Send current state to the new joiner so they can sync immediately
  socket.emit('welcome', {
    serverTime:     Date.now(),
    roundId:        round.id,
    color:          round.color,
    primeTime:      round.primeTime,
    roundIsOpen:    round.isOpen,
    primeInventory,
  });

  // ── Time Sync ──────────────────────────────────────────────────────────────
  socket.on('time_sync', (clientSentAt) => {
    socket.emit('time_sync_reply', clientSentAt, Date.now());
  });

  // ── Join with username ─────────────────────────────────────────────────────
  socket.on('join', (username) => {
    const player = players.get(socket.id);
    if (!player) return;

    const clean = String(username).trim().slice(0, 32) || 'Guest';
    player.username = clean;
    player.isGM     = clean.toLowerCase() === GM_USERNAME;

    console.log(`  join: "${clean}" isGM=${player.isGM}`);

    // Tell this socket their role + current prime inventory
    socket.emit('joined', {
      username:       player.username,
      isGM:           player.isGM,
      inventory:      player.inventory,
      primeInventory,
    });
  });

  // ── Game Master: dispense a balloon (starts round) ─────────────────────────
  socket.on('gm_dispense', (color) => {
    const player = players.get(socket.id);
    if (!player || !player.isGM) return;                 // must be GM
    if (!COLORS.includes(color)) return;                  // valid color
    if (primeInventory[color] <= 0) return;               // stock available
    if (round.isOpen) return;                             // no round mid-flight

    startRound(color);
  });

  // ── Player Click ───────────────────────────────────────────────────────────
  socket.on('click', ({ color } = {}) => {
    const player = players.get(socket.id);
    if (!player)                   return;
    if (player.isGM)               return; // GM doesn't play
    if (player.clickedThisRound)   return; // 1 click per round
    if (!round.isOpen)             return; // outside window

    player.clickedThisRound = true;

    const serverClickTime = Date.now();
    const correctColor    = color === round.color;
    const diff            = Math.abs(serverClickTime - round.primeTime); // ms

    // Wrong colour = 0 pts regardless of timing
    const points = correctColor
      ? Math.max(0, Math.round(10 - (diff / 1000) / 0.1))
      : 0;

    player.score += points;

    socket.emit('click_result', {
      roundId:      round.id,
      correctColor,
      selectedColor: color,
      roundColor:   round.color,
      diff,
      points,
      totalScore:   player.score,
    });
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    players.delete(socket.id);
    console.log(`[-] ${socket.id} | total: ${io.engine.clientsCount}`);
  });
});

// ─── Static & Health ──────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', players: players.size, round: round.id, primeInventory })
);
app.use((_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
