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
  /* Only counts while the video is provably dead — nothing decoded and nothing
     arriving. A slow download resets it and a blocked autoplay never reaches
     it, so this can stay short: a visitor whose file will never play should not
     stare at a poster for twenty seconds. */
  var STALL_GIVE_UP_S    = 9;

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
          skip:'Skip', start:'Start Journey' },
    de: { kicker:'Das ist nicht nur eine Reise',
          h:'Das ist deine<br>Only One<em class="headline__script">Journey</em>',
          endT:'Deine Reise<em>beginnt jetzt</em>',
          skip:'Überspringen', start:'Reise starten' },
    ru: { kicker:'Это не просто поездка',
          h:'Это твоё<br>Only One<em class="headline__script">Journey</em>',
          endT:'Твоё путешествие<em>начинается сейчас</em>',
          skip:'Пропустить', start:'Начать путешествие' }
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
        if (['uk','be','kk','ky','uz','az','hy','ka'].indexOf(base) > -1) return 'ru';
      }
    } catch (e) {}
    return 'en';
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
    showTapStart();
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
    var on = !video.muted && wantSound;
    soundToggle.classList.toggle('is-on', on);
    soundToggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    soundToggle.setAttribute('aria-label', on ? 'Mute ocean sound' : 'Enable ocean sound');
  }

  /* The tap still has to be discoverable — no browser starts audio on its own —
     but the wording is gone: a labelled pill competed with the headline on the
     one screen that is meant to be a single image. The sound button pulses
     instead, which says "press me" without putting words on the picture. */
  function showSoundHint(){
    if (!soundToggle || audioUnlocked || !video.muted) return;
    soundToggle.classList.add('is-hinting');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(hideSoundHint, 9000);
  }
  function hideSoundHint(){
    if (soundToggle) soundToggle.classList.remove('is-hinting');
    clearTimeout(hintTimer);
  }

  // Must run synchronously inside a user gesture on iOS.
  function enableSound() {
    wantSound = true;
    audioUnlocked = true;
    video.muted = false;
    video.defaultMuted = false;
    video.removeAttribute('muted');
    video.volume = 1;
    saveSoundPref(true);
    hideSoundHint();
    reflectSoundUi();
  }

  function muteSound() {
    // Attribute and property are kept in step deliberately — see boot.
    video.muted = true;
    video.defaultMuted = true;
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

      if (window.ONLYONE && window.ONLYONE.boot) window.ONLYONE.boot();
    }, FLASH_MS);
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
          showTapStart();
        }
      });
    }
  }

  function showTapStart() {
    if (leaving || onMain) return;
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
  video.addEventListener('canplay', nudgePlay);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) nudgePlay();
  });

  video.addEventListener('error', giveUpOnVideo);

  // A failing <source> fires its error on the source element, not the video.
  var heroSource = video.querySelector('source');
  if (heroSource) heroSource.addEventListener('error', giveUpOnVideo);

  /* --- first tap on the hero: unlock sound, replay with the ocean -------- */
  intro.addEventListener('click', function (event) {
    if (leaving || onMain) return;
    // the toggle, skip and fallback buttons own their own gestures
    if (event.target.closest('#soundToggle, #tapStart, #skipIntro')) return;

    if (!audioUnlocked) {
      enableSound();
      resetSequence();
      playFromStart();          // §12: from 0:00, ocean audible
    } else {
      // Sound is already unlocked but playback is not running — this tap is a
      // gesture, so spend it on getting the video going.
      nudgePlay();
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
        } else {
        wantSound = false;
        saveSoundPref(false);
        muteSound();
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

  /* --- never let the ocean play in a background tab ---------------------- */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      try { video.pause(); } catch (e) {}
    } else if (onMain) {
      // the platform hero is a slideshow now — CSS animations pause themselves
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
     Public API — the platform starts its hero clip and can replay the
     intro from its menu.
     ====================================================================== */
  window.ONLYONE = window.ONLYONE || {};
  window.ONLYONE.replayIntro = backToIntro;

  /* ======================================================================
     Boot
     ====================================================================== */

  video.playsInline = true;

  wantSound = loadSoundPref();
  if (wantSound) {
    // Worth a try: Android Chrome may allow it on a return visit once the site
    // has media engagement. iOS refuses and playFromStart() falls back to muted.
    // The content attribute has to go too — leaving `muted` on the element
    // while the property says otherwise means any re-initialisation of the
    // media element silently reverts to muted.
    video.removeAttribute('muted');
    video.defaultMuted = false;
    video.muted = false;
    video.volume = 1;
  } else {
    video.setAttribute('muted', '');
    video.defaultMuted = true;
    video.muted = true;
  }
  reflectSoundUi();

  playFromStart();

  // Give the video a moment to settle, then nudge — only if still silent.
  setTimeout(showSoundHint, 1400);
  ['click','touchend'].forEach(function (ev) {
    intro.addEventListener(ev, hideSoundHint, { once: true, capture: true });
  });

  // If autoplay never got going, offer the explicit start button.
  probeTimer = setTimeout(function () {
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
      navConcierge:'Консьерж',
      navVip:'VIP экскурсии',
      conciergeTitle:'Ваш персональный консьерж',
      conciergeRole:'Консьерж ONLYONE · Анталья',
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
      heroEyebrow:'Анталья · Средиземное море', heroScript:'Турция',
      heroTitle:'Лучшие адреса побережья.',
      heroSub:'Расскажите, как вы путешествуете, — обо всём остальном позаботимся мы.',
      discover:'Подобрать жильё', trust1:'Жильё, отобранное вручную', trust2:'Персональная консультация', trust3:'Индивидуальные предложения',
      navHome:'Главная', navSearch:'Поиск', navMap:'Карта', navFav:'Избранное', navTrips:'Мои поездки',
      where:'Куда?', wherePh:'Выберите регион', dates:'Даты поездки', datesPh:'Выберите даты',
      guests:'Гости', searchBtn:'Найти жильё', recommended:'Рекомендуем', all:'Все',
      experiences:'Впечатления',
      vipHead:'Мы делаем больше,<br>чем просто поездки',
      vip1:'VIP-сервис', vip1t:'Один человек ведёт вашу поездку — от первого вопроса до возвращения домой.',
      vip2:'Проверенные адреса', vip2t:'Только дома, в которых мы были сами. Никаких каталожных отелей.',
      vipX:'Эксклюзивные впечатления', vipXt:'Яхты, вертолёты, гастрономия и приватные экскурсии — по вашему вкусу.',
      vip3:'Консьерж на связи', vip3t:'Столик, трансфер, врач — пока вы в пути, мы на телефоне.', conciergeName:'Мария Грычко', conciergeMark:'МГ',
      flyEyebrow:'Дорога', flyTitle:'Прилететь<br>без пересадок',
      flySpecA:'Перелёт и трансфер', flySpecB:'Круглосуточно',
      flyBody:'Рейс, частный трансфер из аэропорта Анталии и встреча у выхода. Скажите, откуда летите — остальное возьмёт на себя ваш консьерж.',
      flyCta:'Спросить консьержа',
      carEyebrow:'Трансфер', carTitle:'Машина<br>уже ждёт', carWord:'VIP ТРАНСФЕР',
      welcomeEyebrow:'Прибытие', welcomeTitle:'VIP-приём',
      welcomeBody:'Личная встреча в Анталии — табличка с именем, короткий путь, без очередей.',
      yachtEyebrow:'Эксклюзив', yachtTitle:'Яхт-тур',
      yachtBody:'Лодка только для вас — маршрут, бухты и кухня по вашему желанию.',
      carSpecA:'Приватно и тихо', carSpecB:'От двери до двери',
      carBody:'Автомобиль с водителем встречает вас в аэропорту Анталии и довозит до самых дверей — без очередей и пересадок.',
      regions:'Регионы', allRegions:'Все регионы', hotels:'вариантов', hotel:'Размещение',
      filters:'Фильтры', apply:'Применить', reset:'Сбросить', results:'найдено',
      category:'Категория', holidayType:'Тип отдыха', amenities:'Удобства', rating:'Оценка',
      beachDist:'До пляжа', board:'Питание', anyRating:'Любая', from9:'от 9,0', from85:'от 8,5', from8:'от 8,0',
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
      navConcierge:'Concierge',
      navVip:'VIP Ausflüge',
      conciergeTitle:'Dein persönlicher Concierge',
      conciergeRole:'ONLYONE Concierge · Antalya',
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
      heroEyebrow:'Antalya · Mittelmeer', heroScript:'Türkiye',
      heroTitle:'Die schönsten Adressen.',
      heroSub:'Erzähl uns, wie du reist — um alles andere kümmern wir uns.',
      discover:'Unterkünfte entdecken', trust1:'Handverlesene Unterkünfte', trust2:'Persönliche Beratung', trust3:'Individuelle Angebote',
      navHome:'Home', navSearch:'Suche', navMap:'Karte', navFav:'Favoriten', navTrips:'Meine Reise',
      where:'Wohin?', wherePh:'Region auswählen', dates:'Reisezeitraum', datesPh:'Zeitraum wählen',
      guests:'Reisende', searchBtn:'Unterkünfte suchen', recommended:'Empfohlen', all:'Alle',
      experiences:'Erlebnisse',
      vipHead:'Wir machen mehr<br>als nur Reisen',
      vip1:'VIP-Service', vip1t:'Eine Betreuerin führt deine Reise — von der ersten Frage bis zur Heimkehr.',
      vip2:'Geprüfte Adressen', vip2t:'Nur Häuser, die wir selbst kennen. Keine Katalogware.',
      vipX:'Exklusive Erlebnisse', vipXt:'Yachten, Hubschrauber, Gastronomie und private Touren — nach deinem Geschmack.',
      vip3:'Concierge erreichbar', vip3t:'Tisch, Transfer, Arzt — solange du unterwegs bist, sind wir am Telefon.', conciergeName:'Maria Grychko', conciergeMark:'MG',
      flyEyebrow:'Anreise', flyTitle:'Ankommen<br>ohne Umwege',
      flySpecA:'Flug & Transfer', flySpecB:'Rund um die Uhr',
      flyBody:'Flug, privater Transfer ab Antalya und Empfang am Ausgang. Sag uns, von wo du fliegst — den Rest übernimmt deine Betreuerin.',
      flyCta:'Concierge fragen',
      carEyebrow:'Transfer', carTitle:'Der Wagen<br>wartet schon', carWord:'VIP TRANSFER',
      welcomeEyebrow:'Ankunft', welcomeTitle:'VIP-Empfang',
      welcomeBody:'Persönlicher Empfang in Antalya — Namensschild, kurzer Weg, kein Anstehen.',
      yachtEyebrow:'Exklusiv', yachtTitle:'Yacht-Tour',
      yachtBody:'Ein Boot nur für euch — Route, Buchten und Küche nach deinem Wunsch.',
      carSpecA:'Privat & diskret', carSpecB:'Tür zu Tür',
      carBody:'Ein Wagen mit Fahrer holt dich in Antalya ab und bringt dich bis vor die Tür deiner Unterkunft — ohne Warteschlange, ohne Umsteigen.',
      regions:'Regionen', allRegions:'Alle Regionen', hotels:'Unterkünfte', hotel:'Stay',
      filters:'Filter', apply:'Anwenden', reset:'Zurücksetzen', results:'Ergebnisse',
      category:'Kategorie', holidayType:'Urlaubsart', amenities:'Ausstattung', rating:'Bewertung',
      beachDist:'Entfernung Strand', board:'Verpflegung', anyRating:'Alle', from9:'ab 9,0', from85:'ab 8,5', from8:'ab 8,0',
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
      contactUs:'Kontakt', contactTxt:'Unser Team in Antalya meldet sich noch am selben Tag.',
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
      navConcierge:'Concierge',
      navVip:'VIP excursions',
      conciergeTitle:'Your personal concierge',
      conciergeRole:'ONLYONE Concierge · Antalya',
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
      heroEyebrow:'Antalya · Mediterranean', heroScript:'Türkiye',
      heroTitle:'The finest addresses.',
      heroSub:'Tell us how you travel — we take care of the rest.',
      discover:'Discover stays', trust1:'Handpicked stays', trust2:'Personal advice', trust3:'Individual offers',
      navHome:'Home', navSearch:'Search', navMap:'Map', navFav:'Saved', navTrips:'My trip',
      where:'Where to?', wherePh:'Choose a region', dates:'Travel dates', datesPh:'Select dates',
      guests:'Guests', searchBtn:'Search stays', recommended:'Recommended', all:'All',
      experiences:'Experiences',
      vipHead:'We do more<br>than book trips',
      vip1:'VIP service', vip1t:'One person runs your trip — from the first question to your way home.',
      vip2:'Houses we know', vip2t:'Only places we have stayed in ourselves. Nothing off a catalogue.',
      vipX:'Exclusive experiences', vipXt:'Yachts, helicopters, dining and private tours — cut to your taste.',
      vip3:'Concierge on call', vip3t:'A table, a transfer, a doctor — while you travel, we are on the phone.', conciergeName:'Maria Grychko', conciergeMark:'MG',
      flyEyebrow:'Getting there', flyTitle:'Arrive<br>without detours',
      flySpecA:'Flight & transfer', flySpecB:'Around the clock',
      flyBody:'The flight, a private transfer from Antalya and someone waiting at the exit. Tell us where you fly from — your concierge takes care of the rest.',
      flyCta:'Ask the concierge',
      carEyebrow:'Transfer', carTitle:'Your car<br>is waiting', carWord:'VIP TRANSFER',
      welcomeEyebrow:'Arrival', welcomeTitle:'VIP welcome',
      welcomeBody:'Met in person in Antalya — name sign, short walk, no queue.',
      yachtEyebrow:'Exclusive', yachtTitle:'Yacht tour',
      yachtBody:'A boat just for you — route, coves and galley exactly as you like.',
      carSpecA:'Private & discreet', carSpecB:'Door to door',
      carBody:'A car and driver meet you at Antalya and take you to the door of your stay — no queue, no changing over.',
      regions:'Regions', allRegions:'All regions', hotels:'stays', hotel:'Stay',
      filters:'Filters', apply:'Apply', reset:'Reset', results:'results',
      category:'Category', holidayType:'Holiday type', amenities:'Amenities', rating:'Rating',
      beachDist:'Beach distance', board:'Board', anyRating:'Any', from9:'from 9.0', from85:'from 8.5', from8:'from 8.0',
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
      contactUs:'Contact', contactTxt:'Our team in Antalya replies the same day.',
      hotelsIn:'Stays in', selHotels:'selected stays', noResults:'No matches',
      tryReset:'Try adjusting the filters', freeCancel:'Free cancellation', onRequest:'on request',
      onBeach:'on the beach', noPricesNote:'No prices — you will receive an individual offer.',
      noInternalPrices:'No internal purchase prices are stored — a price only comes into existence when an offer is created.',
      transferIncl:'Transfer included...',
    }
  };
  let LANG = 'ru';
  const t = k => (I18N[LANG] && I18N[LANG][k]) || I18N.en[k] || k;

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
  const regionName = id => { const r=REGIONS.find(x=>x.id===id); return r ? (r.name[LANG]||r.name.en) : id; };

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
  const label=(arr,id)=>{const x=arr.find(a=>a.id===id);return x?(x.l[LANG]||x.l.en):id;};

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
    {id:'pamukkale', img:EXC_IMG+'exc-pamukkale.webp', dur:{ru:'1 день',de:'1 Tag',en:'1 day'},
     n:{ru:'Памуккале и Хиераполис',de:'Pamukkale & Hierapolis',en:'Pamukkale & Hierapolis'},
     d:{ru:'Белоснежные травертиновые террасы с термальной водой и античный город над ними.',
        de:'Schneeweiße Kalksinterterrassen mit Thermalwasser und die antike Stadt darüber.',
        en:'Snow-white travertine terraces of thermal water and the ancient city above them.'}},
    {id:'cappadocia', img:EXC_IMG+'exc-cappadocia.webp', dur:{ru:'2 дня',de:'2 Tage',en:'2 days'},
     n:{ru:'Каппадокия',de:'Kappadokien',en:'Cappadocia'},
     d:{ru:'Долины сказочных дымоходов, пещерные церкви и полёт на воздушном шаре на рассвете.',
        de:'Täler voller Feenkamine, Höhlenkirchen und eine Ballonfahrt bei Sonnenaufgang.',
        en:'Valleys of fairy chimneys, cave churches and a balloon flight at sunrise.'}},
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
    {id:'beach', img:EXP_IMG+'exp-beach.webp', go:{type:'beach'},
     n:{ru:'Пляжные курорты',de:'Strandresorts',en:'Beach resorts'},
     s:{ru:'Лара · Белек · Сиде',de:'Lara · Belek · Side',en:'Lara · Belek · Side'}},
    {id:'honeymoon', img:EXP_IMG+'exp-honeymoon.webp', go:{type:'adults'},
     n:{ru:'Медовый месяц',de:'Flitterwochen',en:'Honeymoon'},
     s:{ru:'Только для взрослых, с приватным бассейном',de:'Adults Only, mit privatem Pool',en:'Adults only, with a private pool'}},
    {id:'ancient', img:EXP_IMG+'exp-ancient.webp', go:{exc:'pamukkale'},
     n:{ru:'Античные миры',de:'Antike Welten',en:'Ancient worlds'},
     s:{ru:'Памуккале · Эфес · Сиде',de:'Pamukkale · Ephesos · Side',en:'Pamukkale · Ephesus · Side'}},
    {id:'cappadocia', img:EXP_IMG+'exp-cappadocia.webp', go:{exc:'cappadocia'},
     n:{ru:'Каппадокия',de:'Kappadokien',en:'Cappadocia'},
     s:{ru:'Полёт на шаре над Гёреме',de:'Ballonfahrt über Göreme',en:'Balloon flight over Göreme'}},
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
  const SUPPORTED = ['ru','de','en'];
  function detectLang(){
    var list = [];
    try {
      if (navigator.languages && navigator.languages.length) list = navigator.languages.slice();
      else if (navigator.language) list = [navigator.language];
    } catch (e) {}
    for (var i = 0; i < list.length; i++) {
      var tag = String(list[i] || '').toLowerCase();
      var base = tag.split('-')[0];
      if (SUPPORTED.indexOf(base) > -1) return base;
      // Russian is the working language across much of the post-Soviet region,
      // so those locales get it rather than falling through to English.
      if (['uk','be','kk','ky','uz','az','hy','ka','mo'].indexOf(base) > -1) return 'ru';
      if (['at','ch'].indexOf(base) > -1) return 'de';
    }
    return 'en';
  }

  const DEF={lang:null,favorites:[],requests:[],seq:127,staff:null,pendingExc:[],
             search:{from:'',to:'',adults:2,children:0}};
  let S=load();
  function load(){
    try{const r=JSON.parse(localStorage.getItem(KEY));if(r&&typeof r==='object')return Object.assign({},DEF,r);}catch(e){}
    return JSON.parse(JSON.stringify(DEF));
  }
  function save(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}}
  LANG = S.lang || detectLang();

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
    const loc=LANG==='ru'?'ru-RU':LANG==='de'?'de-DE':'en-GB';
    return `${n.toLocaleString(loc,{minimumFractionDigits:0,maximumFractionDigits:2})} ${c||'EUR'}`;
  }
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
    headset:'<path d="M5 13v-1a7 7 0 0 1 14 0v1"/><path d="M5 13h2.2v4.4H5.6A1.6 1.6 0 0 1 4 15.8V13z"/><path d="M19 13h-2.2v4.4h1.6A1.6 1.6 0 0 0 20 15.8V13z"/><path d="M17.2 17.8v.4a2.4 2.4 0 0 1-2.4 2.4h-1.6"/>',
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
      ${o.back?`<button class="iconBtn" data-act="back" aria-label="${t('back')}">${icon('back')}</button>`:
        `<span class="appbar__mark"></span>`}
      <div class="appbar__brand">${o.title?
        `<span class="appbar__name" style="letter-spacing:.02em;font-size:15px">${esc(o.title)}</span>`:
        `<span class="appbar__name">ONLYONE<small>LUXURY TRAVEL</small></span>`}</div>
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
      + S.requests.filter(r=>(r.messages||[]).some(m=>m.from==='guest'&&!m.read)).length;
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
        <p class="card__desc">${esc(h.desc[LANG]||h.desc.en)}</p>
      </div>
    </article>`;
  }

  function excCard(e){
    return `<article class="card fade-up" data-exc="${e.id}" role="button" tabindex="0">
      <div class="card__media" style="aspect-ratio:16/10">
        <img src="${e.img}" alt="${esc(e.n[LANG]||e.n.en)}" loading="lazy" decoding="async">
      </div>
      <div class="card__body">
        <div class="card__loc" style="color:var(--gold)">${esc(e.dur[LANG]||e.dur.en)}</div>
        <h3 class="card__name">${esc(e.n[LANG]||e.n.en)}</h3>
        <p class="card__desc">${esc(e.d[LANG]||e.d.en)}</p>
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

  /* ====================================================================
     8 · Guest views
     ==================================================================== */
  /* --------------------------------------------------------------------
     Hero slideshow

     Replaces the looping clip. Photographs cost a fraction of a video, decode
     instantly and never sit there paused because a browser refused to autoplay
     — which is most of what went wrong with the hero video.

     The crossfade is a CSS animation rather than a timer, so nothing runs on
     the main thread and the browser stops it on its own when the tab is
     hidden. The keyframes depend on how many photographs there are, so they
     are written once from the list: adding a file to HERO_SLIDES is the whole
     change. The first frame is eager and preloaded; the rest are lazy, because
     nobody sees slide four in the first seconds.
     -------------------------------------------------------------------- */
  const HERO_SLIDES=[
    './images/hero/hero-01.webp',
    './images/hero/hero-02.webp',
    './images/hero/hero-03.webp',
    './images/hero/hero-04.webp',
    './images/hero/hero-05.webp',
    './images/hero/hero-06.webp',
  ];
  const SLIDE_SECONDS=9;          // how long one photograph owns the screen
  const FADE_SECONDS=2.2;         // the handover, on top of the slot above
  const HIDE_GUARD=0.4;           // covered, but held a moment against jitter
  const HIDE_FADE=1.0;            // the retreat itself — happens out of sight
  /* Only the first photograph is in the markup. loading="lazy" did nothing
     here — every slide is absolutely positioned inside the viewport, so the
     browser counts them all as visible and fetched all six at once: 1.7 MB
     before anything else could happen. The rest are attached after the first
     has painted, spaced out so each arrives well before its turn comes round.

     Because they arrive at different moments and animation-delay counts from
     the moment an element joins the document, every delay is worked out
     against one shared origin (heroT0). Without that, each later photograph
     ran a little behind the one before it, and the last one ended up with a
     third of its screen time. */
  let heroT0=0;
  const slideDelay=i=>(i*SLIDE_SECONDS-FADE_SECONDS)-(heroT0?(performance.now()-heroT0)/1000:0);
  function heroSlides(){
    const n=HERO_SLIDES.length;
    if(!n)return '';
    if(n===1)return `<div class="pHero__slides" aria-hidden="true"><img class="pHero__img is-solo" src="${HERO_SLIDES[0]}" alt="" fetchpriority="high"></div>`;
    ensureSlideKeyframes(n);
    heroT0=performance.now();
    // a fresh container each render — the old one's fill does not count
    slidesFilled=false;
    /* The first photograph skips its own fade-in — it starts already opaque.
       There is nothing behind it on the first frame, so fading it up from zero
       is exactly the black moment we are here to remove. */
    return `<div class="pHero__slides" id="heroSlides" aria-hidden="true">
      <img class="pHero__img" src="${HERO_SLIDES[0]}" alt="" fetchpriority="high" decoding="async"
           style="animation-duration:${n*SLIDE_SECONDS}s;animation-delay:${slideDelay(0).toFixed(2)}s">
    </div>`;
  }

  let slidesFilled=false;
  function fillHeroSlides(){
    const box=$('#heroSlides');
    if(!box||slidesFilled)return;
    if(box.children.length>=HERO_SLIDES.length){slidesFilled=true;return;}
    slidesFilled=true;
    const n=HERO_SLIDES.length, total=n*SLIDE_SECONDS;
    HERO_SLIDES.slice(1).forEach((src,k)=>{
      const i=k+1;
      /* Each photograph is fetched a fixed lead time before it is due, rather
         than all of them in the first few seconds. Slide i has its turn at
         i·SLIDE_SECONDS, so asking for it LEAD seconds earlier still leaves a
         wide margin — and it takes the whole set off the moment right after
         the intro, where it was competing with the first screen for the
         connection. Measured: 619 KB of that burst moves out of the first
         three seconds. */
      const LEAD=6;
      const due=Math.max(900, (i*SLIDE_SECONDS-FADE_SECONDS-LEAD)*1000);
      setTimeout(()=>{
        if(!document.body.contains(box))return;
        const img=new Image();
        img.className='pHero__img';
        img.alt='';
        img.decoding='async';
        img.style.animationDuration=total+'s';
        img.style.animationDelay=slideDelay(i).toFixed(2)+'s';
        img.src=src;
        box.appendChild(img);
      }, due);
    });
  }
  let slideKeyframesFor=0;
  function ensureSlideKeyframes(n){
    if(slideKeyframesFor===n)return;
    slideKeyframesFor=n;
    const T=n*SLIDE_SECONDS, pc=s=>(s/T*100);
    const inDone = pc(FADE_SECONDS);                                  // arrived
    const covered= pc(SLIDE_SECONDS+FADE_SECONDS+HIDE_GUARD);         // hidden
    const gone   = pc(SLIDE_SECONDS+FADE_SECONDS+HIDE_GUARD+HIDE_FADE);
    const handOff= pc(SLIDE_SECONDS);                                 // next rises
    const css=`@keyframes heroSlide{
      0%{opacity:0}
      ${inDone.toFixed(3)}%{opacity:1}
      ${covered.toFixed(3)}%{opacity:1}
      ${gone.toFixed(3)}%{opacity:0}
      100%{opacity:0}
    }
    @keyframes heroLift{
      0%{z-index:3}
      ${handOff.toFixed(3)}%{z-index:2}
      ${gone.toFixed(3)}%{z-index:1}
      100%{z-index:1}
    }`;
    let el=document.getElementById('heroSlideKeyframes');
    if(!el){el=document.createElement('style');el.id='heroSlideKeyframes';document.head.appendChild(el);}
    el.textContent=css;
  }

  /* --------------------------------------------------------------------
     Upright clips

     The operator films 9:16 on a phone. A 9:16 frame at phone width is almost
     exactly one screen tall, and that is the point: the footage gets the shape
     it was shot for instead of being letterboxed into a landscape slot.

     One entry per clip. `at` says which section it follows, so adding a clip is
     adding a row here plus its three lines of copy — no new markup.

     Preparing a clip (both lines matter):
       ffmpeg -i <original> -c:v libx264 -profile:v main -crf 24 -preset slow \
              -pix_fmt yuv420p -movflags +faststart -an \
              public/video/<name>.mp4
       ffmpeg -i public/video/<name>.mp4 -vf "select=eq(n\,0)" -frames:v 1 \
              -c:v libwebp -quality 88 public/images/<name>-poster.webp
     -an is not optional: §13 of the brief is that nothing on the site makes a
     sound after the intro, and a stripped track holds that by construction
     rather than by attribute. The poster is frame 0, not a prettier frame
     further in, so the hand-over from still to video has nothing to jump over.

     CRF 24 was measured, not guessed: against the supplied original the three
     candidates came out 1910 KB at 44.7 dB, 1438 KB at 43.4 dB and 1107 KB at
     42.2 dB. 43.4 dB is the same figure the hero photographs were tuned to,
     and the file is lighter than the intro video at the same size and length.
     -------------------------------------------------------------------- */
  const CLIPS=[
    { at:'vip',
      src:'./video/onlyone-vip-welcome-v3.mp4',
      poster:'./images/vip-welcome-poster-v2.webp',
      eyebrow:'welcomeEyebrow', title:'welcomeTitle', body:'welcomeBody' },
    { at:'excursions',
      src:'./video/onlyone-yacht-tour-v2.mp4',
      poster:'./images/yacht-tour-poster.webp',
      eyebrow:'yachtEyebrow', title:'yachtTitle', body:'yachtBody' },
  ];
  function clipBand(at){
    return CLIPS.filter(c=>c.at===at).map(c=>`<section class="clipBand ${c.cls||''}">
      <div class="clipBand__frame">
        ${/* The still is the floor of this section: it is on screen before the
              clip has a frame decoded, it is what a reader with data saving on
              sees, and it is what stays if the video ever fails to load. */''}
        <img class="clipBand__still" src="${c.poster}" alt="" loading="lazy" decoding="async"
             width="720" height="1280">
        ${bgVideo(c.src, c.poster, 'clipBand__vid')}
        <span class="clipBand__scrim" aria-hidden="true"></span>
        <div class="clipBand__panel glassDark">
          <div class="eyebrow">${t(c.eyebrow)}</div>
          <h2 class="clipBand__title">${t(c.title)}</h2>
          <p>${t(c.body)}</p>
        </div>
      </div>
    </section>`).join('');
  }

  function vHome(){
    const top=PUBLIC_HOTELS.slice().sort((a,b)=>b.rating-a.rating).slice(0,6);
    return `${appbar({})}
    <section class="pHero">
      ${heroSlides()}
      <div class="pHero__scrim"></div>
      <div class="pHero__glassLayer" aria-hidden="true"></div>
      <span class="pHero__script" aria-hidden="true">${t('heroScript')}</span>
      ${/* Title and subtitle, nothing else. The trust list and the button were
            three more blocks competing with the photograph on the one screen
            that should simply be an image and a promise — the same three
            points are made properly further down, with room to breathe. */''}
      <div class="pHero__body">
        <h1 class="pHero__title">${t('heroTitle')}</h1>
        <p class="pHero__sub">${t('heroSub')}</p>
      </div>
    </section>
    <div class="wrap">
      <section class="vipList">
        <h2 class="vipList__head">${t('vipHead')}</h2>
        <span class="vipList__rule" aria-hidden="true"></span>
        ${[['diamond','vip1','vip1t'],['keyhouse','vip2','vip2t'],['yacht','vipX','vipXt'],['headset','vip3','vip3t']]
          .map(([ic,k,d])=>`<div class="vipItem">
            <span class="vipItem__ic">${icon(ic)}</span>
            <div><b>${t(k)}</b><p>${t(d)}</p></div>
          </div>`).join('')}
      </section>
    </div>

    ${clipBand('vip')}

    <div class="wrap">
      <div class="section">
        <div class="section__head"><h2 class="h-lg">${t('regions')}</h2></div>
        <div class="rail">
          ${REGIONS.map(r=>`<button class="regionCard" data-region="${r.id}">
            <img src="${r.img}" alt="${esc(r.name[LANG]||r.name.en)}" loading="lazy">
            <span class="regionCard__ov"></span>
            <span class="regionCard__txt"><b>${esc(r.name[LANG]||r.name.en)}</b>
            <span>${PUBLIC_HOTELS.filter(h=>h.region===r.id).length} ${t('hotels')}</span></span>
          </button>`).join('')}
        </div>
      </div>
      <div class="section">
        <div class="section__head"><div><div class="eyebrow">${t('excSub')}</div>
          <h2 class="h-lg" style="margin-top:4px">${t('excursions')}</h2></div>
          <button class="tiny muted" data-go="excursions" style="font-weight:600">${t('all')}</button></div>
        <div class="rail">
          ${EXCURSIONS.map(e=>`<button class="regionCard" style="width:190px;aspect-ratio:16/11" data-exc="${e.id}">
            <img src="${e.img}" alt="${esc(e.n[LANG]||e.n.en)}" loading="lazy">
            <span class="regionCard__ov"></span>
            <span class="regionCard__txt"><b>${esc(e.n[LANG]||e.n.en)}</b>
            <span>${esc(e.dur[LANG]||e.dur.en)}</span></span>
          </button>`).join('')}
        </div>
      </div>
    </div>

    ${clipBand('excursions')}

    <div class="wrap">
      <div class="section">
        <div class="section__head"><h2 class="h-lg">${t('recommended')}</h2>
          <button class="tiny muted" data-go="search" style="font-weight:600">${t('all')}</button></div>
        <div class="cardList">${top.map(hotelCard).join('')}</div>
      </div>
    </div>

    <section class="expBands">
      <h2 class="expBands__head">${t('experiences')}</h2>
      ${EXPERIENCES.map(x=>`<button class="expBand" data-exp="${x.id}">
        ${/* The photograph lives in a wrapper: the wrapper carries the
              scroll parallax, the image inside it carries its own slow drift.
              One transform per element — on the same element the second would
              simply replace the first. A band may also carry `vid`, in which
              case a looping clip plays over the still; armBgVideos() lazy-loads
              it on intersect, so a band nobody scrolls to costs nothing. */''}
        <span class="expBand__zoom"><span class="expBand__ph" style="--pd:${(EXPERIENCES.indexOf(x)%4)*-7}s">
          <img src="${x.img}" alt="" loading="lazy" decoding="async">
          ${x.vid?`<video data-bg="${x.vid}" muted loop playsinline webkit-playsinline
                 preload="none" poster="${x.img}" disablepictureinpicture
                 disableremoteplayback aria-hidden="true"></video>`:''}
        </span></span>
        <span class="expBand__scrim"></span>
        <span class="expBand__txt">
          <b>${esc(x.n[LANG]||x.n.en)}</b>
          <i>${esc(x.s[LANG]||x.s.en)}</i>
        </span>
      </button>`).join('')}
    </section>

    <section class="flyBand carBand">
      <div class="flyBand__head">
        ${/* The saloon is gone; the lettering is the object now. Split into
              single glyphs so each can arrive on its own beat and the warm
              light can travel along the word — one span per letter is the only
              way to give them separate clocks. The word is spelled out for
              screen readers on the heading itself, and the pieces are hidden
              from them, so it is still read once, as a word. */''}
        ${(()=>{ const w=t('carWord'); let i=0;
          /* Grouped by word, and each group refuses to break. A flat row of
             glyphs wraps between any two of them: in Russian the line came out
             as ТРАНСФЕ / Р. */
          const words=w.split(/\s+/).filter(Boolean).map(word=>
            `<span class="vipWord__w">${[...word].map(ch=>
              `<i style="--i:${i++}" aria-hidden="true">${esc(ch)}</i>`).join('')}</span>`).join('');
          return `<h2 class="vipWord" aria-label="${esc(w)}">${words}</h2>`; })()}
        <p class="carBand__line">${t('carTitle').replace(/<br\s*\/?>/g,' ')}</p>
      </div>
      <div class="flyBand__card">
        <div class="flyBand__spec"><span>${t('carSpecA')}</span><span>${t('carSpecB')}</span></div>
        <p>${t('carBody')}</p>
        <button class="btn btn--primary btn--sm" data-go="concierge">${t('flyCta')}</button>
      </div>
    </section>

    <section class="flyBand">
      <div class="flyBand__head">
        <div class="eyebrow">${t('flyEyebrow')}</div>
        <h2 class="flyBand__title">${t('flyTitle')}</h2>
      </div>
      <div class="flyBand__plane" aria-hidden="true">
        ${/* Slipstream. The aircraft itself stays level and still, so the sense
              of speed has to come from what it leaves behind. Each line starts
              at the trailing edge of the wing at its own x — further out is
              further back, because the wing is swept — and streams away
              downwards. Staggered lengths and delays keep it from pulsing in
              unison. */''}
        <span class="flyTrail">
          ${[[15,63],[24,59],[33,55],[42,52],[58,52],[67,55],[76,59],[85,63]]
            .map(([x,y],i)=>`<i style="left:${x}%;top:${y}%;--d:${(i%4)*0.55+(i>3?0.28:0)}s;--t:${2.4+(i%3)*0.35}s;--h:${16+(i%3)*7}%"></i>`).join('')}
        </span>
        <img src="./images/3d/plane-top.webp" alt="" loading="lazy" decoding="async" width="900" height="1111">
      </div>
      <div class="flyTicker" aria-hidden="true">
        ${(()=>{ const half=[...REGIONS.map(r=>r.name[LANG]||r.name.en),
                             ...EXCURSIONS.map(e=>e.n[LANG]||e.n.en)]
                   .map(n=>`<span>${esc(n)}</span><i>✦</i>`).join('');
                 return `<div class="flyTicker__row"><div class="flyTicker__half">${half}</div><div class="flyTicker__half">${half}</div></div>`; })()}
      </div>
      <div class="flyBand__card">
        <div class="flyBand__spec"><span>${t('flySpecA')}</span><span>${t('flySpecB')}</span></div>
        <p>${t('flyBody')}</p>
        <button class="btn btn--primary btn--sm" data-go="concierge">${t('flyCta')}</button>
      </div>
    </section>

    <div class="pageBottom"></div>
    ${tabbar('home')}`;
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
          ${REGIONS.map(r=>`<button class="chip${FILTER.region===r.id?' is-on':''}" data-fregion="${r.id}">${esc(r.name[LANG]||r.name.en)}</button>`).join('')}
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
      <p class="muted" style="font-size:13.5px;line-height:1.6;margin:9px 0 0">${esc(h.desc[LANG]||h.desc.en)}</p></section>

    <section class="detailSec"><h3 class="h-md" style="margin-bottom:13px">${t('amenities')}</h3>
      <div class="amen">${h.amen.map(a=>`<div>${icon('check')}<span>${esc(label(AMEN,a))}</span></div>`).join('')}</div>
      <div class="kv" style="margin-top:16px"><span class="muted">${t('board')}</span><b>${esc(label(BOARDS,h.board))}</b></div>
      <div class="kv"><span class="muted">${t('beachDist')}</span><b>${h.beach===0?t('onBeach'):h.beach+' m'}</b></div>
    </section>

    <section class="detailSec"><h3 class="h-md">${t('rooms')}</h3>
      ${h.rooms.map(r=>`<div class="roomCard">
        <h4>${esc(r.n[LANG]||r.n.en)}</h4>
        <div class="muted tiny" style="margin-top:5px">${r.ad} ${t('persons')} · ${esc(r.bed[LANG]||r.bed.en)} · ${r.sz} ${t('sqm')}</div>
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
          <span><b style="font-weight:600">${esc(r.n[LANG]||r.n.en)}</b><br>
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
          <span>${esc(e.n[LANG]||e.n.en)}<span class="muted tiny"> · ${esc(e.dur[LANG]||e.dur.en)}</span></span></button>`).join('')}
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
        <div class="kv"><span class="muted">${t('roomReq')}</span><b>${room?esc(room.n[LANG]||room.n.en):t('notSure')}</b></div>
        ${W.wishes.length?`<div class="kv"><span class="muted">${t('custWishes')}</span><b>${W.wishes.map(k=>t((WISHKEYS.find(w=>w[0]===k)||[,''])[1])).join('<br>')}</b></div>`:''}
        ${W.excursions.length?`<div class="kv"><span class="muted">${t('excursions')}</span><b>${W.excursions.map(id=>{const e=excursion(id);return esc(e?(e.n[LANG]||e.n.en):id);}).join('<br>')}</b></div>`:''}
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
        <div class="msg__m">${mine?'':esc(who)+' · '}${new Date(m.at).toLocaleString(LANG==='ru'?'ru-RU':LANG==='de'?'de-DE':'en-GB',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>
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
        ${h?`<div class="tl__d">${new Date(h.at).toLocaleString(LANG==='ru'?'ru-RU':LANG==='de'?'de-DE':'en-GB')}</div>`:''}</div></div>`;
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
        const h=hotel(r.hotelId);
        return `<div class="listCard fade-up">
          <div class="listCard__h">
            <div style="min-width:0">
              <b style="font-size:15.5px">${esc(h.name)}</b>
              <div class="muted tiny" style="margin-top:4px">${fmtDate(r.from)} – ${fmtDate(r.to)} · ${r.adults} ${t('adultsShort')}</div>
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

  function vTrip(id){
    const r=request(id);if(!r)return vTrips();
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
          <div class="kv"><span class="muted">${t('roomReq')}</span><b>${room?esc(room.n[LANG]||room.n.en):t('notSure')}</b></div>
        </div>
      </div>

      ${showOffer?`
      <div class="priceBox fade-up">
        <div class="lbl">${t('yourOffer')}</div>
        <div style="margin-top:12px;font-size:14px;opacity:.9">${esc(h.name)}${room?` · ${esc(room.n[LANG]||room.n.en)}`:''}</div>
        <div style="font-size:12.5px;opacity:.75;margin-top:4px">${fmtDate(r.from)} – ${fmtDate(r.to)} · ${nights(r.from,r.to)} ${t('nights')}</div>
        <div style="margin-top:16px" class="lbl">${t('total')}</div>
        <div class="amt">${money(r.offer.price,r.offer.currency)}</div>
        ${r.offer.validUntil?`<div style="font-size:11.5px;opacity:.72;margin-top:8px">${t('validUntil')} ${fmtDate(r.offer.validUntil)}</div>`:''}
        ${r.offer.custInfo?`<div style="font-size:12.5px;opacity:.86;margin-top:12px;line-height:1.5">${esc(r.offer.custInfo)}</div>`:''}
      </div>
      ${r.status==='offer'?`<div class="btnRow" style="margin-top:12px">
        <button class="btn btn--ghost" data-act="ask">${t('askBack')}</button>
        <button class="btn btn--primary" data-act="accept" data-id="${r.id}">${t('acceptOffer')}</button></div>`:''}
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
          <b>${esc(x.n[LANG]||x.n.en)}</b>
          <i>${esc(x.s[LANG]||x.s.en)}</i>
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
              fill="#3A2E1E" stroke="rgba(240,215,135,.30)" stroke-width=".5" vector-effect="non-scaling-stroke"/>
        <path d="M0 62 C 14 54, 24 46, 38 40 C 52 34, 64 28, 78 22 C 86 18, 94 14, 100 11"
              fill="none" stroke="rgba(240,215,135,.58)" stroke-width="1" vector-effect="non-scaling-stroke"/>
        ${[0,1,2,3,4,5,6,7,8].map(i=>`<path d="M${4+i*11} ${74+((i%3)*5)} q 5 -3 10 0" fill="none" stroke="rgba(87,198,212,.20)" stroke-width=".6" vector-effect="non-scaling-stroke"/>`).join('')}
      </svg>
      ${REGIONS.map(r=>`<button class="pin" style="left:${r.x}%;top:${r.y}%" data-mregion="${r.id}">
        <span class="pin__b">${esc(r.name[LANG]||r.name.en)}<b>${PUBLIC_HOTELS.filter(h=>h.region===r.id).length}</b></span>
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
    const h=hotel(r.hotelId);
    return `<div class="listCard fade-up">
      <div class="listCard__h">
        <div style="min-width:0">
          <div class="muted mini">${r.code}</div>
          <b style="font-size:15px;display:block;margin-top:3px">${esc(r.contact.first||'—')} ${esc(r.contact.last||'')}</b>
          <div class="muted tiny" style="margin-top:3px">${esc(h.name)}</div>
          <div class="muted tiny">${fmtDate(r.from)} – ${fmtDate(r.to)} · ${r.adults} ${t('adultsShort')}</div>
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
    if(r.status==='payopen')
      return `<div class="listCard" style="margin-top:0">
        <div style="display:flex;align-items:center;gap:9px;color:var(--ok)">${icon('check')}<b style="font-size:13.5px">${t('payLinkDone')}</b></div>
        <div class="muted mini" style="margin-top:8px;word-break:break-all">${esc(r.payment.link)}</div>
        <div class="btnRow" style="margin-top:11px">
          <button class="btn btn--ghost btn--sm" data-act="copy" data-id="${r.id}">${t('copyLink')}</button>
          <button class="btn btn--ghost btn--sm" data-act="notify">${t('sendWa')}</button></div></div>`;
    if(r.status==='paid')
      return `<button class="btn btn--primary" data-act="confirm-hotel" data-id="${r.id}">${t('confirmHotel')}</button>`;
    return `<div class="listCard" style="margin-top:0;display:flex;gap:10px;align-items:center;background:rgba(40,168,121,.10)">
      <span style="color:var(--ok)">${icon('check')}</span><b style="font-size:13.5px;color:var(--ok)">${t('tripConfirmed')}</b></div>`;
  }
  function vStaffReq(id){
    const r=request(id);if(!r)return vStaffReqs();
    markRead(r,'staff');
    const h=hotel(r.hotelId);
    const room=r.roomId?h.rooms.find(x=>x.id===r.roomId):null;
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
      <div class="listCard">
        <div class="muted mini" style="letter-spacing:.12em;text-transform:uppercase">${t('hotel')}</div>
        <div class="kv" style="margin-top:8px"><span class="muted">${t('hotel')}</span><b>${esc(h.name)}</b></div>
        <div class="kv"><span class="muted">${t('regions')}</span><b>${esc(regionName(h.region))}</b></div>
        <div class="kv"><span class="muted">${t('period')}</span><b>${fmtDate(r.from)} – ${fmtDate(r.to)}<br>
          <span class="muted tiny">${nights(r.from,r.to)} ${t('nights')}</span></b></div>
        <div class="kv"><span class="muted">${t('guests')}</span><b>${r.adults} ${t('adultsShort')}${r.children?` · ${r.children} ${t('childrenShort')}${r.childAges.length?' ('+r.childAges.join(', ')+')':''}`:''}</b></div>
        <div class="kv"><span class="muted">${t('roomReq')}</span><b>${room?esc(room.n[LANG]||room.n.en):t('notSure')}</b></div>
      </div>
      ${(r.excursions&&r.excursions.length)?`<div class="listCard">
        <div class="muted mini" style="letter-spacing:.12em;text-transform:uppercase">${t('excursions')}</div>
        <div class="badges" style="margin-top:9px">${r.excursions.map(id=>{const e=excursion(id);
          return `<span class="badge badge--gold">${esc(e?(e.n[LANG]||e.n.en):id)}</span>`;}).join('')}</div></div>`:''}
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
      <div class="listCard">${statusTimeline(r)}</div>
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
      map[k].last=hotel(r.hotelId);
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
        ${REGIONS.map(r=>`<div class="kv"><span>${esc(r.name[LANG]||r.name.en)}</span><b>${PUBLIC_HOTELS.filter(h=>h.region===r.id).length}</b></div>`).join('')}
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
    return `<video class="bgVideo ${cls||''}" muted loop playsinline webkit-playsinline
      preload="none" poster="${poster}" data-bg="${src}"
      disablepictureinpicture disableremoteplayback aria-hidden="true"></video>`;
  }
  let bgObserver = null;
  function armBgVideos(){
    if (bgObserver) { bgObserver.disconnect(); bgObserver = null; }
    const vids = $$('[data-bg]');
    if (!vids.length) return;
    if (!('IntersectionObserver' in window)) return;
    bgObserver = new IntersectionObserver(entries => {
      entries.forEach(e => {
        const v = e.target;
        if (e.isIntersecting) {
          if (!v.dataset.loaded) {
            const s = document.createElement('source');
            s.src = v.dataset.bg; s.type = 'video/mp4';
            v.appendChild(s);
            v.preload = 'auto';
            v.dataset.loaded = '1';
            try { v.load(); } catch (err) {}
          }
          const pr = v.play();
          if (pr && pr.catch) pr.catch(() => {});
        } else {
          try { v.pause(); } catch (err) {}
        }
      });
    }, { root: $('#app'), threshold: 0.15 });
    vids.forEach(v => bgObserver.observe(v));
  }

  /* Reveal on scroll. One observer for the whole view, each element released
     once and then forgotten — an element that has arrived never needs watching
     again, and unobserving keeps the callback cheap on long pages.

     The stagger is per group, not per page: cards in one list follow each
     other, but a list further down does not inherit a two-second delay from
     everything above it. */
  const REVEAL_SEL = [
    '.section__head', '.cardList > .card', '.rail > *', '.expBand',
    '.expBands__head', '.flyBand__head', '.flyBand__card', '.listCard',
    '.statRow', '.doList', '.person', '.searchCard', '.tl',
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
    $$('.reveal', root).forEach(el=>triggers.add(el.closest('.rail') || el));
    triggers.forEach(t=>revealObserver.observe(t));
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
    const bands=$$('.flyBand');
    /* Everything that answers to its own position on screen. --s is signed
       (-1 arriving at the bottom, +1 leaving at the top) and drives the
       parallax; --z is how close to the middle it is (0 at either edge, 1 dead
       centre) and drives the zoom. Two properties because a parallax wants a
       direction and a zoom does not. */
    const strips=$$('.expBand,.vipList');
    if(!bands.length && !strips.length) return;
    const scroller=$('#app'); if(!scroller) return;
    let raf=0;
    const update=()=>{
      raf=0;
      const vh=window.innerHeight||1;
      bands.forEach(band=>{
      const r=band.getBoundingClientRect();
      /* 0 as the band's top reaches the bottom of the screen, 1 once its
         bottom has left the top. */
      const span=vh+r.height;
      let p=(vh-r.top)/span;
      /* The band is the last thing on the page, so the reader runs out of
         scroll long before that full pass completes — measured, it stopped at
         0.507 and the aircraft finished half its arc. Normalising against the
         progress actually reachable at maximum scroll gives back the whole
         movement, and costs nothing when the band is not last (pMax is then 1). */
      const maxScroll=Math.max(0,scroller.scrollHeight-scroller.clientHeight);
      const topAtEnd=(band.offsetTop-maxScroll);
      const pMax=Math.min(1,Math.max(0.001,(vh-topAtEnd)/span));
      p=Math.min(1,Math.max(0,p/pMax));
      band.style.setProperty('--p',p.toFixed(4));
      });
      /* Same pass, same frame: the banner photographs drift against their
         frames. -1 as a band enters at the bottom, +1 as it leaves at the top.
         Off-screen bands are skipped so the cost stays with what is visible. */
      strips.forEach(el=>{
        const r=el.getBoundingClientRect();
        if(r.bottom<-40||r.top>vh+40) return;
        const c=Math.max(-1,Math.min(1,(r.top+r.height/2-vh/2)/((vh+r.height)/2)));
        el.style.setProperty('--s',c.toFixed(3));
        el.style.setProperty('--z',(1-Math.abs(c)).toFixed(3));
      });
    };
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches){
      bands.forEach(b=>b.style.setProperty('--p','0.5'));   /* parked, no motion */
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
      case 'search':    html=vSearch();break;
      case 'hotel':     html=vHotel(VIEW.param);break;
      case 'wizard':    html=vWizard();break;
      case 'sent':      html=vSent(VIEW.param);break;
      case 'trips':     html=vTrips();break;
      case 'trip':      html=vTrip(VIEW.param);break;
      case 'favorites': html=vFavorites();break;
      case 'map':       html=vMap();break;
      case 'excursions':html=vExcursions();break;
      case 'concierge': html=vConcierge();break;
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
    document.documentElement.lang=LANG;
    if(VIEW.name==='hotel')bindGallery();
    armBgVideos();
    armFlyBand();
    armAppbar();
    armReveals();
    if(VIEW.name==='home')fillHeroSlides(); else slidesFilled=false;
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
        <span class="check__box">${icon('check')}</span><span><b style="font-weight:600">${esc(r.name[LANG]||r.name.en)}</b><br>
        <span class="muted tiny">${esc(r.tag[LANG]||r.tag.en)} · ${PUBLIC_HOTELS.filter(h=>h.region===r.id).length} ${t('hotels')}</span></span></button>`).join('')}
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
        `<button class="chip${sel.indexOf(i.id)>-1?' is-on':''}" data-${attr}="${i.id}">${esc(i.l[LANG]||i.l.en)}</button>`).join('')}</div></div>`;
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
          <button class="chip${FILTER.beach===150?' is-on':''}" data-fbeach="150">≤ 150 m</button>
          <button class="chip${FILTER.beach===400?' is-on':''}" data-fbeach="400">≤ 400 m</button></div></div>`;
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
    const items=[['discover','search','search'],['regions','pin','search'],
                 ['navVip','star','excursions'],['map','map','map'],
                 ['myFav','heart','favorites'],['myTrips','trip','trips'],
                 ['mContact','phone','contact']];
    openSheet(`<div class="sheet__head"><h3 class="h-lg">${t('menu')}</h3>
      <button class="iconBtn" data-sheet-close>${icon('close')}</button></div>
    <div class="sheet__body">
      <div>${items.map(([k,ic,v])=>
        `<button class="menuItem" data-mgo="${v}">${icon(ic)}<span>${t(k)}</span><span class="chev">${icon('chev')}</span></button>`).join('')}
        <button class="menuItem" data-mgo="intro">${icon('play')}<span>${t('mIntro')}</span><span class="chev">${icon('chev')}</span></button></div>
      <div class="field"><label class="label">${t('mLang')}</label>
        <div class="langRow">${['ru','de','en'].map(l=>`<button class="chip${LANG===l?' is-on':''}" data-lang="${l}">${l.toUpperCase()}</button>`).join('')}</div></div>
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
  function sheetCompare(){
    const list=S.favorites.map(hotel).filter(Boolean);
    const rows=[
      [t('regions'),h=>regionName(h.region)],
      [t('rating'),h=>fmtNum(h.rating)],
      [t('category'),h=>stars(h.stars)],
      [t('beachDist'),h=>h.beach===0?'0 m':h.beach+' m'],
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
    openSheet(`<div class="sheet__head"><h3 class="h-lg">${esc(r.name[LANG]||r.name.en)}</h3>
      <button class="iconBtn" data-sheet-close>${icon('close')}</button></div>
    <div class="sheet__body">
      <div style="border-radius:16px;overflow:hidden;aspect-ratio:16/9"><img src="${r.img}" alt="" style="width:100%;height:100%;object-fit:cover"></div>
      <p class="muted" style="font-size:13.5px;margin-top:12px">${esc(r.tag[LANG]||r.tag.en)}</p>
      <p style="font-size:14px;font-weight:600;margin:8px 0 0">${n} ${t('selHotels')}</p>
      <div style="margin-top:14px"><button class="btn btn--primary" data-act="region-go" data-id="${id}">${t('hotelsIn')} ${esc(r.name[LANG]||r.name.en)}</button></div>
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
          <select class="input" id="oRoom">${h.rooms.map(x=>`<option value="${x.id}"${r.roomId===x.id?' selected':''}>${esc(x.n[LANG]||x.n.en)}</option>`).join('')}</select></div>
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
    openSheet(`<div class="sheet__head"><h3 class="h-lg">${esc(e.n[LANG]||e.n.en)}</h3>
      <button class="iconBtn" data-sheet-close>${icon('close')}</button></div>
    <div class="sheet__body">
      <div style="border-radius:16px;overflow:hidden;aspect-ratio:16/10">
        <img src="${e.img}" alt="" style="width:100%;height:100%;object-fit:cover"></div>
      <div class="kv" style="margin-top:12px"><span class="muted">${t('duration')}</span><b>${esc(e.dur[LANG]||e.dur.en)}</b></div>
      <p class="muted" style="font-size:13.5px;line-height:1.6;margin-top:12px">${esc(e.d[LANG]||e.d.en)}</p>
      <div class="noteBox">${t('excNote')}</div>
    </div>
    <div class="sheet__foot"><button class="btn btn--primary" data-act="exc-add" data-id="${id}">${t('addToReq')}</button></div>`);
  }
  function sheetPay(id){
    const r=request(id);
    openSheet(`<div class="sheet__head"><h3 class="h-lg">${t('demoPay')}</h3>
      <button class="iconBtn" data-sheet-close>${icon('close')}</button></div>
    <div class="sheet__body">
      <div class="priceBox" style="margin-top:0"><div class="lbl">${t('total')}</div>
        <div class="amt">${money(r.offer.price,r.offer.currency)}</div></div>
      <div class="listCard" style="display:flex;align-items:center;gap:11px">
        <span style="color:var(--turq-600)">${icon('lock')}</span>
        <div><b style="font-size:13.5px;display:block">Ziraat Bank · Linkle Ödeme</b>
        <span class="muted mini">${t('payDemoNote')}</span></div></div>
      <div class="field"><label class="label">${t('cardNo')}</label>
        <input class="input" inputmode="numeric" value="4111 1111 1111 1111"></div>
      <div class="grid2"><div class="field"><label class="label">MM/YY</label><input class="input" value="12/29"></div>
        <div class="field"><label class="label">CVV</label><input class="input" value="123"></div></div>
    </div>
    <div class="sheet__foot"><button class="btn btn--primary" data-act="pay-do" data-id="${id}">${t('payNowBtn')}</button></div>`);
  }

  /* ====================================================================
     12 · Events
     ==================================================================== */
  document.addEventListener('click',e=>{
    const T=e.target;
    if(T.closest('[data-sheet-close]')){closeSheet();return;}

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
    const rg=T.closest('[data-region]');
    if(rg){FILTER.region=rg.dataset.region;go('search');return;}
    const xp=T.closest('[data-exp]');
    if(xp){
      const x=EXPERIENCES.find(e=>e.id===xp.dataset.exp);
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
    const lg=T.closest('[data-lang]');
    if(lg){LANG=lg.dataset.lang;S.lang=LANG;save();closeSheet();setTimeout(render,260);return;}

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
    if(ex){sheetExcursion(ex.dataset.exc);return;}
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
      case 'back': back();break;
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
      case 'pay-do': {
        const r=request(id);
        r.payment.status='paid';r.payment.paidAt=Date.now();
        setStatus(r,'paid');
        closeSheet();setTimeout(()=>{render();toast(t('paidOk'));},280);break;
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
      case 'confirm-hotel': setStatus(request(id),'confirmed');render();toast(t('hotelConfirmed'));break;
    }
  });

  /* ====================================================================
     13 · Public API for the intro
     ==================================================================== */
  window.ONLYONE = window.ONLYONE || {};
  window.ONLYONE.boot = function(){
    if(!VIEW.name)VIEW={name:'home',param:null};
    render();
    initHistory();
  };
  window.ONLYONE.resetToHome = function(){
    STACK.length=0;VIEW={name:'home',param:null};render();
    initHistory();
  };
})();
