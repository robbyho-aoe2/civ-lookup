// Small tags after a player's name, everywhere it shows up on the site:
//   r  the real player, when other accounts imitate their name       i  an imposter account (a near-identical name to a real player)
//   a  the player has alt accounts (a known alt/smurf group)
//
// Loaded by every page that shows player names. Two ways it gets used:
//   impTag(id)      returns the tag HTML for a profile id (scout.js and Console Live call it while building their markup)
//   the auto-tagger watches the page and adds the tag after any link to player.html?id=<id>, and after a name shown as plain text
//   (a table cell, a bold name, a weekly-recap row), so pages do not each need editing.
// Keep the lists in sync with IMPOSTER_ACCOUNTS and KNOWN_ALT_GROUPS in player.html and insights.html. To add an imposter: a row in
// IMPOSTERS and its names in NAMES. Alt accounts match by profile id (links), since their names change.
(function () {
  const IMPOSTERS = [
    { id: 24659170, real: 12477800, note: 'Near-identical name to Ghost of 6am' },
    { id: 26084405, real: 3452279, note: 'Near-identical name to OleCrookedWoody' },
    { id: 26247195, real: 3452279, note: 'Near-identical name to OleCrookedWoody' },
    { id: 26120403, real: 15438688, note: 'Near-identical name to Veeling' },
  ];
  const NAMES = { 12477800: 'Ghost of 6am', 24659170: 'Ghost 0f 6am', 3452279: 'OleCrookedWoody', 26084405: 'OleCrookedW00dy', 26247195: 'OleCrookedWo0dy', 15438688: 'Veeling', 26120403: 'VeeIing' };
  const ALT_GROUPS = [[12554124,15480913],[20168942,12798178,22701056,25013161],[20945272,13379095],[23790720,12760988,23284031,18667559,26159176],[23477132,25840006,25065929,25406411,25696131],[22759370,24074346],[25767683,25437131,24924936,21495993],[12484696,16389471],[24133272,15424523],[14770440,12637242],[18487891,13624096],[23147426,25504514],[22703136,12471204],[26051252,25476302,24668882],[23063731,26050716],[25111209,12469445],[23364870,20575320],[12712958,22085091],[23317362,23053270],[15171886,12743207],[23671708,22702087],[18518087,14590893],[23542892,12477800],[19283861,11828362],[25666181,14653704],[23009008,23448013],[15717181,17719038],[14132480,16267636],[21657258,12597326]];
  window.ALT_GROUPS = ALT_GROUPS;   // the tier list maker merges a player's alts into one entry
  const ALT_COUNT = {}; ALT_GROUPS.forEach(g => g.forEach(id => { ALT_COUNT[id] = g.length - 1; }));
  const BY_NAME = {}; Object.entries(NAMES).forEach(([id, n]) => { BY_NAME[n] = Number(id); });
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function impTag(id) {
    id = Number(id);
    const imp = IMPOSTERS.find(e => e.id === id);
    if (imp) return `<span class="imp i" title="Imposter account: ${esc(imp.note)}. Not confirmed to be the same real person.">i</span>` + altTag(id);
    const n = IMPOSTERS.filter(e => e.real === id).length;
    const ri = imp ? '' : n ? `<span class="imp r" title="Real account: ${n === 1 ? '1 imposter account uses' : n + ' imposter accounts use'} a near-identical name.">r</span>` : '';
    return ri + altTag(id);
  }
  function altTag(id) {
    const n = ALT_COUNT[id];
    return n ? `<span class="imp a" title="This player has ${n === 1 ? '1 alt account' : n + ' alt accounts'} (a known alt group). Open their page to see them.">a</span>` : '';
  }
  window.impTag = impTag;

  if (!document.getElementById('imp-css')) {
    const st = document.createElement('style'); st.id = 'imp-css';
    st.textContent = '.imp{display:inline-block;margin-left:3px;min-width:11px;padding:0 3px;border-radius:3px;font-size:9px;font-weight:700;line-height:12px;text-align:center;text-transform:lowercase;vertical-align:1px;cursor:help;font-style:normal;letter-spacing:0;}' +
      '.imp.r{color:#7db4ff;border:1px solid rgba(125,180,255,.5);}.imp.i{color:#fbbf24;border:1px solid rgba(251,191,36,.5);}.imp.a{color:#c3a6ff;border:1px solid rgba(195,166,255,.5);}';
    document.head.appendChild(st);
  }

  const hasTag = el => (el.nextElementSibling && el.nextElementSibling.classList.contains('imp')) || (el.lastElementChild && el.lastElementChild.classList.contains('imp'));
  function tag(el, id, inside) {
    const t = impTag(id); if (!t || hasTag(el)) return;
    el.insertAdjacentHTML(inside ? 'beforeend' : 'afterend', t);
  }
  function scan(root) {
    root = root || document.body; if (!root || !root.querySelectorAll) return;
    // links to a player's page
    root.querySelectorAll('a[href*="player.html?id="]').forEach(a => {
      if (a.closest('.no-imp')) return;   // a block that draws its own tags
      const m = /player\.html\?id=(\d+)/.exec(a.getAttribute('href') || ''); if (!m || !impTag(m[1])) return;
      if (a.querySelector('.imp') || hasTag(a)) return;
      // a card-style link (name and sub-line inside): tag the name; otherwise tag after the link
      const b = a.querySelector('b, .nm, .sr-name'); tag(b || a, m[1], !!b);
    });
    // names written as plain text
    root.querySelectorAll('td, th, b, strong, span, li, h1, h2, h3').forEach(el => {
      if (el.children.length || el.classList.contains('imp')) return;
      if (el.closest('.no-imp')) return;
      const id = BY_NAME[(el.textContent || '').trim()]; if (id == null) return;
      if (el.closest('a[href*="player.html?id="]')) return;   // the link pass handles those
      tag(el, id, el.tagName === 'TD' || el.tagName === 'TH' || el.tagName === 'LI');
    });
  }
  window.tagImposters = scan;
  let timer = null;
  const later = () => { clearTimeout(timer); timer = setTimeout(() => scan(), 250); };
  const start = () => { scan(); new MutationObserver(later).observe(document.body, { childList: true, subtree: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
