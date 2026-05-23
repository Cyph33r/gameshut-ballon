import { io } from 'socket.io-client';

const URL = 'http://localhost:3000';
const COLORS = ['red', 'blue', 'yellow', 'orange'];

console.log('====================================================');
console.log('🎈   BALLOONBURST OBSERVABLE DEMO & BOT RUNNER   🎈');
console.log('====================================================');
console.log('This script will spawn bots, set up the official');
console.log('Story 1 (Little Alex Horne\'s Birthday), and run it');
console.log('automatically so you can observe all features on the');
console.log('Display Screen in real time!');
console.log('');
console.log('👉 INSTRUCTIONS:');
console.log('1. Open your browser to: http://localhost:3000/?display');
console.log('2. Sit back and watch the display screen!');
console.log('====================================================\n');

// 1. Connect as Host/GM
const host = io(URL, { transports: ['websocket'] });

host.on('connect', () => {
  console.log('✅ Host connected to server.');
  // Join as GM using the default admin password
  host.emit('join', { username: 'Host', hostPassword: 'admin' });
});

host.on('joined', (data) => {
  console.log('👑 Host authorized as GM:', data.isGM);
  if (!data.isGM) {
    console.error('❌ Failed to claim GM role! Is the server password customized?');
    process.exit(1);
  }

  console.log('🔄 Resetting session to start fresh...');
  host.emit('gm_reset_session');

  // Stagger bot logins so they pop onto the lobby beautifully!
  console.log('👥 Spawning 30 bots to join the game...');
  spawnBots(30);
});

const bots = [];
const BOT_PRESETS = [];
const emojis = ['🐯', '🦊', '🐻', '🐺', '🦉', '🐼', '🦁', '🐨', '🐸', '🐙', '🐰', '🐔', '🐧', '🦆', '🐒', '🦄', '🐝', '🐞', '🐢', '🐍', '🐙', '🐡', '🐠', '🐬', '🐳', '🦈', '🐊', '🐆', '🦓', '🐘', '🦛', '🦏', '🐪', '🦒', '🦘', '🦙', '🐏', '🐖', '🦌', '🐎'];
const names = ['Tiger', 'Fox', 'Bear', 'Wolf', 'Owl', 'Panda', 'Lion', 'Koala', 'Frog', 'Octopus', 'Rabbit', 'Chicken', 'Penguin', 'Duck', 'Monkey', 'Unicorn', 'Bee', 'Ladybug', 'Turtle', 'Snake', 'Octopus', 'Blowfish', 'Fish', 'Dolphin', 'Whale', 'Shark', 'Crocodile', 'Leopard', 'Zebra', 'Elephant', 'Hippo', 'Rhino', 'Camel', 'Giraffe', 'Kangaroo', 'Llama', 'Ram', 'Pig', 'Deer', 'Horse'];

for (let i = 0; i < 40; i++) {
  const suffix = i >= names.length ? ` ${Math.floor(i / names.length) + 1}` : '';
  BOT_PRESETS.push({
    name: `${names[i % names.length]}${suffix}`,
    avatar: emojis[i % emojis.length]
  });
}


