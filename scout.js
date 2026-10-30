// Scouting report engine, shared by Console Live (live games) and player pages (recent games, read as they stood at the start).
//
// Each page supplies these globals before the functions here are called:
//   esc(s)           HTML-escape a string
//   API              base URL of the aoe2companion data API
//   platIcon(id)     small Xbox / PlayStation mark for a profile id ('' when unknown)
//   queueRender()    redraw whatever shows a report; called when a player's history, profile or the civ stats arrive
// and gets: scoutReport(g, isMine) -> HTML, histWant(id, lb), the win-chance model (oddsFor, oddsTeam, eloChange), the
// helpers they use, and the report's CSS (added to the page on load).
(function () { const st = document.createElement('style'); st.textContent = `
.scout{background:var(--surf2);border:1px solid var(--border2);border-left:3px solid var(--gold,var(--amber));border-radius:var(--radius,10px);padding:12px 14px;margin:0 0 14px;}
.sc-inline{grid-column:1/-1;border-top:1px solid var(--border2);padding-top:9px;margin-top:2px;}
.sc-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px;font-size:12px;font-weight:700;color:var(--gold,var(--amber));text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px;}
.sc-sub{font-size:11px;font-weight:400;color:var(--text2);text-transform:none;letter-spacing:0;}
.sc-dim{color:var(--text3);font-size:12px;font-weight:400;}
.sc-odds{margin-bottom:10px;}
.sc-bar{height:8px;border-radius:5px;background:#f59e0b;overflow:hidden;}
.sc-bar i{display:block;height:100%;background:#4c8dff;}
.sc-pc{display:flex;justify-content:space-between;font-size:13px;margin-top:4px;}
.sc-pc b{font-weight:700;}
.sc-why{font-size:11px;color:var(--text3);margin-top:2px;}
.sc-elo{font-size:12px;margin-bottom:8px;}
.sc-elo .up,.sc-res.w{color:var(--green);}
.sc-elo .dn,.sc-res.l{color:var(--red);}
.sc-k{color:var(--text3);font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-right:6px;}
.fd{display:inline-block;width:7px;height:7px;border-radius:50%;}
.fd.w{background:var(--green);}
.fd.l{background:var(--red);}
.fd.now{box-shadow:0 0 0 1.5px rgba(255,255,255,.65);margin:0 2px 0 1.5px;}   /* the most recent game, then older ones to the right */
.sc-dl{font-size:8px;color:var(--text3);text-transform:uppercase;letter-spacing:.03em;margin-right:1px;align-self:center;}
.sc-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:4px;}
.sc-tag{font-size:10px;font-weight:700;padding:1px 8px;border-radius:20px;border:1px solid var(--border2);color:var(--text2);}
.sc-tag.good{color:var(--green);border-color:rgba(74,222,128,.4);}
.sc-tag.bad{color:var(--red);border-color:rgba(248,113,113,.4);}
.sc-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;}
.sc-col{min-width:0;border-top:3px solid var(--c);padding-top:6px;}
.sc-colhead{display:flex;justify-content:space-between;gap:6px;font-size:12px;font-weight:700;color:var(--c);overflow:hidden;}
.sc-colhead span:first-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.sc-avg{font-weight:400;color:var(--text3);font-size:11px;white-space:nowrap;}
.sc-res{font-weight:700;}
.sc-pl{border-left:4px solid var(--pc);background:var(--surf);border-radius:7px;padding:6px 8px;margin-top:6px;min-width:0;font-size:11px;}
.sc-ph{display:flex;justify-content:space-between;gap:6px;align-items:baseline;}
.sc-pn{font-weight:700;font-size:12px;display:flex;align-items:center;gap:3px;min-width:0;}
.sc-pn a{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;color:inherit;text-decoration:none;}
.sc-pn a:hover{color:var(--amberL);}
.sc-you{flex:none;font-style:normal;font-size:9px;font-weight:700;color:var(--amberL);border:1px solid var(--border2);border-radius:10px;padding:0 5px;margin-left:3px;}
.sc-pr{font-size:11px;color:var(--text2);font-variant-numeric:tabular-nums;}
.sc-pcv{font-size:10px;color:var(--text3);margin-bottom:3px;}
.sc-r{display:flex;justify-content:space-between;gap:6px;line-height:1.5;}
.sc-r .sc-k{min-width:0;flex:none;font-size:10px;max-width:46%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-right:0;}
.sc-r .sc-v{text-align:right;min-width:0;color:var(--text2);overflow-wrap:anywhere;}
.sc-dots{display:flex;flex-wrap:wrap;gap:1.5px;justify-content:flex-end;margin:1px 0 2px;}
.sc-h2h{font-size:12px;color:var(--text2);margin-top:8px;}
.sc-pn svg{flex:none;}
@media (max-width:520px){.sc-cols{gap:6px;}.sc-pl{padding:5px 6px;}.sc-r{display:block;margin-top:2px;}.sc-r .sc-k{display:block;max-width:none;white-space:normal;}.sc-r .sc-v{display:block;text-align:left;}.sc-dots{justify-content:flex-start;}.sc-elo .sc-k,.sc-h2h .sc-k{display:block;}}
`; document.head.appendChild(st); })();

