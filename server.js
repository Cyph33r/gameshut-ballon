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
  // Tune for 150 concurrent players
  pingTimeout: 20000,
  pingInterval: 10000,
});

const PORT = process.env.PORT || 3000;

// ─── High-resolution monotonic clock ─────────────────────────────────────────
const hrtimeOrigin = process.hrtime.bigint();
const dateOrigin   = Date.now();
function serverNow() {
  return dateOrigin + Number((process.hrtime.bigint() - hrtimeOrigin) / 1_000_000n);
}

// ─── Constants ───────────────────────────────────────────────────────────────
const COLORS          = ['red', 'blue', 'yellow', 'green'];
const ADMIN_PASSWORD  = process.env.ADMIN_PASSWORD || 'gameshut';
const ANSWER_WINDOW   = 15_000;  // 15s to answer before round auto-closes
const MAX_TRUST_DIFF  = 2000;    // ms: max allowed drift for client clickTime
const POINTS_FIRST    = 10;      // first correct answer gets this
const POINTS_DECAY    = 1;       // lose 1 point per 100ms slower than first
const POINTS_MIN      = 1;       // minimum score for a correct answer
const POINTS_WRONG    = -5;      // penalty for wrong balloon or trap click
const LEADERBOARD_MAX = 20;      // max entries shown

// ─── State ───────────────────────────────────────────────────────────────────
let round = {
  id:           0,
  sentence:     null,   // the full sentence shown to players
  correctColor: null,   // the colour key, or null for trap rounds
  revealTime:   null,   // server timestamp when sentence was revealed
  isOpen:       false,
  firstCorrectAt: null, // server timestamp of first correct answer
};

let roundCloseTimeout = null;
const players = new Map(); // socketId → player object

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sendLeaderboardTo(socketId) {
  const sorted = [...players.values()].filter(p => !p.isGM && p.hasJoined).sort((a,b) => b.score - a.score);
  const top10 = sorted.slice(0, LEADERBOARD_MAX).map(p => ({
    username: p.username, avatar: p.avatar, score: p.score, streak: p.streak
  }));
  const p = players.get(socketId);
  if (!p || p.isGM) {
    io.to(socketId).emit('leaderboard', { top10 });
  } else {
    const myRank = sorted.indexOf(p) + 1;
    io.to(socketId).emit('leaderboard', { top10, myRank, myScore: p.score, totalPlayers: sorted.length });
  }
}

function broadcastLeaderboard() {
  const sorted = [...players.values()].filter(p => !p.isGM && p.hasJoined).sort((a,b) => b.score - a.score);
  const top10 = sorted.slice(0, LEADERBOARD_MAX).map(p => ({
    username: p.username, avatar: p.avatar, score: p.score, streak: p.streak
  }));
  for (const [id, p] of players) {
    if (p.isGM) {
      io.to(id).emit('leaderboard', { top10 });
    } else {
      const myRank = sorted.indexOf(p) + 1;
      io.to(id).emit('leaderboard', { top10, myRank, myScore: p.score, totalPlayers: sorted.length });
    }
  }
}

// ─── Round Lifecycle ─────────────────────────────────────────────────────────
function startRound(sentence, correctColor) {
  if (roundCloseTimeout) { clearTimeout(roundCloseTimeout); roundCloseTimeout = null; }

  round.id++;
  round.sentence      = sentence;
  round.correctColor  = correctColor; // null = trap round
  round.revealTime    = serverNow() + 1500; // shift forward to account for overlay
  round.isOpen        = true;
  round.firstCorrectAt = null;

  // Reset per-round click flags
  for (const [, p] of players) {
    p.clickedThisRound           = false;
    p.answeredCorrectlyThisRound = false;
  }

  // Broadcast
  io.emit('round_start', {
    roundId:    round.id,
    sentence:   round.sentence,
    revealTime: round.revealTime,
  });

  // Auto-close after ANSWER_WINDOW
  roundCloseTimeout = setTimeout(() => closeRound(), ANSWER_WINDOW);
}

function closeRound() {
  if (!round.isOpen) return;
  round.isOpen = false;

  if (roundCloseTimeout) { clearTimeout(roundCloseTimeout); roundCloseTimeout = null; }

  // Update streaks: players who didn't click correctly in a trap round are "safe" (no streak change)
  for (const [, p] of players) {
    if (!p.isGM) {
      if (p.answeredCorrectlyThisRound) {
        p.streak++;
      } else if (p.clickedThisRound) {
        // Clicked something wrong — reset streak
        p.streak = 0;
      }
      // Did not click at all: safe (trap round) or missed — keep streak reset only if correctColor exists
      if (!p.clickedThisRound && round.correctColor !== null) {
        p.streak = 0; // missed a real round
      }
    }
  }

  io.emit('round_closed', { roundId: round.id, correctColor: round.correctColor });
  broadcastLeaderboard();
}

