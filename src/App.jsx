import { useState, useEffect } from 'react'
import io from 'socket.io-client'

const COLORS = ['red', 'blue', 'green', 'yellow'];
const COLOR_HEX = {
  red: '#ff4757',
  blue: '#1e90ff',
  green: '#2ed573',
  yellow: '#eccc68'
};

const socket = io(window.location.origin.includes('localhost') ? 'http://localhost:3000' : '/');

function App() {
  const [hasJoined, setHasJoined] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  
  const [gameState, setGameState] = useState('waiting');
  const [primeInventory, setPrimeInventory] = useState({ red: 0, blue: 0, green: 0, yellow: 0 });
  const [players, setPlayers] = useState({});
  const [currentTarget, setCurrentTarget] = useState(null);
  const [targetTime, setTargetTime] = useState(null);
  
  const [timerAnimKey, setTimerAnimKey] = useState(0);
  const [timeOffset, setTimeOffset] = useState(0);
  const [isSynced, setIsSynced] = useState(false);

  // NTP Sync
  useEffect(() => {
    let syncCount = 0;
    let offsets = [];

    const doSync = () => {
      const clientTime = Date.now();
      socket.emit('sync_ping', clientTime);
    };

    const handlePong = (clientTimeSent, serverTime) => {
      const now = Date.now();
      const rtt = now - clientTimeSent;
      const serverTimeAtReceive = serverTime + (rtt / 2);
      const offset = serverTimeAtReceive - now;
      
      offsets.push(offset);
      
      if (syncCount < 5) {
        syncCount++;
        setTimeout(doSync, 100);
      } else {
        const avgOffset = offsets.reduce((a, b) => a + b, 0) / offsets.length;
        setTimeOffset(avgOffset);
        setIsSynced(true);
      }
    };

    socket.on('sync_pong', handlePong);
    doSync();

    return () => socket.off('sync_pong', handlePong);
  }, []);

  // Listen to game state
  useEffect(() => {
    const handleStateUpdate = (state) => {
      setGameState(state.gameState);
      setPrimeInventory(state.primeInventory);
      setPlayers(state.players);
      
      if (state.currentTarget !== currentTarget || state.targetTime !== targetTime) {
        setCurrentTarget(state.currentTarget);
        setTargetTime(state.targetTime);
        if (state.currentTarget) {
          setTimerAnimKey(k => k + 1);
        }
      }
    };

    socket.on('state_update', handleStateUpdate);
    return () => socket.off('state_update', handleStateUpdate);
  }, [currentTarget, targetTime]);

  const handleJoin = (e) => {
    e.preventDefault();
    if (!usernameInput.trim()) return;
    socket.emit('join_game', usernameInput.trim());
    setHasJoined(true);
  };

  const handlePlayerDispense = (color) => {
    if (gameState !== 'playing' || !currentTarget) return;
    const clickTime = Date.now() + timeOffset;
    socket.emit('player_click', { color, clickTime });
  };

  const startGame = () => {
    socket.emit('start_game');
  };

  if (!isSynced) {
    return <div id="game-container"><div className="screen active"><h2>Synchronizing Clocks...</h2></div></div>;
  }

  if (!hasJoined) {
    return (
      <div id="game-container">
        <div className="screen active">
          <h2>Join Sync Pop</h2>
          <form onSubmit={handleJoin} style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'center' }}>
            <input 
              type="text" 
              placeholder="Enter your Username" 
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              style={{ padding: '10px 15px', borderRadius: '8px', border: 'none', fontSize: '1.2rem', outline: 'none' }}
            />
            <p style={{fontSize: '0.9rem', opacity: 0.8}}>* Use username 'Admin' to host the game</p>
            <button type="submit" className="primary-btn" style={{marginTop: '0'}}>Join Game</button>
          </form>
        </div>
      </div>
    );
  }

  const myPlayer = players[socket.id] || { username: 'Guest', isAdmin: false, score: 0, inventory: { red: 0, blue: 0, green: 0, yellow: 0 }, lastClick: null };
  
  let targetBalloonState = '';
  if (!currentTarget) targetBalloonState = 'hidden';
  if (myPlayer.lastClick) targetBalloonState = 'pop-animation';

  return (
    <div id="game-container">
      <header>
        <h1>Sync Pop ({myPlayer.username})</h1>
        <div className="score-board">
          Score: <span>{myPlayer.score}</span>
        </div>
      </header>

      {gameState === 'waiting' && (
        <div className="screen active">
          <h2>Match the Prime Dispense!</h2>
          <p>Wait for the Prime to dispense a balloon. Click your matching balloon at the EXACT same time.</p>
          
          {myPlayer.isAdmin ? (
            <button className="primary-btn" onClick={startGame}>Start Game (Admin)</button>
          ) : (
            <p style={{ marginTop: '30px', fontWeight: 'bold', color: COLOR_HEX.yellow }}>Waiting for Admin to start the game...</p>
          )}
        </div>
      )}

      {gameState === 'playing' && (
        <div className="screen active">
          <div className="prime-area">
            <div className="status-text">{currentTarget ? 'Wait for it...' : ''}</div>
            <div className="target-container">
              <div 
                className={`balloon ${targetBalloonState}`} 
                style={{ 
                  backgroundColor: currentTarget ? COLOR_HEX[currentTarget] : 'transparent',
                  borderBottomColor: currentTarget ? COLOR_HEX[currentTarget] : 'transparent'
                }}
              >
                {currentTarget && !myPlayer.lastClick && (
                  <div key={timerAnimKey} className="timer-ring animating"></div>
                )}
              </div>
            </div>
          </div>

          <div className={`feedback ${myPlayer.lastClick?.points > 0 ? 'success' : (myPlayer.lastClick?.points === 0 ? 'error' : '')}`}>
            {myPlayer.lastClick?.msg || ''}
          </div>

          <div className="player-area">
            <div className="inventory-controls">
              {COLORS.map(color => (
                <button 
                  key={color}
                  className={`balloon-btn ${myPlayer.inventory[color] === 0 || myPlayer.lastClick ? 'disabled' : ''}`} 
                  style={{ '--btn-color': COLOR_HEX[color] }}
                  onClick={() => handlePlayerDispense(color)}
                >
                  <span className="count">{myPlayer.inventory[color]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {gameState === 'end' && (
        <div className="screen active">
          <h2>Game Over</h2>
          <p>Final Score: <span>{myPlayer.score}</span></p>
          {myPlayer.isAdmin ? (
            <button className="primary-btn" onClick={startGame}>Play Again</button>
          ) : (
            <p style={{ marginTop: '30px', fontWeight: 'bold', color: COLOR_HEX.yellow }}>Waiting for Admin to start a new game...</p>
          )}
        </div>
      )}
    </div>
  )
}

export default App
