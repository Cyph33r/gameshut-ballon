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
  pingTimeout: 20000,
  pingInterval: 10000,
});

const PORT = process.env.PORT || 3000;

// ─── High-resolution monotonic clock ─────────────────────────────────────────
const hrtimeOrigin = process.hrtime.bigint();
const dateOrigin = Date.now();
function serverNow() {
  return dateOrigin + Number((process.hrtime.bigint() - hrtimeOrigin) / 1_000_000n);
}

// ─── Constants ───────────────────────────────────────────────────────────────
const COLORS = ['red', 'yellow', 'orange', 'blue'];
const ANSWER_WINDOW = 5_000 + 1_500;  // 1.5s delay + 5s window
const MAX_TRUST_DIFF = 2000;    // ms: max allowed drift for client clickTime
const POINTS_FIRST = 10;      // first correct answer gets this
const POINTS_DECAY = 1;       // lose 1 point per 100ms slower than first
const POINTS_MIN = 1;       // minimum score for a correct answer
const LEADERBOARD_MAX = 20;      // max entries shown

// ─── State ───────────────────────────────────────────────────────────────────
function createGlobalRoomState(hostPassword = 'admin') {
  return {
    hostPassword: hostPassword.trim(),
    isLocked: false,
    adminSocketId: null,
    storyQueue: [],
    storyMeta: null,       // { title, sentences: [{ text, isRound, roundIndex }] }
    storyRoundIndex: 0,    // which story round we're currently on
    storyRevealedRounds: [], // [{ sentenceIndex, color }] — past round results
    round: {
      id: 0,
      sentence: null,
      correctColor: null,
      revealTime: null,
      isOpen: false,
      firstCorrectAt: null,
    },
    roundCloseTimeout: null,
    players: new Map(), // socketId -> player object
  };
}

const globalRoom = createGlobalRoomState(process.env.HOST_PASSWORD || 'admin');

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sendLeaderboardTo(socket) {
  const sorted = [...globalRoom.players.values()].filter(p => !p.isGM && !p.isDisplay && p.hasJoined).sort((a, b) => b.score - a.score);
  const top10 = sorted.slice(0, LEADERBOARD_MAX).map(p => ({
    username: p.username, avatar: p.avatar, score: p.score, streak: p.streak
  }));
  const p = globalRoom.players.get(socket.id);
  if (!p || p.isGM || p.isDisplay) {
    socket.emit('leaderboard', { top10 });
  } else {
    const myRank = sorted.indexOf(p) + 1;
    socket.emit('leaderboard', { top10, myRank, myScore: p.score, totalPlayers: sorted.length });
  }
}

function broadcastPlayerCount() {
  const activePlayers = [...globalRoom.players.values()].filter(p => !p.isGM && !p.isDisplay && p.hasJoined);
  const count = activePlayers.length;
  const avatars = activePlayers.slice(0, 20).map(p => ({ avatar: p.avatar, username: p.username }));
  io.emit('player_count', { count, avatars });
}

function broadcastLeaderboard() {
  const sorted = [...globalRoom.players.values()].filter(p => !p.isGM && !p.isDisplay && p.hasJoined).sort((a, b) => b.score - a.score);
  const top10 = sorted.slice(0, LEADERBOARD_MAX).map(p => ({
    username: p.username, avatar: p.avatar, score: p.score, streak: p.streak
  }));
  for (const [id, p] of globalRoom.players) {
    if (p.isGM || p.isDisplay) {
      io.to(id).emit('leaderboard', { top10 });
    } else {
      const myRank = sorted.indexOf(p) + 1;
      io.to(id).emit('leaderboard', { top10, myRank, myScore: p.score, totalPlayers: sorted.length });
    }
  }
}