// ─── Socket Handlers ─────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} | total: ${io.engine.clientsCount}`);

  players.set(socket.id, {
    username:                    'Guest',
    avatar:                      '👤',
    isGM:                        false,
    hasJoined:                   false,
    score:                       0,
    streak:                      0,
    clickedThisRound:            false,
    answeredCorrectlyThisRound:  false,
  });

  socket.emit('welcome', { serverTime: serverNow() });

  // ── Time Sync ─────────────────────────────────────────────────────────────
  socket.on('time_sync', (clientSentAt) => {
    socket.emit('time_sync_reply', clientSentAt, serverNow());
  });

  // ── Join ──────────────────────────────────────────────────────────────────
  socket.on('join', (payload) => {
    const data   = typeof payload === 'string' ? { username: payload, avatar: '👤' } : payload;
    const player = players.get(socket.id);
    if (!player) return;

    const clean     = String(data.username || '').trim().slice(0, 24) || 'Guest';
    player.username = clean;
    player.avatar   = data.avatar || '👤';
    player.isGM     = (data.adminPass === ADMIN_PASSWORD);
    player.hasJoined= true;

    console.log(`  join: "${clean}" ${player.avatar} isGM=${player.isGM}`);
    socket.emit('joined', { username: clean, avatar: player.avatar, isGM: player.isGM });

    // Send current leaderboard to newly joined player
    sendLeaderboardTo(socket.id);

    // If a round is currently open, send the player into it
    if (round.isOpen) {
      socket.emit('round_start', {
        roundId:    round.id,
        sentence:   round.sentence,
        revealTime: round.revealTime,
      });
    }
  });

  // ── Admin submits a sentence + correct colour ─────────────────────────────
  socket.on('gm_round', ({ sentence, correctColor }) => {
    const player = players.get(socket.id);
    if (!player || !player.isGM) return;

    const trimmed = String(sentence || '').trim();
    if (!trimmed) return;

    // correctColor can be null (trap) or one of COLORS
    const color = correctColor === null ? null : (COLORS.includes(correctColor) ? correctColor : null);

    // If we got an invalid non-null color string, reject
    if (correctColor !== null && color === null) return;

    if (round.isOpen) return; // can't start mid-round

    startRound(trimmed, color);
  });

  // ── Admin force-close round ───────────────────────────────────────────────
  socket.on('gm_close', () => {
    const player = players.get(socket.id);
    if (!player || !player.isGM) return;
    if (!round.isOpen) return;
    closeRound();
  });

  // ── Player click ──────────────────────────────────────────────────────────
  socket.on('click', ({ color, clickTime } = {}) => {
    const player = players.get(socket.id);
    if (!player || player.isGM)  return;
    if (player.clickedThisRound) return; // anti-spam: only first click counts
    if (!round.isOpen)           return;

    player.clickedThisRound = true;

    const arrivalTime = serverNow();

    // Trust client timestamp if within MAX_TRUST_DIFF of server arrival
    let effectiveTime = arrivalTime;
    if (typeof clickTime === 'number' && isFinite(clickTime)) {
      if (Math.abs(arrivalTime - clickTime) <= MAX_TRUST_DIFF) {
        effectiveTime = clickTime;
      }
    }

    // Time since sentence was revealed
    const responseMs = Math.max(0, effectiveTime - round.revealTime);

    let points = 0;
    let isCorrect = false;

    // ── Trap round (correctColor === null) ────────────────────────────────
    if (round.correctColor === null) {
      // Any click in a trap round = penalty
      points    = POINTS_WRONG;
      isCorrect = false;
    }
    // ── Real round ─────────────────────────────────────────────────────────
    else if (color === round.correctColor) {
      isCorrect = true;
      player.answeredCorrectlyThisRound = true;

      if (round.firstCorrectAt === null) {
        // First correct answer
        round.firstCorrectAt = effectiveTime;
        points = POINTS_FIRST;
      } else {
        // Subsequent correct answers — lose 1 point per 100ms slower than first
        const slowMs = Math.max(0, effectiveTime - round.firstCorrectAt);
        const decay  = Math.floor(slowMs / 100) * POINTS_DECAY;
        points       = Math.max(POINTS_MIN, POINTS_FIRST - decay);
      }

      // Streak bonus: 3+ correct streak → ×1.2
      if (player.streak >= 2) {
        points = Math.floor(points * 1.2);
      }
    } else {
      // Wrong colour clicked
      points    = POINTS_WRONG;
      isCorrect = false;
    }

    player.score += points;

    socket.emit('click_result', {
      roundId:       round.id,
      isCorrect,
      isTrap:        round.correctColor === null,
      selectedColor: color,
      correctColor:  round.correctColor,
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

// ─── Static & Health ─────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) =>
  res.json({ status: 'ok', players: players.size, round: round.id, roundOpen: round.isOpen })
);
app.use((_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎈 BallonBurst running on http://0.0.0.0:${PORT}`);
});