function clock(ms) { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sc = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sc).padStart(2, '0'); }

function ladderLabel(m) {
  if (m.leaderboardId === 'rm_1v1_console') return '1v1 Console ranked';
  if (m.leaderboardId === 'rm_team_console') return 'Team Console ranked';
  if (m.leaderboardId === 'unranked') return 'Custom game';
  return m.leaderboardName || m.leaderboardId || '';
}

function matchPlayers(m) { return m.players || (m.teams ? m.teams.flatMap(t => t.players || []) : []); }
function groupTeams(players) {
  const by = new Map();
  players.forEach(p => { const k = p.team == null || p.team < 0 ? 'p' + p.profileId : 't' + p.team; (by.get(k) || by.set(k, []).get(k)).push(p); });
  return [...by.values()];
}

function agoText(iso, now = Date.now()) {
  const t = iso ? Date.parse(iso) : NaN;
  if (isNaN(t)) return '';
  const sec = Math.max(0, Math.round((now - t) / 1000));
  if (sec < 90) return 'just now';
  if (sec < 3600) return Math.round(sec / 60) + ' min ago';
  if (sec < 86400) { const h = Math.round(sec / 3600); return h + ' hour' + (h !== 1 ? 's' : '') + ' ago'; }
  const d = Math.round(sec / 86400); return d + ' day' + (d !== 1 ? 's' : '') + ' ago';
}

// Historical form for 1v1 games: each player's recent ranked console 1v1s (up to HIST_PAGES pages of 100), kept in a small
// cache, give their win rate overall and on this map, and the two players' record against each other.
const HIST_PAGES = 3, HIST_PER_PAGE = 100;
const hist = new Map();   // profileId -> { games: [{ map, won, opps: [ids] }] } | 'loading' | 'err'
let histActive = 0; const histQueue = []; let histLastReq = 0;
// `lb` picks the ladder (1v1 by default; the scouting report also reads team games). 1v1 entries stay keyed by profile id.
function histWant(id, lb = 'rm_1v1_console') {
  const key = lb === 'rm_1v1_console' ? id : lb + ':' + id, h = hist.get(key);
  if (h === 'err') { if (!histRetryAt.has(key) || Date.now() < histRetryAt.get(key)) return 'err'; hist.delete(key); histRetryAt.delete(key); }
  else if (h) return h;
  hist.set(key, 'loading'); histQueue.push({ key, id, lb }); histPump();
  return 'loading';
}
const histRetryAt = new Map();   // players whose lookup failed are tried again after a minute
function histPump() {
  while (histActive < 2 && histQueue.length) {
    const { key, id, lb } = histQueue.shift(); histActive++;
    histFetch(id, lb).then(r => hist.set(key, r), () => { hist.set(key, 'err'); histRetryAt.set(key, Date.now() + 60000); }).finally(() => { histActive--; histPump(); queueRender(); });
  }
}
// The data API answers 429 when asked too fast, so requests are spaced out and a refused page is retried after a pause.
async function histGet(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = histLastReq + 350 - Date.now(); histLastReq = Math.max(Date.now(), histLastReq) + 350;
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    const r = await fetch(url);
    if (r.status !== 429) return r;
    await new Promise(r2 => setTimeout(r2, 1500 * (attempt + 1)));
  }
  return null;
}
async function histFetch(id, lb = 'rm_1v1_console') {
  const games = [];
  for (let page = 1; page <= HIST_PAGES; page++) {
    const r = await histGet(`${API}/matches?profile_ids=${id}&leaderboard_ids=${lb}&per_page=${HIST_PER_PAGE}&page=${page}`);
    if (!r || !r.ok) { if (page === 1) throw new Error('hist'); break; }   // keep what was read if a later page is refused
    const j = await r.json(), ms = Array.isArray(j) ? j : (j.matches || []);
    ms.forEach(m => {
      const ps = (m.teams || []).flatMap(t => t.players || []), me = ps.find(x => x.profileId === id);
      if (!me || me.won == null) return;
      const foes = ps.filter(x => (x.team != null && me.team != null ? x.team !== me.team : x.profileId !== id)), foeR = foes.map(x => x.rating).filter(x => x > 0);
      // civ, start time, length (minutes) and the ratings at the time (own, and the opponents' average) feed the scouting report
      games.push({ map: m.mapName, won: !!me.won, opps: foes.map(x => x.profileId), civ: me.civName || null, ts: m.started || null,
        dur: m.started && m.finished ? (Date.parse(m.finished) - Date.parse(m.started)) / 60000 : null, r: me.rating || 0, or: foeR.length ? foeR.reduce((a, b) => a + b, 0) / foeR.length : 0 });
    });
    if (ms.length < HIST_PER_PAGE) break;
  }
  return { games };
}

