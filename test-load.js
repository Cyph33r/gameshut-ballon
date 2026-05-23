import { io } from 'socket.io-client';

const URL = process.env.URL || 'https://gameshut-ballon.onrender.com';
const NUM_CLIENTS = 100;

const COLORS = ['red', 'yellow', 'orange', 'blue'];
const adjectives = [
  'Popping', 'Floating', 'Rising', 'Drifting', 'Soaring', 
  'Bouncing', 'Inflated', 'Helium', 'Shiny', 'Glossy', 
  'Neon', 'Glowing', 'Golden', 'Silver', 'Prismatic', 
  'Magic', 'Swift', 'Quick', 'Rapid', 'Turbo', 
  'Mega', 'Super', 'Epic', 'Cosmic', 'Silent', 
  'Flash', 'Grand', 'Funky', 'Noble', 'Royal'
];
const nouns = [
  'Balloon', 'Bubble', 'Cloud', 'Spark', 'Popper', 
  'Wind', 'UFO', 'Kite', 'Parachute', 'Rocket', 
  'Crystal', 'Gem', 'Star', 'Sun', 'Comet', 
  'Fire', 'Water', 'Rainbow', 'Vortex', 'Gear', 
  'Shield', 'Crown', 'Key', 'Palette', 'Target', 
  'Dice', 'Clover', 'Feather', 'Heart', 'Ring'
];
const emojis = [
  '🎈', '🫧', '☁️', '⚡', '💥', 
  '💨', '🛸', '🪁', '🪂', '🚀', 
  '🔮', '💎', '⭐️', '☀️', '☄️', 
  '🔥', '💧', '🌈', '🌀', '⚙️', 
  '🛡️', '👑', '🔑', '🎨', '🎯', 
  '🎲', '🍀', '🪶', '💖', '💍'
];

const clients = [];

console.log(`Starting load test with ${NUM_CLIENTS} bots connecting to ${URL}...`);

for (let i = 0; i < NUM_CLIENTS; i++) {
  // Stagger connections slightly to simulate realistic incoming traffic and prevent port exhaustion
  setTimeout(() => {
    const socket = io(URL, {
      transports: ['websocket'],
      reconnection: false,
    });

    clients.push(socket);

    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const nounIdx = Math.floor(Math.random() * nouns.length);
    const noun = nouns[nounIdx];
    const username = `${adj} ${noun} ${i + 1}`;
    const avatar = emojis[nounIdx];

    socket.on('connect', () => {
      socket.emit('join', { username, avatar });
    });

    socket.on('round_start', (data) => {
      // Simulate reaction time: Between 50ms and 1500ms
      const reactionTimeMs = Math.floor(Math.random() * 1450) + 50;

      // Bots just pick a completely random colour (25% chance of guessing right)
      setTimeout(() => {
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];

        // We omit clickTime, letting the server fallback to arrival time
        socket.emit('click', { color });
      }, reactionTimeMs);
    });

    socket.on('connect_error', (err) => {
      console.log(`Connection error for Bot ${i + 1}:`, err.message);
    });

  }, i * 100); // 100ms stagger between each bot connecting (10 per second) to prevent Render reverse-proxy drops
}

// Log connection progress periodically
let connectedCount = 0;
setInterval(() => {
  const current = clients.filter(c => c.connected).length;
  if (current !== connectedCount) {
    connectedCount = current;
    console.log(`Connected bots: ${connectedCount} / ${NUM_CLIENTS}`);
  }
}, 1000);