function spawnBots(count) {
  let botsJoined = 0;

  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const preset = BOT_PRESETS[i];
      const bot = io(URL, { transports: ['websocket'], reconnection: false });
      bots.push(bot);

      bot.on('connect', () => {
        bot.emit('join', { username: preset.name, avatar: preset.avatar });
      });

      bot.on('joined', () => {
        botsJoined++;
        console.log(`   🤖 Bot Joined: ${preset.name} (${botsJoined}/${count})`);

        if (botsJoined === count) {
          console.log('\n✅ All bots successfully registered! Waiting 5 seconds before queuing the Story...');
          setTimeout(queueStory1, 5000);
        }
      });

      // Bot click response logic
      bot.on('round_start', (rd) => {
        if (rd.isFiller) {
          return; // Narrative sentences don't accept clicks
        }

        // Parse hint in the sentence (e.g. "sounds like red", "sounds like trap")
        const hintMatch = rd.sentence.match(/\((?:sounds?\s+like|like|≈)\s*(red|blue|yellow|orange|trap)/i);

        let targetColor = null;
        let isTrap = true;

        if (hintMatch) {
          const matched = hintMatch[1].toLowerCase();
          if (matched !== 'trap') {
            targetColor = matched;
            isTrap = false;
          }
        }

        // Add a realistic human click reaction delay (500ms to 2500ms)
        const delay = 600 + Math.random() * 1600;

        setTimeout(() => {
          if (isTrap) {
            // 25% chance a bot gets tricked by the trap round and clicks anyway
            if (Math.random() < 0.25) {
              const randomColor = COLORS[Math.floor(Math.random() * COLORS.length)];
              console.log(`     🚨 [${preset.name}] Tricked by trap! Clicks: ${randomColor.toUpperCase()} (-5 penalty)`);
              bot.emit('click', { color: randomColor });
            } else {
              console.log(`     🛡️ [${preset.name}] Safe! Stays silent on trap round.`);
            }
          } else {
            // 80% chance of clicking the correct color
            if (Math.random() < 0.80) {
              console.log(`     🎯 [${preset.name}] Correct! Clicks: ${targetColor.toUpperCase()} (Delay: ${delay.toFixed(0)}ms)`);
              bot.emit('click', { color: targetColor });
            } else {
              // 20% chance of clicking an incorrect color
              const incorrects = COLORS.filter(c => c !== targetColor);
              const selectedWrong = incorrects[Math.floor(Math.random() * incorrects.length)];
              console.log(`     ❌ [${preset.name}] Misclicked! Clicks wrong color: ${selectedWrong.toUpperCase()}`);
              bot.emit('click', { color: selectedWrong });
            }
          }
        }, delay);
      });

    }, i * 300); // 300ms stagger between bot logins
  }
}

function queueStory1() {
  console.log('\n📥 Queueing "Story 1: Little Alex Horne\'s 46th Birthday"...');

  const storyMeta = {
    title: "Little Alex Horne's 46th Birthday 🎈",
    sentences: [
      { text: "It was the morning of the 46th Birthday of Little Alex Horne.", isRound: false, roundIndex: null, sentenceIndex: 0 },
      { text: "No one was excited but it was a beautiful day.", isRound: false, roundIndex: null, sentenceIndex: 1 },
      { text: "The sky was… clear, the sun was bright and the grass was.. looking even more neatly mowed than usual.", isRound: false, roundIndex: null, sentenceIndex: 2 },
      { text: "As is tradition, the party was held at his local Chesham Bowling Green.", isRound: false, roundIndex: null, sentenceIndex: 3 },
      { text: "To start the party, Alex read (sounds like red) all his birthday cards.", isRound: true, roundIndex: 0, sentenceIndex: 4 },
      { text: "One of his birthday cards was from the mayor and had all his favorite fruits on… apples, a bunch of bananas and his favorite of the citrus family, a lovely round… grapefruit.", isRound: false, roundIndex: null, sentenceIndex: 5 },
      { text: "Alex heard his phone ring… “Yeah?”, he answered.", isRound: false, roundIndex: null, sentenceIndex: 6 },
      { text: "It was his uncle, calling to ask if Alex had opened his small inexpensive gift.", isRound: false, roundIndex: null, sentenceIndex: 7 },
      { text: "The signal was not great, so Alex had to yell “Oh (sounds like yellow), yes, I did, thank you.”", isRound: true, roundIndex: 1, sentenceIndex: 8 },
      { text: "Alex hung up the phone and smiled.", isRound: false, roundIndex: null, sentenceIndex: 9 },
      { text: "Just then, a friend walked over wearing a bright jacket that looked like citrus peel; though Alex joked it might have been an or an edge (sounds like orange) of some brighter.", isRound: true, roundIndex: 2, sentenceIndex: 10 },
      { text: "Suddenly, the wind blew (sounds like blue) across the bowling green.", isRound: true, roundIndex: 3, sentenceIndex: 11 },
      { text: "This was a trap round (sounds like trap).", isRound: true, roundIndex: 4, sentenceIndex: 12 },
      { text: "The party was a success.", isRound: false, roundIndex: null, sentenceIndex: 13 }
    ]
  };

  const rounds = [
    { sentence: "It was the morning of the 46th Birthday of Little Alex Horne.", correctColor: null, isRound: false, sentenceIndex: 0 },
    { sentence: "No one was excited but it was a beautiful day.", correctColor: null, isRound: false, sentenceIndex: 1 },
    { sentence: "The sky was… clear, the sun was bright and the grass was.. looking even more neatly mowed than usual.", correctColor: null, isRound: false, sentenceIndex: 2 },
    { sentence: "As is tradition, the party was held at his local Chesham Bowling Green.", correctColor: null, isRound: false, sentenceIndex: 3 },
    { sentence: "To start the party, Alex read (sounds like red) all his birthday cards.", correctColor: "red", isRound: true, sentenceIndex: 4 },
    { sentence: "One of his birthday cards was from the mayor and had all his favorite fruits on… apples, a bunch of bananas and his favorite of the citrus family, a lovely round… grapefruit.", correctColor: null, isRound: false, sentenceIndex: 5 },
    { sentence: "Alex heard his phone ring… “Yeah?”, he answered.", correctColor: null, isRound: false, sentenceIndex: 6 },
    { sentence: "It was his uncle, calling to ask if Alex had opened his small inexpensive gift.", correctColor: null, isRound: false, sentenceIndex: 7 },
    { sentence: "The signal was not great, so Alex had to yell “Oh (sounds like yellow), yes, I did, thank you.”", correctColor: "yellow", isRound: true, sentenceIndex: 8 },
    { sentence: "Alex hung up the phone and smiled.", correctColor: null, isRound: false, sentenceIndex: 9 },
    { sentence: "Just then, a friend walked over wearing a bright jacket that looked like citrus peel; though Alex joked it might have been an or an edge (sounds like orange) of some brighter.", correctColor: "orange", isRound: true, sentenceIndex: 10 },
    { sentence: "Suddenly, the wind blew (sounds like blue) across the bowling green.", correctColor: "blue", isRound: true, sentenceIndex: 11 },
    { sentence: "This was a trap round (sounds like trap).", correctColor: null, isRound: true, sentenceIndex: 12 },
    { sentence: "The party was a success.", correctColor: null, isRound: false, sentenceIndex: 13 }
  ];

  host.emit('gm_queue_add', { rounds, storyMeta });
}