// ─── Round Lifecycle ─────────────────────────────────────────────────────────
function startRound(sentence, correctColor) {
  if (globalRoom.roundCloseTimeout) { clearTimeout(globalRoom.roundCloseTimeout); globalRoom.roundCloseTimeout = null; }

  globalRoom.round.id++;
  globalRoom.round.sentence = sentence;
  globalRoom.round.correctColor = correctColor; // null = trap round
  globalRoom.round.revealTime = serverNow() + 1500; // Account for overlay transition
  globalRoom.round.isOpen = true;
  globalRoom.round.firstCorrectAt = null;

  // Reset per-round click flags
  for (const [, p] of globalRoom.players) {
    p.clickedThisRound = false;
    p.answeredCorrectlyThisRound = false;
  }

  // Broadcast globally
  const roundPayload = {
    roundId: globalRoom.round.id,
    sentence: globalRoom.round.sentence,
    revealTime: globalRoom.round.revealTime,
  };

  // Include story progress if a story is active
  if (globalRoom.storyMeta) {
    roundPayload.storyProgress = {
      storyMeta: globalRoom.storyMeta,
      storyRoundIndex: globalRoom.storyRoundIndex,
      revealedRounds: [...globalRoom.storyRevealedRounds],
    };
  }

  io.emit('round_start', roundPayload);

  // Auto-close after ANSWER_WINDOW
  globalRoom.roundCloseTimeout = setTimeout(() => closeRound(), ANSWER_WINDOW);
}

function closeRound() {
  if (!globalRoom.round.isOpen) return;

  globalRoom.round.isOpen = false;
  if (globalRoom.roundCloseTimeout) { clearTimeout(globalRoom.roundCloseTimeout); globalRoom.roundCloseTimeout = null; }

  // Update streaks
  for (const [, p] of globalRoom.players) {
    if (!p.isGM) {
      if (p.answeredCorrectlyThisRound) {
        p.streak++;
      } else if (p.clickedThisRound) {
        p.streak = 0;
      }
      if (!p.clickedThisRound && globalRoom.round.correctColor !== null) {
        p.streak = 0; // Missed a valid round
      }
    }
  }

  // Record story round result if story is active
  if (globalRoom.storyMeta) {
    // Find the sentence index for the current story round
    const currentRoundIdx = globalRoom.storyRoundIndex;
    const roundSentences = globalRoom.storyMeta.sentences.filter(s => s.isRound);
    if (roundSentences[currentRoundIdx]) {
      globalRoom.storyRevealedRounds.push({
        sentenceIndex: roundSentences[currentRoundIdx].sentenceIndex,
        color: globalRoom.round.correctColor,
      });
    }
    globalRoom.storyRoundIndex++;
  }

  const closedPayload = { roundId: globalRoom.round.id, correctColor: globalRoom.round.correctColor };

  // Include story progress in round_closed
  if (globalRoom.storyMeta) {
    closedPayload.storyProgress = {
      storyMeta: globalRoom.storyMeta,
      storyRoundIndex: globalRoom.storyRoundIndex,
      revealedRounds: [...globalRoom.storyRevealedRounds],
      isStoryComplete: globalRoom.storyRoundIndex >= globalRoom.storyQueue.length + 1, // +1 because we already shifted one
    };
  }

  io.emit('round_closed', closedPayload);
  broadcastLeaderboard();
}

