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
        const colors = ['red', 'yellow', 'orange', 'blue', 'green', 'gold'];
        bot.emit('click', { color: colors[Math.floor(Math.random() * 6)] });
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
      { sentence: 'It was a beautiful day.', correctColor: null, isRound: false, sentenceIndex: 0 },
      { sentence: 'Alex read all his birthday cards.', correctColor: 'red', isRound: true, sentenceIndex: 1 },
      { sentence: 'The sky was clear and bright.', correctColor: null, isRound: false, sentenceIndex: 2 },
      { sentence: 'The wind blew across the green.', correctColor: 'blue', isRound: true, sentenceIndex: 3 },
    ];
    
    host.emit('gm_queue_add', { rounds, storyMeta });
  }
});

host.on('queue_update', (q) => {
  console.log(`📋 Queue updated: ${q.length} rounds`);
  if (q.length === 4) {
    console.log('▶ Starting first queued filler sentence...');
    host.emit('gm_queue_next');
  }
});

let activeRoundsCompleted = 0;

host.on('round_start', (data) => {
  console.log(`✅ Sentence ${data.roundId} started: "${data.sentence}" (Filler: ${data.isFiller})`);
  if (data.storyProgress) {
    console.log(`   📖 Story progress active idx: ${data.storyProgress.storyActiveSentenceIndex}, revealed: ${data.storyProgress.revealedRounds.length}`);
  }
  
  if (data.isFiller) {
    // It's a filler sentence! Since filler sentences don't have timers or click handlers,
    // the host is free to click "Next" immediately to advance!
    setTimeout(() => {
      console.log('▶ Starting next queued round/filler...');
      host.emit('gm_queue_next');
    }, 500);
  }
});

host.on('round_closed', (data) => {
  activeRoundsCompleted++;
  console.log(`✅ Active Round ${data.roundId} closed. Correct: ${data.correctColor}`);
  if (data.storyProgress) {
    console.log(`   📖 Revealed rounds: ${data.storyProgress.revealedRounds.length}, story complete: ${data.storyProgress.isStoryComplete}`);
  }
  
  if (activeRoundsCompleted === 1) {
    // Start next queued item (which is sentence index 2: clear sky - a filler sentence!)
    setTimeout(() => {
      console.log('▶ Advancing to next sentence...');
      host.emit('gm_queue_next');
    }, 500);
  } else if (activeRoundsCompleted === 2) {
    console.log('\n🎉 Progressive full-story E2E test passed!');
    setTimeout(() => process.exit(0), 500);
  }
});

setTimeout(() => {
  console.error('❌ Timeout');
  process.exit(1);
}, 20000);
