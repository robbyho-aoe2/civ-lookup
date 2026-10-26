// Tier list maker for Console Insights: pick what to rank (Nations Cup players, console civs, top console players), drag the
// tiles into S to D (on a phone: tap a tile, then tap a tier), then copy a share link or save the board as a picture.
//
//   initTierList(rootElement, { civs })     civs = the page's insights-console-civs.json (already loaded for the civ leaderboard)
//
// Adding a list = adding an entry to SOURCES below: load() returns the tiles ({ id, name, big, small, img, kind, color, score }),
// where `score` (optional) is what "Fill with the site's pick" sorts by. Everything else (dragging, sharing, saving) is shared.
(function () {
  const PLAYER_DATA = 'https://raw.githubusercontent.com/robbyho-aoe2/player-data/main/data';
  // every tier a list can use, S+ down to F; the person picks which ones to include (S to D to start with)
  const ALL_TIERS = [['S+', '#ff5f5f'], ['S', '#ff7f7f'], ['A', '#ffbf7f'], ['B', '#ffdf7f'], ['C', '#bfff7f'], ['D', '#7fbfff'], ['F', '#c3a6ff']];
  const DEFAULT_TIERS = ['S', 'A', 'B', 'C', 'D'];
  const WEIGHTS = { 'S+': .04, S: .08, A: .17, B: .28, C: .25, D: .12, F: .06 };   // share of the list each tier gets when auto-filled, scaled to the tiers in use
  const TEAM_COLOR = { usa: '#e5484d', canada: '#f5b800', mexico: '#3b82f6', uk: '#22c55e', france: '#a78bfa', ps5: '#22d3ee' };
  // country of each Nations Cup player (from their aoe2companion profile); anyone missing is looked up when the list opens
  const NC_COUNTRY = {"7096003":"ca","8154765":"ca","8363994":"fr","11828362":"gb","12459914":"mx","12462155":"us","12478121":"mx","12484696":"us","12507343":"fr","12516504":"jp","12527010":"us","12554124":"us","12591985":"ca","12710758":"gb","12868111":"mx","12893749":"ca","13106080":"mx","13107937":"gb","13216763":"mx","13323926":"gb","13394271":"fr","13410632":"gb","13467931":"us","13479761":"us","13480709":"mx","13623295":"gb","14065945":"fr","14276793":"us","16972769":"gb","17828880":"us","22759370":"au","22765143":"gb","22831188":"nl","23147426":"us","23477132":"sa","25013161":"mx","25166648":"co","25476302":"fr"};

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const civSlug = n => String(n).toLowerCase().replace(/[ ']/g, '');
  const pctText = (w, g) => g ? (w / g * 100).toFixed(1) + '%' : '–';

  // ---------- what can be ranked ----------
  const SOURCES = {
    nc: {
      label: 'Nations Cup players',
      note: 'Players with at least one finished Nations Cup game. The tile shows their country and record. "Fill with the site\'s pick" ranks them half by rating and half by wins above what the pregame odds expected.',
      async load() {
        const txt = await (await fetch('competitive.html', { cache: 'no-store' })).text();
        const grab = (a, b) => { const i = txt.indexOf(a); if (i < 0) throw new Error('competitive.html changed: ' + a); return txt.slice(i, txt.indexOf(b, i) + b.length); };
        const fn = new Function(grab('const ALL_TEAMS = [', '\n];') + '\n' + grab('const SET_RESULTS = [', '\n];') + '\n' + grab('const PREGAME = {', '\n};') + '\nreturn { ALL_TEAMS, SET_RESULTS, PREGAME };');
        const { ALL_TEAMS, SET_RESULTS, PREGAME } = fn();
        const P = new Map();
        ALL_TEAMS.filter(t => !t.hidden).forEach(t => t.players.forEach(p => P.set(p.profileId, { id: p.profileId, name: p.name, team: t.id, elo: p.elo, w: 0, l: 0, e: 0 })));
        const odds = (r, team) => {
          const [x, y] = r.teams; let p = PREGAME.played[x + '|' + y + '|' + r.fmt];
          if (p == null) { const q = PREGAME.played[y + '|' + x + '|' + r.fmt]; if (q == null) return null; p = 1 - q; }
          return team === x ? p : 1 - p;
        };
        SET_RESULTS.forEach(r => {
          const loser = r.teams.find(id => id !== r.winner);
          [[r.winners, true, r.winner], [r.losers, false, loser]].forEach(([list, won, team]) => list.forEach(pl => {
            let p = P.get(pl.id); if (!p) { p = { id: pl.id, name: pl.name, team, elo: null, w: 0, l: 0, e: 0 }; P.set(pl.id, p); }
            p[won ? 'w' : 'l']++; const o = odds(r, team); if (o != null) p.e += o;
          }));
        });
        const all = [...P.values()], act = all.filter(p => p.w + p.l > 0);
        const elos = act.map(p => p.elo).filter(Boolean), mu = elos.reduce((a, b) => a + b, 0) / (elos.length || 1);
        const sd = Math.sqrt(elos.reduce((a, b) => a + (b - mu) ** 2, 0) / (elos.length || 1)) || 1;
        const sh = p => (p.w - p.e) / (p.w + p.l + 4), shs = act.map(sh), ms = shs.reduce((a, b) => a + b, 0) / (shs.length || 1);
        const ss = Math.sqrt(shs.reduce((a, b) => a + (b - ms) ** 2, 0) / (shs.length || 1)) || 1;
        // flags for anyone not in the built-in table
        await Promise.all(act.filter(p => !(p.id in NC_COUNTRY)).map(async p => {
          try { const j = await (await fetch('https://data.aoe2companion.com/api/profiles/' + p.id)).json(); NC_COUNTRY[p.id] = (j.country || '').toLowerCase(); } catch (e) { NC_COUNTRY[p.id] = ''; }
        }));
        return all.map(p => ({
          id: String(p.id), name: p.name, big: p.w + '–' + p.l, active: p.w + p.l > 0, sort: p.w + p.l,
          img: NC_COUNTRY[p.id] ? 'https://flagcdn.com/w80/' + NC_COUNTRY[p.id] + '.png' : null, kind: 'flag', color: TEAM_COLOR[p.team] || '#888',
          tip: p.name + ': ' + p.w + '-' + p.l + ' in the Nations Cup (' + p.e.toFixed(1) + ' wins expected from the pregame odds)',
          score: 0.5 * (((p.elo || mu - sd) - mu) / sd) + 0.5 * ((sh(p) - ms) / ss),
        }));
      },
    },
    civs: {
      label: 'Console civs',
      note: 'Every civ in the console data, with its win rate on the ladder you pick. "Fill with the site\'s pick" orders them by win rate (pulled toward 50% for civs with few games).',
      options: ['1v1 Console', 'Team Console'],
      async load(ctx, option) {
        const lad = ((ctx.civs || {}).ladders || {})[option || '1v1 Console'];
        if (!lad) throw new Error('civ data is not loaded yet');
        return Object.entries(lad.overall).map(([name, d]) => ({
          id: name, name, big: pctText(d.wins, d.games), active: true, sort: d.games, img: 'img/civs/' + civSlug(name) + '.png', kind: 'icon', color: '#9b8f7a',
          tip: name + ': ' + pctText(d.wins, d.games) + ' win rate over ' + d.games.toLocaleString() + ' games',
          score: (d.wins + 20) / (d.games + 40),
        }));
      },
    },
    players: {
      label: 'Top console players',
      note: 'The 60 highest-rated console players right now (best of 1v1 and team rating). "Fill with the site\'s pick" orders them by rating.',
      async load() {
        const r = await (await fetch(PLAYER_DATA + '/console-roster.json?t=' + Date.now(), { cache: 'no-store' })).json();
        const ci = Object.fromEntries(r.cols.map((c, i) => [c, i]));
        return r.players.map(p => ({ p, best: Math.max(p[ci.r1v1] || 0, p[ci.rTeam] || 0) })).sort((a, b) => b.best - a.best).slice(0, 60).map(({ p, best }) => ({
          id: String(p[ci.id]), name: p[ci.name], big: String(best), active: true, sort: best, img: null, kind: 'none', color: p[ci.plat] === 'X' ? '#4ade80' : p[ci.plat] === 'P' ? '#60a5fa' : '#888',
          tip: p[ci.name] + ': 1v1 ' + (p[ci.r1v1] || '–') + ', team ' + (p[ci.rTeam] || '–'), score: best,
        }));
      },
    },
  };

  // ---------- the maker ----------
  window.initTierList = function (root, ctx) {
    if (!root || root.dataset.ready) return;
    root.dataset.ready = '1';
    injectCss();
    const KEY = 'autoscout-tierlist-2';
    let type = 'nc', option = null, items = [], byId = new Map(), showAll = false, selected = null, loading = false, err = '';
    let state = empty(), title = '', TIERS = [];
    const saved = readSaved();
    function empty() { return Object.fromEntries(ALL_TIERS.map(([t]) => [t, []])); }
    function setTiers(names) { TIERS = ALL_TIERS.filter(([t]) => (names || []).includes(t)); if (!TIERS.length) TIERS = ALL_TIERS.filter(([t]) => DEFAULT_TIERS.includes(t)); }
    setTiers(saved.tiers || DEFAULT_TIERS);
    function readSaved() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
    const slot = () => type + (option ? '|' + option : '');
    const persist = () => { try { saved[slot()] = state; saved.titles = saved.titles || {}; saved.titles[slot()] = title; localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {} };

    root.innerHTML = `
      <div class="tl-pills" id="tl-src">${Object.entries(SOURCES).map(([k, s]) => `<button type="button" class="tl-pill" data-src="${k}">${s.label}</button>`).join('')}</div>
      <div class="tl-pills" id="tl-opt" hidden></div>
      <p class="tl-note" id="tl-note"></p>
      <div class="tl-pills tl-tiers" id="tl-tiers"></div>
      <input type="text" id="tl-title" class="tl-title" maxlength="60" placeholder="Name of list (optional)" aria-label="Name of list">
      <div class="tl-bar">
        <button type="button" class="tl-btn" id="tl-fill">Fill with the site's pick</button>
        <button type="button" class="tl-btn" id="tl-reset">Start over</button>
        <button type="button" class="tl-btn tl-primary" id="tl-share">Copy share link</button>
        <button type="button" class="tl-btn tl-primary" id="tl-img">Save as picture</button>
        <label class="tl-check" id="tl-allwrap"><input type="checkbox" id="tl-all"> Include players with no games yet</label>
      </div>
      <p class="tl-msg" id="tl-msg"></p>
      <div id="tl-board"></div>
      <div class="tl-pool-head"><b>Not placed yet</b> <span id="tl-count"></span></div>
      <div id="tl-pool"></div>`;
    const $ = id => root.querySelector('#' + id);

    const placedTier = id => { for (const [t] of TIERS) if (state[t].includes(id)) return t; return null; };
    const visible = it => showAll || it.active || placedTier(it.id);
    function place(id, tier, before) {
      TIERS.forEach(([t]) => { state[t] = state[t].filter(x => x !== id); });
      if (tier) { const a = state[tier], i = before != null ? a.indexOf(before) : -1; if (i >= 0) a.splice(i, 0, id); else a.push(id); }
      selected = null; persist(); draw();
    }
    const tileHtml = it => {
      const im = it.img ? `<img class="tl-img tl-img-${it.kind}" src="${esc(it.img)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : `<span class="tl-img tl-img-none"></span>`;
      return `<div class="tl-tile${selected === it.id ? ' sel' : ''}" draggable="true" data-id="${esc(it.id)}" style="--c:${it.color}" title="${esc(it.tip || it.name)}">${im}<b class="tl-name">${esc(it.name)}</b>${it.big ? `<span class="tl-rec">${esc(it.big)}</span>` : ''}</div>`;
    };
    function draw() {
      $('tl-board').innerHTML = TIERS.map(([t, c]) => `<div class="tl-row"><div class="tl-label" style="background:${c}">${t}</div><div class="tl-drop" data-tier="${t}">${state[t].map(id => byId.get(id)).filter(Boolean).map(tileHtml).join('')}</div></div>`).join('');
      const rest = items.filter(it => visible(it) && !placedTier(it.id)).sort((a, b) => b.sort - a.sort || a.name.localeCompare(b.name));
      $('tl-pool').innerHTML = loading ? '<span class="tl-empty">Loading…</span>' : err ? `<span class="tl-empty">${esc(err)}</span>` : rest.length ? rest.map(tileHtml).join('') : '<span class="tl-empty">Everyone is placed.</span>';
      $('tl-count').textContent = loading || err ? '' : rest.length + ' left to place';
      root.querySelectorAll('[data-src]').forEach(b => b.classList.toggle('on', b.dataset.src === type));
      $('tl-tiers').innerHTML = '<span class="tl-tiers-label">Tiers</span>' + ALL_TIERS.map(([t, c]) => { const on = TIERS.some(x => x[0] === t); return `<button type="button" class="tl-pill tl-tierpill" data-tier-toggle="${esc(t)}" aria-pressed="${on}" title="${on ? 'Remove' : 'Add'} the ${esc(t)} tier"${on ? ` style="background:${c};border-color:${c};color:#1a1306"` : ''}>${esc(t)}</button>`; }).join('');
      const src = SOURCES[type];
      $('tl-note').textContent = src.note;
      const optEl = $('tl-opt'); optEl.hidden = !src.options;
      if (src.options) optEl.innerHTML = src.options.map(o => `<button type="button" class="tl-pill${o === option ? ' on' : ''}" data-opt="${esc(o)}">${esc(o)}</button>`).join('');
      $('tl-allwrap').hidden = type !== 'nc';
      $('tl-fill').hidden = !items.some(i => i.score != null);
    }
    async function open(newType, newOption, hashState, hashTitle, hashTiers) {
      type = newType; option = SOURCES[type].options ? (newOption || SOURCES[type].options[0]) : null;
      selected = null; items = []; byId = new Map(); err = ''; loading = true; showAll = false; $('tl-all').checked = false; draw();
      try { items = await SOURCES[type].load(ctx || {}, option); byId = new Map(items.map(i => [i.id, i])); }
      catch (e) { err = 'Could not load this list (' + (e && e.message ? e.message : e) + ').'; }
      loading = false;
      if (hashTiers && hashTiers.length) setTiers(hashTiers);
      const s = hashState || saved[slot()] || empty();
      state = empty(); ALL_TIERS.forEach(([t]) => { state[t] = TIERS.some(x => x[0] === t) ? (s[t] || []).filter(id => byId.has(id)) : []; });
      title = hashTitle != null ? hashTitle : ((saved.titles || {})[slot()] || '');
      $('tl-title').value = title;
      draw();
    }

    // ----- moving tiles: drag on a PC, tap a tile and then a tier on a phone -----
    const zone = el => el.closest && el.closest('#tl-root .tl-drop, #tl-root #tl-pool');
    root.addEventListener('dragstart', e => { const t = e.target.closest('.tl-tile'); if (t) { e.dataTransfer.setData('text/plain', t.dataset.id); e.dataTransfer.effectAllowed = 'move'; } });
    root.addEventListener('dragover', e => { if (zone(e.target)) e.preventDefault(); });
    root.addEventListener('drop', e => {
      const z = zone(e.target); if (!z) return; e.preventDefault();
      const id = e.dataTransfer.getData('text/plain'); if (!byId.has(id)) return;
      const b = e.target.closest('.tl-tile'); place(id, z.dataset.tier || null, b ? b.dataset.id : null);
    });
    root.addEventListener('click', e => {
      const sb = e.target.closest('[data-src]'); if (sb) { open(sb.dataset.src); return; }
      const tb = e.target.closest('[data-tier-toggle]');
      if (tb) {
        const t = tb.dataset.tierToggle, names = TIERS.map(x => x[0]), i = names.indexOf(t);
        if (i >= 0) { if (names.length <= 1) return; state[t] = []; names.splice(i, 1); } else names.push(t);
        setTiers(names); saved.tiers = TIERS.map(x => x[0]); selected = null; persist(); draw(); return;
      }
      const ob = e.target.closest('[data-opt]'); if (ob) { open(type, ob.dataset.opt); return; }
      const t = e.target.closest('.tl-tile'); if (t) { selected = selected === t.dataset.id ? null : t.dataset.id; draw(); return; }
      const z = zone(e.target); if (z && selected != null) place(selected, z.dataset.tier || null, null);
    });

    // ----- buttons -----
    const enc = () => type + (option ? '|' + option : '') + '~' + TIERS.map(([t]) => encodeURIComponent(t) + ':' + state[t].map(encodeURIComponent).join(',')).join(';') + (title.trim() ? '~' + encodeURIComponent(title.trim()) : '');
    function dec(str) {
      const [head, body, ttl] = String(str).split('~'); if (body == null) return null;
      const [ty, op] = head.split('|'); const st = empty(), names = [];
      body.split(';').forEach(part => { const i = part.indexOf(':'); if (i < 0) return; const t = decodeURIComponent(part.slice(0, i)); if (!st[t]) return; names.push(t); if (part.length > i + 1) st[t] = part.slice(i + 1).split(',').map(decodeURIComponent); });
      return { type: ty, option: op || null, state: st, title: ttl ? decodeURIComponent(ttl) : '', tiers: names };
    }
    $('tl-title').addEventListener('input', e => { title = e.target.value; persist(); });
    $('tl-reset').addEventListener('click', () => { state = empty(); selected = null; persist(); draw(); });
    $('tl-all').addEventListener('change', e => { showAll = e.target.checked; draw(); });
    $('tl-share').addEventListener('click', async () => {
      const msg = $('tl-msg'), url = location.origin + location.pathname + '#tl=' + enc();
      try { await navigator.clipboard.writeText(url); msg.textContent = 'Link copied. Anyone who opens it sees your tier list.'; }
      catch (e) { msg.innerHTML = 'Copy this link: <input type="text" readonly value="' + esc(url) + '" onfocus="this.select()" style="width:100%;max-width:440px">'; }
      history.replaceState(null, '', '#tl=' + enc());
    });
    $('tl-fill').addEventListener('click', () => {
      const pool = items.filter(i => i.score != null && (i.active || showAll)).sort((a, b) => b.score - a.score);
      state = empty();
      const tot = TIERS.reduce((a, [t]) => a + WEIGHTS[t], 0); let acc = 0; const cuts = TIERS.map(([t]) => [t, (acc += WEIGHTS[t] / tot)]);
      pool.forEach((it, k) => { const q = (k + .5) / pool.length; state[(cuts.find(c => q < c[1]) || cuts[cuts.length - 1])[0]].push(it.id); });
      selected = null; persist(); draw();
    });
    $('tl-img').addEventListener('click', async () => {
      const placed = TIERS.map(([t]) => state[t].map(id => byId.get(id)).filter(Boolean));
      const TS = 118, GAP = 6, LAB = 110, COLS = 9, W = LAB + COLS * (TS + GAP) + GAP, TOP = 64;
      const heights = placed.map(a => Math.max(1, Math.ceil(a.length / COLS)) * (TS + GAP) + GAP);
      const H = TOP + heights.reduce((a, b) => a + b, 0) + 12;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d');
      const load = src => new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
      const pics = {}; await Promise.all([...new Set(placed.flat().map(i => i.img).filter(Boolean))].map(async s => { pics[s] = await load(s); }));
      g.fillStyle = '#0b0906'; g.fillRect(0, 0, W, H);
      g.fillStyle = '#f4efe3'; g.font = '700 30px "Segoe UI", system-ui, sans-serif'; g.textBaseline = 'middle';
      const heading = title.trim() || (SOURCES[type].label + (option ? ' (' + option + ')' : '') + ' tier list');
      let hs = 30; g.font = '700 ' + hs + 'px "Segoe UI", system-ui, sans-serif'; while (g.measureText(heading).width > W - 360 && hs > 16) { hs--; g.font = '700 ' + hs + 'px "Segoe UI", system-ui, sans-serif'; }
      g.fillText(heading, 16, 32);
      g.fillStyle = '#8f8578'; g.font = '400 16px "Segoe UI", system-ui, sans-serif'; g.textAlign = 'right'; g.fillText('aoe2autoscout.com/insights.html', W - 16, 32); g.textAlign = 'left';
      let y = TOP;
      placed.forEach((arr, ti) => {
        const h = heights[ti];
        g.fillStyle = TIERS[ti][1]; g.fillRect(0, y, LAB, h - 2);
        g.fillStyle = '#1a1306'; g.font = '800 54px "Segoe UI", system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(TIERS[ti][0], LAB / 2, y + h / 2); g.textAlign = 'left';
        g.fillStyle = '#1c1812'; g.fillRect(LAB, y, W - LAB, h - 2);
        arr.forEach((it, k) => {
          const x = LAB + GAP + (k % COLS) * (TS + GAP), yy = y + GAP + Math.floor(k / COLS) * (TS + GAP);
          g.fillStyle = '#14110c'; g.fillRect(x, yy, TS, TS); g.fillStyle = it.color; g.fillRect(x, yy, TS, 5);
          const im = it.img && pics[it.img];
          if (im) {
            const box = it.kind === 'flag' ? [36, 24] : it.kind === 'map' ? [66, 40] : [44, 44];
            const sc = Math.min(box[0] / im.width, box[1] / im.height), dw = im.width * sc, dh = im.height * sc;
            g.drawImage(im, x + (TS - dw) / 2, yy + 10 + (box[1] - dh) / 2, dw, dh);
          }
          g.textAlign = 'center'; g.fillStyle = '#f4efe3';
          let size = 15; g.font = '700 ' + size + 'px "Segoe UI", system-ui, sans-serif';
          while (g.measureText(it.name).width > TS - 8 && size > 9) { size--; g.font = '700 ' + size + 'px "Segoe UI", system-ui, sans-serif'; }
          g.fillText(it.name, x + TS / 2, yy + (it.big ? 62 : 74));
          if (it.big) { g.fillStyle = '#ffffff'; let s2 = 26; g.font = '800 ' + s2 + 'px "Segoe UI", system-ui, sans-serif'; while (g.measureText(it.big).width > TS - 8 && s2 > 14) { s2--; g.font = '800 ' + s2 + 'px "Segoe UI", system-ui, sans-serif'; } g.fillText(it.big, x + TS / 2, yy + 90); }
          g.textAlign = 'left';
        });
        y += h;
      });
      const a = document.createElement('a'); a.download = type + '-tier-list.png';
      cv.toBlob(b => { a.href = URL.createObjectURL(b); document.body.appendChild(a); a.click(); a.remove(); }, 'image/png');
    });

    // ----- start: a shared link wins, then the last list used in this browser -----
    const m = /[#&]tl=([^&]+)/.exec(location.hash);
    let first = null;
    if (m) { try { first = dec(decodeURIComponent(m[1])); } catch (e) { first = null; } }
    if (first && SOURCES[first.type]) open(first.type, first.option, first.state, first.title, first.tiers);
    else open(saved.last && SOURCES[saved.last] ? saved.last : 'nc');
    root.addEventListener('click', e => { if (e.target.closest('[data-src]')) { saved.last = type; try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (er) {} } });
  };

  function injectCss() {
    if (document.getElementById('tl-css')) return;
    const st = document.createElement('style'); st.id = 'tl-css';
    st.textContent = `
.tl-pills{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px;}
.tl-pill{font:inherit;font-size:12px;font-weight:600;padding:5px 12px;border-radius:16px;border:1px solid var(--border2);background:var(--surf2);color:var(--text2);cursor:pointer;}
.tl-pill.on{background:var(--amber);border-color:var(--amber);color:#1a0a00;}
.tl-tiers{align-items:center;}
.tl-tiers-label{font-size:12px;color:var(--text2);margin-right:2px;}
.tl-tierpill{min-width:34px;padding:5px 10px;}
.tl-note{font-size:12px;color:var(--text2);line-height:1.6;margin:0 0 10px;}
.tl-title{width:100%;max-width:520px;box-sizing:border-box;font:inherit;font-size:18px;font-weight:700;color:var(--text);background:var(--surf);border:1px solid var(--border2);border-radius:8px;padding:8px 12px;margin:0 0 10px;}
.tl-title::placeholder{color:var(--text3);font-weight:500;}
.tl-title:focus{outline:none;border-color:var(--amber);}
.tl-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:2px 0 8px;}
.tl-btn{font:inherit;font-size:12px;font-weight:600;padding:6px 12px;border-radius:16px;border:1px solid var(--border2);background:var(--surf2);color:var(--text2);cursor:pointer;}
.tl-btn:hover{color:var(--text);border-color:var(--text3);}
.tl-btn.tl-primary{border-color:var(--amber);color:var(--amberL);}
.tl-check{font-size:12px;color:var(--text2);display:flex;align-items:center;gap:6px;}
.tl-msg{font-size:12px;color:var(--amberL);margin:0 0 8px;}
.tl-msg:empty{display:none;}
#tl-board{display:flex;flex-direction:column;gap:4px;margin-bottom:14px;}
.tl-row{display:flex;border:1px solid var(--border2);border-radius:6px;overflow:hidden;}
.tl-label{flex:none;width:64px;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;color:#1a1306;}
.tl-drop{flex:1;display:flex;flex-wrap:wrap;gap:4px;padding:4px;min-height:92px;background:var(--surf2);min-width:0;}
#tl-pool{display:flex;flex-wrap:wrap;gap:4px;padding:6px;min-height:92px;background:var(--surf);border:1px dashed var(--border2);border-radius:6px;}
.tl-pool-head{font-size:12px;color:var(--text2);margin-bottom:6px;}
.tl-pool-head b{color:var(--text);}
.tl-empty{font-size:12px;color:var(--text3);align-self:center;padding:0 8px;}
.tl-tile{width:84px;height:84px;box-sizing:border-box;background:#14110c;border-top:4px solid var(--c);border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:3px;cursor:grab;user-select:none;-webkit-user-select:none;overflow:hidden;}
.tl-tile.sel{outline:2px solid var(--amberL);outline-offset:1px;}
.tl-img{display:block;border-radius:2px;flex:none;}
.tl-img-flag{width:24px;height:16px;object-fit:cover;}
.tl-img-icon{width:34px;height:34px;object-fit:contain;}
.tl-img-map{width:60px;height:36px;object-fit:cover;}
.tl-img-none{display:none;}
.tl-name{font-size:11px;font-weight:700;color:var(--text);max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px;line-height:1.2;}
.tl-rec{font-size:18px;font-weight:800;color:#fff;line-height:1.1;margin-top:2px;font-variant-numeric:tabular-nums;}
@media (max-width:600px){.tl-label{width:40px;font-size:22px;}.tl-tile{width:70px;height:74px;}.tl-name{font-size:10px;}.tl-rec{font-size:16px;}.tl-drop{min-height:80px;}}
`;
    document.head.appendChild(st);
  }
})();
