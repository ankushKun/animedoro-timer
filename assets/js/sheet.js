/* The sheet: scenes, music, settings and more. Opens from the top-right
   buttons, closes on Esc, backdrop or the X. Playlists load only when
   opened and keep playing while the sheet is closed. Also: full screen
   and the M and F keys. */
(function () {
  "use strict";
  var body = document.body;
  var sheet = document.querySelector("[data-sheet]");
  if (!sheet) return;
  var W = window.Animedoro || { toast: function () {} };
  var tabs = Array.prototype.slice.call(sheet.querySelectorAll("[role=tab]"));
  var panels = Array.prototype.slice.call(sheet.querySelectorAll("[data-panel]"));
  var openers = Array.prototype.slice.call(document.querySelectorAll("[data-sheet-open]"));
  var lastFocus = null;
  sheet.tabIndex = -1;

  function currentTab() { var t = tabs.filter(function (x) { return x.getAttribute("aria-selected") === "true"; })[0]; return t ? t.getAttribute("data-tab") : null; }
  function selectTab(id) {
    tabs.forEach(function (t) {
      var on = t.getAttribute("data-tab") === id;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
    });
    panels.forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== id; });
  }
  function isOpen() { return body.classList.contains("sheet-open"); }
  function open(id) {
    if (id) selectTab(id);
    lastFocus = document.activeElement;
    body.classList.add("sheet-open");
    sheet.setAttribute("aria-hidden", "false");
    openers.forEach(function (o) { o.setAttribute("aria-expanded", "true"); });
    sheet.focus({ preventScroll: true });
  }
  function close() {
    if (!isOpen()) return;
    body.classList.remove("sheet-open");
    sheet.setAttribute("aria-hidden", "true");
    openers.forEach(function (o) { o.setAttribute("aria-expanded", "false"); });
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  }
  function toggle(id) { if (isOpen() && (!id || currentTab() === id)) close(); else open(id); }

  openers.forEach(function (o) {
    o.setAttribute("aria-expanded", "false");
    o.addEventListener("click", function () { toggle(o.getAttribute("data-sheet-open")); });
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-sheet-close]"), function (c) { c.addEventListener("click", close); });
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { selectTab(t.getAttribute("data-tab")); });
    t.addEventListener("keydown", function (e) {
      var j = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : -1;
      if (j < 0) return;
      var n = tabs[(j + tabs.length) % tabs.length];
      selectTab(n.getAttribute("data-tab")); n.focus(); e.preventDefault();
    });
  });

  sheet.querySelectorAll("details[data-playlist]").forEach(function (d) {
    function load() {
      if (d.querySelector("iframe")) return;
      var f = document.createElement("iframe");
      f.title = "Spotify playlist: " + d.querySelector("summary").textContent.trim();
      f.src = "https://open.spotify.com/embed/playlist/" + d.getAttribute("data-playlist") + "?theme=0";
      f.loading = "lazy"; f.allow = "encrypted-media; clipboard-write";
      d.appendChild(f);
    }
    d.addEventListener("toggle", function () { if (d.open) load(); });
  });
  // The first playlist is open by default; load it the first time the music tab shows.
  var musicTab = tabs.filter(function (t) { return t.getAttribute("data-tab") === "music"; })[0];
  function loadOpenPlaylists() { sheet.querySelectorAll("details[data-playlist][open]").forEach(function (d) { d.dispatchEvent(new Event("toggle")); }); }
  if (musicTab) musicTab.addEventListener("click", loadOpenPlaylists);
  openers.filter(function (o) { return o.getAttribute("data-sheet-open") === "music"; }).forEach(function (o) { o.addEventListener("click", loadOpenPlaylists); });

  // ---- full screen -------------------------------------------------------
  var fsBtn = document.querySelector("[data-fullscreen]");
  var focusLink = document.querySelector("[data-focus-link]");
  function fullscreen() {
    if (fsBtn) {
      var d = document;
      if (d.fullscreenElement) { if (d.exitFullscreen) d.exitFullscreen().catch(function () {}); }
      else if (d.documentElement.requestFullscreen) d.documentElement.requestFullscreen().catch(function () { W.toast("Full screen is not available here."); });
      else W.toast("Full screen is not available here.");
    } else if (focusLink) {
      location.href = focusLink.getAttribute("href");
    }
  }
  if (fsBtn) {
    fsBtn.addEventListener("click", fullscreen);
    document.addEventListener("fullscreenchange", function () { fsBtn.setAttribute("aria-label", document.fullscreenElement ? "Exit full screen (F)" : "Full screen (F)"); });
  }

  document.addEventListener("keydown", function (e) {
    var t = e.target; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Escape") { if (isOpen()) { close(); e.preventDefault(); } return; }
    if (e.key === "m" || e.key === "M") { toggle("music"); if (isOpen()) loadOpenPlaylists(); }
    else if (e.key === "f" || e.key === "F") fullscreen();
  });

  window.AnimedoroSheet = { open: open, close: close, toggle: toggle, isOpen: isOpen };
})();
