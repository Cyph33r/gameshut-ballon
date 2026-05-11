# 🎈 BalloonBurst Multiplayer

A fast-paced, real-time multiplayer word association / homonym game built with Node.js and Socket.io. 

Players listen to a sentence broadcasted by the Host and must quickly react by "popping" the correct coloured balloon if a word in the sentence sounds like or is associated with a colour (e.g., "The villain had an evil **grin** on his face" -> Green). 

## 🎮 Gameplay Features
- **Real-Time Multiplayer:** Built with `socket.io` for zero-latency gameplay.
- **Latency-Compensated Scoring:** Uses an NTP-style monotonic clock sync to ensure the fastest player wins, regardless of network lag.
- **Story Mode (Auto-Queue):** Hosts can paste an entire story, click on words to map them to colours, and instantly generate a queue of trivia rounds.
- **Blind Answers:** Player choices are "locked in" without revealing correctness until the round concludes, maximizing suspense.
- **Text-to-Speech (TTS):** The Host's device automatically reads out the sentences aloud to the room.
- **Dynamic UI:** Features modern glassmorphism, pop animations, dynamic leaderboards, and "streak" badges.
- **Bulletproof Audio:** Uses native Web Audio Context and HTML5 Audio fallback to bypass strict mobile iOS Safari silencing.

## 🛠️ Tech Stack
- **Backend:** Node.js, Express, Socket.io
- **Frontend:** Vanilla JS, CSS3, HTML5 (Zero framework dependencies)
- **Deployment:** Render-ready (binds to `0.0.0.0` and dynamic `$PORT`)

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+ recommended)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/gameshut-ballon.git
   cd gameshut-ballon
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Running Locally
Start the development server:
```bash
npm run dev
```
The game will be available at `http://localhost:3000`.

### Playing the Game
1. Open the game in your browser.
2. Log in as `admin` to access the **Host Dashboard**.
3. Have players join from their devices using the same network IP or hosted URL.
4. Use **Story Mode** to prepare a queue of rounds or use **Single Sentence** for ad-hoc rounds.

## 🧪 Load Testing
A headless bot script is included to simulate high-traffic scenarios (e.g., 150 concurrent players).
```bash
node test-load.js
```

## 📜 License
MIT License
