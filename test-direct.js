import { io } from 'socket.io-client';

const URL = 'http://localhost:3000';
console.log(`Running Direct Launcher E2E Test against ${URL}...`);

const host = io(URL, { transports: ['websocket'], forceNew: true });

host.on('connect', () => {
  console.log('✅ Host connected. Joining as GM...');
  host.emit('join', { username: 'Host', isGM: true, hostPassword: 'admin' });
});

let botsReady = 0;
const bots = [];
let activeRoundsCompleted = 0;

host.on('joined', (data) => {
  console.log('✅ Host joined as GM:', data.isGM);

  // Connect 3 bots
  for (let i = 0; i < 3; i++) {
    const bot = io(URL, { transports: ['websocket'], reconnection: false, forceNew: true });
    bots.push(bot);
    bot.on('connect', () => bot.emit('join', { username: `Bot${i + 1}`, avatar: '🤖' }));
    bot.on('joined', () => {
      botsReady++;
      console.log(`  🤖 Bot${i + 1} joined successfully`);
      if (botsReady === 3) {
        startDirectTest();
      }
    });

    bot.on('round_start', (rd) => {
      console.log(`  🤖 Bot${i + 1} received round_start event.`);
      // Bots click a random balloon color
      setTimeout(() => {
        const colors = ['red', 'yellow', 'orange', 'blue', 'green', 'gold'];
        const chosenColor = colors[Math.floor(Math.random() * colors.length)];
        console.log(`  🤖 Bot${i + 1} clicks balloon: ${chosenColor}`);
        bot.emit('click', { color: chosenColor });
      }, 200 + Math.random() * 500);
    });
  }
});

function startDirectTest() {
  console.log('✅ All bots joined. GM starting first direct yellow round...');
  host.emit('gm_round', { correctColor: 'yellow' });
}

host.on('round_start', (data) => {
  console.log(`✅ Round ${data.roundId} started dynamically! (Target correct color is verbal/hidden)`);
  
  // Close the round after a short timeout
  setTimeout(() => {
    console.log('⏹ Host ending round early...');
    host.emit('gm_close');
  }, 2000);
});

host.on('round_closed', (data) => {
  activeRoundsCompleted++;
  console.log(`✅ Round ${data.roundId} closed on server. Correct color was: ${data.correctColor}`);

  if (activeRoundsCompleted === 1) {
    // Start second round with a different color (e.g. green)
    setTimeout(() => {
      console.log('\n✅ Starting second round (Target: green)...');
      host.emit('gm_round', { correctColor: 'green' });
    }, 1000);
  } else if (activeRoundsCompleted === 2) {
    console.log('\n🎉 E2E Direct Launch testing succeeded completely!');
    cleanupAndExit(0);
  }
});

function cleanupAndExit(code) {
  host.disconnect();
  bots.forEach(b => b.disconnect());
  setTimeout(() => process.exit(code), 500);
}

// Timeout backup
setTimeout(() => {
  console.error('❌ E2E Timeout occurred.');
  cleanupAndExit(1);
}, 15000);
