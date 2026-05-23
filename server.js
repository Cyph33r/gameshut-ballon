try {
  process.loadEnvFile();
} catch (e) {
  // Ignored if .env does not exist or process.loadEnvFile is not supported
}

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
const COLORS = ['red', 'yellow', 'orange', 'blue', 'green', 'gold'];
const ANSWER_WINDOW = 5_000 + 1_500;  // 1.5s delay + 5s window
const MAX_TRUST_DIFF = 2000;    // ms: max allowed drift for client clickTime
const POINTS_FIRST = 10;      // first correct answer gets this
const POINTS_DECAY = 1;       // lose 1 point per 100ms slower than first
const POINTS_MIN = 1;       // minimum score for a correct answer
const LEADERBOARD_MAX = 20;      // max entries shown

// ─── State ───────────────────────────────────────────────────────────────────
function createGlobalRoomState(hostPassword) {
  return {
    hostPassword: hostPassword ? hostPassword.trim() : null,
    isLocked: false,
    adminSocketId: null,
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
    scoresHistory: new Map(), // username (lowercase) -> player object
    poppedColors: [],
  };
}

const globalRoom = createGlobalRoomState(process.env.ADMIN_PASSWORD || process.env.HOST_PASSWORD);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sendLeaderboardTo(socket) {
  const sorted = [...globalRoom.players.values()].filter(p => !p.isGM && !p.isDisplay && p.hasJoined).sort((a, b) => b.score - a.score);
  const top10 = sorted.slice(0, LEADERBOARD_MAX).map((p, i) => {
    const currentRank = i + 1;
    const prevRank = p.previousRank || 0;
    const rankChange = prevRank > 0 ? prevRank - currentRank : 0; // positive = moved up
    return { username: p.username, avatar: p.avatar, score: p.score, streak: p.streak, rankChange };
  });
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
  const top10 = sorted.slice(0, LEADERBOARD_MAX).map((p, i) => {
    const currentRank = i + 1;
    const prevRank = p.previousRank || 0;
    const rankChange = prevRank > 0 ? prevRank - currentRank : 0; // positive = moved up
    return { username: p.username, avatar: p.avatar, score: p.score, streak: p.streak, rankChange };
  });

  // Log leaderboard standings to the server console / Render logs
  console.log(`\n================ [📊 LEADERBOARD STANDINGS - ${new Date().toISOString()}] ================`);
  console.log(`Active Round ID: ${globalRoom.round.id} | Total Players: ${sorted.length}`);
  if (top10.length === 0) {
    console.log(`  (No players registered on the leaderboard yet)`);
  } else {
    top10.forEach((p, i) => {
      const rank = i + 1;
      let changeIndicator = '';
      if (p.rankChange > 0) {
        changeIndicator = ` ▲${p.rankChange}`;
      } else if (p.rankChange < 0) {
        changeIndicator = ` ▼${Math.abs(p.rankChange)}`;
      }
      console.log(`  #${rank} ${p.avatar} ${p.username}: ${p.score} pts (Streak: ${p.streak})${changeIndicator}`);
    });
  }
  console.log(`============================================================\n`);

  for (const [id, p] of globalRoom.players) {
    if (p.isGM || p.isDisplay) {
      io.to(id).emit('leaderboard', { top10 });
    } else {
      const myRank = sorted.indexOf(p) + 1;
      io.to(id).emit('leaderboard', { top10, myRank, myScore: p.score, totalPlayers: sorted.length });
    }
  }
  // Update previousRank for all sorted players
  sorted.forEach((p, i) => { p.previousRank = i + 1; });
}

// ─── Round Lifecycle ─────────────────────────────────────────────────────────
function startRound(correctColor) {
  if (globalRoom.roundCloseTimeout) { clearTimeout(globalRoom.roundCloseTimeout); globalRoom.roundCloseTimeout = null; }

  globalRoom.round.id++;
  globalRoom.round.sentence = "";
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
    isFiller: false,
    poppedColors: [...globalRoom.poppedColors],
  };

  io.emit('round_start', roundPayload);

  globalRoom.roundCloseTimeout = setTimeout(() => closeRound(), ANSWER_WINDOW);
}

