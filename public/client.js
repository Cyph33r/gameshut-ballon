(() => {
  const SYNC_SAMPLES = 10;
  const ANSWER_WINDOW = 5_000;

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
  const $btnSoundToggle = document.getElementById('btn-sound-toggle');
  const $btnLeaveRoom   = document.getElementById('btn-leave-room');

  const $btnJoinDisplay= document.getElementById('btn-join-display');
  const $displayPanel  = document.getElementById('display-panel');
  const $displaySentence = document.getElementById('display-sentence');
  const $displayTimerWrap = document.getElementById('display-timer-wrap');
  const $displayTimerBar  = document.getElementById('display-timer-bar');
  const $displayLobbyView = document.getElementById('display-lobby-view');
  const $displayGameView  = document.getElementById('display-game-view');
  const $displayQrImg     = document.getElementById('display-qr-img');
  const $displayJoinUrl   = document.getElementById('display-join-url');

  const $roomCodeInput = document.getElementById('room-code-input');
  const $btnCreateRoom = document.getElementById('btn-create-room');
  const $createRoomForm = document.getElementById('create-room-form');
  const $hostPasswordInput = document.getElementById('host-password-input');

  const $tabBtnJoin = document.getElementById('tab-btn-join');
  const $tabBtnCreate = document.getElementById('tab-btn-create');
  const $joinRoomView = document.getElementById('join-room-view');
  const $createRoomView = document.getElementById('create-room-view');

  const $btnToggleLock = document.getElementById('btn-toggle-lock');

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
  let isDisplay       = false;
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
    isDisplay = data.isDisplay;
    showPanel(isGM ? 'admin' : (isDisplay ? 'display' : 'player'));
    
    const $roomCodeText = document.getElementById('room-code-text');
    if ($roomCodeText) $roomCodeText.textContent = data.roomCode;

    const $roomLockIcon = document.getElementById('room-lock-icon');
    const $lockIcon = document.getElementById('lock-icon');
    const $lockText = document.getElementById('lock-text');
    if (data.isLocked) {
      if ($lockIcon) $lockIcon.textContent = '🔒';
      if ($lockText) $lockText.textContent = 'Lobby Locked';
      if ($roomLockIcon) $roomLockIcon.textContent = '🔒';
    } else {
      if ($lockIcon) $lockIcon.textContent = '🔓';
      if ($lockText) $lockText.textContent = 'Lobby Open';
      if ($roomLockIcon) $roomLockIcon.textContent = '🔓';
    }

    if (!isGM && !isDisplay) {
      setSentenceLabel('Waiting for the host to start a round...');
    } else if (isDisplay) {
      if ($displayLobbyView) $displayLobbyView.style.display = 'flex';
      if ($displayGameView) $displayGameView.style.display = 'none';
      const shareUrl = `${window.location.origin}${window.location.pathname}?room=${data.roomCode}`;
      if ($displayQrImg) {
        $displayQrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&color=6347ff&data=${encodeURIComponent(shareUrl)}`;
      }
      if ($displayJoinUrl) {
        $displayJoinUrl.textContent = `${window.location.host}${window.location.pathname}?room=${data.roomCode}`;
      }
      $displaySentence.textContent = 'Waiting for the host to start a round...';
    }

    // Save session in local storage for seamless recovery
    if (data.roomCode) {
      localStorage.setItem('bb_room_code', data.roomCode);
      localStorage.setItem('bb_username', data.username || '');
      localStorage.setItem('bb_avatar', data.avatar || '👤');
      localStorage.setItem('bb_is_gm', isGM ? 'true' : 'false');
      localStorage.setItem('bb_is_display', isDisplay ? 'true' : 'false');

      if (isGM) {
        const pass = $hostPasswordInput ? $hostPasswordInput.value.trim() : '';
        if (pass) {
          localStorage.setItem('bb_host_pass', pass);
        }
        const shareUrl = `${window.location.origin}${window.location.pathname}?room=${data.roomCode}`;
        navigator.clipboard.writeText(shareUrl).then(() => {
          showToast(`Direct invite link copied! 📋`);
        }).catch(() => {
          showToast(`Room: ${data.roomCode} created! 🎈`);
        });
      } else {
        showToast(`Joined Room ${data.roomCode}! 🎈`);
      }
    }
  });

  socket.on('room_lock_update', (data) => {
    const $roomLockIcon = document.getElementById('room-lock-icon');
    const $lockIcon = document.getElementById('lock-icon');
    const $lockText = document.getElementById('lock-text');
    
    if (data.isLocked) {
      if ($lockIcon) $lockIcon.textContent = '🔒';
      if ($lockText) $lockText.textContent = 'Lobby Locked';
      if ($roomLockIcon) $roomLockIcon.textContent = '🔒';
    } else {
      if ($lockIcon) $lockIcon.textContent = '🔓';
      if ($lockText) $lockText.textContent = 'Lobby Open';
      if ($roomLockIcon) $roomLockIcon.textContent = '🔓';
    }
  });

  // New round started
  socket.on('round_start', (data) => {
    showPanel(isGM ? 'admin' : (isDisplay ? 'display' : 'player'));
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
    } else if (isDisplay) {
      if ($displayLobbyView) $displayLobbyView.style.display = 'none';
      if ($displayGameView) $displayGameView.style.display = 'flex';
      $displaySentence.textContent = data.sentence;
      $displayTimerBar.classList.remove('active');
      $displayTimerWrap.classList.remove('hidden');
    } else {
      hideResult();
      showSentenceAndEnableTiles(data.sentence);
    }

    // Flash overlay
    showOverlay(data.sentence);
    speak(data.sentence);

    if (!isGM && !isDisplay) {
      $timerBar.classList.remove('active');
      $timerWrap.classList.remove('hidden');
      // Sync animation to revealTime
      const delay = Math.max(0, data.revealTime - serverNow());
      setTimeout(() => {
        $timerBar.style.animationDuration = `${ANSWER_WINDOW}ms`;
        $timerBar.classList.add('active');
      }, delay);
    } else if (isDisplay) {
      const delay = Math.max(0, data.revealTime - serverNow());
      setTimeout(() => {
        $displayTimerBar.style.animationDuration = `${ANSWER_WINDOW}ms`;
        $displayTimerBar.classList.add('active');
      }, delay);
    }

    // Auto-disable client side after window (server authoritative anyway)
    clearTimeout(closeTimer);
    const timeUntilClose = Math.max(0, data.revealTime + ANSWER_WINDOW - serverNow());
    closeTimer = setTimeout(() => {
      disableAllBalloons();
    }, timeUntilClose);

    // Play tick warning sounds at ANSWER_WINDOW - 2000 and ANSWER_WINDOW - 1000
    if (!isGM) {
      const delay = Math.max(0, data.revealTime - serverNow());
      setTimeout(() => {
        playSound('tick');
      }, delay + ANSWER_WINDOW - 2000);
      
      setTimeout(() => {
        playSound('tick');
      }, delay + ANSWER_WINDOW - 1000);
    }
  });

  socket.on('round_closed', (data) => {
    currentRoundIsOpen = false;
    clearTimeout(closeTimer);
    disableAllBalloons();
    
    $timerWrap.classList.add('hidden');
    $timerBar.classList.remove('active');
    if ($displayTimerWrap) {
      $displayTimerWrap.classList.add('hidden');
      $displayTimerBar.classList.remove('active');
    }

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
    } else if (isDisplay) {
      $displaySentence.textContent = 'Round Over! Loading leaderboard...';
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
          playSound('chime');
        } else {
          $noClickResult.innerHTML = `⏳ <strong>Time's up!</strong> The colour was ${data.correctColor.toUpperCase()}`;
          $noClickResult.className = 'no-click-result time-up';
          playSound('deflate');
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

  if ($btnSoundToggle) {
    $btnSoundToggle.addEventListener('click', () => {
      isSoundEnabled = !isSoundEnabled;
      $btnSoundToggle.textContent = isSoundEnabled ? '🔊' : '🔇';
    });
  }

  if ($btnLeaveRoom) {
    $btnLeaveRoom.addEventListener('click', () => {
      localStorage.clear();
      window.location.reload();
    });
  }

  function speak(text) {
    if (!isGM) return; // Only host speaks
    if (!ttsEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  }

  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let audioCtx = null;
  let isSoundEnabled = true;

  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new AudioCtx();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playSound(type) {
    if (!isSoundEnabled) return;
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;

      if (type === 'pop') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } 
      else if (type === 'chime') {
        const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(0.15, now + idx * 0.08 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.3);
          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.3);
        });
      } 
      else if (type === 'deflate') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(60, now + 0.5);
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 15;
        lfoGain.gain.value = 20;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        lfo.start(now);
        osc.start(now);
        lfo.stop(now + 0.5);
        osc.stop(now + 0.5);
      }
      else if (type === 'tick') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
        osc.start(now);
        osc.stop(now + 0.03);
      }
    } catch (e) {
      console.warn("Audio synthesis failed:", e);
    }
  }

  function playPopSound() {
    playSound('pop');
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 24px;
      left: 50%;
      transform: translateX(-50%) translateY(-20px);
      background: rgba(99, 71, 255, 0.95);
      border: 1px solid rgba(255,255,255,0.2);
      color: #fff;
      padding: 12px 24px;
      border-radius: 100px;
      font-family: var(--font-disp);
      font-weight: 800;
      font-size: 0.95rem;
      z-index: 10000;
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      backdrop-filter: blur(10px);
      box-shadow: 0 10px 30px rgba(99,71,255,0.4);
    `;
    document.body.appendChild(toast);
    toast.offsetHeight;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(-20px)';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
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

  $btnJoinDisplay.addEventListener('click', () => {
    // Play the pop sound to force iOS to unlock HTML5 audio context
    playPopSound();
    const roomCode = $roomCodeInput.value.trim().toUpperCase();
    if (!roomCode) {
      $joinError.textContent = "Please enter a Room Code to spectate!";
      $joinError.classList.remove('hidden');
      return;
    }
    myUsername = "Display Screen";
    myAvatar = "📺";
    socket.emit('join', { username: myUsername, avatar: myAvatar, roomCode, isDisplay: true });
  });

  $joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    $joinError.classList.add('hidden');
    playPopSound();
    
    const name = $usernameInput.value.trim();
    const roomCode = $roomCodeInput.value.trim().toUpperCase();
    const hostPassword = $passwordInput.value.trim();
    
    if (!name) return;
    myUsername = name;
    
    if (myAvatar === '👤' && !hostPassword) {
      randomizeAvatar();
    }
    
    socket.emit('join', { username: name, avatar: myAvatar, roomCode, hostPassword });
  });

  // Create room flow
  if ($createRoomForm) {
    $createRoomForm.addEventListener('submit', (e) => {
      e.preventDefault();
      playPopSound();
      const hostPassword = $hostPasswordInput.value.trim();
      socket.emit('create_room', { hostPassword });
    });
  }

  // Lobby Lock toggle
  if ($btnToggleLock) {
    $btnToggleLock.addEventListener('click', () => {
      socket.emit('gm_lock_room');
    });
  }

  // Join tabs switcher
  if ($tabBtnJoin && $tabBtnCreate) {
    $tabBtnJoin.addEventListener('click', () => {
      $tabBtnJoin.classList.add('active');
      $tabBtnJoin.style.borderBottomColor = 'var(--primary)';
      $tabBtnJoin.style.color = '#fff';

      $tabBtnCreate.classList.remove('active');
      $tabBtnCreate.style.borderBottomColor = 'transparent';
      $tabBtnCreate.style.color = 'var(--text-muted)';

      $joinRoomView.classList.remove('hidden');
      $createRoomView.classList.add('hidden');
    });

    $tabBtnCreate.addEventListener('click', () => {
      $tabBtnCreate.classList.add('active');
      $tabBtnCreate.style.borderBottomColor = 'var(--primary)';
      $tabBtnCreate.style.color = '#fff';

      $tabBtnJoin.classList.remove('active');
      $tabBtnJoin.style.borderBottomColor = 'transparent';
      $tabBtnJoin.style.color = 'var(--text-muted)';

      $createRoomView.classList.remove('hidden');
      $joinRoomView.classList.add('hidden');
    });
  }

  // ── Panel switcher ─────────────────────────────────────────────────────────
  function showPanel(which) {
    $joinScreen.classList.add('hidden');
    $gameScreen.classList.remove('hidden');
    [$adminPanel, $playerPanel, $lbPanel, $displayPanel].forEach(p => {
      if(p) p.classList.add('hidden');
    });
    
    if (which === 'admin')  $adminPanel.classList.remove('hidden');
    if (which === 'player') $playerPanel.classList.remove('hidden');
    if (which === 'lb')     $lbPanel.classList.remove('hidden');
    if (which === 'display') $displayPanel.classList.remove('hidden');
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
    
    const newRounds = validRounds.map(r => ({ sentence: r.sentence, correctColor: r.color }));
    socket.emit('gm_queue_add', newRounds);
    
    $storyInput.value = '';
    $storyBuilder.classList.add('hidden');
  });

  socket.on('queue_update', (q) => {
    roundQueue = q;
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
    socket.emit('gm_queue_next');
  });

  $btnClearQueue.addEventListener('click', () => {
    socket.emit('gm_queue_clear');
  });

  $btnForceClose.addEventListener('click', () => {
    socket.emit('gm_close');
  });

  function setAdminStatus(msg, cls) {
    $adminStatus.textContent = msg;
    $adminStatus.className   = `admin-status ${cls}`;
  }

  function setAdminTilesEnabled(on) {
    singleColourBtns.forEach(t => { 
      t.disabled = !on; 
      if (!on) t.classList.remove('selected');
    });
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
    if (data.isCorrect) {
      playSound('chime');
    } else {
      playSound('deflate');
    }
    $noClickResult.classList.add('hidden');
    $trapHint.classList.add('hidden');

    // Reveal colours
    balloonBtns.forEach(t => {
      if (data.correctColor !== null && t.dataset.color === data.correctColor) t.classList.add('correct');
      if (t.dataset.color === data.selectedColor && !data.isCorrect) t.classList.add('wrong');
    });

    if (data.isTrap) {
      $resultBar.classList.remove('hidden');
      $resultBar.className    = 'result-bar wrong-result';
      $resultIcon.textContent = '💥';
      $resultText.textContent = 'It was a TRAP!';
      $resultSub.textContent  = 'There was no hidden colour.';
      $resultPts.textContent  = data.points.toString();
    } else if (!data.isCorrect) {
      $resultBar.classList.remove('hidden');
      $resultBar.className    = 'result-bar wrong-result';
      $resultIcon.textContent = '❌';
      $resultText.textContent = 'Wrong Balloon!';
      $resultSub.textContent  = `The hidden colour was ${data.correctColor.toUpperCase()}`;
      $resultPts.textContent  = data.points.toString();
    } else {
      // Correct answer! Hide the global result bar and show the result directly inside the popped balloon.
      $resultBar.classList.add('hidden');
      
      const clickedBtn = document.getElementById(`balloon-${data.selectedColor}`);
      if (clickedBtn) {
        const label = clickedBtn.querySelector('.balloon-label');
        if (label) {
          const timeSec = (data.responseMs / 1000).toFixed(2);
          label.innerHTML = `✅ ${data.correctColor.toUpperCase()}<br><span style="font-size:0.85rem; font-weight:normal; text-transform:none; opacity:0.9; text-shadow:none;">+${data.points} pts in ${timeSec}s</span>`;
        }
      }
      
      // Pop score pill
      document.getElementById('score-pill').classList.add('pop');
      setTimeout(() => document.getElementById('score-pill').classList.remove('pop'), 600);
    }
  }

  function hideResult() {
    $resultBar.className = 'result-bar hidden';
    $noClickResult.classList.add('hidden');
    resetAllBalloons();
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
    if (!isGM && !isDisplay && data.myRank && data.myRank > entries.length) {
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
    
    // Auto switch to LB if player or display
    if (!isGM) {
      setTimeout(() => {
        if (!currentRoundIsOpen) showPanel('lb');
      }, 3000); // 3 seconds after round ends
    } else {
      showPanel('lb');
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function resetAllBalloons() {
    balloonBtns.forEach(t => {
      t.classList.remove('chosen', 'correct', 'wrong');
      const label = t.querySelector('.balloon-label');
      if (label) {
        label.innerHTML = t.dataset.color.charAt(0).toUpperCase() + t.dataset.color.slice(1);
      }
    });
  }

  function enableAllBalloons() {
    resetAllBalloons();
    balloonBtns.forEach(t => t.classList.remove('disabled'));
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

  // Auto-fill query room param on load
  const params = new URLSearchParams(window.location.search);
  const roomParam = params.get('room');
  if (roomParam) {
    if ($roomCodeInput) {
      $roomCodeInput.value = roomParam.toUpperCase();
    }
    if ($usernameInput) {
      $usernameInput.focus();
    }
  }

  // Auto-reconnect session recovery
  const savedRoom = localStorage.getItem('bb_room_code');
  if (savedRoom) {
    const savedUser = localStorage.getItem('bb_username') || '';
    const savedAvatar = localStorage.getItem('bb_avatar') || '👤';
    const savedIsGM = localStorage.getItem('bb_is_gm') === 'true';
    const savedIsDisplay = localStorage.getItem('bb_is_display') === 'true';
    const savedHostPass = localStorage.getItem('bb_host_pass') || '';

    socket.on('connect', () => {
      socket.emit('join', {
        username: savedUser,
        avatar: savedAvatar,
        roomCode: savedRoom,
        hostPassword: savedHostPass,
        isGM: savedIsGM,
        isDisplay: savedIsDisplay
      });
    });
  }

})();
