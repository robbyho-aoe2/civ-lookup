// Registers the service worker, adds an "Install the app" link, and lets people choose which page
// the installed app opens to (stored in localStorage under "autoscout-start"; launch.html reads it).
(function () {
  var KEY = 'autoscout-start';
  var PAGES = [
    ['home', 'Home (Auto Scout)'], ['spotlight', 'Player Spotlight'], ['insights', 'Console Insights'],
    ['competitive', 'Console Competitive'], ['civ', 'Civ Insights'], ['build', 'Build Order'], ['investigations', 'Investigations'],
  ];

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; }
  }
  function save(v) {
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {}
  }
  function label(p) {
    if (p.page === 'me' && p.me && p.me.id) return 'My player (' + (p.me.name || p.me.id) + ')';
    for (var i = 0; i < PAGES.length; i++) if (PAGES[i][0] === p.page) return PAGES[i][1];
    return PAGES[0][1];
  }
  function refreshLink() {
    var cur = document.querySelector('.pwa-start-link');
    if (cur) cur.textContent = 'App start page: ' + label(load());
  }
  // Used by player.html's "Make this my player" button.
  window.autoScoutStart = {
    get: load,
    setMe: function (id, name) { var p = load(); p.me = { id: String(id), name: name || String(id) }; p.page = 'me'; save(p); refreshLink(); },
    clearMe: function () { var p = load(); delete p.me; if (p.page === 'me') p.page = 'home'; save(p); refreshLink(); },
    label: label,
  };

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  function spot() {
    var footer = document.querySelector('.footer');
    if (footer) return footer;
    footer = document.createElement('div');
    footer.style.cssText = 'font-size:11px;text-align:center;margin:30px auto 20px;padding-top:16px;max-width:900px;color:#8F8578;';
    document.body.appendChild(footer);
    return footer;
  }
  function addLine(node, cls) {
    var line = document.createElement('div');
    line.className = cls || 'pwa-line';
    line.style.cssText = 'margin-top:8px;font-size:11px;';
    line.appendChild(node);
    spot().appendChild(line);
    return line;
  }

  // ---- "App start page" dialog ----
  function openDialog() {
    if (document.getElementById('pwa-start-dialog')) return;
    var p = load();
    var overlay = document.createElement('div');
    overlay.id = 'pwa-start-dialog';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'App start page');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';
    var panel = document.createElement('div');
    panel.style.cssText = 'background:#17130F;border:1px solid #362E24;border-radius:12px;padding:18px 20px;max-width:380px;width:100%;color:#EDE8DD;font:13px system-ui,sans-serif;max-height:90vh;overflow:auto;';
    panel.innerHTML = '<div style="font-size:15px;font-weight:700;margin-bottom:4px">Open the app to&hellip;</div>' +
      '<div style="color:#8F8578;font-size:12px;margin-bottom:12px;line-height:1.5">Pick the page the installed app starts on. It applies the next time you open the app.</div>';
    var list = document.createElement('div');
    function row(value, text, disabled, sub) {
      var l = document.createElement('label');
      l.style.cssText = 'display:flex;align-items:flex-start;gap:10px;padding:8px 6px;border-radius:8px;cursor:' + (disabled ? 'default' : 'pointer') + ';' + (disabled ? 'opacity:.5;' : '');
      var r = document.createElement('input');
      r.type = 'radio'; r.name = 'pwa-start'; r.value = value; r.disabled = !!disabled; r.checked = (p.page || 'home') === value;
      r.style.cssText = 'margin-top:2px;accent-color:#5FB88C;';
      r.addEventListener('change', function () { var q = load(); q.page = value; save(q); refresh(); });
      var t = document.createElement('span');
      t.innerHTML = text + (sub ? '<div style="color:#8F8578;font-size:11px;margin-top:2px;line-height:1.4">' + sub + '</div>' : '');
      l.appendChild(r); l.appendChild(t);
      return l;
    }
    function refresh() {
      p = load();
      list.innerHTML = '';
      var hasMe = p.me && p.me.id;
      list.appendChild(row('me', 'My player' + (hasMe ? ': <b>' + String(p.me.name || p.me.id).replace(/</g, '&lt;') + '</b>' : ''), !hasMe,
        hasMe ? '<a href="player.html?id=' + encodeURIComponent(p.me.id) + '" style="color:#5FB88C">Open my page</a>' :
        'Not set. Open your player page and tap &ldquo;Make this my player&rdquo;.'));
      PAGES.forEach(function (pg) { list.appendChild(row(pg[0], pg[1])); });
      var cur = document.querySelector('.pwa-start-link');
      if (cur) cur.textContent = 'App start page: ' + label(p);
    }
    refresh();
    panel.appendChild(list);
    var done = document.createElement('button');
    done.type = 'button';
    done.textContent = 'Done';
    done.style.cssText = 'margin-top:12px;width:100%;padding:9px;border-radius:8px;border:1px solid #362E24;background:#1F1A15;color:#EDE8DD;font-weight:600;cursor:pointer;';
    function close() { overlay.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    done.addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    panel.appendChild(done);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    done.focus();
  }

  function addStartLink() {
    var a = document.createElement('a');
    a.href = '#start-page';
    a.className = 'pwa-start-link';
    a.textContent = 'App start page: ' + label(load());
    a.style.cssText = 'color:#8F8578;text-decoration:underline;';
    a.addEventListener('click', function (e) { e.preventDefault(); openDialog(); });
    addLine(a, 'pwa-start-line');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addStartLink);
  else addStartLink();

  // ---- install link (browser only) ----
  if (standalone) return;
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    var a = document.createElement('a');
    a.href = '#install';
    a.textContent = 'Install the app';
    a.style.cssText = 'color:#5FB88C;font-weight:700;text-decoration:none;';
    a.addEventListener('click', function (ev) {
      ev.preventDefault();
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.finally(function () {
        deferred = null;
        var l = document.querySelector('.pwa-install');
        if (l) l.remove();
      });
    });
    addLine(a, 'pwa-install');
  });
  window.addEventListener('appinstalled', function () {
    var l = document.querySelector('.pwa-install');
    if (l) l.remove();
  });

  var ua = navigator.userAgent;
  var iOS = /iPad|iPhone|iPod/.test(ua) || (ua.indexOf('Mac') > -1 && navigator.maxTouchPoints > 1);
  if (iOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)) {
    var s = document.createElement('span');
    s.textContent = 'Install the app: tap Share, then Add to Home Screen.';
    addLine(s, 'pwa-install');
  }
})();
