import { io } from 'socket.io-client';

const URL = process.env.URL || 'http://localhost:3000';
const NUM_CLIENTS = 150;

const COLORS = ['red', 'blue', 'yellow', 'green'];
const adjectives = ['Happy','Blue','Fast','Clever','Brave','Wild','Cool','Epic','Magic','Sneaky','Fierce','Mighty','Swift','Lucky','Smart','Bold','Neon','Cosmic','Silent','Mega','Cyber','Super','Rapid','Hyper','Flash','Shiny','Grand','Funky','Noble','Royal'];
const nouns = ['Tiger','Fox','Bear','Wolf','Owl','Panda','Lion','Hawk','Duck','Frog','Dragon','Shark','Eagle','Cat','Dog','Seal','Koala','Whale','Puma','Cobra','Toad','Crow','Swan','Rhino','Moose','Sloth','Gecko','Lemur','Zebra','Sheep'];
const emojis = ['🐯','🦊','🐻','🐺','🦉','🐼','🦁','🦅','🦆','🐸','🐉','🦈','🐈','🐕','🦭','🐨','🐳','🐍','🦢','🦏','🦥','🦎','🦓','🐑','🦖','🦄','🐙','🐢','🐧','🦍'];

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
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const username = `${adj} ${noun} ${i+1}`;
    const avatar = emojis[Math.floor(Math.random() * emojis.length)];

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
      console.log(`Connection error for Bot ${i+1}:`, err.message);
    });

  }, i * 20); // 20ms stagger between each bot connecting
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