function closeRound() {
  if (!globalRoom.round.isOpen) return;

  globalRoom.round.isOpen = false;
  if (globalRoom.roundCloseTimeout) { clearTimeout(globalRoom.roundCloseTimeout); globalRoom.roundCloseTimeout = null; }

  // Add the correct color to the poppedColors array
  if (globalRoom.round.correctColor !== null) {
    if (!globalRoom.poppedColors.includes(globalRoom.round.correctColor)) {
      globalRoom.poppedColors.push(globalRoom.round.correctColor);
    }
  }

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

  const closedPayload = {
    roundId: globalRoom.round.id,
    correctColor: globalRoom.round.correctColor,
    poppedColors: [...globalRoom.poppedColors]
  };

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
    let isGM = false;

    if (globalRoom.hostPassword) {
      // If a password is set on the server:
      const isAttemptingGM = pass !== '' || data.isGM;
      if (isAttemptingGM) {
        if (pass === globalRoom.hostPassword) {
          isGM = true;
        } else {
          socket.emit('join_error', 'Incorrect host password!');
          return;
        }
      }
    } else {
      // If no password is set on the server:
      const isAttemptingGM = pass !== '' || data.isGM;
      if (isAttemptingGM && (globalRoom.adminSocketId === null || data.isGM)) {
        isGM = true;
      }
    }

    // Fallback if they are already the connected admin socket
    if (globalRoom.adminSocketId === socket.id) {
      isGM = true;
    }

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
          previousRank: 0,
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
      sendLeaderboardTo(socket);
      return;
    }

    const displayName = data.isDisplay ? "Display Screen" : (clean || 'Guest');
    const requestedNameLower = displayName.toLowerCase();
    const isRejoining = !data.isDisplay && globalRoom.scoresHistory.has(requestedNameLower);

    // Check if lobby is locked to regular players
    if (globalRoom.isLocked && !data.isDisplay && !isRejoining) {
      socket.emit('join_error', 'The lobby is locked! The game has already started.');
      return;
    }

    // Username uniqueness checking / old socket eviction
    if (!data.isDisplay) {
      let existingSocketId = null;
      for (const [id, p] of globalRoom.players) {
        if (p.hasJoined && !p.isGM && !p.isDisplay && p.username.toLowerCase() === requestedNameLower) {
          existingSocketId = id;
          break;
        }
      }

      if (existingSocketId) {
        if (isRejoining) {
          console.log(`[!] Evicting stale socket ${existingSocketId} for rejoining player ${displayName}`);
          const oldSocket = io.sockets.sockets.get(existingSocketId);
          if (oldSocket) {
            oldSocket.disconnect();
          }
          globalRoom.players.delete(existingSocketId);
        } else {
          socket.emit('join_error', 'That nickname is already taken!');
          return;
        }
      }
    }

    let player;
    if (isRejoining) {
      player = globalRoom.scoresHistory.get(requestedNameLower);
      console.log(`[+] Rejoining player "${displayName}" restored. Score: ${player.score}, Streak: ${player.streak}`);
    } else {
      player = {
        username: displayName,
        avatar: data.isDisplay ? '📺' : (data.avatar || '👤'),
        isGM: false,
        isDisplay: !!data.isDisplay,
        hasJoined: true,
        score: 0,
        streak: 0,
        previousRank: 0,
        clickedThisRound: false,
        answeredCorrectlyThisRound: false,
      };

      if (!player.isGM && !player.isDisplay) {
        globalRoom.scoresHistory.set(requestedNameLower, player);
      }
    }

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

  // ── Admin submits a colour to start a round ───────────────────────────────
  socket.on('gm_round', ({ sentence, correctColor } = {}) => {
    if (globalRoom.adminSocketId !== socket.id) return;
    if (globalRoom.round.isOpen) return;

    const color = correctColor === null ? null : (COLORS.includes(correctColor) ? correctColor : null);
    if (correctColor !== null && color === null) return;

    startRound(color);
  });

  // ── Admin force-close round ───────────────────────────────────────────────
  socket.on('gm_close', () => {
    if (globalRoom.adminSocketId !== socket.id) return;
    if (!globalRoom.round.isOpen) return;

    closeRound();
  });

  // ── Admin reset session ───────────────────────────────────────────────────
  socket.on('gm_reset_session', () => {
    if (globalRoom.adminSocketId !== socket.id) return;

    // Close any active round silently
    if (globalRoom.round.isOpen) {
      globalRoom.round.isOpen = false;
      if (globalRoom.roundCloseTimeout) { clearTimeout(globalRoom.roundCloseTimeout); globalRoom.roundCloseTimeout = null; }
    }

    // Reset round counter
    globalRoom.round.id = 0;
    globalRoom.round.sentence = null;
    globalRoom.round.correctColor = null;
    globalRoom.round.revealTime = null;
    globalRoom.round.firstCorrectAt = null;

    // Unlock lobby
    globalRoom.isLocked = false;

    // Reset poppedColors
    globalRoom.poppedColors = [];

    // Clear scores history
    globalRoom.scoresHistory.clear();

    // Reset all player scores and streaks, and re-populate scoresHistory
    // so connected players can still rejoin after a reload when lobby is locked
    for (const [, p] of globalRoom.players) {
      p.score = 0;
      p.streak = 0;
      p.previousRank = 0;
      p.clickedThisRound = false;
      p.answeredCorrectlyThisRound = false;

      if (!p.isGM && !p.isDisplay && p.hasJoined) {
        globalRoom.scoresHistory.set(p.username.toLowerCase(), p);
      }
    }

    console.log('[!] Session reset by admin');

    // Broadcast reset to all clients
    io.emit('session_reset');
    io.emit('room_lock_update', { isLocked: false });
    broadcastPlayerCount();
  });

  // ── Player click ──────────────────────────────────────────────────────────
  socket.on('click', ({ color, clickTime } = {}) => {
    const player = globalRoom.players.get(socket.id);
    if (!player || player.isGM || player.isDisplay) return;

    if (!globalRoom.round.isOpen) {
      // Clicked/popped when round has not started! Penalty!
      player.score -= 5;
      player.streak = 0;
      socket.emit('click_result', {
        success: false,
        scoreGained: -5,
        totalScore: player.score,
        responseMs: 0,
        selectedColor: color,
        isCorrect: false,
        isTrapTriggered: false,
        reason: 'not_started',
      });
      broadcastLeaderboard();
      return;
    }

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
      player.score -= 5;
      socket.emit('click_result', {
        success: false,
        scoreGained: -5,
        totalScore: player.score,
        responseMs,
        selectedColor: color,
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
      totalScore: player.score,
      responseMs,
      selectedColor: color,
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
