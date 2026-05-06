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

// ─── High-resolution monotonic clock ──────────────────────────────────────────
const hrtimeOrigin = process.hrtime.bigint();
const dateOrigin   = Date.now();
function serverNow() {
  return dateOrigin + Number((process.hrtime.bigint() - hrtimeOrigin) / 1_000_000n);
}

// ─── Constants ─────────────────────────────────────────────────────────────────
const COLORS         = ['red', 'blue', 'yellow', 'green'];
const GM_USERNAME    = 'admin';
const ANSWER_WINDOW  = 10_000; // 10s to answer before round auto-closes
const MAX_TRUST_DIFF = 1000;   // ms: max allowed drift for client clickTime

// ─── State ────────────────────────────────────────────────────────────────────
let round = {
  id:           0,
  word:         null,   // the homophone word shown to players
  correctColor: null,   // the colour it maps to
  revealTime:   null,   // server timestamp when word was revealed
  isOpen:       false,
};

let roundCloseTimeout = null;
const players = new Map(); // socketId → player object

// ─── Round Lifecycle ──────────────────────────────────────────────────────────
function startRound(word, correctColor) {
  if (roundCloseTimeout) { clearTimeout(roundCloseTimeout); roundCloseTimeout = null; }

  round.id++;
  round.word         = word;
  round.correctColor = correctColor;
  round.revealTime   = serverNow();
  round.isOpen       = true;

  // Reset per-round click flags
  for (const [, p] of players) p.clickedThisRound = false;

  // Broadcast: word is revealed NOW — revealTime is the start of the window
  io.emit('round_start', {
    roundId:      round.id,
    word:         round.word,
    revealTime:   round.revealTime,
  });

  // Auto-close after ANSWER_WINDOW
  roundCloseTimeout = setTimeout(() => {
    round.isOpen = false;

    // Leaderboard
    const lb = [...players.values()]
      .filter(p => !p.isGM)
      .map(p => ({ username: p.username, score: p.score }))
      .sort((a, b) => b.score - a.score);

    io.emit('round_closed',    { roundId: round.id, correctColor: round.correctColor });
    io.emit('leaderboard',     lb);
  }, ANSWER_WINDOW);
}

// ─── Socket Handlers ──────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} | total: ${io.engine.clientsCount}`);

  players.set(socket.id, {
    username:         'Guest',
    isGM:             false,
    score:            0,
    clickedThisRound: false,
  });

  socket.emit('welcome', { serverTime: serverNow() });

  // ── Time Sync ──────────────────────────────────────────────────────────────
  socket.on('time_sync', (clientSentAt) => {
    socket.emit('time_sync_reply', clientSentAt, serverNow());
  });

  // ── Join ──────────────────────────────────────────────────────────────────
  socket.on('join', (username) => {
    const player = players.get(socket.id);
    if (!player) return;
    const clean      = String(username).trim().slice(0, 24) || 'Guest';
    player.username  = clean;
    player.isGM      = clean.toLowerCase() === GM_USERNAME;
    console.log(`  join: "${clean}" isGM=${player.isGM}`);
    socket.emit('joined', { username: clean, isGM: player.isGM });
  });

  // ── GM submits a word + correct colour ────────────────────────────────────
  socket.on('gm_word', ({ word, correctColor }) => {
    const player = players.get(socket.id);
    if (!player || !player.isGM) return;
    if (!word || !COLORS.includes(correctColor)) return;
    if (round.isOpen) return; // can't start mid-round

    startRound(word.trim(), correctColor);
  });

  // ── Player click ──────────────────────────────────────────────────────────
  socket.on('click', ({ color, clickTime } = {}) => {
    const player = players.get(socket.id);
    if (!player || player.isGM)       return;
    if (player.clickedThisRound)      return;
    if (!round.isOpen)                return;

    player.clickedThisRound = true;

    const arrivalTime = serverNow();

    // Trust client timestamp if it's within MAX_TRUST_DIFF of arrival
    let effectiveTime = arrivalTime;
    if (typeof clickTime === 'number' && isFinite(clickTime)) {
      if (Math.abs(arrivalTime - clickTime) <= MAX_TRUST_DIFF) {
        effectiveTime = clickTime;
      }
    }

    const correctColor = color === round.correctColor;
    // Response time from when the word was revealed
    const responseMs   = Math.max(0, effectiveTime - round.revealTime);

    // Score: correct = 10 pts, -1 per 500ms response time, min 0
    const points = correctColor
      ? Math.max(0, 10 - Math.floor(responseMs / 500))
      : 0;

    player.score += points;

    socket.emit('click_result', {
      roundId:       round.id,
      correctColor,
      selectedColor: color,
      roundColor:    round.correctColor,
      responseMs,
      points,
      totalScore:    player.score,
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
  res.json({ status: 'ok', players: players.size, round: round.id })
);
app.use((_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
