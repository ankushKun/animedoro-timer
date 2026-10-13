/* The whimsy: toasts, a speech bubble for Doro, drifting sakura petals,
   confetti bursts, and Doro's eyes following the cursor. Loads first;
   timer.js, wallpaper.js and sheet.js use window.Animedoro.toast /
   confetti. Respects prefers-reduced-motion. */
window.Animedoro = (function () {
  "use strict";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- toast (top centre) ------------------------------------------------
  var toastEl = document.querySelector("[data-toast]"), toastTimer = null;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-on"); }, 1900);
  }

  // ---- speech bubble, anchored above whichever cat was poked --------------
  var bubbleEl = null, bubbleTimer = null;
  function bubble(anchor, msg) {
    if (!bubbleEl) { bubbleEl = document.createElement("span"); bubbleEl.className = "bubble"; bubbleEl.setAttribute("aria-hidden", "true"); document.body.appendChild(bubbleEl); }
    var r = anchor.getBoundingClientRect();
    bubbleEl.textContent = msg;
    bubbleEl.style.left = (r.left + r.width * 0.5) + "px";
    bubbleEl.style.bottom = (window.innerHeight - r.top + 6) + "px";
    bubbleEl.classList.remove("is-on"); void bubbleEl.offsetWidth; bubbleEl.classList.add("is-on");
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () { bubbleEl.classList.remove("is-on"); }, 1600);
  }

  // ---- petals -------------------------------------------------------------
  var stage = document.querySelector("[data-petals]");
  if (stage && !reduced) {
    for (var i = 0; i < 7; i++) {
      var p = document.createElement("i");
      p.className = "petal";
      var s = 0.7 + Math.random() * 0.6;
      p.style.left = (4 + Math.random() * 92) + "%";
      p.style.width = Math.round(14 * s) + "px";
      p.style.height = Math.round(10 * s) + "px";
      p.style.setProperty("--dur", (8 + Math.random() * 6).toFixed(1) + "s");
      p.style.setProperty("--delay", (Math.random() * 12).toFixed(1) + "s");
      stage.appendChild(p);
    }
  }

  // ---- confetti -----------------------------------------------------------
  var COLORS = ["#ffa8cc", "#8fd8ff", "#ffe08a", "#ffffff", "#a8f0d4"];
  function confetti(container) {
    if (!container) return;
    container.innerHTML = "";
    var n = reduced ? 0 : 16;
    for (var i = 0; i < n; i++) {
      var c = document.createElement("i");
      c.className = "confetti";
      c.style.background = COLORS[i % COLORS.length];
      c.style.setProperty("--dx", Math.round((Math.random() - 0.5) * 560) + "px");
      c.style.setProperty("--dy", Math.round(-260 + Math.random() * 320) + "px");
      c.style.animationDelay = (Math.random() * 0.5).toFixed(2) + "s";
      container.appendChild(c);
    }
    setTimeout(function () { container.innerHTML = ""; }, 2600);
  }

  // ---- Doro: eyes follow the cursor (throttled), click for a line ---------
  var cats = Array.prototype.slice.call(document.querySelectorAll("[data-cat]"));
  var LINES = ["mew.", "nya~", "purr purr.", "back to work, human.", "one episode. one.", "you got this.", "pet pet pet."];
  if (cats.length && !reduced && window.matchMedia("(pointer: fine)").matches) {
    var raf = null, mx = 0, my = 0, last = 0;
    document.addEventListener("pointermove", function (e) {
      mx = e.clientX; my = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(function (now) {
        raf = null;
        if (now - last < 40) return; // ~25 updates a second is plenty for pupils
        last = now;
        cats.forEach(function (cat) {
          var r = cat.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > window.innerHeight) return;
          var dx = mx - (r.left + r.width / 2), dy = my - (r.top + r.height * 0.45);
          var d = Math.max(1, Math.hypot(dx, dy));
          var k = Math.min(1, d / 220) * 1.8;
          var tx = (dx / d) * k, ty = (dy / d) * k;
          cat.querySelectorAll(".pupil").forEach(function (pu) { pu.style.transform = "translate(" + tx.toFixed(2) + "px, " + ty.toFixed(2) + "px)"; });
        });
      });
    }, { passive: true });
  }
  cats.forEach(function (cat) {
    cat.addEventListener("click", function () {
      cat.classList.remove("mew"); void cat.offsetWidth; cat.classList.add("mew");
      bubble(cat, LINES[Math.floor(Math.random() * LINES.length)]);
    });
  });

  // ---- YouTube facade: load the player only on click ----------------------
  Array.prototype.forEach.call(document.querySelectorAll("[data-yt]"), function (box) {
    var btn = box.querySelector("[data-yt-play]"); if (!btn) return;
    btn.addEventListener("click", function () {
      var f = document.createElement("iframe");
      f.src = "https://www.youtube-nocookie.com/embed/" + box.getAttribute("data-yt") + "?autoplay=1&rel=0";
      f.title = btn.getAttribute("aria-label") || "YouTube video";
      f.allow = "accelerometer; autoplay; encrypted-media; picture-in-picture";
      f.setAttribute("allowfullscreen", ""); f.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      box.insertBefore(f, btn); btn.remove();
    });
  });

  // ---- ?perf=1: a frame meter for chasing lag reports ----------------------
  if (/[?&]perf=1/.test(location.search)) {
    var hud = document.createElement("div"); hud.className = "perf"; hud.setAttribute("aria-hidden", "true"); document.body.appendChild(hud);
    var gpu = "n/a";
    try {
      var c = document.createElement("canvas"), gl = c.getContext("webgl") || c.getContext("experimental-webgl");
      var dbg = gl && gl.getExtension("WEBGL_debug_renderer_info");
      gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : (gl ? "webgl, renderer hidden" : "no webgl");
    } catch (e) {}
    var frames = [], last = performance.now(), lastHud = 0;
    (function loop(t) {
      frames.push(t - last); last = t;
      if (frames.length > 300) frames.shift();
      if (t - lastHud > 500) {
        lastHud = t;
        var avg = frames.reduce(function (a, b) { return a + b; }, 0) / frames.length;
        var slow = frames.filter(function (x) { return x > 20; }).length, worst = Math.max.apply(null, frames);
        hud.textContent = "fps " + (1000 / avg).toFixed(0) + "  slow frames " + slow + "/" + frames.length + "  worst " + worst.toFixed(0) + "ms\n" +
          "viewport " + innerWidth + "x" + innerHeight + " @" + devicePixelRatio + "x  zoom " + Math.round((outerWidth / innerWidth) * 100) / 100 + "\n" +
          "gpu " + gpu + "\n" + navigator.userAgent.replace(/^.*\) /, "").slice(0, 60);
      }
      requestAnimationFrame(loop);
    })(performance.now());
  }

  // ---- adaptive quality: a browser that keeps dropping frames gets lite mode --
  // Watches the first 20 seconds and every scroll burst. Six frames over 50ms
  // inside ten seconds means the renderer is struggling, whatever the cause,
  // so the page asks timer.js to turn Reduce effects on (once, unless the
  // user later switches it off themselves).
  (function () {
    var manual = false, lite = false;
    try { manual = localStorage.getItem("ad.lite.manual") === "1"; lite = localStorage.getItem("ad.lite") === "1"; } catch (e) {}
    if (manual || lite) return;
    var slow = [], watching = false, until = 0, last = 0;
    function frame(t) {
      if (last) { var dt = t - last; if (dt > 50 && dt < 2000) { slow.push(t); while (slow.length && t - slow[0] > 10000) slow.shift(); } }
      last = t;
      if (slow.length >= 6) { watching = false; slow = []; document.dispatchEvent(new CustomEvent("animedoro:autolite")); return; }
      if (t < until) requestAnimationFrame(frame); else { watching = false; last = 0; }
    }
    function watch(ms) { until = Math.max(until, performance.now() + ms); if (!watching) { watching = true; last = 0; requestAnimationFrame(frame); } }
    watch(20000);
    window.addEventListener("scroll", function () { watch(3000); }, { passive: true });
    document.addEventListener("animedoro:lite", function (e) { if (e.detail) { watching = false; until = 0; } });
  })();

  // ---- home page corners hide once the timer is scrolled out of view --------
  var heroTimer = document.querySelector(".hero [data-animedoro]"), corners = document.querySelectorAll(".hero .corner");
  if (heroTimer && corners.length && "IntersectionObserver" in window) {
    new IntersectionObserver(function (en) {
      Array.prototype.forEach.call(corners, function (c) { c.classList.toggle("is-hidden", !en[0].isIntersecting); });
    }, { threshold: 0.05 }).observe(heroTimer);
  }

  return { toast: toast, bubble: bubble, confetti: confetti, reduced: reduced };
})();
