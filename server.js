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
const COLORS = ['red', 'blue', 'yellow', 'green'];
const ANSWER_WINDOW = 5_000 + 1_500;  // 1.5s delay + 5s window
const MAX_TRUST_DIFF = 2000;    // ms: max allowed drift for client clickTime
const POINTS_FIRST = 10;      // first correct answer gets this
const POINTS_DECAY = 1;       // lose 1 point per 100ms slower than first
const POINTS_MIN = 1;       // minimum score for a correct answer
const LEADERBOARD_MAX = 20;      // max entries shown

// ─── State ───────────────────────────────────────────────────────────────────
const rooms = new Map(); // roomCode (String) -> room state object

function createRoomState(code, hostPassword = '') {
  return {
    code,
    hostPassword: hostPassword.trim(),
    isLocked: false,
    adminSocketId: null,
    storyQueue: [],
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

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing chars like O, I, 1, 0
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(code));
  return code;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sendLeaderboardTo(socket, roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const sorted = [...room.players.values()].filter(p => !p.isGM && !p.isDisplay && p.hasJoined).sort((a, b) => b.score - a.score);
  const top10 = sorted.slice(0, LEADERBOARD_MAX).map(p => ({
    username: p.username, avatar: p.avatar, score: p.score, streak: p.streak
  }));
  const p = room.players.get(socket.id);
  if (!p || p.isGM || p.isDisplay) {
    socket.emit('leaderboard', { top10 });
  } else {
    const myRank = sorted.indexOf(p) + 1;
    socket.emit('leaderboard', { top10, myRank, myScore: p.score, totalPlayers: sorted.length });
  }
}

function broadcastPlayerCount(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const activePlayers = [...room.players.values()].filter(p => !p.isGM && !p.isDisplay && p.hasJoined);
  const count = activePlayers.length;
  const avatars = activePlayers.slice(0, 20).map(p => ({ avatar: p.avatar, username: p.username }));
  io.to(roomCode).emit('player_count', { count, avatars });
}

function broadcastLeaderboard(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const sorted = [...room.players.values()].filter(p => !p.isGM && !p.isDisplay && p.hasJoined).sort((a, b) => b.score - a.score);
  const top10 = sorted.slice(0, LEADERBOARD_MAX).map(p => ({
    username: p.username, avatar: p.avatar, score: p.score, streak: p.streak
  }));
  for (const [id, p] of room.players) {
    if (p.isGM || p.isDisplay) {
      io.to(id).emit('leaderboard', { top10 });
    } else {
      const myRank = sorted.indexOf(p) + 1;
      io.to(id).emit('leaderboard', { top10, myRank, myScore: p.score, totalPlayers: sorted.length });
    }
  }
}

// ─── Round Lifecycle ─────────────────────────────────────────────────────────
function startRound(roomCode, sentence, correctColor) {
  const room = rooms.get(roomCode);
  if (!room) return;

  if (room.roundCloseTimeout) { clearTimeout(room.roundCloseTimeout); room.roundCloseTimeout = null; }

  room.round.id++;
  room.round.sentence = sentence;
  room.round.correctColor = correctColor; // null = trap round
  room.round.revealTime = serverNow() + 1500; // Account for overlay transition
  room.round.isOpen = true;
  room.round.firstCorrectAt = null;

  // Reset per-round click flags
  for (const [, p] of room.players) {
    p.clickedThisRound = false;
    p.answeredCorrectlyThisRound = false;
  }

  // Broadcast to room
  io.to(roomCode).emit('round_start', {
    roundId: room.round.id,
    sentence: room.round.sentence,
    revealTime: room.round.revealTime,
  });

  // Auto-close after ANSWER_WINDOW
  room.roundCloseTimeout = setTimeout(() => closeRound(roomCode), ANSWER_WINDOW);
}

function closeRound(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || !room.round.isOpen) return;

  room.round.isOpen = false;
  if (room.roundCloseTimeout) { clearTimeout(room.roundCloseTimeout); room.roundCloseTimeout = null; }

  // Update streaks
  for (const [, p] of room.players) {
    if (!p.isGM) {
      if (p.answeredCorrectlyThisRound) {
        p.streak++;
      } else if (p.clickedThisRound) {
        p.streak = 0;
      }
      if (!p.clickedThisRound && room.round.correctColor !== null) {
        p.streak = 0; // Missed a valid round
      }
    }
  }

  io.to(roomCode).emit('round_closed', { roundId: room.round.id, correctColor: room.round.correctColor });
  broadcastLeaderboard(roomCode);
}

