import { io } from 'socket.io-client';

const URL = 'http://localhost:3000';

const host = io(URL, { transports: ['websocket'] });

host.on('connect', () => {
  console.log('✅ Host connected');
  host.emit('join', { username: 'Host', hostPassword: 'admin' });
});

host.on('joined', (data) => {
  console.log('✅ Host joined as GM:', data.isGM);
  
  // Connect 3 bots
  let botsReady = 0;
  const bots = [];
  for (let i = 0; i < 3; i++) {
    const bot = io(URL, { transports: ['websocket'], reconnection: false });
    bots.push(bot);
    bot.on('connect', () => bot.emit('join', { username: `Bot${i+1}`, avatar: '🤖' }));
    bot.on('joined', () => {
      botsReady++;
      if (botsReady === 3) startStoryTest();
    });
    bot.on('round_start', (rd) => {
      // Check for storyProgress
      if (rd.storyProgress) {
        console.log(`  🤖 Bot${i+1} sees story round ${rd.storyProgress.storyRoundIndex}`);
      }
      setTimeout(() => {
        const colors = ['red', 'yellow', 'orange', 'blue'];
        bot.emit('click', { color: colors[Math.floor(Math.random() * 4)] });
      }, 200 + Math.random() * 500);
    });
  }
  
  function startStoryTest() {
    console.log('✅ All bots joined — sending story queue...');
    
    // Simulate what the client would send for a story
    const storyMeta = {
      title: 'Story',
      sentences: [
        { text: 'It was a beautiful day.', isRound: false, roundIndex: null, sentenceIndex: 0 },
        { text: 'Alex read all his birthday cards.', isRound: true, roundIndex: 0, sentenceIndex: 1 },
        { text: 'The sky was clear and bright.', isRound: false, roundIndex: null, sentenceIndex: 2 },
        { text: 'The wind blew across the green.', isRound: true, roundIndex: 1, sentenceIndex: 3 },
      ],
    };
    
    const rounds = [
      { sentence: 'Alex read all his birthday cards.', correctColor: 'red' },
      { sentence: 'The wind blew across the green.', correctColor: 'blue' },
    ];
    
    host.emit('gm_queue_add', { rounds, storyMeta });
  }
});

host.on('queue_update', (q) => {
  console.log(`📋 Queue updated: ${q.length} rounds`);
  if (q.length === 2) {
    // Start the first round
    console.log('▶ Starting first queued round...');
    host.emit('gm_queue_next');
  }
});

let roundsCompleted = 0;

host.on('round_start', (data) => {
  console.log(`✅ Round ${data.roundId} started: "${data.sentence}"`);
  if (data.storyProgress) {
    console.log(`   📖 Story progress: round ${data.storyProgress.storyRoundIndex}, revealed: ${data.storyProgress.revealedRounds.length}`);
  } else {
    console.error('❌ No storyProgress in round_start!');
  }
});

host.on('round_closed', (data) => {
  roundsCompleted++;
  console.log(`✅ Round ${data.roundId} closed. Correct: ${data.correctColor}`);
  if (data.storyProgress) {
    console.log(`   📖 Revealed rounds: ${data.storyProgress.revealedRounds.length}, story complete: ${data.storyProgress.isStoryComplete}`);
  }
  
  if (roundsCompleted === 1) {
    // Start round 2
    setTimeout(() => {
      console.log('▶ Starting second queued round...');
      host.emit('gm_queue_next');
    }, 500);
  } else if (roundsCompleted === 2) {
    console.log('\n🎉 Story mode test passed!');
    setTimeout(() => process.exit(0), 500);
  }
});

setTimeout(() => {
  console.error('❌ Timeout');
  process.exit(1);
}, 20000);
