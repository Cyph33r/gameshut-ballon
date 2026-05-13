(() => {
  const SYNC_SAMPLES = 10;
  const ANSWER_WINDOW = 15_000;

  // ── DOM Elements ───────────────────────────────────────────────────────────
  const $joinScreen    = document.getElementById('join-screen');
  const $gameScreen    = document.getElementById('game-screen');
  const $joinForm      = document.getElementById('join-form');
  const $usernameInput = document.getElementById('username-input');
  const $passwordInput = document.getElementById('password-input');
  const $joinError     = document.getElementById('join-error');
  const $joinAvatar    = document.getElementById('join-avatar');
  const $btnRandom     = document.getElementById('btn-random');

  const $adminPanel    = document.getElementById('admin-panel');
  const $playerPanel   = document.getElementById('player-panel');
  const $lbPanel       = document.getElementById('lb-panel');

  const $roundNum      = document.getElementById('round-num');
  const $totalScore    = document.getElementById('total-score');
  const $btnTts        = document.getElementById('btn-tts');

  // Admin
  const $sentenceForm   = document.getElementById('sentence-form');
  const $sentenceInput  = document.getElementById('sentence-input');
  const singleColourBtns= Array.from($sentenceForm.querySelectorAll('.colour-btn'));
  const $adminError     = document.getElementById('admin-error');
  const $adminStatus    = document.getElementById('admin-status');
  const $adminRoundControls = document.getElementById('admin-round-controls');
  const $btnForceClose  = document.getElementById('btn-force-close');

  // Admin Story Mode
  const $tabSingle      = document.getElementById('tab-single');
  const $tabStory       = document.getElementById('tab-story');
  const $storyForm      = document.getElementById('story-form');
  const $storyInput     = document.getElementById('story-input');
  const $btnProcessStory= document.getElementById('btn-process-story');
  const $storyBuilder   = document.getElementById('story-builder');
  const $storyWordsContainer = document.getElementById('story-words-container');
  const $storyPalette   = document.getElementById('story-palette');
  const $btnQueueStory  = document.getElementById('btn-queue-story');
  const storyPaletteBtns= Array.from($storyPalette.querySelectorAll('.colour-btn'));
  
  const $queueCard      = document.getElementById('queue-card');
  const $queueList      = document.getElementById('queue-list');
  const $queueCount     = document.getElementById('queue-count');
  const $btnNextQueued  = document.getElementById('btn-next-queued');
  const $btnClearQueue  = document.getElementById('btn-clear-queue');

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
  let pendingClickResult = null;
  let ttsEnabled         = true;

  // Story Mode State
  let storyDraft         = []; // Array of { sentence, color, wordId }
  let activeWordSpan     = null;
  let roundQueue         = []; // Array of { sentence, color }

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

  socket.on('join_error', (msg) => {
    $joinError.textContent = msg;
    $joinError.classList.remove('hidden');
  });

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
    pendingClickResult = null;

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
    speak(data.sentence);

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
      if (pendingClickResult) {
        totalScore = pendingClickResult.totalScore;
        $totalScore.textContent = totalScore;
        showResult(pendingClickResult);
        pendingClickResult = null;
      } else if (!hasClicked) {
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
    pendingClickResult = data;
    disableAllBalloons();
    $noClickResult.classList.remove('hidden');
    $noClickResult.innerHTML = '✅ <strong>Answer locked in!</strong> Waiting for round to end...';
    $noClickResult.className = 'no-click-result time-up'; // neutral style
  });

  socket.on('leaderboard', (data) => {
    // Only show leaderboard if round is closed, unless you just joined
    if (!currentRoundIsOpen && currentRoundId > 0) {
      showLeaderboard(data);
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

  // ── TTS ────────────────────────────────────────────────────────────────────
  if ($btnTts) {
    $btnTts.addEventListener('click', () => {
      ttsEnabled = !ttsEnabled;
      $btnTts.textContent = ttsEnabled ? '🔊' : '🔇';
      if (!ttsEnabled && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    });
  }

  function speak(text) {
    if (!isGM) return; // Only host speaks
    if (!ttsEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  }

  const popAudio = new Audio("data:audio/wav;base64,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");
  popAudio.volume = 0.5;

  function playPopSound() {
    popAudio.currentTime = 0;
    popAudio.play().catch(() => {});
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
    $joinError.classList.add('hidden');
    
    // Play the silent Audio file to force iOS to unlock HTML5 audio context
    popAudio.play().catch(() => {});
    popAudio.pause();
    popAudio.currentTime = 0;
    
    const name = $usernameInput.value.trim();
    if (!name) return;
    myUsername = name;
    
    if (myAvatar === '👤' && !$passwordInput.value) {
      randomizeAvatar();
    }
    
    socket.emit('join', { username: name, avatar: myAvatar, adminPass: $passwordInput.value });
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

  singleColourBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const sentence = $sentenceInput.value.trim();
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

  // ── Admin: Story Mode Logic ────────────────────────────────────────────────
  $tabSingle.addEventListener('click', () => {
    $tabSingle.classList.add('active');
    $tabStory.classList.remove('active');
    $sentenceForm.classList.remove('hidden');
    $storyForm.classList.add('hidden');
  });

  $tabStory.addEventListener('click', () => {
    $tabStory.classList.add('active');
    $tabSingle.classList.remove('active');
    $sentenceForm.classList.add('hidden');
    $storyForm.classList.remove('hidden');
  });

  $btnProcessStory.addEventListener('click', () => {
    const text = $storyInput.value.trim();
    if (!text) return;
    
    // Split into sentences (by . ! ? followed by space or end)
    const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
    
    $storyWordsContainer.innerHTML = '';
    storyDraft = [];
    $storyPalette.classList.add('hidden');
    activeWordSpan = null;

    let wordIdCounter = 0;

    sentences.forEach((s) => {
      const sentenceText = s.trim();
      if (!sentenceText) return;
      
      storyDraft.push({ sentence: sentenceText, color: undefined, wordId: null });
      const sentenceIdx = storyDraft.length - 1;

      // Split sentence into words and spaces to make words clickable
      const words = sentenceText.split(/(\s+)/);
      
      words.forEach(word => {
        if (!word.trim()) {
          $storyWordsContainer.appendChild(document.createTextNode(word));
          return;
        }
        
        const wId = wordIdCounter++;
        const span = document.createElement('span');
        span.textContent = word;
        span.className = 'story-word';
        span.dataset.sIdx = sentenceIdx;
        span.dataset.wId = wId;
        
        span.addEventListener('click', () => {
          if (activeWordSpan) activeWordSpan.style.borderBottom = '';
          activeWordSpan = span;
          span.style.borderBottom = '3px solid white';
          $storyPalette.classList.remove('hidden');
        });
        
        $storyWordsContainer.appendChild(span);
      });
      $storyWordsContainer.appendChild(document.createTextNode(' '));
    });

    $storyBuilder.classList.remove('hidden');
  });

  storyPaletteBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (!activeWordSpan) return;
      const sIdx = activeWordSpan.dataset.sIdx;
      const color = btn.dataset.color === 'null' ? null : btn.dataset.color;
      
      storyDraft[sIdx].color = color;
      storyDraft[sIdx].wordId = activeWordSpan.dataset.wId;
      
      const allWords = $storyWordsContainer.querySelectorAll(`[data-s-idx="${sIdx}"]`);
      allWords.forEach(w => w.className = 'story-word');
      
      activeWordSpan.classList.add(`selected-${color}`);
      activeWordSpan.style.borderBottom = '';
      activeWordSpan = null;
      $storyPalette.classList.add('hidden');
    });
  });

  $btnQueueStory.addEventListener('click', () => {
    const validRounds = storyDraft.filter(r => r.color !== undefined);
    if (validRounds.length === 0) {
      alert("No words were assigned a colour!");
      return;
    }
    
    roundQueue = roundQueue.concat(validRounds.map(r => ({ sentence: r.sentence, correctColor: r.color })));
    $storyInput.value = '';
    $storyBuilder.classList.add('hidden');
    renderQueue();
  });

  function renderQueue() {
    if (roundQueue.length > 0) {
      $queueCard.classList.remove('hidden');
    } else {
      $queueCard.classList.add('hidden');
    }
    
    $queueCount.textContent = roundQueue.length;
    $queueList.innerHTML = '';
    
    roundQueue.forEach((r, idx) => {
      const li = document.createElement('li');
      li.innerHTML = `<span style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-right:10px;">${idx + 1}. ${r.sentence}</span>
                      <span class="q-color ${r.correctColor}">${r.correctColor === null ? 'Trap' : r.correctColor}</span>`;
      $queueList.appendChild(li);
    });

    if (roundQueue.length === 0) {
      $btnNextQueued.disabled = true;
    } else {
      $btnNextQueued.disabled = currentRoundIsOpen;
    }
  }

  $btnNextQueued.addEventListener('click', () => {
    if (roundQueue.length === 0 || currentRoundIsOpen) return;
    const next = roundQueue.shift();
    socket.emit('gm_round', { sentence: next.sentence, correctColor: next.correctColor });
    renderQueue();
  });

  $btnClearQueue.addEventListener('click', () => {
    roundQueue = [];
    renderQueue();
  });

  $btnForceClose.addEventListener('click', () => {
    socket.emit('gm_close');
  });

  function setAdminStatus(msg, cls) {
    $adminStatus.textContent = msg;
    $adminStatus.className   = `admin-status ${cls}`;
  }

  function setAdminTilesEnabled(on) {
    singleColourBtns.forEach(t => { t.disabled = !on; });
    if ($sentenceInput) $sentenceInput.disabled = !on;
    $btnNextQueued.disabled = !on;
    if (on) {
      // Re-render queue to update buttons if needed
      renderQueue();
    }
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
    btn.addEventListener('pointerdown', () => {
      if (btn.classList.contains('disabled') || hasClicked) return;
      hasClicked = true;
      playPopSound(); // Play synthesized pop
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
  function showLeaderboard(data) {
    const entries = data.top10;
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
          <span class="lb-user-text">${e.username}</span>
          ${streakBadge}
        </span>
        <span class="lb-pts">${e.score}</span>
      `;
      $lbList.appendChild(li);
    });

    // If player is not in top 10, append their rank at the bottom
    if (!isGM && data.myRank && data.myRank > entries.length) {
      const li = document.createElement('li');
      li.className = 'lb-row lb-me';
      li.style.marginTop = '10px';
      li.style.borderTop = '2px dashed rgba(255,255,255,0.2)';
      li.style.paddingTop = '15px';
      
      li.innerHTML = `
        <span class="lb-rank">${data.myRank} <span style="font-size:0.7em; color:#888;">/ ${data.totalPlayers}</span></span>
        <span class="lb-name">
          <span class="lb-avatar">${myAvatar}</span> 
          <span class="lb-user-text">You</span>
        </span>
        <span class="lb-pts">${data.myScore}</span>
      `;
      $lbList.appendChild(li);
    }

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
      t.classList.remove('disabled', 'chosen', 'correct', 'wrong');
    });
  }

  function disableAllBalloons() {
    balloonBtns.forEach(t => {
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
