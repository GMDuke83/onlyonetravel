/* ==========================================================================
   ONLYONE LUXURY TRAVEL — app.js
   Vanilla JS, no framework, no build step.

   Intro sequence
   --------------
     video starts (autoplay + muted)
       └─ at 3.0s of playback → countdown 3 · 2 · 1
            └─ "Your Journey Begins Now"
                 └─ ~1.8s hold → crossfade into the main experience

   The three numbers add up to the film: 3.0 + 3.0 + 1.8 lands at 7.8s against
   an 8.0s clip, so the sequence finishes as the last shot does instead of
   holding a frozen frame. They were briefly 2.0 and 1.2 for a six-second cut.

   Audio
   -----
   The intro video always autoplays muted. The original ocean soundtrack is
   mirrored into a separate <audio> element so iOS Safari can start it directly
   from the explicit sound control. The intro itself needs no start button in
   the normal path. All videos inside the website remain silent.
   ========================================================================== */

(function () {
  'use strict';

  /* ---- configuration ---------------------------------------------------- */
  var COUNTDOWN_START_AT = 3.0;   // seconds of playback before the countdown
  var COUNTDOWN_FROM     = 3;     // 3 · 2 · 1
  var COUNTDOWN_STEP_MS  = 1000;
  var END_TITLE_HOLD_MS  = 1800;  // pause on "Your Journey Begins Now"
  var CROSSFADE_MS       = 1000;  // must match .intro's opacity transition
  var AUTOPLAY_PROBE_MS  = 1200;
  var STALL_OFFER_HELP_S = 7;     // manual fallback only after a real autoplay failure
  /* Only counts while the video is provably dead — nothing decoded and nothing
     arriving. A slow download resets it and a blocked autoplay never reaches
     it, so this can stay short: a visitor whose file will never play should not
     stare at a poster for twenty seconds. */
  var STALL_GIVE_UP_S    = 9;

  /* ---- elements --------------------------------------------------------- */
  var intro        = document.getElementById('intro');
  var video        = document.getElementById('heroVideo');
  var oceanAudio   = document.getElementById('heroAudio');
  var introCopy    = document.getElementById('introCopy');
  var introEnd     = document.getElementById('introEnd');
  var countdown    = document.getElementById('countdown');
  var countValue   = document.getElementById('countdownValue');
  var tapStart     = document.getElementById('tapStart');
  var tapStartBtn  = document.getElementById('tapStartBtn');
  var soundToggle  = document.getElementById('soundToggle');
  var skipIntro    = document.getElementById('skipIntro');
  var main         = document.getElementById('main');

  if (!intro || !video || !main) return;

  /* ---- language --------------------------------------------------------
     The intro speaks the visitor's language too. Brand words stay Latin in
     every version — the wordmark and the script "Journey" are the mark, not
     copy — while everything around them translates. Same rule as the
     platform: an explicit choice in the app beats device detection. */
  var INTRO_I18N = {
    en: { kicker:'This is not just a trip',
          h:'This is your<br>Only One<em class="headline__script">Journey</em>',
          endT:'Your Journey<em>Begins Now</em>',
          skip:'Skip', start:'Start Journey', soundOn:'Enable ocean sound', soundOff:'Mute ocean sound' },
    de: { kicker:'Das ist nicht nur eine Reise',
          h:'Das ist deine<br>Only One<em class="headline__script">Journey</em>',
          endT:'Deine Reise<em>beginnt jetzt</em>',
          skip:'Überspringen', start:'Reise starten', soundOn:'Meeresrauschen einschalten', soundOff:'Meeresrauschen ausschalten' },
    ru: { kicker:'Это не просто поездка',
          h:'Это твоё<br>Only One<em class="headline__script">Journey</em>',
          endT:'Твоё путешествие<em>начинается сейчас</em>',
          skip:'Пропустить', start:'Начать путешествие', soundOn:'Включить шум моря', soundOff:'Выключить шум моря' },
    tr: { kicker:'Bu sadece bir seyahat değil',
          h:'Bu senin<br>Only One<em class="headline__script">Journey</em>',
          endT:'Seyahatin<em>şimdi başlıyor</em>',
          skip:'Atla', start:'Seyahati başlat', soundOn:'Deniz sesini aç', soundOff:'Deniz sesini kapat' },
    uk: { kicker:'Це не просто подорож',
          h:'Це твоя<br>Only One<em class="headline__script">Journey</em>',
          endT:'Твоя подорож<em>починається зараз</em>',
          skip:'Пропустити', start:'Почати подорож', soundOn:'Увімкнути шум моря', soundOff:'Вимкнути шум моря' }
  };
  function introLang(){
    try {
      var st = JSON.parse(localStorage.getItem('onlyone.state.v1'));
      if (st && st.lang && INTRO_I18N[st.lang]) return st.lang;
    } catch (e) {}
    try {
      var list = (navigator.languages && navigator.languages.length)
        ? navigator.languages : [navigator.language || ''];
      for (var i = 0; i < list.length; i++) {
        var base = String(list[i] || '').toLowerCase().split('-')[0];
        if (INTRO_I18N[base]) return base;
      }
    } catch (e) {}
    return 'ru';
  }
  (function applyIntroLang(){
    var L = INTRO_I18N[introLang()];
    var k = introCopy && introCopy.querySelector('.kicker');
    var h = introCopy && introCopy.querySelector('.headline');
    var e = introEnd && introEnd.querySelector('.intro__endTitle');
    if (k) k.textContent = L.kicker;
    if (h) h.innerHTML = L.h;
    if (e) e.innerHTML = L.endT;
    if (skipIntro) skipIntro.textContent = L.skip;
    if (tapStartBtn) tapStartBtn.lastChild.textContent = ' ' + L.start;
    document.documentElement.lang = introLang();
  })();

  /* ---- state ------------------------------------------------------------ */
  var seqStarted   = false;   // countdown running or finished
  var leaving      = false;   // transition to main in flight
  var onMain       = false;   // main experience is showing
  var audioUnlocked= false;   // a gesture has allowed unmuted playback this visit
  var wantSound    = false;   // the visitor's preference — remembered across visits
  var hintTimer    = null;

  /* The visitor's sound choice is remembered. It cannot make the browser
     autoplay with sound — that needs a gesture — but on a return visit we can
     at least *attempt* unmuted playback, which Android Chrome grants once the
     site has enough media engagement. iOS refuses, and we fall back silently. */
  var SOUND_KEY = 'onlyone.sound';
  function loadSoundPref(){
    try { return localStorage.getItem(SOUND_KEY) === 'on'; } catch (e) { return false; }
  }
  function saveSoundPref(on){
    try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch (e) {}
  }
  var countTimer   = null;
  var holdTimer    = null;
  var probeTimer   = null;
  var stallTimer   = null;
  var stallSeconds = 0;
  var autoplayFallbackReady = false; // keep the normal intro completely button-free

  /* ======================================================================
     Helpers
     ====================================================================== */

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

  /* How much of the file has arrived. Growing = the network is working and the
     visitor is simply on a slow connection, which is not a fault to route
     around. */
  function bufferedEnd() {
    try {
      var b = video.buffered;
      return b && b.length ? b.end(b.length - 1) : 0;
    } catch (e) { return 0; }
  }

  /* Main-page imagery must not compete with the intro video on mobile Safari.
     Warm only the first important frames after the intro is substantially
     buffered. This keeps the film continuous and still makes the first page
     feel immediate when the hand-over happens. */
  var homeWarmStarted = false;
  var HOME_WARM_IMAGES = [
    './images/hero/hero-06.webp','./images/hero/hero-03.webp','./images/hero/hero-04.webp',
    './images/worlds/beach.webp','./images/worlds/villas.webp',
    './images/worlds/groups-v2.webp','./images/worlds/events.webp',
    './images/excursions/exc-cappadocia.webp','./images/excursions/exc-pamukkale.webp'
  ];
  function prewarmHomeImages(){
    if (homeWarmStarted) return;
    homeWarmStarted = true;
    HOME_WARM_IMAGES.forEach(function(src){
      var im = new Image();
      try { im.decoding = 'async'; } catch (e) {}
      im.src = src;
    });
  }
  function maybePrewarmHomeImages(){
    if (homeWarmStarted) return;
    var dur = isFinite(video.duration) && video.duration > 1 ? video.duration : 8;
    var target = Math.max(4.5, Math.min(6.5, dur - 0.7));
    if (bufferedEnd() >= target) prewarmHomeImages();
  }

  function startStallWatchdog() {
    stopStallWatchdog();
    stallSeconds = 0;
    var lastBuffered = bufferedEnd();

    stallTimer = setInterval(function () {
      if (leaving || onMain || seqStarted) { stopStallWatchdog(); return; }

      // real progress — the video is fine, stand down
      if (video.currentTime > 0.3) { hideSoundHintKeepButton(); stopStallWatchdog(); return; }

      /* Playing, just not far enough in yet. The button must go now: on a
         phone that started the video by itself the offer had already been made
         a moment earlier, and leaving it up put a "Start Journey" button on
         top of a running intro. Only `playing` used to clear it, and by then
         the watchdog had often already shown it again. */
      if (!video.paused && video.readyState >= 3) { hideTapStart(); }

      /* Three different reasons the video is not running, and only one of them
         justifies moving on without it. Treating them alike is what sent
         visitors to the hero having seen no intro at all: the 8s deadline fired
         while the file was still downloading, or while it sat decoded and ready
         behind a blocked autoplay. */

      // 1. Decodable and ready, but autoplay was refused. Nothing is wrong —
      //    the visitor just has to touch the screen. Offer the button, keep
      //    quietly retrying, and never advance on our own: skipping the intro
      //    for someone whose phone could have played it is the worst outcome.
      if (video.readyState >= 2 && video.paused) {
        showTapStart();
        var again = video.play();
        if (again && typeof again.catch === 'function') again.catch(function () {});
        return;
      }

      // 2. Still arriving. Offer the button so the impatient have a way out,
      //    but hold the deadline open — a long clip on a slow connection is not
      //    a broken clip.
      var now = bufferedEnd();
      if (now > lastBuffered + 0.01) {
        lastBuffered = now;
        stallSeconds = 0;
        showTapStart();
        return;
      }

      // 3. Nothing decoded, nothing arriving. Now the clock runs.
      stallSeconds += 1;
      if (stallSeconds === STALL_OFFER_HELP_S) showTapStart();
      if (stallSeconds >= STALL_GIVE_UP_S) {
        stopStallWatchdog();
        startSequence();
      }
    }, 1000);
  }

  /* A hard media error is the one case where waiting cannot help: the file will
     never decode on this device, so move on rather than strand anyone. */
  function giveUpOnVideo() {
    if (leaving || onMain || seqStarted) return;
    showTapStart(true);
    stopStallWatchdog();
    setTimeout(function () {
      if (!seqStarted && !leaving && !onMain) startSequence();
    }, 1200);
  }

  /* ======================================================================
     Sound — the video's own track, nothing synthesised
     ====================================================================== */

  function reflectSoundUi() {
    if (!soundToggle) return;
    var on = !!(oceanAudio && wantSound && !oceanAudio.paused);
    soundToggle.classList.toggle('is-on', on);
    soundToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    var L = INTRO_I18N[introLang()] || INTRO_I18N.en;
    soundToggle.setAttribute('aria-label', on ? L.soundOff : L.soundOn);
  }

  function showSoundHint(){
    if (!soundToggle || (oceanAudio && !oceanAudio.paused)) return;
    soundToggle.classList.add('is-hinting');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(hideSoundHint, 9000);
  }
  function hideSoundHint(){
    if (soundToggle) soundToggle.classList.remove('is-hinting');
    clearTimeout(hintTimer);
  }

  /* iOS Safari requires audible media playback to originate directly from the
     tap. Keep the cinematic video muted forever and start the copied original
     AAC soundtrack as a separate media element inside that tap handler. */
  function primeSoundPreference() {
    wantSound = true;
    audioUnlocked = true;
    saveSoundPref(true);
    hideSoundHint();
  }

  function startWithSoundFromGesture() {
    primeSoundPreference();

    try { video.pause(); } catch (e) {}
    try { video.currentTime = 0; } catch (e) {}
    video.setAttribute('muted', '');
    video.defaultMuted = true;
    video.muted = true;

    if (oceanAudio) {
      try { oceanAudio.pause(); } catch (e) {}
      try { oceanAudio.currentTime = 0; } catch (e) {}
      try { oceanAudio.volume = 1; } catch (e) {}

      /* Do not await anything before this call. On iOS this play() must still be
         in the original click/touch call stack. */
      var ap = oceanAudio.play();
      if (ap && typeof ap.then === 'function') {
        ap.then(reflectSoundUi).catch(function () {
          reflectSoundUi();
          showSoundHint();
        });
      }
    }

    resetSequence();
    playFromStart();
    reflectSoundUi();
  }

  function muteSound() {
    if (oceanAudio) {
      try { oceanAudio.pause(); } catch (e) {}
    }
    video.setAttribute('muted', '');
    video.defaultMuted = true;
    video.muted = true;
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
    if (countdown)  countdown.classList.remove('is-in', 'is-ticking');
    if (countValue) countValue.textContent = String(COUNTDOWN_FROM);
    if (tapStart)   tapStart.classList.remove('is-in');
    autoplayFallbackReady = false;
  }

  function keepIntroRolling() {
    if (leaving || onMain) return;
    video.setAttribute('muted','');
    video.defaultMuted = true;
    video.muted = true;
    if (video.paused) {
      var rp = video.play();
      if (rp && typeof rp.catch === 'function') rp.catch(function(){});
    }
  }

  function startSequence() {
    if (seqStarted || leaving) return;
    seqStarted = true;
    keepIntroRolling();

    var remaining = COUNTDOWN_FROM;

    if (introCopy) introCopy.classList.add('is-out');
    if (countdown) countdown.classList.add('is-in');

    function draw() {
      if (countValue) countValue.textContent = String(remaining);
      retrigger(countdown, 'is-ticking');
    }

    draw();

    countTimer = setInterval(function () {
      keepIntroRolling();
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
    if (oceanAudio) {
      try { oceanAudio.currentTime = 0; } catch (e) {}
    }
  }

  /* A crossfade, not a cut through a colour.

     This used to raise a full-screen brown veil, wait 380ms, and only then
     swap the two layers — a dip to dark with the platform coming out of it.
     Two stacked layers cross-fade properly only when the lower one is already
     opaque: fade both at once and the page ground shows through the middle of
     the transition, which is that dip by another route. So the platform is
     switched on at full opacity behind the intro, where nothing can see it,
     and then the intro alone thins away over it.

     Two things wait for the end of that fade rather than its start. The
     platform is rendered before it, so the layout work happens while the intro
     still covers everything instead of stuttering through the fade. And the
     film keeps playing until the fade is over — stopHeroVideo rewinds to zero,
     and doing that at the start would snap the picture back to its first frame
     in full view. */
  function goToMain() {
    if (leaving || onMain) return;
    leaving = true;
    clearTimers();

    onMain = true;
    main.classList.add('is-instant', 'is-active');
    main.setAttribute('aria-hidden', 'false');
    if (window.ONLYONE && window.ONLYONE.boot) window.ONLYONE.boot();

    setTimeout(function () {
      main.classList.remove('is-instant');
      intro.classList.add('is-leaving');
      intro.setAttribute('aria-hidden', 'true');

      // fully remove the intro from the a11y tree and paint order
      setTimeout(function () {
        if (!onMain) return;
        intro.classList.add('is-hidden');
        stopHeroVideo();
      }, CROSSFADE_MS);
    }, 60);
  }

  /* ======================================================================
     Main → Intro  (§14: everything resets, the intro plays again)
     ====================================================================== */

  function backToIntro() {
    if (!onMain) return;
    onMain = false;

    main.classList.remove('is-active');
    main.setAttribute('aria-hidden', 'true');

    intro.classList.remove('is-hidden');
    // force a reflow so the opacity transition runs from the hidden state
    void intro.offsetWidth;
    intro.classList.remove('is-leaving');
    intro.setAttribute('aria-hidden', 'false');
    if (introEnd) introEnd.setAttribute('aria-hidden', 'true');

    resetSequence();

    // Safari-safe: every replay begins muted. A remembered preference only
    // makes the sound control pulse; audible playback still needs a fresh tap.
    wantSound = loadSoundPref();
    video.setAttribute('muted', '');
    video.defaultMuted = true;
    video.muted = true;
    if (oceanAudio) {
      try { oceanAudio.pause(); } catch (e) {}
      try { oceanAudio.currentTime = 0; } catch (e) {}
    }
    reflectSoundUi();
    playFromStart();
    if (wantSound) showSoundHint();
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
        // Unmuted playback was refused — as iOS always will without a gesture.
        // Fall back to muted autoplay and keep the stored preference, so the
        // first tap can honour it.
        if (!video.muted) {
          muteSound();
          showSoundHint();
          var retry = video.play();
          if (retry && typeof retry.catch === 'function') {
            retry.catch(function () { showTapStart(); });
          }
        } else {
          // A first autoplay rejection on iOS is not yet a reason to put a
          // button over the film. canplay/pageshow/visibility and the probe
          // below keep retrying; the button is a late fallback only.
          setTimeout(nudgePlay, 220);
        }
      });
    }
  }

  function showTapStart(force) {
    if (leaving || onMain) return;
    // The normal experience has no start button. Only expose it after the
    // autoplay grace period, or immediately for a hard media error.
    if (!force && !autoplayFallbackReady) return;
    // never offer a manual start for something that is already running
    if (!video.paused && video.readyState >= 3) return;
    if (tapStart) tapStart.classList.add('is-in');
  }
  function hideTapStart() {
    if (tapStart) tapStart.classList.remove('is-in');
  }
  function hideSoundHintKeepButton() { hideTapStart(); }

  /* ======================================================================
     Events
     ====================================================================== */

  // countdown is driven by real playback position, not by a wall clock
  video.addEventListener('timeupdate', function () {
    if (video.currentTime > 0.05) hideTapStart();
    maybePrewarmHomeImages();
    if (!seqStarted && !leaving && video.currentTime >= COUNTDOWN_START_AT) {
      startSequence();
    }
  });

  // safety net: if the file ends before the sequence ran, run it anyway
  video.addEventListener('ended', function () {
    if (!seqStarted && !leaving) startSequence();
  });

  video.addEventListener('playing', function () {
    autoplayFallbackReady = false;
    if (tapStart) tapStart.classList.remove('is-in');
  });

  /* Autoplay is refused far more often than it is impossible, and the refusal
     is not always final — a browser that says no while the tab is in the
     background, or before the first frame is decoded, will often say yes a
     moment later. So ask again at each of those moments rather than handing
     the visitor a button on the first refusal. */
  function nudgePlay() {
    if (leaving || onMain || seqStarted) return;
    if (!video.paused) return;
    var p = video.play();
    if (p && typeof p.catch === 'function') p.catch(function () {});
  }
  video.addEventListener('loadeddata', nudgePlay);
  video.addEventListener('progress', maybePrewarmHomeImages);
  video.addEventListener('canplaythrough', prewarmHomeImages, {once:true});
  video.addEventListener('canplay', nudgePlay);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) nudgePlay();
  });

  video.addEventListener('error', giveUpOnVideo);

  // A failing <source> fires its error on the source element, not the video.
  var heroSource = video.querySelector('source');
  if (heroSource) heroSource.addEventListener('error', giveUpOnVideo);

  /* --- invisible autoplay unlock -----------------------------------------
     If iOS refuses muted autoplay, a normal first touch anywhere on the intro
     is enough to resume the already-loaded muted film. No start button is
     needed for that path. The dedicated sound button still owns audio. */
  function resumeMutedFromGesture(event) {
    if (leaving || onMain || !video.paused || video.currentTime > 0.15) return;
    if (event && event.target && event.target.closest && event.target.closest('#soundToggle, #skipIntro, #tapStart')) return;
    video.setAttribute('muted','');
    video.defaultMuted = true;
    video.muted = true;
    var rp = video.play();
    if (rp && typeof rp.then === 'function') {
      rp.then(hideTapStart).catch(function(){});
    }
  }
  intro.addEventListener('touchend', resumeMutedFromGesture, {passive:true});
  intro.addEventListener('pointerup', resumeMutedFromGesture, {passive:true});

  /* --- first tap on the hero: unlock sound, replay with the ocean -------- */
  intro.addEventListener('click', function (event) {
    if (leaving || onMain) return;
    if (event.target.closest('#soundToggle, #tapStart, #skipIntro')) return;

    // If autoplay was blocked, use this gesture only to resume the muted film;
    // do not restart it from zero. Audio remains an explicit sound-button action.
    if (video.paused && video.currentTime < 0.15) {
      resumeMutedFromGesture(event);
      return;
    }
    nudgePlay();
  });

  /* --- explicit sound toggle -------------------------------------------- */
  if (soundToggle) {
    var lastSoundTouch = 0;
    function toggleSoundFromGesture(event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }

      if (!oceanAudio || oceanAudio.paused || !wantSound) {
        startWithSoundFromGesture();
      } else {
        wantSound = false;
        saveSoundPref(false);
        muteSound();
      }
    }

    /* touchend is the most direct iPhone path. Prevent its synthetic click from
       toggling the sound straight back off; desktop and keyboard keep click. */
    soundToggle.addEventListener('touchend', function (event) {
      lastSoundTouch = Date.now();
      toggleSoundFromGesture(event);
    }, {passive:false});

    soundToggle.addEventListener('click', function (event) {
      if (Date.now() - lastSoundTouch < 700) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      toggleSoundFromGesture(event);
    });
  }

  /* --- autoplay fallback button ----------------------------------------- */
  if (tapStartBtn) {
    tapStartBtn.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      startWithSoundFromGesture();
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

  /* Coming back from a bank's payment page must not replay the film. The
     document stashed ?pay=… before stripping the query; if it is there,
     someone is mid-payment and the platform opens directly. Deferred one
     tick on purpose: goToMain() hands over to ONLYONE.boot, and boot is
     defined by the platform section further down this same file — a
     synchronous call here would run before it exists and the payment
     outcome would never be applied. */
  try {
    if (sessionStorage.getItem('onlyone.payreturn')) setTimeout(goToMain, 0);
  } catch (e) {}

  /* --- never let the ocean play in a background tab ---------------------- */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      try { video.pause(); } catch (e) {}
      if (oceanAudio) try { oceanAudio.pause(); } catch (e) {}
    } else if (onMain) {
      // the platform hero is a slideshow now — CSS animations pause themselves
    } else if (!leaving && video.paused) {
      var p = video.play();
      if (p && typeof p.catch === 'function') p.catch(function () {});
      if (oceanAudio && wantSound && audioUnlocked) {
        var ap = oceanAudio.play();
        if (ap && typeof ap.catch === 'function') ap.catch(function () { reflectSoundUi(); });
      }
    }
  });

  /* --- restoring from the bfcache ---------------------------------------- */
  window.addEventListener('pageshow', function (event) {
    if (typeof window.onlyoneCheckBuild === 'function') window.onlyoneCheckBuild();
    if (event.persisted && !onMain) {
      if (oceanAudio) try { oceanAudio.pause(); } catch (e) {}
      resetSequence();
      playFromStart();
      if (loadSoundPref()) showSoundHint();
    }
  });


  /* ======================================================================
     Public API — the platform starts its hero clip and can replay the
     intro from its menu.
     ====================================================================== */
  window.ONLYONE = window.ONLYONE || {};
  window.ONLYONE.replayIntro = backToIntro;

  /* ======================================================================
     Boot
     ====================================================================== */

  video.playsInline = true;

  // Autoplay is always muted on every browser. iOS then gets the soundtrack
  // from the separate audio element only after a real user tap.
  wantSound = loadSoundPref();
  video.setAttribute('muted', '');
  video.defaultMuted = true;
  video.muted = true;
  if (oceanAudio) {
    try { oceanAudio.pause(); } catch (e) {}
    try { oceanAudio.currentTime = 0; } catch (e) {}
    oceanAudio.addEventListener('play', reflectSoundUi);
    oceanAudio.addEventListener('pause', reflectSoundUi);
    oceanAudio.addEventListener('ended', reflectSoundUi);
  }
  reflectSoundUi();

  playFromStart();

  // Give the video a moment to settle, then point gently at the sound control.
  setTimeout(showSoundHint, 1400);
  ['click','touchend'].forEach(function (ev) {
    intro.addEventListener(ev, hideSoundHint, { once: true, capture: true });
  });

  // Normal path: no start button at all. If autoplay has still not begun after
  // a short 1.2 s grace period, expose the fallback immediately so nobody waits.
  probeTimer = setTimeout(function () {
    autoplayFallbackReady = true;
    if (video.paused && video.currentTime < 0.15) showTapStart();
  }, AUTOPLAY_PROBE_MS);

})();

/* ==========================================================================
   ONLYONE LUXURY TRAVEL — platform
   The booking experience the intro opens into.

   THE CENTRAL BUSINESS RULE
   -------------------------
   A guest must never see a price before a member of staff has written an
   individual offer for them.

   This is enforced structurally, not cosmetically: there are NO prices in the
   hotel data at all. Not hidden with CSS, not sitting in a field the UI skips
   — simply absent. A price only comes into existence when staff types one into
   the offer form, and it is then attached to that single request. Opening
   DevTools reveals nothing, because there is nothing to reveal.

   Look at PUBLIC_HOTELS below: no price key exists on any hotel or room.
   A real backend mirrors this split — /api/public/hotels returns no prices,
   /api/staff/* requires authentication and a role check.
   ========================================================================== */
(function () {
  'use strict';

  /* ====================================================================
     1 · i18n — RU is the default
     ==================================================================== */
  const I18N = {
    ru:{
      kind:'Тип размещения',
      yourContact:'Ваш контакт',
      noThreadYet:'Здесь появится прямая связь с вашим менеджером, как только вы отправите запрос.',
      startRequest:'Подобрать жильё',
      writeMsg:'Написать сообщение',
      send:'Отправить',
      msgSent:'Сообщение отправлено',
      replyTo:'Ответить клиенту',
      threadFor:'Запрос',
      you:'Вы',
      team:'Команда ONLYONE',
      noMessages:'Пока нет сообщений',
      newMsg:'Новое сообщение',
      navConcierge:'VIP-ассистент',
      navVip:'VIP экскурсии',
      conciergeTitle:'Ваш персональный VIP-ассистент',
      conciergeRole:'VIP-ассистент ONLYONE · TÜRKİYE',
      conciergeLead:'Один человек сопровождает вашу поездку — от первого вопроса до возвращения домой.',
      cDo1:'Подбор жилья под ваши пожелания',
      cDo2:'Индивидуальное предложение без обязательств',
      cDo3:'Трансферы, столики, экскурсии',
      cDo4:'На связи во время поездки',
      callNow:'Позвонить',
      writeWa:'Написать в WhatsApp',
      writeMail:'Написать письмо',
      hours:'Ежедневно 08:00 – 22:00 по местному времени',
      excursions:'Экскурсии',
      excSub:'Больше, чем отель',
      excAll:'Все экскурсии',
      excInterest:'Интересующие экскурсии',
      excNote:'Экскурсии подбираются вместе с предложением по отелю.',
      addToReq:'Добавить к запросу',
      excAdded:'Добавлено к запросу',
      duration:'Длительность',
      heroEyebrow:'Турция', heroScript:'Турция',
      heroTitle:'Лучшие адреса.',
      heroSub:'Расскажите, как вы путешествуете, — обо всём остальном позаботимся мы.',
      heroCta:'Начать с VIP-ассистентом',
      discover:'Подобрать жильё', trust1:'Жильё, отобранное вручную', trust2:'Персональная консультация', trust3:'Индивидуальные предложения',
      navHome:'Главная', navSearch:'Поиск', navMap:'Карта', navFav:'Избранное', navTrips:'Мои поездки',
      where:'Куда?', wherePh:'Выберите регион', dates:'Даты поездки', datesPh:'Выберите даты',
      guests:'Гости', searchBtn:'Найти жильё', recommended:'Рекомендуем', all:'Все',
      experiences:'Впечатления',
      focusExcursions:'Экскурсии и впечатления', focusExcursionsSub:'Лучшие идеи для вашей поездки — от Каппадокии до Эфеса.',
      vipMoments:'ONLYONE в движении', vipMomentsSub:'Групповые путешествия, частные события и особенные экскурсии в движении.',
      vipServices:'VIP-сервисы', vipServicesSub:'Трансфер и перелёт — организуем вместе с поездкой.',
      destinationsShort:'Направления', staysShort:'Подобрать жильё',
      travelWays:'Как вы хотите путешествовать?', destinations:'Направления', selectedExperiences:'Избранные впечатления',
      handpicked:'Отобрано для вас', curatedOffers:'Избранные предложения', curatedOffersSub:'Пять тщательно отобранных адресов для особенного путешествия.', exploreSelf:'Исследовать самостоятельно', askVip:'Спросить VIP-ассистента',
      allExperiences:'Все впечатления', planThisTrip:'Спланировать эту поездку', noCatalog:'Без каталога и стандартных пакетов — мы подберём вариант под ваш запрос.',
      vipHead:'Мы делаем больше,<br>чем просто поездки',
      vip1:'VIP-сервис', vip1t:'Один человек ведёт вашу поездку — от первого вопроса до возвращения домой.',
      vip2:'Проверенные адреса', vip2t:'Только дома, в которых мы были сами. Никаких каталожных отелей.',
      vipX:'Эксклюзивные впечатления', vipXt:'Яхты, вертолёты, гастрономия и приватные экскурсии — по вашему вкусу.',
      vip3:'VIP-ассистент на связи', vip3t:'Столик, трансфер, врач — пока вы в пути, мы на телефоне.', conciergeName:'Мария Грычко', conciergeMark:'МГ',
      flyEyebrow:'Дорога', flyTitle:'Прилететь<br>без пересадок',
      flySpecA:'Перелёт и трансфер', flySpecB:'Круглосуточно',
      flyBody:'Рейс, частный трансфер из аэропорта вашей поездки и встреча у выхода. Скажите, откуда летите — остальное возьмёт на себя ваш VIP-ассистент.',
      flyCta:'Спросить VIP-ассистента',
      carEyebrow:'Трансфер', carTitle:'Машина<br>уже ждёт', carWord:'VIP ТРАНСФЕР',
      welcomeEyebrow:'Прибытие', welcomeTitle:'VIP-приём',
      welcomeBody:'Личная встреча в аэропорту назначения — табличка с именем, короткий путь, без очередей.',
      yachtEyebrow:'Эксклюзив', yachtTitle:'Яхт-тур',
      yachtBody:'Лодка только для вас — маршрут, бухты и кухня по вашему желанию.',
      groupsEyebrow:'Групповые путешествия', groupsTitle:'Каппадокия в группе',
      groupsBody:'Небольшая группа, продуманный маршрут и общие впечатления — Каппадокия без массового туризма.',
      eventEyebrow:'Особый повод', eventTitle:'Частный ужин',
      eventBody:'Частный ужин и элегантный вечер — от сервировки до атмосферы всё организовано персонально.',
      pamukkaleEyebrow:'Экскурсия', pamukkaleTitle:'Памуккале',
      pamukkaleBody:'Спокойная премиальная экскурсия к белым террасам Памуккале — комфортно, красиво и без суеты.',
      featuredOffer:'ONLYONE CHOICE', featuredMeta:'Частный пляж · VIP-трансфер по запросу', moreSelected:'Другие избранные предложения', finalCtaEyebrow:'ONLYONE · VIP', finalCtaTitle:'Расскажите только, как вы хотите путешествовать.', finalCtaBody:'Ваш VIP-ассистент соберёт проживание, трансферы и впечатления в одну персональную поездку.', finalCtaButton:'Начать с VIP-ассистентом',
      blockMore:'Подробнее', blockHow:'Как это работает',
      blockStep1:'Расскажите, как хотите путешествовать.',
      blockStep2:'Ваш VIP-ассистент соберёт предложение именно под эту поездку.',
      blockStep3:'Вы подтверждаете — остальное берём на себя.',
      blockAskText:'Готовых пакетов у нас нет: каждое предложение пишется под вас. Напишите VIP-ассистенту — и мы всё подготовим.',
      carSpecA:'С водителем или без', carSpecB:'От двери до двери',
      carBody:'Автомобиль с водителем встречает вас в аэропорту назначения и довозит до самых дверей — без очередей и пересадок. Хотите вести сами — машина ждёт вас к прилёту.',
      regions:'Регионы', allRegions:'Все регионы', hotels:'вариантов', hotel:'Размещение',
      filters:'Фильтры', apply:'Применить', reset:'Сбросить', results:'найдено',
      category:'Категория', holidayType:'Тип отдыха', amenities:'Удобства', rating:'Оценка',
      beachDist:'До пляжа', unitM:'м', board:'Питание', anyRating:'Любая', from9:'от 9,0', from85:'от 8,5', from8:'от 8,0',
      viewHotel:'Смотреть', description:'Описание', location:'Расположение',
      rooms:'Номера', reviews:'отзывов', policies:'Правила размещения', map:'Карта',
      requestRoom:'Запросить этот номер', interested:'Интересует это размещение?', requestOffer:'Запросить предложение',
      nonBinding:'Без обязательств',
      step:'Шаг', of:'из', next:'Далее', back:'Назад',
      s1:'Даты поездки', s2:'Гости', s3:'Номер', s4:'Пожелания', s5:'Контактные данные', s6:'Обзор',
      arrival:'Заезд', departure:'Выезд', adults:'Взрослые', children:'Дети', childAge:'Возраст ребёнка',
      roomWish:'Желаемая категория номера', notSure:'Ещё не уверен(а)',
      wSea:'Вид на море', wQuiet:'Тихий номер', wTransfer:'Трансфер из аэропорта', wCot:'Детская кроватка',
      wHoney:'Медовый месяц', wBirthday:'День рождения', wAccess:'Доступная среда',
      otherWishes:'Другие пожелания', firstName:'Имя', lastName:'Фамилия', phone:'Телефон', email:'E-Mail', whatsapp:'WhatsApp (необязательно)',
      sendRequest:'Отправить запрос', reqSent:'Запрос успешно отправлен', reqNo:'Номер запроса',
      reqTeamText:'Наша команда изучит ваш запрос и составит для вас индивидуальное предложение.',
      myTrips:'Мои поездки', myFav:'Избранное', noTrips:'У вас пока нет запросов', noFav:'Вы ещё не добавили отели в избранное',
      details:'Подробнее', viewOffer:'Посмотреть предложение', yourOffer:'Ваше персональное предложение',
      total:'Общая стоимость', nights:'ночей', acceptOffer:'Принять предложение', askBack:'Задать вопрос',
      payNow:'Оплатить сейчас', paid:'Оплачено', validUntil:'Действительно до',
      stNew:'Запрос получен', stCheck:'На рассмотрении', stOffer:'Предложение составлено', stAccepted:'Клиент подтвердил',
      stPay:'Ожидает оплаты', stPaid:'Оплачено', stConfirmed:'Бронирование подтверждено',
      menu:'Меню', mContact:'Контакты', mLang:'Язык', mStaff:'Вход для сотрудников', mIntro:'Смотреть заставку',
      compare:'Сравнить', staffArea:'Рабочая область', dashboard:'Обзор', requests:'Запросы',
      bookings:'Брони', customers:'Клиенты', more:'Ещё', today:'Сегодня', total_:'всего',
      newReq:'Новые запросы', openOffers:'Открытые предложения', waitCust:'Ждём клиента',
      payOpen:'Ожидает оплаты', newBook:'Новые брони', openReq:'Открыть запрос',
      createOffer:'Создать предложение', sellPrice:'Цена продажи', currency:'Валюта',
      internalNote:'Внутренняя заметка', custInfo:'Информация для клиента', sendOffer:'Отправить предложение',
      createPayLink:'Создать ссылку на оплату', payLinkDone:'Ссылка на оплату создана',
      copyLink:'Копировать ссылку', sendWa:'Отправить в WhatsApp',
      guestData:'Данные клиента', period:'Период', roomReq:'Пожелание по номеру', custWishes:'Пожелания клиента',
      staffOnly:'Цены видны только сотрудникам', backToCust:'Вернуться в клиентскую часть',
      confirmHotel:'Подтвердить бронирование', tripConfirmed:'Поездка подтверждена',
      offerSentWait:'Предложение отправлено. Ожидаем ответ клиента.',
      demoPay:'Демо-оплата', payDemoNote:'Демонстрация. Реальный платёж не выполняется.', payNowBtn:'Оплатить (демо)',
      cardNo:'Номер карты', login:'Войти', staffLogin:'Вход для сотрудников', loginNote:'Демо-доступ — введите любое имя.',
      yourName:'Ваше имя', addFav:'Добавлено в избранное', remFav:'Удалено из избранного',
      offerSent:'Предложение отправлено клиенту', offerAccepted:'Предложение принято',
      linkCopied:'Ссылка скопирована', paidOk:'Оплата получена', hotelConfirmed:'Размещение подтверждено',
      questionSent:'Вопрос отправлен команде', shared:'Ссылка скопирована',
      adultsShort:'взр.', childrenShort:'дет.', sqm:'м²', persons:'чел.', yrs:'лет',
      exceptional:'Превосходно', wonderful:'Великолепно', veryGood:'Очень хорошо',
      selectRegion:'Выберите регион', done:'Готово', required:'Заполните обязательные поля',
      contactUs:'Свяжитесь с нами', contactTxt:'Наша команда в Анталье ответит вам в течение дня.',
      hotelsIn:'Размещение —', selHotels:'отобранных вариантов', noResults:'Ничего не найдено',
      tryReset:'Попробуйте изменить фильтры', freeCancel:'Бесплатная отмена', onRequest:'по запросу',
      onBeach:'на пляже', noPricesNote:'Цены не показываются — вы получите индивидуальное предложение.',
      noInternalPrices:'Внутренние закупочные цены не хранятся: цена возникает только при создании предложения.',
      transferIncl:'Трансфер включён...',
    },
    de:{
      kind:'Art der Unterkunft',
      yourContact:'Dein Ansprechpartner',
      noThreadYet:'Hier entsteht die direkte Leitung zu deinem Betreuer, sobald du eine Anfrage gesendet hast.',
      startRequest:'Unterkünfte entdecken',
      writeMsg:'Nachricht schreiben',
      send:'Senden',
      msgSent:'Nachricht gesendet',
      replyTo:'Dem Kunden antworten',
      threadFor:'Anfrage',
      you:'Du',
      team:'ONLYONE Team',
      noMessages:'Noch keine Nachrichten',
      newMsg:'Neue Nachricht',
      navConcierge:'VIP Assistent',
      navVip:'VIP Ausflüge',
      conciergeTitle:'Dein persönlicher VIP Assistent',
      conciergeRole:'ONLYONE VIP Assistent · TÜRKİYE',
      conciergeLead:'Ein Mensch begleitet deine Reise — von der ersten Frage bis zur Heimkehr.',
      cDo1:'Auswahl nach deinen Wünschen',
      cDo2:'Individuelles Angebot, unverbindlich',
      cDo3:'Transfers, Tische, Ausflüge',
      cDo4:'Erreichbar während der Reise',
      callNow:'Anrufen',
      writeWa:'Über WhatsApp schreiben',
      writeMail:'E-Mail schreiben',
      hours:'Täglich 08:00 – 22:00 Ortszeit',
      excursions:'Ausflüge',
      excSub:'Mehr als das Hotel',
      excAll:'Alle Ausflüge',
      excInterest:'Ausflüge, die dich interessieren',
      excNote:'Ausflüge werden gemeinsam mit dem Hotelangebot abgestimmt.',
      addToReq:'Zur Anfrage hinzufügen',
      excAdded:'Zur Anfrage hinzugefügt',
      duration:'Dauer',
      heroEyebrow:'Türkiye', heroScript:'Türkiye',
      heroTitle:'Die schönsten Adressen.',
      heroSub:'Erzähl uns, wie du reist — um alles andere kümmern wir uns.',
      heroCta:'Mit VIP Assistent starten',
      discover:'Unterkünfte entdecken', trust1:'Handverlesene Unterkünfte', trust2:'Persönliche Beratung', trust3:'Individuelle Angebote',
      navHome:'Home', navSearch:'Suche', navMap:'Karte', navFav:'Favoriten', navTrips:'Meine Reise',
      where:'Wohin?', wherePh:'Region auswählen', dates:'Reisezeitraum', datesPh:'Zeitraum wählen',
      guests:'Reisende', searchBtn:'Unterkünfte suchen', recommended:'Empfohlen', all:'Alle',
      experiences:'Erlebnisse',
      focusExcursions:'Ausflüge & Erlebnisse', focusExcursionsSub:'Die besten Ideen für deine Reise – von Kappadokien bis Ephesos.',
      vipMoments:'ONLYONE in Bewegung', vipMomentsSub:'Yacht-Momente, besondere Ausflüge, Events, Gruppenreisen und VIP-Empfang in Bewegung.',
      vipServices:'VIP-Services', vipServicesSub:'Transfer und Anreise organisieren wir passend zur Reise.',
      destinationsShort:'Destinationen', staysShort:'Unterkünfte entdecken',
      travelWays:'Wie möchtest du reisen?', destinations:'Destinationen', selectedExperiences:'Ausgewählte Erlebnisse',
      handpicked:'Handverlesen für Sie', curatedOffers:'Erlesene Angebote', curatedOffersSub:'Fünf handverlesene Adressen für eine besondere Reise.', exploreSelf:'Selbst entdecken', askVip:'VIP Assistent fragen',
      allExperiences:'Alle Erlebnisse', planThisTrip:'Diese Reise planen', noCatalog:'Keine Katalogpakete – wir stellen die Reise passend zu deinen Wünschen zusammen.',
      vipHead:'Wir machen mehr<br>als nur Reisen',
      vip1:'VIP-Service', vip1t:'Eine Betreuerin führt deine Reise — von der ersten Frage bis zur Heimkehr.',
      vip2:'Geprüfte Adressen', vip2t:'Nur Häuser, die wir selbst kennen. Keine Katalogware.',
      vipX:'Exklusive Erlebnisse', vipXt:'Yachten, Hubschrauber, Gastronomie und private Touren — nach deinem Geschmack.',
      vip3:'VIP Assistent erreichbar', vip3t:'Tisch, Transfer, Arzt — solange du unterwegs bist, sind wir am Telefon.', conciergeName:'Maria Grychko', conciergeMark:'MG',
      flyEyebrow:'Anreise', flyTitle:'Ankommen<br>ohne Umwege',
      flySpecA:'Flug & Transfer', flySpecB:'Rund um die Uhr',
      flyBody:'Flug, privater Transfer ab deinem Zielflughafen und Empfang am Ausgang. Sag uns, von wo du fliegst — den Rest übernimmt dein VIP Assistent.',
      flyCta:'VIP Assistent fragen',
      carEyebrow:'Transfer', carTitle:'Der Wagen<br>wartet schon', carWord:'VIP TRANSFER',
      welcomeEyebrow:'Ankunft', welcomeTitle:'VIP-Empfang',
      welcomeBody:'Persönlicher Empfang am Zielflughafen — Namensschild, kurzer Weg, kein Anstehen.',
      yachtEyebrow:'Exklusiv', yachtTitle:'Yacht-Tour',
      yachtBody:'Ein Boot nur für euch — Route, Buchten und Küche nach deinem Wunsch.',
      groupsEyebrow:'Gruppenreisen', groupsTitle:'Kappadokien als Gruppenreise',
      groupsBody:'Kleine Gruppen, begleitet und stilvoll geplant — gemeinsame Eindrücke statt Massentourismus.',
      eventEyebrow:'Besonderer Anlass', eventTitle:'Private Dinner Events',
      eventBody:'Ein stilvoller Abend mit gedeckter Tafel, Atmosphäre und diskreter Organisation bis ins Detail.',
      pamukkaleEyebrow:'Ausflug', pamukkaleTitle:'Pamukkale-Ausflug',
      pamukkaleBody:'Ein ruhiger Premium-Ausflug zu den weißen Terrassen von Pamukkale — angenehm geführt und entspannt geplant.',
      featuredOffer:'ONLYONE CHOICE', featuredMeta:'Privatstrand · VIP Transfer auf Wunsch', moreSelected:'Weitere erlesene Angebote', finalCtaEyebrow:'ONLYONE · VIP', finalCtaTitle:'Erzähl uns nur, wie du reisen möchtest.', finalCtaBody:'Dein VIP Assistent verbindet Unterkunft, Transfers und Erlebnisse zu einer persönlichen Reise.', finalCtaButton:'Mit VIP Assistent starten',
      blockMore:'Mehr erfahren', blockHow:'So läuft es',
      blockStep1:'Sag uns, wie du reisen willst.',
      blockStep2:'Deine Betreuerin stellt ein Angebot für genau diese Reise zusammen.',
      blockStep3:'Du bestätigst — den Rest übernehmen wir.',
      blockAskText:'Fertige Pakete gibt es bei uns nicht: jedes Angebot wird für dich geschrieben. Schreib deiner Betreuerin — wir bereiten alles vor.',
      carSpecA:'Mit oder ohne Chauffeur', carSpecB:'Tür zu Tür',
      carBody:'Ein Wagen mit Chauffeur holt dich am Zielflughafen ab und bringt dich bis vor die Tür deiner Unterkunft — ohne Warteschlange, ohne Umsteigen. Wer lieber selbst fährt, findet den Wagen zur Ankunft bereitstehen.',
      regions:'Regionen', allRegions:'Alle Regionen', hotels:'Unterkünfte', hotel:'Stay',
      filters:'Filter', apply:'Anwenden', reset:'Zurücksetzen', results:'Ergebnisse',
      category:'Kategorie', holidayType:'Urlaubsart', amenities:'Ausstattung', rating:'Bewertung',
      beachDist:'Entfernung Strand', unitM:'m', board:'Verpflegung', anyRating:'Alle', from9:'ab 9,0', from85:'ab 8,5', from8:'ab 8,0',
      viewHotel:'Ansehen', description:'Beschreibung', location:'Lage',
      rooms:'Zimmer', reviews:'Bewertungen', policies:'Richtlinien', map:'Karte',
      requestRoom:'Dieses Zimmer anfragen', interested:'Interesse an dieser Unterkunft?', requestOffer:'Angebot anfragen',
      nonBinding:'Unverbindlich',
      step:'Schritt', of:'von', next:'Weiter', back:'Zurück',
      s1:'Reisedaten', s2:'Reisende', s3:'Zimmer', s4:'Wünsche', s5:'Kontaktdaten', s6:'Übersicht',
      arrival:'Anreise', departure:'Abreise', adults:'Erwachsene', children:'Kinder', childAge:'Alter Kind',
      roomWish:'Gewünschte Zimmerkategorie', notSure:'Noch nicht sicher',
      wSea:'Meerblick', wQuiet:'Ruhiges Zimmer', wTransfer:'Flughafentransfer', wCot:'Kinderbett',
      wHoney:'Honeymoon', wBirthday:'Geburtstag', wAccess:'Barrierearm',
      otherWishes:'Sonstige Wünsche', firstName:'Vorname', lastName:'Nachname', phone:'Telefon', email:'E-Mail', whatsapp:'WhatsApp (optional)',
      sendRequest:'Unverbindliche Anfrage senden', reqSent:'Anfrage erfolgreich gesendet', reqNo:'Anfragenummer',
      reqTeamText:'Unser Reiseteam prüft deine Anfrage und erstellt ein individuelles Angebot.',
      myTrips:'Meine Reisen', myFav:'Meine Favoriten', noTrips:'Du hast noch keine Anfragen', noFav:'Du hast noch keine Favoriten gespeichert',
      details:'Details', viewOffer:'Angebot ansehen', yourOffer:'Ihr persönliches Angebot',
      total:'Gesamtpreis', nights:'Nächte', acceptOffer:'Angebot annehmen', askBack:'Rückfrage senden',
      payNow:'Jetzt sicher bezahlen', paid:'Bezahlt', validUntil:'Gültig bis',
      stNew:'Anfrage eingegangen', stCheck:'Wird geprüft', stOffer:'Angebot erstellt', stAccepted:'Kunde bestätigt',
      stPay:'Zahlung offen', stPaid:'Bezahlt', stConfirmed:'Buchung bestätigt',
      menu:'Menü', mContact:'Kontakt', mLang:'Sprache', mStaff:'Mitarbeiter Login', mIntro:'Intro ansehen',
      compare:'Vergleichen', staffArea:'Mitarbeiterbereich', dashboard:'Dashboard', requests:'Anfragen',
      bookings:'Buchungen', customers:'Kunden', more:'Mehr', today:'Heute', total_:'gesamt',
      newReq:'Neue Anfragen', openOffers:'Offene Angebote', waitCust:'Warten auf Kunde',
      payOpen:'Zahlung offen', newBook:'Neue Buchungen', openReq:'Anfrage öffnen',
      createOffer:'Angebot erstellen', sellPrice:'Verkaufspreis', currency:'Währung',
      internalNote:'Interne Notiz', custInfo:'Kundeninformation', sendOffer:'Angebot senden',
      createPayLink:'Zahlungslink erstellen', payLinkDone:'Zahlungslink erstellt',
      copyLink:'Link kopieren', sendWa:'Per WhatsApp senden',
      guestData:'Kundendaten', period:'Zeitraum', roomReq:'Zimmerwunsch', custWishes:'Kundenwünsche',
      staffOnly:'Preise sind nur für Mitarbeiter sichtbar', backToCust:'Zurück zum Kundenbereich',
      confirmHotel:'Bestätigung eintragen', tripConfirmed:'Reise bestätigt',
      offerSentWait:'Angebot gesendet. Wir warten auf den Kunden.',
      demoPay:'Demo-Zahlung', payDemoNote:'Demonstration. Es wird keine echte Zahlung ausgeführt.', payNowBtn:'Bezahlen (Demo)',
      cardNo:'Kartennummer', login:'Anmelden', staffLogin:'Mitarbeiter Login', loginNote:'Demo-Zugang — beliebigen Namen eingeben.',
      yourName:'Dein Name', addFav:'Zu Favoriten hinzugefügt', remFav:'Aus Favoriten entfernt',
      offerSent:'Angebot an Kunden gesendet', offerAccepted:'Angebot angenommen',
      linkCopied:'Link kopiert', paidOk:'Zahlung eingegangen', hotelConfirmed:'Unterkunft hat bestätigt',
      questionSent:'Rückfrage an das Team gesendet', shared:'Link kopiert',
      adultsShort:'Erw.', childrenShort:'Ki.', sqm:'m²', persons:'Pers.', yrs:'Jahre',
      exceptional:'Außergewöhnlich', wonderful:'Hervorragend', veryGood:'Sehr gut',
      selectRegion:'Region wählen', done:'Fertig', required:'Bitte Pflichtfelder ausfüllen',
      contactUs:'Kontakt', contactTxt:'Unser Team meldet sich noch am selben Tag.',
      hotelsIn:'Stays in', selHotels:'ausgewählte Unterkünfte', noResults:'Keine Treffer',
      tryReset:'Passe die Filter an', freeCancel:'Kostenlose Stornierung', onRequest:'auf Anfrage',
      onBeach:'direkt am Strand', noPricesNote:'Keine Preise — du erhältst ein individuelles Angebot.',
      noInternalPrices:'Es werden keine internen Einkaufspreise gespeichert — ein Preis entsteht erst beim Erstellen eines Angebots.',
      transferIncl:'Transfer inklusive...',
    },
    en:{
      kind:'Type of stay',
      yourContact:'Your contact',
      noThreadYet:'Your direct line to the person handling your trip appears here once you send a request.',
      startRequest:'Discover stays',
      writeMsg:'Write a message',
      send:'Send',
      msgSent:'Message sent',
      replyTo:'Reply to the customer',
      threadFor:'Request',
      you:'You',
      team:'ONLYONE team',
      noMessages:'No messages yet',
      newMsg:'New message',
      navConcierge:'VIP Assistant',
      navVip:'VIP excursions',
      conciergeTitle:'Your personal VIP assistant',
      conciergeRole:'ONLYONE VIP Assistant · TÜRKİYE',
      conciergeLead:'One person accompanies your journey — from the first question to your way home.',
      cDo1:'Stays chosen around your wishes',
      cDo2:'An individual offer, without obligation',
      cDo3:'Transfers, tables, excursions',
      cDo4:'Reachable while you travel',
      callNow:'Call',
      writeWa:'Message on WhatsApp',
      writeMail:'Write an email',
      hours:'Daily 08:00 – 22:00 local time',
      excursions:'Excursions',
      excSub:'Beyond the hotel',
      excAll:'All excursions',
      excInterest:'Excursions you are interested in',
      excNote:'Excursions are arranged together with the hotel offer.',
      addToReq:'Add to my request',
      excAdded:'Added to your request',
      duration:'Duration',
      heroEyebrow:'Türkiye', heroScript:'Türkiye',
      heroTitle:'The finest addresses.',
      heroSub:'Tell us how you travel — we take care of the rest.',
      heroCta:'Start with a VIP assistant',
      discover:'Discover stays', trust1:'Handpicked stays', trust2:'Personal advice', trust3:'Individual offers',
      navHome:'Home', navSearch:'Search', navMap:'Map', navFav:'Saved', navTrips:'My trip',
      where:'Where to?', wherePh:'Choose a region', dates:'Travel dates', datesPh:'Select dates',
      guests:'Guests', searchBtn:'Search stays', recommended:'Recommended', all:'All',
      experiences:'Experiences',
      focusExcursions:'Excursions & experiences', focusExcursionsSub:'The best ideas for your trip — from Cappadocia to Ephesus.',
      vipMoments:'ONLYONE in motion', vipMomentsSub:'Yacht moments, memorable excursions, private events, group journeys and VIP welcomes brought to life.',
      vipServices:'VIP services', vipServicesSub:'Transfer and arrival arranged around your trip.',
      destinationsShort:'Destinations', staysShort:'Discover stays',
      travelWays:'How would you like to travel?', destinations:'Destinations', selectedExperiences:'Selected experiences',
      handpicked:'Handpicked for you', curatedOffers:'Selected offers', curatedOffersSub:'Five carefully selected addresses for a special journey.', exploreSelf:'Explore yourself', askVip:'Ask your VIP assistant',
      allExperiences:'All experiences', planThisTrip:'Plan this journey', noCatalog:'No catalogue packages — we shape the journey around your wishes.',
      vipHead:'We do more<br>than book trips',
      vip1:'VIP service', vip1t:'One person runs your trip — from the first question to your way home.',
      vip2:'Houses we know', vip2t:'Only places we have stayed in ourselves. Nothing off a catalogue.',
      vipX:'Exclusive experiences', vipXt:'Yachts, helicopters, dining and private tours — cut to your taste.',
      vip3:'VIP assistant on call', vip3t:'A table, a transfer, a doctor — while you travel, we are on the phone.', conciergeName:'Maria Grychko', conciergeMark:'MG',
      flyEyebrow:'Getting there', flyTitle:'Arrive<br>without detours',
      flySpecA:'Flight & transfer', flySpecB:'Around the clock',
      flyBody:'The flight, a private transfer from your destination airport and someone waiting at the exit. Tell us where you fly from — your VIP assistant takes care of the rest.',
      flyCta:'Ask your VIP assistant',
      carEyebrow:'Transfer', carTitle:'Your car<br>is waiting', carWord:'VIP TRANSFER',
      welcomeEyebrow:'Arrival', welcomeTitle:'VIP welcome',
      welcomeBody:'Met in person at your destination airport — name sign, short walk, no queue.',
      yachtEyebrow:'Exclusive', yachtTitle:'Yacht tour',
      yachtBody:'A boat just for you — route, coves and galley exactly as you like.',
      groupsEyebrow:'Group journeys', groupsTitle:'Cappadocia group journey',
      groupsBody:'Small groups, thoughtful guidance and shared moments — a premium group experience without mass tourism.',
      eventEyebrow:'Special occasion', eventTitle:'Private dinner events',
      eventBody:'An elegant evening dinner event, personally coordinated from atmosphere to every table detail.',
      pamukkaleEyebrow:'Excursion', pamukkaleTitle:'Pamukkale excursion',
      pamukkaleBody:'A calm premium excursion to the white terraces of Pamukkale — beautifully paced and comfortably led.',
      featuredOffer:'ONLYONE CHOICE', featuredMeta:'Private beach · VIP transfer on request', moreSelected:'More selected offers', finalCtaEyebrow:'ONLYONE · VIP', finalCtaTitle:'Just tell us how you want to travel.', finalCtaBody:'Your VIP assistant brings stays, transfers and experiences together into one personal journey.', finalCtaButton:'Start with a VIP assistant',
      blockMore:'Learn more', blockHow:'How it works',
      blockStep1:'Tell us how you want to travel.',
      blockStep2:'Your VIP assistant puts together an offer for exactly this trip.',
      blockStep3:'You confirm — we take care of the rest.',
      blockAskText:'There are no ready-made packages here: every offer is written for you. Write to your VIP assistant and we will prepare it.',
      carSpecA:'With or without a chauffeur', carSpecB:'Door to door',
      carBody:'A car and chauffeur meet you at your destination airport and take you to the door of your stay — no queue, no changing over. Prefer to drive yourself and the car is waiting when you land.',
      regions:'Regions', allRegions:'All regions', hotels:'stays', hotel:'Stay',
      filters:'Filters', apply:'Apply', reset:'Reset', results:'results',
      category:'Category', holidayType:'Holiday type', amenities:'Amenities', rating:'Rating',
      beachDist:'Beach distance', unitM:'m', board:'Board', anyRating:'Any', from9:'from 9.0', from85:'from 8.5', from8:'from 8.0',
      viewHotel:'View', description:'Description', location:'Location',
      rooms:'Rooms', reviews:'reviews', policies:'House rules', map:'Map',
      requestRoom:'Request this room', interested:'Interested in this stay?', requestOffer:'Request an offer',
      nonBinding:'Non-binding',
      step:'Step', of:'of', next:'Next', back:'Back',
      s1:'Travel dates', s2:'Guests', s3:'Room', s4:'Wishes', s5:'Contact details', s6:'Summary',
      arrival:'Check-in', departure:'Check-out', adults:'Adults', children:'Children', childAge:'Child age',
      roomWish:'Preferred room category', notSure:'Not sure yet',
      wSea:'Sea view', wQuiet:'Quiet room', wTransfer:'Airport transfer', wCot:'Baby cot',
      wHoney:'Honeymoon', wBirthday:'Birthday', wAccess:'Step-free access',
      otherWishes:'Other wishes', firstName:'First name', lastName:'Last name', phone:'Phone', email:'Email', whatsapp:'WhatsApp (optional)',
      sendRequest:'Send non-binding request', reqSent:'Request sent successfully', reqNo:'Request number',
      reqTeamText:'Our travel team is reviewing your request and will prepare an individual offer.',
      myTrips:'My trips', myFav:'Saved hotels', noTrips:'You have no requests yet', noFav:'You have not saved any hotels yet',
      details:'Details', viewOffer:'View offer', yourOffer:'Your personal offer',
      total:'Total price', nights:'nights', acceptOffer:'Accept offer', askBack:'Ask a question',
      payNow:'Pay securely now', paid:'Paid', validUntil:'Valid until',
      stNew:'Request received', stCheck:'Under review', stOffer:'Offer prepared', stAccepted:'Customer confirmed',
      stPay:'Payment pending', stPaid:'Paid', stConfirmed:'Booking confirmed',
      menu:'Menu', mContact:'Contact', mLang:'Language', mStaff:'Staff login', mIntro:'Watch intro',
      compare:'Compare', staffArea:'Staff area', dashboard:'Dashboard', requests:'Requests',
      bookings:'Bookings', customers:'Customers', more:'More', today:'Today', total_:'total',
      newReq:'New requests', openOffers:'Open offers', waitCust:'Awaiting customer',
      payOpen:'Payment pending', newBook:'New bookings', openReq:'Open request',
      createOffer:'Create offer', sellPrice:'Selling price', currency:'Currency',
      internalNote:'Internal note', custInfo:'Customer information', sendOffer:'Send offer',
      createPayLink:'Create payment link', payLinkDone:'Payment link created',
      copyLink:'Copy link', sendWa:'Send via WhatsApp',
      guestData:'Customer details', period:'Period', roomReq:'Room preference', custWishes:'Customer wishes',
      staffOnly:'Prices are visible to staff only', backToCust:'Back to guest area',
      confirmHotel:'Record confirmation', tripConfirmed:'Trip confirmed',
      offerSentWait:'Offer sent. Awaiting the customer.',
      demoPay:'Demo payment', payDemoNote:'Demonstration only. No real payment is processed.', payNowBtn:'Pay (demo)',
      cardNo:'Card number', login:'Sign in', staffLogin:'Staff login', loginNote:'Demo access — enter any name.',
      yourName:'Your name', addFav:'Added to saved', remFav:'Removed from saved',
      offerSent:'Offer sent to the customer', offerAccepted:'Offer accepted',
      linkCopied:'Link copied', paidOk:'Payment received', hotelConfirmed:'The stay confirmed the booking',
      questionSent:'Question sent to the team', shared:'Link copied',
      adultsShort:'ad.', childrenShort:'ch.', sqm:'m²', persons:'guests', yrs:'yrs',
      exceptional:'Exceptional', wonderful:'Wonderful', veryGood:'Very good',
      selectRegion:'Select region', done:'Done', required:'Please fill in the required fields',
      contactUs:'Contact', contactTxt:'Our team replies the same day.',
      hotelsIn:'Stays in', selHotels:'selected stays', noResults:'No matches',
      tryReset:'Try adjusting the filters', freeCancel:'Free cancellation', onRequest:'on request',
      onBeach:'on the beach', noPricesNote:'No prices — you will receive an individual offer.',
      noInternalPrices:'No internal purchase prices are stored — a price only comes into existence when an offer is created.',
      transferIncl:'Transfer included...',
    }
  };
  // R43: Turkish and Ukrainian + native-language copy. English remains a safety fallback.
  I18N.tr = Object.assign({}, I18N.en, {"unitM":"m","kind":"Konaklama türü","yourContact":"İletişim kişiniz","noThreadYet":"Bir talep gönderdikten sonra seyahatinizle ilgilenen kişiye doğrudan iletişim hattınız burada görünür.","startRequest":"Konaklamaları keşfet","writeMsg":"Mesaj yaz","send":"Gönder","msgSent":"Mesaj gönderildi","replyTo":"Müşteriye yanıtla","threadFor":"Talep","you":"Siz","team":"ONLYONE ekibi","noMessages":"Henüz mesaj yok","newMsg":"Yeni mesaj","navConcierge":"VIP Asistan","navVip":"VIP geziler","conciergeTitle":"Kişisel VIP asistanınız","conciergeRole":"ONLYONE VIP Asistan · TÜRKİYE","conciergeLead":"İlk sorudan eve dönüşünüze kadar tek bir kişi seyahatinize eşlik eder.","cDo1":"İsteklerinize göre seçilen konaklamalar","cDo2":"Bağlayıcı olmayan kişisel teklif","cDo3":"Transferler, masalar, geziler","cDo4":"Seyahat boyunca ulaşılabilir","callNow":"Ara","writeWa":"WhatsApp’tan yaz","writeMail":"E-posta yaz","hours":"Her gün 08:00 – 22:00 yerel saat","excursions":"Geziler","excSub":"Otelin ötesinde","excAll":"Tüm geziler","excInterest":"İlgilendiğiniz geziler","excNote":"Geziler otel teklifiyle birlikte planlanır.","addToReq":"Talebime ekle","excAdded":"Talebinize eklendi","duration":"Süre","heroEyebrow":"Türkiye","heroScript":"Türkiye","heroTitle":"En seçkin adresler.","heroSub":"Nasıl seyahat etmek istediğinizi söyleyin — gerisini biz halledelim.","heroCta":"VIP asistanla başlayın","discover":"Konaklamaları keşfet","trust1":"Özenle seçilmiş konaklamalar","trust2":"Kişisel danışmanlık","trust3":"Kişiye özel teklifler","navHome":"Ana sayfa","navSearch":"Ara","navMap":"Harita","navFav":"Favoriler","navTrips":"Seyahatim","where":"Nereye?","wherePh":"Bölge seçin","dates":"Seyahat tarihleri","datesPh":"Tarih seçin","guests":"Misafirler","searchBtn":"Konaklama ara","recommended":"Önerilen","all":"Tümü","experiences":"Deneyimler","focusExcursions":"Geziler ve deneyimler","focusExcursionsSub":"Kapadokya’dan Efes’e seyahatiniz için en iyi fikirler.","vipMoments":"ONLYONE hareket halinde","vipMomentsSub":"Yat anları, özel geziler, etkinlikler, grup seyahatleri ve VIP karşılamalar.","vipServices":"VIP hizmetleri","vipServicesSub":"Transfer ve karşılama seyahatinize göre organize edilir.","destinationsShort":"Destinasyonlar","staysShort":"Konaklama keşfet","travelWays":"Nasıl seyahat etmek istersiniz?","destinations":"Destinasyonlar","selectedExperiences":"Seçili deneyimler","handpicked":"Sizin için seçildi","curatedOffers":"Seçili teklifler","curatedOffersSub":"Özel bir seyahat için özenle seçilmiş beş adres.","exploreSelf":"Kendiniz keşfedin","askVip":"VIP asistanınıza sorun","allExperiences":"Tüm deneyimler","planThisTrip":"Bu seyahati planla","noCatalog":"Hazır katalog paketleri yok — seyahati isteklerinize göre şekillendiriyoruz.","vipHead":"Sadece seyahat rezervasyonu<br>yapmaktan fazlasını yapıyoruz","vip1":"VIP hizmeti","vip1t":"İlk sorudan eve dönüşünüze kadar seyahatinizi tek kişi yönetir.","vip2":"Bildiğimiz adresler","vip2t":"Yalnızca kendimizin deneyimlediği yerler. Katalogdan rastgele seçim yok.","vipX":"Özel deneyimler","vipXt":"Yatlar, helikopterler, gastronomi ve özel turlar — zevkinize göre.","vip3":"VIP asistan her zaman ulaşılabilir","vip3t":"Masa, transfer, doktor — siz seyahatteyken telefondayız.","conciergeName":"Maria Grychko","conciergeMark":"MG","flyEyebrow":"Ulaşım","flyTitle":"Aktarmasız<br>varış","flySpecA":"Uçuş ve transfer","flySpecB":"7/24","flyBody":"Uçuş, varış havalimanından özel transfer ve çıkışta karşılama. Nereden uçtuğunuzu söyleyin — gerisini VIP asistanınız halleder.","flyCta":"VIP asistanınıza sorun","carEyebrow":"Transfer","carTitle":"Aracınız<br>hazır","carWord":"VIP TRANSFER","welcomeEyebrow":"Varış","welcomeTitle":"VIP karşılama","welcomeBody":"Varış havalimanında kişisel karşılama — isim tabelası, kısa yol, sıra yok.","yachtEyebrow":"Özel","yachtTitle":"Yat turu","yachtBody":"Sadece size özel tekne — rota, koylar ve mutfak tamamen isteğinize göre.","groupsEyebrow":"Grup seyahatleri","groupsTitle":"Kapadokya grup seyahati","groupsBody":"Küçük gruplar, özenli rehberlik ve ortak anlar — kitle turizmi olmadan premium bir grup deneyimi.","eventEyebrow":"Özel gün","eventTitle":"Özel akşam yemeği etkinlikleri","eventBody":"Atmosferden masa detaylarına kadar kişisel olarak planlanan zarif bir akşam.","pamukkaleEyebrow":"Gezi","pamukkaleTitle":"Pamukkale gezisi","pamukkaleBody":"Pamukkale’nin beyaz travertenlerine sakin ve konforlu premium gezi.","featuredOffer":"ONLYONE SEÇİMİ","featuredMeta":"Özel plaj · talep üzerine VIP transfer","moreSelected":"Diğer seçili teklifler","finalCtaEyebrow":"ONLYONE · VIP","finalCtaTitle":"Bize sadece nasıl seyahat etmek istediğinizi söyleyin.","finalCtaBody":"VIP asistanınız konaklama, transfer ve deneyimleri tek bir kişisel seyahatte birleştirir.","finalCtaButton":"VIP asistanla başlayın","blockMore":"Daha fazla bilgi","blockHow":"Nasıl çalışır","blockStep1":"Nasıl seyahat etmek istediğinizi söyleyin.","blockStep2":"VIP asistanınız tam bu seyahat için size özel bir teklif hazırlar.","blockStep3":"Siz onaylayın — gerisini biz halledelim.","blockAskText":"Hazır paketlerimiz yok: her teklif size özel hazırlanır. VIP asistanınıza yazın, biz hazırlayalım.","carSpecA":"Şoförlü veya şoförsüz","carSpecB":"Kapıdan kapıya","carBody":"Şoförlü araç sizi varış havalimanında karşılar ve konaklamanızın kapısına kadar götürür — sıra ve aktarma yok. Kendiniz kullanmak isterseniz araç, varışınızda hazır bekler.","regions":"Bölgeler","allRegions":"Tüm bölgeler","hotels":"konaklama","hotel":"Konaklama","filters":"Filtreler","apply":"Uygula","reset":"Sıfırla","results":"sonuç","category":"Kategori","holidayType":"Tatil türü","amenities":"Olanaklar","rating":"Puan","beachDist":"Plaj mesafesi","board":"Pansiyon","anyRating":"Tümü","from9":"9,0 ve üzeri","from85":"8,5 ve üzeri","from8":"8,0 ve üzeri","viewHotel":"Görüntüle","description":"Açıklama","location":"Konum","rooms":"Odalar","reviews":"yorum","policies":"Konaklama kuralları","map":"Harita","requestRoom":"Bu odayı talep et","interested":"Bu konaklama ilginizi çekiyor mu?","requestOffer":"Teklif iste","nonBinding":"Bağlayıcı değil","step":"Adım","of":"/","next":"İleri","back":"Geri","s1":"Seyahat tarihleri","s2":"Misafirler","s3":"Oda","s4":"İstekler","s5":"İletişim bilgileri","s6":"Özet","arrival":"Giriş","departure":"Çıkış","adults":"Yetişkinler","children":"Çocuklar","childAge":"Çocuk yaşı","roomWish":"Tercih edilen oda kategorisi","notSure":"Henüz emin değilim","wSea":"Deniz manzarası","wQuiet":"Sessiz oda","wTransfer":"Havalimanı transferi","wCot":"Bebek yatağı","wHoney":"Balayı","wBirthday":"Doğum günü","wAccess":"Engelsiz erişim","otherWishes":"Diğer istekler","firstName":"Ad","lastName":"Soyad","phone":"Telefon","email":"E-posta","whatsapp":"WhatsApp (isteğe bağlı)","sendRequest":"Bağlayıcı olmayan talep gönder","reqSent":"Talep başarıyla gönderildi","reqNo":"Talep numarası","reqTeamText":"Seyahat ekibimiz talebinizi inceliyor ve size özel bir teklif hazırlayacak.","myTrips":"Seyahatlerim","myFav":"Favori oteller","noTrips":"Henüz talebiniz yok","noFav":"Henüz favori otel eklemediniz","details":"Detaylar","viewOffer":"Teklifi görüntüle","yourOffer":"Kişisel teklifiniz","total":"Toplam fiyat","nights":"gece","acceptOffer":"Teklifi kabul et","askBack":"Soru sor","payNow":"Şimdi güvenli öde","paid":"Ödendi","validUntil":"Geçerlilik tarihi","stNew":"Talep alındı","stCheck":"İnceleniyor","stOffer":"Teklif hazırlandı","stAccepted":"Müşteri onayladı","stPay":"Ödeme bekleniyor","stPaid":"Ödendi","stConfirmed":"Rezervasyon onaylandı","menu":"Menü","mContact":"İletişim","mLang":"Dil","mStaff":"Personel girişi","mIntro":"Girişi izle","compare":"Karşılaştır","staffArea":"Personel alanı","dashboard":"Kontrol paneli","requests":"Talepler","bookings":"Rezervasyonlar","customers":"Müşteriler","more":"Daha fazla","today":"Bugün","total_":"toplam","newReq":"Yeni talepler","openOffers":"Açık teklifler","waitCust":"Müşteri bekleniyor","payOpen":"Ödeme bekleniyor","newBook":"Yeni rezervasyonlar","openReq":"Açık talep","createOffer":"Teklif oluştur","sellPrice":"Satış fiyatı","currency":"Para birimi","internalNote":"Dahili not","custInfo":"Müşteri bilgileri","sendOffer":"Teklifi gönder","createPayLink":"Ödeme bağlantısı oluştur","payLinkDone":"Ödeme bağlantısı oluşturuldu","copyLink":"Bağlantıyı kopyala","sendWa":"WhatsApp ile gönder","guestData":"Müşteri bilgileri","period":"Dönem","roomReq":"Oda tercihi","custWishes":"Müşteri istekleri","staffOnly":"Fiyatlar yalnızca personel tarafından görülebilir","backToCust":"Misafir alanına dön","confirmHotel":"Onayı kaydet","tripConfirmed":"Seyahat onaylandı","offerSentWait":"Teklif gönderildi. Müşteri bekleniyor.","demoPay":"Demo ödeme","payDemoNote":"Yalnızca gösterim amaçlıdır. Gerçek ödeme alınmaz.","payNowBtn":"Öde (demo)","cardNo":"Kart numarası","login":"Giriş yap","staffLogin":"Personel girişi","loginNote":"Demo erişim — herhangi bir isim girin.","yourName":"Adınız","addFav":"Favorilere eklendi","remFav":"Favorilerden çıkarıldı","offerSent":"Teklif müşteriye gönderildi","offerAccepted":"Teklif kabul edildi","linkCopied":"Bağlantı kopyalandı","paidOk":"Ödeme alındı","hotelConfirmed":"Konaklama rezervasyonu onayladı","questionSent":"Soru ekibe gönderildi","shared":"Bağlantı kopyalandı","adultsShort":"yet.","childrenShort":"çoc.","sqm":"m²","persons":"misafir","yrs":"yaş","exceptional":"Olağanüstü","wonderful":"Harika","veryGood":"Çok iyi","selectRegion":"Bölge seç","done":"Tamam","required":"Lütfen zorunlu alanları doldurun","contactUs":"İletişim","contactTxt":"Ekibimiz aynı gün yanıt verir.","hotelsIn":"Konaklamalar:","selHotels":"seçili konaklama","noResults":"Eşleşme yok","tryReset":"Filtreleri değiştirmeyi deneyin","freeCancel":"Ücretsiz iptal","onRequest":"talep üzerine","onBeach":"sahilde","noPricesNote":"Fiyat gösterilmez — size özel teklif alırsınız.","noInternalPrices":"Dahili alış fiyatları saklanmaz — fiyat yalnızca teklif oluşturulduğunda belirlenir.","transferIncl":"Transfer dahil..."});
  I18N.uk = Object.assign({}, I18N.en, {"unitM":"м","kind":"Тип проживання","yourContact":"Ваш контакт","noThreadYet":"Після надсилання запиту тут з’явиться прямий зв’язок із людиною, яка супроводжує вашу подорож.","startRequest":"Переглянути проживання","writeMsg":"Написати повідомлення","send":"Надіслати","msgSent":"Повідомлення надіслано","replyTo":"Відповісти клієнту","threadFor":"Запит","you":"Ви","team":"Команда ONLYONE","noMessages":"Повідомлень ще немає","newMsg":"Нове повідомлення","navConcierge":"VIP-асистент","navVip":"VIP-екскурсії","conciergeTitle":"Ваш персональний VIP-асистент","conciergeRole":"ONLYONE VIP-асистент · ТУРЕЧЧИНА","conciergeLead":"Одна людина супроводжує вашу подорож — від першого запитання до повернення додому.","cDo1":"Проживання, підібране за вашими побажаннями","cDo2":"Індивідуальна пропозиція без зобов’язань","cDo3":"Трансфери, столики, екскурсії","cDo4":"На зв’язку під час подорожі","callNow":"Зателефонувати","writeWa":"Написати у WhatsApp","writeMail":"Написати e-mail","hours":"Щодня 08:00 – 22:00 за місцевим часом","excursions":"Екскурсії","excSub":"Більше, ніж готель","excAll":"Усі екскурсії","excInterest":"Екскурсії, які вас цікавлять","excNote":"Екскурсії узгоджуються разом із пропозицією готелю.","addToReq":"Додати до мого запиту","excAdded":"Додано до вашого запиту","duration":"Тривалість","heroEyebrow":"Туреччина","heroScript":"Туреччина","heroTitle":"Найкращі адреси.","heroSub":"Розкажіть, як ви любите подорожувати — про решту подбаємо ми.","heroCta":"Почати з VIP-асистентом","discover":"Підібрати проживання","trust1":"Ретельно відібране проживання","trust2":"Персональна консультація","trust3":"Індивідуальні пропозиції","navHome":"Головна","navSearch":"Пошук","navMap":"Карта","navFav":"Обране","navTrips":"Моя подорож","where":"Куди?","wherePh":"Оберіть регіон","dates":"Дати подорожі","datesPh":"Оберіть дати","guests":"Гості","searchBtn":"Знайти проживання","recommended":"Рекомендуємо","all":"Усі","experiences":"Враження","focusExcursions":"Екскурсії та враження","focusExcursionsSub":"Найкращі ідеї для вашої подорожі — від Каппадокії до Ефеса.","vipMoments":"ONLYONE у русі","vipMomentsSub":"Яхти, особливі екскурсії, приватні події, групові подорожі та VIP-зустрічі.","vipServices":"VIP-сервіси","vipServicesSub":"Трансфер і зустріч організуємо під вашу подорож.","destinationsShort":"Напрямки","staysShort":"Підібрати проживання","travelWays":"Як ви хочете подорожувати?","destinations":"Напрямки","selectedExperiences":"Обрані враження","handpicked":"Відібрано для вас","curatedOffers":"Обрані пропозиції","curatedOffersSub":"П’ять ретельно відібраних адрес для особливої подорожі.","exploreSelf":"Дослідити самостійно","askVip":"Запитати VIP-асистента","allExperiences":"Усі враження","planThisTrip":"Спланувати цю подорож","noCatalog":"Без каталогів і стандартних пакетів — ми формуємо подорож під ваші побажання.","vipHead":"Ми робимо більше,<br>ніж просто бронюємо подорожі","vip1":"VIP-сервіс","vip1t":"Одна людина веде вашу подорож — від першого запитання до повернення додому.","vip2":"Адреси, які ми знаємо","vip2t":"Лише місця, які ми перевірили особисто. Нічого випадкового з каталогу.","vipX":"Ексклюзивні враження","vipXt":"Яхти, гелікоптери, гастрономія та приватні тури — на ваш смак.","vip3":"VIP-асистент на зв’язку","vip3t":"Столик, трансфер, лікар — поки ви подорожуєте, ми на зв’язку.","conciergeName":"Maria Grychko","conciergeMark":"MG","flyEyebrow":"Дорога","flyTitle":"Прибуття<br>без зайвих пересадок","flySpecA":"Переліт і трансфер","flySpecB":"Цілодобово","flyBody":"Переліт, приватний трансфер з аеропорту призначення та зустріч біля виходу. Скажіть, звідки летите — решту організує ваш VIP-асистент.","flyCta":"Запитати VIP-асистента","carEyebrow":"Трансфер","carTitle":"Ваш автомобіль<br>уже чекає","carWord":"VIP ТРАНСФЕР","welcomeEyebrow":"Прибуття","welcomeTitle":"VIP-зустріч","welcomeBody":"Особиста зустріч в аеропорту призначення — табличка з ім’ям, короткий шлях, без черг.","yachtEyebrow":"Ексклюзив","yachtTitle":"Яхт-тур","yachtBody":"Яхта лише для вас — маршрут, бухти й кухня саме за вашими побажаннями.","groupsEyebrow":"Групові подорожі","groupsTitle":"Групова подорож до Каппадокії","groupsBody":"Невеликі групи, продуманий супровід і спільні враження — преміальний формат без масового туризму.","eventEyebrow":"Особлива подія","eventTitle":"Приватна вечеря","eventBody":"Елегантний вечір, персонально організований від атмосфери до кожної деталі столу.","pamukkaleEyebrow":"Екскурсія","pamukkaleTitle":"Екскурсія до Памуккале","pamukkaleBody":"Спокійна преміальна екскурсія до білих травертинів Памуккале — комфортно й без поспіху.","featuredOffer":"ВИБІР ONLYONE","featuredMeta":"Приватний пляж · VIP-трансфер за запитом","moreSelected":"Інші обрані пропозиції","finalCtaEyebrow":"ONLYONE · VIP","finalCtaTitle":"Просто розкажіть, як ви хочете подорожувати.","finalCtaBody":"Ваш VIP-асистент об’єднає проживання, трансфери та враження в одну персональну подорож.","finalCtaButton":"Почати з VIP-асистентом","blockMore":"Детальніше","blockHow":"Як це працює","blockStep1":"Розкажіть, як ви хочете подорожувати.","blockStep2":"Ваш VIP-асистент підготує пропозицію саме для цієї подорожі.","blockStep3":"Ви підтверджуєте — решту беремо на себе.","blockAskText":"Готових пакетів немає: кожна пропозиція створюється для вас. Напишіть VIP-асистенту — і ми все підготуємо.","carSpecA":"З водієм або без","carSpecB":"Від дверей до дверей","carBody":"Автомобіль із водієм зустріне вас в аеропорту призначення та довезе до дверей проживання — без черг і пересадок. Якщо хочете керувати самі, автомобіль чекатиме на вас після прильоту.","regions":"Регіони","allRegions":"Усі регіони","hotels":"варіантів","hotel":"Проживання","filters":"Фільтри","apply":"Застосувати","reset":"Скинути","results":"результатів","category":"Категорія","holidayType":"Тип відпочинку","amenities":"Зручності","rating":"Оцінка","beachDist":"Відстань до пляжу","board":"Харчування","anyRating":"Будь-яка","from9":"від 9,0","from85":"від 8,5","from8":"від 8,0","viewHotel":"Переглянути","description":"Опис","location":"Розташування","rooms":"Номери","reviews":"відгуків","policies":"Правила проживання","map":"Карта","requestRoom":"Запросити цей номер","interested":"Цікавить це проживання?","requestOffer":"Запросити пропозицію","nonBinding":"Без зобов’язань","step":"Крок","of":"з","next":"Далі","back":"Назад","s1":"Дати подорожі","s2":"Гості","s3":"Номер","s4":"Побажання","s5":"Контактні дані","s6":"Огляд","arrival":"Заїзд","departure":"Виїзд","adults":"Дорослі","children":"Діти","childAge":"Вік дитини","roomWish":"Бажана категорія номера","notSure":"Ще не визначився/лась","wSea":"Вид на море","wQuiet":"Тихий номер","wTransfer":"Трансфер з аеропорту","wCot":"Дитяче ліжечко","wHoney":"Медовий місяць","wBirthday":"День народження","wAccess":"Безбар’єрний доступ","otherWishes":"Інші побажання","firstName":"Ім’я","lastName":"Прізвище","phone":"Телефон","email":"E-mail","whatsapp":"WhatsApp (необов’язково)","sendRequest":"Надіслати запит без зобов’язань","reqSent":"Запит успішно надіслано","reqNo":"Номер запиту","reqTeamText":"Наша команда опрацює ваш запит і підготує індивідуальну пропозицію.","myTrips":"Мої подорожі","myFav":"Обрані готелі","noTrips":"У вас ще немає запитів","noFav":"Ви ще не додали готелі до обраного","details":"Деталі","viewOffer":"Переглянути пропозицію","yourOffer":"Ваша персональна пропозиція","total":"Загальна вартість","nights":"ночей","acceptOffer":"Прийняти пропозицію","askBack":"Поставити запитання","payNow":"Безпечно оплатити зараз","paid":"Оплачено","validUntil":"Дійсно до","stNew":"Запит отримано","stCheck":"На перевірці","stOffer":"Пропозицію підготовлено","stAccepted":"Клієнт підтвердив","stPay":"Очікується оплата","stPaid":"Оплачено","stConfirmed":"Бронювання підтверджено","menu":"Меню","mContact":"Контакти","mLang":"Мова","mStaff":"Вхід для співробітників","mIntro":"Переглянути заставку","compare":"Порівняти","staffArea":"Зона співробітників","dashboard":"Панель","requests":"Запити","bookings":"Бронювання","customers":"Клієнти","more":"Більше","today":"Сьогодні","total_":"усього","newReq":"Нові запити","openOffers":"Відкриті пропозиції","waitCust":"Очікуємо клієнта","payOpen":"Очікується оплата","newBook":"Нові бронювання","openReq":"Відкритий запит","createOffer":"Створити пропозицію","sellPrice":"Ціна продажу","currency":"Валюта","internalNote":"Внутрішня примітка","custInfo":"Інформація про клієнта","sendOffer":"Надіслати пропозицію","createPayLink":"Створити посилання на оплату","payLinkDone":"Посилання на оплату створено","copyLink":"Копіювати посилання","sendWa":"Надіслати через WhatsApp","guestData":"Дані клієнта","period":"Період","roomReq":"Побажання щодо номера","custWishes":"Побажання клієнта","staffOnly":"Ціни видно лише співробітникам","backToCust":"Повернутися до гостьової зони","confirmHotel":"Зафіксувати підтвердження","tripConfirmed":"Подорож підтверджено","offerSentWait":"Пропозицію надіслано. Очікуємо клієнта.","demoPay":"Демо-оплата","payDemoNote":"Лише демонстрація. Реальна оплата не проводиться.","payNowBtn":"Оплатити (демо)","cardNo":"Номер картки","login":"Увійти","staffLogin":"Вхід для співробітників","loginNote":"Демо-доступ — введіть будь-яке ім’я.","yourName":"Ваше ім’я","addFav":"Додано до обраного","remFav":"Видалено з обраного","offerSent":"Пропозицію надіслано клієнту","offerAccepted":"Пропозицію прийнято","linkCopied":"Посилання скопійовано","paidOk":"Оплату отримано","hotelConfirmed":"Об’єкт підтвердив бронювання","questionSent":"Запитання надіслано команді","shared":"Посилання скопійовано","adultsShort":"дор.","childrenShort":"діт.","sqm":"м²","persons":"гостей","yrs":"р.","exceptional":"Винятково","wonderful":"Чудово","veryGood":"Дуже добре","selectRegion":"Оберіть регіон","done":"Готово","required":"Будь ласка, заповніть обов’язкові поля","contactUs":"Контакти","contactTxt":"Наша команда відповідає того ж дня.","hotelsIn":"Проживання в","selHotels":"обраних варіантів","noResults":"Нічого не знайдено","tryReset":"Спробуйте змінити фільтри","freeCancel":"Безкоштовне скасування","onRequest":"за запитом","onBeach":"на пляжі","noPricesNote":"Ціни не показуємо — ви отримаєте індивідуальну пропозицію.","noInternalPrices":"Внутрішні закупівельні ціни не зберігаються — ціна з’являється лише під час створення пропозиції.","transferIncl":"Трансфер включено..."});
  const EXTRA_TEXT = {tr:{"CURRENT":"GÜNCEL","Cappadocia · balloon season":"Kapadokya · balon sezonu","Themed journey · on request":"Tematik seyahat · talep üzerine","Event management":"Etkinlik yönetimi","Private events · venue · organisation":"Özel etkinlikler · mekân · organizasyon","GROUP":"GRUP","Sports & group events":"Spor ve grup etkinlikleri","Teams · tournaments · special journeys":"Takımlar · turnuvalar · özel seyahatler","Private yacht day":"Özel yat günü","Route & yacht tailored":"Rota ve yat size özel","ESCAPE":"KAÇAMAK","Private Beach Escape":"Özel Plaj Kaçamağı","Beach club · sunset · relax":"Beach club · gün batımı · dinlenme","TOUR":"TUR","Pamukkale · private day":"Pamukkale · özel gün","Private · no online price":"Özel · online fiyat yok","Super Deal · Resort Escape":"Özel Fırsat · Resort Kaçamağı","Large private seaside escape · on request":"Deniz kenarında özel tatil · talep üzerine","Villas":"Villalar","Private · individual":"Özel · kişisel","Beach resorts":"Sahil resortları","Sea · sun · escape":"Deniz · güneş · dinlenme","Group tours":"Grup turları","Themed journeys":"Tematik seyahatler","Sports journeys":"Spor seyahatleri","Active · nature · sea":"Aktif · doğa · deniz","Events · groups · private occasions":"Etkinlikler · gruplar · özel günler","ARRIVAL":"VARIŞ","VIP Welcome":"VIP Karşılama","Personal airport welcome and assistance.":"Havalimanında kişisel karşılama ve eşlik.","Business Van":"Business Van","AIR":"HAVA","Helicopter Transfer":"Helikopter Transferi","Premium welcome and fast transfer by air.":"Premium karşılama ve hızlı hava transferi.","Current offers":"Güncel teklifler","Offers, tours and special recommendations — what matters right now.":"Fırsatlar, turlar ve özel öneriler — şu anda öne çıkanlar.","Super Deal":"Özel Fırsat","The big offer of the month — presented larger with more breathing room.":"Ayın büyük fırsatı — daha fazla alan ve daha güçlü vurgu.","View":"Görüntüle","VIP enquiry":"VIP talebi","VIP assistant on call":"VIP asistanınız hazır","Leave your name and phone number — your VIP assistant will call you personally.":"Adınızı ve telefonunuzu bırakın — VIP asistanınız sizinle kişisel olarak iletişime geçsin.","Name":"İsim","Your name":"Adınız","Phone":"Telefon","Send request":"Talep gönder","No obligation. Your number is used only for this request.":"Bağlayıcı değildir. Numaranız yalnızca bu talep için kullanılır.","How would you like to travel?":"Nasıl seyahat etmek istersiniz?","Five travel worlds for different ways to explore.":"Farklı seyahat tarzları için beş dünya.","Hotels selected by us for an exceptional journey.":"Özel bir seyahat için bizim seçtiğimiz oteller.","Private beach · VIP transfer on request":"Özel plaj · talep üzerine VIP transfer","Learn more":"Daha fazla bilgi","Your journey begins before you land.":"Seyahatiniz daha inmeden başlar.","Flight, VIP welcome and transfer — personally arranged as one journey.":"Uçuş, VIP karşılama ve transfer — tek bir seyahat olarak kişisel şekilde organize edilir.","Arrange a flight":"Uçuş organize et","A short request — your VIP assistant confirms the details personally.":"Kısa bir talep — VIP asistanınız detayları sizinle kişisel olarak netleştirir.","Personal welcome":"Kişisel karşılama","No online prices":"Online fiyat yok","One contact":"Tek iletişim","Quick contact":"Hızlı iletişim","Send your name and phone number — your VIP assistant will contact you personally.":"Adınızı ve telefonunuzu gönderin — VIP asistanınız sizinle kişisel olarak iletişime geçsin.","Send":"Gönder","VIP Transfer":"VIP Transfer","Start with a short request, then add details. Leave the key data and our team will confirm the right vehicle.":"Önce kısa bir talep gönderin, detayları sonra ekleyin. Temel bilgileri bırakın; ekibimiz uygun aracı teyit eder.","Pickup":"Alış noktası","Airport, hotel ...":"Havalimanı, otel ...","Destination":"Varış noktası","Hotel, villa ...":"Otel, villa ...","Date":"Tarih","Time":"Saat","Guests":"Misafirler","Flight number":"Uçuş numarası","Luggage":"Bagaj","2 suitcases":"2 valiz","Child seat":"Çocuk koltuğu","Not needed":"Gerekli değil","Baby":"Bebek","Child":"Çocuk","Note":"Not","For example: meet & greet, sign, lots of luggage":"Örneğin: karşılama, tabela, fazla bagaj","Send transfer request":"Transfer talebi gönder","Please enter name and phone":"Lütfen isim ve telefon girin","Thank you. Your VIP assistant will contact you personally.":"Teşekkürler. VIP asistanınız sizinle kişisel olarak iletişime geçecek.","Thank you. Your VIP assistant will confirm the transfer details personally.":"Teşekkürler. VIP asistanınız transfer detaylarını sizinle kişisel olarak netleştirecek.","Please complete the required fields":"Lütfen zorunlu alanları doldurun","Detailed transfer request sent":"Detaylı transfer talebi gönderildi","Alanya":"Alanya","Belek":"Belek","Kemer":"Kemer","Konyaaltı":"Konyaaltı","Lara":"Lara","Side":"Side","Antalya City":"Antalya Merkez","Old town & harbour":"Eski şehir ve marina","Pebble beach below the mountains":"Dağların eteklerinde çakıl plaj","Sand beach & resorts":"Kum plaj ve resortlar","Golf & pine forest":"Golf ve çam ormanları","Taurus meets the sea":"Toroslar denizle buluşuyor","Antiquity & beach":"Antik kent ve plaj","Castle above the bay":"Koyun üzerinde kale","Luxury":"Lüks","Family":"Aile","Adults only":"Sadece yetişkinler","Golf":"Golf","Beach":"Plaj","Wellness":"Wellness","Boutique":"Butik","City":"Şehir","All inclusive":"Her şey dahil","Private beach":"Özel plaj","Pool":"Havuz","Spa":"Spa","Kids club":"Çocuk kulübü","Sea view":"Deniz manzarası","Transfer":"Transfer","Restaurant":"Restoran","Fitness":"Fitness","Aquapark":"Aquapark","Resort":"Resort","Hotel":"Otel","Boutique hotel":"Butik otel","Apartment":"Daire","Residence":"Rezidans","Villa":"Villa","Breakfast":"Kahvaltı","Half board":"Yarım pansiyon","Ultra all inclusive":"Ultra her şey dahil","Deluxe Sea View":"Deluxe Deniz Manzaralı","1 king bed":"1 king yatak","Family Suite":"Aile Süiti","2 bedrooms":"2 yatak odası","Swim-up Room":"Havuza Direkt Erişimli Oda","Garden Villa":"Bahçe Villası","Sea View Villa":"Deniz Manzaralı Villa","3 bedrooms":"3 yatak odası","Classic Room":"Klasik Oda","1 double bed":"1 çift kişilik yatak","Terrace Room":"Teraslı Oda","Balcony":"Balkon","Kids area":"Çocuk alanı","Private pool":"Özel havuz","Terrace":"Teras","Half or full day":"Yarım veya tam gün","Private yacht tours":"Özel yat turları","Antalya, Kemer, Fethiye or Bodrum — we tailor the yacht, bays, route and details of the day personally.":"Antalya, Kemer, Fethiye veya Bodrum — yatı, koyları, rotayı ve günün detaylarını size özel planlıyoruz.","2 days":"2 gün","Cappadocia":"Kapadokya","Valleys of fairy chimneys, cave churches and a balloon flight at sunrise.":"Peri bacaları vadileri, kaya kiliseleri ve gün doğumunda balon uçuşu.","1 day":"1 gün","Pamukkale & Hierapolis":"Pamukkale ve Hierapolis","Snow-white travertine terraces of thermal water and the ancient city above them.":"Bembeyaz termal travertenler ve üzerindeki antik kent.","Ephesus":"Efes","Marble streets, the Library of Celsus and one of the largest ancient theatres.":"Mermer caddeler, Celsus Kütüphanesi ve antik dünyanın en büyük tiyatrolarından biri.","Ölüdeniz — Blue Lagoon":"Ölüdeniz — Mavi Lagün","A turquoise lagoon, Belcekiz beach and paragliding from Mount Babadag.":"Turkuaz lagün, Belcekız Plajı ve Babadağ’dan yamaç paraşütü.","Istanbul":"İstanbul","The Bosphorus, Hagia Sophia and the Grand Bazaar — a short flight from Antalya.":"Boğaz, Ayasofya ve Kapalıçarşı — Antalya’dan kısa bir uçuşla.","Always reachable":"Her zaman ulaşılabilir","One line, one person — 24/7":"Tek hat, tek kişi — 7/24","Tailor-made":"Size özel","Offers without a booking form":"Rezervasyon formu olmadan teklifler","With you there":"Yanınızda","Transfers, tables, excursions":"Transferler, masalar, geziler","Seaside resorts where beach, service and calm genuinely belong together.":"Plaj, hizmet ve huzurun gerçekten bir araya geldiği sahil resortları.","Private · individual · exceptional":"Özel · kişisel · ayrıcalıklı","Private villas with pools, views and space entirely your own.":"Havuzlu, manzaralı ve tamamen size ait alan sunan özel villalar.","Thoughtful journeys for small groups — culture, nature, gastronomy and special themes.":"Küçük gruplar için özenle planlanan kültür, doğa, gastronomi ve tematik seyahatler.","Events · incentives · private occasions":"Etkinlikler · incentive · özel günler","From venue and transfers to dinner and programme — one team coordinates the entire occasion.":"Mekândan transfere, akşam yemeğinden programa kadar tüm organizasyonu tek ekip yönetir.","Antalya":"Antalya","Turkish Riviera":"Türk Rivierası","Sea, mountains, old town and a broad choice of resorts from Kemer to Alanya.":"Deniz, dağlar, eski şehir ve Kemer’den Alanya’ya geniş resort seçeneği.","Bodrum":"Bodrum","Aegean elegance":"Ege zarafeti","White houses, marinas, private bays and the stylish Turkish Aegean.":"Beyaz evler, marinalar, özel koylar ve şık Türk Egesi.","Fethiye & Ölüdeniz":"Fethiye ve Ölüdeniz","Pure nature":"Saf doğa","Blue lagoons, bays, yachts and mountain scenery along the Lycian coast.":"Likya kıyısında mavi lagünler, koylar, yatlar ve dağ manzaraları.","Culture & history":"Kültür ve tarih","The Bosphorus, gastronomy, history and contemporary city energy.":"Boğaz, gastronomi, tarih ve modern şehir enerjisi.","Magical landscapes":"Büyülü manzaralar","Rock valleys, cave hotels and sunrise among hot-air balloons.":"Kaya vadileri, mağara oteller ve balonların arasında gün doğumu.","Çeşme & Alaçatı":"Çeşme ve Alaçatı","Relaxed & stylish":"Rahat ve şık","Aegean beaches, boutique hotels, restaurants and Alaçatı atmosphere.":"Ege plajları, butik oteller, restoranlar ve Alaçatı atmosferi.","Private yacht tour":"Özel yat turu","A day on the sea":"Denizde bir gün","Pamukkale":"Pamukkale","Explore the thermal terraces":"Termal travertenleri keşfedin","Ancient sites":"Antik kentler","Discover history":"Tarihi keşfedin","Luxurious resort between the Taurus mountains and the Mediterranean.":"Toros Dağları ile Akdeniz arasında lüks resort.","Expansive resort in the pine forest with golf courses.":"Çam ormanında golf sahalarıyla geniş resort.","A small house by the pebble beach of Konyaaltı.":"Konyaaltı çakıl plajı yanında küçük bir otel.","Resort on the Lara sand beach with a large spa.":"Lara kum plajında büyük spa merkezli resort.","A historic house in the old town by the yacht harbour.":"Yat limanı yakınındaki eski şehirde tarihi konak.","Resort within walking distance of the ancient theatre of Side.":"Side antik tiyatrosuna yürüme mesafesinde resort.","Rooms with terraces facing the Alanya castle.":"Alanya Kalesi manzaralı teraslı odalar.","Top-tier golf resort with an extensive spa.":"Geniş spa alanına sahip üst düzey golf resortu.","Individual villas with private pools above the bay.":"Koyun üzerinde özel havuzlu bağımsız villalar.","Family hotel opposite Konyaaltı beach.":"Konyaaltı Plajı karşısında aile oteli.","Large resort with an aquapark right on the beach.":"Sahilde büyük aquaparklı resort.","A classic all-inclusive resort by the sea.":"Deniz kenarında klasik her şey dahil resort.","Quiet suites in the lanes of Kaleiçi.":"Kaleiçi sokaklarında sakin süitler.","A small hotel for golfers among the pines.":"Çamlar arasında golf severler için küçük otel.","Right on the famous Cleopatra beach.":"Ünlü Kleopatra Plajı’nın hemen üzerinde.","A secluded house in the Adrasan bay.":"Adrasan koyunda sakin ve izole bir konaklama.","Resort with wide terraces above the sea.":"Denizin üzerinde geniş teraslı resort.","A modern boutique hotel by the new marina.":"Yeni marina yanında modern butik otel.","Villas in orange groves near Side.":"Side yakınında portakal bahçeleri içinde villalar.","A hotel on the cliff with a panorama of the bay.":"Körfez panoramalı falez üzerinde otel.","Resort with a large aquapark for families.":"Aileler için büyük aquaparklı resort.","Close to ancient Olympos and the beach.":"Antik Olympos ve plaja yakın.","Hillside villas overlooking the bay.":"Körfez manzaralı yamaç villaları.","An adults-only spa retreat.":"Sadece yetişkinlere özel spa kaçamağı.","ONLYONE · Luxury Travel in Türkiye":"ONLYONE · Türkiye’de Lüks Seyahat","Tailored travel in Türkiye, handpicked stays and a personal VIP assistant.":"Türkiye’de size özel seyahatler, özenle seçilmiş konaklamalar ve kişisel VIP asistan.","NOW":"ŞİMDİ","SUPER DEAL":"ÖZEL FIRSAT","TÜRKİYE":"TÜRKİYE","SELECTED":"SEÇİLMİŞ","Best Hotels":"En iyi oteller","ONLYONE CHOICE":"ONLYONE SEÇİMİ","VIP SERVICES":"VIP HİZMETLERİ","PRIVATE AVIATION":"ÖZEL HAVACILIK","EVENTS":"ETKİNLİKLER","Venue · transfer · dinner · programme":"Mekân · transfer · akşam yemeği · program","EVENT":"ETKİNLİK","SPECIAL":"ÖZEL","Hotels":"Oteller","Selected houses":"Seçilmiş adresler","VIP excursions":"VIP geziler","Private routes":"Özel rotalar","Welcome & transfer":"Karşılama ve transfer","From the plane to the hotel":"Uçaktan otele","VIP assistant":"VIP asistan","One person for everything":"Her şey için tek kişi","SEA":"DENİZ","Private yacht":"Özel yat","Route, yacht and a day on the water — entirely to your taste.":"Rota, yat ve suda geçen bir gün — tamamen sizin zevkinize göre.","ROAD":"YOL","Car transfer":"Araç transferi","With or without a chauffeur — comfortable for a family, a team or a small group.":"Şoförlü veya şoförsüz — aile, ekip ya da küçük grup için konforlu bir araç.","VIP welcome, yacht & transfer":"VIP karşılama, yat ve transfer","Personal welcome, private yacht, car transfer and helicopter — arranged individually.":"Kişisel karşılama, özel yat, araç transferi ve helikopter — tamamı size özel organize edilir.","Email":"E-posta","Antalya, Türkiye":"Antalya, Türkiye","Address":"Adres","Your VIP transport is waiting for you":"VIP transferiniz sizi bekliyor","ONLY ONE TRAVEL · VIP TRANSFER":"ONLY ONE TRAVEL · VIP TRANSFER","The finest stays":"En güzel konaklamalar"},uk:{"CURRENT":"АКТУАЛЬНО","Cappadocia · balloon season":"Каппадокія · сезон повітряних куль","Themed journey · on request":"Тематична подорож · за запитом","Event management":"Івент-менеджмент","Private events · venue · organisation":"Приватні події · локація · організація","GROUP":"ГРУПА","Sports & group events":"Спорт і групові заходи","Teams · tournaments · special journeys":"Команди · турніри · особливі подорожі","Private yacht day":"Приватний день на яхті","Route & yacht tailored":"Маршрут і яхта індивідуально","ESCAPE":"ВІДПОЧИНОК","Private Beach Escape":"Приватний пляжний відпочинок","Beach club · sunset · relax":"Пляжний клуб · захід сонця · релакс","TOUR":"ТУР","Pamukkale · private day":"Памуккале · приватний день","Private · no online price":"Індивідуально · без ціни онлайн","Super Deal · Resort Escape":"Спецпропозиція · відпочинок на курорті","Large private seaside escape · on request":"Великий приватний відпочинок біля моря · за запитом","Villas":"Вілли","Private · individual":"Приватно · індивідуально","Beach resorts":"Пляжні курорти","Sea · sun · escape":"Море · сонце · відпочинок","Group tours":"Групові тури","Themed journeys":"Тематичні подорожі","Sports journeys":"Спортивні подорожі","Active · nature · sea":"Активно · природа · море","Events · groups · private occasions":"Події · групи · приватні свята","ARRIVAL":"ПРИБУТТЯ","VIP Welcome":"VIP-зустріч","Personal airport welcome and assistance.":"Особиста зустріч в аеропорту та супровід.","Business Van":"Business Van","AIR":"ПОВІТРЯ","Helicopter Transfer":"Трансфер гелікоптером","Premium welcome and fast transfer by air.":"Преміальна зустріч і швидкий повітряний трансфер.","Current offers":"Актуальні пропозиції","Offers, tours and special recommendations — what matters right now.":"Пропозиції, тури та особливі рекомендації — те, що актуально саме зараз.","Super Deal":"Спецпропозиція","The big offer of the month — presented larger with more breathing room.":"Головна пропозиція місяця — більше простору й сильніший акцент.","View":"Переглянути","VIP enquiry":"VIP-запит","VIP assistant on call":"VIP-асистент на зв’язку","Leave your name and phone number — your VIP assistant will call you personally.":"Залиште ім’я та номер телефону — ваш VIP-асистент зв’яжеться з вами особисто.","Name":"Ім’я","Your name":"Ваше ім’я","Phone":"Телефон","Send request":"Надіслати запит","No obligation. Your number is used only for this request.":"Без зобов’язань. Номер використовується лише для цього запиту.","How would you like to travel?":"Як ви хочете подорожувати?","Five travel worlds for different ways to explore.":"П’ять форматів подорожі для різного ритму відпочинку.","Hotels selected by us for an exceptional journey.":"Відібрані нами готелі для особливої подорожі.","Private beach · VIP transfer on request":"Приватний пляж · VIP-трансфер за запитом","Learn more":"Детальніше","Your journey begins before you land.":"Ваша подорож починається ще до посадки.","Flight, VIP welcome and transfer — personally arranged as one journey.":"Переліт, VIP-зустріч і трансфер — персонально організовані як одна подорож.","Arrange a flight":"Організувати переліт","A short request — your VIP assistant confirms the details personally.":"Короткий запит — ваш VIP-асистент особисто уточнить деталі.","Personal welcome":"Особиста зустріч","No online prices":"Без цін онлайн","One contact":"Одна контактна особа","Quick contact":"Швидкий зв’язок","Send your name and phone number — your VIP assistant will contact you personally.":"Надішліть ім’я та номер телефону — VIP-асистент зв’яжеться з вами особисто.","Send":"Надіслати","VIP Transfer":"VIP-трансфер","Start with a short request, then add details. Leave the key data and our team will confirm the right vehicle.":"Почніть із короткого запиту, а деталі додайте потім. Залиште основні дані — команда підтвердить відповідний автомобіль.","Pickup":"Місце подачі","Airport, hotel ...":"Аеропорт, готель ...","Destination":"Куди","Hotel, villa ...":"Готель, вілла ...","Date":"Дата","Time":"Час","Guests":"Гості","Flight number":"Номер рейсу","Luggage":"Багаж","2 suitcases":"2 валізи","Child seat":"Дитяче крісло","Not needed":"Не потрібно","Baby":"Немовля","Child":"Дитина","Note":"Примітка","For example: meet & greet, sign, lots of luggage":"Наприклад: зустріч біля виходу, табличка, багато багажу","Send transfer request":"Надіслати запит на трансфер","Please enter name and phone":"Введіть ім’я та телефон","Thank you. Your VIP assistant will contact you personally.":"Дякуємо. VIP-асистент зв’яжеться з вами особисто.","Thank you. Your VIP assistant will confirm the transfer details personally.":"Дякуємо. VIP-асистент особисто уточнить деталі трансферу.","Please complete the required fields":"Заповніть обов’язкові поля","Detailed transfer request sent":"Детальний запит на трансфер надіслано","Alanya":"Аланія","Belek":"Белек","Kemer":"Кемер","Konyaaltı":"Коньяалти","Lara":"Лара","Side":"Сіде","Antalya City":"Анталья","Old town & harbour":"Старе місто та гавань","Pebble beach below the mountains":"Гальковий пляж біля гір","Sand beach & resorts":"Піщаний пляж і курорти","Golf & pine forest":"Гольф і соснові ліси","Taurus meets the sea":"Таврські гори зустрічаються з морем","Antiquity & beach":"Античність і пляж","Castle above the bay":"Фортеця над бухтою","Luxury":"Люкс","Family":"Для сімей","Adults only":"Лише для дорослих","Golf":"Гольф","Beach":"Пляж","Wellness":"Велнес","Boutique":"Бутик","City":"Місто","All inclusive":"Все включено","Private beach":"Приватний пляж","Pool":"Басейн","Spa":"Спа","Kids club":"Дитячий клуб","Sea view":"Вид на море","Transfer":"Трансфер","Restaurant":"Ресторан","Fitness":"Фітнес","Aquapark":"Аквапарк","Resort":"Курорт","Hotel":"Готель","Boutique hotel":"Бутик-готель","Apartment":"Апартаменти","Residence":"Резиденція","Villa":"Вілла","Breakfast":"Сніданок","Half board":"Напівпансіон","Ultra all inclusive":"Ультра все включено","Deluxe Sea View":"Deluxe з видом на море","1 king bed":"1 ліжко king-size","Family Suite":"Сімейний люкс","2 bedrooms":"2 спальні","Swim-up Room":"Номер із виходом до басейну","Garden Villa":"Вілла з садом","Sea View Villa":"Вілла з видом на море","3 bedrooms":"3 спальні","Classic Room":"Класичний номер","1 double bed":"1 двоспальне ліжко","Terrace Room":"Номер із терасою","Balcony":"Балкон","Kids area":"Дитяча зона","Private pool":"Приватний басейн","Terrace":"Тераса","Half or full day":"Пів дня або цілий день","Private yacht tours":"Приватні яхт-тури","Antalya, Kemer, Fethiye or Bodrum — we tailor the yacht, bays, route and details of the day personally.":"Анталья, Кемер, Фетхіє або Бодрум — яхту, бухти, маршрут і деталі дня ми підбираємо персонально.","2 days":"2 дні","Cappadocia":"Каппадокія","Valleys of fairy chimneys, cave churches and a balloon flight at sunrise.":"Долини казкових скель, печерні церкви та політ на повітряній кулі на світанку.","1 day":"1 день","Pamukkale & Hierapolis":"Памуккале та Ієраполіс","Snow-white travertine terraces of thermal water and the ancient city above them.":"Білосніжні травертинові тераси термальної води та античне місто над ними.","Ephesus":"Ефес","Marble streets, the Library of Celsus and one of the largest ancient theatres.":"Мармурові вулиці, бібліотека Цельса та один із найбільших античних театрів.","Ölüdeniz — Blue Lagoon":"Олюденіз — Блакитна лагуна","A turquoise lagoon, Belcekiz beach and paragliding from Mount Babadag.":"Бірюзова лагуна, пляж Бельджекіз і параглайдинг із гори Бабадаг.","Istanbul":"Стамбул","The Bosphorus, Hagia Sophia and the Grand Bazaar — a short flight from Antalya.":"Босфор, Айя-Софія та Гранд-базар — короткий переліт з Антальї.","Always reachable":"Завжди на зв’язку","One line, one person — 24/7":"Одна лінія, одна людина — 24/7","Tailor-made":"Індивідуально","Offers without a booking form":"Пропозиції без стандартної форми бронювання","With you there":"Поруч із вами","Transfers, tables, excursions":"Трансфери, столики, екскурсії","Seaside resorts where beach, service and calm genuinely belong together.":"Морські курорти, де пляж, сервіс і спокій справді поєднуються.","Private · individual · exceptional":"Приватно · індивідуально · особливо","Private villas with pools, views and space entirely your own.":"Приватні вілли з басейнами, краєвидами та простором лише для вас.","Thoughtful journeys for small groups — culture, nature, gastronomy and special themes.":"Продумані подорожі для малих груп — культура, природа, гастрономія та особливі теми.","Events · incentives · private occasions":"Події · інсентив · приватні свята","From venue and transfers to dinner and programme — one team coordinates the entire occasion.":"Від локації та трансферів до вечері й програми — одна команда координує всю подію.","Antalya":"Анталья","Turkish Riviera":"Турецька Рив’єра","Sea, mountains, old town and a broad choice of resorts from Kemer to Alanya.":"Море, гори, старе місто та широкий вибір курортів від Кемера до Аланії.","Bodrum":"Бодрум","Aegean elegance":"Егейська елегантність","White houses, marinas, private bays and the stylish Turkish Aegean.":"Білі будинки, марини, приватні бухти та стильне турецьке Егейське узбережжя.","Fethiye & Ölüdeniz":"Фетхіє та Олюденіз","Pure nature":"Чиста природа","Blue lagoons, bays, yachts and mountain scenery along the Lycian coast.":"Блакитні лагуни, бухти, яхти та гірські пейзажі Лікійського узбережжя.","Culture & history":"Культура та історія","The Bosphorus, gastronomy, history and contemporary city energy.":"Босфор, гастрономія, історія та сучасна енергія міста.","Magical landscapes":"Магічні пейзажі","Rock valleys, cave hotels and sunrise among hot-air balloons.":"Скелясті долини, печерні готелі та світанок серед повітряних куль.","Çeşme & Alaçatı":"Чешме та Алачати","Relaxed & stylish":"Невимушено та стильно","Aegean beaches, boutique hotels, restaurants and Alaçatı atmosphere.":"Егейські пляжі, бутик-готелі, ресторани та атмосфера Алачати.","Private yacht tour":"Приватний яхт-тур","A day on the sea":"День у морі","Pamukkale":"Памуккале","Explore the thermal terraces":"Відкрийте термальні тераси","Ancient sites":"Античні пам’ятки","Discover history":"Відкрийте історію","Luxurious resort between the Taurus mountains and the Mediterranean.":"Розкішний курорт між Таврськими горами та Середземним морем.","Expansive resort in the pine forest with golf courses.":"Просторий курорт у сосновому лісі з гольф-полями.","A small house by the pebble beach of Konyaaltı.":"Невеликий готель біля галькового пляжу Коньяалти.","Resort on the Lara sand beach with a large spa.":"Курорт на піщаному пляжі Лара з великим спа.","A historic house in the old town by the yacht harbour.":"Історичний будинок у старому місті біля яхтової гавані.","Resort within walking distance of the ancient theatre of Side.":"Курорт у пішій доступності від античного театру Сіде.","Rooms with terraces facing the Alanya castle.":"Номери з терасами та видом на фортецю Аланії.","Top-tier golf resort with an extensive spa.":"Гольф-курорт високого рівня з великим спа.","Individual villas with private pools above the bay.":"Окремі вілли з приватними басейнами над бухтою.","Family hotel opposite Konyaaltı beach.":"Сімейний готель навпроти пляжу Коньяалти.","Large resort with an aquapark right on the beach.":"Великий курорт з аквапарком просто на пляжі.","A classic all-inclusive resort by the sea.":"Класичний all-inclusive курорт біля моря.","Quiet suites in the lanes of Kaleiçi.":"Тихі люкси у провулках Калеїчі.","A small hotel for golfers among the pines.":"Невеликий готель для гольфістів серед сосен.","Right on the famous Cleopatra beach.":"Прямо на знаменитому пляжі Клеопатри.","A secluded house in the Adrasan bay.":"Відокремлений готель у бухті Адрасан.","Resort with wide terraces above the sea.":"Курорт із просторими терасами над морем.","A modern boutique hotel by the new marina.":"Сучасний бутик-готель біля нової марини.","Villas in orange groves near Side.":"Вілли в апельсинових садах біля Сіде.","A hotel on the cliff with a panorama of the bay.":"Готель на скелі з панорамою бухти.","Resort with a large aquapark for families.":"Курорт із великим аквапарком для сімей.","Close to ancient Olympos and the beach.":"Поруч з античним Олімпосом і пляжем.","Hillside villas overlooking the bay.":"Вілли на схилі з видом на бухту.","An adults-only spa retreat.":"Спа-відпочинок лише для дорослих.","ONLYONE · Luxury Travel in Türkiye":"ONLYONE · Подорожі Туреччиною","Tailored travel in Türkiye, handpicked stays and a personal VIP assistant.":"Індивідуальні подорожі Туреччиною, ретельно відібране проживання та персональний VIP-асистент.","NOW":"ЗАРАЗ","SUPER DEAL":"СПЕЦПРОПОЗИЦІЯ","TÜRKİYE":"ТУРЕЧЧИНА","SELECTED":"ВІДІБРАНО","Best Hotels":"Найкращі готелі","ONLYONE CHOICE":"ВИБІР ONLYONE","VIP SERVICES":"VIP-СЕРВІСИ","PRIVATE AVIATION":"ПРИВАТНА АВІАЦІЯ","EVENTS":"ПОДІЇ","Venue · transfer · dinner · programme":"Локація · трансфер · вечеря · програма","EVENT":"ПОДІЯ","SPECIAL":"ЕКСКЛЮЗИВ","Hotels":"Готелі","Selected houses":"Відібрані адреси","VIP excursions":"VIP-екскурсії","Private routes":"Приватні маршрути","Welcome & transfer":"Зустріч і трансфер","From the plane to the hotel":"Від літака до готелю","VIP assistant":"VIP-асистент","One person for everything":"Одна людина на все","SEA":"МОРЕ","Private yacht":"Приватна яхта","Route, yacht and a day on the water — entirely to your taste.":"Маршрут, яхта і день на воді — повністю на ваш смак.","ROAD":"ДОРОГА","Car transfer":"Автотрансфер","With or without a chauffeur — comfortable for a family, a team or a small group.":"З водієм або без — комфортний автомобіль для родини, команди чи невеликої групи.","VIP welcome, yacht & transfer":"VIP-зустріч, яхта і трансфер","Personal welcome, private yacht, car transfer and helicopter — arranged individually.":"Особиста зустріч, приватна яхта, автотрансфер і гелікоптер — усе організовується персонально.","Email":"E-mail","Antalya, Türkiye":"Анталія, Туреччина","Address":"Адреса","Your VIP transport is waiting for you":"Ваш VIP-транспорт чекає на вас","ONLY ONE TRAVEL · VIP TRANSFER":"ONLY ONE TRAVEL · VIP-ТРАНСФЕР","The finest stays":"Найкрасивіші місця"}}
  const localizeExtra = en => ((EXTRA_TEXT[LANG] && EXTRA_TEXT[LANG][en]) || en);
  const loc = obj => { if(!obj) return ''; if(obj[LANG]) return obj[LANG]; if((LANG==='tr'||LANG==='uk') && obj.en) return localizeExtra(obj.en); return obj.en || obj.ru || obj.de || ''; };

  let LANG = 'ru';
  const t = k => (I18N[LANG] && I18N[LANG][k]) || I18N.en[k] || k;
  const hx = (ru,de,en) => LANG==='ru'?ru:(LANG==='de'?de:(LANG==='tr'?localizeExtra(en):(LANG==='uk'?localizeExtra(en):en)));

  /* ====================================================================
     2 · Regions & hotels — PUBLIC data, no prices anywhere
     ==================================================================== */
  const IMG = './images/hotels/';
  const REGIONS = [
    {id:'antalya',  name:{ru:'Анталья',   de:'Antalya Stadt',en:'Antalya City'}, tag:{ru:'Старый город и гавань',de:'Altstadt & Hafen',en:'Old town & harbour'}, img:IMG+'region-antalya.webp', x:44,y:46},
    {id:'konyaalti',name:{ru:'Коньяалты', de:'Konyaaltı',    en:'Konyaaltı'},    tag:{ru:'Галечный пляж у гор',de:'Kiesstrand am Berg',en:'Pebble beach below the mountains'}, img:IMG+'region-konyaalti.webp', x:33,y:53},
    {id:'lara',     name:{ru:'Лара',      de:'Lara',         en:'Lara'},         tag:{ru:'Песчаный пляж и курорты',de:'Sandstrand & Resorts',en:'Sand beach & resorts'}, img:IMG+'region-lara.webp', x:56,y:41},
    {id:'belek',    name:{ru:'Белек',     de:'Belek',        en:'Belek'},        tag:{ru:'Гольф и сосновые леса',de:'Golf & Pinienwälder',en:'Golf & pine forest'}, img:IMG+'region-belek.webp', x:68,y:35},
    {id:'kemer',    name:{ru:'Кемер',     de:'Kemer',        en:'Kemer'},        tag:{ru:'Горы Тавр у моря',de:'Taurus trifft Meer',en:'Taurus meets the sea'}, img:IMG+'region-kemer.webp', x:20,y:66},
    {id:'side',     name:{ru:'Сиде',      de:'Side',         en:'Side'},         tag:{ru:'Античность и пляж',de:'Antike & Strand',en:'Antiquity & beach'}, img:IMG+'region-side.webp', x:79,y:30},
    {id:'alanya',   name:{ru:'Аланья',    de:'Alanya',       en:'Alanya'},       tag:{ru:'Крепость над бухтой',de:'Burg über der Bucht',en:'Castle above the bay'}, img:IMG+'region-alanya.webp', x:90,y:22},
  ];
  const regionName = id => { const r=REGIONS.find(x=>x.id===id); return r ? (loc(r.name)) : id; };

  const TYPES=[
    {id:'luxury',  l:{ru:'Люкс',de:'Luxus',en:'Luxury'}},
    {id:'family',  l:{ru:'Семейный',de:'Familie',en:'Family'}},
    {id:'adults',  l:{ru:'Только взрослые',de:'Adults Only',en:'Adults only'}},
    {id:'golf',    l:{ru:'Гольф',de:'Golf',en:'Golf'}},
    {id:'beach',   l:{ru:'Пляж',de:'Strand',en:'Beach'}},
    {id:'wellness',l:{ru:'Велнес',de:'Wellness',en:'Wellness'}},
    {id:'boutique',l:{ru:'Бутик',de:'Boutique',en:'Boutique'}},
    {id:'city',    l:{ru:'Город',de:'Stadt',en:'City'}},
    {id:'allin',   l:{ru:'Всё включено',de:'All Inclusive',en:'All inclusive'}},
  ];
  const AMEN=[
    {id:'privbeach',l:{ru:'Свой пляж',de:'Privatstrand',en:'Private beach'}},
    {id:'pool',     l:{ru:'Бассейн',de:'Pool',en:'Pool'}},
    {id:'spa',      l:{ru:'Спа',de:'Spa',en:'Spa'}},
    {id:'kids',     l:{ru:'Детский клуб',de:'Kinderclub',en:'Kids club'}},
    {id:'golf',     l:{ru:'Гольф',de:'Golf',en:'Golf'}},
    {id:'seaview',  l:{ru:'Вид на море',de:'Meerblick',en:'Sea view'}},
    {id:'transfer', l:{ru:'Трансфер',de:'Transfer',en:'Transfer'}},
    {id:'rest',     l:{ru:'Рестораны',de:'Restaurant',en:'Restaurant'}},
    {id:'fitness',  l:{ru:'Фитнес',de:'Fitness',en:'Fitness'}},
    {id:'aqua',     l:{ru:'Аквапарк',de:'Aquapark',en:'Aquapark'}},
  ];
  /* Accommodation kind. The offering is not hotels only — apartments,
     residences and villas are part of it, so the kind is a field of its own
     rather than something inferred from the name. */
  const KINDS=[
    {id:'resort',    l:{ru:'Курорт',de:'Resort',en:'Resort'}},
    {id:'hotel',     l:{ru:'Отель',de:'Hotel',en:'Hotel'}},
    {id:'boutique',  l:{ru:'Бутик-отель',de:'Boutiquehotel',en:'Boutique hotel'}},
    {id:'apartment', l:{ru:'Апартаменты',de:'Apartment',en:'Apartment'}},
    {id:'residence', l:{ru:'Резиденция',de:'Residenz',en:'Residence'}},
    {id:'villa',     l:{ru:'Вилла',de:'Villa',en:'Villa'}},
  ];

  const BOARDS=[
    {id:'bb', l:{ru:'Завтрак',de:'Frühstück',en:'Breakfast'}},
    {id:'hb', l:{ru:'Полупансион',de:'Halbpension',en:'Half board'}},
    {id:'ai', l:{ru:'Всё включено',de:'All Inclusive',en:'All inclusive'}},
    {id:'uai',l:{ru:'Ультра всё включено',de:'Ultra All Inclusive',en:'Ultra all inclusive'}},
  ];
  const label=(arr,id)=>{const x=arr.find(a=>a.id===id);return x?(loc(x.l)):id;};

  const ROOMSETS={
    resort:[
      {id:'dlx-sea',  n:{ru:'Делюкс с видом на море',de:'Deluxe Sea View',en:'Deluxe Sea View'}, sz:45, ad:2, bed:{ru:'1 кровать King',de:'1 Kingsize-Bett',en:'1 king bed'}, f:['bb','balcony','seaview']},
      {id:'fam-suite',n:{ru:'Семейный люкс',de:'Family Suite',en:'Family Suite'}, sz:75, ad:4, bed:{ru:'2 спальни',de:'2 Schlafzimmer',en:'2 bedrooms'}, f:['bb','balcony','kids']},
      {id:'swim-up',  n:{ru:'Свим-ап номер',de:'Swim-up Zimmer',en:'Swim-up Room'}, sz:52, ad:2, bed:{ru:'1 кровать King',de:'1 Kingsize-Bett',en:'1 king bed'}, f:['pool','terrace']},
    ],
    villa:[
      {id:'gard-villa',n:{ru:'Вилла с садом',de:'Garden Villa',en:'Garden Villa'}, sz:110, ad:4, bed:{ru:'2 спальни',de:'2 Schlafzimmer',en:'2 bedrooms'}, f:['pool','terrace','bb']},
      {id:'sea-villa', n:{ru:'Вилла с видом на море',de:'Sea View Villa',en:'Sea View Villa'}, sz:140, ad:6, bed:{ru:'3 спальни',de:'3 Schlafzimmer',en:'3 bedrooms'}, f:['pool','seaview','terrace']},
    ],
    boutique:[
      {id:'classic',n:{ru:'Классический номер',de:'Classic Zimmer',en:'Classic Room'}, sz:26, ad:2, bed:{ru:'1 двуспальная',de:'1 Doppelbett',en:'1 double bed'}, f:['bb']},
      {id:'terrace',n:{ru:'Номер с террасой',de:'Terrassenzimmer',en:'Terrace Room'}, sz:34, ad:2, bed:{ru:'1 кровать King',de:'1 Kingsize-Bett',en:'1 king bed'}, f:['bb','terrace','seaview']},
    ],
  };
  const ROOMFEAT={
    bb:{ru:'Завтрак',de:'Frühstück',en:'Breakfast'},
    balcony:{ru:'Балкон',de:'Balkon',en:'Balcony'},
    seaview:{ru:'Вид на море',de:'Meerblick',en:'Sea view'},
    kids:{ru:'Детская зона',de:'Kinderbereich',en:'Kids area'},
    pool:{ru:'Свой бассейн',de:'Eigener Pool',en:'Private pool'},
    terrace:{ru:'Терраса',de:'Terrasse',en:'Terrace'},
  };

  /* --- Excursions. Day trips beyond the resort, requestable like anything
     else and — same rule as hotels — carrying no price. --- */
  const EXC_IMG='./images/excursions/';
  const EXCURSIONS=[
    {id:'yacht-tour', img:'./images/yacht-tour-poster.webp', dur:{ru:'Полдня или 1 день',de:'Halber oder ganzer Tag',en:'Half or full day'},
     n:{ru:'Приватные яхт-туры',de:'Private Yachttouren',en:'Private yacht tours'},
     d:{ru:'Анталья, Кемер, Фетхие или Бодрум — яхту, бухты, маршрут и детали дня мы подберём персонально.',
        de:'Antalya, Kemer, Fethiye oder Bodrum – Yacht, Buchten, Route und Tagesablauf stellen wir persönlich zusammen.',
        en:'Antalya, Kemer, Fethiye or Bodrum — we tailor the yacht, bays, route and details of the day personally.'}},
    {id:'cappadocia', img:EXC_IMG+'exc-cappadocia.webp', dur:{ru:'2 дня',de:'2 Tage',en:'2 days'},
     n:{ru:'Каппадокия',de:'Kappadokien',en:'Cappadocia'},
     d:{ru:'Долины сказочных дымоходов, пещерные церкви и полёт на воздушном шаре на рассвете.',
        de:'Täler voller Feenkamine, Höhlenkirchen und eine Ballonfahrt bei Sonnenaufgang.',
        en:'Valleys of fairy chimneys, cave churches and a balloon flight at sunrise.'}},
    {id:'pamukkale', img:EXC_IMG+'exc-pamukkale.webp', dur:{ru:'1 день',de:'1 Tag',en:'1 day'},
     n:{ru:'Памуккале и Хиераполис',de:'Pamukkale & Hierapolis',en:'Pamukkale & Hierapolis'},
     d:{ru:'Белоснежные травертиновые террасы с термальной водой и античный город над ними.',
        de:'Schneeweiße Kalksinterterrassen mit Thermalwasser und die antike Stadt darüber.',
        en:'Snow-white travertine terraces of thermal water and the ancient city above them.'}},
    {id:'ephesus', img:EXC_IMG+'exc-ephesus.webp', dur:{ru:'1 день',de:'1 Tag',en:'1 day'},
     n:{ru:'Эфес',de:'Ephesos',en:'Ephesus'},
     d:{ru:'Мраморные улицы, библиотека Цельса и один из крупнейших античных театров.',
        de:'Marmorstraßen, die Celsus-Bibliothek und eines der größten antiken Theater.',
        en:'Marble streets, the Library of Celsus and one of the largest ancient theatres.'}},
    {id:'oludeniz', img:EXC_IMG+'exc-oludeniz.webp', dur:{ru:'1 день',de:'1 Tag',en:'1 day'},
     n:{ru:'Олюдениз — Голубая лагуна',de:'Ölüdeniz — Blaue Lagune',en:'Ölüdeniz — Blue Lagoon'},
     d:{ru:'Лагуна бирюзового цвета, пляж Бельджекиз и параглайдинг с горы Бабадаг.',
        de:'Türkisfarbene Lagune, der Belcekiz-Strand und Gleitschirmflug vom Babadag.',
        en:'A turquoise lagoon, Belcekiz beach and paragliding from Mount Babadag.'}},
    {id:'istanbul', img:EXC_IMG+'exc-istanbul.webp', dur:{ru:'2 дня',de:'2 Tage',en:'2 days'},
     n:{ru:'Стамбул',de:'Istanbul',en:'Istanbul'},
     d:{ru:'Босфор, Айя-София и Гранд-базар — короткий перелёт от Антальи.',
        de:'Bosporus, Hagia Sophia und Großer Basar — ein kurzer Flug ab Antalya.',
        en:'The Bosphorus, Hagia Sophia and the Grand Bazaar — a short flight from Antalya.'}},
  ];
  const excursion=id=>EXCURSIONS.find(e=>e.id===id);

  /* --- Charter fleet. The yacht and transport pages borrow the grammar of a
     charter broker's listing — name, builder, year, cabins · guests · crew,
     and a from-rate — because that is how the category is read everywhere
     else. The rates are deliberately "from": entry day rates as orientation,
     the exact offer is always personal. Vessel names are our own; builder and
     year are ordinary specs, not claims about a particular real boat.
     Photography: the four r21 yacht frames, briefed for exactly this page. --- */
  const CHARTER_DESTS=[
    {id:'antalya', l:{ru:'Анталья',de:'Antalya',en:'Antalya'}},
    {id:'kemer',   l:{ru:'Кемер',de:'Kemer',en:'Kemer'}},
    {id:'fethiye', l:{ru:'Фетхие',de:'Fethiye',en:'Fethiye'}},
    {id:'gocek',   l:{ru:'Гёчек',de:'Göcek',en:'Göcek'}},
    {id:'bodrum',  l:{ru:'Бодрум',de:'Bodrum',en:'Bodrum'}},
  ];
  const YACHTS=[
    {id:'alara', img:'./images/r21/yacht-card-1.webp', name:'ALARA',
     m:24, builder:'Princess', year:2021, cabins:4, guests:10, crew:3, from:3900,
     dests:['antalya','kemer'],
     d:{ru:'Флайбридж для золотого часа: просторная корма, шеф на борту и закат над заливом на обратном пути.',
        de:'Eine Flybridge für die goldene Stunde: großes Achterdeck, Chefkoch an Bord und der Sonnenuntergang über der Bucht auf dem Rückweg.',
        en:'A flybridge built for the golden hour: a wide aft deck, a chef on board and the sunset over the bay on the way home.'}},
    {id:'mavi-ruya', img:'./images/r21/yacht-card-2.webp', name:'MAVI RUYA',
     m:21, builder:'Azimut', year:2019, cabins:3, guests:8, crew:2, from:2700,
     dests:['kemer','antalya'],
     d:{ru:'День в бирюзовых бухтах Кемера: якорь в тихой воде, купание прямо с кормы и обед под тентом.',
        de:'Ein Tag in den türkisfarbenen Buchten von Kemer: Anker im stillen Wasser, Baden direkt von der Badeplattform, Mittagessen unter dem Sonnensegel.',
        en:'A day in Kemer’s turquoise coves: anchor in still water, swim straight off the bathing platform, lunch under the awning.'}},
    {id:'elara', img:'./images/r21/yacht-card-3.webp', name:'ELARA',
     m:27, builder:'Ferretti', year:2022, cabins:4, guests:12, crew:4, from:4900,
     dests:['gocek','fethiye'],
     d:{ru:'Двенадцать островов Гёчека с воды: лагуны, сосновые берега и маршрут, который капитан строит по вашему дню.',
        de:'Die zwölf Inseln von Göcek vom Wasser aus: Lagunen, Pinienufer und eine Route, die der Kapitän um Ihren Tag herum baut.',
        en:'The twelve islands of Göcek from the water: lagoons, pine-lined shores and a route the captain shapes around your day.'}},
    {id:'lady-lykia', img:'./images/r21/yacht-card-4.webp', name:'LADY LYKIA',
     m:26, builder:'Sunseeker', year:2020, cabins:5, guests:12, crew:4, from:5400,
     dests:['bodrum','gocek'],
     d:{ru:'Вечерний выход с ужином на борту: палубы в тёплом свете, стол накрыт, берег Бодрума медленно гаснет за кормой.',
        de:'Die Abendausfahrt mit Dinner an Bord: Decks in warmem Licht, der Tisch ist gedeckt, die Küste von Bodrum verglüht hinter dem Heck.',
        en:'The evening cruise with dinner on board: decks in warm light, the table laid, the Bodrum shore fading slowly astern.'}},
  ];
  /* --- Weekly charter fleet. Real vessels of the international charter
     market, adopted from a broker's public listing (northropandjohnson.com,
     31.08.2026): name, builder, year, length, staterooms, guests, crew and
     the advertised weekly from-rate are public market facts. Photographs are
     NOT copied — a broker's photography is licensed to that broker. Instead
     every entry points at images/fleet/<id>.webp; until that file exists the
     card swaps itself to the pending treatment on the image error, so a
     photograph dropped into the repo appears with no code change (briefs in
     docs/chatgpt-bildauftrag.md). Rates are advertised from-rates, always
     excl. APA/VAT. --- */
  const FLEET_SIZES=[
    {id:'xl', l:{ru:'60 м+',de:'60 m+',en:'60 m+'}},
    {id:'l',  l:{ru:'35–60 м',de:'35–60 m',en:'35–60 m'}},
    {id:'m',  l:{ru:'до 35 м',de:'bis 35 m',en:'under 35 m'}},
  ];
  const FLEET_WEEK=[
    {id:'lady-s',       name:'LADY S',        m:93,   ft:305, builder:'Feadship',      year:'2019',      cabins:7, guests:12, crew:31, from:1750000, size:'xl'},
    {id:'carinthia-vii',name:'CARINTHIA VII', m:97.2, ft:318, builder:'Lürssen',       year:'2002/2023', cabins:8, guests:12, crew:33, from:1500000, size:'xl'},
    {id:'starfire',     name:'STARFIRE',      m:73,   ft:240, builder:'Lürssen',       year:'2007',      cabins:7, guests:12, crew:20, from:680000,  size:'xl'},
    {id:'twizzle',      name:'TWIZZLE',       m:57.5, ft:188, builder:'Royal Huisman', year:'2010',      cabins:4, guests:9,  crew:11, from:250000,  size:'l'},
    {id:'prometheus-i', name:'PROMETHEUS I',  m:45,   ft:147, builder:'Heesen',        year:'1998',      cabins:5, guests:12, crew:10, from:130000,  size:'l'},
    {id:'helios',       name:'HELIOS',        m:35.5, ft:116, builder:'Falcon',        year:'2010',      cabins:5, guests:12, crew:6,  from:69000,   size:'l'},
    {id:'iva',          name:'IVA',           m:29.2, ft:95,  builder:'Ferretti',      year:'2014',      cabins:5, guests:10, crew:5,  from:65000,   size:'m'},
    {id:'seaclusion',   name:'SEACLUSION',    m:24,   ft:78,  builder:'Sunreef',       year:'2020',      cabins:4, guests:8,  crew:4,  from:65000,   size:'m'},
    {id:'daiquiri',     name:'DAIQUIRI',      m:20.6, ft:67,  builder:'Lagoon',        year:'2022',      cabins:5, guests:10, crew:4,  from:32000,   size:'m'},
    {id:'yume',         name:'YUME',          m:21.9, ft:71,  builder:'YYachts',       year:'2024',      cabins:3, guests:6,  crew:2,  from:24000,   size:'m'},
  ].map(y=>({...y, week:true, img:'./images/fleet/'+y.id+'.webp'}));
  const yachtById=id=>YACHTS.find(y=>y.id===id)||FLEET_WEEK.find(y=>y.id===id);

  /* --- VIP transport, same listing grammar. Three classes — the road twice,
     the air once — each with capacity and an entry rate per transfer. --- */
  const VEHICLE_CLASSES=[
    {id:'limo', l:{ru:'Лимузин',de:'Limousine',en:'Limousine'}},
    {id:'bus',  l:{ru:'VIP-бус',de:'VIP-Bus',en:'VIP bus'}},
    {id:'heli', l:{ru:'Вертолёт',de:'Helikopter',en:'Helicopter'}},
  ];
  const VEHICLES=[
    {id:'s-class', img:'./images/home-experiences/transfer.webp', cls:'limo',
     name:'MERCEDES-BENZ S-CLASS', from:190,
     kind:{ru:'Лимузин с водителем',de:'Limousine mit Chauffeur',en:'Chauffeured limousine'},
     cap:{ru:'до 3 гостей · 3 чемодана',de:'bis 3 Gäste · 3 Koffer',en:'up to 3 guests · 3 cases'},
     d:{ru:'Первый класс на дороге: встреча с табличкой, прохладный салон, вода и тишина — от трапа до дверей отеля.',
        de:'Erste Klasse auf der Straße: Empfang mit Schild, gekühlter Innenraum, Wasser und Ruhe — vom Flugzeug bis zur Hoteltür.',
        en:'First class on the road: a name sign at arrivals, a cooled cabin, water and quiet — from the aircraft to the hotel door.'}},
    {id:'sprinter-vip', img:'./images/r18/transfer-van.webp', cls:'bus',
     name:'MERCEDES SPRINTER VIP', from:290,
     kind:{ru:'VIP-бус с водителем',de:'VIP-Bus mit Chauffeur',en:'Chauffeured VIP bus'},
     cap:{ru:'до 10 гостей · 12 чемоданов',de:'bis 10 Gäste · 12 Koffer',en:'up to 10 guests · 12 cases'},
     d:{ru:'Для семьи или команды: салон-лаундж с креслами, место для всего багажа и один автомобиль на всех.',
        de:'Für Familie oder Team: Lounge-Innenraum mit Einzelsitzen, Platz für das gesamte Gepäck und ein Wagen für alle.',
        en:'For a family or a team: a lounge cabin with individual seats, room for all the luggage and one vehicle for everyone.'}},
    {id:'helicopter', img:'./images/r18/transfer-heli.webp', cls:'heli',
     name:{ru:'Частный вертолёт',de:'Privater Helikopter',en:'Private helicopter'}, from:2400, perFlight:true,
     kind:{ru:'Вертолётный трансфер',de:'Helikopter-Transfer',en:'Helicopter transfer'},
     cap:{ru:'до 5 гостей · лёгкий багаж',de:'bis 5 Gäste · leichtes Gepäck',en:'up to 5 guests · light luggage'},
     d:{ru:'Побережье за минуты вместо часов: вылет от аэропорта или отеля, посадка у моря — и весь Ликийский берег под вами.',
        de:'Die Küste in Minuten statt Stunden: Start am Flughafen oder Hotel, Landung am Meer — und die ganze lykische Küste unter Ihnen.',
        en:'The coast in minutes instead of hours: departure from the airport or hotel, landing by the sea — the whole Lycian shore beneath you.'}},
  ];
  const vehicleById=id=>VEHICLES.find(v=>v.id===id);
  /* Listing filters. Session-local on purpose — a filter is part of browsing,
     not of the saved state, so it resets with the next visit like a scroll
     position does. */
  const CHARTERF={size:null,cls:null};

  /* --- Concierge bands. Three full-bleed statements on the concierge page —
     the same visual language as the experience bands, but they assert the
     service instead of opening a filter. Interim crops again; the ChatGPT
     brief for the real frames is in docs/chatgpt-bildauftrag.md. --- */
  const CONC_BANDS=[
    {img:'./images/concierge/conc-reach.webp',
     n:{ru:'Всегда на связи',de:'Immer erreichbar',en:'Always reachable'},
     s:{ru:'Одна линия, один человек — 24/7',de:'Eine Leitung, ein Mensch — 24/7',en:'One line, one person — 24/7'}},
    {img:'./images/concierge/conc-tailor.webp',
     n:{ru:'Индивидуально',de:'Massgeschneidert',en:'Tailor-made'},
     s:{ru:'Предложения без форм бронирования',de:'Angebote ohne Buchungsmaske',en:'Offers without a booking form'}},
    {img:'./images/concierge/conc-there.webp',
     n:{ru:'Рядом в поездке',de:'Vor Ort für dich',en:'With you there'},
     s:{ru:'Трансферы, столики, экскурсии',de:'Transfers, Tische, Ausflüge',en:'Transfers, tables, excursions'}},
  ];

  /* --- Experiences. Four full-bleed bands on the home screen, each one a way
     into the catalogue that is not a search field: you pick the kind of trip
     first and the houses follow. `go` is the filter the band opens with —
     `type`/`kind` land in the accommodation search, `exc` opens an excursion.
     Photography is briefed in docs/chatgpt-bildauftrag.md; the files below are
     interim crops of images already in the repo so the layout is real before
     the final frames arrive. --- */
  const EXP_IMG='./images/experiences/';
  const EXPERIENCES=[
    {id:'beach', img:'./images/worlds/beach.webp', go:{type:'beach'},
     n:{ru:'Пляжные курорты',de:'Strandresorts',en:'Beach resorts'},
     s:{ru:'Море · солнце · отдых',de:'Meer · Sonne · Erholung',en:'Sea · sun · escape'},
     lead:{ru:'Курорты у моря, где пляж, сервис и спокойствие действительно работают вместе.',de:'Resorts am Meer, bei denen Strand, Service und Ruhe wirklich zusammenpassen.',en:'Seaside resorts where beach, service and calm genuinely belong together.'}},
    {id:'villas', img:'./images/worlds/villas.webp', go:{kind:'villa'},
     n:{ru:'Виллы',de:'Villen',en:'Villas'},
     s:{ru:'Приватно · индивидуально · спокойно',de:'Privat · individuell · besonders',en:'Private · individual · exceptional'},
     lead:{ru:'Частные виллы с бассейном, видом и пространством только для вас.',de:'Private Villen mit Pool, Aussicht und Raum nur für dich.',en:'Private villas with pools, views and space entirely your own.'}},
    {id:'group-tours', img:'./images/worlds/groups-v2.webp', go:{view:'excursions'},
     n:{ru:'Групповые туры',de:'Gruppenreisen',en:'Group tours'},
     s:{ru:'Тематические путешествия',de:'Thematische Reisen',en:'Themed journeys'},
     lead:{ru:'Продуманные маршруты для небольших групп — культура, природа, гастрономия и особые темы.',de:'Durchdachte Reisen für kleine Gruppen – Kultur, Natur, Kulinarik und besondere Themen.',en:'Thoughtful journeys for small groups — culture, nature, gastronomy and special themes.'}},
    {id:'event-management', img:'./images/worlds/events.webp', go:{view:'concierge'},
     n:{ru:'Event-менеджмент',de:'Event-Management',en:'Event management'},
     s:{ru:'События · компании · частные праздники',de:'Events · Incentives · private Anlässe',en:'Events · incentives · private occasions'},
     lead:{ru:'От площадки и трансферов до ужина и программы — одна команда координирует всё событие.',de:'Von Location und Transfers bis Dinner und Programm – ein Team koordiniert den gesamten Anlass für dich.',en:'From venue and transfers to dinner and programme — one team coordinates the entire occasion.'}},
  ];

  const DESTINATIONS=[
    {id:'antalya',img:'./images/destinations/antalya.webp',
     n:{ru:'Анталья',de:'Antalya',en:'Antalya'},s:{ru:'Турецкая Ривьера',de:'Türkische Riviera',en:'Turkish Riviera'},
     d:{ru:'Море, горы, старый город и большой выбор курортов от Кемера до Аланьи.',de:'Meer, Berge, Altstadt und eine große Auswahl an Resorts von Kemer bis Alanya.',en:'Sea, mountains, old town and a broad choice of resorts from Kemer to Alanya.'},
     regions:['antalya','konyaalti','lara','belek','kemer','side','alanya']},
    {id:'bodrum',img:'./images/destinations/bodrum.webp',
     n:{ru:'Бодрум',de:'Bodrum',en:'Bodrum'},s:{ru:'Эгейская элегантность',de:'Ägäische Eleganz',en:'Aegean elegance'},
     d:{ru:'Белые дома, марины, приватные бухты и стильная Эгейская Турция.',de:'Weiße Häuser, Marinas, private Buchten und die stilvolle türkische Ägäis.',en:'White houses, marinas, private bays and the stylish Turkish Aegean.'}},
    {id:'fethiye',img:'./images/destinations/fethiye.webp',
     n:{ru:'Фетхие и Олюдениз',de:'Fethiye & Ölüdeniz',en:'Fethiye & Ölüdeniz'},s:{ru:'Природа и лагуны',de:'Natur pur',en:'Pure nature'},
     d:{ru:'Голубая лагуна, бухты, яхты и горные пейзажи Ликийского побережья.',de:'Blaue Lagune, Buchten, Yachten und Berglandschaften an der lykischen Küste.',en:'Blue lagoons, bays, yachts and mountain scenery along the Lycian coast.'}},
    {id:'istanbul',img:'./images/destinations/istanbul.webp',
     n:{ru:'Стамбул',de:'Istanbul',en:'Istanbul'},s:{ru:'Культура и история',de:'Kultur & Geschichte',en:'Culture & history'},
     d:{ru:'Босфор, гастрономия, история и современная городская энергия.',de:'Bosporus, Gastronomie, Geschichte und moderne Großstadtenergie.',en:'The Bosphorus, gastronomy, history and contemporary city energy.'}},
    {id:'cappadocia',img:'./images/destinations/cappadocia.webp',
     n:{ru:'Каппадокия',de:'Kappadokien',en:'Cappadocia'},s:{ru:'Магические ландшафты',de:'Magische Landschaften',en:'Magical landscapes'},
     d:{ru:'Скальные долины, пещерные отели и рассвет над воздушными шарами.',de:'Felsentäler, Höhlenhotels und Sonnenaufgänge zwischen Heißluftballons.',en:'Rock valleys, cave hotels and sunrise among hot-air balloons.'}},
    {id:'cesme',img:'./images/destinations/cesme.webp',
     n:{ru:'Чешме и Алачаты',de:'Çeşme & Alaçatı',en:'Çeşme & Alaçatı'},s:{ru:'Расслабленно и стильно',de:'Entspannt & stilvoll',en:'Relaxed & stylish'},
     d:{ru:'Пляжи Эгейского моря, бутик-отели, рестораны и атмосфера Алачаты.',de:'Ägäisstrände, Boutiquehotels, Restaurants und die besondere Atmosphäre Alaçatıs.',en:'Aegean beaches, boutique hotels, restaurants and Alaçatı atmosphere.'}},
  ];

  const HOME_EXPERIENCES=[
    {id:'yacht',img:'./images/home-experiences/yacht.webp',go:{view:'concierge'},
     n:{ru:'Частная яхта',de:'Private Yacht Tour',en:'Private yacht tour'},s:{ru:'День только для вас',de:'Ein Tag auf dem Meer',en:'A day on the sea'}},
    {id:'pamukkale',img:'./images/home-experiences/pamukkale.webp',go:{exc:'pamukkale'},
     n:{ru:'Памуккале',de:'Pamukkale',en:'Pamukkale'},s:{ru:'Термальные террасы',de:'Thermalterrassen erleben',en:'Explore the thermal terraces'}},
    {id:'ephesus',img:'./images/home-experiences/ephesus.webp',go:{exc:'ephesus'},
     n:{ru:'Эфес',de:'Antike Stätten',en:'Ancient sites'},s:{ru:'История вблизи',de:'Geschichte entdecken',en:'Discover history'}},
  ];

  const H=(id,name,region,st,rt,rv,ty,am,bd,be,im,rs,de,kind)=>
    ({id,name,region,stars:st,rating:rt,reviews:rv,types:ty,amen:am,board:bd,beach:be,
      imgs:im.map(x=>IMG+x),rooms:ROOMSETS[rs],desc:de,
      kind:kind||(rs==='villa'?'villa':rs==='boutique'?'boutique':'resort')});

  const PUBLIC_HOTELS=[
    H('h1','Maxx Royal Kemer Resort','kemer',5,9.6,1847,['luxury','beach','wellness'],['privbeach','pool','spa','seaview','rest','fitness'],'uai',0,['h01.webp','h11.webp','h03.webp'],'resort',
      {ru:'Роскошный курорт между горами Тавр и Средиземным морем.',de:'Luxuriöses Resort zwischen Taurusgebirge und Mittelmeer.',en:'Luxurious resort between the Taurus mountains and the Mediterranean.'}),
    H('h2','Rixos Premium Belek','belek',5,9.3,2410,['luxury','family','golf','allin'],['privbeach','pool','spa','kids','golf','aqua','rest'],'uai',150,['h07.webp','h05.webp','h02.webp'],'resort',
      {ru:'Просторный курорт в сосновом лесу с полями для гольфа.',de:'Weitläufiges Resort im Pinienwald mit Golfplätzen.',en:'Expansive resort in the pine forest with golf courses.'}),
    H('h3','Çalış Boutique Konyaaltı','konyaalti',4,8.9,612,['boutique','city','beach'],['pool','seaview','rest','transfer'],'bb',200,['h03.webp','h06.webp'],'boutique',
      {ru:'Небольшой отель у галечного пляжа Коньяалты.',de:'Kleines Haus am Kiesstrand von Konyaaltı.',en:'A small house by the pebble beach of Konyaaltı.'}),
    H('h4','Lara Barut Collection','lara',5,9.4,3120,['luxury','family','allin','wellness'],['privbeach','pool','spa','kids','aqua','rest','fitness'],'uai',0,['h05.webp','h08.webp','h02.webp'],'resort',
      {ru:'Курорт на песчаном пляже Лары с большим спа-центром.',de:'Resort am Sandstrand von Lara mit großem Spa.',en:'Resort on the Lara sand beach with a large spa.'}),
    H('h5','Kaleiçi Marina House','antalya',4,9.1,845,['boutique','city'],['pool','seaview','rest'],'bb',400,['h09.webp','h14.webp'],'boutique',
      {ru:'Исторический особняк в старом городе у яхтенной гавани.',de:'Historisches Haus in der Altstadt an der Yachthafen-Bucht.',en:'A historic house in the old town by the yacht harbour.'},'residence'),
    H('h6','Side Antique Bay Resort','side',5,9.0,1560,['family','beach','allin'],['privbeach','pool','kids','aqua','rest'],'ai',80,['h13.webp','h12.webp'],'resort',
      {ru:'Курорт рядом с античным театром Сиде.',de:'Resort in Laufweite zum antiken Theater von Side.',en:'Resort within walking distance of the ancient theatre of Side.'}),
    H('h7','Alanya Castle View Suites','alanya',4,8.7,930,['boutique','city','beach'],['pool','seaview','rest'],'bb',250,['h10.webp','h04.webp'],'boutique',
      {ru:'Номера с террасами и видом на крепость Аланьи.',de:'Zimmer mit Terrassen und Blick auf die Burg von Alanya.',en:'Rooms with terraces facing the Alanya castle.'},'residence'),
    H('h8','Regnum Carya Golf & Spa','belek',5,9.5,1980,['luxury','golf','wellness','adults'],['privbeach','pool','spa','golf','rest','fitness'],'uai',300,['h02.webp','h07.webp','h06.webp'],'resort',
      {ru:'Гольф-курорт высокого класса с большим спа.',de:'Golfresort der Spitzenklasse mit weitläufigem Spa.',en:'Top-tier golf resort with an extensive spa.'}),
    H('h9','Kemer Pine Bay Villas','kemer',5,9.2,540,['luxury','boutique','adults'],['pool','seaview','spa','rest'],'bb',120,['h11.webp','h01.webp'],'villa',
      {ru:'Отдельные виллы с бассейнами над бухтой.',de:'Einzelne Villen mit eigenen Pools über der Bucht.',en:'Individual villas with private pools above the bay.'}),
    H('h10','Konyaaltı Beach Residence','konyaalti',4,8.6,1120,['family','beach','city'],['pool','kids','rest','transfer'],'hb',100,['h06.webp','h03.webp'],'resort',
      {ru:'Семейный отель напротив пляжа Коньяалты.',de:'Familienhotel gegenüber dem Konyaaltı-Strand.',en:'Family hotel opposite Konyaaltı beach.'},'apartment'),
    H('h11','Titanic Deluxe Lara','lara',5,9.1,2760,['family','allin','beach'],['privbeach','pool','kids','aqua','spa','rest'],'uai',0,['h08.webp','h05.webp'],'resort',
      {ru:'Большой курорт с аквапарком прямо на пляже.',de:'Großes Resort mit Aquapark direkt am Strand.',en:'Large resort with an aquapark right on the beach.'}),
    H('h12','Side Star Elegance','side',5,8.8,1340,['family','allin','beach'],['privbeach','pool','kids','rest','fitness'],'ai',50,['h12.webp','h13.webp'],'resort',
      {ru:'Классический курорт «всё включено» у моря.',de:'Klassisches All-Inclusive-Resort am Meer.',en:'A classic all-inclusive resort by the sea.'}),
    H('h13','Antalya Old Town Suites','antalya',4,8.9,470,['boutique','city'],['rest','seaview'],'bb',600,['h14.webp','h09.webp'],'boutique',
      {ru:'Тихие сьюты в переулках Калеичи.',de:'Ruhige Suiten in den Gassen von Kaleiçi.',en:'Quiet suites in the lanes of Kaleiçi.'},'apartment'),
    H('h14','Belek Golf Lodge','belek',4,8.8,690,['golf','adults','wellness'],['pool','golf','spa','rest'],'hb',900,['h04.webp','h07.webp'],'boutique',
      {ru:'Небольшой отель для гольфистов среди сосен.',de:'Kleines Haus für Golfer zwischen Pinien.',en:'A small hotel for golfers among the pines.'}),
    H('h15','Alanya Cleopatra Bay','alanya',4,8.5,1450,['family','beach','allin'],['privbeach','pool','kids','rest'],'ai',30,['h10.webp','h12.webp'],'resort',
      {ru:'На знаменитом пляже Клеопатры.',de:'Direkt am bekannten Kleopatra-Strand.',en:'Right on the famous Cleopatra beach.'}),
    H('h16','Kemer Adrasan Retreat','kemer',4,9.0,380,['boutique','wellness','adults'],['pool','seaview','spa'],'bb',150,['h01.webp','h11.webp'],'boutique',
      {ru:'Уединённый отель в бухте Адрасан.',de:'Zurückgezogenes Haus in der Bucht von Adrasan.',en:'A secluded house in the Adrasan bay.'}),
    H('h17','Lara Sea Palace','lara',5,9.2,1890,['luxury','allin','wellness'],['privbeach','pool','spa','rest','fitness'],'uai',0,['h02.webp','h08.webp'],'resort',
      {ru:'Курорт с большими террасами над морем.',de:'Resort mit großen Terrassen über dem Meer.',en:'Resort with wide terraces above the sea.'}),
    H('h18','Konyaaltı Marina Boutique','konyaalti',4,8.7,520,['boutique','city'],['pool','rest','transfer'],'bb',350,['h09.webp','h06.webp'],'boutique',
      {ru:'Современный бутик-отель у новой марины.',de:'Modernes Boutiquehotel an der neuen Marina.',en:'A modern boutique hotel by the new marina.'},'apartment'),
    H('h19','Side Garden Villas','side',5,9.3,410,['luxury','boutique','adults'],['pool','spa','seaview'],'bb',400,['h13.webp','h04.webp'],'villa',
      {ru:'Виллы в апельсиновых садах рядом с Сиде.',de:'Villen in Orangengärten bei Side.',en:'Villas in orange groves near Side.'}),
    H('h20','Antalya Bay Hillside','antalya',5,9.0,760,['luxury','city','wellness'],['pool','spa','seaview','rest'],'bb',500,['h14.webp','h01.webp'],'resort',
      {ru:'Отель на скале с панорамой залива.',de:'Haus auf der Klippe mit Panorama über die Bucht.',en:'A hotel on the cliff with a panorama of the bay.'}),
    H('h21','Belek Family Aquapark Resort','belek',5,8.9,2210,['family','allin','beach'],['privbeach','pool','kids','aqua','rest'],'ai',120,['h07.webp','h12.webp'],'resort',
      {ru:'Курорт с большим аквапарком для семей.',de:'Resort mit großem Aquapark für Familien.',en:'Resort with a large aquapark for families.'}),
    H('h22','Kemer Olympos Boutique','kemer',4,8.8,340,['boutique','beach'],['pool','seaview','rest'],'bb',80,['h11.webp','h03.webp'],'boutique',
      {ru:'Рядом с античным Олимпосом и пляжем.',de:'Nahe dem antiken Olympos und dem Strand.',en:'Close to ancient Olympos and the beach.'}),
    H('h23','Alanya Hillside Villas','alanya',5,9.1,290,['luxury','boutique','adults'],['pool','seaview','spa'],'bb',600,['h10.webp','h01.webp'],'villa',
      {ru:'Виллы на склоне с видом на бухту.',de:'Villen am Hang mit Blick über die Bucht.',en:'Hillside villas overlooking the bay.'}),
    H('h24','Lara Wellness Sanctuary','lara',5,9.4,880,['wellness','adults','luxury'],['pool','spa','seaview','fitness','rest'],'hb',200,['h08.webp','h02.webp'],'resort',
      {ru:'Спа-отель только для взрослых.',de:'Spa-Haus ausschließlich für Erwachsene.',en:'An adults-only spa retreat.'}),
  ];

  /* ====================================================================
     3 · State
     ==================================================================== */
  const KEY='onlyone.state.v1';

  /* The language follows the device unless the visitor picks one. `lang` stays
     null until they do, so an explicit choice always wins and a guess never
     hardens into a setting. */
  const SUPPORTED = ['de','en','tr','uk','ru'];
  const LANGUAGE_NAMES={de:'Deutsch',en:'English',tr:'Türkçe',uk:'Українська',ru:'Русский'};

  /* Markets where Russian is the second language people actually read. A
     browser set to one of these gets Russian; everyone else gets English.
     Falling back to Russian for the whole rest of the world is what handed a
     French, Dutch or Italian visitor a page in Cyrillic — and, until the click
     handler was fixed, no way out of it, because the language chips sit in a
     menu that would not open. */
  const RU_NEIGHBOURS = ['be','bg','sr','mk','kk','ky','uz','tg','tk','ka','hy','az','mo'];
  function detectLang(){
    var list = [];
    try {
      if (navigator.languages && navigator.languages.length) list = navigator.languages.slice();
      else if (navigator.language) list = [navigator.language];
    } catch (e) {}
    for (var i = 0; i < list.length; i++) {
      var tag = String(list[i] || '').trim().toLowerCase().replace('_','-');
      var base = tag.split('-')[0];
      if (base === 'ua') base = 'uk';
      if (SUPPORTED.indexOf(base) > -1) return base;
      if (RU_NEIGHBOURS.indexOf(base) > -1) return 'ru';
    }
    return 'en';
  }

  const DEF={lang:null,favorites:[],requests:[],leads:[],seq:127,staff:null,pendingExc:[],
             search:{from:'',to:'',adults:2,children:0}};
  let S=load();
  function load(){
    try{const r=JSON.parse(localStorage.getItem(KEY));if(r&&typeof r==='object')return Object.assign({},DEF,r);}catch(e){}
    return JSON.parse(JSON.stringify(DEF));
  }
  function save(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}}
  LANG = S.lang || detectLang();
  /* The standard `lang` attribute only. A `data-lang` copy used to sit here as
     well; nothing read it — no CSS rule, no other line of script — but it put
     the attribute on the root element, where it turned the click handler's
     language branch into a trap that swallowed every click on the site. Use
     :lang() or documentElement.lang if a hook is ever needed. */
  document.documentElement.lang=LANG;
  try{
    document.title = hx('ONLYONE · Путешествия по Турции','ONLYONE · Reisen in der Türkei','ONLYONE · Luxury Travel in Türkiye');
    const md=document.querySelector('meta[name="description"]');
    if(md) md.content=hx('Индивидуальные путешествия по Турции, проверенные отели и персональный VIP-ассистент.','Individuelle Reisen in der Türkei, ausgewählte Hotels und persönlicher VIP-Assistent.','Tailored travel in Türkiye, handpicked stays and a personal VIP assistant.');
  }catch(e){}

  const FLOW=['new','review','offer','accepted','payopen','paid','confirmed'];
  const STATUS_LABEL={new:'stNew',review:'stCheck',offer:'stOffer',accepted:'stAccepted',payopen:'stPay',paid:'stPaid',confirmed:'stConfirmed'};
  const STATUS_PILL={new:'pill--new',review:'pill--work',offer:'pill--offer',accepted:'pill--ok',payopen:'pill--pay',paid:'pill--done',confirmed:'pill--done'};

  /* ====================================================================
     4 · Utilities
     ==================================================================== */
  const $=(s,r)=>(r||document).querySelector(s);
  const $$=(s,r)=>Array.prototype.slice.call((r||document).querySelectorAll(s));
  const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const hotel=id=>PUBLIC_HOTELS.find(h=>h.id===id);
  const request=id=>S.requests.find(r=>r.id===id);
  const stars=n=>'★'.repeat(n);
  const rateWord=r=>r>=9.3?t('exceptional'):r>=8.8?t('wonderful'):t('veryGood');
  const fmtNum=n=>String(n).replace('.',LANG==='en'?'.':',');
  function fmtDate(s){
    if(!s)return '—';
    const d=new Date(s+'T00:00:00');
    if(isNaN(d))return s;
    const dd=String(d.getDate()).padStart(2,'0'),mm=String(d.getMonth()+1).padStart(2,'0');
    return LANG==='en'?`${dd}/${mm}/${d.getFullYear()}`:`${dd}.${mm}.${d.getFullYear()}`;
  }
  function nights(a,b){if(!a||!b)return 0;const d=(new Date(b)-new Date(a))/86400000;return d>0?Math.round(d):0;}
  function today(o){const d=new Date();d.setDate(d.getDate()+(o||0));return d.toISOString().slice(0,10);}
  function money(v,c){
    const n=Number(v)||0;
    const loc=LANG==='ru'?'ru-RU':LANG==='de'?'de-DE':LANG==='tr'?'tr-TR':LANG==='uk'?'uk-UA':'en-GB';
    return `${n.toLocaleString(loc,{minimumFractionDigits:0,maximumFractionDigits:2})} ${c||'EUR'}`;
  }
  /* The charter listings write €3.900, not "3 900 EUR" — the symbol in front
     is how a broker's rate card reads, and money() is left alone because the
     offers and payments built on it already read the other way. */
  const eur=v=>'€'+(Number(v)||0).toLocaleString(LANG==='ru'?'ru-RU':LANG==='de'?'de-DE':LANG==='tr'?'tr-TR':LANG==='uk'?'uk-UA':'en-GB',{maximumFractionDigits:0});
  /* Russian counts change the noun: 1 каюта, 3 каюты, 5 кают. */
  const ruPl=(n,one,few,many)=>{const m10=n%10,m100=n%100;
    if(m10===1&&m100!==11)return one;
    if(m10>=2&&m10<=4&&(m100<12||m100>14))return few;
    return many;};
  let toastTimer;
  function toast(msg){
    const el=$('#toast');if(!el)return;
    el.textContent=msg;el.classList.add('is-in');
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('is-in'),2100);
  }
  const ICONS={
    heart:'<path d="M12 20s-7-4.6-7-9.4A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.6C19 15.4 12 20 12 20z"/>',
    menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
    home:'<path d="M4 10.5 12 4l8 6.5V20H4z"/><path d="M9.5 20v-5.5h5V20"/>',
    search:'<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
    map:'<path d="m3 6.5 6-2.5 6 2.5 6-2.5v13l-6 2.5-6-2.5-6 2.5z"/><path d="M9 4v14M15 6.5v14"/>',
    trip:'<path d="M6.5 3.8h11v16.4l-5.5-3.2-5.5 3.2z"/>',
    back:'<path d="m14.5 5-6.5 7 6.5 7"/>',
    chev:'<path d="m9.5 5 6.5 7-6.5 7"/>',
    check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    pin:'<path d="M12 21s6.5-5.6 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 15.4 12 21 12 21z"/><circle cx="12" cy="10.6" r="2.3"/>',
    cal:'<rect x="3.8" y="5.2" width="16.4" height="15" rx="2.4"/><path d="M3.8 9.8h16.4M8.5 3.5v3.4M15.5 3.5v3.4"/>',
    users:'<circle cx="9" cy="8.4" r="3.3"/><path d="M3.4 19.4a5.6 5.6 0 0 1 11.2 0"/><path d="M16.5 6.2a3.2 3.2 0 0 1 0 6"/><path d="M17.8 14.2a5.6 5.6 0 0 1 3 5.2"/>',
    filter:'<path d="M4 6.5h16M7 12h10M10 17.5h4"/>',
    close:'<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>',
    plus:'<path d="M12 6v12M6 12h12"/>',
    minus:'<path d="M6 12h12"/>',
    share:'<circle cx="17.5" cy="6.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/><path d="m8.8 10.8 6.4-3.1M8.8 13.2l6.4 3.1"/>',
    grid:'<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
    inbox:'<path d="M4 13.5 6 5h12l2 8.5V19H4z"/><path d="M4 13.5h4l1 2.5h6l1-2.5h4"/>',
    book:'<path d="M5 4.5h11a3 3 0 0 1 3 3v12H8a3 3 0 0 1-3-3z"/><path d="M5 16.5h14"/>',
    user:'<circle cx="12" cy="8.2" r="3.6"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>',
    dots:'<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>',
    card:'<rect x="3.5" y="6" width="17" height="12" rx="2.5"/><path d="M3.5 10h17"/>',
    phone:'<path d="M5.2 4.8h3.1l1.6 3.9-2 1.3a11.4 11.4 0 0 0 5.1 5.1l1.3-2 3.9 1.6v3.1a1.6 1.6 0 0 1-1.8 1.6A15.4 15.4 0 0 1 3.6 6.6a1.6 1.6 0 0 1 1.6-1.8z"/>',
    lock:'<rect x="5" y="10.5" width="14" height="9.5" rx="2.4"/><path d="M8.4 10.5V7.8a3.6 3.6 0 0 1 7.2 0v2.7"/>',
    play:'<path d="m8 5.5 11 6.5-11 6.5z"/>',
    star:'<path d="m12 4.2 2.35 4.9 5.35.72-3.9 3.76.96 5.32L12 16.4l-4.76 2.5.96-5.32-3.9-3.76 5.35-.72z"/>',
    diamond:'<path d="M6 4h12l3 5-9 11L3 9z"/><path d="M3 9h18"/><path d="M9.5 4 7.5 9l4.5 11 4.5-11-2-5"/>',
    keyhouse:'<path d="M4 10.5 12 4l8 6.5V20H4z"/><circle cx="12" cy="12.6" r="1.7"/><path d="M12 14.3V17"/>',
    yacht:'<path d="M4 16.5h15.5l-1.9 3.2a1.6 1.6 0 0 1-1.4.8H7a1.6 1.6 0 0 1-1.4-.8z"/><path d="M11.4 14.4V4.2l6.9 8.1a1 1 0 0 1-.8 1.6z"/><path d="M9.4 14.4V8l-3.6 5.1a.8.8 0 0 0 .7 1.3z"/>',
    /* A low sedan rather than the box it was. The old glyph carried a raised
       panel across its roof — meant as a windscreen, read as a taxi sign, and
       at 22px that is the only thing anyone saw. This one has a belt line and
       a sloping greenhouse instead, which is what separates a car from a cab. */
    car:'<path d="M3.6 16.1v-2.5a1.5 1.5 0 0 1 .66-1.24l2.24-1.52 1.6-2.1a2.1 2.1 0 0 1 1.67-.82h3.96a2.1 2.1 0 0 1 1.5.63l2.55 2.6 1.62.52a1.8 1.8 0 0 1 1.24 1.71v2.74"/><path d="M3.6 16.1h1.9M10.5 16.1h3.4M18.9 16.1h1.7"/><path d="M6.9 11.2h9.9"/><circle cx="8.1" cy="16.2" r="2.05"/><circle cx="16.6" cy="16.2" r="2.05"/>',
    headset:'<path d="M5 13v-1a7 7 0 0 1 14 0v1"/><path d="M5 13h2.2v4.4H5.6A1.6 1.6 0 0 1 4 15.8V13z"/><path d="M19 13h-2.2v4.4h1.6A1.6 1.6 0 0 0 20 15.8V13z"/><path d="M17.2 17.8v.4a2.4 2.4 0 0 1-2.4 2.4h-1.6"/>',
    instagram:'<rect x="3.8" y="3.8" width="16.4" height="16.4" rx="4.8"/><circle cx="12" cy="12" r="3.9"/><circle cx="16.85" cy="7.15" r="1" fill="currentColor" stroke="none"/>',
    facebook:'<rect x="3.8" y="3.8" width="16.4" height="16.4" rx="4.8"/><path d="M14.7 8.3h-1.2a1.95 1.95 0 0 0-1.95 1.95V19.4"/><path d="M9.7 13.15h4.7"/>',
    mail:'<rect x="3.4" y="5.6" width="17.2" height="12.8" rx="2.6"/><path d="m4.6 7.7 7.4 5.4 7.4-5.4"/>',
    /* the bubble with its tail, and the same handset the phone icon draws,
       scaled to sit inside it */
    whatsapp:'<path d="M20.3 11.8a8.3 8.3 0 0 1-12.4 7.2l-4.2 1.3 1.4-4.1a8.3 8.3 0 1 1 15.2-4.4z"/><path d="M9.5 9.1h1.4l.8 1.8-1 .7a5.6 5.6 0 0 0 2.5 2.5l.7-1 1.8.8v1.4a.8.8 0 0 1-.9.8 7.6 7.6 0 0 1-6.1-6.1.8.8 0 0 1 .8-.9z"/>',
    globe:'<circle cx="12" cy="12" r="8.2"/><path d="M3.8 12h16.4M12 3.8a13 13 0 0 1 0 16.4a13 13 0 0 1 0-16.4"/>',
  };
  const icon=n=>`<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]||''}</svg>`;

  /* ====================================================================
     5 · Bottom sheet
     ==================================================================== */
  /* An open sheet takes the next back for itself: on a phone that gesture means
     "close this", not "leave the page underneath".

     It deliberately pushes NO history entry of its own. The first attempt did,
     and closing it called history.back() — which is asynchronous, so when a
     menu item closed the sheet and navigated in the same breath, the pushState
     from go() landed first and the late popstate then stepped a view backwards.
     Instead the sheet is handled entirely in popstate: back closes it and puts
     the current entry straight back, so nothing is ever left dangling and no
     ordering can go wrong. */
  function openSheet(html){
    $('#sheetInner').innerHTML=html;
    const w=$('#sheetWrap');
    w.classList.add('is-open');
    requestAnimationFrame(()=>w.classList.add('is-in'));
  }
  function closeSheet(){
    const w=$('#sheetWrap');
    w.classList.remove('is-in');
    setTimeout(()=>{w.classList.remove('is-open');$('#sheetInner').innerHTML='';},320);
  }

  /* ====================================================================
     6 · Router
     ==================================================================== */
  let VIEW={name:'home',param:null};
  const STACK=[];
  /* Going back should return you to where you were reading, not to the top of
     a list you already scrolled through. The scroll offset is captured on the
     way out and travels on the stack with the view it belongs to, so coming
     back from accommodation 14 lands on accommodation 14 — not on number 1.

     Forward navigation deliberately starts at the top: a new view is new
     material. Only `back` restores. */
  function scrollNow(){ const a=$('#app'); return a?a.scrollTop:0; }

  /* --------------------------------------------------------------------
     Browser history

     Views used to live only in STACK, so the phone's own back gesture knew
     nothing about them and simply left the site — or returned to whatever
     page the visitor had open before. Every view is now a history entry, so
     back steps one view back and forward steps one view forward, which is
     what the gesture means everywhere else on the phone.

     The history state is the authority on which view is showing; STACK is
     kept only for where each view was scrolled to, keyed by view rather than
     ordered, because forward navigation has to find it too.
     -------------------------------------------------------------------- */
  const SCROLLS=Object.create(null);
  const viewKey=(n,p)=>n+'|'+(p==null?'':p);
  let historyReady=false;

  function stateOf(){ return {oo:1, v:VIEW.name, p:VIEW.param}; }

  function initHistory(){
    if(historyReady||!window.history||!history.replaceState)return;
    historyReady=true;
    /* The intro sits underneath as its own entry: back from the first
       platform view returns to it, and back from there leaves the site —
       which is correct, because the intro is where the visit began. */
    history.replaceState({oo:1,v:'intro',p:null},'');
    history.pushState(stateOf(),'');
  }

  function go(name,param,noPush){
    if(!noPush&&VIEW.name){
      SCROLLS[viewKey(VIEW.name,VIEW.param)]=scrollNow();
      STACK.push({name:VIEW.name,param:VIEW.param,scroll:scrollNow()});
    }
    VIEW={name,param:param==null?null:param};
    if(historyReady){
      try{
        /* noPush means "replace this step", not "leave history alone" — the
           staff login swaps the login view for the dashboard without adding a
           step. Leaving the entry untouched made it still say 'staff', so back
           out of a request landed on the login form instead of the dashboard. */
        if(noPush) history.replaceState(stateOf(),'');
        else       history.pushState(stateOf(),'');
      }catch(e){}
    }
    render();
  }

  /* The in-app arrow and the phone's gesture must not be two different
     mechanisms, or they drift apart. The arrow simply asks the browser to go
     back and the popstate handler does the work. */
  function back(){
    if(historyReady&&window.history&&history.length>1){ history.back(); return; }
    const p=STACK.pop();
    VIEW=p||{name:'home',param:null};
    render(p?p.scroll:0);
  }

  window.addEventListener('popstate',function(ev){
    const st=ev.state;
    // an open sheet swallows this back: close it and stay where we are
    const w=$('#sheetWrap');
    if(w&&w.classList.contains('is-open')){
      closeSheet();
      if(historyReady){ try{ history.pushState(stateOf(),''); }catch(e){} }
      return;
    }
    if(!st||!st.oo)return;                 // not ours; leave it alone
    if(st.v==='intro'){
      SCROLLS[viewKey(VIEW.name,VIEW.param)]=scrollNow();
      if(window.ONLYONE&&window.ONLYONE.replayIntro)window.ONLYONE.replayIntro();
      return;
    }
    SCROLLS[viewKey(VIEW.name,VIEW.param)]=scrollNow();
    VIEW={name:st.v,param:st.p==null?null:st.p};
    render(SCROLLS[viewKey(VIEW.name,VIEW.param)]||0);
  });

  /* ====================================================================
     7 · Shared fragments
     ==================================================================== */
  function appbar(o){
    o=o||{};
    return `<header class="appbar${o.over?' appbar--over':''}">
      ${o.back?`<button class="iconBtn" data-act="back" aria-label="${t('back')}">${icon('back')}</button>`:''}
      <div class="appbar__brand">${o.title?
        `<span class="appbar__name" style="letter-spacing:.02em;font-size:15px">${esc(o.title)}</span>`:
        `<button class="brandLogoBtn" type="button" data-act="to-top" aria-label="ONLY ONE luxury travel — ${esc(hx('наверх','nach oben','back to top'))}"><span class="brandLogo brandLogo--bar" aria-hidden="true"></span></button>`}</div>
      ${o.fav?`<button class="iconBtn${isFav(o.fav)?' is-fav':''}" data-act="fav" data-id="${o.fav}">${icon('heart')}</button>`:''}
      ${o.menu===false?'':`<button class="iconBtn" data-act="menu" aria-label="${t('menu')}">${icon('menu')}</button>`}
    </header>`;
  }
  function tabbar(active){
    // Map and favourites moved into the menu; the two slots go to the parts
    // of the offering that carry the brand — a named person and the VIP trips.
    const items=[['home','home','navHome'],['search','search','navSearch'],
                 ['concierge','user','navConcierge'],['excursions','star','navVip'],
                 ['trips','trip','navTrips']];
    const open=S.requests.filter(r=>r.status==='offer'||r.status==='payopen').length;
    const unread=unreadForGuest();
    /* The concierge is the offering, not one tab among five: the whole promise
       is that a named person handles the trip. It gets the raised, filled
       treatment and sits in the middle slot so it reads as the primary action
       rather than a destination. */
    return `<nav class="tabbar">${items.map(([v,ic,k])=>{
      const dot = (v==='trips'&&open) || (v==='concierge'&&unread);
      const hero = v==='concierge' ? ' tab--hero' : '';
      return `<button class="tab${hero}${active===v?' is-on':''}" data-go="${v}"><span class="tab__ic">${icon(ic)}</span><span>${t(k)}</span>${dot?'<i class="tab__dot"></i>':''}</button>`;}).join('')}</nav>`;
  }
  function staffTabbar(active){
    const items=[['s-dash','grid','dashboard'],['s-req','inbox','requests'],['s-book','book','bookings'],['s-cust','user','customers'],['s-more','dots','more']];
    const nw=S.requests.filter(r=>r.status==='new').length
      + S.requests.filter(r=>(r.messages||[]).some(m=>m.from==='guest'&&!m.read)).length
      /* A direct booking never passes 'new' — paid money must still light
         the dot until someone records the confirmation. */
      + S.requests.filter(r=>r.kind==='charter'&&r.status==='paid').length;
    return `<nav class="tabbar tabbar--staff">${items.map(([v,ic,k])=>
      `<button class="tab${active===v?' is-on':''}" data-go="${v}">${icon(ic)}<span>${t(k)}</span>${v==='s-req'&&nw?'<i class="tab__dot"></i>':''}</button>`).join('')}</nav>`;
  }
  const isFav=id=>S.favorites.indexOf(id)>-1;

  function hotelCard(h){
    // No score badge, no coloured pills, no per-card button. The photograph
    // carries the entry; the whole thing is the tap target.
    // Two amenities plus the board — more than three items wraps badly in
    // Russian, where uppercase words are markedly wider than in German.
    const traits = h.amen.slice(0,2).map(a=>esc(label(AMEN,a)));
    traits.push(esc(label(BOARDS,h.board)));
    return `<article class="card fade-up" data-hotel="${h.id}" role="button" tabindex="0">
      <div class="card__media">
        <img src="${h.imgs[0]}" alt="${esc(h.name)}" loading="lazy" decoding="async">
        <button class="card__fav${isFav(h.id)?' is-on':''}" data-act="fav" data-id="${h.id}" aria-label="${t('myFav')}">${icon('heart')}</button>
      </div>
      <div class="card__body">
        <div class="stars">${stars(h.stars)}</div>
        <h3 class="card__name">${esc(h.name)}</h3>
        <div class="card__loc">${esc(label(KINDS,h.kind))} · ${esc(regionName(h.region))}${h.beach===0?' · '+esc(t('onBeach')):''}</div>
        <div class="score"><b>${fmtNum(h.rating)}</b><span>${rateWord(h.rating)}</span></div>
        <div class="traits">${traits.join('<i>·</i>')}</div>
        <p class="card__desc">${esc(loc(h.desc))}</p>
      </div>
    </article>`;
  }

  function excCard(e){
    return `<article class="card fade-up" data-exc="${e.id}" role="button" tabindex="0">
      <div class="card__media" style="aspect-ratio:16/10">
        <img src="${e.img}" alt="${esc(loc(e.n))}" loading="lazy" decoding="async">
      </div>
      <div class="card__body">
        <div class="card__loc" style="color:var(--gold)">${esc(loc(e.dur))}</div>
        <h3 class="card__name">${esc(loc(e.n))}</h3>
        <p class="card__desc">${esc(loc(e.d))}</p>
      </div>
    </article>`;
  }
  function vExcursions(){
    return `<section class="bandHero">
      ${bgVideo('./video/onlyone-excursions-v2.mp4','./images/onlyone-excursions-poster.webp')}
      <div class="bandHero__scrim"></div>
      <div class="gal__bar"><span></span>
        <button class="iconBtn" data-act="menu" aria-label="${t('menu')}">${icon('menu')}</button></div>
      <div class="bandHero__txt">
        <div class="eyebrow">${t('excSub')}</div>
        <h1 class="h-xl" style="margin-top:8px">${t('excursions')}</h1>
      </div>
    </section>
    <div class="wrap" style="padding-top:26px">
      <p class="muted" style="font-size:13px;line-height:1.65;margin:0 0 30px">${t('excNote')}</p>
      <div class="cardList">${EXCURSIONS.map(excCard).join('')}</div>
    </div>
    <div class="pageBottom"></div>${tabbar('excursions')}`;
  }

  /* --------------------------------------------------------------------
     Charter listings — yachts and VIP transport

     One card grammar for both pages, read from any broker's site: the
     photograph, the name, one line of what it is, one line of how many it
     takes, and the entry rate under a hairline. The whole card is the tap
     target and opens the detail sheet.
     -------------------------------------------------------------------- */
  const vehName=v=>typeof v.name==='string'?v.name:loc(v.name);
  /* The weekly fleet states its length the way the market does — metres with
     feet in brackets; the day fleet keeps its plain metres. */
  const yachtLen=y=>y.ft
    ?`${fmtNum(y.m)} ${hx('м','m','m')} (${y.ft}′)`
    :`${fmtNum(y.m)} ${hx('м','m','m')}`;
  const yachtSpecs=y=>`${yachtLen(y)} · ${y.builder} · ${y.year}`;
  const yachtRateLabel=y=>y.week
    ?hx('тариф в неделю от','Wochenrate ab','weekly rates from')
    :hx('тариф в день от','Tagesrate ab','day rates from');
  const yachtCap=y=>hx(
    `${y.cabins} ${ruPl(y.cabins,'каюта','каюты','кают')} · до ${y.guests} гостей · экипаж ${y.crew}`,
    `${y.cabins} ${y.cabins===1?'Kabine':'Kabinen'} · bis ${y.guests} Gäste · ${y.crew} Crew`,
    `${y.cabins} ${y.cabins===1?'cabin':'cabins'} · up to ${y.guests} guests · crew of ${y.crew}`);
  const rateWordFleet=perFlight=>perFlight
    ?hx('за перелёт от','pro Flug ab','per flight from')
    :hx('за маршрут от','pro Strecke ab','per route from');

  /* What a fleet card shows while its photograph does not exist yet — and
     what the error handler in section 12 swaps in when a wired filename
     comes back 404. */
  const pendingMedia=()=>`<div class="charterCard__media--pending" aria-hidden="true">
        ${icon('yacht')}<span>${hx('Фото скоро','Foto folgt','Photo coming soon')}</span>
      </div>`;
  function charterCard(o){
    /* o: {attr,img,name,l1,l2,rateLabel,rate} */
    return `<article class="card charterCard fade-up" ${o.attr} role="button" tabindex="0">
      ${o.img?`<div class="card__media" style="aspect-ratio:16/10">
        <img src="${o.img}" alt="${esc(o.name)}" loading="lazy" decoding="async">
      </div>`:pendingMedia()}
      <div class="card__body">
        <h3 class="charterCard__name">${esc(o.name)}</h3>
        <div class="charterCard__line">${esc(o.l1)}</div>
        <div class="charterCard__line charterCard__line--soft">${esc(o.l2)}</div>
        <div class="charterCard__rate">
          <div class="charterCard__rateVal"><span>${esc(o.rateLabel)}</span><b>${esc(o.rate)}</b></div>
          ${/* No handler of its own: the tap bubbles to the card, which is
                the sheet's door anyway — the button only says the door is
                there. */''}
          <button class="charterCard__more" type="button">${hx('Детали','Details','Details')}${icon('chev')}</button>
        </div>
        ${o.book?`<button class="btn btn--gold charterCard__book" type="button" data-book="${o.book}">${hx('Забронировать и оплатить','Buchen & bezahlen','Book & pay')}</button>`:''}
      </div>
    </article>`;
  }
  function fleetHead(o){
    /* o: {eyebrow,title,note,chips} — the calm listing head: no hero, the
       photographs belong to the fleet itself. */
    return `${appbar({back:true})}
    <section class="fleetIntro">
      <div class="eyebrow">${esc(o.eyebrow)}</div>
      <h1 class="h-xl">${esc(o.title)}</h1>
      <p class="fleetIntro__note">${esc(o.note)}</p>
      <div class="chips fleetChips">${o.chips}</div>
    </section>`;
  }
  const fleetEmpty=()=>`<div class="fleetEmpty fade-up">
      <p>${hx('Под этот фильтр мы подберём вариант лично — флот шире, чем страница.',
              'Für diesen Filter stellen wir die Option persönlich zusammen — die Flotte ist größer als diese Seite.',
              'For this filter we will match you personally — the fleet is larger than this page.')}</p>
      <button class="btn btn--ghost" data-go="concierge">${t('askVip')}</button>
    </div>`;

  function vYachts(){
    const yCard=y=>charterCard({
      attr:`data-yacht="${y.id}"`, img:y.img, name:y.name,
      l1:yachtSpecs(y), l2:yachtCap(y),
      rateLabel:yachtRateLabel(y), rate:eur(y.from),
      book:'yacht:'+y.id});
    const week=CHARTERF.size?FLEET_WEEK.filter(y=>y.size===CHARTERF.size):FLEET_WEEK;
    const chips=[`<button class="chip${CHARTERF.size?'':' is-on'}" data-ysize="">${hx('Все','Alle','All')}</button>`]
      .concat(FLEET_SIZES.map(s=>`<button class="chip${CHARTERF.size===s.id?' is-on':''}" data-ysize="${s.id}">${esc(loc(s.l))}</button>`)).join('');
    return `${fleetHead({
      eyebrow:'ONLYONE · '+hx('ПРИВАТНЫЙ ЧАРТЕР','PRIVATCHARTER','PRIVATE CHARTER'),
      title:hx('Наши яхты','Unsere Yachten','Our yachts'),
      note:hx('Недельный чартер по мировому флоту и дневные выходы вдоль турецкого побережья. Тарифы ориентировочные («от», без APA и налогов); точное предложение соберёт ваш VIP-ассистент.',
              'Wochencharter aus der internationalen Flotte und Tagestörns entlang der türkischen Küste. Die Raten sind Ab-Richtwerte ohne APA und Steuern; das genaue Angebot erstellt Ihr VIP-Assistent.',
              'Weekly charters from the international fleet and day runs along the Turkish coast. Rates are from-guides excl. APA and taxes; your VIP assistant prepares the exact offer.'),
      chips})}
    <div class="wrap">
      <h2 class="h-lg fleetSection">${hx('Недельный чартер','Wochencharter','Weekly charter')}</h2>
      <div class="cardList">${week.length?week.map(yCard).join(''):fleetEmpty()}</div>
      <h2 class="h-lg fleetSection">${hx('Дневные туры · Турция','Tagestörns · Türkiye','Day charters · Türkiye')}</h2>
      <div class="cardList">${YACHTS.map(yCard).join('')}</div>
      <div class="listCard blockAsk fleetAsk">
        <p>${hx('Нужна яхта побольше, гулет на неделю или флотилия на событие? Подберём за пределами этой страницы.',
                'Eine größere Yacht, eine Gulet für eine Woche oder eine Flottille für ein Event? Wir finden sie auch jenseits dieser Seite.',
                'A larger yacht, a gulet for a week or a flotilla for an event? We source beyond this page.')}</p>
        <button class="btn btn--primary" data-go="concierge">${t('flyCta')}</button>
      </div>
    </div>
    <div class="pageBottom"></div>${tabbar('')}`;
  }

  function vTransfers(){
    const list=CHARTERF.cls?VEHICLES.filter(v=>v.cls===CHARTERF.cls):VEHICLES;
    const chips=[`<button class="chip${CHARTERF.cls?'':' is-on'}" data-tclass="">${hx('Все','Alle','All')}</button>`]
      .concat(VEHICLE_CLASSES.map(c=>`<button class="chip${CHARTERF.cls===c.id?' is-on':''}" data-tclass="${c.id}">${esc(loc(c.l))}</button>`)).join('');
    return `${fleetHead({
      eyebrow:'ONLYONE · '+hx('VIP-ТРАНСФЕР','VIP-TRANSFER','VIP TRANSFER'),
      title:hx('VIP-транспорт','VIP-Transport','VIP transport'),
      note:hx('Лимузин, VIP-бус или вертолёт — с водителем или пилотом, встречей и сопровождением. Тарифы ориентировочные, по региону Антальи.',
              'Limousine, VIP-Bus oder Helikopter — mit Chauffeur oder Pilot, Empfang und Begleitung. Die Raten sind Richtwerte für die Region Antalya.',
              'Limousine, VIP bus or helicopter — with chauffeur or pilot, welcome and escort. Rates are a guide for the Antalya region.'),
      chips})}
    <div class="wrap">
      <div class="cardList">${list.length?list.map(v=>charterCard({
        attr:`data-vehicle="${v.id}"`, img:v.img, name:vehName(v),
        l1:loc(v.kind), l2:loc(v.cap),
        rateLabel:rateWordFleet(v.perFlight),
        rate:eur(v.from), book:'vehicle:'+v.id})).join(''):fleetEmpty()}</div>
      <div class="listCard blockAsk fleetAsk">
        <p>${hx('Кортеж, эскорт, встреча борта бизнес-авиации или машина на весь день — организуем по запросу.',
                'Konvoi, Eskorte, Empfang eines Privatjets oder ein Wagen für den ganzen Tag — organisieren wir auf Anfrage.',
                'A convoy, an escort, meeting a private jet or a car for the whole day — arranged on request.')}</p>
        <button class="btn btn--primary" data-go="concierge">${t('flyCta')}</button>
      </div>
    </div>
    <div class="pageBottom"></div>${tabbar('')}`;
  }

  /* ====================================================================
     8 · Guest views
     ==================================================================== */
  /* --------------------------------------------------------------------
     Hero slideshow — zero-gap crossfade

     All three photographs are present from the first render and are preloaded
     in <head>. The outgoing photograph remains fully visible underneath the
     incoming one until the incoming file has loaded and its opacity transition
     has completed. This guarantees there is never a white/empty hand-over.
     -------------------------------------------------------------------- */
  const HERO_SLIDES=[
    './images/hero/hero-06.webp',
    './images/hero/hero-03.webp',
    './images/hero/hero-04.webp',
  ];
  const HERO_HOLD_MS=8800;
  const HERO_FADE_MS=1800;
  let heroTimer=null;
  let heroIndex=0;
  let heroFadeTimer=null;

  function heroSlides(){
    if(!HERO_SLIDES.length)return '';
    return `<div class="pHero__slides" id="heroSlides" aria-hidden="true">
      ${HERO_SLIDES.map((src,i)=>`<img class="pHero__img${i===0?' is-active':''}"
        src="${src}" alt="" ${i===0?'fetchpriority="high"':'fetchpriority="low"'} decoding="async"
        style="--hero-delay:${-2.5-(i*5)}s">`).join('')}
    </div>`;
  }

  function stopHeroSlides(){
    if(heroTimer){clearInterval(heroTimer);heroTimer=null;}
    if(heroFadeTimer){clearTimeout(heroFadeTimer);heroFadeTimer=null;}
  }

  function heroImageReady(img){
    if(img.complete&&img.naturalWidth>0)return Promise.resolve(true);
    return new Promise(resolve=>{
      const done=()=>resolve(img.naturalWidth>0);
      img.addEventListener('load',done,{once:true});
      img.addEventListener('error',done,{once:true});
    });
  }

  function showNextHero(box,imgs){
    if(!box||!document.body.contains(box)||imgs.length<2)return;
    const current=imgs[heroIndex];
    const nextIndex=(heroIndex+1)%imgs.length;
    const next=imgs[nextIndex];

    /* Never remove the current frame before the next frame is actually ready.
       A slow network therefore lengthens a slide instead of exposing the hero
       background between photographs. */
    if(!(next.complete&&next.naturalWidth>0)){
      heroImageReady(next).then(ok=>{if(ok&&document.body.contains(box))showNextHero(box,imgs);});
      return;
    }

    current.classList.remove('is-active');
    current.classList.add('is-prev');
    next.classList.add('is-active');
    heroIndex=nextIndex;
    const hero=box.closest('.pHero');
    if(hero)hero.dataset.heroSlide=String(nextIndex);

    if(heroFadeTimer)clearTimeout(heroFadeTimer);
    heroFadeTimer=setTimeout(()=>{
      current.classList.remove('is-prev');
      heroFadeTimer=null;
    },HERO_FADE_MS+120);
  }

  function fillHeroSlides(){
    stopHeroSlides();
    const box=$('#heroSlides');
    if(!box)return;
    const imgs=$$('.pHero__img',box);
    if(!imgs.length)return;

    heroIndex=0;
    const hero=box.closest('.pHero');
    if(hero)hero.dataset.heroSlide='0';
    imgs.forEach((img,i)=>{
      img.classList.toggle('is-active',i===0);
      img.classList.remove('is-prev');
    });

    /* Start changing pictures only after every hero file has either loaded or
       reported an error. If one fails, the active image/fallback remains on
       screen; there is still no empty transition. */
    Promise.all(imgs.map(heroImageReady)).then(()=>{
      if(!document.body.contains(box)||imgs.length<2)return;
      heroTimer=setInterval(()=>showNextHero(box,imgs),HERO_HOLD_MS);
    });
  }

  /* One cloud layer. Every value that makes a cloud feel near or far is a
     number on its own row, so the whole sky can be re-tuned by reading a table
     instead of hunting through CSS. The sprites themselves were raymarched
     offline — see scripts/render-clouds/clouds.py. */
  function sky(rows, cls){
    return `<span class="flySky flySky--${cls}" aria-hidden="true">${rows.map(
      ([w,l,dur,delay,op,blur,drift,s0,s1,n])=>
      `<img src="./images/clouds/sky-cloud-${n}.webp" alt="" loading="lazy" decoding="async"
            style="--w:${w}%;--l:${l}%;--d:${dur}s;--dl:${delay}s;--o:${op};--b:${blur}px;--x:${drift}px;--s0:${s0};--s1:${s1}">`
    ).join('')}</span>`;
  }

  /* The four blocks that open. Each row is: where its picture comes from, and
     which strings it uses. The detail copy itself is still to come from the
     operator — when it does, it is three more keys per block and a `long` field
     here, not a new page. */
  const BLOCKS={
    welcome:{ img:'./images/vip-welcome-poster-v2.webp', vid:'./video/onlyone-vip-welcome-v3.mp4',
              eyebrow:'welcomeEyebrow', title:'welcomeTitle', body:'welcomeBody',
              fleet:'transfers' },
    yacht:  { img:'./images/yacht-tour-poster.webp',
              eyebrow:'yachtEyebrow',   title:'yachtTitle',   body:'yachtBody',
              fleet:'yachts' },
    groups: { img:'./images/video-posters/groups-cappadocia.webp', vid:'./video/onlyone-groups-cappadocia-v1.mp4',
              eyebrow:'groupsEyebrow',  title:'groupsTitle', body:'groupsBody' },
    events: { img:'./images/video-posters/event-dinner.webp',      vid:'./video/onlyone-event-dinner-v1.mp4',
              eyebrow:'eventEyebrow',   title:'eventTitle', body:'eventBody' },
    pamukkale:{ img:'./images/video-posters/pamukkale-tour.webp',  vid:'./video/onlyone-pamukkale-v1.mp4',
              eyebrow:'pamukkaleEyebrow', title:'pamukkaleTitle', body:'pamukkaleBody' },
    transfer:{word:true, eyebrow:'carEyebrow', title:'carTitle', body:'carBody',
              specA:'carSpecA', specB:'carSpecB', fleet:'transfers' },
    flight: { img:'./images/r18/transfer-heli.webp', plane:true,
              eyebrow:'flyEyebrow', title:'flyTitle', body:'flyBody',
              specA:'flySpecA', specB:'flySpecB', fleet:'transfers' },
  };
  /* The page each fleet CTA opens carries its own name — "view our yachts"
     on the yacht chapter, "vehicles & rates" on both transfer chapters. */
  const fleetCtaLabel=f=>f==='yachts'
    ?hx('Смотреть наши яхты','Unsere Yachten ansehen','View our yachts')
    :hx('Транспорт и тарифы','Fahrzeuge & Raten ansehen','View vehicles & rates');
  function vBlock(id){
    const b=BLOCKS[id]; if(!b) return vHome();
    const title=t(b.title).replace(/<br\s*\/?>/g,' ');
    return `${appbar({back:true})}
    <section class="blockHero${b.plane?' blockHero--plane':''}${b.word?' blockHero--word':''}${b.vid?' blockHero--video':''}">
      ${b.img?`<img class="blockHero__img" src="${b.img}" alt="" fetchpriority="high" decoding="async">`:''}
      ${b.vid?`<video class="blockHero__video" muted autoplay loop playsinline webkit-playsinline preload="auto" poster="${b.img||''}" disablepictureinpicture disableremoteplayback aria-hidden="true"><source src="${b.vid}" type="video/mp4"></video>`:''}
      ${b.word?`<span class="blockHero__word">${esc(t('carWord'))}</span>`:''}
      <span class="blockHero__scrim" aria-hidden="true"></span>
      ${/* The title only sits ON the picture where there is a picture to sit on.
            Over the jet and over the lettering it collided with the object —
            both of those heroes are a single object on a plain ground, so the
            words belong under them, not across them. */''}
      ${b.img&&!b.plane?`<div class="blockHero__txt">
        <div class="eyebrow">${t(b.eyebrow)}</div>
        <h1 class="blockHero__title">${title}</h1>
      </div>`:''}
    </section>
    <div class="wrap">
      ${b.img&&!b.plane?'':`<div class="blockHead">
        <div class="eyebrow">${t(b.eyebrow)}</div>
        <h1 class="blockHero__title">${title}</h1>
      </div>`}
      <p class="blockLede">${t(b.body)}</p>
      ${b.specA?`<div class="blockSpec"><span>${t(b.specA)}</span><span>${t(b.specB)}</span></div>`:''}
      ${b.fleet?`<button class="btn btn--gold blockFleetCta" data-go="${b.fleet}">${fleetCtaLabel(b.fleet)}${icon('chev')}</button>`:''}

      <h2 class="blockHow">${t('blockHow')}</h2>
      <ol class="blockSteps">
        <li><b>1</b><span>${t('blockStep1')}</span></li>
        <li><b>2</b><span>${t('blockStep2')}</span></li>
        <li><b>3</b><span>${t('blockStep3')}</span></li>
      </ol>

      <div class="listCard blockAsk">
        <p>${t('blockAskText')}</p>
        <button class="btn btn--primary" data-go="concierge">${t('flyCta')}</button>
      </div>
    </div>
    <div class="pageBottom"></div>${tabbar('')}`;
  }


  /* Everything the footer can reach lives in one object, so replacing a
     placeholder is one line rather than a hunt through markup.

     An entry without a url renders as text, not as a dead link — and becomes a
     link the moment one is filled in, with no other change. That is why the two
     social entries have none yet: a guessed handle points at somebody else's
     account, and a footer that sends visitors to a stranger is worse than one
     that does not send them anywhere. The phone numbers are the project's
     existing placeholders and would dial nothing, so they are text too. Only
     the address is live, because it is the one the app already offers under
     Contact and a bounce reaches nobody. */
  const CONTACT = {
    mail:      {label:'hello@onlyone.travel',    url:'mailto:hello@onlyone.travel'},
    phone:     {label:'+90 242 000 00 00',       url:''},
    whatsapp:  {label:'+90 500 000 00 00',       url:''},
    address:   {label:'Altınkum Mah. 1000 Sk., Konyaaltı, ANTALYA', url:''},
    instagram: {label:'@onlyonetravel',          url:''},
    facebook:  {label:'ONLYONE Luxury Travel',   url:''}
  };

  function siteFooter(){
    const social = [['instagram','Instagram'],['facebook','Facebook'],['mail','E-Mail']]
      .map(([k,name])=>{
        const c = CONTACT[k];
        const inner = `${icon(k)}<span class="srOnly">${esc(name)}</span>`;
        return c.url
          ? `<a class="siteFooter__ic" href="${esc(c.url)}" aria-label="${esc(name)} · ${esc(c.label)}"${k==='mail'?'':' target="_blank" rel="noopener noreferrer"'}>${inner}</a>`
          : `<span class="siteFooter__ic is-pending" role="img" aria-label="${esc(name)} · ${esc(c.label)}" title="${esc(c.label)}">${inner}</span>`;
      }).join('');

    /* The icon carries the label now, so the words that used to sit in the dt
       stay for anyone who cannot see it -- a mail glyph alone tells a screen
       reader nothing. That is also why this is a list rather than the
       definition list it was: with the term drawn instead of written, dt/dd no
       longer describes what is on the page. */
    const row = (ico, label, c) => `<li class="siteFooter__row">${icon(ico)}<span class="srOnly">${esc(label)}</span>${
      c.url ? `<a href="${esc(c.url)}">${esc(c.label)}</a>` : `<span>${esc(c.label)}</span>`}</li>`;

    return `<footer class="siteFooter">
      <div class="siteFooter__brand">
        <button class="brandLogoBtn" type="button" data-act="to-top" aria-label="ONLY ONE luxury travel — ${esc(hx('наверх','nach oben','back to top'))}"><span class="brandLogo brandLogo--footer" aria-hidden="true"></span></button>
      </div>
      <div class="siteFooter__rule" aria-hidden="true"></div>
      <h2 class="siteFooter__head">${esc(t('mContact'))}</h2>
      <ul class="siteFooter__rows">
        ${row('mail',     hx('Эл. почта','E-Mail','Email'), CONTACT.mail)}
        ${row('phone',    hx('Телефон','Telefon','Phone'),  CONTACT.phone)}
        ${row('whatsapp', 'WhatsApp',                        CONTACT.whatsapp)}
      </ul>
      <div class="siteFooter__social">${social}</div>
      <div class="siteFooter__rule" aria-hidden="true"></div>
      <div class="siteFooter__addr">
        <span class="siteFooter__addrLabel">${hx('Адрес','Adresse','Address')}</span>
        <address>${esc(CONTACT.address.label)}</address>
      </div>
      <p class="siteFooter__legal">© ${new Date().getFullYear()} ONLYONE Luxury Travel · ${hx('Анталья, Турция','Antalya, Türkei','Antalya, Türkiye')}</p>
    </footer>`;
  }

  function vHome(){
    const curated=PUBLIC_HOTELS.slice().sort((a,b)=>b.rating-a.rating).slice(0,5);
    const featured=curated[0], curatedRest=curated.slice(1);

    const promos=[
      {img:'./images/excursions/exc-cappadocia.webp',tag:hx('АКТУАЛЬНО','AKTUELL','CURRENT'),title:hx('Каппадокия · сезон воздушных шаров','Kappadokien · Ballonsaison','Cappadocia · balloon season'),meta:hx('Тематическое путешествие · по запросу','Themenreise · auf Anfrage','Themed journey · on request'),attr:'data-exc="cappadocia"'},
      {img:'./images/promos-r14/event-management.webp',tag:hx('СОБЫТИЕ','EVENT','EVENT'),title:hx('Event-менеджмент','Event-Management','Event management'),meta:hx('Частные события · площадка · организация','Private Events · Location · Organisation','Private events · venue · organisation'),attr:'data-world="event-management"'},
      {img:'./images/promos-r14/sport-group-events.webp',tag:hx('ГРУППА','GRUPPE','GROUP'),title:hx('Спорт и групповые мероприятия','Sport & Gruppenveranstaltungen','Sports & group events'),meta:hx('Команды · турниры · особые поездки','Teams · Turniere · besondere Reisen','Teams · tournaments · special journeys'),attr:'data-world="group-tours"'},
      {img:'./images/yacht-tour-poster.webp',tag:hx('ЭКСКЛЮЗИВ','EXKLUSIV','SPECIAL'),title:hx('Приватный день на яхте','Privater Tag auf der Yacht','Private yacht day'),meta:hx('Маршрут и яхта индивидуально','Route & Yacht individuell','Route & yacht tailored'),attr:'data-block="yacht"'},
      {img:'./images/r18/promo-private-beach.webp',tag:hx('ОТДЫХ','AUSZEIT','ESCAPE'),title:hx('Приватный пляжный день','Privater Strandtag','Private Beach Escape'),meta:hx('Пляжный клуб · закат · релакс','Beach Club · Sunset · Relax','Beach club · sunset · relax'),attr:'data-go="concierge"'},
      {img:'./images/excursions/exc-pamukkale.webp',tag:hx('ТУР','TOUR','TOUR'),title:hx('Памуккале · приватный день','Pamukkale · Private Day','Pamukkale · private day'),meta:hx('Индивидуально · без цены на сайте','Individuell · ohne Onlinepreis','Private · no online price'),attr:'data-exc="pamukkale"'}
    ];

    const superDeal={img:'./images/r18/super-deal-resort.webp',title:hx('Спецпредложение · отдых на курорте','Super Deal · Auszeit im Resort','Super Deal · Resort Escape'),meta:hx('Большой приватный отдых у моря · по запросу','Großer privater Erholungsaufenthalt am Meer · auf Anfrage','Large private seaside escape · on request'),attr:'data-go="search"'};

    const categories=[
      {img:'./images/worlds/villas.webp',title:hx('Виллы','Villen','Villas'),meta:hx('Приватно · индивидуально','Privat · individuell','Private · individual'),attr:'data-world="villas"'},
      {img:'./images/worlds/beach.webp',title:hx('Пляжные курорты','Strandresorts','Beach resorts'),meta:hx('Море · солнце · отдых','Meer · Sonne · Erholung','Sea · sun · escape'),attr:'data-world="beach"'},
      {img:'./images/worlds-r13/group-events.webp',title:hx('Групповые туры','Gruppenreisen','Group tours'),meta:hx('Тематические путешествия','Thematische Reisen','Themed journeys'),attr:'data-world="group-tours"'},
      {img:'./images/r20/sport-travel-banner.webp',title:hx('Спортивные туры','Sportreisen','Sports journeys'),meta:hx('Активно · природа · море','Aktiv · Natur · Meer','Active · nature · sea'),attr:'data-go="excursions"'},
      {img:'./images/worlds-r13/event-management.webp',title:hx('Event-менеджмент','Event-Management','Event management'),meta:hx('События · группы · частные праздники','Events · Gruppen · private Anlässe','Events · groups · private occasions'),attr:'data-world="event-management"'}
    ];

    /* The four places this site actually goes, as one calm block before any
       photography starts. Everything else on the page is a picture asking to
       be looked at; this is the part that answers "what is here" in four
       words, so it is typographic and beige. A fifth row of photographs would
       have vanished between the hero and the offers rail. */
    const mainAreas=[
      {ic:'keyhouse', attr:'data-go="search"',
       title:hx('Красивейшие места','Die schönsten Unterkünfte','The finest stays'),
       meta:hx('Отобранные дома','Ausgewählte Häuser','Selected houses')},
      {ic:'star', attr:'data-go="excursions"',
       title:hx('VIP-экскурсии','VIP-Ausflüge','VIP excursions'),
       meta:hx('Приватные маршруты','Private Routen','Private routes')},
      {ic:'car', attr:'data-block="welcome"',
       title:hx('Приём и трансфер','Empfang & Transfer','Welcome & transfer'),
       meta:hx('От трапа до отеля','Vom Flieger zum Hotel','From the plane to the hotel')},
      {ic:'headset', attr:'data-go="concierge"',
       title:hx('VIP-ассистент','VIP-Assistent','VIP assistant'),
       meta:hx('Один человек на всё','Eine Person für alles','One person for everything')}
    ];

    /* The order is the journey, not a list of products: met at the gate,
       then the day that is the reason for coming, then how you move on land,
       then the fastest way across it. The welcome keeps the featured card
       because it is the first thing that happens. */
    const vipServices=[
      {img:'./images/vip-welcome-poster-v2.webp',video:'./video/onlyone-vip-welcome-v3.mp4',ey:hx('ПРИБЫТИЕ','ANKUNFT','ARRIVAL'),title:hx('VIP-приём','VIP-Empfang','VIP Welcome'),body:hx('Личная встреча в аэропорту и сопровождение.','Persönlicher Empfang am Flughafen und Begleitung.','Personal airport welcome and assistance.'),attr:'data-block="welcome"',featured:true},
      /* The yacht used to have a chapter of its own further down the page —
         a full-width video and four route cards. It is one service among the
         others, so it sits with them, and it keeps the video that chapter was
         built around rather than losing it with the section. */
      {img:'./images/yacht-tour-poster.webp',video:'./video/onlyone-yacht-tour-v2.mp4',ey:hx('МОРЕ','MEER','SEA'),title:hx('Приватная яхта','Private Yacht','Private yacht'),body:hx('Маршрут, яхта и день на воде — полностью по вашему вкусу.','Route, Yacht und ein Tag auf dem Wasser – ganz nach deinem Geschmack.','Route, yacht and a day on the water — entirely to your taste.'),attr:'data-block="yacht"'},
      /* Was "Business Van", which named the vehicle rather than the service
         and left self-drive unsaid although it is offered. The eyebrow now
         completes the set — arrival, sea, road, air. */
      {img:'./images/r18/transfer-van.webp',ey:hx('ДОРОГА','STRASSE','ROAD'),title:hx('Автотрансфер','Autotransfer','Car transfer'),body:hx('С водителем или без — комфортный автомобиль для семьи, команды или небольшой группы.','Mit oder ohne Chauffeur – komfortabel für Familie, Team oder kleine Gruppe.','With or without a chauffeur — comfortable for a family, a team or a small group.'),attr:'data-block="transfer"'},
      {img:'./images/r18/transfer-heli.webp',ey:hx('ВОЗДУХ','LUFT','AIR'),title:hx('Вертолётный трансфер','Helikopter-Transfer','Helicopter Transfer'),body:hx('Премиальная встреча и быстрый трансфер по воздуху.','Premium-Empfang und schneller Transfer aus der Luft.','Premium welcome and fast transfer by air.'),attr:'data-block="flight"'}
    ];

    return `${appbar({over:true})}
    <section class="pHero">
      ${heroSlides()}
      <div class="pHero__scrim"></div><div class="pHero__glassLayer" aria-hidden="true"></div>
      <span class="pHero__script" aria-hidden="true">${t('heroScript')}</span>
      <div class="pHero__body"><h1 class="pHero__title">${t('heroTitle')}</h1><p class="pHero__sub">${t('heroSub')}</p>
        <button class="pHero__cta" type="button" data-go="concierge">${t('heroCta')}${icon('chev')}</button></div>
    </section>

    <section class="homeGateway">
      <div class="homeGateway__grid">${mainAreas.map(a=>`<button class="homeGatewayTile" type="button" ${a.attr}>
        <span class="homeGatewayTile__ic" aria-hidden="true">${icon(a.ic)}</span>
        <span class="homeGatewayTile__copy"><b>${esc(a.title)}</b><i>${esc(a.meta)}</i></span>
        <span class="homeGatewayTile__go" aria-hidden="true">${icon('chev')}</span>
      </button>`).join('')}</div>
    </section>

    <section class="homePromos">
      <div class="homeEditorialHead homeEditorialHead--row"><div><div class="eyebrow">ONLYONE · ${hx('СЕЙЧАС','AKTUELL','NOW')}</div>
        <h2>${hx('Актуальные предложения','Aktuelle Angebote','Current offers')}</h2>
        <p class="homeEditorialHead__sub">${hx('Скидки, туры и особенные предложения — то, что актуально прямо сейчас.','Aktionen, Touren und besondere Empfehlungen – was gerade aktuell ist.','Offers, tours and special recommendations — what matters right now.')}</p>
      </div><button class="homeTextLink" type="button" data-go="search">${t('all')}</button></div>
      <div class="homePromos__rail">${promos.map((p,i)=>`<button class="homePromoCard" type="button" ${p.attr}>
        <img src="${p.img}" alt="${esc(p.title)}" loading="${i<2?'eager':'lazy'}" decoding="async" fetchpriority="${i===0?'high':'low'}">
        <span class="homePromoCard__shade"></span><span class="homePromoCard__copy"><i>${esc(p.tag)}</i><b>${esc(p.title)}</b><em>${esc(p.meta)}</em><span>${icon('chev')}</span></span>
      </button>`).join('')}</div>
      <div class="railBar" aria-hidden="true"><i></i></div>
    </section>

    <section class="homeSuperDeal">
      <div class="homeEditorialHead homeEditorialHead--row"><div><div class="eyebrow">ONLYONE · ${hx('СПЕЦПРЕДЛОЖЕНИЕ','TOP-ANGEBOT','SUPER DEAL')}</div>
        <h2>${hx('Спецпредложение','Top-Angebot','Super Deal')}</h2>
        <p class="homeEditorialHead__sub">${hx('Крупное предложение месяца — более высокий акцент и больше пространства.','Das große Angebot des Monats – mit mehr Höhe und mehr Raum inszeniert.','The big offer of the month — presented larger with more breathing room.')}</p>
      </div><button class="homeTextLink" type="button" ${superDeal.attr}>${hx('Смотреть','Ansehen','View')}</button></div>
      <button class="homeSuperDealCard" type="button" ${superDeal.attr}>
        <img src="${superDeal.img}" alt="${esc(superDeal.title)}" loading="lazy" decoding="async">
        <span class="homeSuperDealCard__shade"></span>
        <span class="homeSuperDealCard__copy"><i>ONLYONE · ${hx('СПЕЦПРЕДЛОЖЕНИЕ','TOP-ANGEBOT','SUPER DEAL')}</i><b>${esc(superDeal.title)}</b><em>${esc(superDeal.meta)}</em><span>${hx('VIP-запрос','VIP-Anfrage','VIP enquiry')}${icon('chev')}</span></span>
      </button>
    </section>

    <section class="homeVipCallback">
      <div class="homeVipCallback__icon" aria-hidden="true">${icon('headset')}</div>
      <div class="homeVipCallback__head"><div class="eyebrow">ONLYONE · VIP</div><h2>${hx('VIP-ассистент на связи','VIP-Assistent auf Abruf','VIP assistant on call')}</h2>
        <p>${hx('Оставьте имя и телефон — ваш VIP-ассистент свяжется с вами лично.','Name und Telefonnummer hinterlassen – dein VIP-Assistent ruft persönlich zurück.','Leave your name and phone number — your VIP assistant will call you personally.')}</p></div>
      <div class="homeVipCallback__form vipLeadForm" data-vip-lead-form>
        <label><span>${hx('Имя','Name','Name')}</span><input data-vip-name type="text" autocomplete="name" placeholder="${hx('Ваше имя','Ihr Name','Your name')}"></label>
        <label><span>${hx('Телефон','Telefon','Phone')}</span><input data-vip-phone type="tel" autocomplete="tel" inputmode="tel" placeholder="+90 ..."></label>
        <button type="button" data-act="vip-callback" data-source="home-vip">${hx('Отправить запрос','Anfrage senden','Send request')}${icon('chev')}</button>
        <small>${hx('Без обязательств. Мы используем номер только для связи по вашему запросу.','Unverbindlich. Die Nummer wird nur für diese Anfrage verwendet.','No obligation. Your number is used only for this request.')}</small>
      </div>
    </section>

    <section class="travelWorlds travelWorlds--customer">
      <div class="homeEditorialHead homeEditorialHead--dark"><div class="eyebrow">ONLYONE · ${hx('ТУРЦИЯ','TÜRKEI','TÜRKİYE')}</div>
        <h2>${hx('Как вы хотите путешествовать?','Wie möchtest du reisen?','How would you like to travel?')}</h2>
        <p class="homeEditorialHead__sub">${hx('Пять направлений для разного ритма путешествия.','Fünf Reisewelten für unterschiedliche Wünsche.','Five travel worlds for different ways to explore.')}</p></div>
      <div class="travelWorlds__rail">${categories.map((x,i)=>`<button class="travelWorld" type="button" ${x.attr}>
        <img src="${x.img}" alt="${esc(x.title)}" loading="${i<2?'eager':'lazy'}" decoding="async" fetchpriority="low">
        <span class="travelWorld__shade"></span><span class="travelWorld__copy"><b>${esc(x.title)}</b><i>${esc(x.meta)}</i><span>${icon('chev')}</span></span>
      </button>`).join('')}</div>
      <div class="railBar" aria-hidden="true"><i></i></div>
    </section>

    <section class="homeOffers homeBestHotels">
      <div class="homeEditorialHead homeEditorialHead--row"><div><div class="eyebrow">ONLYONE · ${hx('ОТОБРАНО','AUSGEWÄHLT','SELECTED')}</div><h2>${hx('Лучшие отели','Beste Hotels','Best Hotels')}</h2>
        <p class="homeEditorialHead__sub">${hx('Отобранные нами отели для особенного путешествия.','Von uns ausgewählte Hotels für eine besondere Reise.','Hotels selected by us for an exceptional journey.')}</p>
      </div><button class="homeTextLink" type="button" data-go="search">${t('all')}</button></div>
      ${featured?`<article class="homeOfferCard homeOfferCard--featured" data-hotel="${featured.id}" role="button" tabindex="0"><div class="homeOfferCard__media">
        <img src="${featured.imgs[0]}" alt="${esc(featured.name)}" loading="lazy" decoding="async"><span class="homeOfferCard__shade"></span><span class="homeOfferCard__badge">${hx('ВЫБОР ONLYONE','ONLYONE AUSWAHL','ONLYONE CHOICE')}</span>
        <button class="homeOfferCard__fav${isFav(featured.id)?' is-on':''}" data-act="fav" data-id="${featured.id}" aria-label="${t('myFav')}">${icon('heart')}</button>
        <span class="homeOfferCard__copy"><span class="stars">${stars(featured.stars)}</span><b>${esc(featured.name)}</b><i>${esc(regionName(featured.region))} · ${fmtNum(featured.rating)}</i>
          <em>${hx('Приватный пляж · VIP-трансфер по запросу','Privatstrand · VIP-Transfer auf Anfrage','Private beach · VIP transfer on request')}</em></span>
      </div></article>`:''}
      <div class="homeOfferGrid" aria-label="${hx('Лучшие отели','Beste Hotels','Best Hotels')}">${curatedRest.map(h=>`<article class="homeOfferCard homeOfferCard--small" data-hotel="${h.id}" role="button" tabindex="0"><div class="homeOfferCard__media">
        <img src="${h.imgs[0]}" alt="${esc(h.name)}" loading="lazy" decoding="async"><span class="homeOfferCard__shade"></span>
        <button class="homeOfferCard__fav${isFav(h.id)?' is-on':''}" data-act="fav" data-id="${h.id}" aria-label="${t('myFav')}">${icon('heart')}</button>
        <span class="homeOfferCard__copy"><span class="stars">${stars(h.stars)}</span><b>${esc(h.name)}</b><i>${esc(regionName(h.region))} · ${fmtNum(h.rating)}</i></span>
      </div></article>`).join('')}</div>
    </section>

    <section class="homeVipServices">
      <div class="homeEditorialHead homeEditorialHead--dark"><div class="eyebrow">ONLYONE · ${hx('VIP-СЕРВИСЫ','VIP-SERVICES','VIP SERVICES')}</div>
        <h2>${hx('VIP-приём, яхта и трансфер','VIP-Empfang, Yacht & Transfer','VIP welcome, yacht & transfer')}</h2>
        <p class="homeEditorialHead__sub">${hx('Личная встреча, приватная яхта, автотрансфер и вертолёт — всё организуется персонально.','Persönlicher Empfang, private Yacht, Autotransfer und Helikopter – individuell organisiert.','Personal welcome, private yacht, car transfer and helicopter — arranged individually.')}</p></div>
      <div class="homeVipServices__rail">${vipServices.map(s=>`<button class="vipServiceCard${s.featured?' vipServiceCard--featured':''}${s.video?' vipServiceCard--video':''}" type="button" ${s.attr}>
        <img src="${s.img}" alt="" loading="lazy" decoding="async">${s.video?`<video class="vipServiceCard__video" muted autoplay loop playsinline webkit-playsinline preload="none" poster="${s.img}" data-bg="${s.video}" disablepictureinpicture disableremoteplayback aria-hidden="true"></video>`:''}<span class="vipServiceCard__shade"></span>
        <span class="vipServiceCard__copy"><i>${esc(s.ey)}</i><b>${esc(s.title)}</b><p>${esc(s.body)}</p><em>${hx('Подробнее','Mehr erfahren','Learn more')}${icon('chev')}</em></span>
      </button>`).join('')}</div>
      <div class="railBar" aria-hidden="true"><i></i></div>
      <div class="homeVipServices__links">
        <button type="button" data-go="transfers">${icon('car')}<span>${hx('VIP-транспорт и тарифы','VIP-Transport & Raten','VIP transport & rates')}</span>${icon('chev')}</button>
        <button type="button" data-go="yachts">${icon('yacht')}<span>${hx('Наши яхты','Unsere Yachten','Our yachts')}</span>${icon('chev')}</button>
      </div>
    </section>

    <section class="homeAviationFinal homeAviationFinal--transferHero">
      ${sky([[30,-4,42,-8,.34,1.1,24,.76,1.02,1],[22,62,36,-20,.30,1.6,-20,.72,1.03,2],[18,34,31,-28,.26,2.0,14,.70,1.05,3],
             [26,80,45,-14,.32,1.3,-26,.74,1.02,6],[16,14,38,-34,.28,1.8,18,.68,1.04,5],[24,46,49,-4,.30,1.5,-12,.72,1.03,4]],'far')}
      ${sky([[44,-8,26,-5,.48,2.2,38,.94,1.16,3],[40,56,23,-13,.44,2.6,-30,.92,1.14,4],[32,18,20,-21,.42,2.9,42,.90,1.18,2],
             [36,74,28,-9,.46,2.4,-34,.92,1.15,6],[28,32,24,-17,.40,3.1,28,.88,1.20,5]],'near')}
      <div class="homeAviationFinal__copy"><div class="eyebrow">ONLYONE · ${hx('ЧАСТНАЯ АВИАЦИЯ','PRIVATE AVIATION','PRIVATE AVIATION')}</div>
        <h2>${hx('Ваше путешествие начинается ещё до посадки.','Deine Reise beginnt schon vor der Landung.','Your journey begins before you land.')}</h2>
        <p>${hx('Перелёт, VIP-приём и трансфер — одна персональная организация от ONLYONE.','Flug, VIP-Empfang und Transfer – persönlich aus einer Hand organisiert.','Flight, VIP welcome and transfer — personally arranged as one journey.')}</p>
        <button type="button" data-block="flight">${hx('Организовать перелёт','Flug organisieren','Arrange a flight')}${icon('chev')}</button>
      </div>
      <div class="homeAviationFinal__plane" aria-hidden="true"><span class="flyTrail homeAviationFinal__trail"><i style="left:42.5%;top:15%;--h:58%;--t:2.5s;--d:-.2s"></i><i style="left:46.5%;top:16%;--h:64%;--t:2.8s;--d:-1.0s"></i><i style="left:50.5%;top:17%;--h:68%;--t:2.4s;--d:-1.6s"></i><i style="left:54.5%;top:16%;--h:64%;--t:2.9s;--d:-.7s"></i><i style="left:58.5%;top:15%;--h:58%;--t:2.6s;--d:-1.3s"></i></span><img src="./images/3d/plane-top.webp" alt="" loading="lazy" decoding="async"></div>
    </section>

    <section class="homeTransferRequest homeTransferRequest--tile">
      <div class="homeTransferTile">
        <div class="homeTransferRequest__copy"><div class="eyebrow">${hx('ONLY ONE TRAVEL · VIP-ТРАНСФЕР','ONLY ONE TRAVEL · VIP-TRANSFER','ONLY ONE TRAVEL · VIP TRANSFER')}</div>
          <h2>${hx('Ваш VIP-транспорт ждёт вас','Ihr VIP-Transport wartet auf Sie','Your VIP transport is waiting for you')}</h2>
          <p>${hx('Короткая заявка — ваш VIP-ассистент уточнит детали лично.','Kurze Anfrage – dein VIP-Assistent klärt die Details persönlich.','A short request — your VIP assistant confirms the details personally.')}</p>
          <div class="homeTransferTile__perks">
            <span>${hx('Личная встреча','Persönlicher Empfang','Personal welcome')}</span>
            <span>${hx('Без цен онлайн','Keine Online-Preise','No online prices')}</span>
            <span>${hx('Один контакт','Ein Ansprechpartner','One contact')}</span>
          </div>
          <div class="homeTransferQuick">
            <label><span>${hx('Имя','Name','Name')}</span><input id="trQuickName" autocomplete="name" placeholder="${hx('Ваше имя','Ihr Name','Your name')}"></label>
            <label><span>${hx('Телефон','Telefon','Phone')}</span><input id="trQuickPhone" type="tel" autocomplete="tel" inputmode="tel" placeholder="+90 ..."></label>
            <button type="button" data-act="transfer-quick-send">${hx('Отправить запрос','Anfrage senden','Send request')}${icon('chev')}</button>
          </div>
          <button type="button" class="homeTransferTile__fleet" data-go="transfers">${hx('Транспорт и тарифы','Fahrzeuge & Raten ansehen','Vehicles & rates')}${icon('chev')}</button>
        </div>
      </div>
    </section>

    ${siteFooter()}
    <div class="pageBottom"></div>${tabbar('home')}`;
  }

  function vWorld(id){
    const x=EXPERIENCES.find(w=>w.id===id);if(!x)return vHome();
    let related=[];
    if(x.go.type)related=PUBLIC_HOTELS.filter(h=>h.types.indexOf(x.go.type)>-1).sort((a,b)=>b.rating-a.rating).slice(0,3);
    if(x.go.kind)related=PUBLIC_HOTELS.filter(h=>h.kind===x.go.kind).sort((a,b)=>b.rating-a.rating).slice(0,3);
    return `${appbar({back:true,title:loc(x.n)})}
      <section class="storyHero">
        <img src="${x.img}" alt="${esc(loc(x.n))}">
        <span class="storyHero__shade"></span>
        <div class="storyHero__copy"><div class="eyebrow">ONLYONE · ${hx('ТУРЦИЯ','TÜRKEI','TÜRKİYE')}</div><h1>${esc(loc(x.n))}</h1><p>${esc(loc(x.s))}</p></div>
      </section>
      <section class="storyIntro">
        <p>${esc(loc(x.lead))}</p>
        <div class="storyActions">
          <button class="btn btn--primary" data-world-explore="${x.id}">${t('exploreSelf')}</button>
          <button class="btn btn--ghost" data-go="concierge">${t('askVip')}</button>
        </div>
      </section>
      ${related.length?`<div class="wrap storyRelated"><div class="section__head"><h2 class="h-lg">${t('handpicked')}</h2></div><div class="cardList">${related.map(hotelCard).join('')}</div></div>`:''}
      ${x.id==='group-tours'?`<section class="storyTiles">${EXCURSIONS.slice(0,4).map(e=>`<button class="storyTile" data-exc="${e.id}"><img src="${e.img}" alt=""><span><b>${esc(loc(e.n))}</b><i>${esc(loc(e.dur))}</i></span></button>`).join('')}</section>`:''}
      ${x.id==='event-management'?`<section class="eventPromise"><div class="eyebrow">ONLYONE · ${hx('СОБЫТИЯ','EVENTS','EVENTS')}</div><h2>${hx('Локация · трансфер · ужин · программа','Location · Transfer · Dinner · Programm','Venue · transfer · dinner · programme')}</h2><p>${esc(loc(x.lead))}</p><button class="btn btn--gold" data-go="concierge">${t('planThisTrip')}</button></section>`:''}
      <div class="pageBottom"></div>${tabbar('home')}`;
  }

  function vDestination(id){
    const d=DESTINATIONS.find(x=>x.id===id);if(!d)return vHome();
    const related=d.regions?PUBLIC_HOTELS.filter(h=>d.regions.indexOf(h.region)>-1).sort((a,b)=>b.rating-a.rating).slice(0,3):[];
    return `${appbar({back:true,title:loc(d.n)})}
      <section class="storyHero storyHero--destination">
        <img src="${d.img}" alt="${esc(loc(d.n))}">
        <span class="storyHero__shade"></span>
        <div class="storyHero__copy"><div class="eyebrow">${hx('ТУРЦИЯ','TÜRKEI','TÜRKİYE')}</div><h1>${esc(loc(d.n))}</h1><p>${esc(loc(d.s))}</p></div>
      </section>
      <section class="storyIntro"><p>${esc(loc(d.d))}</p><p class="storyIntro__muted">${t('noCatalog')}</p>
        <div class="storyActions"><button class="btn btn--gold" data-go="concierge">${t('planThisTrip')}</button>${related.length?`<button class="btn btn--ghost" data-dest-search="${d.id}">${t('exploreSelf')}</button>`:''}</div>
      </section>
      ${related.length?`<div class="wrap storyRelated"><div class="section__head"><h2 class="h-lg">${t('handpicked')}</h2></div><div class="cardList">${related.map(hotelCard).join('')}</div></div>`:''}
      <div class="pageBottom"></div>${tabbar('home')}`;
  }

  function vDestinations(){
    return `${appbar({back:true,title:t('destinations')})}
      <section class="destinationIndex">
        <div class="destinationIndex__intro">
          <div class="eyebrow">ONLYONE · ${hx('ТУРЦИЯ','TÜRKEI','TÜRKİYE')}</div>
          <h1>${t('destinations')}</h1>
          <p>${t('noCatalog')}</p>
        </div>
        <div class="destinationIndex__grid">
          ${DESTINATIONS.map(d=>`<button class="destinationIndex__card" data-dest="${d.id}">
            <img src="${d.img}" alt="${esc(loc(d.n))}" loading="lazy" decoding="async">
            <span class="destinationIndex__shade"></span>
            <span class="destinationIndex__copy"><b>${esc(loc(d.n))}</b><i>${esc(loc(d.s))}</i></span>
          </button>`).join('')}
        </div>
      </section>
      <div class="pageBottom"></div>${tabbar('home')}`;
  }

  let FILTER={region:null,kinds:[],stars:[],types:[],amen:[],rating:0,board:[],beach:null};
  function filtered(){
    return PUBLIC_HOTELS.filter(h=>{
      if(FILTER.region&&h.region!==FILTER.region)return false;
      if(FILTER.kinds.length&&FILTER.kinds.indexOf(h.kind)<0)return false;
      if(FILTER.stars.length&&FILTER.stars.indexOf(h.stars)<0)return false;
      if(FILTER.types.length&&!FILTER.types.every(x=>h.types.indexOf(x)>-1))return false;
      if(FILTER.amen.length&&!FILTER.amen.every(x=>h.amen.indexOf(x)>-1))return false;
      if(FILTER.board.length&&FILTER.board.indexOf(h.board)<0)return false;
      if(FILTER.rating&&h.rating<FILTER.rating)return false;
      if(FILTER.beach!=null&&h.beach>FILTER.beach)return false;
      return true;
    }).sort((a,b)=>b.rating-a.rating);
  }
  const activeFilters=()=>FILTER.kinds.length+FILTER.stars.length+FILTER.types.length+FILTER.amen.length+FILTER.board.length+(FILTER.rating?1:0)+(FILTER.beach!=null?1:0);

  function vSearch(){
    const list=filtered(),s=S.search;
    const gl=`${s.adults} ${t('adultsShort')}${s.children?` · ${s.children} ${t('childrenShort')}`:''}`;
    const dl=(s.from&&s.to)?`${fmtDate(s.from)} – ${fmtDate(s.to)}`:t('datesPh');
    const n=activeFilters();
    return `${appbar({})}
    <div class="wrap" style="padding-top:16px">
      <div class="searchCard">
        <button class="searchRow" data-act="pick-region">${icon('pin')}
          <span class="searchRow__l"><span class="searchRow__k">${t('where')}</span>
          <span class="searchRow__v">${FILTER.region?esc(regionName(FILTER.region)):t('wherePh')}</span></span>${icon('chev')}</button>
        <button class="searchRow" data-act="pick-dates">${icon('cal')}
          <span class="searchRow__l"><span class="searchRow__k">${t('dates')}</span>
          <span class="searchRow__v">${esc(dl)}</span></span>${icon('chev')}</button>
        <button class="searchRow" data-act="pick-guests">${icon('users')}
          <span class="searchRow__l"><span class="searchRow__k">${t('guests')}</span>
          <span class="searchRow__v">${esc(gl)}</span></span>${icon('chev')}</button>
      </div>
      <div style="margin-top:12px"><button class="btn btn--primary" data-act="do-search">${icon('search')}${t('searchBtn')}</button></div>

      <div class="section" style="margin-top:20px">
        <div class="chips">
          <button class="chip${!FILTER.region?' is-on':''}" data-fregion="">${t('allRegions')}</button>
          ${REGIONS.map(r=>`<button class="chip${FILTER.region===r.id?' is-on':''}" data-fregion="${r.id}">${esc(loc(r.name))}</button>`).join('')}
        </div>
      </div>

      <div class="section__head" style="margin-top:18px">
        <div><b>${list.length}</b> <span class="muted tiny">${t('results')}</span></div>
        <button class="btn btn--ghost btn--sm" data-act="filters">${icon('filter')}${t('filters')}${n?` · ${n}`:''}</button>
      </div>
      ${list.length?`<div class="cardList">${list.map(hotelCard).join('')}</div>`:
        `<div class="empty">${icon('search')}<b>${t('noResults')}</b><p>${t('tryReset')}</p></div>`}
    </div>
    <div class="pageBottom"></div>
    ${tabbar('search')}`;
  }

  function vHotel(id){
    const h=hotel(id);if(!h)return vHome();
    return `<div class="gal">
      <div class="gal__bar">
        <button class="iconBtn" data-act="back">${icon('back')}</button>
        <div style="display:flex;gap:8px">
          <button class="iconBtn${isFav(h.id)?' is-fav':''}" data-act="fav" data-id="${h.id}">${icon('heart')}</button>
          <button class="iconBtn" data-act="share">${icon('share')}</button>
        </div>
      </div>
      <div class="gal__track" id="galTrack">${h.imgs.map(s=>`<img src="${s}" alt="${esc(h.name)}">`).join('')}</div>
      <div class="gal__dots" id="galDots">${h.imgs.map((_,i)=>`<i class="${i===0?'is-on':''}"></i>`).join('')}</div>
    </div>
    <div class="wrap" style="padding-top:16px">
      <div class="stars">${stars(h.stars)}</div>
      <h1 class="h-xl" style="margin-top:6px;font-family:var(--serif);font-weight:400">${esc(h.name)}</h1>
      <div class="card__loc" style="font-size:11px">${esc(label(KINDS,h.kind))} · ${esc(regionName(h.region))}</div>
      <div class="score" style="font-size:12.5px;margin-top:14px">
        <b>${fmtNum(h.rating)}</b><span>${rateWord(h.rating)}</span>
        <span style="text-transform:none;letter-spacing:.04em">${h.reviews.toLocaleString('de-DE')} ${t('reviews')}</span>
      </div>
      <div class="traits" style="margin-top:14px">${h.types.map(x=>esc(label(TYPES,x))).join('<i>·</i>')}</div>
    </div>

    <section class="detailSec"><h3 class="h-md">${t('description')}</h3>
      <p class="muted" style="font-size:13.5px;line-height:1.6;margin:9px 0 0">${esc(loc(h.desc))}</p></section>

    <section class="detailSec"><h3 class="h-md" style="margin-bottom:13px">${t('amenities')}</h3>
      <div class="amen">${h.amen.map(a=>`<div>${icon('check')}<span>${esc(label(AMEN,a))}</span></div>`).join('')}</div>
      <div class="kv" style="margin-top:16px"><span class="muted">${t('board')}</span><b>${esc(label(BOARDS,h.board))}</b></div>
      <div class="kv"><span class="muted">${t('beachDist')}</span><b>${h.beach===0?t('onBeach'):h.beach+' '+t('unitM')}</b></div>
    </section>

    <section class="detailSec"><h3 class="h-md">${t('rooms')}</h3>
      ${h.rooms.map(r=>`<div class="roomCard">
        <h4>${esc(loc(r.n))}</h4>
        <div class="muted tiny" style="margin-top:5px">${r.ad} ${t('persons')} · ${esc(loc(r.bed))} · ${r.sz} ${t('sqm')}</div>
        <div class="amen" style="margin-top:11px">${r.f.map(f=>`<div>${icon('check')}<span>${esc((ROOMFEAT[f]||{})[LANG]||f)}</span></div>`).join('')}</div>
        <button class="btn btn--ghost btn--sm" style="width:100%;margin-top:13px" data-act="req" data-id="${h.id}" data-room="${r.id}">${t('requestRoom')}</button>
      </div>`).join('')}
    </section>

    <section class="detailSec"><h3 class="h-md">${t('location')}</h3>
      <div class="muted" style="font-size:13.5px;margin-top:8px">${esc(regionName(h.region))} · ${t('beachDist')}: ${h.beach===0?'0':h.beach} m</div>
      <button class="btn btn--ghost btn--sm" style="width:100%;margin-top:12px" data-go="map">${icon('map')}${t('map')}</button>
    </section>

    <section class="detailSec"><h3 class="h-md">${t('policies')}</h3>
      <div class="kv" style="margin-top:8px"><span class="muted">Check-in</span><b>14:00</b></div>
      <div class="kv"><span class="muted">Check-out</span><b>12:00</b></div>
      <div class="kv"><span class="muted">${t('freeCancel')}</span><b>${t('onRequest')}</b></div>
    </section>
    <div class="pageBottom--cta"></div>

    <div class="stickyCta">
      <div class="stickyCta__t"><b>${t('interested')}</b><span>${t('nonBinding')}</span></div>
      <button class="btn btn--primary" data-act="req" data-id="${h.id}">${t('requestOffer')}</button>
    </div>`;
  }

  /* --- request wizard --- */
  let W=null;
  const WISHKEYS=[['sea','wSea'],['quiet','wQuiet'],['transfer','wTransfer'],['cot','wCot'],['honey','wHoney'],['bday','wBirthday'],['access','wAccess']];
  function startRequest(hotelId,roomId){
    W={step:1,hotelId,roomId:roomId||'',from:S.search.from||today(14),to:S.search.to||today(21),
       adults:S.search.adults||2,children:S.search.children||0,childAges:[],wishes:[],
       excursions:(S.pendingExc||[]).slice(),note:'',
       first:'',last:'',phone:'',email:'',wa:''};
    go('wizard');
  }
  function vWizard(){
    if(!W)return vHome();
    const h=hotel(W.hotelId);
    const titles=['s1','s2','s3','s4','s5','s6'];
    let body='';
    if(W.step===1){
      body=`<div class="field"><label class="label">${t('arrival')}</label>
        <input class="input" type="date" id="wFrom" value="${W.from}" min="${today()}"></div>
        <div class="field"><label class="label">${t('departure')}</label>
        <input class="input" type="date" id="wTo" value="${W.to}" min="${today(1)}"></div>
        <div class="muted tiny" style="margin-top:12px">${nights(W.from,W.to)} ${t('nights')}</div>`;
    }else if(W.step===2){
      body=`<div class="stepper"><span>${t('adults')}</span><div class="stepper__c">
          <button class="rnd" data-w="ad-"${W.adults<=1?' disabled':''}>${icon('minus')}</button>
          <span class="stepper__n">${W.adults}</span>
          <button class="rnd" data-w="ad+">${icon('plus')}</button></div></div>
        <div class="stepper" style="border-top:1px solid var(--line)"><span>${t('children')}</span><div class="stepper__c">
          <button class="rnd" data-w="ch-"${W.children<=0?' disabled':''}>${icon('minus')}</button>
          <span class="stepper__n">${W.children}</span>
          <button class="rnd" data-w="ch+">${icon('plus')}</button></div></div>
        ${W.children?`<div class="field"><label class="label">${t('childAge')}</label>
          <div class="grid2">${Array.from({length:W.children},(_,i)=>
            `<select class="input" data-age="${i}">${Array.from({length:18},(_,a)=>
              `<option value="${a}"${(W.childAges[i]||6)===a?' selected':''}>${a} ${t('yrs')}</option>`).join('')}</select>`).join('')}</div></div>`:''}`;
    }else if(W.step===3){
      body=`<div class="field"><label class="label">${t('roomWish')}</label>
        ${h.rooms.map(r=>`<button class="check${W.roomId===r.id?' is-on':''}" data-wroom="${r.id}">
          <span class="check__box">${icon('check')}</span>
          <span><b style="font-weight:600">${esc(loc(r.n))}</b><br>
          <span class="muted tiny">${r.ad} ${t('persons')} · ${r.sz} ${t('sqm')}</span></span></button>`).join('')}
        <button class="check${W.roomId===''?' is-on':''}" data-wroom="">
          <span class="check__box">${icon('check')}</span><span>${t('notSure')}</span></button></div>`;
    }else if(W.step===4){
      body=`<div class="field"><label class="label">${t('s4')}</label>
        ${WISHKEYS.map(([k,tk])=>`<button class="check${W.wishes.indexOf(k)>-1?' is-on':''}" data-wish="${k}">
          <span class="check__box">${icon('check')}</span><span>${t(tk)}</span></button>`).join('')}</div>
        <div class="field"><label class="label">${t('excInterest')}</label>
        ${EXCURSIONS.map(e=>`<button class="check${W.excursions.indexOf(e.id)>-1?' is-on':''}" data-wexc="${e.id}">
          <span class="check__box">${icon('check')}</span>
          <span>${esc(loc(e.n))}<span class="muted tiny"> · ${esc(loc(e.dur))}</span></span></button>`).join('')}
        <p class="muted mini" style="margin-top:8px">${t('excNote')}</p></div>
        <div class="field"><label class="label">${t('otherWishes')}</label>
        <textarea class="input" id="wNote">${esc(W.note)}</textarea></div>`;
    }else if(W.step===5){
      body=`<div class="grid2">
          <div class="field" style="margin-top:0"><label class="label">${t('firstName')} *</label><input class="input" id="wFirst" value="${esc(W.first)}"></div>
          <div class="field" style="margin-top:0"><label class="label">${t('lastName')} *</label><input class="input" id="wLast" value="${esc(W.last)}"></div></div>
        <div class="field"><label class="label">${t('phone')} *</label><input class="input" id="wPhone" type="tel" value="${esc(W.phone)}" placeholder="+90 ..."></div>
        <div class="field"><label class="label">${t('email')} *</label><input class="input" id="wEmail" type="email" value="${esc(W.email)}" placeholder="mail@..."></div>
        <div class="field"><label class="label">${t('whatsapp')}</label><input class="input" id="wWa" type="tel" value="${esc(W.wa)}"></div>`;
    }else{
      const room=W.roomId?h.rooms.find(r=>r.id===W.roomId):null;
      body=`<div class="listCard" style="margin-top:4px">
        <div class="kv"><span class="muted">${t('hotel')}</span><b>${esc(h.name)}</b></div>
        <div class="kv"><span class="muted">${t('regions')}</span><b>${esc(regionName(h.region))}</b></div>
        <div class="kv"><span class="muted">${t('period')}</span><b>${fmtDate(W.from)} – ${fmtDate(W.to)}<br>
          <span class="muted tiny">${nights(W.from,W.to)} ${t('nights')}</span></b></div>
        <div class="kv"><span class="muted">${t('guests')}</span><b>${W.adults} ${t('adultsShort')}${W.children?` · ${W.children} ${t('childrenShort')}`:''}</b></div>
        <div class="kv"><span class="muted">${t('roomReq')}</span><b>${room?esc(loc(room.n)):t('notSure')}</b></div>
        ${W.wishes.length?`<div class="kv"><span class="muted">${t('custWishes')}</span><b>${W.wishes.map(k=>t((WISHKEYS.find(w=>w[0]===k)||[,''])[1])).join('<br>')}</b></div>`:''}
        ${W.excursions.length?`<div class="kv"><span class="muted">${t('excursions')}</span><b>${W.excursions.map(id=>{const e=excursion(id);return esc(e?(loc(e.n)):id);}).join('<br>')}</b></div>`:''}
        ${W.note?`<div class="kv"><span class="muted">${t('otherWishes')}</span><b>${esc(W.note)}</b></div>`:''}
        <div class="kv"><span class="muted">${t('email')}</span><b>${esc(W.email)}</b></div>
      </div>
      <div class="noteBox">${t('noPricesNote')}</div>`;
    }
    return `${appbar({back:true,title:t(titles[W.step-1]),menu:false})}
    <div class="wrap" style="padding-top:8px">
      <div class="steps">${[1,2,3,4,5,6].map(i=>`<i class="${i<=W.step?'is-on':''}"></i>`).join('')}</div>
      <div class="muted tiny">${t('step')} ${W.step} ${t('of')} 6 · ${esc(h.name)}</div>
      <div style="margin-top:6px">${body}</div>
    </div>
    <div class="pageBottom--cta"></div>
    <div class="stickyCta">
      ${W.step>1?`<button class="btn btn--ghost" style="flex:0 0 auto;width:auto;padding:0 20px" data-w="prev">${t('back')}</button>`:''}
      <button class="btn btn--primary" style="flex:1 1 auto" data-w="${W.step===6?'send':'next'}">${W.step===6?t('sendRequest'):t('next')}</button>
    </div>`;
  }
  function wizardCollect(){
    if(!W)return;
    const g=id=>{const e=$(id);return e?e.value.trim():'';};
    if(W.step===1){const a=$('#wFrom'),b=$('#wTo');if(a)W.from=a.value;if(b)W.to=b.value;}
    if(W.step===2){$$('[data-age]').forEach(s=>{W.childAges[+s.dataset.age]=+s.value;});}
    if(W.step===4){const n=$('#wNote');if(n)W.note=n.value;}
    if(W.step===5){W.first=g('#wFirst');W.last=g('#wLast');W.phone=g('#wPhone');W.email=g('#wEmail');W.wa=g('#wWa');}
  }
  function submitRequest(){
    S.seq+=1;
    const code=`OO-${new Date().getFullYear()}-${String(S.seq).padStart(5,'0')}`;
    S.requests.unshift({
      id:'r'+Date.now(),code,hotelId:W.hotelId,roomId:W.roomId,
      from:W.from,to:W.to,adults:W.adults,children:W.children,childAges:W.childAges.slice(0,W.children),
      wishes:W.wishes.slice(),excursions:W.excursions.slice(),note:W.note,
      contact:{first:W.first,last:W.last,phone:W.phone,email:W.email,wa:W.wa},
      status:'new',createdAt:Date.now(),offer:null,payment:null,staffNote:'',messages:[],
      history:[{s:'new',at:Date.now()}]
    });
    save();
    const id=S.requests[0].id;
    W=null;
    STACK.length=0;
    go('sent',id,true);
  }
  /* The concierge is the line to the person handling the trip, so the thread
     lives on the request itself — both sides read and write the same array. */
  function addMessage(r,from,text){
    if(!text || !text.trim()) return false;
    if(!r.messages) r.messages=[];
    r.messages.push({from,text:text.trim(),at:Date.now(),read:false});
    save();
    return true;
  }
  function activeRequest(){
    // the most recent request that is still going somewhere
    return S.requests.find(r=>r.status!=='confirmed') || S.requests[0] || null;
  }
  function unreadForGuest(){
    return S.requests.reduce((n,r)=>n+((r.messages||[]).filter(m=>m.from==='staff'&&!m.read).length),0);
  }
  function markRead(r,side){
    if(!r.messages) return;
    let ch=false;
    r.messages.forEach(m=>{ if(m.from!==side && !m.read){ m.read=true; ch=true; } });
    if(ch) save();
  }
  function thread(r,side){
    const ms=r.messages||[];
    if(!ms.length) return `<p class="muted tiny" style="text-align:center;padding:26px 0">${t('noMessages')}</p>`;
    return `<div class="thread">${ms.map(m=>{
      const mine = m.from===side;
      const who = m.from==='guest' ? t('you') : t('team');
      return `<div class="msg ${mine?'is-mine':''}">
        <div class="msg__b">${esc(m.text)}</div>
        <div class="msg__m">${mine?'':esc(who)+' · '}${new Date(m.at).toLocaleString(LANG==='ru'?'ru-RU':LANG==='de'?'de-DE':LANG==='tr'?'tr-TR':LANG==='uk'?'uk-UA':'en-GB',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>
      </div>`;}).join('')}</div>`;
  }

  function setStatus(r,s){
    if(r.status===s)return;
    r.status=s;r.history.push({s,at:Date.now()});save();
  }
  function statusTimeline(r){
    const i=FLOW.indexOf(r.status);
    return `<div class="timeline">${FLOW.map((s,n)=>{
      const done=n<i,now=n===i;
      const h=r.history.filter(x=>x.s===s).pop();
      return `<div class="tl ${done?'is-done':now?'is-now':'is-pending'}">
        <span class="tl__dot"></span>
        <div><div class="tl__t">${t(STATUS_LABEL[s])}</div>
        ${h?`<div class="tl__d">${new Date(h.at).toLocaleString(LANG==='ru'?'ru-RU':LANG==='de'?'de-DE':LANG==='tr'?'tr-TR':LANG==='uk'?'uk-UA':'en-GB')}</div>`:''}</div></div>`;
    }).join('')}</div>`;
  }

  function vSent(id){
    const r=request(id);if(!r)return vHome();
    const h=hotel(r.hotelId);
    return `<section class="confirmBg">
      ${bgVideo('./video/onlyone-confirm-v2.mp4','./images/onlyone-confirm-poster.webp')}
      <div class="confirmBg__scrim"></div>
    </section>
    <div class="wrap confirmOver" style="position:relative;z-index:2;padding-top:calc(var(--sat) + 52px);text-align:center">
      <div class="pop" style="width:74px;height:74px;border-radius:50%;margin:0 auto;border:1px solid var(--gold);display:grid;place-items:center;color:var(--gold-light)">
        <svg viewBox="0 0 24 24" style="width:30px;height:30px;stroke-width:1.8"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></div>
      <h1 class="h-xl" style="margin-top:22px">${t('reqSent')}</h1>
      <p class="muted" style="font-size:13.5px;margin-top:10px">${t('reqTeamText')}</p>
      <div class="listCard" style="margin-top:20px;text-align:left">
        <div class="muted mini" style="letter-spacing:.14em;text-transform:uppercase">${t('reqNo')}</div>
        <div style="font-size:22px;font-weight:700;margin-top:5px">${r.code}</div>
        <div class="kv" style="margin-top:12px"><span class="muted">${t('hotel')}</span><b>${esc(h.name)}</b></div>
        <div class="kv"><span class="muted">${t('period')}</span><b>${fmtDate(r.from)} – ${fmtDate(r.to)}</b></div>
      </div>
      <div class="listCard" style="text-align:left">${statusTimeline(r)}</div>
      <div style="margin-top:14px"><button class="btn btn--primary" data-go="trips">${t('myTrips')}</button></div>
    </div>
    <div class="pageBottom"></div>${tabbar('trips')}`;
  }

  function vTrips(){
    return `${appbar({})}
    <div class="wrap" style="padding-top:18px">
      <h1 class="h-xl" style="font-family:var(--serif);font-weight:400">${t('myTrips')}</h1>
      ${S.requests.length?S.requests.map(r=>{
        const charter=r.kind==='charter';
        const h=charter?null:hotel(r.hotelId);
        return `<div class="listCard fade-up">
          <div class="listCard__h">
            <div style="min-width:0">
              <b style="font-size:15.5px">${esc(charter?r.item.name:h.name)}</b>
              <div class="muted tiny" style="margin-top:4px">${charter?`${charterWhen(r)} · ${r.adults} ${t('adultsShort')}`:`${fmtDate(r.from)} – ${fmtDate(r.to)} · ${r.adults} ${t('adultsShort')}`}</div>
              <div class="muted mini" style="margin-top:3px">${r.code}</div>
            </div>
            <span class="pill ${STATUS_PILL[r.status]}">${t(STATUS_LABEL[r.status])}</span>
          </div>
          <div style="margin-top:12px">
            <button class="btn ${(r.status==='offer'||r.status==='payopen')?'btn--primary':'btn--ghost'} btn--sm" style="width:100%" data-trip="${r.id}">
              ${r.status==='offer'?t('viewOffer'):r.status==='payopen'?t('payNow'):t('details')}</button>
          </div>
        </div>`;}).join(''):
        `<div class="empty">${icon('trip')}<b>${t('noTrips')}</b></div>`}
    </div>
    <div class="pageBottom"></div>${tabbar('trips')}`;
  }

  /* A charter booking has no hotel, no room and no night count — its trip
     page is the item, the day, the price and the payment state. */
  function vTripCharter(r){
    const paid=r.status==='paid'||r.status==='confirmed';
    return `${appbar({back:true,title:r.code,menu:false})}
    <div class="wrap" style="padding-top:16px">
      <article class="card charterCard" style="pointer-events:none">
        ${r.item.img?`<div class="card__media" style="aspect-ratio:16/10"><img src="${r.item.img}" alt=""></div>`:pendingMedia()}
        <div class="card__body">
          <h2 class="charterCard__name">${esc(r.item.name)}</h2>
          <div class="charterCard__line">${charterWhen(r)} · ${r.adults} ${t('adultsShort')}</div>
          ${r.route?`<div class="charterCard__line charterCard__line--soft">${esc(r.route)}</div>`:''}
        </div>
      </article>
      <div class="priceBox fade-up" style="margin-top:18px">
        <div class="lbl">${t('total')}</div>
        <div class="amt">${money(r.offer.price,r.offer.currency)}</div>
      </div>
      ${r.status==='payopen'?`<div style="margin-top:12px"><button class="btn btn--primary" data-act="pay" data-id="${r.id}">${icon('card')}${t('payNow')}</button></div>`:''}
      ${paid?`<div class="listCard" style="display:flex;align-items:center;gap:11px;background:rgba(40,168,121,.10)">
        <span style="color:var(--ok);display:grid;place-items:center">${icon('check')}</span>
        <b style="font-size:14px;color:var(--ok)">${t('paid')}</b></div>`:''}
      <div class="listCard">
        <p class="muted" style="margin:0 0 12px;font-size:13px;line-height:1.6">${hx('Детали дня ваш VIP-ассистент согласует с вами лично.',
          'Die Details des Tages stimmt Ihr VIP-Assistent persönlich mit Ihnen ab.',
          'Your VIP assistant confirms the details of the day with you personally.')}</p>
        <button class="btn btn--ghost btn--sm" style="width:100%" data-go="concierge">${t('askVip')}</button>
      </div>
    </div>
    <div class="pageBottom"></div>`;
  }
  function vTrip(id){
    const r=request(id);if(!r)return vTrips();
    if(r.kind==='charter')return vTripCharter(r);
    const h=hotel(r.hotelId);
    const roomId=(r.offer&&r.offer.roomId)||r.roomId;
    const room=roomId?h.rooms.find(x=>x.id===roomId):null;
    const showOffer=r.offer&&['offer','accepted','payopen','paid','confirmed'].indexOf(r.status)>-1;
    return `${appbar({back:true,title:r.code,menu:false})}
    <div class="wrap" style="padding-top:16px">
      <div class="card" style="pointer-events:none">
        <div class="card__media" style="aspect-ratio:16/9"><img src="${h.imgs[0]}" alt=""></div>
        <div class="card__body">
          <div class="stars">${stars(h.stars)}</div>
          <h2 class="card__name">${esc(h.name)}</h2>
          <div class="card__loc">${esc(regionName(h.region))}</div>
          <div class="kv" style="margin-top:12px"><span class="muted">${t('period')}</span>
            <b>${fmtDate(r.from)} – ${fmtDate(r.to)}<br><span class="muted tiny">${nights(r.from,r.to)} ${t('nights')}</span></b></div>
          <div class="kv"><span class="muted">${t('guests')}</span><b>${r.adults} ${t('adultsShort')}${r.children?` · ${r.children} ${t('childrenShort')}`:''}</b></div>
          <div class="kv"><span class="muted">${t('roomReq')}</span><b>${room?esc(loc(room.n)):t('notSure')}</b></div>
        </div>
      </div>

      ${showOffer?`
      <div class="priceBox fade-up">
        <div class="lbl">${t('yourOffer')}</div>
        <div style="margin-top:12px;font-size:14px;opacity:.9">${esc(h.name)}${room?` · ${esc(loc(room.n))}`:''}</div>
        <div style="font-size:12.5px;opacity:.75;margin-top:4px">${fmtDate(r.from)} – ${fmtDate(r.to)} · ${nights(r.from,r.to)} ${t('nights')}</div>
        <div style="margin-top:16px" class="lbl">${t('total')}</div>
        <div class="amt">${money(r.offer.price,r.offer.currency)}</div>
        ${r.offer.validUntil?`<div style="font-size:11.5px;opacity:.72;margin-top:8px">${t('validUntil')} ${fmtDate(r.offer.validUntil)}</div>`:''}
        ${r.offer.custInfo?`<div style="font-size:12.5px;opacity:.86;margin-top:12px;line-height:1.5">${esc(r.offer.custInfo)}</div>`:''}
      </div>
      ${r.status==='offer'?`<div class="btnRow" style="margin-top:12px">
        <button class="btn btn--ghost" data-act="ask">${t('askBack')}</button>
        <button class="btn btn--primary" data-act="accept" data-id="${r.id}">${t('acceptOffer')}</button></div>
      <div style="margin-top:10px"><button class="btn btn--gold" data-act="accept-pay" data-id="${r.id}">${icon('card')}${hx('Принять и оплатить сейчас','Annehmen & jetzt bezahlen','Accept & pay now')}</button></div>`:''}
      ${r.status==='payopen'?`<div style="margin-top:12px"><button class="btn btn--primary" data-act="pay" data-id="${r.id}">${icon('card')}${t('payNow')}</button></div>`:''}
      ${(r.status==='paid'||r.status==='confirmed')?`<div class="listCard" style="display:flex;align-items:center;gap:11px;background:rgba(40,168,121,.10)">
        <span style="color:var(--ok);display:grid;place-items:center">${icon('check')}</span>
        <b style="font-size:14px;color:var(--ok)">${r.status==='confirmed'?t('tripConfirmed'):t('paid')}</b></div>`:''}
      `:`<div class="noteBox" style="margin-top:14px">${t('reqTeamText')}</div>`}

      <div class="listCard">${statusTimeline(r)}</div>
    </div>
    <div class="pageBottom"></div>`;
  }

  function vFavorites(){
    const list=S.favorites.map(hotel).filter(Boolean);
    return `${appbar({})}
    <div class="wrap" style="padding-top:18px">
      <h1 class="h-xl" style="font-family:var(--serif);font-weight:400">${t('myFav')}</h1>
      ${list.length?`
        ${list.length>1?`<button class="btn btn--ghost btn--sm" style="width:100%;margin-top:12px" data-act="compare">${icon('grid')}${t('compare')}</button>`:''}
        <div class="cardList" style="margin-top:24px">${list.map(hotelCard).join('')}</div>`:
        `<div class="empty">${icon('heart')}<b>${t('noFav')}</b></div>`}
    </div>
    <div class="pageBottom"></div>${tabbar('favorites')}`;
  }

  function vConcierge(){
    const r = activeRequest();
    const DO=[t('cDo1'),t('cDo2'),t('cDo3'),t('cDo4')];
    if (r) markRead(r,'guest');
    return `${appbar({})}
    <div class="wrap concScreen" style="padding-top:24px">
      <div class="eyebrow">${t('navConcierge')}</div>
      <h1 class="h-xl" style="margin-top:10px">${t('conciergeTitle')}</h1>

      <div class="person">
        <span class="person__mark">${t('conciergeMark')}</span>
        <div>
          <b>${esc(t('conciergeName'))}</b>
          <span>${t('conciergeRole')}</span>
        </div>
      </div>

      <section class="concQuickLead">
        <h2>${hx('Быстрая связь','Schneller Kontakt','Quick contact')}</h2>
        <p>${hx('Оставьте имя и телефон — VIP-ассистент свяжется с вами лично.','Name und Telefonnummer senden – Ihr VIP-Assistent meldet sich persönlich.','Send your name and phone number — your VIP assistant will contact you personally.')}</p>
        <div class="vipLeadForm vipLeadForm--concierge" data-vip-lead-form>
          <label><span>${hx('Имя','Name','Name')}</span><input data-vip-name type="text" autocomplete="name" placeholder="${hx('Ваше имя','Ihr Name','Your name')}"></label>
          <label><span>${hx('Телефон','Telefon','Phone')}</span><input data-vip-phone type="tel" autocomplete="tel" inputmode="tel" placeholder="+90 ..."></label>
          <button type="button" data-act="vip-callback" data-source="concierge">${hx('Отправить','Absenden','Send')}${icon('chev')}</button>
        </div>
      </section>

      ${r ? `
      <div class="threadHead">
        <span class="muted mini">${t('threadFor')} ${r.code}</span>
        <span class="pill ${STATUS_PILL[r.status]}">${t(STATUS_LABEL[r.status])}</span>
      </div>
      ${thread(r,'guest')}
      <div class="composer">
        <textarea class="input" id="cMsg" rows="2" placeholder="${t('writeMsg')}"></textarea>
        <button class="btn btn--primary" style="margin-top:10px" data-act="c-send" data-id="${r.id}">${t('send')}</button>
      </div>
      ` : `
      <p class="muted" style="font-size:13.5px;line-height:1.65;margin:18px 0 0">${t('noThreadYet')}</p>
      <ul class="doList">${DO.map(x=>`<li>${icon('check')}<span>${esc(x)}</span></li>`).join('')}</ul>
      <div style="margin-top:22px"><button class="btn btn--primary" data-go="search">${t('startRequest')}</button></div>
      `}

      <div style="margin-top:26px;display:flex;flex-direction:column;gap:10px">
        <button class="btn btn--ghost" data-go="transfers">${icon('car')}${hx('VIP-транспорт и тарифы','VIP-Transport & Raten','VIP transport & rates')}</button>
        <button class="btn btn--ghost" data-go="yachts">${icon('yacht')}${hx('Наши яхты','Unsere Yachten','Our yachts')}</button>
        <button class="btn btn--ghost" data-act="c-call">${icon('phone')}${t('callNow')}</button>
        <button class="btn btn--ghost" data-act="c-wa">${t('writeWa')}</button>
      </div>
      <p class="muted mini" style="margin-top:16px;letter-spacing:.10em">${t('hours')}</p>
    </div>

    <section class="expBands" style="margin-top:34px">
      ${CONC_BANDS.map((x,i)=>`<div class="expBand">
        <span class="expBand__zoom"><span class="expBand__ph" style="--pd:${(i%3)*-9}s"><img src="${x.img}" alt="" loading="lazy" decoding="async"></span></span>
        <span class="expBand__scrim"></span>
        <span class="expBand__txt">
          <b>${esc(loc(x.n))}</b>
          <i>${esc(loc(x.s))}</i>
        </span>
      </div>`).join('')}
    </section>

    <div class="pageBottom"></div>${tabbar('concierge')}`;
  }

  function vMap(){
    return `${appbar({})}
    <div class="mapWrap">
      <svg class="mapSvg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#123F47"/><stop offset="100%" stop-color="#0A2328"/></linearGradient></defs>
        <rect width="100" height="100" fill="url(#sea)"/>
        <path d="M0 62 C 14 54, 24 46, 38 40 C 52 34, 64 28, 78 22 C 86 18, 94 14, 100 11 L100 0 L0 0 Z"
              fill="#3A2E1E" stroke="rgba(241,211,195,.30)" stroke-width=".5" vector-effect="non-scaling-stroke"/>
        <path d="M0 62 C 14 54, 24 46, 38 40 C 52 34, 64 28, 78 22 C 86 18, 94 14, 100 11"
              fill="none" stroke="rgba(241,211,195,.58)" stroke-width="1" vector-effect="non-scaling-stroke"/>
        ${[0,1,2,3,4,5,6,7,8].map(i=>`<path d="M${4+i*11} ${74+((i%3)*5)} q 5 -3 10 0" fill="none" stroke="rgba(87,198,212,.20)" stroke-width=".6" vector-effect="non-scaling-stroke"/>`).join('')}
      </svg>
      ${REGIONS.map(r=>`<button class="pin" style="left:${r.x}%;top:${r.y}%" data-mregion="${r.id}">
        <span class="pin__b">${esc(loc(r.name))}<b>${PUBLIC_HOTELS.filter(h=>h.region===r.id).length}</b></span>
        <span class="pin__n"></span></button>`).join('')}
    </div>
    ${tabbar('map')}`;
  }

  /* ====================================================================
     9 · Staff views — the only place a price exists
     ==================================================================== */
  function vStaffLogin(){
    return `${appbar({back:true,title:t('staffLogin'),menu:false})}
    <div class="wrap" style="padding-top:30px">
      <div style="width:60px;height:60px;border-radius:18px;background:var(--navy);display:grid;place-items:center;color:var(--gold-light)">${icon('lock')}</div>
      <h1 class="h-xl" style="margin-top:16px;font-family:var(--serif);font-weight:400">${t('staffArea')}</h1>
      <p class="muted tiny" style="margin-top:8px">${t('loginNote')}</p>
      <div class="field"><label class="label">${t('yourName')}</label><input class="input" id="stName" value="Maria"></div>
      <div style="margin-top:16px"><button class="btn btn--primary" data-act="do-login">${t('login')}</button></div>
    </div>`;
  }
  function staffReqCard(r){
    const charter=r.kind==='charter';
    const h=charter?null:hotel(r.hotelId);
    return `<div class="listCard fade-up">
      <div class="listCard__h">
        <div style="min-width:0">
          <div class="muted mini">${r.code}</div>
          <b style="font-size:15px;display:block;margin-top:3px">${esc(r.contact.first||'—')} ${esc(r.contact.last||'')}</b>
          <div class="muted tiny" style="margin-top:3px">${esc(charter?r.item.name:h.name)}</div>
          <div class="muted tiny">${charter?`${charterWhen(r)} · ${r.adults} ${t('adultsShort')}`:`${fmtDate(r.from)} – ${fmtDate(r.to)} · ${r.adults} ${t('adultsShort')}`}</div>
        </div>
        <span class="pill ${STATUS_PILL[r.status]}">${t(STATUS_LABEL[r.status])}</span>
      </div>
      <button class="btn btn--ghost btn--sm" style="width:100%;margin-top:12px" data-sreq="${r.id}">${t('openReq')}</button>
    </div>`;
  }
  function vStaffDash(){
    const c=s=>S.requests.filter(r=>r.status===s).length;
    const feed=S.requests.slice(0,6);
    return `<div class="staffTop">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div><div class="mini" style="opacity:.62;letter-spacing:.16em;text-transform:uppercase">${t('staffArea')}</div>
        <h1 class="h-xl" style="margin-top:5px">${esc(S.staff||'Staff')}</h1></div>
        <button class="iconBtn" style="background:rgba(255,255,255,.10);border-color:rgba(255,255,255,.18);color:#fff" data-act="logout">${icon('close')}</button>
      </div></div>
    <div class="wrap" style="padding-top:18px">
      <div class="muted mini" style="letter-spacing:.14em;text-transform:uppercase">${t('today')}</div>
      <div class="grid2s" style="margin-top:11px">
        <div class="statBox"><b>${c('new')}</b><span>${t('newReq')}</span></div>
        <div class="statBox"><b>${c('offer')}</b><span>${t('openOffers')}</span></div>
        <div class="statBox"><b>${c('accepted')}</b><span>${t('waitCust')}</span></div>
        <div class="statBox"><b>${c('payopen')}</b><span>${t('payOpen')}</span></div>
      </div>
      <div class="statBox" style="margin-top:11px"><b>${c('paid')+c('confirmed')}</b><span>${t('newBook')}</span></div>
      <div class="noteBox" style="display:flex;gap:9px;align-items:flex-start">${icon('lock')}<span>${t('staffOnly')}</span></div>
      <div class="section__head" style="margin-top:22px"><h2 class="h-lg">${t('requests')}</h2>
        <button class="tiny muted" data-go="s-req" style="font-weight:600">${t('all')}</button></div>
      ${feed.length?feed.map(staffReqCard).join(''):`<div class="empty">${icon('inbox')}<b>${t('noTrips')}</b></div>`}
    </div>
    <div class="pageBottom"></div>${staffTabbar('s-dash')}`;
  }
  function vStaffReqs(){
    return `<div class="staffTop"><h1 class="h-xl">${t('requests')}</h1>
      <div class="tiny" style="color:rgba(255,255,255,.6);margin-top:4px">${S.requests.length} ${t('total_')}</div></div>
    <div class="wrap" style="padding-top:14px">
      ${S.requests.length?S.requests.map(staffReqCard).join(''):`<div class="empty">${icon('inbox')}<b>${t('noTrips')}</b></div>`}
    </div><div class="pageBottom"></div>${staffTabbar('s-req')}`;
  }
  function staffActions(r){
    if(r.status==='new'||r.status==='review')
      return `<button class="btn btn--primary" data-act="offer-form" data-id="${r.id}">${t('createOffer')}</button>`;
    if(r.status==='offer')
      return `<div class="noteBox" style="margin-top:0">${t('offerSentWait')}</div>`;
    if(r.status==='accepted')
      return `<button class="btn btn--primary" data-act="paylink" data-id="${r.id}">${icon('card')}${t('createPayLink')}</button>`;
    if(r.status==='payopen'){
      /* Two ways into payopen now: the staff link, and the guest's own
         "pay now" (direct bookings, accept & pay). Only the first has a
         link to show — claiming one for the second was a lie with an
         empty line under it. */
      if(!(r.payment&&r.payment.link))
        return `<div class="listCard" style="margin-top:0;display:flex;gap:10px;align-items:center">
          <span style="color:var(--ok)">${icon('check')}</span>
          <b style="font-size:13.5px">${hx('Оплата открыта — гость платит в приложении','Zahlung offen — der Gast zahlt in der App','Payment open — the guest pays in the app')}</b></div>`;
      return `<div class="listCard" style="margin-top:0">
        <div style="display:flex;align-items:center;gap:9px;color:var(--ok)">${icon('check')}<b style="font-size:13.5px">${t('payLinkDone')}</b></div>
        <div class="muted mini" style="margin-top:8px;word-break:break-all">${esc(r.payment.link)}</div>
        <div class="btnRow" style="margin-top:11px">
          <button class="btn btn--ghost btn--sm" data-act="copy" data-id="${r.id}">${t('copyLink')}</button>
          <button class="btn btn--ghost btn--sm" data-act="notify">${t('sendWa')}</button></div></div>`;
    }
    if(r.status==='paid')
      return `<button class="btn btn--primary" data-act="confirm-hotel" data-id="${r.id}">${t('confirmHotel')}</button>`;
    return `<div class="listCard" style="margin-top:0;display:flex;gap:10px;align-items:center;background:rgba(40,168,121,.10)">
      <span style="color:var(--ok)">${icon('check')}</span><b style="font-size:13.5px;color:var(--ok)">${t('tripConfirmed')}</b></div>`;
  }
  function vStaffReq(id){
    const r=request(id);if(!r)return vStaffReqs();
    markRead(r,'staff');
    const charter=r.kind==='charter';
    const h=charter?null:hotel(r.hotelId);
    const room=(h&&r.roomId)?h.rooms.find(x=>x.id===r.roomId):null;
    return `${appbar({back:true,title:r.code,menu:false})}
    <div class="wrap" style="padding-top:16px">
      <span class="pill ${STATUS_PILL[r.status]}">${t(STATUS_LABEL[r.status])}</span>
      <h1 class="h-lg" style="margin-top:12px">${esc(r.contact.first)} ${esc(r.contact.last)}</h1>
      <div class="listCard">
        <div class="muted mini" style="letter-spacing:.12em;text-transform:uppercase">${t('guestData')}</div>
        <div class="kv" style="margin-top:8px"><span class="muted">${t('phone')}</span><b>${esc(r.contact.phone||'—')}</b></div>
        <div class="kv"><span class="muted">${t('email')}</span><b>${esc(r.contact.email||'—')}</b></div>
        ${r.contact.wa?`<div class="kv"><span class="muted">WhatsApp</span><b>${esc(r.contact.wa)}</b></div>`:''}
      </div>
      ${charter?`<div class="listCard">
        <div class="muted mini" style="letter-spacing:.12em;text-transform:uppercase">${hx('Чартер','Charter','Charter')}</div>
        <div class="kv" style="margin-top:8px"><span class="muted">${hx('Объект','Objekt','Item')}</span><b>${esc(r.item.name)}</b></div>
        <div class="kv"><span class="muted">${hx('Дата','Datum','Date')}</span><b>${charterWhen(r)}</b></div>
        <div class="kv"><span class="muted">${t('guests')}</span><b>${r.adults} ${t('adultsShort')}</b></div>
        ${r.route?`<div class="kv"><span class="muted">${hx('Маршрут','Strecke','Route')}</span><b>${esc(r.route)}</b></div>`:''}
      </div>`:`<div class="listCard">
        <div class="muted mini" style="letter-spacing:.12em;text-transform:uppercase">${t('hotel')}</div>
        <div class="kv" style="margin-top:8px"><span class="muted">${t('hotel')}</span><b>${esc(h.name)}</b></div>
        <div class="kv"><span class="muted">${t('regions')}</span><b>${esc(regionName(h.region))}</b></div>
        <div class="kv"><span class="muted">${t('period')}</span><b>${fmtDate(r.from)} – ${fmtDate(r.to)}<br>
          <span class="muted tiny">${nights(r.from,r.to)} ${t('nights')}</span></b></div>
        <div class="kv"><span class="muted">${t('guests')}</span><b>${r.adults} ${t('adultsShort')}${r.children?` · ${r.children} ${t('childrenShort')}${r.childAges.length?' ('+r.childAges.join(', ')+')':''}`:''}</b></div>
        <div class="kv"><span class="muted">${t('roomReq')}</span><b>${room?esc(loc(room.n)):t('notSure')}</b></div>
      </div>`}
      ${(r.excursions&&r.excursions.length)?`<div class="listCard">
        <div class="muted mini" style="letter-spacing:.12em;text-transform:uppercase">${t('excursions')}</div>
        <div class="badges" style="margin-top:9px">${r.excursions.map(id=>{const e=excursion(id);
          return `<span class="badge badge--gold">${esc(e?(loc(e.n)):id)}</span>`;}).join('')}</div></div>`:''}
      ${(r.wishes.length||r.note)?`<div class="listCard">
        <div class="muted mini" style="letter-spacing:.12em;text-transform:uppercase">${t('custWishes')}</div>
        <div class="badges" style="margin-top:9px">${r.wishes.map(k=>`<span class="badge">${t((WISHKEYS.find(w=>w[0]===k)||[,''])[1])}</span>`).join('')}</div>
        ${r.note?`<p class="muted tiny" style="margin-top:10px;line-height:1.55">${esc(r.note)}</p>`:''}</div>`:''}
      <div class="listCard">
        <div class="muted mini" style="letter-spacing:.12em;text-transform:uppercase">${t('navConcierge')}</div>
        ${thread(r,'staff')}
        <textarea class="input" id="sMsg" rows="2" placeholder="${t('replyTo')}" style="margin-top:10px"></textarea>
        <button class="btn btn--ghost btn--sm" style="width:100%;margin-top:10px" data-act="s-send" data-id="${r.id}">${t('send')}</button>
      </div>
      <div class="listCard">
        <label class="label">${t('internalNote')}</label>
        <textarea class="input" id="sNote" style="min-height:72px">${esc(r.staffNote||'')}</textarea>
        <button class="btn btn--ghost btn--sm" style="width:100%;margin-top:10px" data-act="save-note" data-id="${r.id}">${t('done')}</button>
      </div>
      ${r.offer?`<div class="listCard" style="border:1.5px solid var(--turq)">
        <div class="muted mini" style="letter-spacing:.12em;text-transform:uppercase">${t('createOffer')}</div>
        <div class="kv" style="margin-top:8px"><span class="muted">${t('sellPrice')}</span><b>${money(r.offer.price,r.offer.currency)}</b></div>
        ${r.offer.internalNote?`<div class="kv"><span class="muted">${t('internalNote')}</span><b>${esc(r.offer.internalNote)}</b></div>`:''}
      </div>`:''}
      <div style="margin-top:14px">${staffActions(r)}</div>
      ${/* A charter is born at payopen — the hotel timeline would show an
            offer that was never made as done. */''}
      ${charter?'':`<div class="listCard">${statusTimeline(r)}</div>`}
    </div>
    <div class="pageBottom"></div>`;
  }
  function vStaffBookings(){
    const list=S.requests.filter(r=>['payopen','paid','confirmed'].indexOf(r.status)>-1);
    return `<div class="staffTop"><h1 class="h-xl">${t('bookings')}</h1>
      <div class="tiny" style="color:rgba(255,255,255,.6);margin-top:4px">${list.length}</div></div>
    <div class="wrap" style="padding-top:14px">
      ${list.length?list.map(staffReqCard).join(''):`<div class="empty">${icon('book')}<b>${t('noTrips')}</b></div>`}
    </div><div class="pageBottom"></div>${staffTabbar('s-book')}`;
  }
  function vStaffCustomers(){
    const map={};
    S.requests.forEach(r=>{
      const k=(r.contact.email||r.contact.phone||r.code).toLowerCase();
      if(!map[k])map[k]={c:r.contact,reqs:0,books:0,last:null};
      map[k].reqs++;
      if(['paid','confirmed'].indexOf(r.status)>-1)map[k].books++;
      const lh=hotel(r.hotelId);
      if(lh)map[k].last=lh;
    });
    const list=Object.keys(map).map(k=>map[k]);
    return `<div class="staffTop"><h1 class="h-xl">${t('customers')}</h1>
      <div class="tiny" style="color:rgba(255,255,255,.6);margin-top:4px">${list.length}</div></div>
    <div class="wrap" style="padding-top:14px">
      ${list.length?list.map(x=>`<div class="listCard">
        <b style="font-size:15.5px">${esc(x.c.first)} ${esc(x.c.last)}</b>
        <div class="muted tiny" style="margin-top:4px">${esc(x.c.phone||'')}</div>
        <div class="muted tiny">${esc(x.c.email||'')}</div>
        <div class="grid3s" style="margin-top:12px">
          <div class="statBox" style="padding:11px;background:var(--paper)"><b style="font-size:20px">${x.reqs}</b><span>${t('requests')}</span></div>
          <div class="statBox" style="padding:11px;background:var(--paper)"><b style="font-size:20px">${x.books}</b><span>${t('bookings')}</span></div>
          <div class="statBox" style="padding:11px;background:var(--paper)"><b style="font-size:20px">${x.last?x.last.stars:'—'}</b><span>${t('category')}</span></div>
        </div>
        <div class="badges" style="margin-top:11px">
          ${x.books?'<span class="badge badge--gold">VIP</span>':''}
          ${x.c.wa?'<span class="badge badge--soft">WhatsApp</span>':''}
          ${x.last?`<span class="badge badge--soft">${esc(regionName(x.last.region))}</span>`:''}
        </div>
      </div>`).join(''):`<div class="empty">${icon('user')}<b>${t('noTrips')}</b></div>`}
    </div><div class="pageBottom"></div>${staffTabbar('s-cust')}`;
  }
  function vStaffMore(){
    return `<div class="staffTop"><h1 class="h-xl">${t('more')}</h1></div>
    <div class="wrap" style="padding-top:14px">
      <div class="listCard">
        <div class="muted mini" style="letter-spacing:.12em;text-transform:uppercase">${t('hotels')}</div>
        ${REGIONS.map(r=>`<div class="kv"><span>${esc(loc(r.name))}</span><b>${PUBLIC_HOTELS.filter(h=>h.region===r.id).length}</b></div>`).join('')}
      </div>
      <div class="noteBox">${t('noInternalPrices')}</div>
      <div style="margin-top:14px"><button class="btn btn--ghost" data-act="logout">${t('backToCust')}</button></div>
    </div><div class="pageBottom"></div>${staffTabbar('s-more')}`;
  }

  /* --------------------------------------------------------------------
     Background video that costs nothing until it is on screen.

     Every one of these is encoded without an audio track, so §13 — no sound
     after the intro — holds by construction rather than by attribute.
     -------------------------------------------------------------------- */
  function bgVideo(src, poster, cls){
    return `<video class="bgVideo ${cls||''}" muted autoplay loop playsinline webkit-playsinline
      preload="none" poster="${poster}" data-bg="${src}"
      disablepictureinpicture disableremoteplayback aria-hidden="true"></video>`;
  }

  /* Muted inline autoplay for iOS Safari + Android Chrome.
     Browsers may still suspend autoplay in Low Power/Data Saver modes, so a
     first user gesture retries playback without showing a blocking button. */
  let inlineAutoplayHooksArmed=false;
  function ensureInlineAutoplay(root){
    if(!root)return;
    const vids=$$('video[autoplay]:not([data-bg])',root);
    vids.forEach(v=>{
      v.muted=true;
      v.defaultMuted=true;
      v.playsInline=true;
      v.setAttribute('autoplay','');
      v.setAttribute('muted','');
      v.setAttribute('playsinline','');
      v.setAttribute('webkit-playsinline','');
      const p=v.play();
      if(p&&p.catch)p.catch(()=>{ v.dataset.autoplayBlocked='1'; });
    });
  }
  function armInlineAutoplay(root){
    ensureInlineAutoplay(root);
    if(inlineAutoplayHooksArmed)return;
    inlineAutoplayHooksArmed=true;
    const retry=()=>{ const app=$('#app'); if(app)ensureInlineAutoplay(app); };
    window.addEventListener('pageshow',retry,{passive:true});
    document.addEventListener('visibilitychange',()=>{ if(!document.hidden)retry(); });
    document.addEventListener('touchstart',retry,{passive:true,capture:true});
    document.addEventListener('pointerdown',retry,{passive:true,capture:true});
  }

  let bgScroller=null, bgScrollHandler=null, bgTouchHandler=null,
      bgResizeHandler=null, bgVisibilityHandler=null, bgRaf=0, bgVids=[], bgRailRoots=[];

  function prepareBgVideo(v){
    v.muted=true; v.defaultMuted=true; v.playsInline=true;
    v.setAttribute('muted','');
    v.setAttribute('playsinline','');
    v.setAttribute('webkit-playsinline','');
  }
  function loadBgVideo(v){
    prepareBgVideo(v);
    if(v.dataset.loaded)return;
    v.dataset.loaded='1';
    v.preload='auto';
    /* Setting video.src directly is more reliable on iOS than appending a
       <source> after IntersectionObserver fires. */
    v.src=v.dataset.bg;
    if(!v.dataset.readyHook){
      const ready=()=>v.classList.add('is-ready');
      v.addEventListener('playing',ready);
      v.addEventListener('loadeddata',ready,{once:true});
      v.addEventListener('canplay',()=>safePlayBgVideo(v));
      v.dataset.readyHook='1';
    }
    try{v.load();}catch(err){}
  }
  function safePlayBgVideo(v){
    prepareBgVideo(v);
    if(!v.dataset.loaded)loadBgVideo(v);
    const p=v.play();
    if(p&&p.catch)p.catch(()=>{ v.dataset.playBlocked='1'; });
  }
  function bgMeasure(){
    bgRaf=0;
    const app=$('#app');
    if(!app||!bgVids.length)return;
    const ar=app.getBoundingClientRect();
    bgVids.forEach(v=>{
      const r=v.getBoundingClientRect();
      const verticalNear=r.bottom>ar.top-1100 && r.top<ar.bottom+1100;
      const horizontalNear=r.right>ar.left-700 && r.left<ar.right+700;
      const near=verticalNear&&horizontalNear;
      const active=r.bottom>ar.top-120 && r.top<ar.bottom+120 &&
                   r.right>ar.left-80 && r.left<ar.right+80;
      if(near)loadBgVideo(v);
      if(active && !document.hidden) safePlayBgVideo(v);
      else if(v.dataset.loaded && (r.bottom<ar.top-900 || r.top>ar.bottom+900)){
        try{v.pause();}catch(err){}
      }
    });
  }
  function scheduleBgMeasure(){
    if(!bgRaf)bgRaf=requestAnimationFrame(bgMeasure);
  }
  function armBgVideos(){
    if(bgScroller&&bgScrollHandler)bgScroller.removeEventListener('scroll',bgScrollHandler);
    if(bgScroller&&bgTouchHandler)bgScroller.removeEventListener('touchstart',bgTouchHandler);
    if(bgResizeHandler)window.removeEventListener('resize',bgResizeHandler);
    if(bgVisibilityHandler)document.removeEventListener('visibilitychange',bgVisibilityHandler);
    bgRailRoots.forEach(r=>{ if(bgScrollHandler)r.removeEventListener('scroll',bgScrollHandler); });
    bgRailRoots=[];
    bgVids=$$('[data-bg]');
    bgScroller=$('#app');
    if(!bgVids.length||!bgScroller)return;
    bgScrollHandler=scheduleBgMeasure;
    /* A touch is an explicit user gesture, so this is also a fallback for iOS
       configurations that refuse even muted autoplay (for example Low Power
       Mode). */
    bgTouchHandler=()=>{
      const ar=bgScroller.getBoundingClientRect();
      bgVids.forEach(v=>{
        const r=v.getBoundingClientRect();
        if(r.bottom>ar.top-80&&r.top<ar.bottom+80) safePlayBgVideo(v);
      });
    };
    bgResizeHandler=scheduleBgMeasure;
    bgVisibilityHandler=()=>{ if(!document.hidden)scheduleBgMeasure(); };
    bgScroller.addEventListener('scroll',bgScrollHandler,{passive:true});
    bgScroller.addEventListener('touchstart',bgTouchHandler,{passive:true});
    bgRailRoots=[...new Set(bgVids.map(v=>v.closest('.homePromos__rail,.homeVipServices__rail,.travelWorlds__rail')).filter(Boolean))];
    bgRailRoots.forEach(r=>r.addEventListener('scroll',bgScrollHandler,{passive:true}));
    window.addEventListener('resize',bgResizeHandler,{passive:true});
    document.addEventListener('visibilitychange',bgVisibilityHandler);
    scheduleBgMeasure();
    setTimeout(scheduleBgMeasure,180);
    setTimeout(scheduleBgMeasure,900);
  }

  /* Quiet life for still photography. Only images near the viewport animate.
     This keeps the desired editorial movement while avoiding a page full of
     off-screen transforms competing with video playback on iOS. */
  let livingImagesObserver=null;
  /* The rails drift, and they say so.

     A row of cards that runs off the edge of a phone only reads as swipeable
     once something in it moves, and a step every few seconds reads as a
     carousel taking its turn rather than as a rail you could push yourself.
     So the motion is continuous and slow — 16 pixels a second, closer to a
     minute hand than to an animation — and under each rail sits a thin bar
     whose thumb is as wide a share of the track as the visible cards are of
     the whole row. A part-filled bar that creeps along is the plainest
     statement there is that something scrolls sideways and there is more of
     it than you can see.

     One frame loop for all three rails rather than one each, and it is not
     running at all while none of them is on screen.

     Snapping is off while a rail drifts and back on the moment a finger lands:
     proximity snapping and a continuous programmatic scroll fight each other,
     and the finger is the one that should win.

     What stops the drift, in order of importance:

     A hand — but only a hand that actually swiped. Pausing on every
     pointerdown would kill the rail for good on nearly every visit, because
     the cards are two thirds of the screen and most vertical scrolls begin on
     one. So a touch pauses, and on release the rail compares where it ended up
     with where the finger landed: moved sideways means the visitor has taken
     over and it never moves on its own again; did not move means they were
     only scrolling the page past it, and it resumes. The comparison waits out
     the momentum first, or an iOS flick would still be travelling when it is
     read.

     Leaving the screen, or the tab going to the background — both only pause.

     And prefers-reduced-motion, where it never starts at all; the bar is still
     drawn and still tracks a hand, because it is information rather than
     decoration. */
  const RAIL_SEL   = '.homePromos__rail,.travelWorlds__rail,.homeVipServices__rail';
  const RAIL_SPEED = 16;     // px per second
  const RAIL_SETTLE_MS = 420;
  let railRaf=0, railLast=0, railList=[], railObserver=null;

  function disarmRailAutoScroll(){
    if(railRaf) cancelAnimationFrame(railRaf);
    railRaf=0; railLast=0;
    railList.forEach(r=>{ railFold(r); r.el.classList.remove('is-drifting'); });
    railList=[];
    if(railObserver){ railObserver.disconnect(); railObserver=null; }
  }

  function railBar(r){
    if(!r.bar) return;
    const total=r.el.scrollWidth, view=r.el.clientWidth;
    if(total<=view+2){ r.bar.parentNode.style.visibility='hidden'; return; }
    r.bar.parentNode.style.visibility='';
    const track=r.bar.parentNode.clientWidth;
    const w=Math.max(18, track*view/total);
    r.bar.style.width=w+'px';
    r.bar.style.transform='translateX('+((track-w)*(r.el.scrollLeft/(total-view)))+'px)';
  }

  /* Sub-pixel, or it visibly steps.

     scrollLeft is quantised to whole CSS pixels — a fractional value written
     to it is rounded, and reading the position back or measuring a card's box
     confirms it. At 16 px/s that is 0.27 px of travel per frame against a 1 px
     grid, so the rail stands still for three or four frames and then jumps a
     whole pixel. Measured over 180 frames: 131 of them moved nothing at all,
     and the pattern was 0 0 -1 0 0 -1 0 0 0 -1. Frame pacing was never the
     problem — the gap held at 16.65 ms with a standard deviation of 0.27.

     So the whole pixels go to scrollLeft, which is what actually scrolls, and
     the remainder — always under half a pixel — is carried as a translate on
     the cards. Their sum is the true position, and a transform is not on the
     pixel grid: it is interpolated on the compositor and costs no layout. The
     cards are the right place for it because none of them carries a transform
     of its own; the living-image animation is on the img inside, and the
     nth-child selectors that drive it count children of the rail, which this
     does not change.

     The remainder is folded back into scrollLeft and the transforms cleared
     whenever a hand takes over, so nothing is left leaning by half a pixel
     when snapping comes back. That correction is at most 0.5 px.

     Reads are batched ahead of writes. scrollWidth and clientWidth were being
     read inside the same loop that wrote scrollLeft, once per rail per frame,
     which interleaves measuring and mutating three times over. */
  function railFold(r){
    if(r.kids){ r.kids.forEach(c=>{ c.style.transform=''; }); r.kids=null; }
    r.lastT='';
    if(r.drift && !r.taken){ r.el.scrollLeft=Math.round(r.pos); r.pos=r.el.scrollLeft; }
  }

  function railTick(now){
    railRaf=requestAnimationFrame(railTick);
    if(!railLast){ railLast=now; return; }
    let dt=(now-railLast)/1000; railLast=now;
    if(dt>0.1) dt=0.1;                       // a backgrounded tab comes back with a huge gap
    if(document.hidden) return;

    const plan=[];
    railList.forEach(r=>{
      if(!r.drift||r.taken||r.paused||!r.visible) return;
      const max=r.el.scrollWidth-r.el.clientWidth;
      if(max<8) return;
      plan.push([r,max]);
    });

    plan.forEach(([r,max])=>{
      r.pos += RAIL_SPEED*dt*r.dir;
      if(r.pos>=max){ r.pos=max; r.dir=-1; }
      else if(r.pos<=0){ r.pos=0; r.dir=1; }

      const whole=Math.round(r.pos);
      if(whole!==r.whole){ r.el.scrollLeft=whole; r.whole=whole; }

      // content travels left as the position grows, so the remainder does too
      const t='translate3d('+(r.whole-r.pos).toFixed(3)+'px,0,0)';
      if(t!==r.lastT){
        if(!r.kids) r.kids=Array.prototype.slice.call(r.el.children);
        r.kids.forEach(c=>{ c.style.transform=t; });
        r.lastT=t;
      }
    });
  }

  function armRailAutoScroll(){
    disarmRailAutoScroll();
    const root=$('#app'); if(!root) return;
    const rails=$$(RAIL_SEL,root); if(!rails.length) return;
    const drift = !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

    rails.forEach(el=>{
      const next=el.nextElementSibling;
      const r={el, bar:(next&&next.classList.contains('railBar'))?next.firstElementChild:null,
               dir:1, pos:el.scrollLeft, taken:false, paused:false, visible:false,
               markLeft:0, drift,
               whole:el.scrollLeft, lastT:'', kids:null};
      if(drift) el.classList.add('is-drifting');

      let barRaf=0;
      const paint=()=>{ barRaf=0; railBar(r); };
      el.addEventListener('scroll',()=>{ if(!barRaf) barRaf=requestAnimationFrame(paint); },{passive:true});

      /* Snapping stays off for the whole touch, not just for the drift. The
         first version turned it back on at pointerdown so the visitor's own
         swipe would snap — and the snap fired immediately, pulled the rail
         back to the nearest card, and the check below read that jump as a
         sideways swipe and handed the rail over for good. It was also visible:
         touch the rail and it lurches backwards. With snapping off nothing but
         the finger can move the rail while it is down, so any change in
         scrollLeft across the touch is the finger's, which is the whole
         premise of the check. It comes back on when the visitor has taken
         over, so every swipe after the first one snaps. */
      el.addEventListener('pointerdown',()=>{
        r.paused=true; railFold(r); r.markLeft=el.scrollLeft;
      },{passive:true});
      const release=()=>{
        if(!r.paused) return;
        setTimeout(()=>{
          r.paused=false;
          if(Math.abs(el.scrollLeft-r.markLeft)>6){ r.taken=true; el.classList.remove('is-drifting'); }
          else { r.pos=el.scrollLeft; r.whole=r.pos; }
          railFold(r);
        },RAIL_SETTLE_MS);
      };
      el.addEventListener('pointerup',release,{passive:true});
      el.addEventListener('pointercancel',release,{passive:true});
      el.addEventListener('wheel',()=>{
        r.taken=true; el.classList.remove('is-drifting'); railFold(r);
      },{passive:true,once:true});

      railList.push(r);
      requestAnimationFrame(()=>railBar(r));
    });

    if('IntersectionObserver' in window){
      railObserver=new IntersectionObserver(entries=>{
        entries.forEach(e=>{
          const r=railList.find(x=>x.el===e.target); if(!r) return;
          r.visible=e.isIntersecting;
          if(r.visible){ railFold(r); r.pos=r.el.scrollLeft; r.whole=r.pos; railBar(r); }
        });
        const live=railList.some(r=>r.visible&&r.drift&&!r.taken);
        if(live && !railRaf){ railLast=0; railRaf=requestAnimationFrame(railTick); }
        if(!live && railRaf){ cancelAnimationFrame(railRaf); railRaf=0; }
      },{root,threshold:0.25});
      railList.forEach(r=>railObserver.observe(r.el));
    } else {
      railList.forEach(r=>{ r.visible=true; });
      if(drift){ railLast=0; railRaf=requestAnimationFrame(railTick); }
    }
  }

  function armLivingImages(){
    if(livingImagesObserver){ livingImagesObserver.disconnect(); livingImagesObserver=null; }
    const root=$('#app'); if(!root) return;
    const targets=$$('.travelWorld,.homePromoCard,.vipServiceCard,.homeOfferCard',root);
    if(!targets.length) return;
    if(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches){
      targets.forEach(el=>el.classList.remove('is-alive'));
      return;
    }
    if(!('IntersectionObserver' in window)){
      targets.forEach(el=>el.classList.add('is-alive'));
      return;
    }
    livingImagesObserver=new IntersectionObserver(entries=>{
      entries.forEach(e=>e.target.classList.toggle('is-alive',e.isIntersecting));
    },{root,rootMargin:'18% 12% 18% 12%',threshold:0.02});
    targets.forEach(el=>livingImagesObserver.observe(el));
  }

  /* Reveal on scroll. One observer for the whole view, each element released
     once and then forgotten — an element that has arrived never needs watching
     again, and unobserving keeps the callback cheap on long pages.

     The stagger is per group, not per page: cards in one list follow each
     other, but a list further down does not inherit a two-second delay from
     everything above it. */
  const REVEAL_SEL = [
    '.section__head', '.cardList > .card', '.expBand', '.listCard',
    '.homeEditorialHead', '.homeOfferCard',
    '.statRow', '.doList', '.person', '.searchCard', '.tl',
    /* The section headings already rose on arrival; the full-bleed panels
       carried the largest type on the page and did not. These are the copy
       blocks, not their cards, so the photograph stays put and only the words
       move -- and not the gateway tiles, whose own press transition would be
       replaced by the reveal's slower one and turn the tap mushy. */
    '.homeAviationFinal__copy', '.homeSuperDealCard__copy',
    '.homeTransferRequest__copy', '.homeVipCallback__head',
  ].join(',');
  let revealObserver=null;
  function armReveals(){
    if (revealObserver){ revealObserver.disconnect(); revealObserver=null; }
    const root=$('#app'); if(!root) return;
    const els=$$(REVEAL_SEL, root);
    if(!els.length) return;
    if (!('IntersectionObserver' in window) ||
        (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;

    const seen=new Map();
    els.forEach(el=>{
      /* Never reveal something that contains the fixed tab bar: a transform on
         an ancestor would make it the containing block and the bar would
         scroll away with the content. */
      if (el.querySelector('.tabbar')) return;
      const key=el.parentNode;
      const i=(seen.get(key)||0); seen.set(key,i+1);
      el.style.setProperty('--rd', Math.min(i,4)*0.07 + 's');
      el.classList.add('reveal');
    });

    /* What gets watched is not always what gets revealed. A rail scrolls
       sideways, so the cards past its right edge never cross the vertical
       viewport at all — measured, seven of them stayed invisible for the whole
       page. Watching the rail and releasing its cards together fixes that, and
       the stagger still gives the visible ones their cascade. */
    revealObserver=new IntersectionObserver(entries=>{
      entries.forEach(e=>{
        if(!e.isIntersecting) return;
        const t=e.target;
        if(t.classList.contains('reveal')) t.classList.add('is-in');
        $$('.reveal', t).forEach(c=>c.classList.add('is-in'));
        revealObserver.unobserve(t);
      });
    }, { root, rootMargin:'0px 0px -8% 0px', threshold:0.06 });

    const triggers=new Set();
    $$('.reveal', root).forEach(el=>triggers.add(el.closest('.homeOfferGrid,.homePromos__rail,.homeVipServices__rail,.travelWorlds__rail') || el));
    triggers.forEach(t=>revealObserver.observe(t));
  }

  /* Scroll-linked image zoom + typography motion · r42.
     This replaces the generic looping Ken-Burns movement on ordinary home-page
     stills with motion that follows the user's actual scroll position. The
     yacht hero used to be excluded here — it had to keep its complete native
     9:16 frame with no crop — and that exclusion went out with the chapter it
     protected. */
  let scrollFxCleanup=null;
  function armScrollFx(){
    if(scrollFxCleanup){ scrollFxCleanup(); scrollFxCleanup=null; }
    const root=$('#app');
    if(!root || VIEW.name!=='home') return;
    if(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const imageSel=[
      '.travelWorld img',
      '.homePromoCard img',
      '.vipServiceCard>img',
      '.homeOfferCard__media>img'
    ].join(',');
    const textSel=[
      '.homeEditorialHead',
      '.travelWorld__copy',
      '.homePromoCard__copy',
      '.homeOfferCard__copy',
      '.vipServiceCard__copy',
      '.homeTransferTile__head'
    ].join(',');

    const images=$$(imageSel,root);
    const texts=$$(textSel,root);
    images.forEach(el=>el.classList.add('scrollZoomImg'));
    texts.forEach(el=>el.classList.add('scrollTextFx'));

    let raf=0;
    const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
    const ease=t=>1-Math.pow(1-t,3);
    const frame=()=>{
      raf=0;
      const vh=root.clientHeight||window.innerHeight||800;
      images.forEach(img=>{
        const host=img.parentElement||img;
        const r=host.getBoundingClientRect();
        if(r.bottom < -80 || r.top > vh+80) return;
        const c=r.top+r.height*.5;
        const proximity=1-clamp(Math.abs(c-vh*.5)/(vh*.70));
        const z=1.018 + proximity*.060;
        const y=(.42-proximity*.84);
        img.style.setProperty('--scroll-scale',z.toFixed(4));
        img.style.setProperty('--scroll-y',y.toFixed(3)+'%');
      });
      texts.forEach(el=>{
        const r=el.getBoundingClientRect();
        if(r.bottom < -80 || r.top > vh+100) return;
        const enter=clamp((vh*.96-r.top)/(vh*.36));
        const e=ease(enter);
        el.style.setProperty('--scroll-text-y',((1-e)*20).toFixed(2)+'px');
        el.style.setProperty('--scroll-text-opacity',(0.46+e*.54).toFixed(3));
        el.style.setProperty('--scroll-text-scale',(0.982+e*.018).toFixed(4));
      });
    };
    const schedule=()=>{ if(!raf) raf=requestAnimationFrame(frame); };
    root.addEventListener('scroll',schedule,{passive:true});
    window.addEventListener('resize',schedule,{passive:true});
    schedule();
    setTimeout(schedule,120);
    setTimeout(schedule,600);
    scrollFxCleanup=()=>{
      root.removeEventListener('scroll',schedule);
      window.removeEventListener('resize',schedule);
      if(raf) cancelAnimationFrame(raf);
      images.forEach(el=>{el.classList.remove('scrollZoomImg');el.style.removeProperty('--scroll-scale');el.style.removeProperty('--scroll-y');});
      texts.forEach(el=>{el.classList.remove('scrollTextFx');el.style.removeProperty('--scroll-text-y');el.style.removeProperty('--scroll-text-opacity');el.style.removeProperty('--scroll-text-scale');});
    };
  }

  /* Scroll-linked arrival band. The airframe sits between the headline and the
     card, so scrolling pushes it through the layers instead of past them —
     that sandwich is the whole effect, and it is why the plane is three
     separate elements rather than a background image.

     Progress is written to a custom property and every move happens in a
     transform, so the work stays on the compositor: no layout, no paint, no
     scroll jank on a phone. The listener is passive and rAF-coalesced because
     iOS fires scroll far faster than it paints. */
  /* The transparent hero bar has to gain its backdrop the moment the hero has
     scrolled past, or the brand mark and menu button end up sitting on plain
     content. The switch point is the hero's own height, read from the element
     rather than hardcoded, so it follows whatever the hero is. */
  let barScroller=null, barHandler=null;
  function armAppbar(){
    if (barScroller && barHandler){
      barScroller.removeEventListener('scroll', barHandler);
      barScroller = barHandler = null;
    }
    const bar=$('.appbar--over'), scroller=$('#app');
    if(!bar||!scroller) return;
    const hero=$('.pHero');
    let raf=0;
    const update=()=>{
      raf=0;
      const trip=(hero?hero.offsetHeight:320)-bar.offsetHeight;
      bar.classList.toggle('is-solid', scroller.scrollTop>Math.max(0,trip));
    };
    barHandler=()=>{ if(!raf) raf=requestAnimationFrame(update); };
    barScroller=scroller;
    scroller.addEventListener('scroll',barHandler,{passive:true});
    update();
  }

  let flyScroller=null, flyHandler=null;
  function armFlyBand(){
    if (flyScroller && flyHandler) {
      flyScroller.removeEventListener('scroll', flyHandler);
      window.removeEventListener('resize', flyHandler);
      flyScroller = flyHandler = null;
    }
    /* Each strip answers to its own position on screen. --s is signed
       (-1 arriving at the bottom, +1 leaving at the top) and drives the
       parallax; --z is how close to the middle it is (0 at either edge, 1 dead
       centre) and drives the zoom. Two properties because a parallax wants a
       direction and a zoom does not. */
    const strips=$$('.expBand');
    if(!strips.length) return;
    const scroller=$('#app'); if(!scroller) return;
    let raf=0;
    const update=()=>{
      raf=0;
      const vh=window.innerHeight||1;
      /* The banner photographs drift against their frames. -1 as a band
         enters at the bottom, +1 as it leaves at the top. Off-screen bands are
         skipped so the cost stays with what is visible. */
      strips.forEach(el=>{
        const r=el.getBoundingClientRect();
        if(r.bottom<-40||r.top>vh+40) return;
        const c=Math.max(-1,Math.min(1,(r.top+r.height/2-vh/2)/((vh+r.height)/2)));
        el.style.setProperty('--s',c.toFixed(3));
        el.style.setProperty('--z',(1-Math.abs(c)).toFixed(3));
      });
    };
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches){
      strips.forEach(el=>{el.style.setProperty('--s','0');el.style.setProperty('--z','0');});
      return;
    }
    flyHandler=()=>{ if(!raf) raf=requestAnimationFrame(update); };
    flyScroller=scroller;
    scroller.addEventListener('scroll',flyHandler,{passive:true});
    window.addEventListener('resize',flyHandler,{passive:true});
    update();
  }

  /* ====================================================================
     10 · Render
     ==================================================================== */
  function render(restore){
    const a=$('#app');if(!a)return;
    restore=restore||0;
    let html='';
    switch(VIEW.name){
      case 'home':      html=vHome();break;
      case 'world':     html=vWorld(VIEW.param);break;
      case 'destination':html=vDestination(VIEW.param);break;
      case 'destinations':html=vDestinations();break;
      case 'search':    html=vSearch();break;
      case 'hotel':     html=vHotel(VIEW.param);break;
      case 'wizard':    html=vWizard();break;
      case 'sent':      html=vSent(VIEW.param);break;
      case 'trips':     html=vTrips();break;
      case 'trip':      html=vTrip(VIEW.param);break;
      case 'favorites': html=vFavorites();break;
      case 'map':       html=vMap();break;
      case 'excursions':html=vExcursions();break;
      case 'yachts':    html=vYachts();break;
      case 'transfers': html=vTransfers();break;
      case 'concierge': html=vConcierge();break;
      case 'block':     html=vBlock(VIEW.param);break;
      case 'staff':     html=vStaffLogin();break;
      case 's-dash':    html=S.staff?vStaffDash():vStaffLogin();break;
      case 's-req':     html=S.staff?vStaffReqs():vStaffLogin();break;
      case 's-reqd':    html=S.staff?vStaffReq(VIEW.param):vStaffLogin();break;
      case 's-book':    html=S.staff?vStaffBookings():vStaffLogin();break;
      case 's-cust':    html=S.staff?vStaffCustomers():vStaffLogin();break;
      case 's-more':    html=S.staff?vStaffMore():vStaffLogin();break;
      default:          html=vHome();
    }
    a.innerHTML=`<div class="view">${html}</div>`;
    /* The view animation moves, and an element with a transform becomes the
       containing block for every position:fixed inside it — which is how the
       tab bar once scrolled away with the page. So the fixed furniture is
       lifted out of .view and parked next to it before the animation runs.
       The full-bleed backdrop goes in front of .view in document order so it
       keeps painting behind the content; the bottom bars go after it. */
    const v=a.firstElementChild;
    v.querySelectorAll('.confirmBg').forEach(el=>a.insertBefore(el,v));
    v.querySelectorAll('.tabbar,.stickyCta').forEach(el=>a.appendChild(el));
    /* Restoring has to happen after layout, or the container is still the
       height of the old view and the assignment is clamped away. One frame is
       enough; images below the fold do not affect the offset because every
       card reserves its space through aspect-ratio. */
    if(restore>0){ a.scrollTop=restore; requestAnimationFrame(()=>{a.scrollTop=restore;}); }
    else a.scrollTop=0;
    /* A tapped filter chip re-renders the listing, and the chips rail comes
       back at its start — with the active chip possibly out of view, the page
       looks filtered by nobody. Centre it; block:'nearest' keeps the page
       itself where it is. */
    if(VIEW.name==='yachts'||VIEW.name==='transfers'){
      const on=a.querySelector('.fleetChips .chip.is-on');
      if(on&&on.scrollIntoView)try{on.scrollIntoView({inline:'center',block:'nearest'});}catch(e){}
    }
    document.documentElement.lang=LANG;
    if(VIEW.name==='hotel')bindGallery();
    armBgVideos();
    armInlineAutoplay(a);
    armFlyBand();
    armAppbar();
    armReveals();
    armLivingImages();
    armRailAutoScroll();
    armScrollFx();
    if(VIEW.name==='home')fillHeroSlides(); else stopHeroSlides();
  }
  function bindGallery(){
    const tr=$('#galTrack'),dots=$('#galDots');
    if(!tr||!dots)return;
    tr.addEventListener('scroll',()=>{
      const i=Math.round(tr.scrollLeft/tr.clientWidth);
      $$('i',dots).forEach((d,n)=>d.classList.toggle('is-on',n===i));
    },{passive:true});
  }

  /* ====================================================================
     11 · Sheets
     ==================================================================== */
  function sheetRegion(){
    openSheet(`<div class="sheet__head"><h3 class="h-lg">${t('selectRegion')}</h3>
      <button class="iconBtn" data-sheet-close>${icon('close')}</button></div>
    <div class="sheet__body">
      <button class="check${!FILTER.region?' is-on':''}" data-pregion=""><span class="check__box">${icon('check')}</span><span>${t('allRegions')}</span></button>
      ${REGIONS.map(r=>`<button class="check${FILTER.region===r.id?' is-on':''}" data-pregion="${r.id}">
        <span class="check__box">${icon('check')}</span><span><b style="font-weight:600">${esc(loc(r.name))}</b><br>
        <span class="muted tiny">${esc(loc(r.tag))} · ${PUBLIC_HOTELS.filter(h=>h.region===r.id).length} ${t('hotels')}</span></span></button>`).join('')}
    </div>`);
  }
  function sheetDates(){
    const s=S.search;
    openSheet(`<div class="sheet__head"><h3 class="h-lg">${t('dates')}</h3>
      <button class="iconBtn" data-sheet-close>${icon('close')}</button></div>
    <div class="sheet__body">
      <div class="field" style="margin-top:0"><label class="label">${t('arrival')}</label>
        <input class="input" type="date" id="sdFrom" value="${s.from||today(14)}" min="${today()}"></div>
      <div class="field"><label class="label">${t('departure')}</label>
        <input class="input" type="date" id="sdTo" value="${s.to||today(21)}" min="${today(1)}"></div>
    </div>
    <div class="sheet__foot"><button class="btn btn--primary" data-act="dates-ok">${t('done')}</button></div>`);
  }
  function sheetGuests(){
    const s=S.search;
    const body=()=>`<div class="stepper"><span>${t('adults')}</span><div class="stepper__c">
        <button class="rnd" data-g="ad-"${s.adults<=1?' disabled':''}>${icon('minus')}</button>
        <span class="stepper__n">${s.adults}</span><button class="rnd" data-g="ad+">${icon('plus')}</button></div></div>
      <div class="stepper" style="border-top:1px solid var(--line)"><span>${t('children')}</span><div class="stepper__c">
        <button class="rnd" data-g="ch-"${s.children<=0?' disabled':''}>${icon('minus')}</button>
        <span class="stepper__n">${s.children}</span><button class="rnd" data-g="ch+">${icon('plus')}</button></div></div>`;
    openSheet(`<div class="sheet__head"><h3 class="h-lg">${t('guests')}</h3>
      <button class="iconBtn" data-sheet-close>${icon('close')}</button></div>
    <div class="sheet__body" id="gBody">${body()}</div>
    <div class="sheet__foot"><button class="btn btn--primary" data-act="guests-ok">${t('done')}</button></div>`);
    $('#sheetInner').addEventListener('click',e=>{
      const b=e.target.closest('[data-g]');if(!b)return;
      const k=b.dataset.g;
      if(k==='ad+')s.adults=Math.min(12,s.adults+1);
      if(k==='ad-')s.adults=Math.max(1,s.adults-1);
      if(k==='ch+')s.children=Math.min(6,s.children+1);
      if(k==='ch-')s.children=Math.max(0,s.children-1);
      save();
      const gb=$('#gBody');if(gb)gb.innerHTML=body();
    });
  }
  function sheetFilters(){
    const grp=(title,items,sel,attr)=>`<div class="field"><label class="label">${title}</label>
      <div style="display:flex;flex-wrap:wrap;gap:8px">${items.map(i=>
        `<button class="chip${sel.indexOf(i.id)>-1?' is-on':''}" data-${attr}="${i.id}">${esc(loc(i.l))}</button>`).join('')}</div></div>`;
    const body=()=>`
      ${grp(t('kind'),KINDS,FILTER.kinds,'fkind')}
      <div class="field"><label class="label">${t('category')}</label>
        <div style="display:flex;gap:8px">
          <button class="chip${FILTER.stars.indexOf(5)>-1?' is-on':''}" data-fstar="5">★★★★★</button>
          <button class="chip${FILTER.stars.indexOf(4)>-1?' is-on':''}" data-fstar="4">★★★★</button></div></div>
      ${grp(t('holidayType'),TYPES,FILTER.types,'ftype')}
      ${grp(t('amenities'),AMEN,FILTER.amen,'famen')}
      ${grp(t('board'),BOARDS,FILTER.board,'fboard')}
      <div class="field"><label class="label">${t('rating')}</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="chip${!FILTER.rating?' is-on':''}" data-frate="0">${t('anyRating')}</button>
          <button class="chip${FILTER.rating===9?' is-on':''}" data-frate="9">${t('from9')}</button>
          <button class="chip${FILTER.rating===8.5?' is-on':''}" data-frate="8.5">${t('from85')}</button>
          <button class="chip${FILTER.rating===8?' is-on':''}" data-frate="8">${t('from8')}</button></div></div>
      <div class="field"><label class="label">${t('beachDist')}</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="chip${FILTER.beach==null?' is-on':''}" data-fbeach="">${t('anyRating')}</button>
          <button class="chip${FILTER.beach===0?' is-on':''}" data-fbeach="0">0 m</button>
          <button class="chip${FILTER.beach===150?' is-on':''}" data-fbeach="150">≤ 150 ${t('unitM')}</button>
          <button class="chip${FILTER.beach===400?' is-on':''}" data-fbeach="400">≤ 400 ${t('unitM')}</button></div></div>`;
    openSheet(`<div class="sheet__head"><h3 class="h-lg">${t('filters')}</h3>
        <button class="tiny muted" data-act="freset" style="font-weight:600">${t('reset')}</button></div>
      <div class="sheet__body" id="fBody">${body()}</div>
      <div class="sheet__foot"><button class="btn btn--primary" data-act="fapply">${t('apply')} · ${filtered().length}</button></div>`);
    $('#sheetInner').addEventListener('click',e=>{
      const tgl=(arr,v)=>{const i=arr.indexOf(v);i>-1?arr.splice(i,1):arr.push(v);};
      let hit=false;
      const b=e.target.closest('[data-fkind],[data-fstar],[data-ftype],[data-famen],[data-fboard],[data-frate],[data-fbeach]');
      if(b){
        hit=true;
        if(b.hasAttribute('data-fkind'))tgl(FILTER.kinds,b.dataset.fkind);
        else if(b.hasAttribute('data-fstar'))tgl(FILTER.stars,+b.dataset.fstar);
        else if(b.hasAttribute('data-ftype'))tgl(FILTER.types,b.dataset.ftype);
        else if(b.hasAttribute('data-famen'))tgl(FILTER.amen,b.dataset.famen);
        else if(b.hasAttribute('data-fboard'))tgl(FILTER.board,b.dataset.fboard);
        else if(b.hasAttribute('data-frate'))FILTER.rating=+b.dataset.frate;
        else if(b.hasAttribute('data-fbeach'))FILTER.beach=b.dataset.fbeach===''?null:+b.dataset.fbeach;
      }
      if(e.target.closest('[data-act="freset"]')){
        FILTER={region:FILTER.region,kinds:[],stars:[],types:[],amen:[],rating:0,board:[],beach:null};hit=true;
      }
      if(hit){
        const fb=$('#fBody');if(fb)fb.innerHTML=body();
        const f=$('.sheet__foot .btn');if(f)f.textContent=`${t('apply')} · ${filtered().length}`;
      }
    });
  }
  function sheetMenu(){
    /* The two charter pages ride on t()'s fallback: an unknown key returns
       itself, so a pre-localised hx() string passes straight through. */
    const items=[['discover','search','search'],['destinations','pin','destinations'],
                 ['navVip','star','excursions'],
                 [hx('Наши яхты','Unsere Yachten','Our yachts'),'yacht','yachts'],
                 [hx('VIP-транспорт','VIP-Transport','VIP transport'),'car','transfers'],
                 ['map','map','map'],
                 ['myFav','heart','favorites'],['myTrips','trip','trips'],
                 ['mContact','phone','contact']];
    openSheet(`<div class="sheet__head"><h3 class="h-lg">${t('menu')}</h3>
      <button class="iconBtn" data-sheet-close>${icon('close')}</button></div>
    <div class="sheet__body">
      <div>${items.map(([k,ic,v])=>
        `<button class="menuItem" data-mgo="${v}">${icon(ic)}<span>${t(k)}</span><span class="chev">${icon('chev')}</span></button>`).join('')}
        <button class="menuItem" data-mgo="intro">${icon('play')}<span>${t('mIntro')}</span><span class="chev">${icon('chev')}</span></button></div>
      <div class="field"><label class="label">${t('mLang')}</label>
        <div class="langRow">${SUPPORTED.map(l=>`<button class="chip${LANG===l?' is-on':''}" data-lang="${l}" lang="${l}">${LANGUAGE_NAMES[l]}</button>`).join('')}</div></div>
      <div style="margin-top:18px"><button class="btn btn--dark" data-mgo="staff">${icon('lock')}${t('mStaff')}</button></div>
    </div>`);
  }
  function sheetContact(){
    openSheet(`<div class="sheet__head"><h3 class="h-lg">${t('contactUs')}</h3>
      <button class="iconBtn" data-sheet-close>${icon('close')}</button></div>
    <div class="sheet__body"><p class="muted" style="font-size:13.5px">${t('contactTxt')}</p>
      <div class="listCard" style="margin-top:12px">
        <div class="kv"><span class="muted">${t('phone')}</span><b>+90 242 000 00 00</b></div>
        <div class="kv"><span class="muted">${t('email')}</span><b>hello@onlyone.travel</b></div>
        <div class="kv"><span class="muted">WhatsApp</span><b>+90 500 000 00 00</b></div>
      </div></div>`);
  }
  function sheetTransferRequest(prefill={}){
    openSheet(`<div class="sheet__head"><h3 class="h-lg">${hx('VIP трансфер','VIP Transfer','VIP Transfer')}</h3>
      <button class="iconBtn" data-sheet-close>${icon('close')}</button></div>
    <div class="sheet__body">
      <p class="muted" style="font-size:13.5px;line-height:1.6">${hx('Сначала короткая заявка, затем детали. Оставьте основные данные — команда свяжется с вами и подтвердит автомобиль.','Erst kurz anfragen, dann die Details. Die wichtigsten Daten genügen – unser Team meldet sich und bestätigt das passende Fahrzeug.','Start with a short request, then add details. Leave the key data and our team will confirm the right vehicle.')}</p>
      <div class="field"><label class="label">${hx('Имя','Name','Name')} *</label><input class="input" id="trName" autocomplete="name" value="${esc(prefill.name||'')}"></div>
      <div class="field"><label class="label">${hx('Телефон','Telefon','Phone')} *</label><input class="input" id="trPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+90 ..." value="${esc(prefill.phone||'')}"></div>
      <div class="field"><label class="label">${hx('Откуда','Abholort','Pickup')} *</label><input class="input" id="trFrom" placeholder="${hx('Аэропорт, отель...','Flughafen, Hotel ...','Airport, hotel ...')}" value="${esc(prefill.from||'')}"></div>
      <div class="field"><label class="label">${hx('Куда','Ziel','Destination')} *</label><input class="input" id="trTo" placeholder="${hx('Отель, вилла...','Hotel, Villa ...','Hotel, villa ...')}" value="${esc(prefill.to||'')}"></div>
      <div class="grid2"><div class="field"><label class="label">${hx('Дата','Datum','Date')}</label><input class="input" id="trDate" type="date" value="${esc(prefill.date||'')}"></div>
        <div class="field"><label class="label">${hx('Время','Uhrzeit','Time')}</label><input class="input" id="trTime" type="time" value="${esc(prefill.time||'')}"></div></div>
      <div class="grid2"><div class="field"><label class="label">${hx('Гости','Personen','Guests')}</label><input class="input" id="trGuests" type="number" inputmode="numeric" min="1" max="20" value="${esc(String(prefill.guests||2))}"></div>
        <div class="field"><label class="label">${hx('Номер рейса','Flugnummer','Flight number')}</label><input class="input" id="trFlight" placeholder="TK ..." value="${esc(prefill.flight||'')}"></div></div>
      <div class="grid2"><div class="field"><label class="label">${hx('Багаж','Gepäck','Luggage')}</label><input class="input" id="trLuggage" placeholder="${hx('2 чемодана','2 Koffer','2 suitcases')}" value="${esc(prefill.luggage||'')}"></div>
        <div class="field"><label class="label">${hx('Детское кресло','Kindersitz','Child seat')}</label><select class="input" id="trSeat"><option value="">${hx('Не нужно','Nicht nötig','Not needed')}</option><option value="baby"${(prefill.seat||'')==='baby'?' selected':''}>${hx('Младенец','Baby','Baby')}</option><option value="child"${(prefill.seat||'')==='child'?' selected':''}>${hx('Ребёнок','Kind','Child')}</option></select></div></div>
      <div class="field"><label class="label">${hx('Комментарий','Hinweis','Note')}</label><input class="input" id="trNotes" placeholder="${hx('Например: встреча у выхода, табличка, много багажа','Zum Beispiel: Meet & Greet, Schild, viel Gepäck','For example: meet & greet, sign, lots of luggage')}" value="${esc(prefill.notes||'')}"></div>
    </div>
    <div class="sheet__foot"><button class="btn btn--primary" data-act="transfer-send">${hx('Отправить заявку','Transfer-Anfrage senden','Send transfer request')}</button></div>`);
  }

  function sheetCompare(){
    const list=S.favorites.map(hotel).filter(Boolean);
    const rows=[
      [t('regions'),h=>regionName(h.region)],
      [t('rating'),h=>fmtNum(h.rating)],
      [t('category'),h=>stars(h.stars)],
      [t('beachDist'),h=>h.beach===0?'0 m':h.beach+' '+t('unitM')],
      [t('board'),h=>label(BOARDS,h.board)],
      ['Spa',h=>h.amen.indexOf('spa')>-1?'✓':'—'],
      ['Golf',h=>h.amen.indexOf('golf')>-1?'✓':'—'],
      [t('rooms'),h=>h.rooms.length],
    ];
    openSheet(`<div class="sheet__head"><h3 class="h-lg">${t('compare')}</h3>
      <button class="iconBtn" data-sheet-close>${icon('close')}</button></div>
    <div class="sheet__body"><div class="cmpScroll"><table class="cmp"><thead><tr><th></th>
      ${list.map(h=>`<th>${esc(h.name)}</th>`).join('')}</tr></thead><tbody>
      ${rows.map(([lbl,fn])=>`<tr><th>${lbl}</th>${list.map(h=>`<td>${esc(String(fn(h)))}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>
      <div class="noteBox">${t('noPricesNote')}</div></div>`);
  }
  function sheetRegionInfo(id){
    const r=REGIONS.find(x=>x.id===id);
    const n=PUBLIC_HOTELS.filter(h=>h.region===id).length;
    openSheet(`<div class="sheet__head"><h3 class="h-lg">${esc(loc(r.name))}</h3>
      <button class="iconBtn" data-sheet-close>${icon('close')}</button></div>
    <div class="sheet__body">
      <div style="border-radius:16px;overflow:hidden;aspect-ratio:16/9"><img src="${r.img}" alt="" style="width:100%;height:100%;object-fit:cover"></div>
      <p class="muted" style="font-size:13.5px;margin-top:12px">${esc(loc(r.tag))}</p>
      <p style="font-size:14px;font-weight:600;margin:8px 0 0">${n} ${t('selHotels')}</p>
      <div style="margin-top:14px"><button class="btn btn--primary" data-act="region-go" data-id="${id}">${t('hotelsIn')} ${esc(loc(r.name))}</button></div>
    </div>`);
  }
  function sheetOffer(id){
    const r=request(id),h=hotel(r.hotelId);
    openSheet(`<div class="sheet__head"><h3 class="h-lg">${t('createOffer')}</h3>
        <button class="iconBtn" data-sheet-close>${icon('close')}</button></div>
      <div class="sheet__body">
        <div class="noteBox" style="margin-top:0;display:flex;gap:9px;align-items:flex-start">${icon('lock')}<span>${t('staffOnly')}</span></div>
        <div class="kv" style="margin-top:12px"><span class="muted">${t('hotel')}</span><b>${esc(h.name)}</b></div>
        <div class="kv"><span class="muted">${t('period')}</span><b>${fmtDate(r.from)} – ${fmtDate(r.to)}</b></div>
        <div class="field"><label class="label">${t('rooms')}</label>
          <select class="input" id="oRoom">${h.rooms.map(x=>`<option value="${x.id}"${r.roomId===x.id?' selected':''}>${esc(loc(x.n))}</option>`).join('')}</select></div>
        <div class="grid2">
          <div class="field"><label class="label">${t('sellPrice')} *</label>
            <input class="input" id="oPrice" type="number" inputmode="decimal" min="0" step="1" placeholder="2450"></div>
          <div class="field"><label class="label">${t('currency')}</label>
            <select class="input" id="oCur"><option>EUR</option><option>TRY</option><option>USD</option><option>GBP</option></select></div>
        </div>
        <div class="field"><label class="label">${t('validUntil')}</label><input class="input" id="oValid" type="date" value="${today(7)}"></div>
        <div class="field"><label class="label">${t('custInfo')}</label><textarea class="input" id="oInfo" placeholder="${t('transferIncl')}"></textarea></div>
        <div class="field"><label class="label">${t('internalNote')}</label><input class="input" id="oNote"></div>
      </div>
      <div class="sheet__foot"><button class="btn btn--primary" data-act="offer-save" data-id="${id}">${t('sendOffer')}</button></div>`);
  }
  function sheetExcursion(id){
    const e=excursion(id);if(!e)return;
    openSheet(`<div class="sheet__head"><h3 class="h-lg">${esc(loc(e.n))}</h3>
      <button class="iconBtn" data-sheet-close>${icon('close')}</button></div>
    <div class="sheet__body">
      <div style="border-radius:16px;overflow:hidden;aspect-ratio:16/10">
        <img src="${e.img}" alt="" style="width:100%;height:100%;object-fit:cover"></div>
      <div class="kv" style="margin-top:12px"><span class="muted">${t('duration')}</span><b>${esc(loc(e.dur))}</b></div>
      <p class="muted" style="font-size:13.5px;line-height:1.6;margin-top:12px">${esc(loc(e.d))}</p>
      <div class="noteBox">${t('excNote')}</div>
    </div>
    <div class="sheet__foot"><button class="btn btn--primary" data-act="exc-add" data-id="${id}">${t('addToReq')}</button></div>`);
  }
  function sheetYacht(id){
    const y=yachtById(id);if(!y)return;
    const kv=(l,v)=>`<div class="kv"><span class="muted">${l}</span><b>${esc(v)}</b></div>`;
    openSheet(`<div class="sheet__head"><h3 class="h-lg">${esc(y.name)}</h3>
      <button class="iconBtn" data-sheet-close>${icon('close')}</button></div>
    <div class="sheet__body">
      ${y.img?`<div style="border-radius:16px;overflow:hidden;aspect-ratio:16/10" data-photo-wrap>
        <img class="fleetPhoto" src="${y.img}" alt="" style="width:100%;height:100%;object-fit:cover"></div>`:''}
      <div style="margin-top:12px">
        ${kv(hx('Длина','Länge','Length'),yachtLen(y))}
        ${kv(hx('Верфь','Werft','Builder'),y.builder+' · '+y.year)}
        ${kv(hx('Каюты','Kabinen','Cabins'),y.cabins)}
        ${kv(hx('Гости','Gäste','Guests'),hx('до ','bis ','up to ')+y.guests)}
        ${kv(hx('Экипаж','Crew','Crew'),y.crew)}
        ${y.dests?kv(hx('Маршруты','Reviere','Cruising area'),y.dests.map(d=>label(CHARTER_DESTS,d)).join(' · ')):''}
      </div>
      <div class="charterCard__rate" style="margin-top:14px"><div class="charterCard__rateVal"><span>${yachtRateLabel(y)}</span><b>${eur(y.from)}</b></div></div>
      ${y.d?`<p class="muted" style="font-size:13.5px;line-height:1.6;margin-top:12px">${esc(loc(y.d))}</p>`:''}
      <div class="noteBox">${y.week
        ?hx('Ставка «от» за неделю, без APA и налогов. Наличие на ваши даты и точное предложение подтвердит VIP-ассистент.',
            'Ab-Rate pro Woche, ohne APA und Steuern. Verfügbarkeit für Ihre Daten und das genaue Angebot bestätigt Ihr VIP-Assistent.',
            'From-rate per week, excl. APA and taxes. Your VIP assistant confirms availability for your dates and the exact offer.')
        :hx('Тариф — ориентир за день с экипажем и топливом по стандартному маршруту. Точное предложение под вашу дату соберёт VIP-ассистент.',
            'Die Rate ist ein Richtwert pro Tag mit Crew und Kraftstoff auf der Standardroute. Das genaue Angebot für Ihr Datum erstellt Ihr VIP-Assistent.',
            'The rate is a guide per day with crew and fuel on the standard route. Your VIP assistant prepares the exact offer for your date.')}</div>
      <div class="field"><label class="label">${hx('Имя','Name','Name')} *</label><input class="input" id="ycName" autocomplete="name"></div>
      <div class="field"><label class="label">${hx('Телефон','Telefon','Phone')} *</label><input class="input" id="ycPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+90 ..."></div>
    </div>
    <div class="sheet__foot"><div class="btnRow">
      <button class="btn btn--ghost" data-act="yacht-send" data-id="${id}">${hx('Запросить','Anfragen','Enquire')}</button>
      <button class="btn btn--gold" data-book="yacht:${id}">${hx('Забронировать','Buchen & zahlen','Book & pay')}</button>
    </div></div>`);
  }
  /* --------------------------------------------------------------------
     Payment — two Turkish acquirers, both through their hosted bank pages.

     Ziraat runs on NestPay ("3D Pay Hosting"), VakıfBank on PayFlex
     ("Ortak Ödeme"): in both models the customer types the card on the
     BANK's page, never here — this site only chooses the bank and hands
     over a signed order. The signing needs a secret, and a secret cannot
     live in a browser, so the hand-over goes through /api/pay/* —
     Cloudflare Pages Functions in /functions. Where those functions do
     not exist (GitHub Pages) the probe fails and the flow falls back to
     an honest demo simulator that says it is one.
     -------------------------------------------------------------------- */
  const PAY_PROVIDERS=[
    {id:'ziraat', n:'Ziraat Bankası', s:'Sanal POS · 3-D Secure'},
    {id:'vakif',  n:'VakıfBank',      s:'Sanal POS · 3-D Secure'},
  ];
  let PAYSEL='ziraat';
  let PAY_CAPS;   // undefined=unknown · false=no backend · {providers:{…}}
  function probePay(){
    if(PAY_CAPS!==undefined)return Promise.resolve(PAY_CAPS);
    return fetch('./api/pay/ping',{cache:'no-store'})
      .then(r=>r.ok?r.json():false)
      .then(v=>{PAY_CAPS=(v&&v.ok)?v:false;return PAY_CAPS;})
      .catch(()=>{PAY_CAPS=false;return PAY_CAPS;});
  }
  function startBankPayment(r,provider){
    fetch('./api/pay/start',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({provider,oid:r.id,amount:r.offer.price,currency:r.offer.currency||'EUR',lang:LANG})})
    .then(x=>x.json().then(j=>({ok:x.ok,j})).catch(()=>({ok:false,j:null})))
    .then(({ok,j})=>{
      if(ok&&j&&j.mode==='redirect'&&j.url){location.href=j.url;return;}
      if(ok&&j&&j.mode==='form'&&j.action){
        /* NestPay wants a browser POST: build the signed form and submit it. */
        const f=document.createElement('form');
        f.method='POST';f.action=j.action;f.style.display='none';
        Object.keys(j.fields||{}).forEach(k=>{
          const i=document.createElement('input');
          i.type='hidden';i.name=k;i.value=j.fields[k];f.appendChild(i);
        });
        document.body.appendChild(f);f.submit();return;
      }
      toast(hx('Не удалось начать оплату. Попробуйте ещё раз.',
               'Die Zahlung konnte nicht gestartet werden. Bitte erneut versuchen.',
               'The payment could not be started. Please try again.'));
    })
    .catch(()=>toast(hx('Не удалось начать оплату. Попробуйте ещё раз.',
                        'Die Zahlung konnte nicht gestartet werden. Bitte erneut versuchen.',
                        'The payment could not be started. Please try again.')));
  }
  function sheetPay(id){
    const r=request(id);
    openSheet(`<div class="sheet__head"><h3 class="h-lg">${hx('Оплата','Zahlung','Payment')}</h3>
      <button class="iconBtn" data-sheet-close>${icon('close')}</button></div>
    <div class="sheet__body">
      <div class="priceBox" style="margin-top:0"><div class="lbl">${t('total')}</div>
        <div class="amt">${money(r.offer.price,r.offer.currency)}</div></div>
      <div class="field"><label class="label">${hx('Способ оплаты','Zahlungsweg','Payment method')}</label>
        ${PAY_PROVIDERS.map(m=>`<button class="check${m.id===PAYSEL?' is-on':''}" data-paymethod="${m.id}">
          <span class="check__box">${icon('check')}</span>
          <span><b style="font-weight:600">${esc(m.n)}</b><br><span class="muted tiny">${esc(m.s)}</span></span>
        </button>`).join('')}</div>
      <div class="listCard" style="display:flex;align-items:center;gap:11px">
        <span style="color:var(--turq-600)">${icon('lock')}</span>
        <span class="muted mini">${hx('Данные карты вводятся на защищённой странице банка (3-D Secure). Мы не видим и не храним номер карты.',
          'Die Kartendaten werden auf der gesicherten Seite der Bank eingegeben (3-D Secure). Wir sehen und speichern keine Kartennummer.',
          'Card details are entered on the bank’s secured page (3-D Secure). We never see or store the card number.')}</span></div>
      <div class="noteBox" id="payModeNote" hidden></div>
    </div>
    <div class="sheet__foot"><button class="btn btn--primary" data-act="pay-start" data-id="${id}">${hx('Перейти к оплате','Weiter zur Bank','Continue to the bank')}</button></div>`);
    probePay().then(c=>{
      const n=$('#payModeNote');if(!n)return;
      if(!c){n.hidden=false;n.textContent=t('payDemoNote');}
    });
  }
  /* --------------------------------------------------------------------
     Direct booking. The request flow stays what it is; but wherever a
     price is printed there is now also the short way: book the listed
     from-rate and pay at once. A charter booking is an ordinary request
     born at 'payopen' with the price as its offer — the whole payment
     machinery, the trips list and the staff back office pick it up
     without a second code path for money.
     -------------------------------------------------------------------- */
  function bookable(bt,bid){
    if(bt==='yacht')return yachtById(bid);
    if(bt==='vehicle')return vehicleById(bid);
    return null;
  }
  function newCharterBooking(o){
    S.seq+=1;
    const code=`OO-${new Date().getFullYear()}-${String(S.seq).padStart(5,'0')}`;
    const req={id:'r'+Date.now(),code,kind:'charter',hotelId:null,
      item:{t:o.t,id:o.id,name:o.name,img:o.img||''},
      from:o.date,to:o.to||'',adults:o.guests,children:0,childAges:[],
      route:o.route||'',note:o.note||'',wishes:[],excursions:[],
      contact:{first:o.first,last:'',phone:o.phone,email:'',wa:''},
      status:'payopen',createdAt:Date.now(),
      offer:{price:o.price,currency:'EUR'},
      payment:{link:'',status:'open'},staffNote:'',messages:[],
      history:[{s:'payopen',at:Date.now()}]};
    S.requests.unshift(req);save();
    return req;
  }
  /* One charter day reads as its date; a weekly charter as its week. */
  const charterWhen=r=>fmtDate(r.from)+(r.to?' – '+fmtDate(r.to):'');
  function sheetBookCharter(bt,bid){
    const it=bookable(bt,bid);if(!it)return;
    const name=bt==='vehicle'?vehName(it):it.name;
    const rateLabel=bt==='vehicle'?rateWordFleet(it.perFlight):yachtRateLabel(it);
    const maxG=bt==='yacht'?(it.guests||8):10;
    const week=!!it.week;
    openSheet(`<div class="sheet__head"><h3 class="h-lg">${hx('Бронирование','Buchung','Booking')}</h3>
      <button class="iconBtn" data-sheet-close>${icon('close')}</button></div>
    <div class="sheet__body">
      <div class="kv" style="margin-top:0"><span class="muted">${hx('Что бронируем','Gebucht wird','Booking')}</span><b>${esc(name)}</b></div>
      <div class="priceBox"><div class="lbl">${esc(rateLabel)}</div><div class="amt">${eur(it.from)}</div></div>
      <div class="grid2"><div class="field"><label class="label">${week?hx('Начало · 1 неделя','Start · 1 Woche','Start · 1 week'):hx('Дата','Datum','Date')} *</label>
          <input class="input" type="date" id="bcDate" min="${today()}"></div>
        <div class="field"><label class="label">${t('guests')}</label>
          <input class="input" type="number" id="bcGuests" inputmode="numeric" min="1" max="${maxG}" value="2"></div></div>
      ${bt==='vehicle'?`<div class="field"><label class="label">${hx('Маршрут','Strecke','Route')}</label>
        <input class="input" id="bcRoute" placeholder="${hx('Аэропорт → отель','Flughafen → Hotel','Airport → hotel')}"></div>`:''}
      <div class="field"><label class="label">${hx('Имя','Name','Name')} *</label><input class="input" id="bcName" autocomplete="name"></div>
      <div class="field"><label class="label">${hx('Телефон','Telefon','Phone')} *</label><input class="input" id="bcPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+90 ..."></div>
      <div class="field"><label class="label">${hx('Комментарий','Hinweis','Note')}</label><input class="input" id="bcNote"></div>
      <div class="noteBox">${hx('Сейчас оплачивается ставка «от». Финальные детали и возможные доплаты VIP-ассистент подтвердит с вами до начала.',
        'Bezahlt wird jetzt die Ab-Rate. Finale Details und etwaige Aufpreise bestätigt Ihr VIP-Assistent vor Antritt persönlich.',
        'You pay the from-rate now. Final details and any extras are confirmed personally by your VIP assistant before the start.')}</div>
    </div>
    <div class="sheet__foot"><button class="btn btn--gold" data-act="book-pay" data-bt="${bt}" data-bid="${bid}">${hx('Забронировать и оплатить','Buchen & bezahlen','Book & pay')}</button></div>`);
  }
  function sheetPayDemo(id,provider){
    const r=request(id);
    const p=PAY_PROVIDERS.find(x=>x.id===provider)||PAY_PROVIDERS[0];
    /* Deliberately neutral: a labelled simulator, not a bank's page. */
    openSheet(`<div class="sheet__head"><h3 class="h-lg">${t('demoPay')}</h3>
      <button class="iconBtn" data-sheet-close>${icon('close')}</button></div>
    <div class="sheet__body">
      <div class="eyebrow">DEMO · 3-D SECURE</div>
      <div class="kv" style="margin-top:10px"><span class="muted">${hx('Банк','Bank','Bank')}</span><b>${esc(p.n)}</b></div>
      <div class="priceBox"><div class="lbl">${t('total')}</div>
        <div class="amt">${money(r.offer.price,r.offer.currency)}</div></div>
      <div class="noteBox">${t('payDemoNote')}</div>
      <button class="btn btn--ghost" style="margin-top:14px" data-act="pay-demo-fail">${hx('Симулировать отказ','Fehlschlag simulieren','Simulate a decline')}</button>
    </div>
    <div class="sheet__foot"><button class="btn btn--primary" data-act="pay-do" data-id="${id}">${hx('Симулировать успешную оплату','Erfolgreiche Zahlung simulieren','Simulate a successful payment')}</button></div>`);
  }

  /* ====================================================================
     12 · Events
     ==================================================================== */
  /* The weekly fleet's photographs are wired by filename before the files
     exist (docs/chatgpt-bildauftrag.md briefs them). A 404 must read as
     "photo to follow", not as a broken-image glyph — error does not bubble,
     so this listens in the capture phase and swaps the media block. The
     same handler drops the photo frame inside the yacht sheet. */
  document.addEventListener('error',e=>{
    const im=e.target;
    if(!im||im.tagName!=='IMG')return;
    if(im.classList&&im.classList.contains('fleetPhoto')){
      const w=im.closest('[data-photo-wrap]');if(w)w.remove();return;
    }
    if(im.closest&&im.closest('.charterCard')){
      const m=im.closest('.card__media');if(m)m.outerHTML=pendingMedia();
    }
  },true);

  document.addEventListener('click',e=>{
    const T=e.target;
    if(T.closest('[data-sheet-close]')){closeSheet();return;}

    const bl=T.closest('[data-block]');
    if(bl){go('block',bl.dataset.block);return;}

    const g=T.closest('[data-go]');
    if(g){const v=g.dataset.go;go(v==='staff'&&S.staff?'s-dash':v);return;}

    const mg=T.closest('[data-mgo]');
    if(mg){
      const v=mg.dataset.mgo;closeSheet();
      setTimeout(()=>{
        if(v==='contact')sheetContact();
        else if(v==='intro'){if(window.ONLYONE&&window.ONLYONE.replayIntro)window.ONLYONE.replayIntro();}
        else if(v==='staff')go(S.staff?'s-dash':'staff');
        else go(v);
      },260);
      return;
    }

    const fav=T.closest('[data-act="fav"]');
    if(fav){
      e.stopPropagation();
      const id=fav.dataset.id,i=S.favorites.indexOf(id);
      if(i>-1){S.favorites.splice(i,1);toast(t('remFav'));}else{S.favorites.push(id);toast(t('addFav'));}
      save();
      fav.classList.toggle('is-on');fav.classList.toggle('is-fav');
      fav.classList.remove('pop');void fav.offsetWidth;fav.classList.add('pop');
      if(VIEW.name==='favorites')render();
      return;
    }

    const hc=T.closest('[data-hotel]');
    if(hc&&!T.closest('[data-act]')){go('hotel',hc.dataset.hotel);return;}
    const world=T.closest('[data-world]');
    if(world){go('world',world.dataset.world);return;}
    const dest=T.closest('[data-dest]');
    if(dest){go('destination',dest.dataset.dest);return;}
    const worldExplore=T.closest('[data-world-explore]');
    if(worldExplore){
      const x=EXPERIENCES.find(e=>e.id===worldExplore.dataset.worldExplore);
      if(!x)return;
      if(x.go.view){go(x.go.view);return;}
      FILTER={region:null,kinds:[],stars:[],types:[],amen:[],rating:0,board:[],beach:null};
      if(x.go.type)FILTER.types=[x.go.type];
      if(x.go.kind)FILTER.kinds=[x.go.kind];
      go('search');return;
    }
    const destSearch=T.closest('[data-dest-search]');
    if(destSearch){
      const d=DESTINATIONS.find(x=>x.id===destSearch.dataset.destSearch);
      FILTER={region:null,kinds:[],stars:[],types:[],amen:[],rating:0,board:[],beach:null};
      if(d&&d.regions&&d.regions.length===1)FILTER.region=d.regions[0];
      go('search');return;
    }
    const hexp=T.closest('[data-home-exp]');
    if(hexp){
      const x=HOME_EXPERIENCES.find(e=>e.id===hexp.dataset.homeExp);
      if(x&&x.go.exc){sheetExcursion(x.go.exc);return;}
      if(x&&x.go.view){go(x.go.view);return;}
    }
    const rg=T.closest('[data-region]');
    if(rg){FILTER.region=rg.dataset.region;go('search');return;}
    const xp=T.closest('[data-exp]');
    if(xp){
      const x=EXPERIENCES.find(e=>e.id===xp.dataset.exp);
      if(x&&x.go.view){go(x.go.view);return;}
      if(x&&x.go.exc){sheetExcursion(x.go.exc);return;}
      if(x){
        /* An experience is an entry point, not an extra filter on top of
           whatever was left from the last search — so it resets first. */
        FILTER={region:null,kinds:[],stars:[],types:[],amen:[],rating:0,board:[],beach:null};
        if(x.go.type)FILTER.types=[x.go.type];
        if(x.go.kind)FILTER.kinds=[x.go.kind];
        go('search');
      }
      return;
    }
    const fr=T.closest('[data-fregion]');
    if(fr){FILTER.region=fr.dataset.fregion||null;render();return;}
    const pr=T.closest('[data-pregion]');
    if(pr){FILTER.region=pr.dataset.pregion||null;closeSheet();setTimeout(render,260);return;}
    const mr=T.closest('[data-mregion]');
    if(mr){sheetRegionInfo(mr.dataset.mregion);return;}
    const tp=T.closest('[data-trip]');
    if(tp){go('trip',tp.dataset.trip);return;}
    const sq=T.closest('[data-sreq]');
    if(sq){go('s-reqd',sq.dataset.sreq);return;}
    /* `button[data-lang]`, not `[data-lang]`. The language chips are buttons;
       nothing else in the app carries the attribute. Written open, this branch
       once matched every click on the page, because <html> carried data-lang
       too — closest() walks all the way up — so it fired on every tap, set the
       language to the one already chosen, and returned. Everything below this
       line was unreachable: the whole wizard and the entire data-act switch,
       which is to say every form on the site. */
    const lg=T.closest('button[data-lang]');
    if(lg){LANG=lg.dataset.lang;S.lang=LANG;document.documentElement.lang=LANG;save();closeSheet();setTimeout(render,260);return;}

    /* wizard */
    const w=T.closest('[data-w]');
    if(w&&W){
      const k=w.dataset.w;
      if(k==='ad+'){wizardCollect();W.adults=Math.min(12,W.adults+1);render();return;}
      if(k==='ad-'){wizardCollect();W.adults=Math.max(1,W.adults-1);render();return;}
      if(k==='ch+'){wizardCollect();W.children=Math.min(6,W.children+1);render();return;}
      if(k==='ch-'){wizardCollect();W.children=Math.max(0,W.children-1);render();return;}
      if(k==='prev'){wizardCollect();W.step--;render();return;}
      if(k==='next'){
        wizardCollect();
        if(W.step===1&&nights(W.from,W.to)<1){toast(t('required'));return;}
        W.step++;render();return;
      }
      if(k==='send'){
        wizardCollect();
        if(!W.first||!W.last||!W.phone||!W.email){toast(t('required'));W.step=5;render();return;}
        submitRequest();return;
      }
    }
    const wr=T.closest('[data-wroom]');
    if(wr&&W){W.roomId=wr.dataset.wroom;render();return;}
    const we=T.closest('[data-wexc]');
    if(we&&W){
      const k=we.dataset.wexc,i=W.excursions.indexOf(k);
      wizardCollect();
      i>-1?W.excursions.splice(i,1):W.excursions.push(k);
      render();return;
    }
    const ex=T.closest('[data-exc]');
    /* The yacht entry stopped being a sheet the day the fleet got a page of
       its own: every yacht tap now lands on the listing. */
    if(ex){if(ex.dataset.exc==='yacht-tour'){go('yachts');return;}sheetExcursion(ex.dataset.exc);return;}
    /* Before the card handlers: the book button sits INSIDE a charter card,
       and the card itself opens the detail sheet — the more specific target
       must win. */
    const bk=T.closest('[data-book]');
    if(bk){
      const parts=String(bk.dataset.book).split(':');
      sheetBookCharter(parts[0],parts[1]);
      return;
    }
    const yc=T.closest('[data-yacht]');
    if(yc){sheetYacht(yc.dataset.yacht);return;}
    const vh=T.closest('[data-vehicle]');
    if(vh){
      const v=vehicleById(vh.dataset.vehicle);
      sheetTransferRequest(v?{notes:hx('Транспорт: ','Fahrzeug: ','Vehicle: ')+vehName(v)}:{});
      return;
    }
    const yd=T.closest('[data-ysize]');
    if(yd){CHARTERF.size=yd.dataset.ysize||null;render();return;}
    const pm=T.closest('[data-paymethod]');
    if(pm){
      PAYSEL=pm.dataset.paymethod;
      $$('#sheetInner [data-paymethod]').forEach(b=>b.classList.toggle('is-on',b.dataset.paymethod===PAYSEL));
      return;
    }
    const tcl=T.closest('[data-tclass]');
    if(tcl){CHARTERF.cls=tcl.dataset.tclass||null;render();return;}
    const ww=T.closest('[data-wish]');
    if(ww&&W){
      const k=ww.dataset.wish,i=W.wishes.indexOf(k);
      wizardCollect();
      i>-1?W.wishes.splice(i,1):W.wishes.push(k);
      render();return;
    }

    const a=T.closest('[data-act]');
    if(!a)return;
    const act=a.dataset.act,id=a.dataset.id;
    switch(act){
      case 'vip-callback': {
        const form=a.closest('[data-vip-lead-form]');
        const n=form&&form.querySelector('[data-vip-name]'),p=form&&form.querySelector('[data-vip-phone]');
        const name=n?n.value.trim():'',phone=p?p.value.trim():'';
        if(!name||!phone){toast(hx('Введите имя и телефон','Bitte Name und Telefon eingeben','Please enter name and phone'));break;}
        S.leads=S.leads||[];S.leads.unshift({type:'vip-callback',source:a.dataset.source||'vip',name,phone,createdAt:Date.now()});save();
        if(n)n.value='';if(p)p.value='';
        toast(hx('Спасибо. VIP-ассистент свяжется с вами лично.','Danke. Ihr VIP-Assistent meldet sich persönlich.','Thank you. Your VIP assistant will contact you personally.'));break;
      }
      case 'transfer-quick-send': {
        const n=$('#trQuickName'),p=$('#trQuickPhone'),name=(n&&n.value||'').trim(),phone=(p&&p.value||'').trim();
        if(!name||!phone){toast(hx('Введите имя и телефон','Bitte Name und Telefon eingeben','Please enter name and phone'));break;}
        S.leads=S.leads||[];S.leads.unshift({type:'transfer-callback',source:'transfer-banner',name,phone,createdAt:Date.now()});save();
        if(n)n.value='';if(p)p.value='';
        toast(hx('Спасибо. VIP-ассистент уточнит детали трансфера лично.','Danke. Ihr VIP-Assistent klärt die Transferdetails persönlich.','Thank you. Your VIP assistant will confirm the transfer details personally.'));
        break;
      }
      case 'yacht-send': {
        const y=yachtById(a.dataset.id);
        const n=$('#ycName'),p=$('#ycPhone'),name=(n&&n.value||'').trim(),phone=(p&&p.value||'').trim();
        if(!name||!phone){toast(hx('Введите имя и телефон','Bitte Name und Telefon eingeben','Please enter name and phone'));break;}
        S.leads=S.leads||[];S.leads.unshift({type:'yacht-charter',yacht:y?y.name:a.dataset.id,name,phone,createdAt:Date.now()});save();closeSheet();
        setTimeout(()=>toast(hx('Спасибо. VIP-ассистент свяжется с вами по яхте.','Danke. Ihr VIP-Assistent meldet sich zur Yacht.','Thank you. Your VIP assistant will contact you about the yacht.')),330);
        break;
      }
      case 'transfer-form': sheetTransferRequest();break;
      case 'transfer-send': {
        const name=(($('#trName')||{}).value||'').trim(),phone=(($('#trPhone')||{}).value||'').trim(),from=(($('#trFrom')||{}).value||'').trim(),to=(($('#trTo')||{}).value||'').trim();
        if(!name||!phone||!from||!to){toast(hx('Заполните обязательные поля','Bitte Pflichtfelder ausfüllen','Please complete the required fields'));break;}
        S.leads=S.leads||[];S.leads.unshift({type:'transfer',name,phone,from,to,date:(($('#trDate')||{}).value||''),time:(($('#trTime')||{}).value||''),guests:+((($('#trGuests')||{}).value)||2),flight:(($('#trFlight')||{}).value||''),luggage:(($('#trLuggage')||{}).value||''),seat:(($('#trSeat')||{}).value||''),notes:(($('#trNotes')||{}).value||''),createdAt:Date.now()});save();closeSheet();
        ['trQuickName','trQuickPhone'].forEach(id=>{const el=$('#'+id);if(el)el.value='';});
        setTimeout(()=>toast(hx('Подробная заявка на трансфер отправлена','Detaillierte Transfer-Anfrage gesendet','Detailed transfer request sent')),330);break;
      }
      case 'back': back();break;
      /* The logo in the bar and the one closing the page both come back up
         here. #app is the scroller, not the window, so scrollTo has to be
         asked of it; the smooth behaviour is dropped for anyone who has said
         they do not want motion, and the plain assignment is there for a
         browser that will not take the options object. */
      case 'to-top': {
        const sc=$('#app'); if(!sc) break;
        const soft=!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
        try{ sc.scrollTo({top:0,left:0,behavior:soft?'smooth':'auto'}); }
        catch(e){ sc.scrollTop=0; }
        break;
      }
      case 'menu': sheetMenu();break;
      case 'share': toast(t('shared'));break;
      case 'pick-region': sheetRegion();break;
      case 'pick-dates': sheetDates();break;
      case 'pick-guests': sheetGuests();break;
      case 'dates-ok': {
        const f=$('#sdFrom'),tt=$('#sdTo');
        if(f)S.search.from=f.value;
        if(tt)S.search.to=tt.value;
        save();closeSheet();setTimeout(render,260);break;
      }
      case 'guests-ok': closeSheet();setTimeout(render,260);break;
      case 'filters': sheetFilters();break;
      case 'fapply': closeSheet();setTimeout(render,260);break;
      case 'do-search': render();toast(`${filtered().length} ${t('results')}`);break;
      case 'compare': sheetCompare();break;
      case 'exc-add': {
        // Vor der Anfrage vormerken; der Wizard übernimmt die Auswahl in Schritt 4.
        S.pendingExc = S.pendingExc || [];
        if(S.pendingExc.indexOf(id)<0)S.pendingExc.push(id);
        save();closeSheet();setTimeout(()=>toast(t('excAdded')),300);break;
      }
      case 'region-go': FILTER.region=id;closeSheet();setTimeout(()=>go('search'),260);break;
      case 'req': startRequest(id,a.dataset.room);break;
      case 'accept': setStatus(request(id),'accepted');render();toast(t('offerAccepted'));break;
      case 'ask': toast(t('questionSent'));break;
      case 'pay': sheetPay(id);break;
      case 'book-pay': {
        if(a.disabled)break;
        const bt=a.dataset.bt,bid=a.dataset.bid,it=bookable(bt,bid);if(!it)break;
        const date=(($('#bcDate')||{}).value||'').trim();
        const first=(($('#bcName')||{}).value||'').trim();
        const phone=(($('#bcPhone')||{}).value||'').trim();
        if(!date||!first||!phone){toast(hx('Заполните дату, имя и телефон','Bitte Datum, Name und Telefon ausfüllen','Please fill in date, name and phone'));break;}
        /* The min/max on the inputs are advisory in every browser; the
           handler is the fence. ISO date strings compare as dates do. */
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<today()){
          toast(hx('Выберите дату в будущем','Bitte ein Datum in der Zukunft wählen','Please choose a future date'));break;
        }
        const maxG=bt==='yacht'?(it.guests||8):10;
        const guests=Math.min(maxG,Math.max(1,Math.round(+((($('#bcGuests')||{}).value)||2))||1));
        /* A weekly charter is a week: the stored booking carries its real
           end date instead of pretending to be an afternoon. */
        let to='';
        if(it.week){
          const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+7);
          to=d.toISOString().slice(0,10);
        }
        a.disabled=true;   // a second tap during the hand-over books nothing
        const req=newCharterBooking({t:bt,id:bid,
          name:bt==='vehicle'?vehName(it):it.name,img:it.img||'',price:it.from,
          date,to,guests,
          route:(($('#bcRoute')||{}).value||'').trim(),
          note:(($('#bcNote')||{}).value||'').trim(),first,phone});
        /* Straight into the payment sheet — swapping the open sheet's
           content leaves no gap for a back gesture or a double tap. */
        sheetPay(req.id);
        break;
      }
      case 'accept-pay': {
        const r=request(id);if(!r)break;
        setStatus(r,'accepted');
        r.payment={link:'',status:'open'};
        setStatus(r,'payopen');
        render();
        sheetPay(r.id);
        break;
      }
      case 'pay-start': {
        const r=request(id);if(!r||!r.offer)break;
        const provider=PAYSEL;
        probePay().then(c=>{
          if(!c){sheetPayDemo(id,provider);return;}
          if(!(c.providers&&c.providers[provider])){
            toast(hx('Оплата через этот банк ещё не подключена.',
                     'Diese Bank ist noch nicht freigeschaltet.',
                     'This bank is not activated yet.'));
            return;
          }
          startBankPayment(r,provider);
        });
        break;
      }
      case 'pay-demo-fail':
        closeSheet();
        setTimeout(()=>toast(hx('Платёж не выполнен (демо).','Zahlung fehlgeschlagen (Demo).','Payment failed (demo).')),330);
        break;
      case 'pay-do': {
        const r=request(id);
        r.payment.status='paid';r.payment.paidAt=Date.now();
        setStatus(r,'paid');
        closeSheet();
        /* Whoever paid from a catalogue page must land on the paid trip,
           not back among the cards as if nothing had happened. */
        setTimeout(()=>{
          if(VIEW.name==='trip'&&VIEW.param===r.id)render();
          else go('trip',r.id);
          toast(t('paidOk'));
        },280);break;
      }
      case 'do-login': {
        const n=$('#stName');
        S.staff=(n&&n.value.trim())||'Staff';save();go('s-dash',null,true);break;
      }
      case 'logout': S.staff=null;save();STACK.length=0;go('home',null,true);break;
      case 'save-note': {
        const r=request(id),n=$('#sNote');
        if(n){r.staffNote=n.value;}
        if(r.status==='new')setStatus(r,'review');
        save();render();toast(t('done'));break;
      }
      case 'offer-form': sheetOffer(id);break;
      case 'offer-save': {
        const r=request(id);
        const price=parseFloat(($('#oPrice')||{}).value);
        if(!price||price<=0){toast(t('required'));break;}
        r.offer={
          price,
          currency:($('#oCur')||{}).value||'EUR',
          roomId:($('#oRoom')||{}).value||r.roomId,
          validUntil:($('#oValid')||{}).value||'',
          custInfo:($('#oInfo')||{}).value||'',
          internalNote:($('#oNote')||{}).value||'',
          createdAt:Date.now()
        };
        setStatus(r,'offer');
        closeSheet();setTimeout(()=>{render();toast(t('offerSent'));},280);break;
      }
      case 'paylink': {
        const r=request(id);
        r.payment={link:`https://odeme.ziraatbank.demo/pay/${r.code}`,status:'open',createdAt:Date.now()};
        setStatus(r,'payopen');render();toast(t('payLinkDone'));break;
      }
      case 'copy': {
        const r=request(id);
        if(navigator.clipboard)navigator.clipboard.writeText(r.payment.link).catch(()=>{});
        toast(t('linkCopied'));break;
      }
      case 'notify': toast(t('sendWa'));break;
      case 'c-send': {
        const el=$('#cMsg');
        if(addMessage(request(id),'guest',el?el.value:'')){render();toast(t('msgSent'));}
        break;
      }
      case 's-send': {
        const el=$('#sMsg');
        if(addMessage(request(id),'staff',el?el.value:'')){render();toast(t('msgSent'));}
        break;
      }
      case 'c-call': toast('+90 242 000 00 00');break;
      case 'c-wa':   toast('WhatsApp +90 500 000 00 00');break;
      case 'c-mail': toast('hello@onlyone.travel');break;
      case 'confirm-hotel': {
        const r=request(id);setStatus(r,'confirmed');render();
        toast(r&&r.kind==='charter'?hx('Бронирование подтверждено','Buchung bestätigt','Booking confirmed'):t('hotelConfirmed'));break;
      }
    }
  });

  /* ====================================================================
     13 · Public API for the intro
     ==================================================================== */
  window.ONLYONE = window.ONLYONE || {};
  /* A visitor coming back from a bank carries the outcome in the stash the
     document wrote before it stripped the query. Read once, here, so the
     platform opens on the trip with its new state instead of the home page.
     The bank's callback function has already verified the cryptography —
     this only mirrors the result into the on-device state. */
  let PAYRET=null;
  try{
    const q=sessionStorage.getItem('onlyone.payreturn');
    if(q){sessionStorage.removeItem('onlyone.payreturn');PAYRET=new URLSearchParams(q);}
  }catch(e){}
  window.ONLYONE.boot = function(){
    if(PAYRET&&PAYRET.get('pay')){
      const ok=PAYRET.get('pay')==='ok';
      const r=S.requests.find(x=>x.id===PAYRET.get('oid'));
      if(r&&ok&&r.status!=='paid'&&r.status!=='confirmed'){
        r.payment=r.payment||{};
        r.payment.status='paid';r.payment.paidAt=Date.now();
        r.payment.provider=PAYRET.get('provider')||'';
        setStatus(r,'paid');
      }
      VIEW=r?{name:'trip',param:r.id}:{name:'trips',param:null};
      const msg=ok?t('paidOk'):hx('Платёж не выполнен. Попробуйте ещё раз или напишите VIP-ассистенту.',
        'Die Zahlung wurde nicht ausgeführt. Bitte erneut versuchen oder dem VIP-Assistenten schreiben.',
        'The payment did not go through. Please try again or write to your VIP assistant.');
      setTimeout(()=>toast(msg),700);
      PAYRET=null;
    }
    if(!VIEW.name)VIEW={name:'home',param:null};
    render();
    initHistory();
  };
  window.ONLYONE.resetToHome = function(){
    STACK.length=0;VIEW={name:'home',param:null};render();
    initHistory();
  };
})();