// ─── Socket Handlers ─────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} connected | total: ${io.engine.clientsCount}`);

  socket.emit('welcome', { serverTime: serverNow() });

  // ── Time Sync ─────────────────────────────────────────────────────────────
  socket.on('time_sync', (clientSentAt) => {
    socket.emit('time_sync_reply', clientSentAt, serverNow());
  });

  // ── Join Game ─────────────────────────────────────────────────────────────
  socket.on('join', (payload) => {
    const data = typeof payload === 'string' ? { username: payload, avatar: '👤' } : payload;

    const clean = String(data.username || '').trim().slice(0, 24);
    const pass = String(data.hostPassword || '').trim();

    // Check if claiming or re-claiming GM role
    const isReclaimingHost = globalRoom.hostPassword && pass === globalRoom.hostPassword;
    const isGM = isReclaimingHost || (globalRoom.adminSocketId === socket.id);

    if (isGM) {
      globalRoom.adminSocketId = socket.id;
      
      // Update or create GM entry in player registry
      let hostPlayer = [...globalRoom.players.values()].find(p => p.isGM);
      if (!hostPlayer) {
        hostPlayer = {
          username: 'Host',
          avatar: '👑',
          isGM: true,
          isDisplay: false,
          hasJoined: true,
          score: 0,
          streak: 0,
          clickedThisRound: false,
          answeredCorrectlyThisRound: false,
        };
      }
      globalRoom.players.set(socket.id, hostPlayer);

      socket.emit('joined', {
        username: hostPlayer.username,
        avatar: hostPlayer.avatar,
        isGM: true,
        isDisplay: false,
        isLocked: globalRoom.isLocked
      });
      socket.emit('queue_update', globalRoom.storyQueue);
      sendLeaderboardTo(socket);
      return;
    }

    // Check if lobby is locked to regular players
    if (globalRoom.isLocked && !data.isDisplay) {
      socket.emit('join_error', 'The lobby is locked! The game has already started.');
      return;
    }

    const displayName = data.isDisplay ? "Display Screen" : (clean || 'Guest');

    // Username uniqueness checking for non-displays
    if (!data.isDisplay) {
      const requestedNameLower = displayName.toLowerCase();
      let isDuplicate = false;
      for (const [, p] of globalRoom.players) {
        if (p.hasJoined && !p.isGM && !p.isDisplay && p.username.toLowerCase() === requestedNameLower) {
          isDuplicate = true;
          break;
        }
      }
      if (isDuplicate) {
        socket.emit('join_error', 'That nickname is already taken!');
        return;
      }
    }

    const player = {
      username: displayName,
      avatar: data.isDisplay ? '📺' : (data.avatar || '👤'),
      isGM: false,
      isDisplay: !!data.isDisplay,
      hasJoined: true,
      score: 0,
      streak: 0,
      clickedThisRound: false,
      answeredCorrectlyThisRound: false,
    };

    globalRoom.players.set(socket.id, player);

    console.log(`  join: "${displayName}"`);
    socket.emit('joined', {
      username: displayName,
      avatar: player.avatar,
      isGM: false,
      isDisplay: player.isDisplay,
      isLocked: globalRoom.isLocked
    });

    sendLeaderboardTo(socket);
    broadcastPlayerCount();

    if (globalRoom.round.isOpen) {
      socket.emit('round_start', {
        roundId: globalRoom.round.id,
        sentence: globalRoom.round.sentence,
        revealTime: globalRoom.round.revealTime,
      });
    }
  });

  // ── Lock Lobby ────────────────────────────────────────────────────────────
  socket.on('gm_lock_room', () => {
    if (globalRoom.adminSocketId !== socket.id) return;

    globalRoom.isLocked = !globalRoom.isLocked;
    console.log(`[!] Lobby Lock status changed to ${globalRoom.isLocked}`);
    io.emit('room_lock_update', { isLocked: globalRoom.isLocked });
  });

  // ── Admin submits a sentence + correct colour ─────────────────────────────
  socket.on('gm_round', ({ sentence, correctColor }) => {
    if (globalRoom.adminSocketId !== socket.id) return;

    const trimmed = String(sentence || '').trim();
    if (!trimmed) return;

    const color = correctColor === null ? null : (COLORS.includes(correctColor) ? correctColor : null);
    if (correctColor !== null && color === null) return;

    if (globalRoom.round.isOpen) return;

    startRound(trimmed, color);
  });

  // ── Story Mode Queue Management ───────────────────────────────────────────
  socket.on('gm_queue_add', (payload) => {
    if (globalRoom.adminSocketId !== socket.id) return;
    
    // Support both old format (array) and new format ({ rounds, storyMeta })
    let rounds, storyMeta;
    if (Array.isArray(payload)) {
      rounds = payload;
      storyMeta = null;
    } else if (payload && Array.isArray(payload.rounds)) {
      rounds = payload.rounds;
      storyMeta = payload.storyMeta || null;
    } else {
      return;
    }

    globalRoom.storyQueue.push(...rounds);
    
    // Store story metadata if provided
    if (storyMeta) {
      globalRoom.storyMeta = storyMeta;
      globalRoom.storyRoundIndex = 0;
      globalRoom.storyRevealedRounds = [];
    }
    
    io.emit('queue_update', globalRoom.storyQueue);
  });

  socket.on('gm_queue_next', () => {
    if (globalRoom.adminSocketId !== socket.id) return;
    if (globalRoom.round.isOpen || globalRoom.storyQueue.length === 0) return;

    const next = globalRoom.storyQueue.shift();
    io.emit('queue_update', globalRoom.storyQueue);

    startRound(next.sentence, next.correctColor);
  });

  socket.on('gm_queue_clear', () => {
    if (globalRoom.adminSocketId !== socket.id) return;

    globalRoom.storyQueue = [];
    globalRoom.storyMeta = null;
    globalRoom.storyRoundIndex = 0;
    globalRoom.storyRevealedRounds = [];
    io.emit('queue_update', globalRoom.storyQueue);
  });

  // ── Admin force-close round ───────────────────────────────────────────────
  socket.on('gm_close', () => {
    if (globalRoom.adminSocketId !== socket.id) return;
    if (!globalRoom.round.isOpen) return;

    closeRound();
  });

  // ── Player click ──────────────────────────────────────────────────────────
  socket.on('click', ({ color, clickTime } = {}) => {
    if (!globalRoom.round.isOpen) return;

    const player = globalRoom.players.get(socket.id);
    if (!player || player.isGM || player.isDisplay) return;
    if (player.clickedThisRound) return; // Only first click registers

    player.clickedThisRound = true;

    const arrivalTime = serverNow();
    let effectiveTime = arrivalTime;
    if (typeof clickTime === 'number' && isFinite(clickTime)) {
      if (Math.abs(arrivalTime - clickTime) <= MAX_TRUST_DIFF) {
        effectiveTime = clickTime;
      }
    }

    const responseMs = Math.max(0, effectiveTime - globalRoom.round.revealTime);
    let points = 0;
    let isCorrect = false;

    // Trap validation
    if (globalRoom.round.correctColor === null) {
      socket.emit('click_result', {
        success: false,
        scoreGained: 0,
        isCorrect: false,
        isTrapTriggered: true,
        reason: 'wrong_trap',
      });
      return;
    }

    // Color match validation
    if (color === globalRoom.round.correctColor) {
      isCorrect = true;
      player.answeredCorrectlyThisRound = true;

      if (globalRoom.round.firstCorrectAt === null) {
        globalRoom.round.firstCorrectAt = effectiveTime;
        points = POINTS_FIRST;
      } else {
        const speedDriftMs = Math.max(0, effectiveTime - globalRoom.round.firstCorrectAt);
        const penalties = Math.floor(speedDriftMs / 100);
        points = Math.max(POINTS_MIN, POINTS_FIRST - (penalties * POINTS_DECAY));
      }

      player.score += points;
    }

    socket.emit('click_result', {
      success: isCorrect,
      scoreGained: points,
      isCorrect: isCorrect,
      isTrapTriggered: false,
      reason: isCorrect ? 'correct' : 'wrong',
    });

    if (isCorrect) {
      broadcastLeaderboard();
    }
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    if (globalRoom.adminSocketId === socket.id) {
      console.log(`[!] Admin disconnected`);
      globalRoom.adminSocketId = null;
    }

    globalRoom.players.delete(socket.id);
    console.log(`[-] ${socket.id} disconnected | total left: ${globalRoom.players.size}`);

    broadcastLeaderboard();
    broadcastPlayerCount();
  });
});

// Serve assets
app.use(express.static(path.join(__dirname, 'public')));

server.listen(PORT, () => {
  console.log(`[*] BalloonBurst server running on http://localhost:${PORT}`);
});