// Track story queue updates to trigger auto-play
host.on('queue_update', (q) => {
  // If queue has reached the target length of 14, start the first round!
  if (q.length === 14) {
    console.log('\n🏁 Story queue loaded! Starting automated story play in 3 seconds...');
    setTimeout(() => {
      host.emit('gm_queue_next');
    }, 3000);
  }
});

let completedActiveRounds = 0;

host.on('round_start', (data) => {
  const isFiller = data.isFiller;
  if (isFiller) {
    console.log(`\n📖 [NARRATIVE SENTENCE] ("${data.sentence}")`);
    console.log('   (Observing display screen - Leaderboard is NOT shown for narrative sentences!)');

    // Narrative filler sentences don't have timers or click handlers.
    // Wait 6 seconds for comfortable reading, then auto-advance!
    setTimeout(() => {
      console.log('▶ Advancing to next story sentence...');
      host.emit('gm_queue_next');
    }, 6000);
  } else {
    const isTrapRound = data.sentence.includes('trap');
    console.log(`\n🎯 [ACTIVE GAME ROUND] ("${data.sentence}")`);
    if (isTrapRound) {
      console.log('   🚫 TRAP ROUND: Bots should avoid clicking. Wrong clicks will penalize 5 points.');
    } else {
      console.log('   🎈 Timing is active! Bots are reading and preparing to click.');
    }
  }
});

host.on('round_closed', (data) => {
  completedActiveRounds++;
  const isTrap = data.correctColor === null;
  console.log(`\n🏁 Active Round Closed! Correct color: ${isTrap ? '🚫 TRAP' : data.correctColor.toUpperCase()}`);
  console.log('📊 Leaderboard showing on display screen with rank change indicators (▲/▼/NEW).');

  const isStoryComplete = data.storyProgress && data.storyProgress.isStoryComplete;

  if (isStoryComplete) {
    console.log('\n🎉 ====================================================');
    console.log('🎉   DEMO COMPLETE! Little Alex Horne\'s Birthday Story  ');
    console.log('🎉   has finished successfully!                        ');
    console.log('======================================================');
    console.log('The bots will remain connected to let you inspect the');
    console.log('leaderboard display. Feel free to stop this script');
    console.log('with Ctrl+C at any time.');
  } else {
    // Wait 8 seconds to let the user observe the leaderboard ranks shifting in real-time!
    console.log('⏳ Displaying leaderboard for 8 seconds...');
    setTimeout(() => {
      console.log('▶ Advancing to next story sentence...');
      host.emit('gm_queue_next');
    }, 8000);
  }
});
