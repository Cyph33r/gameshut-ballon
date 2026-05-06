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

// ─── High-resolution server clock ─────────────────────────────────────────────
// process.hrtime.bigint() gives nanosecond precision and is monotonic.
// We calibrate it once against Date.now() so clients can compare.
const hrtimeOrigin   = process.hrtime.bigint();
const dateOrigin     = Date.now();

/**
 * Returns current time in milliseconds using the high-resolution monotonic clock.
 * Never jumps backwards unlike Date.now().
 */
function serverNow() {
  return dateOrigin + Number((process.hrtime.bigint() - hrtimeOrigin) / 1_000_000n);
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const COLORS          = ['red', 'blue', 'green', 'yellow'];
const INVENTORY_SIZE  = 150;
const CLICK_LEAD_MS   = 3000; // countdown before primeTime
const CLICK_WINDOW_MS = 2000; // accept clicks up to 2s after primeTime
const GM_USERNAME     = 'admin';

// Maximum ms of difference to accept a client-sent clickTime.
// If the client's value is wildly off it's likely tampered — fall back to
// server arrival time instead.
const MAX_TRUST_DIFF_MS = 500;

// ─── Server State ──────────────────────────────────────────────────────────────

const primeInventory = {
  red:    INVENTORY_SIZE,
  blue:   INVENTORY_SIZE,
  green:  INVENTORY_SIZE,
  yellow: INVENTORY_SIZE,
};

let round = {
  id:        0,
  color:     null,
  primeTime: null,   // absolute ms (serverNow() scale)
  isOpen:    false,
};

let roundCloseTimeout = null;

// Map: socketId → { username, isGM, score, clickedThisRound, rtt }
const players = new Map();

// ─── Round Lifecycle ───────────────────────────────────────────────────────────

function startRound(color) {
  if (roundCloseTimeout) {
    clearTimeout(roundCloseTimeout);
    roundCloseTimeout = null;
  }

  primeInventory[color]--;

  round.id++;
  round.color     = color;
  round.primeTime = serverNow() + CLICK_LEAD_MS;
  round.isOpen    = false;

  for (const [, p] of players) {
    p.clickedThisRound = false;
  }

  io.emit('round_start', {
    roundId:      round.id,
    color:        round.color,
    primeTime:    round.primeTime,
    primeInventory,
  });

  setTimeout(() => { round.isOpen = true; }, CLICK_LEAD_MS - 500);

  roundCloseTimeout = setTimeout(() => {
    round.isOpen = false;
    io.emit('round_closed', { roundId: round.id });
    io.emit('inventory_update', { primeInventory });
  }, CLICK_LEAD_MS + CLICK_WINDOW_MS);
}

// ─── Socket Handlers ───────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} | total: ${io.engine.clientsCount}`);

  players.set(socket.id, {
    username:         'Guest',
    isGM:             false,
    score:            0,
    clickedThisRound: false,
    rtt:              null, // last measured round-trip time
  });

  socket.emit('welcome', {
    serverTime:  serverNow(),
    roundId:     round.id,
    color:       round.color,
    primeTime:   round.primeTime,
    roundIsOpen: round.isOpen,
    primeInventory,
  });

  // ── Time Sync ──────────────────────────────────────────────────────────────
  // Client sends [clientSentAt]. Server replies with [clientSentAt, serverNow].
  // Client measures RTT, computes offset, repeats 10 times, filters outliers.
  socket.on('time_sync', (clientSentAt) => {
    socket.emit('time_sync_reply', clientSentAt, serverNow());
  });

  // ── Join ──────────────────────────────────────────────────────────────────
  socket.on('join', (username) => {
    const player = players.get(socket.id);
    if (!player) return;

    const clean  = String(username).trim().slice(0, 32) || 'Guest';
    player.username = clean;
    player.isGM     = clean.toLowerCase() === GM_USERNAME;

    console.log(`  join: "${clean}" isGM=${player.isGM}`);

    socket.emit('joined', {
      username:      player.username,
      isGM:          player.isGM,
      primeInventory,
    });
  });

  // ── GM Dispense ───────────────────────────────────────────────────────────
  socket.on('gm_dispense', (color) => {
    const player = players.get(socket.id);
    if (!player || !player.isGM)       return;
    if (!COLORS.includes(color))        return;
    if (primeInventory[color] <= 0)     return;
    if (round.isOpen)                   return;

    startRound(color);
  });

  // ── Player Click ──────────────────────────────────────────────────────────
  socket.on('click', ({ color, clickTime } = {}) => {
    const player = players.get(socket.id);
    if (!player)                 return;
    if (player.isGM)             return;
    if (player.clickedThisRound) return;
    if (!round.isOpen)           return;

    player.clickedThisRound = true;

    const serverArrivalTime = serverNow();

    // ── Timing arbitration ─────────────────────────────────────────────────
    // Prefer the client's synced clickTime. If it is suspiciously far from the
    // server arrival time (tampered or severely drifted), fall back to arrival.
    let effectiveClickTime = serverArrivalTime; // default: server arrival
    if (typeof clickTime === 'number' && isFinite(clickTime)) {
      const drift = Math.abs(serverArrivalTime - clickTime);
      if (drift <= MAX_TRUST_DIFF_MS) {
        effectiveClickTime = clickTime; // ✅ client timestamp is plausible
      }
      // else: drift too large, ignore client time
    }

    const correctColor = color === round.color;
    const diff         = Math.abs(effectiveClickTime - round.primeTime); // ms
    const points       = correctColor
      ? Math.max(0, Math.round(10 - (diff / 1000) / 0.1))
      : 0;

    player.score += points;

    socket.emit('click_result', {
      roundId:       round.id,
      correctColor,
      selectedColor: color,
      roundColor:    round.color,
      diff,
      points,
      totalScore:    player.score,
      // Tell client which timestamp was used for transparency
      usedClientTime: effectiveClickTime !== serverArrivalTime,
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
