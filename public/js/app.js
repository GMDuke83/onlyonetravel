/* ==========================================================================
   ONLYONE LUXURY TRAVEL — app.js
   Vanilla JS, no framework, no build step.

   Intro sequence
   --------------
     video starts (autoplay + muted)
       └─ at 3.0s of playback → countdown 3 · 2 · 1
            └─ "Your Journey Begins Now"
                 └─ ~1.8s hold → soft transition to the main experience

   Audio
   -----
   The ocean is the video's own audio track. There is no synthesised audio.
   Browsers only allow an unmuted autoplay after a user gesture, so the first
   tap on the hero unmutes and replays the intro from 0:00 with sound.

   Leaving the intro always pauses, mutes and rewinds the video, so the ocean
   can never bleed into the next page.
   ========================================================================== */

(function () {
  'use strict';

  /* ---- configuration ---------------------------------------------------- */
  var COUNTDOWN_START_AT = 3.0;   // seconds of playback before the countdown
  var COUNTDOWN_FROM     = 3;     // 3 · 2 · 1
  var COUNTDOWN_STEP_MS  = 1000;
  var END_TITLE_HOLD_MS  = 1800;  // pause on "Your Journey Begins Now"
  var FLASH_MS           = 380;
  var AUTOPLAY_PROBE_MS  = 1800;
  var STALL_OFFER_HELP_S = 4;     // no progress this long → offer a start button
  var STALL_GIVE_UP_S    = 8;     // still nothing → run the sequence anyway

  /* ---- elements --------------------------------------------------------- */
  var intro        = document.getElementById('intro');
  var video        = document.getElementById('heroVideo');
  var introCopy    = document.getElementById('introCopy');
  var introEnd     = document.getElementById('introEnd');
  var introFlash   = document.getElementById('introFlash');
  var countdown    = document.getElementById('countdown');
  var countValue   = document.getElementById('countdownValue');
  var tapStart     = document.getElementById('tapStart');
  var tapStartBtn  = document.getElementById('tapStartBtn');
  var soundToggle  = document.getElementById('soundToggle');
  var skipIntro    = document.getElementById('skipIntro');
  var main         = document.getElementById('main');
  var mainScroll   = document.getElementById('mainScroll');
  var marinaVideo  = document.getElementById('marinaVideo');
  var replayIntro  = document.getElementById('replayIntro');
  var toast        = document.getElementById('toast');

  if (!intro || !video || !main) return;

  /* ---- state ------------------------------------------------------------ */
  var seqStarted   = false;   // countdown running or finished
  var leaving      = false;   // transition to main in flight
  var onMain       = false;   // main experience is showing
  var audioUnlocked= false;   // a gesture has allowed unmuted playback
  var wantSound    = false;   // user's preference — survives page switches
  var countTimer   = null;
  var holdTimer    = null;
  var probeTimer   = null;
  var stallTimer   = null;
  var stallSeconds = 0;

  /* ======================================================================
     Helpers
     ====================================================================== */

  function showToast(message) {
    if (!toast || !message) return;
    toast.textContent = message;
    toast.classList.add('is-in');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () {
      toast.classList.remove('is-in');
    }, 1700);
  }

  // restart a CSS animation reliably
  function retrigger(el, className) {
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  }

  function clearTimers() {
    if (countTimer) { clearInterval(countTimer); countTimer = null; }
    if (holdTimer)  { clearTimeout(holdTimer);   holdTimer  = null; }
    if (probeTimer) { clearTimeout(probeTimer);  probeTimer = null; }
    stopStallWatchdog();
  }

  /* --------------------------------------------------------------------
     Watchdog

     A browser that cannot decode the file still reports `paused === false`
     after play() — nothing throws, `currentTime` simply never advances and
     `timeupdate` never fires. Without this the visitor would sit on the
     poster frame forever, because the countdown is driven by playback
     position. So: watch real progress, offer a manual start, and if the
     video truly never runs, play the sequence anyway rather than strand
     anyone on the intro.
     -------------------------------------------------------------------- */
  function stopStallWatchdog() {
    if (stallTimer) { clearInterval(stallTimer); stallTimer = null; }
  }

  function startStallWatchdog() {
    stopStallWatchdog();
    stallSeconds = 0;

    stallTimer = setInterval(function () {
      if (leaving || onMain || seqStarted) { stopStallWatchdog(); return; }

      // real progress — the video is fine, stand down
      if (video.currentTime > 0.3) { stopStallWatchdog(); return; }

      stallSeconds += 1;

      if (stallSeconds === STALL_OFFER_HELP_S) showTapStart();

      if (stallSeconds >= STALL_GIVE_UP_S) {
        stopStallWatchdog();
        startSequence();
      }
    }, 1000);
  }

  /* ======================================================================
     Sound — the video's own track, nothing synthesised
     ====================================================================== */

  function reflectSoundUi() {
    if (!soundToggle) return;
    var on = !video.muted && wantSound;
    soundToggle.classList.toggle('is-on', on);
    soundToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    soundToggle.setAttribute('aria-label', on ? 'Mute ocean sound' : 'Enable ocean sound');
  }

  // Must run synchronously inside a user gesture on iOS.
  function enableSound() {
    wantSound = true;
    audioUnlocked = true;
    video.muted = false;
    video.removeAttribute('muted');
    video.volume = 1;
    reflectSoundUi();
  }

  function muteSound() {
    video.muted = true;
    video.setAttribute('muted', '');
    reflectSoundUi();
  }

  /* ======================================================================
     Intro sequence
     ====================================================================== */

  function resetSequence() {
    clearTimers();
    seqStarted = false;
    leaving = false;

    if (introCopy)  introCopy.classList.remove('is-out');
    if (introEnd)   introEnd.classList.remove('is-in');
    if (introFlash) introFlash.classList.remove('is-in');
    if (countdown)  countdown.classList.remove('is-in', 'is-ticking');
    if (countValue) countValue.textContent = String(COUNTDOWN_FROM);
    if (tapStart)   tapStart.classList.remove('is-in');
  }

  function startSequence() {
    if (seqStarted || leaving) return;
    seqStarted = true;

    var remaining = COUNTDOWN_FROM;

    if (introCopy) introCopy.classList.add('is-out');
    if (countdown) countdown.classList.add('is-in');

    function draw() {
      if (countValue) countValue.textContent = String(remaining);
      retrigger(countdown, 'is-ticking');
    }

    draw();

    countTimer = setInterval(function () {
      remaining -= 1;

      if (remaining > 0) {
        draw();
        return;
      }

      clearInterval(countTimer);
      countTimer = null;

      // countdown done → hide it, reveal the end title
      if (countdown) countdown.classList.remove('is-in', 'is-ticking');
      if (introEnd) {
        introEnd.classList.add('is-in');
        introEnd.setAttribute('aria-hidden', 'false');
      }

      holdTimer = setTimeout(goToMain, END_TITLE_HOLD_MS);
    }, COUNTDOWN_STEP_MS);
  }

  /* ======================================================================
     Intro → Main
     ====================================================================== */

  function stopHeroVideo() {
    // §13: leaving the intro always kills the ocean.
    try { video.pause(); } catch (e) {}
    muteSound();
    try { video.currentTime = 0; } catch (e) {}
  }

  /* The page-two banner is silent by construction — its audio track was
     stripped when it was encoded, so it cannot carry sound into the main
     experience no matter what the element's muted flag says. */
  function startMarina() {
    if (!marinaVideo) return;
    marinaVideo.muted = true;
    if (marinaVideo.preload === 'none') {
      marinaVideo.preload = 'auto';
      try { marinaVideo.load(); } catch (e) {}
    }
    var p = marinaVideo.play();
    if (p && typeof p.catch === 'function') p.catch(function () {});
  }

  function stopMarina() {
    if (!marinaVideo) return;
    try { marinaVideo.pause(); } catch (e) {}
  }

  function goToMain() {
    if (leaving || onMain) return;
    leaving = true;
    clearTimers();

    if (introFlash) introFlash.classList.add('is-in');

    setTimeout(function () {
      stopHeroVideo();

      onMain = true;
      main.classList.add('is-active');
      main.setAttribute('aria-hidden', 'false');
      intro.classList.add('is-leaving');
      intro.setAttribute('aria-hidden', 'true');

      // fully remove the intro from the a11y tree and paint order
      setTimeout(function () {
        if (!onMain) return;
        intro.classList.add('is-hidden');
        if (introFlash) introFlash.classList.remove('is-in');
      }, 700);

      if (mainScroll) mainScroll.scrollTop = 0;
      startMarina();
    }, FLASH_MS);
  }

  /* ======================================================================
     Main → Intro  (§14: everything resets, the intro plays again)
     ====================================================================== */

  function backToIntro() {
    if (!onMain) return;
    onMain = false;

    stopMarina();
    main.classList.remove('is-active');
    main.setAttribute('aria-hidden', 'true');

    intro.classList.remove('is-hidden');
    // force a reflow so the opacity transition runs from the hidden state
    void intro.offsetWidth;
    intro.classList.remove('is-leaving');
    intro.setAttribute('aria-hidden', 'false');
    if (introEnd) introEnd.setAttribute('aria-hidden', 'true');

    resetSequence();

    // Audio was already unlocked by a gesture, and this *is* a gesture,
    // so the ocean may come back if the user wanted it.
    if (audioUnlocked && wantSound) {
      video.muted = false;
      video.volume = 1;
    } else {
      muteSound();
    }
    reflectSoundUi();

    playFromStart();
  }

  /* ======================================================================
     Playback
     ====================================================================== */

  function playFromStart() {
    try { video.currentTime = 0; } catch (e) {}

    startStallWatchdog();

    var p = video.play();
    if (p && typeof p.then === 'function') {
      p.then(function () {
        if (tapStart) tapStart.classList.remove('is-in');
      }).catch(function () {
        // Unmuted playback was refused — fall back to muted autoplay.
        if (!video.muted) {
          muteSound();
          wantSound = false;
          var retry = video.play();
          if (retry && typeof retry.catch === 'function') {
            retry.catch(function () { showTapStart(); });
          }
        } else {
          showTapStart();
        }
      });
    }
  }

  function showTapStart() {
    if (leaving || onMain) return;
    if (tapStart) tapStart.classList.add('is-in');
  }

  /* ======================================================================
     Events
     ====================================================================== */

  // countdown is driven by real playback position, not by a wall clock
  video.addEventListener('timeupdate', function () {
    if (!seqStarted && !leaving && video.currentTime >= COUNTDOWN_START_AT) {
      startSequence();
    }
  });

  // safety net: if the file ends before the sequence ran, run it anyway
  video.addEventListener('ended', function () {
    if (!seqStarted && !leaving) startSequence();
  });

  video.addEventListener('playing', function () {
    if (tapStart) tapStart.classList.remove('is-in');
  });

  video.addEventListener('error', showTapStart);

  // A failing <source> fires its error on the source element, not the video.
  var heroSource = video.querySelector('source');
  if (heroSource) heroSource.addEventListener('error', showTapStart);

  /* --- first tap on the hero: unlock sound, replay with the ocean -------- */
  intro.addEventListener('click', function (event) {
    if (leaving || onMain) return;
    // the toggle, skip and fallback buttons own their own gestures
    if (event.target.closest('#soundToggle, #tapStart, #skipIntro')) return;

    if (!audioUnlocked) {
      enableSound();
      resetSequence();
      playFromStart();          // §12: from 0:00, ocean audible
      showToast('Ocean sound on');
    }
  });

  /* --- explicit sound toggle -------------------------------------------- */
  if (soundToggle) {
    soundToggle.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();

      if (video.muted) {
        enableSound();
        if (video.paused) playFromStart();
        showToast('Ocean sound on');
      } else {
        wantSound = false;
        muteSound();
        showToast('Sound off');
      }
    });
  }

  /* --- autoplay fallback button ----------------------------------------- */
  if (tapStartBtn) {
    tapStartBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      enableSound();
      resetSequence();
      playFromStart();
    });
  }

  /* --- skip -------------------------------------------------------------- */
  if (skipIntro) {
    skipIntro.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      goToMain();
    });
  }

  /* --- back to the intro from the main experience ------------------------ */
  if (replayIntro) {
    replayIntro.addEventListener('click', function (event) {
      event.preventDefault();
      backToIntro();
    });
  }

  /* --- placeholder taps -------------------------------------------------- */
  document.addEventListener('click', function (event) {
    var el = event.target.closest('[data-toast]');
    if (el) showToast(el.getAttribute('data-toast'));
  });

  /* --- tabbar ------------------------------------------------------------ */
  var tabItems = Array.prototype.slice.call(document.querySelectorAll('.tabbar__item'));
  tabItems.forEach(function (item) {
    item.addEventListener('click', function () {
      var target = document.getElementById(item.getAttribute('data-target'));
      if (target && mainScroll) {
        mainScroll.scrollTo({ top: target.offsetTop - 8, behavior: 'smooth' });
      }
    });
  });

  // reflect the section currently in view
  if (mainScroll && 'IntersectionObserver' in window) {
    var sections = Array.prototype.slice.call(mainScroll.querySelectorAll('.section'));
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = entry.target.id;
        tabItems.forEach(function (item) {
          item.classList.toggle('is-active', item.getAttribute('data-target') === id);
        });
      });
    }, { root: mainScroll, threshold: 0.45 });
    sections.forEach(function (s) { spy.observe(s); });
  }

  /* --- never let the ocean play in a background tab ---------------------- */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      try { video.pause(); } catch (e) {}
      stopMarina();
    } else if (onMain) {
      startMarina();
    } else if (!leaving && video.paused) {
      var p = video.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    }
  });

  /* --- restoring from the bfcache ---------------------------------------- */
  window.addEventListener('pageshow', function (event) {
    if (event.persisted && !onMain) {
      resetSequence();
      playFromStart();
    }
  });

  /* ======================================================================
     Boot
     ====================================================================== */

  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  reflectSoundUi();

  playFromStart();

  // If autoplay never got going, offer the explicit start button.
  probeTimer = setTimeout(function () {
    if (video.paused && video.currentTime < 0.15) showTapStart();
  }, AUTOPLAY_PROBE_MS);

})();
