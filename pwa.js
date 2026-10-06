// Registers the service worker and adds an "Install the app" link to the page footer (browser only).
// Also exposes window.autoScoutStart, the saved "start page" choice used by launch.html and by the
// "Make this my player" button on player pages (localStorage key "autoscout-start").
(function () {
  var KEY = 'autoscout-start';
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; }
  }
  function save(v) {
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {}
  }
  window.autoScoutStart = {
    get: load,
    setMe: function (id, name) { var p = load(); p.me = { id: String(id), name: name || String(id) }; p.page = 'me'; save(p); },
    clearMe: function () { var p = load(); delete p.me; if (p.page === 'me') p.page = 'home'; save(p); },
  };

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (standalone) return;

  function spot() {
    var footer = document.querySelector('.footer');
    if (footer) return footer;
    footer = document.createElement('div');
    footer.style.cssText = 'font-size:11px;text-align:center;margin:30px auto 20px;padding-top:16px;max-width:900px;color:#8F8578;';
    document.body.appendChild(footer);
    return footer;
  }
  function addLine(node) {
    var line = document.createElement('div');
    line.className = 'pwa-install';
    line.style.cssText = 'margin-top:8px;font-size:11px;';
    line.appendChild(node);
    spot().appendChild(line);
    return line;
  }

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
    addLine(a);
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
    addLine(s);
  }
})();