// ─── Socket Handlers ─────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[+] ${socket.id} connected | total: ${io.engine.clientsCount}`);

  socket.emit('welcome', { serverTime: serverNow() });

  // ── Time Sync ─────────────────────────────────────────────────────────────
  socket.on('time_sync', (clientSentAt) => {
    socket.emit('time_sync_reply', clientSentAt, serverNow());
  });

  // ── Create Room ───────────────────────────────────────────────────────────
  socket.on('create_room', ({ hostPassword } = {}) => {
    const roomCode = generateRoomCode();
    const room = createRoomState(roomCode, hostPassword);
    
    // Set socket properties
    socket.roomCode = roomCode;
    socket.join(roomCode);
    
    room.adminSocketId = socket.id;
    rooms.set(roomCode, room);

    const hostPlayer = {
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
    room.players.set(socket.id, hostPlayer);

    console.log(`[+] Room ${roomCode} created by host (${socket.id})`);
    socket.emit('joined', {
      username: 'Host',
      avatar: '👑',
      isGM: true,
      isDisplay: false,
      roomCode,
      isLocked: false
    });
  });

  // ── Join Room ─────────────────────────────────────────────────────────────
  socket.on('join', (payload) => {
    const data = typeof payload === 'string' ? { username: payload, avatar: '👤' } : payload;
    const roomCode = String(data.roomCode || '').toUpperCase().trim();
    
    if (!roomCode) {
      socket.emit('join_error', 'Please enter a Room Code!');
      return;
    }

    const room = rooms.get(roomCode);
    if (!room) {
      socket.emit('join_error', `Room "${roomCode}" not found!`);
      return;
    }

    const clean = String(data.username || '').trim().slice(0, 24);
    const pass = String(data.hostPassword || '').trim();

    // Check if re-claiming GM role
    const isReclaimingHost = room.hostPassword && pass === room.hostPassword;
    const isGM = isReclaimingHost || (room.adminSocketId === socket.id);

    if (isGM) {
      room.adminSocketId = socket.id;
      
      // Update or create GM entry in player registry
      let hostPlayer = [...room.players.values()].find(p => p.isGM);
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
      room.players.set(socket.id, hostPlayer);
      socket.roomCode = roomCode;
      socket.join(roomCode);

      socket.emit('joined', {
        username: hostPlayer.username,
        avatar: hostPlayer.avatar,
        isGM: true,
        isDisplay: false,
        roomCode,
        isLocked: room.isLocked
      });
      socket.emit('queue_update', room.storyQueue);
      sendLeaderboardTo(socket, roomCode);
      return;
    }

    // Check if room is locked to regular players
    if (room.isLocked && !data.isDisplay) {
      socket.emit('join_error', 'This room is locked! The game has already started.');
      return;
    }

    const displayName = data.isDisplay ? "Display Screen" : (clean || 'Guest');

    // Username uniqueness checking for non-displays
    if (!data.isDisplay) {
      const requestedNameLower = displayName.toLowerCase();
      let isDuplicate = false;
      for (const [, p] of room.players) {
        if (p.hasJoined && !p.isGM && !p.isDisplay && p.username.toLowerCase() === requestedNameLower) {
          isDuplicate = true;
          break;
        }
      }
      if (isDuplicate) {
        socket.emit('join_error', 'That nickname is already taken in this room!');
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

    room.players.set(socket.id, player);
    socket.roomCode = roomCode;
    socket.join(roomCode);

    console.log(`  join: "${displayName}" in room ${roomCode}`);
    socket.emit('joined', {
      username: displayName,
      avatar: player.avatar,
      isGM: false,
      isDisplay: player.isDisplay,
      roomCode,
      isLocked: room.isLocked
    });

    sendLeaderboardTo(socket, roomCode);
    broadcastPlayerCount(roomCode);

    if (room.round.isOpen) {
      socket.emit('round_start', {
        roundId: room.round.id,
        sentence: room.round.sentence,
        revealTime: room.round.revealTime,
      });
    }
  });

  // ── Lock Lobby ────────────────────────────────────────────────────────────
  socket.on('gm_lock_room', () => {
    const roomCode = socket.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room || room.adminSocketId !== socket.id) return;

    room.isLocked = !room.isLocked;
    console.log(`[!] Lobby Lock status changed to ${room.isLocked} for Room ${roomCode}`);
    io.to(roomCode).emit('room_lock_update', { isLocked: room.isLocked });
  });

  // ── Admin submits a sentence + correct colour ─────────────────────────────
  socket.on('gm_round', ({ sentence, correctColor }) => {
    const roomCode = socket.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room || room.adminSocketId !== socket.id) return;

    const trimmed = String(sentence || '').trim();
    if (!trimmed) return;

    const color = correctColor === null ? null : (COLORS.includes(correctColor) ? correctColor : null);
    if (correctColor !== null && color === null) return;

    if (room.round.isOpen) return;

    startRound(roomCode, trimmed, color);
  });

  // ── Story Mode Queue Management ───────────────────────────────────────────
  socket.on('gm_queue_add', (rounds) => {
    const roomCode = socket.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room || room.adminSocketId !== socket.id || !Array.isArray(rounds)) return;

    room.storyQueue.push(...rounds);
    io.to(roomCode).emit('queue_update', room.storyQueue);
  });

  socket.on('gm_queue_next', () => {
    const roomCode = socket.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room || room.adminSocketId !== socket.id) return;
    if (room.round.isOpen || room.storyQueue.length === 0) return;

    const next = room.storyQueue.shift();
    io.to(roomCode).emit('queue_update', room.storyQueue);

    startRound(roomCode, next.sentence, next.correctColor);
  });

  socket.on('gm_queue_clear', () => {
    const roomCode = socket.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room || room.adminSocketId !== socket.id) return;

    room.storyQueue = [];
    io.to(roomCode).emit('queue_update', room.storyQueue);
  });

  // ── Admin force-close round ───────────────────────────────────────────────
  socket.on('gm_close', () => {
    const roomCode = socket.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room || room.adminSocketId !== socket.id) return;
    if (!room.round.isOpen) return;

    closeRound(roomCode);
  });

  // ── Player click ──────────────────────────────────────────────────────────
  socket.on('click', ({ color, clickTime } = {}) => {
    const roomCode = socket.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room || !room.round.isOpen) return;

    const player = room.players.get(socket.id);
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

    const responseMs = Math.max(0, effectiveTime - room.round.revealTime);
    let points = 0;
    let isCorrect = false;

    // Trap validation
    if (room.round.correctColor === null) {
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
    if (color === room.round.correctColor) {
      isCorrect = true;
      player.answeredCorrectlyThisRound = true;

      if (room.round.firstCorrectAt === null) {
        room.round.firstCorrectAt = effectiveTime;
        points = POINTS_FIRST;
      } else {
        const speedDriftMs = Math.max(0, effectiveTime - room.round.firstCorrectAt);
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
      broadcastLeaderboard(roomCode);
    }
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const roomCode = socket.roomCode;
    if (roomCode) {
      const room = rooms.get(roomCode);
      if (room) {
        if (room.adminSocketId === socket.id) {
          console.log(`[!] Admin disconnected from room ${roomCode}`);
          room.adminSocketId = null;
        }

        room.players.delete(socket.id);
        console.log(`[-] ${socket.id} disconnected from room ${roomCode}`);

        broadcastLeaderboard(roomCode);
        broadcastPlayerCount(roomCode);

        // Auto-cleanup room if completely empty
        if (room.players.size === 0 && room.adminSocketId === null) {
          console.log(`[!] Cleaned up empty room ${roomCode}`);
          if (room.roundCloseTimeout) clearTimeout(room.roundCloseTimeout);
          rooms.delete(roomCode);
        }
      }
    } else {
      console.log(`[-] Connection closed for unassigned socket ${socket.id}`);
    }
  });
});

// Serve assets
app.use(express.static(path.join(__dirname, 'public')));

server.listen(PORT, () => {
  console.log(`[*] BalloonBurst server running on http://localhost:${PORT}`);
});
