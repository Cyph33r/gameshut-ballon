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

  // New dashboard elements
  const $adminPlayerCount = document.getElementById('admin-player-count');
  const $adminRoundNum    = document.getElementById('admin-round-num');
  const $adminLobbyIcon   = document.getElementById('admin-lobby-icon');
  const $adminLobbyStatus = document.getElementById('admin-lobby-status');
  const $adminLobbyPill   = document.getElementById('admin-lobby-pill');
  const $roundActiveBanner = document.getElementById('round-active-banner');
  const $rabSentencePreview = document.getElementById('rab-sentence-preview');
  const $rabTimerBar       = document.getElementById('rab-timer-bar');
  const $adminModeSection  = document.getElementById('admin-mode-section');
  const $segHighlight      = document.getElementById('seg-highlight');
  const $charCounter       = document.getElementById('char-counter');
  const $storyCharCounter  = document.getElementById('story-char-counter');

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
  const $chkAutoplay    = document.getElementById('chk-autoplay');

  // Display Story View
  const $displayStoryView    = document.getElementById('display-story-view');
  const $storyScrollArea     = document.getElementById('story-scroll-area');
  const $displayStoryTimerWrap = document.getElementById('display-story-timer-wrap');
  const $displayStoryTimerBar  = document.getElementById('display-story-timer-bar');

  // Player
  const $playerNarrativePrefix = document.getElementById('player-narrative-prefix');
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
  let storyDraft         = []; // Array of { sentence, cleanSentence, color, wordId }
  let activeWordSpan     = null;
  let activeSentenceRow  = null;
  let roundQueue         = []; // Array of { sentence, correctColor }
  let autoplayEnabled    = false;
  let autoplayTimer      = null;
  let isStoryModeActive  = false; // true when a story queue is actively playing

  // Hint-stripping regex: removes (sounds like X), (like X), etc.
  const HINT_REGEX = /\s*\([^)]*(?:sounds?\s+like|like|≈)\s+[^)]+\)\s*/gi;

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
    
    updateLockUI(data.isLocked);

    if (!isGM && !isDisplay) {
      setSentenceLabel('Waiting for the host to start a round...');
    } else if (isDisplay) {
      if ($displayLobbyView) $displayLobbyView.style.display = 'flex';
      if ($displayGameView) $displayGameView.style.display = 'none';
      const shareUrl = `${window.location.origin}${window.location.pathname}`;
      if ($displayQrImg) {
        $displayQrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&color=6347ff&data=${encodeURIComponent(shareUrl)}`;
      }
      if ($displayJoinUrl) {
        $displayJoinUrl.textContent = `${window.location.host}${window.location.pathname}`;
      }
      $displaySentence.textContent = 'Waiting for the host to start a round...';
    }

    // Save session in session storage for seamless recovery
    sessionStorage.setItem('bb_username', data.username || '');
    sessionStorage.setItem('bb_avatar', data.avatar || '👤');
    sessionStorage.setItem('bb_is_gm', isGM ? 'true' : 'false');
    sessionStorage.setItem('bb_is_display', isDisplay ? 'true' : 'false');

    if (isGM) {
      const pass = $hostPasswordInput ? $hostPasswordInput.value.trim() : '';
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

  function updateLockUI(isLocked) {
    const $roomLockIcon = document.getElementById('room-lock-icon');
    const $lockIcon = document.getElementById('lock-icon');
    const $lockText = document.getElementById('lock-text');
    
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
    } else {
      if ($lockIcon) $lockIcon.textContent = '🔓';
      if ($lockText) $lockText.textContent = 'Lobby Open';
      if ($roomLockIcon) $roomLockIcon.textContent = '🔓';
      if ($btnToggleLock) $btnToggleLock.classList.remove('active');
      if ($adminLobbyIcon) $adminLobbyIcon.textContent = '🔓';
      if ($adminLobbyStatus) $adminLobbyStatus.textContent = 'Open';
      if ($adminLobbyPill) $adminLobbyPill.classList.remove('locked');
    }
  }

  // New round started
  socket.on('round_start', (data) => {
    showPanel(isGM ? 'admin' : (isDisplay ? 'display' : 'player'));
    currentRoundId = data.roundId;
    currentRoundIsOpen = !data.isFiller;
    $roundNum.textContent = data.roundId;
    hasClicked = false;
    pendingClickResult = null;

    // Update stats bar round number
    if ($adminRoundNum) $adminRoundNum.textContent = data.roundId;

    if (isGM) {
      setAdminStatus('', '');
      setAdminTilesEnabled(false);
      $adminRoundControls.classList.remove('hidden');

      // Show round-active banner, hide mode section
      if ($roundActiveBanner) {
        $rabSentencePreview.textContent = data.sentence;
        $roundActiveBanner.classList.remove('hidden');
        
        const $rabStatusText = $roundActiveBanner.querySelector('.rab-status-text');
        const $rabPulseDot = $roundActiveBanner.querySelector('.rab-pulse-dot');
        const $rabTimerWrap = $roundActiveBanner.querySelector('.rab-timer-wrap');
        
        if (data.isFiller) {
          $roundActiveBanner.classList.add('filler-mode');
          if ($rabStatusText) $rabStatusText.textContent = 'Story Progression';
          if ($rabPulseDot) $rabPulseDot.style.background = '#6347ff'; // purple pulse for story progress
          if ($rabTimerWrap) $rabTimerWrap.classList.add('hidden');
          if ($btnForceClose) {
            $btnForceClose.textContent = '▶ Next Sentence';
            $btnForceClose.className = 'rab-end-btn next-filler-btn';
          }
          
          // Auto-play for filler sentences: GM automatically sends gm_queue_next after a read-friendly delay
          if (autoplayEnabled && roundQueue.length > 0) {
            clearTimeout(autoplayTimer);
            autoplayTimer = setTimeout(() => {
              socket.emit('gm_queue_next');
            }, 6000); // 6 seconds to read filler, then auto-advance
          }
        } else {
          $roundActiveBanner.classList.remove('filler-mode');
          if ($rabStatusText) $rabStatusText.textContent = 'Round in Progress';
          if ($rabPulseDot) $rabPulseDot.style.background = ''; // restore green pulse
          if ($rabTimerWrap) $rabTimerWrap.classList.remove('hidden');
          if ($btnForceClose) {
            $btnForceClose.textContent = '⏹ End Round Early';
            $btnForceClose.className = 'rab-end-btn';
          }
          
          // Animate the banner timer bar
          $rabTimerBar.classList.remove('active');
          const delay = Math.max(0, data.revealTime - serverNow());
          setTimeout(() => {
            $rabTimerBar.style.animationDuration = `${ANSWER_WINDOW}ms`;
            $rabTimerBar.classList.add('active');
          }, delay);
        }
      }
      if ($adminModeSection) $adminModeSection.classList.add('hidden');
      $sentenceInput.value = '';
      updateCharCounter();
    } else if (isDisplay) {
      // Check if this is a story mode round
      if (data.storyProgress) {
        isStoryModeActive = true;
        // Use story view instead of normal display
        if ($displayLobbyView) $displayLobbyView.style.display = 'none';
        if ($displayGameView) $displayGameView.style.display = 'none';
        if ($displayStoryView) $displayStoryView.classList.remove('hidden');
        renderStoryView(data.storyProgress, 'active');
        
        // Story timer
        if ($displayStoryTimerBar) {
          $displayStoryTimerBar.classList.remove('active');
          if (data.isFiller) {
            $displayStoryTimerWrap.classList.add('hidden');
          } else {
            $displayStoryTimerWrap.classList.remove('hidden');
          }
        }
      } else {
        isStoryModeActive = false;
        if ($displayLobbyView) $displayLobbyView.style.display = 'none';
        if ($displayGameView) $displayGameView.style.display = 'flex';
        if ($displayStoryView) $displayStoryView.classList.add('hidden');
        $displaySentence.textContent = data.sentence;
        $displayTimerBar.classList.remove('active');
        $displayTimerWrap.classList.remove('hidden');
      }
    } else {
      hideResult();
      
      if (data.isFiller) {
        $sentenceDisplay.textContent = data.sentence;
        $trapHint.classList.add('hidden');
        disableAllBalloons();
        $timerWrap.classList.add('hidden');
        if ($playerNarrativePrefix) {
          $playerNarrativePrefix.textContent = '';
          $playerNarrativePrefix.classList.add('hidden');
        }
      } else {
        // Calculate narrative prefix if story mode is active
        let narrativePrefix = '';
        if (data.storyProgress) {
          const { storyMeta, storyActiveSentenceIndex } = data.storyProgress;
          if (storyMeta && storyMeta.sentences) {
            const sentences = storyMeta.sentences;
            const roundSentences = sentences.filter(s => s.isRound);
            
            // Find current round index in roundSentences based on storyActiveSentenceIndex
            const activeIdx = storyActiveSentenceIndex;
            const storyRoundIndex = roundSentences.findIndex(s => s.sentenceIndex === activeIdx);
            
            if (storyRoundIndex !== -1) {
              const activeRound = roundSentences[storyRoundIndex];
              const activeSentenceIdx = activeRound.sentenceIndex;
              // Find the previous round's sentenceIndex
              let prevIdx = -1;
              if (storyRoundIndex > 0 && roundSentences[storyRoundIndex - 1]) {
                prevIdx = roundSentences[storyRoundIndex - 1].sentenceIndex;
              }
              // Collect narrative sentences between prevIdx and activeSentenceIdx
              const prefixParts = [];
              for (let i = prevIdx + 1; i < activeSentenceIdx; i++) {
                if (!sentences[i].isRound) {
                  prefixParts.push(sentences[i].text);
                }
              }
              narrativePrefix = prefixParts.join(' ');
            }
          }
        }
        
        if (narrativePrefix && $playerNarrativePrefix) {
          $playerNarrativePrefix.textContent = narrativePrefix;
          $playerNarrativePrefix.classList.remove('hidden');
        } else if ($playerNarrativePrefix) {
          $playerNarrativePrefix.textContent = '';
          $playerNarrativePrefix.classList.add('hidden');
        }

        showSentenceAndEnableTiles(data.sentence);
      }
    }

    // Flash overlay
    showOverlay(data.sentence);
    // TTS removed — host reads the story aloud manually

    if (!isGM && !isDisplay) {
      if (data.isFiller) {
        $timerBar.classList.remove('active');
        $timerWrap.classList.add('hidden');
      } else {
        $timerBar.classList.remove('active');
        $timerWrap.classList.remove('hidden');
        // Sync animation to revealTime
        const delay = Math.max(0, data.revealTime - serverNow());
        setTimeout(() => {
          $timerBar.style.animationDuration = `${ANSWER_WINDOW}ms`;
          $timerBar.classList.add('active');
        }, delay);
      }
    } else if (isDisplay) {
      const delay = Math.max(0, data.revealTime - serverNow());
      if (isStoryModeActive && $displayStoryTimerBar) {
        if (!data.isFiller) {
          setTimeout(() => {
            $displayStoryTimerBar.style.animationDuration = `${ANSWER_WINDOW}ms`;
            $displayStoryTimerBar.classList.add('active');
          }, delay);
        }
      } else {
        setTimeout(() => {
          $displayTimerBar.style.animationDuration = `${ANSWER_WINDOW}ms`;
          $displayTimerBar.classList.add('active');
        }, delay);
      }
    }

    // Auto-disable client side after window (server authoritative anyway)
    clearTimeout(closeTimer);
    if (!data.isFiller) {
      const timeUntilClose = Math.max(0, data.revealTime + ANSWER_WINDOW - serverNow());
      closeTimer = setTimeout(() => {
        disableAllBalloons();
      }, timeUntilClose);
    }

    // Play tick warning sounds at ANSWER_WINDOW - 2000 and ANSWER_WINDOW - 1000
    if (!isGM && !data.isFiller) {
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
      setAdminStatus('Round over — check the leaderboard, then queue the next one.', '');
      $adminRoundControls.classList.add('hidden');
      // Hide banner, show mode section
      if ($roundActiveBanner) {
        $roundActiveBanner.classList.add('hidden');
        $rabTimerBar.classList.remove('active');
      }
      if ($adminModeSection) $adminModeSection.classList.remove('hidden');

      // Auto-play: auto-advance to next queued round after leaderboard delay
      if (autoplayEnabled && roundQueue.length > 0) {
        clearTimeout(autoplayTimer);
        autoplayTimer = setTimeout(() => {
          socket.emit('gm_queue_next');
        }, 6000); // 6 second leaderboard display
      }
    } else if (isDisplay) {
      if (isStoryModeActive && data.storyProgress) {
        // Update story view to show revealed colour
        renderStoryView(data.storyProgress, 'closed');
        if ($displayStoryTimerWrap) $displayStoryTimerWrap.classList.add('hidden');
        if ($displayStoryTimerBar) $displayStoryTimerBar.classList.remove('active');
      } else {
        $displaySentence.textContent = 'Round Over! Loading leaderboard...';
      }
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

      // Visual selection glow
      singleColourBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');

      socket.emit('gm_round', { sentence, correctColor: color });
    });
  });

  // ── Admin: Story Mode Logic ────────────────────────────────────────────────
  $tabSingle.addEventListener('click', () => {
    $tabSingle.classList.add('active');
    $tabStory.classList.remove('active');
    $sentenceForm.classList.remove('hidden');
    $storyForm.classList.add('hidden');
    if ($segHighlight) $segHighlight.classList.remove('right');
  });

  $tabStory.addEventListener('click', () => {
    $tabStory.classList.add('active');
    $tabSingle.classList.remove('active');
    $sentenceForm.classList.add('hidden');
    $storyForm.classList.remove('hidden');
    if ($segHighlight) $segHighlight.classList.add('right');
  });

  $btnProcessStory.addEventListener('click', () => {
    const text = $storyInput.value.trim();
    if (!text) return;
    
    // Split into sentences by && delimiter
    const sentences = text.split('&&').map(s => s.trim()).filter(s => s.length > 0);
    
    $storyWordsContainer.innerHTML = '';
    storyDraft = [];
    $storyPalette.classList.add('hidden');
    activeWordSpan = null;
    activeSentenceRow = null;

    sentences.forEach((s, sentenceIdx) => {
      // Store both original (with hints) and clean (without hints) text
      const cleanText = s.replace(HINT_REGEX, ' ').replace(/\s+/g, ' ').trim();
      
      storyDraft.push({ sentence: cleanText, originalSentence: s, color: undefined });

      const div = document.createElement('div');
      div.className = 'story-sentence-row';
      div.dataset.sIdx = sentenceIdx;
      
      // Render text: dim the hint text for host
      const textParts = s.split(/(\([^)]+\))/g);
      textParts.forEach(part => {
        if (/^\([^)]+\)$/.test(part)) {
          const hintSpan = document.createElement('span');
          hintSpan.textContent = part;
          hintSpan.style.opacity = '0.5';
          hintSpan.style.fontStyle = 'italic';
          hintSpan.style.marginLeft = '5px';
          div.appendChild(hintSpan);
        } else {
          div.appendChild(document.createTextNode(part));
        }
      });
      
      div.addEventListener('click', () => {
        const alreadyActive = div.classList.contains('active');
        
        // Clear all active classes
        const allRows = $storyWordsContainer.querySelectorAll('.story-sentence-row');
        allRows.forEach(r => r.classList.remove('active'));
        
        if (alreadyActive) {
          activeSentenceRow = null;
          $storyPalette.classList.add('hidden');
        } else {
          activeSentenceRow = div;
          div.classList.add('active');
          $storyPalette.classList.remove('hidden');
        }
      });
      
      $storyWordsContainer.appendChild(div);
    });

    $storyBuilder.classList.remove('hidden');
  });

  storyPaletteBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (!activeSentenceRow) return;
      const sIdx = activeSentenceRow.dataset.sIdx;
      const color = btn.dataset.color === 'null' ? null : btn.dataset.color;
      
      storyDraft[sIdx].color = color;
      
      // Update row class
      activeSentenceRow.className = 'story-sentence-row';
      if (color !== undefined) {
        activeSentenceRow.classList.add(`assigned-${color}`);
      }
      
      // Update badge display inside the row
      const existingBadge = activeSentenceRow.querySelector('.sentence-badge');
      if (existingBadge) existingBadge.remove();
      
      if (color !== undefined) {
        const badge = document.createElement('span');
        badge.className = `sentence-badge ${color === null ? 'null' : color}`;
        badge.textContent = color === null ? 'Trap' : color;
        activeSentenceRow.appendChild(badge);
      }
      
      // Clear active selection state
      activeSentenceRow.classList.remove('active');
      activeSentenceRow = null;
      $storyPalette.classList.add('hidden');
    });
  });

  $btnQueueStory.addEventListener('click', () => {
    // Process and queue the entire story (all sentences)
    const storyQueueItems = storyDraft.map((s, idx) => ({
      sentence: s.sentence,
      correctColor: s.color !== undefined ? s.color : null,
      isRound: s.color !== undefined,
      sentenceIndex: idx
    }));
    
    // Build storyMeta: full list of ALL sentences with their roles
    let roundIndex = 0;
    const storyMetaSentences = storyDraft.map((s, idx) => {
      if (s.color !== undefined) {
        return { text: s.sentence, isRound: true, roundIndex: roundIndex++, sentenceIndex: idx };
      } else {
        return { text: s.sentence, isRound: false, roundIndex: null, sentenceIndex: idx };
      }
    });
    
    const storyMeta = {
      title: 'Story',
      sentences: storyMetaSentences,
    };
    
    socket.emit('gm_queue_add', { rounds: storyQueueItems, storyMeta });
    
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
      let badgeHtml = '';
      if (r.isRound) {
        badgeHtml = `<span class="q-color ${r.correctColor === null ? 'null' : r.correctColor}">${r.correctColor === null ? 'Trap' : r.correctColor}</span>`;
      } else {
        badgeHtml = `<span class="q-color narrative-badge" style="background:#333; color:#aaa; border: 1px dashed #555; font-weight:normal; text-transform:none;">Narrative</span>`;
      }
      
      li.innerHTML = `<span style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-right:10px;">${idx + 1}. ${r.sentence}</span>
                      ${badgeHtml}`;
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
    isStoryModeActive = false;
    clearTimeout(autoplayTimer);
  });

  // ── Auto-Play Toggle ───────────────────────────────────────────────────────
  if ($chkAutoplay) {
    $chkAutoplay.addEventListener('click', () => {
      autoplayEnabled = !autoplayEnabled;
      $chkAutoplay.classList.toggle('active', autoplayEnabled);
      $chkAutoplay.setAttribute('aria-checked', autoplayEnabled ? 'true' : 'false');
      if (!autoplayEnabled) clearTimeout(autoplayTimer);
    });
  }

  // ── Display: Progressive Story View Renderer ───────────────────────────────
  function renderStoryView(storyProgress, phase) {
    if (!$storyScrollArea) return;
    
    const { storyMeta, storyActiveSentenceIndex, revealedRounds } = storyProgress;
    if (!storyMeta || !storyMeta.sentences) return;
    
    const sentences = storyMeta.sentences;
    const revealedMap = new Map(); // sentenceIndex -> color
    (revealedRounds || []).forEach(r => revealedMap.set(r.sentenceIndex, r.color));
    
    const activeSentenceIndex = storyActiveSentenceIndex;
    
    $storyScrollArea.innerHTML = '';
    
    sentences.forEach((s, idx) => {
      const div = document.createElement('div');
      div.className = 'story-line';
      div.dataset.sIdx = idx;
      
      // Determine the state of this sentence
      if (s.sentenceIndex < activeSentenceIndex) {
        // Past sentence
        if (revealedMap.has(s.sentenceIndex)) {
          // Past round — show with colour dot
          div.classList.add('past-round');
          const colorVal = revealedMap.get(s.sentenceIndex);
          const dotClass = colorVal === null ? 'trap' : colorVal;
          div.innerHTML = `${s.text} <span class="story-color-dot ${dotClass}"></span>`;
        } else {
          // Past narrative
          div.classList.add('narrative');
          div.textContent = s.text;
        }
      } else if (s.sentenceIndex === activeSentenceIndex) {
        // Active sentence (could be round or narrative filler)
        if (s.isRound) {
          if (phase === 'closed') {
            // Past round display
            div.classList.add('past-round');
            const colorVal = revealedMap.get(s.sentenceIndex);
            const dotClass = colorVal === null ? 'trap' : colorVal;
            div.innerHTML = `${s.text} <span class="story-color-dot ${dotClass}"></span>`;
          } else {
            // Active round display
            div.classList.add('active');
            div.textContent = s.text;
          }
        } else {
          // Active narrative filler sentence!
          div.classList.add('narrative-active');
          div.textContent = s.text;
        }
      } else {
        // Future — hide
        div.classList.add('future');
        div.textContent = s.text;
      }
      
      $storyScrollArea.appendChild(div);
    });
    
    // Auto-scroll to the active sentence
    const activeEl = $storyScrollArea.querySelector('.story-line.active') || $storyScrollArea.querySelector('.story-line.narrative-active');
    if (activeEl) {
      setTimeout(() => {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }

  $btnForceClose.addEventListener('click', () => {
    if ($btnForceClose.classList.contains('next-filler-btn')) {
      socket.emit('gm_queue_next');
    } else {
      socket.emit('gm_close');
    }
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
      // Clear colour selection glow when re-enabling
      singleColourBtns.forEach(t => t.classList.remove('selected'));
    }
  }

  // ── Character Counter ──────────────────────────────────────────────────────
  function updateCharCounter() {
    if (!$charCounter || !$sentenceInput) return;
    const len = $sentenceInput.value.length;
    $charCounter.textContent = `${len} / 2000`;
    $charCounter.classList.remove('warning', 'danger');
    if (len > 1800) $charCounter.classList.add('danger');
    else if (len > 1500) $charCounter.classList.add('warning');
  }
  if ($sentenceInput) {
    $sentenceInput.addEventListener('input', updateCharCounter);
  }

  function updateStoryCharCounter() {
    if (!$storyCharCounter || !$storyInput) return;
    $storyCharCounter.textContent = $storyInput.value.length;
  }
  if ($storyInput) {
    $storyInput.addEventListener('input', updateStoryCharCounter);
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

  // ── Smart Join Screen Setup ──────────────────────────────────────────────────
  const $hostPasswordField = document.getElementById('host-password-field');
  if ($hostPasswordField) $hostPasswordField.classList.remove('hidden');

  // ── Player Count & Waiting Lobby ──────────────────────────────────────────
  const $playerCountBadge = document.getElementById('player-count-badge');
  const $waitingAvatars = document.getElementById('waiting-avatars');
  const $waitingLobby = document.getElementById('waiting-lobby');

  socket.on('player_count', (data) => {
    if ($playerCountBadge) {
      $playerCountBadge.textContent = `👥 ${data.count}`;
    }
    // Update admin stats bar
    if ($adminPlayerCount) {
      $adminPlayerCount.textContent = data.count;
    }
    if ($waitingAvatars && !currentRoundIsOpen) {
      $waitingAvatars.innerHTML = '';
      data.avatars.forEach((p, i) => {
        const bubble = document.createElement('span');
        bubble.className = 'avatar-bubble';
        bubble.title = p.username;
        bubble.textContent = p.avatar;
        bubble.style.animationDelay = `${i * 0.05}s`;
        $waitingAvatars.appendChild(bubble);
      });
    }
  });

  // Hide waiting lobby when round starts, show when round ends
  socket.on('round_start', () => {
    if ($waitingLobby) $waitingLobby.style.display = 'none';
  });
  socket.on('round_closed', () => {
    if ($waitingLobby) $waitingLobby.style.display = 'none';
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
