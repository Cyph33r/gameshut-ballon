import { io } from 'socket.io-client';

const URL = 'http://localhost:3000';
console.log(`Running Rejoin when Locked Test against ${URL}...`);

// 1. Connect Host
const hostSocket = io(URL, { transports: ['websocket'], forceNew: true });

hostSocket.on('connect', () => {
  console.log('[Host] Connected. Joining as GM...');
  hostSocket.emit('join', { username: 'Host', isGM: true, hostPassword: 'admin' });
});

let playerSocket;
let testPlayerScore = 0;

hostSocket.on('joined', (data) => {
  if (data.isGM) {
    console.log('[Host] Joined successfully.');
    // 2. Connect Player
    connectPlayer();
  }
});

function connectPlayer() {
  playerSocket = io(URL, { transports: ['websocket'], forceNew: true });
  playerSocket.on('connect', () => {
    console.log('[Player] Connected. Joining as "TestPlayer"...');
    playerSocket.emit('join', { username: 'TestPlayer', avatar: '🦖' });
  });

  playerSocket.on('joined', (data) => {
    console.log('[Player] Joined successfully.');
    // 3. Host starts a round
    console.log('[Host] Starting test round...');
    hostSocket.emit('gm_round', { sentence: 'Click on yellow', correctColor: 'yellow' });
  });

  playerSocket.on('round_start', (data) => {
    console.log('[Player] Round started. Clicking yellow...');
    // Click correct color
    playerSocket.emit('click', { color: 'yellow' });
  });

  playerSocket.on('click_result', (res) => {
    console.log('[Player] Click result:', res);
    testPlayerScore = res.totalScore;
    // Host closes the round
    console.log('[Host] Closing round...');
    hostSocket.emit('gm_close');
  });

  playerSocket.on('round_closed', () => {
    console.log('[Player] Round closed. Player Score is now:', testPlayerScore);
    if (testPlayerScore > 0) {
      proceedToLockedLobbyTest();
    } else {
      console.error('FAILED: Player score is 0. Cannot test score preservation.');
      cleanupAndExit(1);
    }
  });
}

function proceedToLockedLobbyTest() {
  // 4. Host locks the lobby
  console.log('[Host] Locking lobby...');
  hostSocket.emit('gm_lock_room');

  hostSocket.once('room_lock_update', (lockData) => {
    console.log('[Host] Room lock updated. isLocked =', lockData.isLocked);
    if (lockData.isLocked) {
      // Disconnect the player socket
      console.log('[Player] Disconnecting player socket (simulating refresh)...');
      playerSocket.disconnect();

      // Wait a short bit and then try to join with a new player "Stranger"
      setTimeout(testStrangerJoin, 500);
    } else {
      console.error('FAILED: Room did not lock.');
      cleanupAndExit(1);
    }
  });
}

function testStrangerJoin() {
  console.log('[Stranger] Connecting brand new player socket...');
  const strangerSocket = io(URL, { transports: ['websocket'], forceNew: true });
  strangerSocket.on('connect', () => {
    console.log('[Stranger] Joined server. Emitting join event when lobby is locked...');
    strangerSocket.emit('join', { username: 'Stranger' });
  });

  strangerSocket.on('join_error', (errMsg) => {
    console.log('[Stranger] Successfully blocked as expected. Error message:', errMsg);
    strangerSocket.disconnect();

    // Now test rejoining as "TestPlayer"
    setTimeout(testPlayerRejoin, 500);
  });

  strangerSocket.on('joined', () => {
    console.error('FAILED: Stranger was allowed to join a locked lobby!');
    strangerSocket.disconnect();
    cleanupAndExit(1);
  });
}

function testPlayerRejoin() {
  console.log('[Player Rejoin] Connecting rejoining player socket...');
  const rejoinSocket = io(URL, { transports: ['websocket'], forceNew: true });
  rejoinSocket.on('connect', () => {
    console.log('[Player Rejoin] Emitting join as "TestPlayer" to locked lobby...');
    rejoinSocket.emit('join', { username: 'TestPlayer', avatar: '🦖' });
  });

  rejoinSocket.on('join_error', (errMsg) => {
    console.error('FAILED: Rejoining player was blocked with error:', errMsg);
    rejoinSocket.disconnect();
    cleanupAndExit(1);
  });

  rejoinSocket.on('joined', (joinedData) => {
    console.log('[Player Rejoin] Successfully rejoined locked lobby!', joinedData);
    
    // Request leaderboard to verify score is preserved
    rejoinSocket.once('leaderboard', (lbData) => {
      console.log('[Player Rejoin] Received leaderboard after rejoin:', lbData);
      
      const me = lbData.top10.find(p => p.username === 'TestPlayer');
      if (me && me.score === testPlayerScore) {
        console.log(`\n🎉 SUCCESS: Rejoining player bypassed lock check and score was preserved (${me.score} points)!`);
        rejoinSocket.disconnect();
        
        // Reset the host session to unlock it for other tests
        console.log('[Host] Resetting session...');
        hostSocket.emit('gm_reset_session');
        setTimeout(() => {
          cleanupAndExit(0);
        }, 500);
      } else {
        console.error('FAILED: Score not preserved or player not found on leaderboard. Found:', me);
        rejoinSocket.disconnect();
        cleanupAndExit(1);
      }
    });
  });
}

function cleanupAndExit(code) {
  hostSocket.disconnect();
  process.exit(code);
}
