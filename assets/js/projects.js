/* "From ankush.one": the small card in the corner of focus mode shows one
   featured project or recent blog post from the portfolio, rotating every
   twenty seconds. Reads /projects-latest.json from the site (falls back to
   the JSON Feed). If nothing loads the card stays as the plain link. */
(function () {
  "use strict";
  var card = document.querySelector("[data-projects]");
  if (!card || !window.fetch) return;
  var SITE = "https://ankush.one/";
  var el = { img: card.querySelector("[data-projects-img]"), summary: card.querySelector("[data-projects-summary]"), title: card.querySelector("[data-projects-title]") };
  var fallbackImg = el.img ? el.img.getAttribute("src") : "";
  var items = [], i = 0, timer = null, EVERY = 20000;

  function normalize(it) {
    var kind = it.kind || (/\/blogs\//.test(it.url || "") ? "blog" : "project");
    return { url: it.url, title: it.title, image: it.image || "", kind: kind, summary: (it.summary || "").replace(/\s+/g, " ").trim() };
  }
  function render(it) {
    card.classList.remove("swap"); void card.offsetWidth; card.classList.add("swap");
    card.href = it.url;
    card.setAttribute("aria-label", it.title + ", a " + it.kind + " on ankush.one");
    if (el.summary) el.summary.textContent = it.summary || (it.kind === "blog" ? "A post on ankush.one" : "A project on ankush.one");
    if (el.title) {
      el.title.innerHTML = ""; var span = document.createElement("span"); span.textContent = it.title; el.title.appendChild(span);
      el.title.classList.remove("marquee");
      requestAnimationFrame(function () {
        var over = span.scrollWidth - el.title.clientWidth;
        if (over > 4) {
          el.title.style.setProperty("--marquee-shift", -(over + 6) + "px");
          el.title.style.setProperty("--marquee-dur", Math.max(6, (over + 6) / 18) + "s");
          el.title.classList.add("marquee");
        }
      });
    }
    if (el.img) {
      // Cover from the feed, else the site's generated social card for that
      // page (every page has one at /og/<section>/<slug>.jpg), else a letter tile
      var chain = [it.image, ogFor(it.url), letterTile(it.title)].filter(Boolean), k = 0;
      el.img.onerror = function () { k += 1; if (k < chain.length) el.img.src = chain[k]; else { el.img.onerror = null; el.img.src = fallbackImg; } };
      if (el.img.getAttribute("src") !== chain[0]) el.img.src = chain[0];
    }
  }
  function ogFor(url) {
    var m = /^https?:\/\/ankush\.one(\/[^?#]+?)\/?$/.exec(url || "");
    return m ? SITE + "og" + m[1] + ".jpg" : "";
  }
  var TILE_COLORS = [["#8fd8ff", "#141626"], ["#ffa8cc", "#141626"], ["#ffe08a", "#141626"], ["#a8f0d4", "#141626"], ["#c9b8ff", "#141626"]];
  function letterTile(title) {
    var h = 0; for (var k = 0; k < title.length; k++) h = (h * 31 + title.charCodeAt(k)) >>> 0;
    var c = TILE_COLORS[h % TILE_COLORS.length], letter = (title.trim().charAt(0) || "?").toUpperCase();
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44"><rect width="44" height="44" rx="12" fill="' + c[0] + '"/><text x="22" y="30" text-anchor="middle" font-family="Fredoka, Nunito, system-ui, sans-serif" font-weight="700" font-size="24" fill="' + c[1] + '">' + letter.replace(/[<>&]/g, "") + '</text></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  function show(n) { if (!items.length) return; i = ((n % items.length) + items.length) % items.length; render(items[i]); }
  function start() { stop(); timer = setInterval(function () { show(i + 1); }, EVERY); }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  function load(url) { return fetch(url).then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(r.status)); }); }
  load(SITE + "projects-latest.json")
    .then(function (d) { return d.items || []; })
    .catch(function () { return load(SITE + "feed.json").then(function (d) { return (d.items || []).filter(function (it) { return /\/(projects|blogs)\//.test(it.url || ""); }).slice(0, 8); }); })
    .then(function (list) {
      items = list.map(normalize).filter(function (it) { return it.url && it.title; });
      if (!items.length) return;
      show(Math.floor(Math.random() * items.length));
      start();
    })
    .catch(function () {});
  card.addEventListener("mouseenter", stop);
  card.addEventListener("mouseleave", start);
  document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else if (items.length) start(); });
})();