// ---- Scouting report for the game you are in ----
// "You" is the player set with My level / Make this my player. When a live game has you in it, the opponents are
// scouted from their recent ranked console games (the same history the head-to-head line uses) and their profile.
//
// Win chance (1v1) is a logistic model fitted on 37,908 recent console ranked 1v1s (Oct 2026), checked by 5-fold
// cross-validation: rating only 71.2% right (log-loss 0.5428) -> with the terms below 72.0% (0.5361).
//   x = ELO * (your rating - theirs) / 400 + CIV * (civ strength gap) + P_CIV * (skill-with-civ gap) + P_MAP * (skill-on-map gap)
//       + P_ALL * (overall over-performance gap) + H2H * (their meetings: wins - losses) / (meetings + 2);  chance = 1 / (1 + e^-x)
// "civ strength" is each civ's win rate in the matching rating bracket (from the Insights data, shrunk toward 50%);
// the "gap" terms are each player's wins over expectation (actual wins minus what their rating gaps predicted) for that
// civ, that map, and overall, shrunk by 12 games. Rating changes: K 36 with a 380 scale, fitted on 75,000 results.
// Team games use the same idea on 25,664 recent team games (rating only 75.9% right, log-loss 0.4804; with the terms below
// 76.1%, 0.4784): average rating gap, the gap in average civ strength, and the gap between each side's best player.
// Rating changes there: K 35.5 with a 400 scale, from each player's own rating against the other team's average.
// impTag(id) (the small r / i after a player's name when they have an imposter, or are one) comes from imposters.js
let scoutNow = Date.now();   // "now" for the report being drawn: the game's start when reading a past game
const SCOUT = {
  '1v1': { lb: 'rm_1v1_console', elo: 3.006, civ: 0.672, pCiv: 1.275, pMap: 2.415, pAll: 0.512, h2h: 0.7, K: 36, D: 380, civLadder: '1v1 Console',
    // High odds were too high in the forward test (3,246 games: 75%+ picks predicted 87.4%, won 83.9%), so everything past 70% is pulled
    // back toward it by 30% on the logit scale. Chosen on some days of the test and scored on the others: log-loss 0.5554 -> 0.5524.
    shrinkAt: 0.7, shrinkBy: 0.7 },
  team:  { lb: 'rm_team_console', elo: 3.741, civ: 1.425, best: 0.533, K: 35.5, D: 400, civLadder: 'Team Console' },
};
const WOE_SHRINK = 12;
const MAP_CLASS = { 'Arabia': 'open', 'Arabian Desert': 'open', 'Nomad': 'hybrid', 'MegaRandom': 'open', 'Arena': 'closed', 'Black Forest': 'closed', 'Fortress': 'closed',
  'Glade': 'closed', 'Michi': 'closed', 'African Clearing': 'open', 'Coastal Forest': 'hybrid', 'Scandinavia': 'hybrid', 'Yucatan': 'hybrid', 'Baltic': 'water', 'Northern Isles': 'water' };
