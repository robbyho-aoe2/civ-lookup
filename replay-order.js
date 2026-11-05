/* Build order from a replay file, in the browser.

   ReplayOrder.load(matchId, profileIds, rawMatch)  -> data   downloads the replay (tries each profile id), reads it, rebuilds each player's opening
   ReplayOrder.steps(player, windowMs)              -> rows    one row per step: time, text, villager count and split
   ReplayOrder.toText(data, slot, windowMs)         -> string  the same list as plain text

   The replay file stores the commands players gave, not what the game did with them, so everything here is rebuilt from commands:
     1. when each villager came out: the recording player's own "Villager Created" messages; for others, queue commands replayed
        at 25 s each with the Town Center blocked while an age-up researches
     2. a new villager goes where the Town Center rally point pointed when it came out
     3. gather/build orders list the object ids they were given; those ids are matched back to production order, so a later
        group order moves the right villagers
   The villager split is an estimate and gets rougher the longer the game runs (second Town Centers, farm re-seeding).
   Python reference version, used to check this one: replay-tools/build_order.py */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReplayOrder = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ids the bundled name list does not know yet (names taken from the game's own messages).
  // Settlement (2556) is the drop-off the South American civs build in place of mills and camps; Incas and Tupi both use this id.
  // Mule Cart (1889, Khitans) is "built" by villagers and works as a movable drop-off for hunt, wood, stone and gold.
  const BUILDING_NAMES = { 2556: 'Settlement', 1889: 'Mule Cart' };
  const UNIT_NAMES = { 2550: 'Champi Scout', 1963: 'Llama' };
  // the Champi line (Inca, Tupi, Muisca, Mapuche); names read off the game's own "Research Complete" messages in a Tupi recording
  const TECH_NAMES = { 1402: 'Champi Runner', 1351: 'Champi Warrior', 1352: 'Elite Champi Warrior' };
  const MILITARY_BLD = new Set(['Barracks', 'Archery Range', 'Stable', 'Siege Workshop', 'Castle', 'Krepost', 'Donjon']);
  const DROPOFF_BLD = new Set(['Lumber Camp', 'Mining Camp', 'Mill', 'Settlement', 'Mule Cart', 'Dock', 'Folwark']);
  const AGE_TECH = { 101: 'Feudal Age', 102: 'Castle Age', 103: 'Imperial Age' };
  const LIVESTOCK = { Sheep: 'sheep', Goat: 'goat', Pig: 'pig', Llama: 'llama', 'Cow A': 'cow', 'Cow B': 'cow', 'Cow C': 'cow', 'Cow D': 'cow' };      // the herd animals villagers are sent to at the start
  const FOOD_NAMES = new Set(['Wild Boar', 'Deer', 'Goose', 'Fruit Bush', 'Forage Bush', 'Javelina', 'Zebra', 'Ostrich', 'Gazelle', 'Elephant', 'Turkey', 'Ibex', 'Wild Horse', 'Wild Camel', 'Wild Bactrian Camel', 'Rhinoceros', 'Elk', ...Object.keys(LIVESTOCK)]);
  // One label per kind of animal. The boar equivalents (the ones that fight back and are lured to the Town Center: boar, javelina, elephant, rhino) are 'lure <animal>'; the rest (deer, elk, zebra, ostrich, ibex...) are plain hunting.
  // An animal the bundled list does not know yet still shows as plain 'hunt'.
  const LABELS = Object.assign({ 'Wild Boar': 'lure boar', Deer: 'deer', Goose: 'goose', 'Fruit Bush': 'berries', 'Forage Bush': 'berries', Javelina: 'lure javelina', Zebra: 'zebra', Ostrich: 'ostrich', Gazelle: 'gazelle',
    Elephant: 'lure elephant', Rhinoceros: 'lure rhinoceros', Turkey: 'turkey', Ibex: 'ibex', Elk: 'elk', 'Wild Horse': 'wild horse', 'Wild Camel': 'wild camel', 'Wild Bactrian Camel': 'wild camel' }, LIVESTOCK);
  const VILLAGER_TYPES = new Set([83, 293]);
  // Extra villagers some civs get at the start. With a nomad start they only appear once the first Town Center is finished.
  const START_EXTRA = { Chinese: 3, Maya: 1 };
  const WORDS = { trees: 'wood', hunt: 'hunted animals' };
  const RES_LETTER = { food: 'F', wood: 'W', gold: 'G', stone: 'S', idle: 'I' };
  const DETAIL_UNTIL = 660000;   // every villager gets its own step up to 11:00; after that runs are grouped so a full game stays readable

  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const mmss = ms => { const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  // ------------------------------------------------------------------ reading the file
  async function inflateRaw(u8) {
    const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzipRecord(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    let e = u8.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('not a zip file');
    const n = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    for (let i = 0; i < n; i++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), cmtLen = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen));
      if (/\.aoe2record$/i.test(name)) {
        const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
        const data = u8.subarray(start, start + csize);
        return method === 0 ? data : inflateRaw(data);
      }
      p += 46 + nameLen + extraLen + cmtLen;
    }
    throw new Error('no recording in the download');
  }

  // body: every command with its game-clock time, plus the recording player's messages.  Layout follows the DE >= 71094 command format.
  function parseBody(u8, hl) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const len = u8.length, dec = new TextDecoder();
    const actions = [], chat = [];
    let pos = hl, t = 0, unsupported = 0;
    while (pos + 4 <= len) {
      const op = dv.getUint32(pos, true);
      if (op === 5) { pos += 32; continue; }
      if (op === 1) {
        const length = dv.getUint32(pos + 4, true), id = dv.getUint8(pos + 8), pb = pos + 9, end = pb + length - 1;
        if (end + 4 > len) break;
        pos = end + 4;
        if (id === 255) break;
        if (id !== 0 && id !== 1 && id !== 21 && id !== 33 && id !== 101 && id !== 102 && id !== 106 && id !== 107 && id !== 120 && id !== 127 && id !== 128 && id !== 129) continue;
        const pid = dv.getInt8(pb), plen = dv.getInt16(pb + 1, true);
        if (length - 1 !== plen + 3) { unsupported++; continue; }
        const r = pb + 3, ids = (at, n) => { const out = []; for (let i = 0; i < n; i++) out.push(dv.getUint32(at + 4 * i, true)); return out; };
        let a = null;
        if (id === 21 || id === 33 || id === 107) {
          const n = dv.getUint32(r, true);
          if (n < 2000) a = { a: 'ARMY', n, ids: [] };       // attack-move / patrol / attack-ground: the size of the group is enough here
        } else if (id === 1) {
          const sel = dv.getUint32(r, true);
          if (sel > 0 && sel < 500) a = { a: 'STOP', ids: ids(r + 4, sel) };
        } else if (id === 128 || id === 106) {
          a = { a: id === 128 ? 'BACK_TO_WORK' : 'DELETE', ids: [dv.getUint32(r, true)] };
        } else if (id === 127) {
          a = { a: 'TOWN_BELL', building: dv.getUint32(r, true), mode: dv.getInt8(r + 4), ids: [] };
        } else if (id === 101) {
          const sel = dv.getInt16(r + 4, true);
          a = { a: 'RESEARCH', tech: dv.getInt16(r + 6, true), ids: [dv.getUint32(r, true)] };
        } else if (id === 102) {
          const sel = dv.getInt16(r, true);
          a = { a: 'BUILD', x: dv.getFloat32(r + 4, true), y: dv.getFloat32(r + 8, true), building: dv.getUint32(r + 12, true), ids: ids(r + 28, sel) };
        } else if (id === 129) {
          const sel = dv.getInt16(r, true);
          a = { a: 'DE_QUEUE', unit: dv.getInt16(r + 8, true), amount: dv.getInt16(r + 10, true), ids: ids(r + 16, sel) };
        } else if (id === 0) {
          const sel = dv.getInt16(r + 12, true);
          a = { a: 'ORDER', target: dv.getUint32(r, true), x: dv.getFloat32(r + 4, true), y: dv.getFloat32(r + 8, true), ids: sel > 0 ? ids(r + 20, sel) : [] };
        } else if (id === 120) {
          const sel = dv.getInt16(r, true);
          a = { a: 'GATHER_POINT', x: dv.getFloat32(r + 4, true), y: dv.getFloat32(r + 8, true), target: dv.getInt32(r + 12, true), ids: ids(r + 21, sel) };
        }
        if (a) { a.t = t; a.pid = pid; actions.push(a); }
      } else if (op === 2) {
        t += dv.getUint32(pos + 4, true);
        if (dv.getUint32(pos + 8, true) !== 0) pos += 8;
        else pos += dv.getUint32(pos + 24, true) ? 368 : 36;
      } else if (op === 3) pos += 16;
      else if (op === 4) {
        const n = dv.getUint32(pos + 8, true);
        chat.push({ t, m: dec.decode(u8.subarray(pos + 12, pos + 12 + n)) });
        pos += 12 + n;
      } else break;
    }
    return { actions, chat, duration: t, unsupported };
  }

  // header: player names in slot order, and the starting object table (heuristic pattern scan: id, type, x, y)
  function playerNames(h, limit) {
    const out = [], end = Math.min(h.length - 70, 6e6);
    for (let i = 0; i < end && out.length < limit + 8; i++) {
      if (h[i] === 0x60 && h[i + 1] === 0x0a && h[i + 2] >= 1 && h[i + 2] <= 0x30 && h[i + 3] === 0) {
        const n = h[i + 2];
        let ok = true;
        for (let k = 0; k < n; k++) if (h[i + 4 + k] < 0x20 || h[i + 4 + k] === 0x7f) { ok = false; break; }
        const s = ok ? new TextDecoder().decode(h.subarray(i + 4, i + 4 + n)) : '';
        if (ok && !s.startsWith('NONE:') && !out.includes(s)) out.push(s);
      }
    }
    return out.slice(0, limit);
  }

  function scanObjects(h) {
    const dv = new DataView(h.buffer, h.byteOffset, h.byteLength), n = h.length, out = new Map();
    for (let i = 16; i < n - 28; i++) {
      const b1 = h[i + 8], b2 = h[i + 12];
      if (b1 < 0x3f || b1 > 0x43 || b2 < 0x3f || b2 > 0x43) continue;
      const x = dv.getFloat32(i + 5, true), y = dv.getFloat32(i + 9, true);
      if (!(x > 0.4 && x < 260 && y > 0.4 && y < 260)) continue;
      const oid = dv.getUint32(i, true), ut = dv.getUint16(i - 16, true);
      if (oid > 0 && oid < 80000 && ut && !out.has(oid)) out.set(oid, [ut, x, y]);
    }
    return out;
  }

  // The game stores the name as typed in game, which can carry a clan tag ("VIT | Hera"); the API has the bare name.
  function matchPlayers(hdrNames, api) {
    const norm = s => String(s == null ? '' : s).toLowerCase().trim();
    const used = new Set(), out = new Array(hdrNames.length).fill(null);
    const take = (i, k) => { used.add(k); out[i] = api[k]; };
    hdrNames.forEach((nm, i) => { const k = api.findIndex((p, j) => !used.has(j) && norm(p.name) === norm(nm)); if (k >= 0) take(i, k); });
    hdrNames.forEach((nm, i) => {
      if (out[i]) return;
      let best = -1;
      api.forEach((p, k) => { const a = norm(p.name); if (!used.has(k) && a.length >= 2 && norm(nm).endsWith(a) && (best < 0 || a.length > norm(api[best].name).length)) best = k; });
      if (best >= 0) take(i, best);
    });
    const freeH = out.map((o, i) => o ? -1 : i).filter(i => i >= 0), freeA = api.map((p, k) => used.has(k) ? -1 : k).filter(k => k >= 0);
    if (freeH.length === 1 && freeA.length === 1) take(freeH[0], freeA[0]);        // one left on each side: they are the same player
    return out;
  }

  // ------------------------------------------------------------------ rebuilding the opening
  function analyze(parsed, hdr, names, rawMatch, profileId) {
    const OBJ = names.objects, TECH = names.technologies;
    if (!OBJ[2739]) OBJ[2739] = 'Elk';      // the bundled list predates elk (the moose-looking animal on Mountain Pass); found from the hunt orders in a real game
    const objs = scanObjects(hdr);
    const api = (rawMatch.teams || []).flatMap(t => (t.players || []).map(p => Object.assign({ team: t.teamId }, p)));
    const hdrNames = playerNames(hdr, api.length), matched = matchPlayers(hdrNames, api);
    const players = hdrNames.map((nm, i) => {
      const a = matched[i] || {};
      return { slot: i + 1, name: a.name || nm, civ: a.civName || null, rating: a.rating == null ? null : a.rating, won: a.won == null ? null : a.won, profile: a.profileId || null };
    });
    const recorder = (players.find(p => p.profile === Number(profileId)) || players[0]).slot;
    const endMs = parsed.duration;

    const acts = parsed.actions, chat = parsed.chat;
    const tcs = [...objs].filter(([o, v]) => v[0] === 109 && o > 1000).map(([o]) => o).sort((a, b) => a - b);
    const haveStartTc = tcs.length >= players.length;
    players.forEach((p, i) => {
      if (haveStartTc) { p.tc_id = tcs[i]; p.tc = [objs.get(tcs[i])[1], objs.get(tcs[i])[2]]; return; }
      // no Town Center at the start (a nomad-style start): use the first one the player trained villagers from, and where they built it
      const fq = acts.find(a => a.pid === p.slot && a.a === 'DE_QUEUE' && VILLAGER_TYPES.has(a.unit) && a.ids.length);
      p.tc_id = fq ? fq.ids[0] : null;
      if (fq && START_EXTRA[p.civ]) p.extra_villagers = { t: fq.t, n: START_EXTRA[p.civ] };      // the first villager is queued as the Town Center finishes
      const b = fq && acts.filter(a => a.pid === p.slot && a.a === 'BUILD' && a.t <= fq.t && (BUILDING_NAMES[a.building] || names.objects[a.building]) === 'Town Center').pop();
      p.tc = b ? [b.x, b.y] : null;
    });
    const known = new Set(['Gold Mine', 'Stone Mine', 'Relic', ...FOOD_NAMES]);
    let thr = 0;
    for (const [o, v] of objs) if (known.has(OBJ[v[0]]) && o > thr) thr = o;     // ids above the last map resource are created in game
    // starting villagers: each goes to the nearest start Town Center (teammates can start close together); without one, the villagers a player commands in the first 90 s
    const startVills = {};
    for (const p of players) startVills[p.slot] = [];
    if (haveStartTc) {
      for (const [o, v] of objs) {
        if (!VILLAGER_TYPES.has(v[0])) continue;
        let best = null, bd = 14;
        for (const p of players) { const d = dist(v[1], v[2], p.tc[0], p.tc[1]); if (d < bd) { bd = d; best = p; } }
        if (best) startVills[best.slot].push(o);
      }
    } else {
      for (const a of acts) if (a.t <= 90000 && startVills[a.pid] && a.ids) for (const o of a.ids) if (objs.has(o) && VILLAGER_TYPES.has(objs.get(o)[0]) && !startVills[a.pid].includes(o)) startVills[a.pid].push(o);
    }
    for (const p of players) startVills[p.slot].sort((a, b) => a - b);
    const ageDone = {};
    for (const c of chat) {
      const g = /player_id,(\d+),\d+> advanced to the (\w+) Age/.exec(c.m);
      if (g) (ageDone[g[1]] = ageDone[g[1]] || {})[g[2] + ' Age'] = c.t;
    }
    // The game writes these notifications in the player's own language ("--Aldeão Criado(a)--"), so find the villager one by its rhythm:
    // it first shows up in the opening half minute and then repeats every ~25 s from the one Town Center.
    const recVill = (() => {
      const groups = new Map();
      for (const c of chat) { const g = /^--(.+)--$/.exec(c.m); if (g) { if (!groups.has(g[1])) groups.set(g[1], []); groups.get(g[1]).push(c.t); } }
      if (groups.has('Villager Created')) return groups.get('Villager Created');
      let best = [];
      for (const ts of groups.values()) {
        if (ts.length < 5 || ts[0] < 15000 || ts[0] > 45000) continue;
        const gaps = ts.slice(1, 6).map((t, i) => t - ts[i]);
        if (gaps.every(g => g > 20000 && g < 32000) && ts.length > best.length) best = ts;
      }
      return best;
    })();
    const playerMsgs = chat.map(c => { const g = /<player_id,(\d+),\d+>/.exec(c.m); return g ? { t: c.t, pid: +g[1], m: c.m } : null; }).filter(Boolean);
    const tname = id => UNIT_NAMES[id] || OBJ[id] || 'unit ' + id;
    const bname = id => BUILDING_NAMES[id] || OBJ[id] || 'building ' + id;

    let aLo = Infinity, aHi = 0;
    for (const [o, v] of objs) if (FOOD_NAMES.has(OBJ[v[0]] || '')) { if (o < aLo) aLo = o; if (o > aHi) aHi = o; }
    if (aLo === Infinity) aLo = 0;
    const unnamedN = {}; for (const [, v] of objs) if (!OBJ[v[0]]) unnamedN[v[0]] = (unnamedN[v[0]] || 0) + 1;      // an unnamed type with hundreds of copies is forest, not game animals

    function objClass(oid, p) {
      const o = objs.get(oid);
      if (!o) return null;
      const nm = OBJ[o[0]] || '';
      if (FOOD_NAMES.has(nm)) return ['food', LABELS[nm] || nm.toLowerCase()];      // the bundled list can be stale for the rarer animals, so only the sure names are shown
      if (nm.includes('Tree') || nm === 'Bush A' || nm === 'Bush B') return ['wood', 'trees'];   // 'Bush B' ringed round each Town Center = straggler trees
      if (nm === 'Gold Mine') return ['gold', 'gold'];
      if (nm === 'Stone Mine') return ['stone', 'stone'];
      if (!nm) {                                                    // type newer than the bundled name list
        if (unnamedN[o[0]] >= 500) return ['wood', 'trees'];
        if (p.tc && dist(o[1], o[2], p.tc[0], p.tc[1]) <= 8) return ['food', p.civ === 'Inca' ? 'llama' : 'livestock'];   // the animal beside the Town Center at the start
        if (aLo <= oid && oid <= aHi) return ['food', 'hunt'];      // inside the block of map animals
      }
      return null;
    }
    for (const p of players) {      // what a villager does with no rally point: the sheep (or the Inca's llama) beside the start Town Center
      const near = p.tc ? [...objs].filter(([o, v]) => dist(v[1], v[2], p.tc[0], p.tc[1]) <= 9) : [];
      const herd = near.find(([o, v]) => LIVESTOCK[OBJ[v[0]]]);
      const unknownAnimal = near.some(([o, v]) => !OBJ[v[0]] && objClass(o, p) && objClass(o, p)[1] !== 'hunt');
      p.auto_food = (herd ? LIVESTOCK[OBJ[herd[1][0]]] : unknownAnimal ? (p.civ === 'Inca' ? 'llama' : 'sheep') : 'nearest food') + ' (no rally set)';
    }
    const resPts = [], staticPts = [];
    for (const [o, v] of objs) {
      if (!(v[1] > 0 && v[1] < 260)) continue;
      const c = objClass(o, players[0]);
      if (!c) continue;
      resPts.push([v[1], v[2], c[0], c[1]]);
      const nm = OBJ[v[0]];
      if (nm && (!FOOD_NAMES.has(nm) || nm === 'Fruit Bush' || nm === 'Forage Bush')) staticPts.push([v[1], v[2], c[0], c[1]]);
    }
    const nearest = (pts, x, y) => { let best = null, bd = Infinity; for (const q of pts) { const d = dist(x, y, q[0], q[1]); if (d < bd) { bd = d; best = q; } } return best; };
    function dropoffFor(nm, x, y) {
      const pool = nm === 'Mill' ? staticPts.filter(q => q[2] === 'food') : nm === 'Lumber Camp' ? staticPts.filter(q => q[2] === 'wood')
        : nm === 'Mining Camp' ? staticPts.filter(q => q[2] === 'gold' || q[2] === 'stone') : nm === 'Mule Cart' ? resPts : staticPts;     // a Mule Cart takes hunt too
      const q = nearest(pool, x, y);
      if (q && dist(x, y, q[0], q[1]) <= 12) return [q[2], q[3]];
      return nm === 'Mill' ? ['food', 'farm'] : nm === 'Lumber Camp' ? ['wood', 'trees'] : nm === 'Mining Camp' ? ['gold', 'gold'] : null;
    }
    const farmBuilds = acts.filter(a => a.a === 'BUILD' && a.x > 0 && bname(a.building) === 'Farm');

    function classify(p, a, t) {
      const tid = a.a === 'ORDER' || a.a === 'GATHER_POINT' ? a.target : -1;
      const r = tid > 0 ? objClass(tid, p) : null;
      if (r) return r;
      if (tid > 0) {                                                // aimed at something that is not a map resource
        if (!objs.has(tid) && t != null && a.x >= 0 && farmBuilds.some(f => f.t <= t && dist(f.x, f.y, a.x, a.y) <= 2.5)) return ['food', 'farm'];
        return null;
      }
      if (a.x >= 0) {
        const best = nearest(resPts, a.x, a.y);
        if (best && dist(a.x, a.y, best[0], best[1]) <= 3) return [best[2], best[3]];
      }
      return null;
    }

    const firstMil = {};
    for (const p of players) {
      const q = acts.filter(a => a.pid === p.slot && a.a === 'DE_QUEUE' && !VILLAGER_TYPES.has(a.unit)).map(a => a.t);
      firstMil[p.slot] = q.length ? Math.min(...q) : null;
    }

    // villager creation times
    for (const p of players) {
      const s = p.slot, mine = acts.filter(a => a.pid === s);
      p.ages = mine.filter(a => a.a === 'RESEARCH' && AGE_TECH[a.tech]).map(a => ({ name: AGE_TECH[a.tech], click: a.t, done: (ageDone[s] || {})[AGE_TECH[a.tech]] || null }))
        .filter((a, i, arr) => arr.findIndex(b => b.name === a.name) === i);
      for (const a of p.ages) {
        if (a.done) continue;                    // not in English: the player's next announcement a research-time after the click is the age arriving
        const hit = playerMsgs.find(x => x.pid === s && x.t > a.click + 90000 && x.t <= a.click + 260000 && !/defeat|resign/i.test(x.m));
        if (hit) a.done = hit.t;
      }
      const busy = p.ages.map(a => [a.click, a.done || a.click + 130000]);
      if (s === recorder && recVill.length >= 5) p._created = recVill.slice();       // the recorder's own "Villager Created" messages are exact; without them, replay the queue
      else {
        const created = [];
        let free = 0;
        for (const a of mine.filter(a => a.a === 'DE_QUEUE' && VILLAGER_TYPES.has(a.unit))) {
          for (let k = 0; k < a.amount; k++) {
            let st = Math.max(a.t, free);
            for (const [b0, b1] of busy) if (a.t >= b0 && st < b1) st = b1;           // Town Center is researching: the queue resumes afterwards
            const fin = st + 25000;
            if (busy.some(([b0]) => b0 < fin && fin <= b0 + 30000 && st < b0)) continue;     // still training when the age-up took the Town Center
            free = fin;
            created.push(fin);
          }
        }
        p._created = created.filter(c => c <= endMs);
      }
    }

    // object id -> creation index
    function newIds(p) {
      const s = p.slot, lim = Math.min(firstMil[s] != null ? firstMil[s] + 30000 : endMs, endMs), ids = new Set();
      for (const a of acts) {
        if (a.t > lim || a.pid !== s || !a.ids || !a.ids.length) continue;
        if (a.a === 'BUILD' || (a.a === 'ORDER' && classify(p, a, null))) for (const v of a.ids) if (v > thr && v < 100000) ids.add(v);
      }
      return [...ids].sort((a, b) => a - b);
    }
    const rec = players[recorder - 1];
    const recIds = newIds(rec);
    const anchors = recIds.map((v, i) => [v, rec._created[i]]).filter(a => a[1] != null);
    const idmaps = {};
    idmaps[recorder] = new Map(recIds.slice(0, rec._created.length).map((v, i) => [v, i + 1]));
    for (const p of players) {
      if (p.slot === recorder) continue;
      const m = new Map();
      for (const v of newIds(p)) {
        let li = null, lt = -1, ui = null, ut = 1e9;
        for (const [i, t] of anchors) { if (i < v && (li == null || i > li)) { li = i; lt = t; } if (i > v && (ui == null || i < ui)) { ui = i; ut = t; } }
        const est = li != null && ui != null ? lt + (v - li) / (ui - li) * (ut - lt) : (li != null ? lt : ut);
        let best = -1, bd = Infinity;
        p._created.forEach((c, k) => { if (lt < c && c <= ut + 1500 && Math.abs(c - est) < bd) { bd = Math.abs(c - est); best = k; } });
        if (best >= 0) m.set(v, best + 1);
      }
      idmaps[p.slot] = m;
    }

    // The first fight: the first time the recording player is attacked (a notification in any language: it starts with a colour tag and names the attacker),
    // or the first army order, whichever is earlier. Nothing before 8:00 counts: a real fight can't happen sooner, and earlier pokes are scouts and Town Center arrows.
    const slotName = n => (players.find(p => p.slot === n) || {}).name || 'a player';
    const warns = chat.filter(c => /^<[A-Z]+>--/.test(c.m)).map(c => { const g = /<player_id,(\d+),\d+>/.exec(c.m); return g ? { t: c.t, by: +g[1] } : null; }).filter(Boolean);
    const FIGHT_FROM = 480000;
    const real = warns.filter(w => w.t >= FIGHT_FROM);
    const army = acts.find(a => a.a === 'ARMY' && a.n >= 2 && a.t >= FIGHT_FROM);
    const cands = [];
    if (real.length) cands.push({ t: real[0].t, kind: 'attacked', who: players[recorder - 1].name, by: slotName(real[0].by) });
    if (army) cands.push({ t: army.t, kind: 'army', who: slotName(army.pid), n: army.n });
    const fight = cands.sort((a, b) => a.t - b.t)[0] || null;

    // allocation
    for (const p of players) {
      const s = p.slot, created = p._created, events = [], bells = [];
      for (const a of acts) {
        if (a.pid !== s) continue;
        const ids = a.ids || [];
        if (a.a === 'GATHER_POINT' && ids[0] === p.tc_id) events.push({ t: a.t, kind: 'rally', c: classify(p, a, a.t) });
        else if (a.a === 'ORDER' && ids.length) { const c = classify(p, a, a.t); if (c) events.push({ t: a.t, kind: 'order', c, ids }); }
        else if (a.a === 'STOP' && ids.length) events.push({ t: a.t, kind: 'stop', ids });
        else if (a.a === 'BACK_TO_WORK') events.push({ t: a.t, kind: 'resume', ids });
        else if (a.a === 'DELETE') events.push({ t: a.t, kind: 'delete', ids });
        else if (a.a === 'TOWN_BELL') bells.push({ t: a.t, mode: a.mode });
        else if (a.a === 'BUILD' && ids.length) {
          const nm = bname(a.building);
          if (['Lumber Camp', 'Mill', 'Mining Camp', 'Farm', 'Settlement', 'Mule Cart'].includes(nm)) {
            const c = nm === 'Farm' ? ['food', 'farm'] : dropoffFor(nm, a.x, a.y);
            if (c) events.push({ t: a.t, kind: 'order', c, ids });
          }
        }
      }
      const all = created.map(t => ({ t, kind: 'create' })).concat(events).sort((a, b) => (a.t - b.t) || ((a.kind === 'create' ? 0 : 1) - (b.kind === 'create' ? 0 : 1)));
      const state = new Map(), keyOf = new Map(), idmap = idmaps[s], prevJob = new Map();
      startVills[s].forEach((vid, i) => { state.set('s' + i, 'food'); keyOf.set(vid, 's' + i); });
      let rally = null, nNew = 0, startSplit = null;
      const startVotes = {};
      const timeline = [], reassign = [], rallyLog = [], createdTo = [];
      for (const e of all) {
        if (e.kind === 'create') {
          const r = rally || ['food', p.auto_food];     // no rally point yet: confirmed in CaptureAge, the game sends a new villager straight to the nearest sheep
          state.set('n' + nNew++, r[0]);
          createdTo.push({ t: e.t, to: r[0], label: r[1] });
        } else if (e.kind === 'rally') {
          if (e.c && !(rally && e.c[0] === rally[0] && e.c[1] === rally[1])) rallyLog.push({ t: e.t, to: e.c[0], label: e.c[1] });
          rally = e.c || rally;
        } else if (e.kind === 'stop' || e.kind === 'resume' || e.kind === 'delete') {
          // a villager told to stop leaves its job until it is ordered again or sent back to work; a deleted one is gone
          const frm = {}; let n = 0;
          const keys = e.kind === 'resume' ? [...state].filter(([k, v]) => v === 'idle').map(([k]) => k) : e.ids.map(vid => keyOf.get(vid) || (idmap.has(vid) ? 'n' + (idmap.get(vid) - 1) : null));
          for (const k of keys) {
            if (k == null || !state.has(k)) continue;
            const cur = state.get(k);
            if (e.kind === 'stop' && cur !== 'idle') { prevJob.set(k, cur); frm[cur] = (frm[cur] || 0) + 1; state.set(k, 'idle'); n++; }
            else if (e.kind === 'resume' && cur === 'idle') { state.set(k, prevJob.get(k) || 'food'); frm.idle = (frm.idle || 0) + 1; n++; }
            else if (e.kind === 'delete') { frm[cur] = (frm[cur] || 0) + 1; state.delete(k); n++; }
          }
          if (n) reassign.push({ t: e.t, n, to: { stop: 'idle', resume: 'back', delete: 'deleted' }[e.kind], label: { stop: 'idle', resume: 'work', delete: 'deleted' }[e.kind], frm });
        } else {
          let moved = 0; const frm = {};
          for (const vid of e.ids) {
            const k = keyOf.get(vid) || (idmap.has(vid) ? 'n' + (idmap.get(vid) - 1) : null);
            if (k != null && state.has(k) && state.get(k) !== e.c[0]) { frm[state.get(k)] = (frm[state.get(k)] || 0) + 1; state.set(k, e.c[0]); moved++; }
          }
          if (moved) reassign.push({ t: e.t, n: moved, to: e.c[0], label: e.c[1], frm });
          const sv = e.ids.filter(v => keyOf.has(v)).length;
          if (e.t <= 40000 && sv) startVotes[e.c[1]] = (startVotes[e.c[1]] || 0) + sv;
        }
        const cnt = { food: 0, wood: 0, gold: 0, stone: 0, idle: 0 };
        for (const v of state.values()) cnt[v]++;
        timeline.push([e.t, cnt.food, cnt.wood, cnt.gold, cnt.stone, cnt.idle]);
        if (e.t <= 40000) { const c0 = { food: 0, wood: 0, gold: 0, stone: 0, idle: 0 }; for (const [k, v] of state) if (k[0] === 's') c0[v]++; startSplit = [c0.food, c0.wood, c0.gold, c0.stone]; }     // where the start villagers are once their first orders are in
      }
      // when each new villager is first given an order of its own (a gather or build command that names its id): how long it stood at the Town Center
      const firstCmd = new Map();
      for (const a of acts) {
        if (a.pid !== s || !a.ids || !a.ids.length || (a.a !== 'ORDER' && a.a !== 'BUILD' && a.a !== 'STOP')) continue;
        for (const vid of a.ids) { const k = idmap.get(vid); if (k != null && !firstCmd.has(k) && created[k - 1] != null && a.t >= created[k - 1]) firstCmd.set(k, a.t); }
      }
      createdTo.forEach((c, i) => { c.first_order = firstCmd.get(i + 1) || null; });
      p.villagers = { extra: p.extra_villagers || null, bells, created, created_to: createdTo, timeline, rally: rallyLog, reassign, start: startVills[s].length, start_label: Object.entries(startVotes).sort((a, b) => b[1] - a[1])[0]?.[0] || null, start_split: startSplit };

      const blds = [], techs = [], units = [];
      for (const a of acts) {
        if (a.pid !== s) continue;
        if (a.a === 'BUILD' && a.x > 0) {
          const nm = bname(a.building);
          const kind = MILITARY_BLD.has(nm) ? 'military' : DROPOFF_BLD.has(nm) ? 'dropoff' : nm === 'House' ? 'house' : nm === 'Farm' ? 'farm' : nm === 'Town Center' ? 'tc' : 'other';
          const b = { t: a.t, name: nm, kind, x: Math.round(a.x), y: Math.round(a.y) };
          if (kind === 'dropoff') { const c = dropoffFor(nm, a.x, a.y); b.serves = c ? c[1] : null; }
          blds.push(b);
        } else if (a.a === 'RESEARCH' && !AGE_TECH[a.tech]) {
          const nm = TECH_NAMES[a.tech] || TECH[a.tech] || 'tech ' + a.tech;
          if (!techs.some(x => x.name === nm && a.t - x.t < 3000)) techs.push({ t: a.t, name: nm });      // same tech sent to several buildings at once
        }
        else if (a.a === 'DE_QUEUE' && !VILLAGER_TYPES.has(a.unit)) units.push({ t: a.t, name: tname(a.unit), n: a.amount });
      }
      p.buildings = blds; p.techs = techs; p.units = units;
      delete p._created;
    }
    return { duration_ms: parsed.duration, recorder, players, fight, unsupported: parsed.unsupported };
  }

  // ------------------------------------------------------------------ the list
  const splitText = r => ['food', 'wood', 'gold', 'stone', 'idle'].map((k, i) => r[1 + i] ? r[1 + i] + RES_LETTER[k] : '').filter(Boolean).join(' ');

  function steps(p, windowMs, fight) {
    const v = p.villagers, tl = v.timeline;
    const base = [0, v.start, 0, 0, 0, 0];      // before the first rally/order/villager: just the start villagers
    const at = ms => { let last = base; for (const r of tl) { if (r[0] <= ms) last = r; else break; } return last; };
    const S = [];
    const ex = v.extra && v.extra.t <= windowMs ? v.extra : null;      // bonus villagers that arrive with a nomad start's Town Center; not in the split, since where they go isn't recorded
    const add = (t, kind, text, split, res) => { const r = at(t); S.push({ t, kind, text, vills: r[1] + r[2] + r[3] + r[4] + (r[5] || 0) + (ex && t >= ex.t ? ex.n : 0), split: split ? splitText(r) : '', res: res || null }); };
    const n0 = v.start;
    add(0, 'start', v.start_label ? `Start: ${n0} villagers go to the ${WORDS[v.start_label] || v.start_label}` : `Start: ${n0} villagers`, false);
    if (v.start_split) { const r = [0].concat(v.start_split); S[0].split = splitText(r); }

    if (ex) add(ex.t, 'build', `Town Center finished: ${ex.n} bonus villager${ex.n > 1 ? 's arrive' : ' arrives'}`);
    const cr = v.created_to.filter(c => c.t <= windowMs);
    for (let i = 0; i < cr.length;) {
      let j = i;
      if (cr[i].t > DETAIL_UNTIL) while (j + 1 < cr.length && cr[j + 1].label === cr[i].label && cr[j + 1].t - cr[j].t <= 45000 && cr[j + 1].t - cr[i].t <= 150000) j++;
      const a = n0 + i + 1, b = n0 + j + 1;
      add(cr[i].t, 'vill', `${a === b ? 'Villager ' + a : 'Villagers ' + a + '-' + b} → ${WORDS[cr[i].label] || cr[i].label}${j > i ? ` (${mmss(cr[i].t)}-${mmss(cr[j].t)})` : ''}`, true, cr[i].to);
      i = j + 1;
    }
    const buildT = p.buildings.map(b => b.t);
    for (const r of v.reassign) {
      if (r.t > windowMs) continue;
      if (r.n === 1 && buildT.some(bt => Math.abs(r.t - bt) <= 2000)) continue;       // the builder walking off to work: the build step already says it
      const was = Object.entries(r.frm).map(([k, n]) => n + ' off ' + k).join(' and '), pl = r.n > 1 ? 's' : '';
      add(r.t, 'move', r.label === 'idle' ? `Stops ${r.n} villager${pl} (${was})` : r.label === 'work' ? `${r.n} idle villager${pl} sent back to work` : r.label === 'deleted' ? `Deletes ${r.n} villager${pl}`
        : `Moves ${was} → ${WORDS[r.label] || r.label}`, true, r.to);
    }
    const b = p.buildings.filter(x => x.t <= windowMs);
    for (let i = 0; i < b.length;) {
      const x = b[i];
      if (x.kind === 'house' || x.kind === 'farm') {
        let j = i;
        const gap = x.t <= DETAIL_UNTIL ? (x.kind === 'house' ? 10000 : 25000) : 40000;
        while (j + 1 < b.length && b[j + 1].kind === x.kind && b[j + 1].t - b[j].t <= gap) j++;
        const n = j - i + 1, w = x.kind === 'house' ? 'house' : 'farm';
        add(x.t, 'build', n > 1 ? `${n} ${w}s` : w[0].toUpperCase() + w.slice(1));
        i = j + 1;
        continue;
      }
      add(x.t, x.kind === 'military' ? 'military' : 'build', x.name + (x.kind === 'dropoff' && x.serves ? ` (${WORDS[x.serves] || x.serves})` : ''));
      i++;
    }
    for (const tc of p.techs) if (tc.t <= windowMs) add(tc.t, 'tech', tc.name);
    for (const b of (v.bells || [])) if (b.t <= windowMs && b.mode === 1) add(b.t, 'build', 'Town bell rung');
    for (const a of p.ages) {
      const age = a.name.replace(' Age', '');
      if (a.click <= windowMs) add(a.click, 'age', `Clicks ${age} Age`, true);
      if (a.done && a.done <= windowMs) add(a.done, 'age', `${age} Age reached (Town Center made no villagers for ${Math.round((a.done - a.click) / 1000)} s)`, false);
    }
    const u = p.units.filter(x => x.t <= windowMs);
    for (let i = 0; i < u.length;) {
      let j = i;
      while (j + 1 < u.length && u[j + 1].name === u[i].name && u[j + 1].t - u[j].t <= (u[i].t <= DETAIL_UNTIL ? 20000 : 40000)) j++;
      const n = u.slice(i, j + 1).reduce((s, x) => s + x.n, 0);
      add(u[i].t, 'unit', u[i].name + ' queued' + (n > 1 ? ' x' + n : ''));
      i = j + 1;
    }
    if (fight && fight.t <= windowMs) {
      add(fight.t, 'fight', fight.kind === 'attacked' ? `First fight: ${fight.who} is attacked by ${fight.by}. Villager counts are rougher from here (deaths aren't recorded)`
        : `First army orders: ${fight.who} sends ${fight.n} units out. Villager counts are rougher from here (deaths aren't recorded)`, false);
    }
    if (fight) for (const x of S) if (x.t > fight.t && (x.split || x.kind === 'vill')) x.rough = true;
    const order = { age: 0, build: 1, military: 1, tech: 2, unit: 3, move: 4, vill: 5, start: -1, fight: -0.5 };
    return S.sort((a, b) => (a.t - b.t) || (order[a.kind] - order[b.kind]));
  }

  function toText(data, slot, windowMs) {
    const p = data.players.find(x => x.slot === slot);
    const lines = [`${p.name} (${[p.civ, p.rating].filter(Boolean).join(', ')}) - build order, first ${mmss(windowMs)}`];
    for (const s of steps(p, windowMs, data.fight)) lines.push(`${mmss(s.t).padStart(5)}  ${s.text}  [${s.vills} vills${s.split ? ', ' + s.split : ''}]`);
    return lines.join('\n');
  }

  // ------------------------------------------------------------------ download + run
  let NAMES = null;
  async function loadNames(url) {
    if (!NAMES) NAMES = await (await fetch(url || 'replay-names.json')).json();
    return NAMES;
  }

  // Tries each profile id in turn: the game keeps one recording per player, and the recording player's own messages make their villager timeline exact.
  async function load(matchId, profileIds, rawMatch, opts) {
    opts = opts || {};
    const names = opts.names || await loadNames(opts.namesUrl);
    let buf = null, used = null, lastErr = null;
    for (const pid of profileIds) {
      try {
        const r = await fetch(`https://api.ageofempires.com/api/GameStats/AgeII/GetMatchReplay/?gameId=${matchId}&profileId=${pid}&matchId=${matchId}`);
        if (r.ok) { buf = await r.arrayBuffer(); used = pid; break; }
        lastErr = new Error('HTTP ' + r.status);
      } catch (e) { lastErr = e; }
    }
    if (!buf) throw new Error('replay unavailable' + (lastErr ? ' (' + lastErr.message + ')' : ''));
    return fromBuffer(buf, rawMatch, used, names);
  }

  async function fromBuffer(zipBuf, rawMatch, profileId, names) {
    const rec = await unzipRecord(zipBuf);
    const hl = new DataView(rec.buffer, rec.byteOffset, rec.byteLength).getUint32(0, true);
    const hdr = await inflateRaw(rec.subarray(8, hl));
    const parsed = parseBody(rec, hl);
    if (!parsed.actions.length) throw new Error('this recording is in a format the reader does not know');
    const data = analyze(parsed, hdr, names, rawMatch, profileId);
    data.profile = Number(profileId);
    return data;
  }

  return { load, fromBuffer, analyze, steps, toText, mmss, DETAIL_UNTIL };
});
