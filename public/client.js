(() => {
  const SYNC_SAMPLES = 10;
  const ANSWER_WINDOW = 15_000;

  // ── DOM Elements ───────────────────────────────────────────────────────────
  const $joinScreen    = document.getElementById('join-screen');
  const $gameScreen    = document.getElementById('game-screen');
  const $joinForm      = document.getElementById('join-form');
  const $usernameInput = document.getElementById('username-input');
  const $joinAvatar    = document.getElementById('join-avatar');
  const $btnRandom     = document.getElementById('btn-random');

  const $adminPanel    = document.getElementById('admin-panel');
  const $playerPanel   = document.getElementById('player-panel');
  const $lbPanel       = document.getElementById('lb-panel');

  const $roundNum      = document.getElementById('round-num');
  const $totalScore    = document.getElementById('total-score');

  // Admin
  const $sentenceForm   = document.getElementById('sentence-form');
  const $sentenceInput  = document.getElementById('sentence-input');
  const adminColourBtns = Array.from(document.querySelectorAll('.colour-btn'));
  const $adminError     = document.getElementById('admin-error');
  const $adminStatus    = document.getElementById('admin-status');
  const $adminRoundControls = document.getElementById('admin-round-controls');
  const $btnForceClose  = document.getElementById('btn-force-close');

  // Player
  const $sentenceArea   = document.getElementById('sentence-area');
  const $sentenceDisplay= document.getElementById('sentence-display');
  const $timerWrap      = document.getElementById('timer-wrap');
  const $timerBar       = document.getElementById('timer-bar');
  const $trapHint       = document.getElementById('trap-hint');
  const balloonBtns     = Array.from(document.querySelectorAll('.balloon-btn'));
  
  const $resultBar      = document.getElementById('result-bar');
  const $resultIcon     = document.getElementById('result-icon');
  const $resultText     = document.getElementById('result-text');
  const $resultSub      = document.getElementById('result-sub');
  const $resultPts      = document.getElementById('result-pts');
  const $noClickResult  = document.getElementById('no-click-result');

  // Leaderboard
  const $lbList         = document.getElementById('lb-list');
  const $lbRoundInfo    = document.getElementById('lb-round-info');
  const $lbAdminCta     = document.getElementById('lb-admin-cta');
  const $btnNextRound   = document.getElementById('btn-next-round');

  // Overlay
  const $overlay        = document.getElementById('overlay');
  const $ovSentence     = document.getElementById('ov-sentence');

  // Connection
  const $connStatus     = document.getElementById('conn-status');

  // ── State ──────────────────────────────────────────────────────────────────
  let timeOffset      = 0;
  let isGM            = false;
  let hasClicked      = false;
  let currentRoundId  = 0;
  let totalScore      = 0;
  let myUsername      = '';
  let myAvatar        = '👤';
  let resyncInterval  = null;
  let overlayTimer    = null;
  let closeTimer      = null;
  let currentRoundIsOpen = false;

  // ── Monotonic clock ────────────────────────────────────────────────────────
  const perfOrigin = performance.now();
  const dateOrigin = Date.now();
  const monoNow    = () => dateOrigin + (performance.now() - perfOrigin);
  const serverNow  = () => monoNow() + timeOffset;

  // ── Socket ─────────────────────────────────────────────────────────────────
  const socket = io();

  socket.on('connect', () => {
    setConn(true);
    clearInterval(resyncInterval);
    runTimeSync();
  });

  socket.on('disconnect', () => {
    clearInterval(resyncInterval);
    setConn(false);
  });

  socket.on('welcome', () => {});

  socket.on('joined', (data) => {
    isGM = data.isGM;
    showPanel(isGM ? 'admin' : 'player');
    if (!isGM) {
      setSentenceLabel('Waiting for the host to start a round...');
    }
  });

  // New round started
  socket.on('round_start', (data) => {
    showPanel(isGM ? 'admin' : 'player');
    currentRoundId = data.roundId;
    currentRoundIsOpen = true;
    $roundNum.textContent = data.roundId;
    hasClicked = false;

    if (isGM) {
      setAdminStatus(`Round ${data.roundId} — Active! Players are guessing...`, 'active');
      setAdminTilesEnabled(false);
      $adminRoundControls.classList.remove('hidden');
      $sentenceInput.value = '';
    } else {
      hideResult();
      showSentenceAndEnableTiles(data.sentence);
    }

    // Flash overlay
    showOverlay(data.sentence);

    if (!isGM) {
      $timerBar.classList.remove('active');
      $timerWrap.classList.remove('hidden');
      // Sync animation to revealTime
      const delay = Math.max(0, data.revealTime - serverNow());
      setTimeout(() => {
        $timerBar.style.animationDuration = `${ANSWER_WINDOW}ms`;
        $timerBar.classList.add('active');
      }, delay);
    }

    // Auto-disable client side after window (server authoritative anyway)
    clearTimeout(closeTimer);
    const timeUntilClose = Math.max(0, data.revealTime + ANSWER_WINDOW - serverNow());
    closeTimer = setTimeout(() => {
      disableAllBalloons();
    }, timeUntilClose);
  });

  socket.on('round_closed', (data) => {
    currentRoundIsOpen = false;
    clearTimeout(closeTimer);
    disableAllBalloons();
    
    $timerWrap.classList.add('hidden');
    $timerBar.classList.remove('active');

    // Reveal the correct balloon
    if (data.correctColor !== null) {
      balloonBtns.forEach(t => {
        if (t.dataset.color === data.correctColor) t.classList.add('correct');
      });
    }

    if (isGM) {
      setAdminTilesEnabled(true);
      setAdminStatus('Round over. Check the leaderboard, then enter the next sentence.', '');
      $adminRoundControls.classList.add('hidden');
    } else {
      if (!hasClicked) {
        $noClickResult.classList.remove('hidden');
        if (data.correctColor === null) {
          $noClickResult.innerHTML = '✨ <strong>Trap Evaded!</strong> Safe (+0 pts)';
          $noClickResult.className = 'no-click-result trap-safe';
        } else {
          $noClickResult.innerHTML = `⏳ <strong>Time's up!</strong> The colour was ${data.correctColor.toUpperCase()}`;
          $noClickResult.className = 'no-click-result time-up';
        }
      }
    }
  });

  socket.on('click_result', (data) => {
    totalScore = data.totalScore;
    $totalScore.textContent = totalScore;
    disableAllBalloons();
    showResult(data);
  });

  socket.on('leaderboard', (entries) => {
    // Only show leaderboard if round is closed, unless you just joined
    if (!currentRoundIsOpen && currentRoundId > 0) {
      showLeaderboard(entries);
    }
  });

  socket.on('score_update', (data) => {
    if (data.username === myUsername) {
      totalScore = data.score;
      $totalScore.textContent = totalScore;
    }
  });

  // ── NTP Sync ───────────────────────────────────────────────────────────────
  function runTimeSync() {
    const offsets = [], rtts = [];
    let done = 0;

    const handler = (sentAt, serverTime) => {
      const now = monoNow();
      const rtt = now - sentAt;
      offsets.push((serverTime + rtt / 2) - now);
      rtts.push(rtt);

      if (++done < SYNC_SAMPLES) {
        setTimeout(() => socket.emit('time_sync', monoNow()), 50);
      } else {
        socket.off('time_sync_reply', handler);
        const minRtt   = Math.min(...rtts);
        const filtered = offsets.filter((_, i) => rtts[i] <= minRtt * 2);
        const clean    = filtered.length >= 3 ? filtered : offsets;
        timeOffset     = clean.reduce((a, b) => a + b, 0) / clean.length;
        const avgRtt   = rtts.reduce((a, b) => a + b, 0) / rtts.length;
        setConn(true, Math.round(avgRtt / 2), Math.round(Math.abs(timeOffset)));
        clearInterval(resyncInterval);
        resyncInterval = setInterval(runTimeSync, 30_000);
      }
    };

    socket.on('time_sync_reply', handler);
    socket.emit('time_sync', monoNow());
  }

  // ── Join ───────────────────────────────────────────────────────────────────
  const adjectives = ['Happy','Blue','Fast','Clever','Brave','Wild','Cool','Epic','Magic','Sneaky','Fierce','Mighty','Swift','Lucky','Smart','Bold','Neon','Cosmic','Silent','Mega','Cyber','Super','Rapid','Hyper','Flash','Shiny','Grand','Funky','Noble','Royal'];
  const nouns = ['Tiger','Fox','Bear','Wolf','Owl','Panda','Lion','Hawk','Duck','Frog','Dragon','Shark','Eagle','Cat','Dog','Seal','Koala','Whale','Puma','Cobra','Toad','Crow','Swan','Rhino','Moose','Sloth','Gecko','Lemur','Zebra','Sheep'];
  const emojis = ['🐯','🦊','🐻','🐺','🦉','🐼','🦁','🦅','🦆','🐸','🐉','🦈','🐈','🐕','🦭','🐨','🐳','🐍','🦢','🦏','🦥','🦎','🦓','🐑','🦖','🦄','🐙','🐢','🐧','🦍'];

  function randomizeAvatar() {
    myAvatar = emojis[Math.floor(Math.random() * emojis.length)];
    $joinAvatar.textContent = myAvatar;
    $joinAvatar.style.animation = 'none';
    $joinAvatar.offsetHeight; // trigger reflow
    $joinAvatar.style.animation = 'score-pop 0.3s ease';
  }

  function randomizeProfile() {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    $usernameInput.value = `${adj} ${noun}`;
    randomizeAvatar();
  }
  
  $btnRandom.addEventListener('click', randomizeProfile);
  $joinAvatar.addEventListener('click', randomizeAvatar);

  $joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $usernameInput.value.trim();
    if (!name) return;
    myUsername = name;
    
    if (myAvatar === '👤' && name.toLowerCase() !== 'admin') {
      randomizeAvatar();
    }
    
    socket.emit('join', { username: name, avatar: myAvatar });
  });

  // ── Panel switcher ─────────────────────────────────────────────────────────
  function showPanel(which) {
    $joinScreen.classList.add('hidden');
    $gameScreen.classList.remove('hidden');
    [$adminPanel, $playerPanel, $lbPanel].forEach(p => p.classList.add('hidden'));
    
    if (which === 'admin')  $adminPanel.classList.remove('hidden');
    if (which === 'player') $playerPanel.classList.remove('hidden');
    if (which === 'lb')     $lbPanel.classList.remove('hidden');
  }

  $btnNextRound.addEventListener('click', () => {
    if (isGM) {
      showPanel('admin');
      $sentenceInput.focus();
    }
  });

  // ── Admin: Round Form ──────────────────────────────────────────────────────
  $sentenceForm.addEventListener('submit', (e) => e.preventDefault());

  adminColourBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const sentence = $sentenceInput.value.trim();
      // "null" string from dataset becomes actual null
      const color = btn.dataset.color === 'null' ? null : btn.dataset.color;
      
      if (!sentence) {
        $adminError.classList.remove('hidden');
        $sentenceInput.focus();
        return;
      }
      $adminError.classList.add('hidden');
      socket.emit('gm_round', { sentence, correctColor: color });
    });
  });

  $btnForceClose.addEventListener('click', () => {
    socket.emit('gm_close');
  });

  function setAdminStatus(msg, cls) {
    $adminStatus.textContent = msg;
    $adminStatus.className   = `admin-status ${cls}`;
  }

  function setAdminTilesEnabled(on) {
    adminColourBtns.forEach(t => { t.disabled = !on; });
    if ($sentenceInput) $sentenceInput.disabled = !on;
  }

  // ── Player: Gameplay ───────────────────────────────────────────────────────
  function showSentenceAndEnableTiles(sentence) {
    $sentenceDisplay.textContent = sentence;
    $trapHint.classList.remove('hidden'); // Show hint about traps
    enableAllBalloons();
  }

  function setSentenceLabel(text) {
    $sentenceDisplay.textContent = text;
    $trapHint.classList.add('hidden');
  }

  balloonBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled || hasClicked) return;
      hasClicked = true;
      disableAllBalloons();
      btn.classList.add('chosen');
      socket.emit('click', { color: btn.dataset.color, clickTime: serverNow() });
    });
  });

  // ── Overlay (sentence flash) ───────────────────────────────────────────────
  function showOverlay(sentence) {
    $ovSentence.textContent = sentence;
    $overlay.className = 'overlay';
    clearTimeout(overlayTimer);
    // Hide overlay after 1.5s
    overlayTimer = setTimeout(() => { $overlay.className = 'overlay hidden'; }, 1500);
  }

  // ── Result UI ──────────────────────────────────────────────────────────────
  function showResult(data) {
    $noClickResult.classList.add('hidden');
    $trapHint.classList.add('hidden');

    // Reveal colours
    balloonBtns.forEach(t => {
      if (data.correctColor !== null && t.dataset.color === data.correctColor) t.classList.add('correct');
      if (t.dataset.color === data.selectedColor && !data.isCorrect) t.classList.add('wrong');
    });

    $resultBar.classList.remove('hidden');

    if (data.isTrap) {
      $resultBar.className    = 'result-bar wrong-result';
      $resultIcon.textContent = '💥';
      $resultText.textContent = 'It was a TRAP!';
      $resultSub.textContent  = 'There was no hidden colour.';
      $resultPts.textContent  = data.points.toString();
    } else if (!data.isCorrect) {
      $resultBar.className    = 'result-bar wrong-result';
      $resultIcon.textContent = '❌';
      $resultText.textContent = 'Wrong Balloon!';
      $resultSub.textContent  = `The hidden colour was ${data.correctColor.toUpperCase()}`;
      $resultPts.textContent  = data.points.toString();
    } else {
      const isFast = data.responseMs < 2000;
      $resultBar.className    = `result-bar ${data.points >= 8 ? 'great-result' : 'ok-result'}`;
      $resultIcon.textContent = isFast ? '⚡' : '✅';
      $resultText.textContent = isFast ? 'Lightning Fast!' : 'Correct!';
      $resultSub.textContent  = `You guessed in ${(data.responseMs / 1000).toFixed(2)}s`;
      $resultPts.textContent  = `+${data.points}`;
      
      // Pop score pill
      document.getElementById('score-pill').classList.add('pop');
      setTimeout(() => document.getElementById('score-pill').classList.remove('pop'), 600);
    }
  }

  function hideResult() {
    $resultBar.className = 'result-bar hidden';
    $noClickResult.classList.add('hidden');
    balloonBtns.forEach(t => t.classList.remove('chosen', 'correct', 'wrong'));
  }

  // ── Leaderboard ────────────────────────────────────────────────────────────
  function showLeaderboard(entries) {
    $lbList.innerHTML = '';
    const medals = ['🥇','🥈','🥉'];
    
    $lbRoundInfo.textContent = `After Round ${currentRoundId}`;

    entries.forEach((e, i) => {
      const li = document.createElement('li');
      li.className = `lb-row${e.username === myUsername ? ' lb-me' : ''}`;
      li.style.animationDelay = `${i * 0.05}s`;
      
      const streakBadge = e.streak >= 2 
        ? `<span class="lb-streak" title="${e.streak} correct in a row!">🔥 ${e.streak}</span>` 
        : '';

      li.innerHTML = `
        <span class="lb-rank">${medals[i] || i + 1}</span>
        <span class="lb-name">
          <span class="lb-avatar">${e.avatar || '👤'}</span> 
          ${e.username}
          ${streakBadge}
        </span>
        <span class="lb-pts">${e.score}</span>
      `;
      $lbList.appendChild(li);
    });

    $lbAdminCta.classList.toggle('hidden', !isGM);
    
    // Auto switch to LB if player
    if (!isGM) {
      setTimeout(() => {
        if (!currentRoundIsOpen) showPanel('lb');
      }, 3000); // 3 seconds after round ends
    } else {
      showPanel('lb');
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function enableAllBalloons() {
    balloonBtns.forEach(t => {
      t.disabled = false;
      t.classList.remove('disabled', 'chosen', 'correct', 'wrong');
    });
  }

  function disableAllBalloons() {
    balloonBtns.forEach(t => {
      t.disabled = true;
      t.classList.add('disabled');
    });
  }

  function setConn(ok, ping, offset) {
    $connStatus.textContent = ok
      ? (ping !== undefined ? `● Connected · ${ping}ms · ±${offset}ms` : '● Connected')
      : '● Disconnected — reconnecting…';
    $connStatus.className = `conn-strip ${ok ? 'connected' : 'disconnected'}`;
  }

})();
