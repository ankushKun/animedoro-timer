/* Animedoro timer. One component, used on the home page and on /timer/.
   No dependencies. State and stats live in localStorage under the same keys
   the 2021 version used, so nobody loses their session counts.

   Rendering is split in two: render() runs on state changes and touches
   everything, renderFrame() runs on the 250ms tick and only moves the
   clock, the ring, the bar and the tab title. Every DOM write is guarded
   so an unchanged value never invalidates style or layout. */
(function () {
  "use strict";

  var root = document.querySelector("[data-animedoro]");
  if (!root) return;
  var W = window.Animedoro || { toast: function () {}, confetti: function () {} };

  // Base URL of the app (for the sound file and notification icon), derived
  // from this script's own address so it works at any path.
  var scriptEl = document.currentScript || document.querySelector('script[src*="timer.js"]');
  var BASE = scriptEl ? scriptEl.src.replace(/assets\/js\/timer\.js.*$/, "") : "./";

  var PRESETS = [
    { work: 40, anime: 20 },
    { work: 50, anime: 20 },
    { work: 60, anime: 20 },
    { work: 52, anime: 17 }
  ];
  var MIN_MINUTES = 1, MAX_MINUTES = 180;
  var TICK_MS = 250;
  var RING_LEN = 2 * Math.PI * 92; // r=92 in the SVG
  var ROUNDS_GOAL = 4;

  // ---- storage ---------------------------------------------------------
  function get(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function num(k, d) { var n = parseInt(get(k, d), 10); return isNaN(n) ? d : n; }
  function getJSON(k, d) { try { var v = JSON.parse(get(k, "null")); return v === null ? d : v; } catch (e) { return d; } }
  function setJSON(k, v) { set(k, JSON.stringify(v)); }
  function clampMin(n, d) { n = parseInt(n, 10); if (isNaN(n)) return d; return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, n)); }

  var settings = {
    work: clampMin(get("workTime", 40), 40),
    anime: clampMin(get("animeTime", 20), 20),
    sound: get("ad.sound", "1") === "1",
    notify: get("ad.notify", "1") === "1",
    autostart: get("ad.autostart", "0") === "1",
    cat: get("ad.cat", "1") === "1",
    lite: get("ad.lite", "0") === "1"
  };
  function saveSettings() {
    set("workTime", settings.work); set("animeTime", settings.anime);
    set("ad.sound", settings.sound ? "1" : "0");
    set("ad.notify", settings.notify ? "1" : "0");
    set("ad.autostart", settings.autostart ? "1" : "0");
    set("ad.cat", settings.cat ? "1" : "0");
    set("ad.lite", settings.lite ? "1" : "0");
  }
  function applyCat() { document.body.classList.toggle("no-cat", !settings.cat); }
  function applyLite() {
    document.body.classList.toggle("lite", settings.lite);
    try { document.dispatchEvent(new CustomEvent("animedoro:lite", { detail: settings.lite })); } catch (e) {}
  }

  // Today's rounds and minutes, and the day streak. Local only.
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function today() {
    var t = getJSON("ad.today", null), k = dayKey();
    if (!t || t.date !== k) t = { date: k, rounds: 0, study: 0, anime: 0 };
    return t;
  }
  function saveToday(t) { setJSON("ad.today", t); }
  function streak() { return getJSON("ad.streak", { last: "", n: 0 }); }
  function bumpStreak() {
    var s = streak(), k = dayKey();
    if (s.last === k) return s;
    var y = new Date(); y.setDate(y.getDate() - 1);
    s.n = s.last === dayKey(y) ? s.n + 1 : 1;
    s.last = k; setJSON("ad.streak", s);
    return s;
  }

  // ---- state -----------------------------------------------------------
  // status: idle | running | paused | ready  (ready = a block just ended,
  // the next one is lined up and waits for Start)
  var state = { status: "idle", phase: "work", endTime: 0, remaining: 0, total: 0 };
  var timer = null, wakeLock = null, originalTitle = document.title;

  function saveRun() {
    if (state.status === "idle") { del("ad.run"); return; }
    set("ad.run", JSON.stringify({ status: state.status, phase: state.phase, endTime: state.endTime, remaining: state.remaining, total: state.total }));
  }
  function restoreRun() {
    var raw = get("ad.run", null); if (!raw) return;
    try {
      var r = JSON.parse(raw);
      if (!r || !r.phase) return;
      state.phase = r.phase; state.total = r.total || minutesFor(r.phase) * 60000;
      if (r.status === "running") {
        if (r.endTime > Date.now()) { state.status = "running"; state.endTime = r.endTime; startTicking(); }
        else { state.status = "running"; state.endTime = r.endTime; finishBlock(true); }
      } else if (r.status === "paused") {
        state.status = "paused"; state.remaining = r.remaining;
      } else if (r.status === "ready") {
        state.status = "ready";
      }
    } catch (e) { del("ad.run"); }
  }

  // ---- elements and guarded writes ------------------------------------
  function $(sel, scope) { return (scope || document).querySelector(sel); }
  function $$(sel, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(sel)); }
  function setText(e, s) { if (e && e.textContent !== s) e.textContent = s; }
  function setAttr(e, k, v) { if (e && e.getAttribute(k) !== v) e.setAttribute(k, v); }
  function setHidden(e, h) { if (e && e.hidden !== !!h) e.hidden = !!h; }
  function setStyle(e, k, v) { if (e && e.style[k] !== v) e.style[k] = v; }

  var el = {
    phase: $$("[data-phase]"),
    next: $$("[data-next]"),
    nextWrap: $$("[data-next-wrap]"),
    time: $("[data-time]", root),
    sub: $("[data-sub]"),
    ring: $("[data-ring]"),
    glow: null,
    comet: $("[data-comet]"),
    bar: $("[data-bar]"),
    presets: $("[data-presets]"),
    custom: $("[data-custom]"),
    workIn: $("[data-work]"),
    animeIn: $("[data-anime]"),
    rounds: $("[data-rounds]"),
    today: $("[data-today]"),
    greeting: $("[data-greeting]"),
    cats: $$("[data-cat]"),
    phasePick: $$("[data-phase-pick]"),
    stats: $$("[data-stat]"),
    done: $("[data-done]"),
    act: {}
  };
  $$("[data-act]").forEach(function (b) { var k = b.getAttribute("data-act"); (el.act[k] = el.act[k] || []).push(b); });
  $$("[data-opt]").forEach(function (c) {
    var k = c.getAttribute("data-opt");
    c.setAttribute("aria-checked", settings[k] ? "true" : "false");
    c.addEventListener("click", function () {
      settings[k] = c.getAttribute("aria-checked") !== "true";
      c.setAttribute("aria-checked", settings[k] ? "true" : "false");
      saveSettings();
      if (k === "notify" && settings[k]) askNotify();
      if (k === "cat") { applyCat(); W.toast(settings.cat ? "Doro is back." : "Doro went for a walk."); }
      if (k === "lite") { set("ad.lite.manual", "1"); applyLite(); W.toast(settings.lite ? "Effects reduced." : "Effects back on."); }
      if (k === "sound" && settings.sound) beep();
    });
  });
  if (el.ring) {
    // A wide, faint copy of the ring behind it is the glow. Cheaper than a filter.
    el.glow = el.ring.cloneNode(false);
    el.glow.removeAttribute("data-ring"); el.glow.setAttribute("class", "ad-glow");
    el.ring.parentNode.insertBefore(el.glow, el.ring);
    [el.ring, el.glow].forEach(function (c) { c.style.strokeDasharray = RING_LEN; c.style.strokeDashoffset = 0; });
  }
  if (el.comet) { el.comet.style.strokeDasharray = "0.5 " + RING_LEN; el.comet.style.strokeDashoffset = 0; }

  // ---- presets ---------------------------------------------------------
  function minutesFor(phase) { return phase === "anime" ? settings.anime : settings.work; }
  function renderPresets() {
    if (!el.presets) return;
    el.presets.innerHTML = "";
    var matched = false;
    PRESETS.forEach(function (p) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "chip glass-lite";
      b.innerHTML = p.work + '<span class="sep">/</span>' + p.anime;
      b.setAttribute("aria-label", p.work + " minutes work, " + p.anime + " minutes anime");
      var on = p.work === settings.work && p.anime === settings.anime;
      if (on) { b.classList.add("is-on"); b.setAttribute("aria-pressed", "true"); matched = true; }
      else b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () {
        settings.work = p.work; settings.anime = p.anime; saveSettings();
        if (el.custom) el.custom.hidden = true;
        renderPresets(); render();
      });
      el.presets.appendChild(b);
    });
    var c = document.createElement("button");
    c.type = "button"; c.className = "chip glass-lite";
    c.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"></path></svg>Custom';
    c.setAttribute("aria-pressed", matched ? "false" : "true");
    if (!matched) c.classList.add("is-on");
    c.addEventListener("click", function () {
      if (el.custom) { el.custom.hidden = !el.custom.hidden; if (!el.custom.hidden && el.workIn) el.workIn.focus(); else c.blur(); }
    });
    el.presets.appendChild(c);
    if (el.workIn) el.workIn.value = settings.work;
    if (el.animeIn) el.animeIn.value = settings.anime;
    if (el.custom && !matched) el.custom.hidden = false;
  }
  [["workIn", "work"], ["animeIn", "anime"]].forEach(function (pair) {
    var input = el[pair[0]]; if (!input) return;
    input.addEventListener("change", function () {
      settings[pair[1]] = clampMin(input.value, settings[pair[1]]);
      input.value = settings[pair[1]]; saveSettings(); renderPresets(); render();
    });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") input.blur(); });
  });
  el.phasePick.forEach(function (b) {
    b.addEventListener("click", function () {
      b.blur();
      if (state.status === "running" || state.status === "paused") return;
      var p = b.getAttribute("data-phase-pick");
      if (p === state.phase) return;
      state.phase = p; state.status = "idle"; state.total = 0; state.endTime = 0; state.remaining = 0;
      saveRun(); render();
    });
  });

  // ---- rendering -------------------------------------------------------
  function fmt(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + ":" + pad(m) : m) + ":" + pad(sec);
  }
  function fmtMinutes(min) {
    min = parseInt(min, 10) || 0;
    var h = Math.floor(min / 60), m = min % 60;
    return h ? h + "h " + m + "m" : m + "m";
  }
  function clock(ts) { var d = new Date(ts); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function phaseLabel(p) { return p === "anime" ? "anime break" : "work block"; }
  function remainingMs() {
    if (state.status === "running") return Math.max(0, state.endTime - Date.now());
    if (state.status === "paused") return state.remaining;
    return minutesFor(state.phase) * 60000;
  }
  function totalMs() { return (state.status === "idle" || state.status === "ready") ? minutesFor(state.phase) * 60000 : state.total; }
  function show(name, on) { (el.act[name] || []).forEach(function (b) { setHidden(b, !on); }); }
  function setLabel(name, text) { (el.act[name] || []).forEach(function (b) { var s = b.querySelector("[data-label]"); setText(s || b, text); }); }

  // Each digit sits in its own span so a changed digit can drop in.
  function setClock(str) {
    var t = el.time; if (!t) return;
    if (t.getAttribute("data-str") === str) return;
    var kids = t.children;
    if (kids.length !== str.length) {
      t.innerHTML = "";
      for (var i = 0; i < str.length; i++) { var s = document.createElement("span"); s.className = "d"; s.textContent = str[i]; t.appendChild(s); }
      t.setAttribute("data-len", str.length);
    } else {
      for (var j = 0; j < str.length; j++) {
        if (kids[j].textContent !== str[j]) {
          kids[j].textContent = str[j];
          kids[j].classList.remove("tick"); void kids[j].offsetWidth; kids[j].classList.add("tick");
        }
      }
    }
    t.setAttribute("data-str", str);
  }

  function greeting() {
    if (!el.greeting) return;
    var h = new Date().getHours(), t = today(), line;
    if (h < 5) line = "Still up? One round, then bed. Doro insists.";
    else if (h < 12) line = "Good morning. One round before the day gets loud?";
    else if (h < 17) line = "Good afternoon. One round in before dinner?";
    else if (h < 22) line = "Good evening. One round, then an episode?";
    else line = "Late night. One round, then bed. Doro insists.";
    if (t.rounds >= ROUNDS_GOAL) line = t.rounds + " rounds today. Legend. Rest if you need to.";
    else if (t.rounds > 0) line = (t.rounds === 1 ? "One round done today. " : t.rounds + " rounds done today. ") + "Keep it rolling?";
    setText(el.greeting, line);
  }

  // The cheap part: runs four times a second while a block is running.
  function renderFrame() {
    var rem = remainingMs(), total = totalMs();
    var frac = total ? Math.max(0, Math.min(1, rem / total)) : 1;
    setClock(fmt(rem));
    var off = (RING_LEN * (1 - frac)).toFixed(2);
    setStyle(el.ring, "strokeDashoffset", off);
    setStyle(el.glow, "strokeDashoffset", off);
    setStyle(el.comet, "strokeDashoffset", (-RING_LEN * frac).toFixed(2));
    setStyle(el.bar, "width", ((1 - frac) * 100).toFixed(2) + "%");
    var busy = state.status === "running" || state.status === "paused";
    var title = busy ? fmt(rem) + " · " + phaseLabel(state.phase) + " · Animedoro" : originalTitle;
    if (document.title !== title) document.title = title;
  }

  // The full pass: runs when the state changes.
  function render() {
    var busy = state.status === "running" || state.status === "paused";
    setAttr(root, "data-status", state.status);
    setAttr(root, "data-phase-now", state.phase);
    setAttr(document.body, "data-phase-now", state.phase);
    setAttr(document.body, "data-status", state.status);
    el.phase.forEach(function (p) { setText(p, phaseLabel(state.phase)); });
    setStyle(el.comet, "opacity", state.status === "idle" ? "0" : "1");
    if (el.sub) {
      var sub;
      if (state.status === "idle") sub = settings.work + " min work, then one " + settings.anime + " min episode";
      else if (state.status === "running") sub = state.phase === "anime" ? "Enjoy the episode. Doro is napping." : "Deep work. Phone face down.";
      else if (state.status === "paused") sub = "Paused. Doro is waiting.";
      else sub = state.phase === "anime" ? "Work block done. Hit start when you press play." : "Episode over. Back to it.";
      setText(el.sub, sub);
    }
    var nextText = state.status === "running" ? (state.phase === "anime" ? "stop at " : "episode at ") + clock(state.endTime) : "";
    el.next.forEach(function (n) { setText(n, nextText); });
    el.nextWrap.forEach(function (n) { setHidden(n, !nextText); });
    setHidden(el.presets, state.status !== "idle");
    if (el.custom && state.status !== "idle") setHidden(el.custom, true);
    el.phasePick.forEach(function (b) {
      setAttr(b, "aria-pressed", b.getAttribute("data-phase-pick") === state.phase ? "true" : "false");
      if (b.disabled !== busy) b.disabled = busy;
    });

    show("start", state.status === "idle" || state.status === "ready");
    show("pause", state.status === "running");
    show("resume", state.status === "paused");
    show("plus5", busy);
    show("skip", busy);
    show("reset", state.status !== "idle");
    setLabel("start", state.status === "ready" ? (state.phase === "anime" ? "Start anime break" : "Start work") : "Start");
    (el.act.start || []).forEach(function (b) { b.classList.toggle("sakura", state.status === "ready" && state.phase === "anime"); });

    el.cats.forEach(function (c) {
      if (c.closest("[data-done]")) return;
      c.classList.toggle("sleep", state.phase === "anime" && state.status === "running");
      c.classList.toggle("tilt", state.status === "paused");
    });
    renderFrame(); renderStats(); renderToday(); greeting();
  }

  function renderStats() {
    var v = {
      "study-sessions": String(num("studySessions", 0)),
      "anime-sessions": String(num("animeSessions", 0)),
      "study-time": fmtMinutes(num("studySessionCounter", 0)),
      "anime-time": fmtMinutes(num("animeSessionCounter", 0))
    };
    el.stats.forEach(function (e) { var k = e.getAttribute("data-stat"); if (k in v) setText(e, v[k]); });
  }
  function renderToday() {
    var t = today();
    var working = state.phase === "work" && (state.status === "running" || state.status === "paused");
    if (el.rounds) {
      var goal = Math.max(ROUNDS_GOAL, t.rounds + (working ? 1 : 0));
      var sig = goal + ":" + t.rounds + ":" + (working ? 1 : 0);
      if (el.rounds.getAttribute("data-sig") !== sig) {
        el.rounds.innerHTML = "";
        for (var i = 0; i < goal; i++) {
          var d = document.createElement("i");
          if (i < t.rounds) d.className = "done";
          else if (working && i === t.rounds) d.className = "now";
          el.rounds.appendChild(d);
        }
        el.rounds.setAttribute("data-sig", sig);
      }
    }
    if (el.today) {
      var n = t.rounds + (working ? 1 : 0);
      setText(el.today, n === 0 ? "No rounds yet today" : "Round " + n + " today · " + fmtMinutes(t.study) + " studied");
    }
  }

  // ---- running ---------------------------------------------------------
  function startTicking() {
    stopTicking();
    timer = setInterval(tick, TICK_MS);
    requestWakeLock();
  }
  function stopTicking() { if (timer) { clearInterval(timer); timer = null; } releaseWakeLock(); }
  function tick() {
    if (state.status !== "running") return;
    if (Date.now() >= state.endTime) { finishBlock(false); return; }
    if (document.hidden) { // nothing to paint; keep the tab title honest once a second
      var title = fmt(state.endTime - Date.now()) + " · " + phaseLabel(state.phase) + " · Animedoro";
      if (document.title !== title) document.title = title;
      return;
    }
    renderFrame();
  }

  function startBlock() {
    var mins = minutesFor(state.phase);
    state.total = mins * 60000;
    state.endTime = Date.now() + state.total;
    state.status = "running";
    if (settings.notify) askNotify();
    unlockAudio();
    closeDone();
    saveRun(); startTicking(); render();
  }
  function pause() {
    if (state.status !== "running") return;
    state.remaining = Math.max(0, state.endTime - Date.now());
    state.status = "paused"; stopTicking(); saveRun(); render();
  }
  function resume() {
    if (state.status !== "paused") return;
    state.endTime = Date.now() + state.remaining;
    state.status = "running"; saveRun(); startTicking(); render();
  }
  function plus5() {
    if (state.status === "running") { state.endTime += 5 * 60000; state.total += 5 * 60000; }
    else if (state.status === "paused") { state.remaining += 5 * 60000; state.total += 5 * 60000; }
    else return;
    saveRun(); render(); W.toast("Five more minutes.");
  }
  function skip() {
    if (state.status !== "running" && state.status !== "paused") return;
    finishBlock(false, true);
  }
  function reset() {
    stopTicking();
    state.status = "idle"; state.phase = "work"; state.endTime = 0; state.remaining = 0; state.total = 0;
    closeDone();
    saveRun(); render();
  }

  // Record the block, move to the next phase. `silent` = restored after the
  // page was closed, so no sound. `skipped` = minutes counted are what ran.
  function finishBlock(silent, skipped) {
    stopTicking();
    var ranMs = skipped
      ? state.total - (state.status === "paused" ? state.remaining : Math.max(0, state.endTime - Date.now()))
      : state.total;
    var ranMin = Math.max(0, Math.round(ranMs / 60000));
    var t = today();
    if (state.phase === "work") {
      set("studySessions", num("studySessions", 0) + 1);
      set("studySessionCounter", num("studySessionCounter", 0) + ranMin);
      t.rounds += 1; t.study += ranMin; bumpStreak();
    } else {
      set("animeSessions", num("animeSessions", 0) + 1);
      set("animeSessionCounter", num("animeSessionCounter", 0) + ranMin);
      t.anime += ranMin;
    }
    saveToday(t);
    var ended = state.phase;
    state.phase = ended === "work" ? "anime" : "work";
    state.status = "ready"; state.endTime = 0; state.remaining = 0; state.total = minutesFor(state.phase) * 60000;
    if (!silent) {
      if (settings.sound) beep();
      if (settings.notify) {
        if (ended === "work") notify("Work block done", "Go watch one episode. The timer will tell you when it is over.");
        else notify("Episode time is up", "Back to work. Do not click next episode.");
      }
    }
    saveRun(); render();
    if (settings.autostart && !silent) { startBlock(); W.toast(ended === "work" ? "Episode time. Auto-started." : "Back to work. Auto-started."); }
    else if (!silent) openDone(ended, ranMin);
  }

  // ---- block done overlay ---------------------------------------------
  function doneOpen() { return !!(el.done && el.done.classList.contains("is-open")); }
  function openDone(ended, ranMin) {
    if (!el.done) return;
    var t = today(), s = streak();
    var q = function (sel) { return el.done.querySelector(sel); };
    var nextMins = minutesFor(state.phase);
    if (ended === "work") {
      q("[data-done-title]").textContent = "Work block done!";
      q("[data-done-text]").textContent = ranMin + " minutes in the bag. Go watch one episode, Doro will keep time.";
      q("[data-done-label]").textContent = "Start anime break";
      q("[data-done-note]").textContent = nextMins + " min episode · stops at " + clock(Date.now() + nextMins * 60000);
    } else {
      q("[data-done-title]").textContent = "Episode over!";
      q("[data-done-text]").textContent = "That was the one. Back to work, the next block is lined up.";
      q("[data-done-label]").textContent = "Start work";
      q("[data-done-note]").textContent = nextMins + " min of work · next episode at " + clock(Date.now() + nextMins * 60000);
    }
    q("[data-done-start]").classList.toggle("sakura", ended === "work");
    q("[data-done-rounds]").textContent = t.rounds;
    q("[data-done-studied]").textContent = fmtMinutes(t.study);
    q("[data-done-streak]").textContent = s.n || 1;
    var cat = q("[data-done-cat]");
    if (cat) { cat.classList.remove("cheer"); void cat.offsetWidth; cat.classList.add("cheer"); }
    W.confetti(q("[data-confetti]"));
    el.done.classList.add("is-open"); el.done.setAttribute("aria-hidden", "false");
    setTimeout(function () { var b = q("[data-done-start]"); if (b && doneOpen()) b.focus(); }, 350);
  }
  function closeDone() {
    if (!doneOpen()) return;
    el.done.classList.remove("is-open"); el.done.setAttribute("aria-hidden", "true");
    if (document.activeElement && el.done.contains(document.activeElement)) document.activeElement.blur();
  }
  if (el.done) {
    $$("[data-done-start]", el.done).forEach(function (b) { b.addEventListener("click", function () { closeDone(); startBlock(); }); });
    $$("[data-done-close]", el.done).forEach(function (b) { b.addEventListener("click", function () { closeDone(); W.toast(state.phase === "anime" ? "Press start when you hit play." : "Press start when you are ready."); }); });
    el.done.addEventListener("click", function (e) { if (e.target === el.done) closeDone(); });
  }

  // ---- sound and notifications ----------------------------------------
  var audio = null, audioUnlocked = false;
  function getAudio() {
    if (!audio) { audio = new Audio(BASE + "assets/audio/tone.mp3"); audio.preload = "auto"; }
    return audio;
  }
  // Browsers only let audio play after a user gesture; warm it up on Start.
  function unlockAudio() {
    if (audioUnlocked || !settings.sound) return;
    var a = getAudio(); var v = a.volume; a.volume = 0;
    var p = a.play();
    if (p && p.then) p.then(function () { a.pause(); a.currentTime = 0; a.volume = v; audioUnlocked = true; }).catch(function () { a.volume = v; });
    else { a.pause(); a.currentTime = 0; a.volume = v; audioUnlocked = true; }
  }
  function beep() { try { var a = getAudio(); a.currentTime = 0; a.play().catch(function () {}); } catch (e) {} }
  function askNotify() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") Notification.requestPermission().catch(function () {});
  }
  function notify(title, body) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try { new Notification(title, { body: body, icon: BASE + "assets/img/icon-192.png", tag: "animedoro" }); } catch (e) {}
  }

  // Keep the phone screen on while a block runs.
  function requestWakeLock() {
    if (!("wakeLock" in navigator) || wakeLock) return;
    navigator.wakeLock.request("screen").then(function (l) { wakeLock = l; l.addEventListener("release", function () { wakeLock = null; }); }).catch(function () {});
  }
  function releaseWakeLock() { if (wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; } }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      if (state.status === "running") { requestWakeLock(); tick(); }
      else render();
    }
  });

  // ---- wiring ----------------------------------------------------------
  var actions = { start: startBlock, pause: pause, resume: resume, plus5: plus5, skip: skip, reset: reset };
  Object.keys(actions).forEach(function (k) {
    (el.act[k] || []).forEach(function (b) { b.addEventListener("click", function () { actions[k](); b.blur(); }); });
  });
  $$("[data-reset-stats]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (!confirm("Clear your session counts on this device?")) return;
      ["studySessions", "animeSessions", "studySessionCounter", "animeSessionCounter", "ad.today", "ad.streak"].forEach(del);
      renderStats(); renderToday(); greeting(); W.toast("Stats cleared.");
    });
  });

  document.addEventListener("keydown", function (e) {
    var t = e.target; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Escape") { if (doneOpen()) { closeDone(); e.preventDefault(); } return; }
    if (document.body.classList.contains("sheet-open")) return;
    if (e.key === "Enter") return; // a focused button handles Enter itself
    if (e.key === " ") {
      // A focused timer control or dialog button keeps its own Space; any
      // other focused thing (a preset chip, a link) gives way to the timer.
      if (t && t.tagName === "BUTTON" && (t.hasAttribute("data-act") || t.closest("[data-done]"))) return;
      e.preventDefault();
      if (state.status === "running") pause();
      else if (state.status === "paused") resume();
      else startBlock();
    } else if (e.key === "s" || e.key === "S") { skip(); }
    else if (e.key === "r" || e.key === "R") { if (state.status !== "idle") reset(); }
  });

  window.addEventListener("beforeunload", function (e) {
    if (state.status !== "running") return;
    e.preventDefault(); e.returnValue = "";
  });

  document.addEventListener("animedoro:autolite", function () {
    if (settings.lite) return;
    settings.lite = true; saveSettings(); applyLite();
    $$("[data-opt=lite]").forEach(function (c) { c.setAttribute("aria-checked", "true"); });
    W.toast("Frames were dropping, so effects are reduced. Settings has the switch.");
  });
  applyCat();
  applyLite();
  renderPresets();
  restoreRun();
  render();
})();
