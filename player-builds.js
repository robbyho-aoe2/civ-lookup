// Player builds: build orders reverse-engineered from a player's real replays (see replay-tools/export_builds.mjs).
// Each recipe is keyed to villager count, not the clock. Data lives in player-builds/index.json plus one file per recipe.
//   PlayerBuilds.loadIndex()        -> Promise<array of builds>
//   PlayerBuilds.forPlayer(id)      -> Promise<builds for that profileId>
//   PlayerBuilds.forCiv(civ)        -> Promise<builds for that civ>
//   PlayerBuilds.href(build)        -> link to the Player Builds tab on build-order.html
//   PlayerBuilds.mount(root, opts)  -> the picker + recipe view (build-order.html)
(function () {
  const DIR = 'player-builds/';
  let indexP = null;

  function loadIndex() {
    if (!indexP) indexP = fetch(DIR + 'index.json').then(r => (r.ok ? r.json() : { builds: [] })).then(d => d.builds || []).catch(() => []);
    return indexP;
  }
  const forPlayer = id => loadIndex().then(b => b.filter(x => String(x.profileId) === String(id)));
  const forCiv = civ => loadIndex().then(b => b.filter(x => x.civ === civ));
  const href = b => 'build-order.html?mode=players&build=' + encodeURIComponent(b.id);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const CSS = `
.pb-filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 12px}
.pb-picks{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px}
.pb-pick{text-align:left;background:var(--bg);border:1px solid var(--border2);border-radius:var(--radius,8px);padding:10px 12px;cursor:pointer;color:var(--text2);font-family:inherit}
.pb-pick:hover{border-color:var(--amber)}
.pb-pick.on{border-color:var(--amber);background:var(--amberBg)}
.pb-pick b{display:block;font-size:13px;color:var(--text);margin-bottom:2px}
.pb-pick.on b{color:var(--amberL)}
.pb-pick span{font-size:11px;line-height:1.4;display:block}
.pb-head h2{margin:0 0 2px;font-size:18px;color:var(--text)}
.pb-head p{margin:0;font-size:12px;color:var(--text2)}
.pb-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin:14px 0}
.pb-tile{background:var(--bg);border:1px solid var(--border2);border-radius:10px;padding:8px 11px}
.pb-tile b{display:block;font-size:20px;line-height:1.15;color:var(--text);font-variant-numeric:tabular-nums}
.pb-tile span{font-size:11px;color:var(--text2)}
.pb-parts{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,390px),1fr));gap:14px;align-items:start}
.pb-part{background:var(--bg);border:1px solid var(--border2);border-radius:12px;overflow:hidden;min-width:0}
.pb-part h3{margin:0;padding:10px 14px;background:var(--surf2);border-bottom:1px solid var(--border2);font-size:15px;color:var(--text);display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.pb-part h3 em{font-style:normal;font-weight:500;font-size:11.5px;color:var(--text2)}
.pb-colhead{display:grid;grid-template-columns:52px 1fr auto;gap:8px;align-items:center;padding:6px 12px;font-size:10px;letter-spacing:.8px;text-transform:uppercase;color:var(--text3);font-weight:700;border-bottom:1px solid var(--border2)}
.pb-colhead .rc{display:grid;grid-template-columns:repeat(3,30px);gap:3px;justify-items:center}
.pb-colhead img{width:20px;height:20px;display:block}
.pb-rows{list-style:none;margin:0;padding:0}
.pb-band{padding:5px 14px;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase}
.pb-band.dark{background:#2c3342;color:#8fa3c9}
.pb-band.up1,.pb-band.up2{background:#3a2f1a;color:#e0a030}
.pb-band.feudal{background:#3b2326;color:#e08a7a}
.pb-band.castle{background:#2d2640;color:#b9a3f0}
.pb-row{display:grid;grid-template-columns:52px 24px 1fr auto;gap:8px;align-items:center;padding:6px 12px;border-bottom:1px solid var(--border)}
.pb-row:last-child{border-bottom:0}
.pb-row.age{background:rgba(255,255,255,.045)}
.pb-pop{font-size:17px;font-weight:800;text-align:center;color:var(--text2);white-space:nowrap;font-variant-numeric:tabular-nums}
.pb-row.has .pb-pop{color:var(--text)}
.pb-ico{width:24px;height:24px;display:block;object-fit:contain}
.pb-shape{justify-self:center;width:14px;height:14px;border-radius:3px;background:var(--amberL)}
.pb-shape.army,.pb-shape.fight{background:#e0603c;transform:rotate(45deg) scale(.82);border-radius:2px}
.pb-shape.tech{background:none;width:0;height:0;border-radius:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:14px solid #c9b458}
.pb-shape.age{background:none;border:3px solid var(--text);border-radius:50%;width:16px;height:16px}
.pb-what{min-width:0}
.pb-what b{font-size:14px;font-weight:600;color:var(--text)}
.pb-row.age .pb-what b,.pb-row.army .pb-what b,.pb-row.unit .pb-what b{font-weight:800}
.pb-v{margin-left:7px;font-size:11px;font-weight:700;color:var(--text2);background:var(--surf2);border-radius:20px;padding:1px 7px;white-space:nowrap}
.pb-what small{display:block;color:var(--text3);font-size:11px;line-height:1.25;margin-top:1px}
.pb-res{display:grid;grid-template-columns:repeat(3,30px);gap:3px}
.pb-res i{font-style:normal;font:600 14px/22px system-ui,sans-serif;text-align:center;border-radius:6px;height:22px;color:var(--text2)}
.pb-res i.nil{color:var(--text3)}
.pb-res i.chg{color:var(--text);font-weight:800}
.pb-res i.f.chg{background:rgba(143,209,90,.2);box-shadow:inset 0 0 0 1px rgba(143,209,90,.5)}
.pb-res i.w.chg{background:rgba(200,146,42,.22);box-shadow:inset 0 0 0 1px rgba(200,146,42,.55)}
.pb-res i.g.chg{background:rgba(240,212,88,.2);box-shadow:inset 0 0 0 1px rgba(240,212,88,.5)}
.pb-foot{margin-top:14px;font-size:12px;color:var(--text2);display:grid;gap:6px}
.pb-foot p{margin:0}
.pb-foot b{color:var(--text)}
.pb-empty{font-size:13px;color:var(--text2)}
@media (max-width:480px){.pb-row{grid-template-columns:46px 22px 1fr auto;gap:6px;padding:6px 8px}.pb-colhead{grid-template-columns:46px 1fr auto;padding-inline:8px}.pb-res,.pb-colhead .rc{grid-template-columns:repeat(3,27px)}.pb-pop{font-size:16px}}
`;
  function injectCss() {
    if (document.getElementById('pb-css')) return;
    const s = document.createElement('style'); s.id = 'pb-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  const BAND = { dark: 'Dark Age', up1: 'On the way up', feudal: 'Feudal Age', up2: 'On the way up', castle: 'Castle Age' };
  const icon = n => `<img class="pb-ico" src="img/icons/${n}.png" alt="" loading="lazy">`;

  function rowHtml(r) {
    const pop = r.pop[0] === r.pop[1] ? r.pop[0] : r.pop[0] + '–' + r.pop[1];
    const has = r.vils != null;
    const mark = r.kind === 'vill' && r.res ? icon(r.res) : r.kind === 'unit' ? icon(r.icon || 'infantry') : `<span class="pb-shape ${esc(r.chip)}"></span>`;
    const cell = (v, c, k) => `<i class="${k}${c ? ' chg' : ''}${v ? '' : ' nil'}">${v || '·'}</i>`;
    return `<li class="pb-row ${esc(r.kind)}${has ? ' has' : ''}"><span class="pb-pop">${pop}</span>${mark}<div class="pb-what"><b>${esc(r.text)}</b>${has ? `<span class="pb-v">${r.vils} ${r.vils === 1 ? 'vill' : 'vills'}</span>` : ''}${r.note ? `<small>${esc(r.note)}</small>` : ''}</div><div class="pb-res">${cell(r.alloc[0], r.changed[0], 'f')}${cell(r.alloc[1], r.changed[1], 'w')}${cell(r.alloc[2], r.changed[2], 'g')}</div></li>`;
  }

  function recipeHtml(rc) {
    const head = `<div class="pb-colhead"><span>Vills</span><span>Task</span><span class="rc">${['food', 'wood', 'gold'].map(k => `<img src="img/icons/${k}.png" alt="${k}" title="${k}">`).join('')}</span></div>`;
    // a row goes in the part whose range [from, to) holds its key
    const bucket = rc.parts.map(() => []);
    for (const r of rc.rows) { const i = rc.parts.findIndex(p => r.key >= p.from && r.key < p.to); bucket[i < 0 ? bucket.length - 1 : i].push(r); }
    const out = rc.parts.map((p, i) => {
      const rs = bucket[i]; if (!rs.length) return '';
      let last = i > 0 ? bucket[i - 1].length ? bucket[i - 1][bucket[i - 1].length - 1].band : null : null, body = '';
      for (const r of rs) { if (r.band !== last) { body += `<li class="pb-band ${esc(r.band)}">${BAND[r.band] || ''}</li>`; last = r.band; } body += rowHtml(r); }
      const span = rc.parts.length > 1 ? `<em>villagers ${rs[0].pop[0]} → ${rs[rs.length - 1].pop[1]}</em>` : '';
      return `<section class="pb-part"><h3>${esc(p.name)}${span}</h3>${head}<ul class="pb-rows">${body}</ul></section>`;
    }).join('');
    const tiles = rc.tiles.length ? `<div class="pb-tiles">${rc.tiles.map(t => `<div class="pb-tile"><b>${esc(t.v)}</b><span>${esc(t.l)}</span></div>`).join('')}</div>` : '';
    const rec = rc.wins != null ? ` (${rc.wins}–${rc.games - rc.wins})` : '';
    return `<div class="pb-head"><h2>${esc(rc.player)} · ${esc(rc.civ)} · ${esc(rc.title)}</h2><p>Built from ${rc.games} of their recorded games${rec}${rc.map ? ' on ' + esc(rc.map) : ''}${rc.mode ? ' · ' + esc(rc.mode) : ''}. ${esc(rc.blurb)}</p></div>${tiles}<div class="pb-parts">${out}</div>
<div class="pb-foot"><p><b>How to read it.</b> The left number is how many villagers they have when the step happens. “4 vills” means the next 4 villagers go to that job. The three columns are where all their villagers are working after the step (food, wood, gold); a tinted cell changed on that step. Houses and farms are batched.</p><p>The steps are what the player usually does in these games, put in order by villager count, not a copy of any one game. Clock times are the typical (median) time and only for key steps. The split of villagers is read from the replay commands, so it can be off by a villager or two, mostly when many are building or garrisoned.</p></div>`;
  }

  async function mount(root, opts) {
    opts = opts || {};
    injectCss();
    const builds = await loadIndex();
    if (!builds.length) { root.innerHTML = '<p class="pb-empty">No player builds have been published yet.</p>'; return; }
    const civs = [...new Set(builds.map(b => b.civ))].sort();
    let civ = opts.civ || '', cur = opts.build || null;
    root.innerHTML = `<div class="pb-filters"><label>Civilization <select id="pb-civ"><option value="">All civilizations</option>${civs.map(c => `<option>${esc(c)}</option>`).join('')}</select></label></div><div class="pb-picks" id="pb-picks"></div><div id="pb-view" style="margin-top:18px"></div>`;
    const sel = root.querySelector('#pb-civ'), picks = root.querySelector('#pb-picks'), view = root.querySelector('#pb-view');
    sel.value = civ;
    const show = async id => {
      cur = id;
      const b = builds.find(x => x.id === id);
      picks.querySelectorAll('.pb-pick').forEach(el => el.classList.toggle('on', el.dataset.id === id));
      if (!b) { view.innerHTML = ''; return; }
      view.innerHTML = '<p class="pb-empty">Loading…</p>';
      try {
        const rc = await (await fetch(DIR + b.file)).json();
        view.innerHTML = recipeHtml(rc);
      } catch (e) { view.innerHTML = '<p class="pb-empty">Could not load this build order.</p>'; }
      if (opts.onSelect) opts.onSelect(b);
    };
    const list = () => {
      const bs = builds.filter(b => !civ || b.civ === civ);
      picks.innerHTML = bs.map(b => `<button class="pb-pick${b.id === cur ? ' on' : ''}" data-id="${esc(b.id)}" type="button"><b>${esc(b.player)} · ${esc(b.civ)}</b><span>${esc(b.title)}${b.map ? ' · ' + esc(b.map) : ''}</span><span>${b.games} games${b.wins != null ? ', ' + b.wins + '–' + (b.games - b.wins) : ''}</span></button>`).join('') || '<p class="pb-empty">Nothing for this civilization yet.</p>';
      picks.querySelectorAll('.pb-pick').forEach(el => el.addEventListener('click', () => show(el.dataset.id)));
    };
    sel.addEventListener('change', () => { civ = sel.value; list(); });
    list();
    if (cur && builds.some(b => b.id === cur)) show(cur);
    else if (builds.length === 1 || opts.autoFirst) show(builds.filter(b => !civ || b.civ === civ)[0].id);
  }

  window.PlayerBuilds = { loadIndex, forPlayer, forCiv, href, mount };
})();
