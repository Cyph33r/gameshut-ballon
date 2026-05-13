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

  const popAudio = new Audio("data:audio/wav;base64,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bAy2DJQN8wyPDGUMNgyjDa4Npw1FDfMNRA1wDdENgAz5DDwNCA6MDbkMUAyqDPcMyAygDM8MGg4jDcQNgg0uDWUNCg4VDWoNAA07DSINHg5mDbQMqQzLDW8NRA5NDqYNMA36DaYNEg7ZDZkNEA5GDd4NTw79DPYNRA4CDVgO0AzqDR4N9gwxDroNCA4lDhsN9wytDYEN6wx6DggNDA4MDS0O6g0wDY0OsA3rDXsOSg2BDVwOMQ1kDSMN1A0+Du0NKw1vDUgOXQ1UDRENxg1fDhYNTA3BDf8N+w02DiUOlA5wDjAO/g0vDRQOow6CDUMNpA5mDS4Nbw77DTMOHQ6ZDsQNSg2XDjMNKA6HDmwNZg16DZ0OTg6pDSIOcA6TDe8N3g09DT0Ogw3CDe0NGQ6MDRsOow16DjcOOw4uDVcObQ04Dh8ORQ5DDtkNdg76DXQNPQ03DtUNXQ4hDUENEA0KDTkOjg0gDlgNRA58DUkO/A1pDdANFw0VDT0O/g3/DFMOGQ48Dg8Ntg0NDfMNxQ1gDScNTg1/DTENOw2EDSkOJw6qDY8N1gwMDuoNTQ0ADS8NVg02DXQNzg1gDQUNwg2aDTENugydDWEN+AzfDb4Nzw3wDC4NAQ3eDf0MIA1BDY8MZg2nDJwMzQwWDRENLw2nDMMMigyRDScNhg2aDFYN0gx7DcAMmgzpDCgNoAziDDMMMQ27DIgMJAy/DBwM/gxEDS0NWQxEDLUMwQwwDdQM2Qx+DBkNWwzHDHwMMAx2DKoMMgwxDKMMwwvEC8IMwAsbDM8MEgwfDKUMdAzSC0MMqQzOC0AMHAy0C+UL2guyCwYMKgwSDNkLRQsNDD8MJgxTDPAL+QvUC3ULZwteC7gLGwxNC/sL8AtLC/oKqAv6C0ULQQstC+8K/woiC7wKoQvlCm4L6woPC4YKnQqICxgLHAsNC4oKDgtSCwIL/wqhCsEKIAvICtUKIAvxCiULTwoFCiUKzAp6CrMKVgrzCe8J4Qm2CvUJHQqGCsIJ/wliCtkJJgoyCo4JowkTCmMK0gnfCSoKCwozCoEJgAnsCdcJ6gkaCiMJWQmrCTMJPAkTCQIJ9gh/CRYJggn+CA0JjAkpCeYI4QiOCH0JigjHCIsI6wgpCSgJ0ghdCJIIggjkCAcJIgjcCP0IhgjNCMQI2Qg/CB4IeAg4CGIIPAjhB+kHTQigB5wH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VgJNAlACUgJdAk0CkQKMAm8CjAKAAq0ClwK4AqgCxwLuAvICzwLaAt4C6AIeAwcDOgNCAxADHwM/Ay4DOwNQA0UDeAN3A3YDmgOnA44DngPGA9EDtAPfA70DxQPFA8MD5gMIBBMEBwT3A/QDGgQOBDUEOgRKBFMELgRHBHoEfQRIBIoEZwRkBKMEcQSdBKIEuwSZBLsE0ASfBKgEvAS0BMIE5wTwBOsECgX+BBoF/AQKBRsFIwUiBRkFDQU7BSgFTwUuBVAFOAVQBUwFgQWFBW0FhQVbBY4FlAWaBagFdgWuBYEFnwWZBbMFjwWVBb4FygWxBbcFxwXTBbgF8gXABb8FyQXwBfMF8QXSBREGDAb3BRUGDwYbBgMGDgYCBvUFHwYaBhgGLQYfBjkGIwYtBg8GFQY7BhMGNQZPBksGNgYsBjwGVAZXBioGXgY8BlIGMwZfBk4GTgYwBlEGVQZLBlIGOgZZBlsGOwZUBmQGRgY5BkoGPQZvBlgGagZaBlUGPwZVBmAGXQZGBjkGaAZpBjoGUQZIBlYGXwYxBkIGYgZTBlQGPgYoBkAGWgYqBkkGTwYiBicGGwYoBjEGKQY7Bh4GNQYkBj0GIQY0BgYGBwYeBv0FCwYKBvUF8QUaBvAF9QURBukF5AXkBQAG2QXsBeQFxgXdBdAFwgXGBbcF1gW8BcEFwgWcBbEFsAWOBaIFnwV5BYEFigVtBX4FcQVtBWYFawVWBVsFZwVEBUoFVgU2BTEFHQUzBSEFKwUwBREFDwXyBBIF+gT2BPwE1gTnBPAEyQTJBNAEwgStBLMEsgSYBKQEjQSXBH0EcAR3BGkEbgRYBEkEPgRRBE8EPQQ0BBIEKgT/AxQEFAToA+MDAQTpA80DxwPVA9gDywOgA7wDkgOuA4UDiQOVA4cDewN0A0QDZAM8A1MDPgMmAyADEgMWAx4DAwP5AvMC+QLwAtgCvALHAswCwAKjAokCgAKLAmcCawJmAnMCRAJDAkMCKgInAjACFQIHAhYC8QH4AeoB0wHJAckB0gHLAcIBjgGKAXoBlQGLAWgBagFpAWIBSgEyAUEBOwEQAQsBDgEPAf0A8ADuANgAyAC8AL0ApQCwAJQAngCcAG8AeAB+AG0AVQA+ADUAOgAZAC0AIgAeABMA///x//f/5//d/7z/w/+n/6b/pf+S/5D/d/+G/2j/cP9N/1L/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Kv8u/zD/NP82/zn/PP8+/0L/Rf9H/0v/Tv9R/1X/V/9a/13/Yf9l/2j/a/9u/3H/dP94/3z/f/+C/4b/if+M/5D/k/+X/5v/nv+h/6X/qP+s/6//sv+2/7r/vv/B/8X/yP/M/8//0//X/9r/3v/i/+X/6f/t//D/9P/3//v///8BAAUACAAMABAAEwAXABoAHgAiACUAKQAsADAAMwA3ADoAPgBBAEQASABLAE8AUgBWAFkAXABgAGIAZgBqAGwAbwBzAHYAeQB8AH8AgwCGAIkAjACPAJEAlACXAJoAnQCgAKMApgCoAKsArgCxALMAtQC4ALsAvQDAAMIAxQDHAMkAzADOANAA0wDUANcA2QDbAN0A3wDhAOMA5QDnAOkA6gDsAO4A8ADxAPMA9AD2APcA+QD6APwA/QD+AP8AAAEBAQIBAwEFAQUBBwEHAQgBCQEKAQsBDAEMAQ0BDQEOAQ4BDgEPAQ8BDwEPARABEAEQARABEQERARABEAEQARABEAEQAQ8BDwEOAQ8BDgENAQ0BDQEMAQsBCgEJAQkBCAEHAQYBBQEEAQMBAgEBAQAB/wD9APwA+wD6APkA9wD2APQA8wDxAO8A7gDsAOsA6QDnAOUA4wDhAOAA3gDcANoA2ADWANQA0QDPAM0AywDIAMYAxADCAL8AvQC7ALgAtQCzALEArgCrAKkApgCjAKEAnwCcAJkAlgCUAJEAjgCLAIgAhQCCAIAAfQB6AHcAdABxAG4AawBoAGUAYgBfAFwAWQBWAFIATwBMAEkARgBCAD8APQA5ADYAMwAvAC0AKgAmACMAIAAdABkAFgATABAADAAJAAYAAwAAAP7/+v/3//T/8f/u/+v/5//l/+H/3v/b/9j/1P/S/87/zP/I/8X/wv+//7z/uv+3/7P/sf+u/6v/qP+l/6L/n/+c/5r/l/+U/5H/jv+M/4n/h/+E/4H/f/98/3r/d/90/3L/cP9t/2v/aP9m/2T/Yf9f/13/W/9Z/1b/VP9S/1D/Tv9M/0r/Sf9H/0T/Q/9B/z//Pf88/zr/OP83/zX/M/8y/zH/L/8u/yz/K/8q/yj/J/8m/yX/JP8j/yH/If8g/x//Hv8d/xz/G/8b/xr/Gf8Z/xj/GP8X/xb/Fv8W/xX/Ff8V/xT/FP8U/xT/FP8U/xP/FP8U/xT/FP8U/xT/Ff8V/xX/Fv8W/xb/F/8X/xj/GP8Z/xr/Gv8b/xz/Hf8d/x7/H/8g/yH/Iv8j/yT/Jf8m/yf/Kf8q/yv/Lf8u/y//Mf8y/zT/Nf83/zj/Ov87/z3/P/9B/0L/RP9G/0j/Sv9L/03/T/9R/1P/Vf9X/1r/XP9e/2D/Yv9k/2f/af9r/23/cP9y/3T/dv95/3v/fv+A/4L/hf+I/4r/jf+P/5H/lP+X/5n/nP+f/6L/pP+n/6r/rP+v/7H/tP+3/7r/vf+//8L/xf/I/8r/zf/Q/9P/1f/Y/9v/3v/h/+T/5//p/+z/7//y//X/9//6//3/AAACAAQABwAKAA0AEAASABUAGAAbAB0AIAAjACYAKQArAC4AMQAzADYAOQA7AD4AQQBDAEYASABLAE0AUABTAFUAVwBaAFwAXwBhAGQAZgBoAGsAbQBvAHIAdAB2AHgAewB9AH8AgQCDAIUAhwCJAIsAjQCPAJEAkwCVAJcAmQCaAJwAngCfAKEAowClAKYAqACpAKsArACuAK8AsACyALMAtQC2ALcAuAC6ALsAuwC9AL4AvwDAAMEAwgDCAMMAxADFAMUAxgDHAMgAyADJAMkAygDKAMsAywDLAMwAzADNAM0AzQDNAM0AzQDOAM0AzQDNAM0AzQDNAM0AzQDMAMwAzADMAMsAywDKAMoAygDJAMgAyADHAMYAxgDFAMQAwwDDAMIAwQDAAL8AvgC9ALwAuwC6ALkAuAC2ALUAtACyALEAsACuAK0ArACqAKkApwCmAKQAogChAJ8AnQCcAJoAmACXAJUAkwCSAJAAjgCMAIoAiACGAIQAggCAAH4AfAB6AHgAdgB0AHIAbwBtAGsAaQBmAGQAYgBgAF0AWwBZAFcAVABSAFAATQBLAEgARgBEAEEAPwA8ADoAOAA1ADMAMAAuACsAKQAmACQAIgAfAB0AGgAYABUAEwAQAA4ACwAJAAYABAABAAAA/f/7//j/9v/z//H/7v/s/+n/5//l/+L/4P/d/9v/2P/W/9T/0f/P/83/y//I/8b/w//B/7//vP+6/7j/tv+0/7L/r/+t/6v/qf+n/6X/o/+h/5//nf+b/5n/l/+V/5P/kf+P/43/jP+K/4j/hv+E/4P/gf9//37/fP96/3n/d/92/3T/c/9x/3D/bv9t/2z/a/9p/2j/Z/9l/2T/Y/9i/2H/YP9f/17/Xf9c/1v/Wv9Z/1j/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7v/u/+3/7P/r/+r/6f/o/+j/5//m/+X/5P/k/+P/4v/h/+H/4P/f/97/3v/d/9z/2//b/9r/2f/Z/9j/1//X/9b/1f/V/9T/0//T/9L/0v/R/9D/0P/P/8//zv/O/83/zf/M/8z/y//L/8r/yv/K/8n/yf/I/8j/yP/H/8f/x//G/8b/xv/F/8X/xf/F/8T/xP/E/8T/xP/D/8P/w//D/8P/w//D/8L/wv/C/8L/wv/C/8L/wv/C/8L/wv/C/8L/wv/C/8L/w//D/8P/w//D/8P/w//D/8T/xP/E/8T/xf/F/8X/xf/G/8b/xv/G/8f/x//H/8j/yP/J/8n/yf/K/8r/y//L/8v/zP/M/83/zf/O/87/z//P/9D/0P/R/9H/0v/T/9P/1P/U/9X/1v/W/9f/1//Y/9n/2f/a/9v/2//c/93/3f/e/9//3//g/+H/4v/i/+P/5P/l/+X/5v/n/+j/6P/p/+r/6//r/+z/7f/u/+//7//w//H/8v/z//P/9P/1//b/9//3//j/+f/6//v/+//8//3//v///wAAAAAAAAEAAgADAAMABAAFAAYABwAHAAgACQAKAAoACwAMAA0ADgAOAA8AEAARABEAEgATABQAFAAVABYAFwAXABgAGQAZABoAGwAbABwAHQAdAB4AHwAfACAAIQAhACIAIgAjACQAJAAlACUAJgAmACcAKAAoACkAKQAqACoAKwArACwALAAsAC0ALQAuAC4ALwAvAC8AMAAwADAAMQAxADEAMgAyADIAMwAzADMAMwA0ADQANAA0ADUANQA1ADUANQA1ADYANgA2ADYANgA2ADYANgA2ADYANgA2ADYANgA2ADYANgA2ADYANgA2ADYANgA2ADYANgA1ADUANQA1ADUANQA0ADQANAA0ADQAMwAzADMAMgAyADIAMgAxADEAMQAwADAAMAAvAC8ALwAuAC4ALQAtACwALAAsACsAKwAqACoAKQApACgAKAAnACcAJgAmACUAJQAkACQAIwAiACIAIQAhACAAHwAfAB4AHgAdABwAHAAbABoAGgAZABkAGAAXABcAFgAVABUAFAATABIAEgARABAAEAAPAA4ADgANAAwACwALAAoACQAJAAgABwAHAAYABQAEAAQAAwACAAEAAQAAAAAAAAD///7//f/9//z/+//7//r/+f/5//j/9//2//b/9f/0//T/8//y//L/8f/w//D/7//u/+7/7f/t/+z/6//r/+r/6f/p/+j/6P/n/+b/5v/l/+X/5P/k/+P/4//i/+H/4f/g/+D/3//f/97/3v/d/93/3f/c/9z/2//b/9r/2v/a/9n/2f/Y/9j/2P/X/9f/1//W/9b/1v/V/9X/1f/U/9T/1P/U/9P/0//T/9P/0v/S/9L/0v/S/9L/0f/R/9H/0f/R/9H/0f/R/9H/0P/Q/9D/0P/Q/9D/0P/Q/9D/0P/Q/9D/0P/Q/9D/0f/R/9H/0f/R/9H/0f/R/9H/0v/S/9L/0v/S/9P/0//T/9P/0//U/9T/1P/U/9X/1f/V/9b/1v/W/9b/1//X/9f/2P/Y/9n/2f/Z/9r/2v/b/9v/2//c/9z/3f/d/97/3v/e/9//3//g/+D/4f/h/+L/4v/j/+P/5P/k/+X/5f/m/+f/5//o/+j/6f/p/+r/6//r/+z/7P/t/+3/7v/v/+//8P/w//H/8v/y//P/9P/0//X/9f/2//f/9//4//n/+f/6//r/+//8//z//f/+//7//////wAAAAAAAAEAAgACAAMABAAEAAUABQAGAAcABwAIAAgACQAKAAoACwALAAwADQANAA4ADgAPABAAEAARABEAEgASABMAEwAUABQAFQAWABYAFwAXABgAGAAZABkAGgAaABsAGwAbABwAHAAdAB0AHgAeAB4AHwAfACAAIAAgACEAIQAiACIAIgAjACMAIwAkACQAJAAlACUAJQAlACYAJgAmACYAJwAnACcAJwAoACgAKAAoACgAKAApACkAKQApACkAKQApACkAKgAqACoAKgAqACoAKgAqACoAKgAqACoAKgAqACoAKgAqACoAKgAqACoAKgApACkAKQApACkAKQApACkAKAAoACgAKAAoACcAJwAnACcAJwAmACYAJgAmACUAJQAlACUAJAAkACQAIwAjACMAIgAiACIAIQAhACEAIAAgACAAHwAfAB4AHgAeAB0AHQAcABwAGwAbABsAGgAaABkAGQAYABgAFwAXABYAFgAVABUAFAAUABMAEwASABIAEQARABAAEAAPAA8ADgAOAA0ADQAMAAwACwAKAAoACQAJAAgACAAHAAcABgAFAAUABAAEAAMAAwACAAIAAQAAAAAAAAAAAP/////+//7//f/8//z/+//7//r/+v/5//n/+P/4//f/9//2//b/9f/0//T/8//z//L/8v/x//H/8P/w/+//7//v/+7/7v/t/+3/7P/s/+v/6//q/+r/6v/p/+n/6P/o/+j/5//n/+b/5v/m/+X/5f/k/+T/5P/j/+P/4//i/+L/4v/i/+H/4f/h/+D/4P/g/+D/3//f/9//3//e/97/3v/e/97/3f/d/93/3f/d/93/3P/c/9z/3P/c/9z/3P/c/9z/3P/b/9v/2//b/9v/2//b/9v/2//b/9v/2//b/9v/2//b/9v/2//b/9v/3P/c/9z/3P/c/9z/3P/c/9z/3f/d/93/3f/d/93/3v/e/97/3v/e/97/3//f/9//3//g/+D/4P/g/+H/4f/h/+L/4v/i/+L/4//j/+P/5P/k/+T/5f/l/+X/5v/m/+b/5//n/+j/6P/o/+n/6f/q/+r/6v/r/+v/7P/s/+z/7f/t/+7/7v/v/+//8P/w//D/8f/x//L/8v/z//P/9P/0//X/9f/2//b/9//3//j/+P/4//n/+f/6//r/+//7//z//P/9//3//v/+//////8AAAAAAAAAAAEAAQACAAIAAwADAAQABAAFAAUABgAGAAcABwAIAAgACAAJAAkACgAKAAsACwAMAAwADQANAA0ADgAOAA8ADwAQABAAEAARABEAEgASABIAEwATABQAFAAUABUAFQAVABYAFgAWABcAFwAXABgAGAAYABkAGQAZABoAGgAaABoAGwAbABsAGwAcABwAHAAcAB0AHQAdAB0AHQAeAB4AHgAeAB4AHgAfAB8AHwAfAB8AHwAfACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAHwAfAB8AHwAfAB8AHwAfAB4AHgAeAB4AHgAdAB0AHQAdAB0AHAAcABwAHAAcABsAGwAbABsAGgAaABoAGgAZABkAGQAYABgAGAAXABcAFwAWABYAFgAWABUAFQAUABQAFAATABMAEwASABIAEgARABEAEAAQABAADwAPAA8ADgAOAA0ADQAMAAwADAALAAsACgAKAAoACQAJAAgACAAHAAcABwAGAAYABQAFAAQABAAEAAMAAwACAAIAAQABAAEAAAAAAAAAAAD////////+//7//f/9//z//P/8//v/+//6//r/+f/5//n/+P/4//f/9//3//b/9v/1//X/9f/0//T/8//z//P/8v/y//L/8f/x//H/8P/w//D/7//v/+//7v/u/+7/7f/t/+3/7P/s/+z/6//r/+v/6//q/+r/6v/q/+n/6f/p/+n/6P/o/+j/6P/n/+f/5//n/+f/5v/m/+b/5v/m/+b/5f/l/+X/5f/l/+X/5f/l/+T/5P/k/+T/5P/k/+T/5P/k/+T/5P/k/+T/5P/k/+T/5P/k/+T/5P/k/+T/5P/k/+T/5P/k/+T/5P/k/+T/5P/k/+T/5P/k/+T/5P/l/+X/5f/l/+X/5f/l/+X/5v/m/+b/5v/m/+b/5//n/+f/5//n/+j/6P/o/+j/6P/p/+n/6f/p/+r/6v/q/+r/6//r/+v/6//s/+z/7P/t/+3/7f/t/+7/7v/u/+//7//v//D/8P/w//H/8f/x//L/8v/y//P/8//z//T/9P/0//X/9f/2//b/9v/3//f/9//4//j/+P/5//n/+v/6//r/+//7//z//P/8//3//f/9//7//v////////8AAAAAAAAAAAAAAQABAAEAAgACAAMAAwADAAQABAAEAAUABQAGAAYABgAHAAcABwAIAAgACAAJAAkACQAKAAoACgALAAsACwAMAAwADAANAA0ADQAOAA4ADgAPAA8ADwAPABAAEAAQABEAEQARABEAEgASABIAEgATABMAEwATABQAFAAUABQAFAAVABUAFQAVABUAFgAWABYAFgAWABYAFwAXABcAFwAXABcAFwAYABgAGAAYABgAGAAYABgAGAAYABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAYABgAGAAYABgAGAAYABgAGAAYABcAFwAXABcAFwAXABcAFgAWABYAFgAWABYAFQAVABUAFQAVABUAFAAUABQAFAATABMAEwATABMAEgASABIAEgARABEAEQARABAAEAAQABAADwAPAA8ADgAOAA4ADgANAA0ADQAMAAwADAALAAsACwALAAoACgAKAAkACQAJAAgACAAIAAcABwAHAAYABgAGAAUABQAFAAQABAAEAAMAAwADAAIAAgACAAEAAQABAAAAAAAAAAAAAAAAAP////////7//v/+//3//f/9//z//P/8//v/+//7//r/+v/6//n/+f/5//j/+P/4//j/9//3//f/9v/2//b/9f/1//X/9f/0//T/9P/0//P/8//z//L/8v/y//L/8f/x//H/8f/x//D/8P/w//D/7//v/+//7//v/+7/7v/u/+7/7v/u/+3/7f/t/+3/7f/t/+z/7P/s/+z/7P/s/+z/6//r/+v/6//r/+v/6//r/+v/6//r/+r/6v/q/+r/6v/q/+r/6v/q/+r/6v/q/+r/6v/q/+r/6v/q/+r/6v/q/+r/6v/q/+r/6v/q/+r/6v/q/+r/6//r/+v/6//r/+v/6//r/+v/6//r/+z/7P/s/+z/7P/s/+z/7f/t/+3/7f/t/+3/7f/u/+7/7v/u/+7/7//v/+//7//v/+//8P/w//D/8P/x//H/8f/x//H/8v/y//L/8v/z//P/8//z//T/9P/0//T/9f/1//X/9f/2//b/9v/3//f/9//3//j/+P/4//j/+f/5//n/+v/6//r/+//7//v/+//8//z//P/9//3//f/9//7//v/+/////////wAAAAAAAAAAAAAAAAAAAQABAAEAAgACAAIAAgADAAMAAwAEAAQABAAEAAUABQAFAAYABgAGAAYABwAHAAcABwAIAAgACAAJAAkACQAJAAoACgAKAAoACgALAAsACwALAAwADAAMAAwADQANAA0ADQANAA4ADgAOAA4ADgAPAA8ADwAPAA8ADwAQABAAEAAQABAAEAARABEAEQARABEAEQARABEAEgASABIAEgASABIAEgASABIAEgATABMAEwATABMAEwATABMAEwATABMAEwATABMAEwATABMAEwATABMAEwATABMAEwATABMAEwATABMAEwATABMAEwATABMAEwATABMAEwATABMAEgASABIAEgASABIAEgASABIAEgARABEAEQARABEAEQARABEAEAAQABAAEAAQABAADwAPAA8ADwAPAA8ADgAOAA4ADgAOAA4ADQANAA0ADQANAAwADAAMAAwACwALAAsACwALAAoACgAKAAoACQAJAAkACQAIAAgACAAIAAcABwAHAAcABgAGAAYABgAFAAUABQAFAAQABAAEAAQAAwADAAMAAwACAAIAAgACAAEAAQABAAAAAAAAAAAAAAAAAAAAAAD///////////7//v/+//7//f/9//3//f/8//z//P/8//v/+//7//v/+v/6//r/+v/5//n/+f/5//j/+P/4//j/+P/3//f/9//3//f/9v/2//b/9v/1//X/9f/1//X/9f/0//T/9P/0//T/8//z//P/8//z//P/8//y//L/8v/y//L/8v/y//H/8f/x//H/8f/x//H/8f/w//D/8P/w//D/8P/w//D/8P/w//D/8P/w/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v/+//7//v//D/8P/w//D/8P/w//D/8P/w//D/8P/w//D/8f/x//H/8f/x//H/8f/x//H/8v/y//L/8v/y//L/8v/z//P/8//z//P/8//z//T/9P/0//T/9P/0//X/9f/1//X/9f/2//b/9v/2//b/9v/3//f/9//3//f/+P/4//j/+P/5//n/+f/5//n/+v/6//r/+v/6//v/+//7//v//P/8//z//P/9//3//f/9//3//v/+//7//v///////////wAAAAAAAAAAAAAAAAAAAAAAAAEAAQABAAEAAgACAAIAAgACAAMAAwADAAMABAAEAAQABAAEAAUABQAFAAUABQAGAAYABgAGAAcABwAHAAcABwAIAAgACAAIAAgACAAJAAkACQAJAAkACgAKAAoACgAKAAoACgALAAsACwALAAsACwAMAAwADAAMAAwADAAMAAwADQANAA0ADQANAA0ADQANAA0ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA4ADgAOAA0ADQANAA0ADQANAA0ADQANAAwADAAMAAwADAAMAAwADAALAAsACwALAAsACwALAAoACgAKAAoACgAKAAoACQAJAAkACQAJAAkACAAIAAgACAAIAAcABwAHAAcABwAHAAYABgAGAAYABgAFAAUABQAFAAUABAAEAAQABAAEAAMAAwADAAMAAwACAAIAAgACAAIAAQABAAEAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAA//////////////7//v/+//7//v/9//3//f/9//3//P/8//z//P/8//v/+//7//v/+//7//r/+v/6//r/+v/5//n/+f/5//n/+f/4//j/+P/4//j/+P/4//f/9//3//f/9//3//f/9v/2//b/9v/2//b/9v/2//X/9f/1//X/9f/1//X/9f/1//X/9P/0//T/9P/0//T/9P/0//T/9P/0//T/9P/z//P/8//z//P/8//z//P/8//z//P/8//z//P/8//z//P/8//z//P/8//z//P/8//z//P/8//z//P/8//z//P/8//z//P/8//z//P/8//z//P/8//0//T/9P/0//T/9P/0//T/9P/0//T/9P/0//T/9f/1//X/9f/1//X/9f/1//X/9f/2//b/9v/2//b/9v/2//b/9//3//f/9//3//f/9//4//j/+P/4//j/+P/4//n/+f/5//n/+f/5//n/+v/6//r/+v/6//r/+//7//v/+//7//v//P/8//z//P/8//3//f/9//3//f/9//7//v/+//7//v/+//////////////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQABAAEAAQA=");
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
    
    // Play the pop sound to force iOS to unlock HTML5 audio context
    // We don't pause it immediately, as that breaks iOS Safari. 
    // It will just play a pop sound when joining, which is good UX anyway!
    playPopSound();
    
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