const SCOUT_CIV_NORM = { Mayans: 'Maya', Inca: 'Incas', Indians: 'Hindustanis' };
const normCiv = c => SCOUT_CIV_NORM[c] || c;
const scoutProfiles = new Map();   // key lb:id -> profile leaderboard entry | 'loading' | 'err'
let civStats = null, civStatsBusy = false;
function loadCivStats() {
  if (civStats || civStatsBusy) return;
  civStatsBusy = true;
  fetch(`https://raw.githubusercontent.com/robbyho-aoe2/player-data/main/data/insights-console-civs.json`).then(r => r.json()).then(j => { civStats = j; queueRender(); }).catch(() => { civStats = { ladders: {} }; }).finally(() => { civStatsBusy = false; });
}
function profileEntry(id, lb) {
  const key = lb + ':' + id, c = scoutProfiles.get(key);
  if (c) return c;
  scoutProfiles.set(key, 'loading');
  histGet(`${API}/profiles/${id}`).then(r => (r && r.ok ? r.json() : Promise.reject())).then(j => {
    scoutProfiles.set(key, (j.leaderboards || []).find(l => l.leaderboardId === lb) || 'err');
  }, () => scoutProfiles.set(key, 'err')).finally(queueRender);
  return 'loading';
}
const ratingBracket = r => (r >= 1700 ? 'high' : r >= 1300 ? 'himid' : r >= 900 ? 'lomid' : 'low');
function civStrength(civ, rating, ladder) {   // shrunk bracket win rate for this civ, or null
  if (!civ || !civStats) return null;
  const d = (((civStats.ladders || {})[ladder] || {}).brackets || {})[ratingBracket(rating)] || {}, c = d[normCiv(civ)];
  return ((c ? c.wins : 0) + 10) / ((c ? c.games : 0) + 20);
}
const logit = p => Math.log(p / (1 - p));
const expect = (a, b, D) => 1 / (1 + Math.pow(10, -(a - b) / D));
function woe(games, pred) {   // wins over expectation per game (shrunk) from games that carry both ratings
  let w = 0, e = 0, n = 0;
  for (const g of games) if (g.r > 0 && g.or > 0 && pred(g)) { w += g.won ? 1 : 0; e += expect(g.r, g.or, 400); n++; }
  return { v: (w - e) / (n + WOE_SHRINK), n, w, e };
}
// Chance that `me` beats `opp` (1v1), with the part each ingredient adds. Missing ingredients (civ not picked yet, history still loading) are skipped.
// Colors for the win-chance bar. Green and red already mean win and loss everywhere on the site, so the bar uses the colors
// the two players picked in the game (1v1), and blue against amber when those are missing or too alike (team games, where
// the players are on different colors but each side is not). Dark in-game colors are lightened so they show on the dark page.
const SIDE_A = '#4c8dff', SIDE_B = '#f59e0b';
function readableColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return null;
  let r = parseInt(m[1].slice(0, 2), 16), g = parseInt(m[1].slice(2, 4), 16), b = parseInt(m[1].slice(4), 16);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (lum < 90) { const k = (90 - lum) / (255 - lum); r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  return [r, g, b].map(v => Math.round(v)).reduce((a, v) => a + v.toString(16).padStart(2, '0'), '#');
}
function sideColors(a, b) {
  const ca = readableColor(a), cb = readableColor(b);
  if (!ca || !cb) return [SIDE_A, SIDE_B];
  const d = [1, 3, 5].reduce((t, i) => t + Math.pow(parseInt(ca.substr(i, 2), 16) - parseInt(cb.substr(i, 2), 16), 2), 0);
  return d < 100 * 100 ? [SIDE_A, SIDE_B] : [ca, cb];
}
// Team games color the sides the way the game does: one team plays the cool colors (blue, green, cyan, grey: player colors
// 1, 3, 5, 7) and the other the warm ones (red, yellow, pink: 2, 4, 6, 8). Falls back to blue and amber when the colors are missing.
const COOL_SIDE = '#4c8dff', WARM_SIDE = '#ff5252';
function teamColors(a, b) {
  const warm = t => { const c = t.map(p => Number(p.color)).filter(n => n > 0); return c.length ? c.filter(n => n % 2 === 0).length * 2 > c.length : null; };
  const wa = warm(a), wb = warm(b);
  if (wa == null || wb == null || wa === wb) return [SIDE_A, SIDE_B];
  return [wa ? WARM_SIDE : COOL_SIDE, wb ? WARM_SIDE : COOL_SIDE];
}
const oddsBar = (pc, cl, cr) => `<div class="sc-bar" style="background:${cr}"><i style="width:${pc}%;background:${cl}"></i></div>`;
// `who` names the two sides in the explanations: 'you' and 'they' for your own game, the players' names for anyone else's.
function oddsFor(mode, me, opp, hMe, hOpp, map, who = ['you', 'they']) {
  const M = SCOUT[mode], rA = me.rating, rB = opp.rating, avg = (rA + rB) / 2;
  const steps = [];
  const rec = r => `${r.w}–${r.n - r.w} (about ${r.e.toFixed(1)} wins expected)`;
  let x = M.elo * (rA - rB) / 400;
  steps.push({ label: 'Rating', p: 1 / (1 + Math.exp(-x)), note: `rating gap ${rA - rB >= 0 ? '+' : ''}${rA - rB}` });
  const sa = civStrength(me.civName, avg, M.civLadder), sb = civStrength(opp.civName, avg, M.civLadder);
  if (sa != null && sb != null) { x += M.civ * (logit(sa) - logit(sb)); steps.push({ label: 'Civs', p: 1 / (1 + Math.exp(-x)), note: `${me.civName} wins ${Math.round(sa * 100)}% and ${opp.civName} ${Math.round(sb * 100)}% in this rating bracket` }); }
  if (hMe && hOpp && mode === '1v1') {
    const add = (label, a, b, coef, note) => { x += coef * (a.v - b.v); steps.push({ label, p: 1 / (1 + Math.exp(-x)), note }); };
    if (me.civName && opp.civName) { const a = woe(hMe.games, g => g.civ === me.civName), b = woe(hOpp.games, g => g.civ === opp.civName); add('Civ skill', a, b, M.pCiv, `with their civs, ${who[0]} ${rec(a)}, ${who[1]} ${rec(b)}`); }
    if (map) { const a = woe(hMe.games, g => g.map === map), b = woe(hOpp.games, g => g.map === map); add('Map', a, b, M.pMap, `on ${map}, ${who[0]} ${rec(a)}, ${who[1]} ${rec(b)}`); }
    const a = woe(hMe.games, () => true), b = woe(hOpp.games, () => true); add('Form', a, b, M.pAll, `overall, ${who[0]} ${a.w}–${a.n - a.w} (about ${a.e.toFixed(0)} expected), ${who[1]} ${b.w}–${b.n - b.w} (about ${b.e.toFixed(0)} expected)`);
    // head-to-head in the games both histories hold: a 2-0 lead moves it about 7 points. Tested on 37,908 games it lowers log-loss
    // 0.5362 -> 0.5323 (5-fold CV); the weight is set below the fitted 0.8 because live histories hold only the meetings still in
    // each player's last 300 games, and an out-of-time fit (earlier meetings only) gave 0.57.
    const meet = hMe.games.filter(g => (g.opps || []).includes(opp.profileId)), hw = meet.filter(g => g.won).length, hl = meet.length - hw;
    if (meet.length) add('Head-to-head', { v: (hw - hl) / (meet.length + 2) }, { v: 0 }, M.h2h, `${who[0]} ${hw}–${hl} against ${who[1]} in their recent games`);
  }
  const raw = 1 / (1 + Math.exp(-x));
  const t = logit(M.shrinkAt), ax = Math.abs(x);
  if (mode === '1v1' && ax > t) {
    const xs = Math.sign(x) * (t + M.shrinkBy * (ax - t)), p = 1 / (1 + Math.exp(-xs));
    if (Math.abs(p - raw) >= 0.005) steps.push({ label: 'Calibration', p, note: 'very high odds were too high in testing, so they are pulled back a little' });
    return { p, raw, steps, gap: rA - rB };
  }
  return { p: raw, raw, steps, gap: rA - rB };
}
// The few steps that moved the odds by 2+ points, in plain words, so a surprising number can be explained.
function oddsNotes(o) {
  // With a rating gap of 150+ the civ, map and form terms did not improve the odds in testing, so only the rating is explained.
  if (o.gap != null && Math.abs(o.gap) >= 150) return [`Rating gap ${o.gap >= 0 ? '+' : ''}${o.gap}: at this size civs, map and form rarely change the result.`];
  const out = []; let prev = null;
  o.steps.forEach((s, i) => { const d = prev == null ? 0 : s.p - prev; if (i > 0 && Math.abs(d) >= 0.02 && s.note) out.push(`${s.label} ${d > 0 ? '+' : '−'}${Math.round(Math.abs(d) * 100)} pts: ${s.note}`); prev = s.p; });
  return out;
}
function oddsTeam(mine, theirs) {   // mine / theirs: arrays of players with rating and civName
  const M = SCOUT.team, avg = a => a.reduce((s, p) => s + p.rating, 0) / a.length, mx = a => Math.max(...a.map(p => p.rating)), all = (avg(mine) + avg(theirs)) / 2;
  const steps = [];
  let x = M.elo * (avg(mine) - avg(theirs)) / 400 + M.best * (mx(mine) - mx(theirs)) / 400;
  steps.push({ label: 'Ratings', p: 1 / (1 + Math.exp(-x)) });
  const cs = a => a.map(p => civStrength(p.civName, all, M.civLadder));
  const ca = cs(mine), cb = cs(theirs);
  if (ca.every(v => v != null) && cb.every(v => v != null)) {
    const m = v => v.reduce((s, q) => s + logit(q), 0) / v.length;
    x += M.civ * (m(ca) - m(cb)); steps.push({ label: 'Civs', p: 1 / (1 + Math.exp(-x)) });
  }
  return { p: 1 / (1 + Math.exp(-x)), steps };
}
function eloChange(mode, mine, theirs) {
  const M = SCOUT[mode], e = expect(mine, theirs, M.D);
  return { win: Math.round(M.K * (1 - e)), loss: Math.round(M.K * e) };
}
// a win chance as a whole percent, never shown as a sure thing
const pctShow = p => Math.min(99, Math.max(1, Math.round(p * 100)));
const pctText = (n, d) => d ? `${Math.round(n / d * 100)}% (${d})` : 'no games';
function formDots(games, n) {
  return games.slice(0, n).map((g, i) => `<i class="fd ${g.won ? 'w' : 'l'}${i === 0 ? ' now' : ''}" title="${i === 0 ? 'Latest game: ' : ''}${g.won ? 'Win' : 'Loss'}${g.map ? ' on ' + esc(g.map) : ''}"></i>`).join('');
}
function streakOf(games) {
  if (!games.length) return '';
  let n = 0; const w = games[0].won;
  for (const g of games) { if (g.won === w) n++; else break; }
  return `${n}${w ? 'W' : 'L'}`;
}
function median(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function scoutTags(opp, games, map, cls) {
  const tags = [];
  if (!games.length) return tags;
  const last10 = games.slice(0, 10), w10 = last10.filter(g => g.won).length;
  if (last10.length >= 8 && w10 >= 8) tags.push(['Hot', 'good', `${w10} wins in their last ${last10.length}`]);
  if (last10.length >= 8 && w10 <= 2) tags.push(['Cold', 'bad', `${w10} wins in their last ${last10.length}`]);
  const st = streakOf(games); if (/^[4-9]|^\d\d/.test(st)) tags.push([st.endsWith('W') ? `${st} streak` : `${st} skid`, st.endsWith('W') ? 'good' : 'bad', 'current streak']);
  const m = map ? woe(games, g => g.map === map) : null;
  if (m && m.n >= 10 && m.v >= 0.06) tags.push(['Strong on this map', 'good', `${m.n} games here, above what their rating predicts`]);
  if (m && m.n >= 10 && m.v <= -0.06) tags.push(['Weak on this map', 'bad', `${m.n} games here, below what their rating predicts`]);
  const civCount = new Map(); games.forEach(g => g.civ && civCount.set(g.civ, (civCount.get(g.civ) || 0) + 1));
  const top = [...civCount.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && games.length >= 30 && top[1] / games.length >= 0.45) tags.push([`${top[0]} one-trick`, '', `${Math.round(top[1] / games.length * 100)}% of their games`]);
  const winDur = games.filter(g => g.won && g.dur).map(g => g.dur), md = median(winDur);
  if (md != null && winDur.length >= 15 && md < 15) tags.push(['Early finisher', '', `median win ends at ${Math.round(md)} min`]);
  const idle = games[0].ts ? Math.floor((scoutNow - Date.parse(games[0].ts)) / 864e5) : 0;
  if (idle >= 45) tags.push(['Inactive', 'bad', `no ranked game in ${idle} days`]);
  const all = games.length, wr = games.filter(g => g.won).length / all;
  if (all < 40 && wr >= 0.65) tags.push(['Few games, high win rate', 'bad', 'could be a new or smurf account']);
  return tags;
}
// One player's block in the report: their in-game color on the left edge, then the stats that matter for this game.
function scoutPlayer(p, h, mode, map, cls, pe, isYou) {
  const col = readableColor(p.colorHex) || '#8b95a1', n = esc(p.name || '');
  const head = `<div class="sc-ph"><span class="sc-pn">${platIcon(p.profileId)}<a href="player.html?id=${p.profileId}">${n}</a>${impTag(p.profileId)}${isYou ? ' <i class="sc-you">you</i>' : ''}</span><span class="sc-pr">${p.rating > 0 ? p.rating : ''}</span></div>` +
    `<div class="sc-pcv">${p.civName ? esc(p.civName) : ''}</div>`;
  const wrap = body => `<div class="sc-pl" style="--pc:${col}">${head}${body}</div>`;
  if (h === 'loading' || h === undefined) return wrap('<div class="sc-dim">checking recent games…</div>');
  if (h === 'err') return wrap('<div class="sc-dim">could not load their games</div>');
  const g = h.games, w = g.filter(x => x.won).length;
  const onMap = map ? g.filter(x => x.map === map) : [], inCls = cls ? g.filter(x => MAP_CLASS[x.map] === cls) : [];
  const last20 = g.slice(0, 20), w20 = last20.filter(x => x.won).length;
  const civs = new Map(); g.forEach(x => { if (!x.civ) return; const c = civs.get(x.civ) || { n: 0, w: 0 }; c.n++; if (x.won) c.w++; civs.set(x.civ, c); });
  const topCivs = [...civs.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 2).map(([c, v]) => `${esc(c)} ${Math.round(v.n / g.length * 100)}% (${Math.round(v.w / v.n * 100)}% won)`).join('<br>');
  const thisCiv = p.civName ? civs.get(p.civName) : null;
  const lastTs = g.length && g[0].ts ? g[0].ts : null, week = g.filter(x => x.ts && scoutNow - Date.parse(x.ts) < 7 * 864e5).length;
  const md = median(g.filter(x => x.dur).map(x => x.dur));
  const row = (k, v) => v ? `<div class="sc-r"><span class="sc-k">${k}</span><span class="sc-v">${v}</span></div>` : '';
  const rows = [
    row(mode === 'team' ? 'Team win rate' : 'Win rate', pctText(w, g.length)),
    row('Last 20', last20.length ? `${pctText(w20, last20.length)}` : ''),
    g.length ? `<div class="sc-dots"><span class="sc-dl">latest ▸</span>${formDots(g, 10)}</div>` : '',
    map ? row(`On ${esc(map)}`, pctText(onMap.filter(x => x.won).length, onMap.length)) : '',
    cls && inCls.length ? row(`${cls} maps`, pctText(inCls.filter(x => x.won).length, inCls.length)) : '',
    p.civName ? row(esc(p.civName), thisCiv ? pctText(thisCiv.w, thisCiv.n) : 'new for them') : '',
    row('Plays', topCivs),
    row('Games', `${md != null ? Math.round(md) + ' min · ' : ''}${week} this week${lastTs ? ' · last ' + agoText(lastTs, scoutNow) : ''}`),
    pe && pe !== 'loading' && pe !== 'err' ? row('Peak', `${pe.maxRating || '–'}${pe.rank ? ' · #' + pe.rank : ''}${pe.streak ? ' · ' + (pe.streak > 0 ? pe.streak + 'W' : -pe.streak + 'L') : ''}`) : '',
  ].join('');
  const tags = scoutTags(p, g, map, cls);
  return wrap(rows + (tags.length ? `<div class="sc-tags">${tags.map(([t, c, why]) => `<span class="sc-tag ${c}" title="${esc(why)}">${esc(t)}</span>`).join('')}</div>` : ''));
}

// g = { m, pl, mine }: the game, its players and the player the report is written from. For your own game that is you; for any
// other game it is the first player on the left side, and the labels use their name (or "Left team") instead of "You".
// Both sides are shown in two columns, each player with their in-game color, so the report reads like the game lobby.
//   g.asOf   a start time (ms): each player's form is read from their games before it, and the report shows the result
//   g.subject  the report is about `mine` (a profile page), so the labels use their name instead of "You" or "Left team"
function scoutReport(g, isMine) {
  const { m, pl, mine } = g, teams = groupTeams(pl), asOf = g.asOf || 0, subject = !!g.subject;
  scoutNow = asOf || Date.now();
  const myTeam = teams.find(t => t.some(p => p.profileId === mine.profileId)) || [], opps = pl.filter(p => !myTeam.includes(p));
  if (!opps.length) return '';
  const is1v1 = m.leaderboardId === 'rm_1v1_console' && opps.length === 1 && myTeam.length === 1;
  const mode = is1v1 ? '1v1' : 'team', lb = SCOUT[mode].lb;
  const nm = esc(mine.name || ''), lab = isMine ? 'You' : (is1v1 || subject ? nm : 'Left team'), labTeam = isMine ? 'Your team' : subject ? `${nm}'s team` : 'Left team';
  if (m.leaderboardId !== lb) return `<div class="scout"><div class="sc-head">Scouting${isMine ? ' your game' : ''}</div><div class="sc-dim">Scouting works for ranked 1v1 and team games on console. This one is ${esc(ladderLabel(m))}.</div></div>`;
  loadCivStats();
  const map = m.mapName || '', cls = MAP_CLASS[map] || null;
  const hist = p => { const h = histWant(p.profileId, lb); return asOf && h !== 'loading' && h !== 'err' ? { games: h.games.filter(x => x.ts && Date.parse(x.ts) < asOf) } : h; };
  const hAll = new Map(pl.map(p => [p.profileId, hist(p)]));
  const loaded = h => h && h !== 'loading' && h !== 'err';
  const hMe = hAll.get(mine.profileId), hOpps = opps.map(p => hAll.get(p.profileId));
  const ready = loaded(hMe) && hOpps.every(loaded);
  const myAvg = Math.round(myTeam.map(p => p.rating || 0).reduce((a, b) => a + b, 0) / myTeam.length), opAvg = Math.round(opps.map(p => p.rating || 0).reduce((a, b) => a + b, 0) / opps.length);
  const [cl, cr] = is1v1 ? sideColors(mine.colorHex, opps[0].colorHex) : teamColors(myTeam, opps);
  let odds = '', change = '';
  if (is1v1 && mine.rating > 0 && opps[0].rating > 0) {
    const o = oddsFor('1v1', mine, opps[0], ready ? hMe : null, ready ? hOpps[0] : null, map, isMine ? ['you', 'they'] : [mine.name || 'left player', opps[0].name || 'right player']);
    const pc = pctShow(o.p);
    odds = `<div class="sc-odds" title="Model fitted on 37,908 recent console ranked 1v1s. Rating-only picks the winner 71% of the time; this model 72%.">${oddsBar(pc, cl, cr)}` +
      `<div class="sc-pc"><b style="color:${cl}">${lab} ${pc}%</b><span style="color:${cr}">${100 - pc}% ${esc(opps[0].name || '')}</span></div>` +
      `<div class="sc-why">${o.steps.map(s => `${s.label} ${Math.round(s.p * 100)}%`).join(' → ')}${ready ? '' : ' (form still loading)'}</div>${oddsNotes(o).map(n => `<div class="sc-why">${esc(n)}</div>`).join('')}</div>`;
  } else if (!is1v1 && myTeam.every(p => p.rating > 0) && opps.every(p => p.rating > 0)) {
    const o = oddsTeam(myTeam, opps), pc = pctShow(o.p);
    odds = `<div class="sc-odds" title="Fitted on 25,664 recent console team games. Rating only picks the winner 75.9% of the time; this model 76.1%.">${oddsBar(pc, cl, cr)}<div class="sc-pc"><b style="color:${cl}">${labTeam} ${pc}%</b><span style="color:${cr}">${100 - pc}% them</span></div><div class="sc-why">${o.steps.map(s => `${s.label} ${Math.round(s.p * 100)}%`).join(' → ')}</div></div>`;
  }
  if (asOf) {
    const d = mine.ratingDiff;
    change = mine.won == null ? '' : `<div class="sc-elo"><span class="sc-k">Result</span> ${subject ? nm : 'you'} <b class="${mine.won ? 'up' : 'dn'}">${mine.won ? 'won' : 'lost'}</b>${d ? ` (${d > 0 ? '+' : '−'}${Math.abs(d)} rating)` : ''}</div>` +
      '<div class="sc-dim">Form and records are from each player\'s games before this one, within their last 300 ranked games.</div>';
  } else if (mine.rating > 0 && opAvg > 0) {
    const c = eloChange(mode, mine.rating, opAvg);
    change = `<div class="sc-elo"><span class="sc-k">Rating</span> ${mine.rating} v ${opAvg} (${mine.rating - opAvg >= 0 ? '+' : ''}${mine.rating - opAvg}) · win <b class="up">+${c.win}</b> → ${mine.rating + c.win} · loss <b class="dn">−${c.loss}</b> → ${mine.rating - c.loss}${isMine ? '' : ' <span class="sc-dim">(for ' + esc(mine.name || '') + ')</span>'}</div>`;
  }
  const peak = p => (is1v1 && !asOf ? profileEntry(p.profileId, lb) : null);
  const col = (team, label, avg, c, youId) => `<div class="sc-col" style="--c:${c}"><div class="sc-colhead"><span>${label}</span><span class="sc-avg">${asOf && team.some(p => p.won != null) ? `<b class="sc-res ${team.some(p => p.won) ? 'w' : 'l'}">${team.some(p => p.won) ? 'Won' : 'Lost'}</b> ` : ''}${avg > 0 ? 'avg ' + avg : ''}</span></div>` +
    team.map(p => scoutPlayer(p, hAll.get(p.profileId), mode, map, cls, peak(p), p.profileId === youId && !subject)).join('') + `</div>`;
  const h2h = is1v1 && loaded(hMe) ? (() => {
    const s = hMe.games.filter(x => x.opps.includes(opps[0].profileId)), w = s.filter(x => x.won).length;
    return `<div class="sc-h2h"><span class="sc-k">Head-to-head</span> ${s.length ? `${isMine ? 'you' : lab} ${w}–${s.length - w}` : 'first match'}${asOf ? ' before this game' : ''}</div>`;
  })() : '';
  const body = `${odds}${change}<div class="sc-cols">${col(myTeam, is1v1 ? esc(mine.name || '') : labTeam, myAvg, cl, isMine ? mine.profileId : -1)}${col(opps, is1v1 ? esc(opps[0].name || '') : (isMine ? 'Their team' : subject ? 'Opponents' : 'Right team'), opAvg, cr, -1)}</div>${h2h}`;
  if (!isMine) return `<div class="g-scout-body sc-inline">${body}</div>`;
  return `<div class="scout"><div class="sc-head"><span>Scouting your game</span><span class="sc-sub">${esc(map || 'Unknown map')}${cls ? ' · ' + cls : ''} · ${mode === '1v1' ? '1v1' : groupTeams(pl).map(t => t.length).join('v')} · <span class="g-timer">${clock(Date.now() - Date.parse(m.started))}</span> in</span></div>${body}</div>`;
}
