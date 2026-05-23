(() => {
  const SYNC_SAMPLES = 10;
  const ANSWER_WINDOW = 5_000;

  // ── DOM Elements ───────────────────────────────────────────────────────────
  const $joinScreen = document.getElementById('join-screen');
  const $gameScreen = document.getElementById('game-screen');
  const $joinForm = document.getElementById('join-form');
  const $usernameInput = document.getElementById('username-input');
  const $passwordInput = document.getElementById('password-input');
  const $joinError = document.getElementById('join-error');
  const $joinAvatar = document.getElementById('join-avatar');
  const $btnRandom = document.getElementById('btn-random');

  const $adminPanel = document.getElementById('admin-panel');
  const $playerPanel = document.getElementById('player-panel');
  const $playerLobbyView = document.getElementById('player-lobby-view');
  const $playerGameView = document.getElementById('player-game-view');
  const $playerLobbyPlayers = document.getElementById('player-lobby-players');
  const $lbPanel = document.getElementById('lb-panel');

  const $roundNum = document.getElementById('round-num');
  const $totalScore = document.getElementById('total-score');
  const $btnTts = document.getElementById('btn-tts');
  const $btnSoundToggle = document.getElementById('btn-sound-toggle');
  const $btnLeaveRoom = document.getElementById('btn-leave-room');

  const $btnJoinDisplay = document.getElementById('btn-join-display');
  const $displayPanel = document.getElementById('display-panel');
  const $displaySentence = document.getElementById('display-sentence');
  const $displayTimerWrap = document.getElementById('display-timer-wrap');
  const $displayTimerBar = document.getElementById('display-timer-bar');
  const $displayLobbyView = document.getElementById('display-lobby-view');
  const $displayGameView = document.getElementById('display-game-view');
  const $displayQrImg = document.getElementById('display-qr-img');
  const $displayJoinUrl = document.getElementById('display-join-url');

  const $roomCodeInput = document.getElementById('room-code-input');
  const $btnCreateRoom = document.getElementById('btn-create-room');
  const $createRoomForm = document.getElementById('create-room-form');
  // Note: reuse $passwordInput (line 10) — there is no separate 'host-password-input' element

  const $tabBtnJoin = document.getElementById('tab-btn-join');
  const $tabBtnCreate = document.getElementById('tab-btn-create');
  const $joinRoomView = document.getElementById('join-room-view');
  const $createRoomView = document.getElementById('create-room-view');

  const $btnToggleLock = document.getElementById('btn-toggle-lock');

  // Admin
  const $sentenceForm = document.getElementById('sentence-form');
  const singleColourBtns = Array.from($sentenceForm.querySelectorAll('.colour-btn'));
  const $adminError = document.getElementById('admin-error');
  const $adminStatus = document.getElementById('admin-status');
  const $adminRoundControls = document.getElementById('admin-round-controls');
  const $btnForceClose = document.getElementById('btn-force-close');
  const $btnResetSession = document.getElementById('btn-reset-session');

  // New dashboard elements
  const $adminPlayerCount = document.getElementById('admin-player-count');
  const $adminRoundNum = document.getElementById('admin-round-num');
  const $adminLobbyIcon = document.getElementById('admin-lobby-icon');
  const $adminLobbyStatus = document.getElementById('admin-lobby-status');
  const $adminLobbyPill = document.getElementById('admin-lobby-pill');
  const $roundActiveBanner = document.getElementById('round-active-banner');
  const $rabTimerBar = document.getElementById('rab-timer-bar');
  const $adminModeSection = document.getElementById('admin-mode-section');

  // Player
  const $playerNarrativePrefix = document.getElementById('player-narrative-prefix');
  const $sentenceArea = document.getElementById('sentence-area');
  const $sentenceDisplay = document.getElementById('sentence-display');
  const $timerWrap = document.getElementById('timer-wrap');
  const $timerBar = document.getElementById('timer-bar');
  const $trapHint = document.getElementById('trap-hint');
  const balloonBtns = Array.from(document.querySelectorAll('.balloon-btn'));

  const $resultBar = document.getElementById('result-bar');
  const $resultIcon = document.getElementById('result-icon');
  const $resultText = document.getElementById('result-text');
  const $resultSub = document.getElementById('result-sub');
  const $resultPts = document.getElementById('result-pts');
  const $noClickResult = document.getElementById('no-click-result');

  // Leaderboard
  const $lbList = document.getElementById('lb-list');
  const $lbRoundInfo = document.getElementById('lb-round-info');
  const $lbAdminCta = document.getElementById('lb-admin-cta');
  const $btnNextRound = document.getElementById('btn-next-round');

  // Overlay
  const $overlay = document.getElementById('overlay');
  const $ovSentence = document.getElementById('ov-sentence');

  // Connection
  const $connStatus = document.getElementById('conn-status');

  // ── State ──────────────────────────────────────────────────────────────────
  let timeOffset = 0;
  let isGM = false;
  let isDisplay = false;
  let hasClicked = false;
  let currentRoundId = 0;
  let totalScore = 0;
  let myUsername = '';
  let myAvatar = '👤';
  let resyncInterval = null;
  let overlayTimer = null;
  let closeTimer = null;
  let lbShowTimer = null;
  let currentRoundIsOpen = false;
  let currentRoundIsFiller = false;
  let hasGameStarted = false;
  let pendingClickResult = null;
  let ttsEnabled = true;



  // ── Monotonic clock ────────────────────────────────────────────────────────
  const perfOrigin = performance.now();
  const dateOrigin = Date.now();
  const monoNow = () => dateOrigin + (performance.now() - perfOrigin);
  const serverNow = () => monoNow() + timeOffset;

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

  socket.on('welcome', () => { });

  socket.on('join_error', (msg) => {
    $joinError.textContent = msg;
    $joinError.classList.remove('hidden');
  });

  socket.on('joined', (data) => {
    isGM = data.isGM;
    isDisplay = data.isDisplay;
    myUsername = data.username || myUsername;
    myAvatar = data.avatar || myAvatar;
    showPanel(isGM ? 'admin' : (isDisplay ? 'display' : 'player'));

    updateLockUI(data.isLocked);

    if (!isGM && !isDisplay) {
      setSentenceLabel('Waiting for the host to start a round...');
      if (!hasGameStarted) {
        if ($playerLobbyView) $playerLobbyView.classList.remove('hidden');
        if ($playerGameView) $playerGameView.classList.add('hidden');
      } else {
        if ($playerLobbyView) $playerLobbyView.classList.add('hidden');
        if ($playerGameView) $playerGameView.classList.remove('hidden');
      }
    } else if (isDisplay) {
      if (!hasGameStarted) {
        if ($displayLobbyView) $displayLobbyView.style.display = 'flex';
        if ($displayGameView) $displayGameView.style.display = 'none';
      } else {
        if ($displayLobbyView) $displayLobbyView.style.display = 'none';
        if ($displayGameView) $displayGameView.style.display = 'flex';
      }
      const shareUrl = `${window.location.origin}${window.location.pathname}`;
      if ($displayQrImg) {
        $displayQrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&color=6347ff&data=${encodeURIComponent(shareUrl)}`;
      }
      if ($displayJoinUrl) {
        $displayJoinUrl.textContent = 'bit.ly/balloon-burst';
      }
      $displaySentence.textContent = 'Waiting for the host to start a round...';
    }

    // Save session in session storage for seamless recovery
    sessionStorage.setItem('bb_username', data.username || '');
    sessionStorage.setItem('bb_avatar', data.avatar || '👤');
    sessionStorage.setItem('bb_is_gm', isGM ? 'true' : 'false');
    sessionStorage.setItem('bb_is_display', isDisplay ? 'true' : 'false');

    if (isGM) {
      const pass = ($passwordInput ? $passwordInput.value.trim() : '') || sessionStorage.getItem('bb_host_pass') || '';
      if (pass) {
        sessionStorage.setItem('bb_host_pass', pass);
      }
      showToast(`Logged in as Host! 👑`);
    } else {
      showToast(`Joined the game! 🎈`);
    }
  });

  socket.on('room_lock_update', (data) => {
    updateLockUI(data.isLocked);
  });

  socket.on('session_reset', () => {
    hasGameStarted = false;
    currentRoundId = 0;
    currentRoundIsOpen = false;
    hasClicked = false;
    pendingClickResult = null;

    totalScore = 0;
    if ($totalScore) $totalScore.textContent = '0';
    if ($roundNum) $roundNum.textContent = '—';
    if ($adminRoundNum) $adminRoundNum.textContent = '0';

    if (isGM) {
      if ($roundActiveBanner) $roundActiveBanner.classList.add('hidden');
      if ($adminModeSection) $adminModeSection.classList.remove('hidden');
      setAdminStatus('Session reset by admin. Ready to start new rounds.', '');
      setAdminTilesEnabled(true);
    }

    showPanel(isGM ? 'admin' : (isDisplay ? 'display' : 'player'));

    if (!isGM && !isDisplay) {
      setSentenceLabel('Waiting for the host to start a round...');
      if ($playerLobbyView) $playerLobbyView.classList.remove('hidden');
      if ($playerGameView) $playerGameView.classList.add('hidden');
      hideResult();
    } else if (isDisplay) {
      if ($displayLobbyView) $displayLobbyView.style.display = 'flex';
      if ($displayGameView) $displayGameView.style.display = 'none';
      if ($displaySentence) $displaySentence.textContent = 'Waiting for the host to start a round...';
    }

    showToast('Game session has been reset! 🔄');
  });

  function updateLockUI(isLocked) {
    const $roomLockIcon = document.getElementById('room-lock-icon');
    const $lockIcon = document.getElementById('lock-icon');
    const $lockText = document.getElementById('lock-text');

    // Display screen elements
    const $displayLobbyView = document.getElementById('display-lobby-view');
    const $displayLobbyHeader = document.getElementById('display-lobby-header');

    if (isLocked) {
      if ($lockIcon) $lockIcon.textContent = '🔒';
      if ($lockText) $lockText.textContent = 'Lobby Locked';
      if ($roomLockIcon) $roomLockIcon.textContent = '🔒';
      // Toggle switch visual
      if ($btnToggleLock) $btnToggleLock.classList.add('active');
      // Stats bar lobby pill
      if ($adminLobbyIcon) $adminLobbyIcon.textContent = '🔒';
      if ($adminLobbyStatus) $adminLobbyStatus.textContent = 'Locked';
      if ($adminLobbyPill) $adminLobbyPill.classList.add('locked');

      // Update display screen lobby
      if ($displayLobbyView) {
        $displayLobbyView.classList.add('lobby-locked');
      }
      if ($displayLobbyHeader) {
        $displayLobbyHeader.textContent = '🔒 Lobby Locked! Game Starting Soon... 🚀';
      }
    } else {
      if ($lockIcon) $lockIcon.textContent = '🔓';
      if ($lockText) $lockText.textContent = 'Lobby Open';
      if ($roomLockIcon) $roomLockIcon.textContent = '🔓';
      if ($btnToggleLock) $btnToggleLock.classList.remove('active');
      if ($adminLobbyIcon) $adminLobbyIcon.textContent = '🔓';
      if ($adminLobbyStatus) $adminLobbyStatus.textContent = 'Open';
      if ($adminLobbyPill) $adminLobbyPill.classList.remove('locked');

      // Update display screen lobby
      if ($displayLobbyView) {
        $displayLobbyView.classList.remove('lobby-locked');
      }
      if ($displayLobbyHeader) {
        $displayLobbyHeader.textContent = '🎈 Join the Game! 🎈';
      }
    }
  }

  // New round started
  socket.on('round_start', (data) => {
    // Cancel any pending leaderboard panel switch from a previous round
    if (lbShowTimer) { clearTimeout(lbShowTimer); lbShowTimer = null; }

    showPanel(isGM ? 'admin' : (isDisplay ? 'display' : 'player'));
    currentRoundId = data.roundId;
    currentRoundIsOpen = true;
    currentRoundIsFiller = false;
    hasGameStarted = true;
    $roundNum.textContent = data.roundId;
    hasClicked = false;
    pendingClickResult = null;

    // Update stats bar round number
    if ($adminRoundNum) $adminRoundNum.textContent = data.roundId;

    if (isGM) {
      setAdminStatus('', '');
      setAdminTilesEnabled(false);

      // Show round-active banner
      if ($roundActiveBanner) {
        $roundActiveBanner.classList.remove('hidden');

        const $rabStatusText = $roundActiveBanner.querySelector('.rab-status-text');
        if ($rabStatusText) $rabStatusText.textContent = 'Round in Progress';

        // Animate the banner timer bar
        $rabTimerBar.classList.remove('active');
        const delay = Math.max(0, data.revealTime - serverNow());
        setTimeout(() => {
          $rabTimerBar.style.animationDuration = `${ANSWER_WINDOW}ms`;
          $rabTimerBar.classList.add('active');
        }, delay);
      }
      if ($adminModeSection) $adminModeSection.classList.add('hidden');
    } else if (isDisplay) {
      if ($displayLobbyView) $displayLobbyView.style.display = 'none';
      if ($displayGameView) $displayGameView.style.display = 'flex';
      $displaySentence.textContent = '👂 Listen closely to the Host...';
      $displayTimerBar.classList.remove('active');
      $displayTimerWrap.classList.remove('hidden');
    } else {
      hideResult();
      if ($playerLobbyView) $playerLobbyView.classList.add('hidden');
      if ($playerGameView) $playerGameView.classList.remove('hidden');

      if ($playerNarrativePrefix) {
        $playerNarrativePrefix.textContent = '';
        $playerNarrativePrefix.classList.add('hidden');
      }

      showSentenceAndEnableTiles(data.sentence);
      applyPoppedBalloons(data.poppedColors);
    }

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
    currentRoundIsFiller = false;
    clearTimeout(closeTimer);

    if (!isGM && !isDisplay) {
      disableAllBalloons(); // Disable immediately during initial closed transition
      
      // Show correct balloon for 3 seconds, then enable early pop detection!
      setTimeout(() => {
        if (!currentRoundIsOpen) {
          // Enable remaining unpopped balloons for early pop penalty detection
          resetAllBalloons();
          applyPoppedBalloons(data.poppedColors);
          
          // Allow players to click early (and get a penalty)
          hasClicked = false;
          $noClickResult.classList.remove('hidden');
          $noClickResult.innerHTML = '⏱ <strong>Waiting...</strong> Host is preparing the next round. (Self-control check!)';
          $noClickResult.className = 'no-click-result time-up';
        }
      }, 3000);
    } else {
      disableAllBalloons();
    }

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
      setAdminStatus('Round over — check the leaderboard, then select another color.', '');
      // Hide banner, show mode section
      if ($roundActiveBanner) {
        $roundActiveBanner.classList.add('hidden');
        $rabTimerBar.classList.remove('active');
      }
      if ($adminModeSection) $adminModeSection.classList.remove('hidden');
    } else if (isDisplay) {
      $displaySentence.textContent = 'Round Over! Loading leaderboard...';
    } else {
      if (pendingClickResult) {
        totalScore = pendingClickResult.totalScore;
        $totalScore.textContent = totalScore;
        // Normalize server fields for showResult
        pendingClickResult.isTrap = !!pendingClickResult.isTrapTriggered;
        pendingClickResult.points = pendingClickResult.scoreGained;
        pendingClickResult.correctColor = data.correctColor; // from round_closed
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
    if (data.reason === 'not_started') {
      totalScore = data.totalScore;
      if ($totalScore) $totalScore.textContent = totalScore;

      // Pop the clicked balloon visually immediately
      const btn = balloonBtns.find(t => t.dataset.color === data.selectedColor);
      if (btn) {
        btn.classList.add('popped', 'disabled');
        btn.disabled = true;
      }

      playSound('deflate');
      
      $noClickResult.classList.remove('hidden');
      $noClickResult.innerHTML = `🚨 <strong>Too early!</strong> Popped a balloon before the round started! Penalty (${data.scoreGained} pts)`;
      $noClickResult.className = 'no-click-result time-up'; // neutral/warning style
      
      // Prevent further clicks during this wait phase
      disableAllBalloons();
      hasClicked = true;
      return;
    }

    pendingClickResult = data;
    disableAllBalloons();
    $noClickResult.classList.remove('hidden');
    $noClickResult.innerHTML = '✅ <strong>Answer locked in!</strong> Waiting for round to end...';
    $noClickResult.className = 'no-click-result time-up'; // neutral style
  });

  socket.on('leaderboard', (data) => {
    // Only show leaderboard if round is closed and NOT a narrative filler
    if (!currentRoundIsOpen && !currentRoundIsFiller && currentRoundId > 0) {
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
        const minRtt = Math.min(...rtts);
        const filtered = offsets.filter((_, i) => rtts[i] <= minRtt * 2);
        const clean = filtered.length >= 3 ? filtered : offsets;
        timeOffset = clean.reduce((a, b) => a + b, 0) / clean.length;
        const avgRtt = rtts.reduce((a, b) => a + b, 0) / rtts.length;
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
      sessionStorage.clear();
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

  function randomizeAvatar() {
    myAvatar = emojis[Math.floor(Math.random() * emojis.length)];
    $joinAvatar.textContent = myAvatar;
    $joinAvatar.style.animation = 'none';
    $joinAvatar.offsetHeight; // trigger reflow
    $joinAvatar.style.animation = 'score-pop 0.3s ease';
  }

  function randomizeProfile() {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const nounIdx = Math.floor(Math.random() * nouns.length);
    const noun = nouns[nounIdx];
    $usernameInput.value = `${adj} ${noun}`;

    // Always match the avatar to the selected noun!
    myAvatar = emojis[nounIdx];
    $joinAvatar.textContent = myAvatar;
    $joinAvatar.style.animation = 'none';
    $joinAvatar.offsetHeight; // trigger reflow
    $joinAvatar.style.animation = 'score-pop 0.3s ease';
  }

  $btnRandom.addEventListener('click', randomizeProfile);
  $joinAvatar.addEventListener('click', randomizeAvatar);

  // Auto-randomize profile on load for instant fun identity
  randomizeProfile();

  if ($btnJoinDisplay) {
    $btnJoinDisplay.addEventListener('click', () => {
      // Play the pop sound to force iOS to unlock HTML5 audio context
      playPopSound();
      myUsername = "Display Screen";
      myAvatar = "📺";
      socket.emit('join', { username: myUsername, avatar: myAvatar, isDisplay: true });
    });
  }

  $joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    $joinError.classList.add('hidden');
    playPopSound();

    const name = $usernameInput.value.trim();
    const hostPassword = $passwordInput.value.trim();

    if (!name) return;
    myUsername = name;

    if (myAvatar === '👤' && !hostPassword) {
      randomizeAvatar();
    }

    socket.emit('join', { username: name, avatar: myAvatar, hostPassword });
  });

  // Lobby Lock toggle
  if ($btnToggleLock) {
    $btnToggleLock.addEventListener('click', () => {
      socket.emit('gm_lock_room');
    });
  }

  // ── Panel switcher ─────────────────────────────────────────────────────────
  function showPanel(which) {
    $joinScreen.classList.add('hidden');
    $gameScreen.classList.remove('hidden');
    [$adminPanel, $playerPanel, $lbPanel, $displayPanel].forEach(p => {
      if (p) p.classList.add('hidden');
    });

    if (which === 'admin') $adminPanel.classList.remove('hidden');
    if (which === 'player') $playerPanel.classList.remove('hidden');
    if (which === 'lb') $lbPanel.classList.remove('hidden');
    if (which === 'display') $displayPanel.classList.remove('hidden');
  }

  $btnNextRound.addEventListener('click', () => {
    if (isGM) {
      showPanel('admin');
    }
  });

  // ── Admin: Round Form ──────────────────────────────────────────────────────
  $sentenceForm.addEventListener('submit', (e) => e.preventDefault());

  singleColourBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const color = btn.dataset.color === 'null' ? null : btn.dataset.color;

      // Visual selection glow
      singleColourBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');

      socket.emit('gm_round', { correctColor: color });
    });
  });

  $btnForceClose.addEventListener('click', () => {
    socket.emit('gm_close');
  });

  if ($btnResetSession) {
    $btnResetSession.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset the session? This will clear all scores, rounds, and return all players to the lobby.')) {
        socket.emit('gm_reset_session');
      }
    });
  }

  function setAdminStatus(msg, cls) {
    $adminStatus.textContent = msg;
    $adminStatus.className = `admin-status ${cls}`;
  }

  function setAdminTilesEnabled(on) {
    singleColourBtns.forEach(t => {
      t.disabled = !on;
      if (!on) t.classList.remove('selected');
    });
    if (on) {
      singleColourBtns.forEach(t => t.classList.remove('selected'));
    }
  }

  // ── Player: Gameplay ───────────────────────────────────────────────────────
  function showSentenceAndEnableTiles(sentence) {
    $sentenceDisplay.textContent = '👂 Listen closely to the Host...';
    $trapHint.classList.remove('hidden'); // Show hint about traps
    enableAllBalloons();
  }

  function setSentenceLabel(text) {
    $sentenceDisplay.textContent = text;
    $trapHint.classList.add('hidden');
    if ($playerNarrativePrefix) {
      $playerNarrativePrefix.textContent = '';
      $playerNarrativePrefix.classList.add('hidden');
    }
  }

  balloonBtns.forEach(btn => {
    btn.addEventListener('pointerdown', () => {
      if (btn.classList.contains('disabled') || hasClicked) return;
      hasClicked = true;
      playPopSound(); // Play synthesized pop
      if (navigator.vibrate) navigator.vibrate(30);
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
      if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
    } else {
      playSound('deflate');
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      // Shake the balloon grid on wrong answer
      const grid = document.getElementById('balloon-grid');
      if (grid) {
        grid.classList.add('shake');
        setTimeout(() => grid.classList.remove('shake'), 500);
      }
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
      $resultBar.className = 'result-bar wrong-result';
      $resultIcon.textContent = '💥';
      $resultText.textContent = 'It was a TRAP!';
      $resultSub.textContent = 'There was no hidden colour — you lose 5 points!';
      $resultPts.textContent = data.points.toString();
    } else if (!data.isCorrect) {
      $resultBar.classList.remove('hidden');
      $resultBar.className = 'result-bar wrong-result';
      $resultIcon.textContent = '❌';
      $resultText.textContent = 'Wrong Balloon!';
      $resultSub.textContent = `The hidden colour was ${data.correctColor.toUpperCase()}`;
      $resultPts.textContent = data.points.toString();
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
    const medals = ['🥇', '🥈', '🥉'];

    // Update Personal Verification Card for Mobile Players
    const $lbPersonalCard = document.getElementById('lb-personal-card');
    if ($lbPersonalCard && !isGM && !isDisplay) {
      $lbPersonalCard.classList.remove('hidden');

      const $lbPersonalAvatar = document.getElementById('lb-personal-avatar');
      const $lbPersonalName = document.getElementById('lb-personal-name');
      const $lbPersonalRank = document.getElementById('lb-personal-rank');
      const $lbPersonalScore = document.getElementById('lb-personal-score');

      const myTop10Idx = entries.findIndex(e => e.username === myUsername);
      const myRank = myTop10Idx !== -1 ? (myTop10Idx + 1) : (data.myRank || null);
      const myScore = myTop10Idx !== -1 ? entries[myTop10Idx].score : (data.myScore !== undefined ? data.myScore : totalScore);

      if (myRank !== null) {
        if ($lbPersonalAvatar) {
          $lbPersonalAvatar.textContent = myAvatar || '👤';
          $lbPersonalAvatar.className = `lb-personal-bubble ${getBalloonColorClass(myUsername)}`;
        }
        if ($lbPersonalName) {
          $lbPersonalName.textContent = myUsername;
        }
        if ($lbPersonalScore) {
          $lbPersonalScore.textContent = myScore;
        }

        const isWinner = myRank === 1;
        if ($lbPersonalRank) {
          if (isWinner) {
            $lbPersonalRank.textContent = `👑 Champions Winner! #1`;
            $lbPersonalCard.classList.add('winner');
          } else {
            $lbPersonalRank.textContent = `Your Rank: #${myRank}`;
            $lbPersonalCard.classList.remove('winner');
          }
        }
      } else {
        $lbPersonalCard.classList.add('hidden');
      }
    } else if ($lbPersonalCard) {
      $lbPersonalCard.classList.add('hidden');
    }

    // Render Game Over & Display Link Card
    const $lbGameOverCard = document.getElementById('lb-game-over-card');
    if ($lbGameOverCard) {
      if (!isGM && !isDisplay) {
        $lbGameOverCard.classList.remove('hidden');
        
        const $lbDisplayLink = document.getElementById('lb-display-link');
        if ($lbDisplayLink) {
          const displayUrl = `${window.location.origin}/?display=true`;
          $lbDisplayLink.href = displayUrl;
          $lbDisplayLink.textContent = displayUrl;
        }
      } else {
        $lbGameOverCard.classList.add('hidden');
      }
    }

    $lbRoundInfo.textContent = `After Round ${currentRoundId}`;

    entries.forEach((e, i) => {
      const li = document.createElement('li');
      li.className = `lb-row${e.username === myUsername ? ' lb-me' : ''}`;
      li.style.animationDelay = `${i * 0.05}s`;

      const streakBadge = e.streak >= 2
        ? `<span class="lb-streak" title="${e.streak} correct in a row!">🔥 ${e.streak}</span>`
        : '';

      // Rank change indicator
      let rankBadge = '';
      if (e.rankChange > 0) {
        rankBadge = `<span class="lb-rank-change lb-rank-up" title="Moved up ${e.rankChange}">▲${e.rankChange}</span>`;
      } else if (e.rankChange < 0) {
        rankBadge = `<span class="lb-rank-change lb-rank-down" title="Moved down ${Math.abs(e.rankChange)}">▼${Math.abs(e.rankChange)}</span>`;
      } else if (e.rankChange === 0 && e.score > 0) {
        // No change, show nothing (stable position)
      }

      li.innerHTML = `
        <span class="lb-rank">${medals[i] || i + 1}</span>
        <span class="lb-name">
          <span class="lb-avatar">${e.avatar || '👤'}</span> 
          <span class="lb-user-text">${e.username}</span>
          ${streakBadge}
          ${rankBadge}
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

    // Auto switch to LB if spectator display or regular player
    if (!isGM) {
      if (lbShowTimer) clearTimeout(lbShowTimer);
      lbShowTimer = setTimeout(() => {
        if (!currentRoundIsOpen) {
          showPanel('lb');
        }
        lbShowTimer = null;
      }, 3000); // 3 seconds after round ends
    } else {
      showPanel('lb');
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function resetAllBalloons() {
    balloonBtns.forEach(t => {
      t.classList.remove('chosen', 'correct', 'wrong', 'popped');
      t.disabled = false;
      const label = t.querySelector('.balloon-label');
      if (label) {
        label.innerHTML = t.dataset.color.charAt(0).toUpperCase() + t.dataset.color.slice(1);
      }
    });
  }

  function enableAllBalloons() {
    resetAllBalloons();
    balloonBtns.forEach(t => {
      t.classList.remove('disabled');
      t.disabled = false;
    });
  }

  function disableAllBalloons() {
    balloonBtns.forEach(t => {
      t.classList.add('disabled');
      t.disabled = true;
    });
  }

  function applyPoppedBalloons(poppedColors) {
    if (!poppedColors) return;
    balloonBtns.forEach(t => {
      if (poppedColors.includes(t.dataset.color)) {
        t.classList.add('popped', 'disabled');
        t.disabled = true;
      }
    });
  }

  function setConn(ok, ping, offset) {
    $connStatus.textContent = ok
      ? (ping !== undefined ? `● Connected · ${ping}ms · ±${offset}ms` : '● Connected')
      : '● Disconnected — reconnecting…';
    $connStatus.className = `conn-strip ${ok ? 'connected' : 'disconnected'}`;
  }

  // ── Smart Join Screen Setup ──────────────────────────────────────────────────
  const $hostPasswordField = document.getElementById('host-password-field');
  if ($hostPasswordField) $hostPasswordField.classList.remove('hidden');

  // ── Player Count & Waiting Lobby ──────────────────────────────────────────
  const $playerCountBadge = document.getElementById('player-count-badge');

  const balloonColors = ['red', 'blue', 'yellow', 'orange', 'green', 'purple', 'pink'];
  function getBalloonColorClass(username) {
    let hash = 0;
    const str = username || '';
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % balloonColors.length;
    return `balloon-${balloonColors[idx]}`;
  }

  function getLobbySizeClass(count) {
    if (count > 24) return 'size-xsmall';
    if (count > 12) return 'size-small';
    if (count > 6) return 'size-medium';
    return 'size-standard';
  }

  socket.on('player_count', (data) => {
    if ($playerCountBadge) {
      $playerCountBadge.textContent = `👥 ${data.count}`;
    }
    // Update admin stats bar
    if ($adminPlayerCount) {
      $adminPlayerCount.textContent = data.count;
    }
    
    const count = data.avatars.length;
    const sizeClass = getLobbySizeClass(count);

    if ($playerLobbyPlayers && !hasGameStarted && !currentRoundIsOpen) {
      $playerLobbyPlayers.innerHTML = '';
      $playerLobbyPlayers.classList.remove('size-standard', 'size-medium', 'size-small', 'size-xsmall');
      $playerLobbyPlayers.classList.add(sizeClass);

      data.avatars.forEach((p, i) => {
        const card = document.createElement('div');
        card.className = 'player-avatar-card';
        card.style.animationDelay = `${i * 0.05}s`;

        const bubble = document.createElement('div');
        bubble.className = `player-avatar-bubble ${getBalloonColorClass(p.username)}`;
        bubble.textContent = p.avatar || '👤';

        const string = document.createElement('div');
        string.className = 'balloon-string';

        const name = document.createElement('div');
        name.className = 'player-avatar-name';
        name.textContent = p.username || 'Player';

        card.appendChild(bubble);
        card.appendChild(string);
        card.appendChild(name);
        $playerLobbyPlayers.appendChild(card);
      });
    }

    // Update display screen lobby avatars (only before game starts)
    if (!hasGameStarted) {
      const $displayLobbyPlayers = document.getElementById('display-lobby-players');
      if ($displayLobbyPlayers) {
        $displayLobbyPlayers.classList.remove('size-standard', 'size-medium', 'size-small', 'size-xsmall');
        $displayLobbyPlayers.classList.add(sizeClass);

        // Ensure Left and Right containers exist inside the display players lobby container
        let $leftLobby = document.getElementById('display-lobby-left');
        let $rightLobby = document.getElementById('display-lobby-right');
        if (!$leftLobby) {
          $leftLobby = document.createElement('div');
          $leftLobby.id = 'display-lobby-left';
          $leftLobby.className = 'display-lobby-side';
          $displayLobbyPlayers.appendChild($leftLobby);
        }
        if (!$rightLobby) {
          $rightLobby = document.createElement('div');
          $rightLobby.id = 'display-lobby-right';
          $rightLobby.className = 'display-lobby-side';
          $displayLobbyPlayers.appendChild($rightLobby);
        }

        // Apply active sizing classes to the left/right sub-lobby containers
        $leftLobby.className = `display-lobby-side ${sizeClass}`;
        $rightLobby.className = `display-lobby-side ${sizeClass}`;

        // Clear existing avatar cards inside sub-lobbies
        $leftLobby.innerHTML = '';
        $rightLobby.innerHTML = '';

        // Clean up any loose avatar cards that ended up directly in parent
        const looseCards = $displayLobbyPlayers.querySelectorAll(':scope > .display-avatar-card');
        looseCards.forEach(c => c.remove());

        data.avatars.forEach((p, i) => {
          const card = document.createElement('div');
          card.className = 'display-avatar-card';
          card.style.animationDelay = `${i * 0.05}s`;

          const bubble = document.createElement('div');
          bubble.className = `display-avatar-bubble ${getBalloonColorClass(p.username)}`;
          bubble.textContent = p.avatar || '👤';

          const string = document.createElement('div');
          string.className = 'balloon-string';

          const name = document.createElement('div');
          name.className = 'display-avatar-name';
          name.textContent = p.username || 'Player';

          card.appendChild(bubble);
          card.appendChild(string);
          card.appendChild(name);

          // Distribute players symmetrically: even index left, odd index right
          if (i % 2 === 0) {
            $leftLobby.appendChild(card);
          } else {
            $rightLobby.appendChild(card);
          }
        });
      }
    }
  });

  // ── Haptic Feedback ───────────────────────────────────────────────────────
  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  // ── Auto-reconnect session recovery & Query Parameter Router ───────────────
  const urlParams = new URLSearchParams(window.location.search);
  const isDisplayUrl = urlParams.has('display') || urlParams.get('mode') === 'display';

  if (isDisplayUrl) {
    myUsername = "Display Screen";
    myAvatar = "📺";

    socket.on('connect', () => {
      socket.emit('join', {
        username: myUsername,
        avatar: myAvatar,
        isDisplay: true
      });
    });
  } else {
    const savedUser = sessionStorage.getItem('bb_username') || '';
    if (savedUser) {
      const savedAvatar = sessionStorage.getItem('bb_avatar') || '👤';
      const savedIsGM = sessionStorage.getItem('bb_is_gm') === 'true';
      const savedIsDisplay = sessionStorage.getItem('bb_is_display') === 'true';
      const savedHostPass = sessionStorage.getItem('bb_host_pass') || '';

      socket.on('connect', () => {
        socket.emit('join', {
          username: savedUser,
          avatar: savedAvatar,
          hostPassword: savedHostPass,
          isGM: savedIsGM,
          isDisplay: savedIsDisplay
        });
      });
    }
  }

})();
