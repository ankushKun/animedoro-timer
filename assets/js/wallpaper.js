/* Scenes. 25 animated loops (540p, 24 fps, H.264 only: the one codec every
   browser decodes in hardware) and 21 stills that drift slowly (a Ken Burns
   move the compositor does on the GPU). Two stacked layers crossfade between
   scenes. Loops pause while the tab is hidden or the timer is scrolled out of
   view, and Reduce effects turns them into their posters. The Scenes tab
   lists every scene with a thumbnail and filters; the shuffle button and the
   W key pick one at random. The 2021 sky stays as the first-visit default. */
(function () {
  "use strict";
  var stage = document.querySelector("[data-wallpaper]");
  if (!stage) return;
  var W = window.Animedoro || { toast: function () {} };
  var scriptEl = document.currentScript || document.querySelector('script[src*="wallpaper.js"]');
  var BASE = scriptEl ? scriptEl.src.replace(/assets\/js\/wallpaper\.js.*$/, "") : "./";
  var DIR = BASE + "assets/wallpapers/";
  var LOOPS = (stage.getAttribute("data-loops") || "").split(/\s+/).filter(Boolean);
  var STILLS = (stage.getAttribute("data-stills") || "").split(/\s+/).filter(Boolean);
  var STILL = "still";
  function isLoop(name) { return LOOPS.indexOf(name) !== -1; }
  function poster(name) { return name === STILL ? BASE + "assets/img/bg.jpg" : DIR + name + ".jpg"; }
  function thumb(name) { return name === STILL ? BASE + "assets/img/bg.jpg" : STILLS.indexOf(name) !== -1 ? DIR + name + "-thumb.jpg" : DIR + name + ".jpg"; }

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var saveData = navigator.connection && navigator.connection.saveData;
  var lite = false; try { lite = localStorage.getItem("ad.lite") === "1"; } catch (e) {}
  var canVideo = !!document.createElement("video").canPlayType;
  function videoOk() { return canVideo && !reduced && !saveData && !lite; }

  var layers = [stage.querySelector("[data-layer=a]"), stage.querySelector("[data-layer=b]")];
  var front = 0, current = null, busy = false, drift = 0;

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  // Loads a scene into a layer and calls done(ok). A loop whose video fails
  // falls back to its poster; an image that fails reports ok = false so the
  // current scene stays up instead of crossfading to nothing.
  function fill(layer, name, done, forceImage) {
    layer.innerHTML = "";
    var fired = false;
    function finish(ok) { if (fired) return; fired = true; clearTimeout(guard); done(ok); }
    var guard;
    if (!forceImage && isLoop(name) && videoOk()) {
      var v = document.createElement("video");
      v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true; v.preload = "auto";
      v.setAttribute("muted", ""); v.setAttribute("playsinline", ""); v.setAttribute("aria-hidden", "true");
      v.poster = poster(name);
      var fallback = function () { if (fired) return; fired = true; clearTimeout(guard); fill(layer, name, done, true); };
      v.addEventListener("canplay", function () { finish(true); }, { once: true });
      v.addEventListener("error", fallback, { once: true });
      guard = setTimeout(fallback, 4000); // slow network: show the poster rather than wait
      v.src = DIR + name + ".mp4";
      layer.appendChild(v);
      var p = v.play(); if (p && p.catch) p.catch(function () {});
      return;
    }
    var img = new Image();
    img.alt = ""; img.decoding = "async";
    img.className = "drift drift-" + drift; // drift-0 starts at the stage's zoom
    drift = (drift + 1) % 4; // each still after that drifts a different way
    var check = function () { finish(img.complete && img.naturalWidth > 0); };
    img.onload = function () { if (img.decode) img.decode().then(check, check); else check(); };
    img.onerror = function () { finish(false); };
    guard = setTimeout(check, 6000);
    img.src = poster(name);
    layer.appendChild(img);
  }

  // Crossfade: the outgoing scene stays fully opaque underneath ("is-under")
  // while only the incoming one fades in on top ("is-front"). Nothing behind
  // either layer ever shows through, and there is no mid-fade dip. A press
  // during a fade is queued, and the newest request wins.
  var FADE_MS = 700, pending = null, fadeTimer = null;
  function show(name, instant) {
    if (busy) { pending = name; return; }
    if (name === current) return;
    busy = true; pending = null;
    var back = 1 - front, incoming = layers[back], outgoing = layers[front];
    fill(incoming, name, function (ok) {
      if (!ok && current) { // keep what is on screen; try nothing else
        incoming.innerHTML = ""; busy = false;
        if (pending && pending !== current) { var q = pending; pending = null; show(q); } else pending = null;
        return;
      }
      if (outgoing.firstChild) outgoing.classList.add("is-under"); // stays opaque underneath
      outgoing.classList.remove("is-front");
      if (instant) incoming.classList.add("instant"); // no transition: opaque on its first frame
      // Two frames so the browser commits opacity 0 before the fade starts
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        incoming.classList.add("is-front");
        front = back; current = name; set("ad.wallpaper", name);
        stage.setAttribute("data-current", name);
        document.documentElement.classList.toggle("wp-still", !isLoop(name));
        markTiles(); syncPlayback(); remember(name);
        var done = function () {
          clearTimeout(fadeTimer); incoming.removeEventListener("transitionend", onEnd);
          incoming.classList.remove("instant");
          outgoing.classList.remove("is-under");
          // Stop the old layer's video so only one decodes at a time
          var ov = outgoing.querySelector("video"); if (ov) { ov.pause(); ov.removeAttribute("src"); ov.load(); }
          outgoing.innerHTML = "";
          stage.classList.add("ready"); // the first-paint poster is covered for good now
          busy = false;
          if (pending && pending !== current) { var n = pending; pending = null; show(n); } else pending = null;
        };
        var onEnd = function (e) { if (e.target === incoming && e.propertyName === "opacity") done(); };
        if (instant) { requestAnimationFrame(function () { requestAnimationFrame(done); }); return; }
        incoming.addEventListener("transitionend", onEnd);
        fadeTimer = setTimeout(done, FADE_MS + 250); // in case transitionend never fires
      }); });
    });
  }

  // Keep a small copy of the current scene in localStorage so the next page
  // load can paint it on its very first frame (see the inline script in <head>)
  function remember(name) {
    var run = function () {
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement("canvas"); c.width = 480; c.height = 270;
          var x = c.getContext("2d"), r = Math.max(480 / img.naturalWidth, 270 / img.naturalHeight);
          var w = img.naturalWidth * r, h = img.naturalHeight * r;
          x.drawImage(img, (480 - w) / 2, (270 - h) / 2, w, h);
          set("ad.wp.lq", JSON.stringify({ name: name, data: c.toDataURL("image/jpeg", 0.72) }));
        } catch (e) {}
      };
      img.src = poster(name);
    };
    if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 2000 }); else setTimeout(run, 300);
  }

  function random() {
    var pool = [STILL].concat(LOOPS, STILLS).filter(function (n) { return n !== current; });
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Play the loop only while it matters: tab visible and the timer on screen.
  var heroVisible = true;
  function syncPlayback() {
    var v = layers[front].querySelector("video"); if (!v) return;
    if (document.hidden || !heroVisible) v.pause();
    else if (v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
  }
  document.addEventListener("visibilitychange", syncPlayback);
  var hero = document.querySelector("[data-animedoro]");
  if (hero && "IntersectionObserver" in window && !document.body.classList.contains("focus-page")) {
    new IntersectionObserver(function (entries) { heroVisible = entries[0].isIntersecting; syncPlayback(); }, { threshold: 0.05 }).observe(hero);
  }
  // Reduce effects on or off: re-show the current scene as a poster or a loop
  document.addEventListener("animedoro:lite", function (e) {
    var next = !!e.detail; if (next === lite) return;
    lite = next; var c = current; current = null; if (c) show(c, true);
  });

  // ---- the picker --------------------------------------------------------
  var tilesEl = document.querySelector("[data-tiles]");
  var filtersEl = document.querySelector("[data-filters]");
  var titles = {};
  function humanize(name) {
    return name.replace(/^stills\//, "").replace(/^s?\d+-/, "").replace(/-/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  function decode(s) { var t = document.createElement("textarea"); t.innerHTML = s; return t.value; }
  function titleOf(name) {
    if (name === STILL) return "The 2021 sky";
    var t = titles[name]; if (!t) return humanize(name);
    return decode(t).replace(/\s*Live Wallpaper\s*$/i, "");
  }
  var items = [STILL].concat(LOOPS, STILLS);
  var FILTERS = [
    { id: "all", label: "All " + items.length },
    { id: "live", label: "Animated", fn: isLoop },
    { id: "sakura", label: "Sakura", re: /sakura|cherry|wisteria|spring|daisies|lilies|blossom/i },
    { id: "night", label: "Night", re: /night|star|moon|milky|lakeside|balcony/i },
    { id: "cozy", label: "Cozy", re: /coffee|lofi|reading|book|rain|sleep|homework|window|porch|sunset|headphones|2021/i },
    { id: "cats", label: "Cats", re: /\bcat\b|neko|fox|witch/i }
  ];
  var filter = "all";
  function matches(name, f) { if (f.id === "all") return true; if (f.fn) return f.fn(name); return f.re.test(titleOf(name) + " " + name); }
  function renderFilters() {
    if (!filtersEl) return;
    filtersEl.innerHTML = "";
    FILTERS.forEach(function (f) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "filter glass-lite" + (f.id === filter ? " is-on" : "");
      b.textContent = f.label; b.setAttribute("aria-pressed", f.id === filter ? "true" : "false");
      b.addEventListener("click", function () { filter = f.id; renderFilters(); renderTiles(); });
      filtersEl.appendChild(b);
    });
  }
  function renderTiles() {
    if (!tilesEl) return;
    tilesEl.innerHTML = "";
    var f = FILTERS.filter(function (x) { return x.id === filter; })[0] || FILTERS[0];
    items.filter(function (n) { return matches(n, f); }).forEach(function (name) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "tile" + (name === current ? " is-on" : "");
      b.setAttribute("data-tile", name);
      b.setAttribute("aria-label", titleOf(name) + (isLoop(name) ? ", animated" : "") + (name === current ? ", current" : ""));
      b.setAttribute("aria-pressed", name === current ? "true" : "false");
      var img = document.createElement("img");
      img.src = thumb(name); img.alt = ""; img.loading = "lazy"; img.decoding = "async"; img.width = 320; img.height = 180;
      b.appendChild(img);
      if (isLoop(name)) { var badge = document.createElement("span"); badge.className = "badge"; badge.textContent = "live"; b.appendChild(badge); }
      b.addEventListener("click", function () {
        show(name); b.blur();
        W.toast(titleOf(name));
        if (window.matchMedia("(max-width: 760px)").matches && window.AnimedoroSheet) window.AnimedoroSheet.close();
      });
      tilesEl.appendChild(b);
    });
  }
  function markTiles() {
    if (!tilesEl) return;
    Array.prototype.forEach.call(tilesEl.querySelectorAll("[data-tile]"), function (b) {
      var on = b.getAttribute("data-tile") === current;
      b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  if (tilesEl) {
    renderFilters(); renderTiles();
    if (window.fetch) {
      fetch(DIR + "manifest.json").then(function (r) { return r.ok ? r.json() : []; }).then(function (list) {
        (list || []).forEach(function (x) { if (x && x.file) titles[x.file] = x.title || ""; });
        renderTiles();
      }).catch(function () {});
    }
  }

  var btn = document.querySelector("[data-shuffle-wallpaper]");
  if (btn) {
    btn.addEventListener("click", function () { var n = random(); show(n); W.toast(titleOf(n)); btn.blur(); });
    btn.hidden = LOOPS.length + STILLS.length === 0;
  }
  document.addEventListener("keydown", function (e) {
    var t = e.target; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "w" || e.key === "W") { var n = random(); show(n); W.toast(titleOf(n)); }
  });

  var saved = get("ad.wallpaper");
  var start = (saved && (saved === STILL || LOOPS.indexOf(saved) !== -1 || STILLS.indexOf(saved) !== -1)) ? saved : STILL;
  show(start, true);

  window.AnimedoroScenes = { show: show, random: random, current: function () { return current; }, titleOf: titleOf };
})();
