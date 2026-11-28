// Galaxies of Empires — state, generation, helpers, save/load
'use strict';
(function () {
const E = window.EOG;
const SAVE_KEY = 'goe_save_v31'; // v3.1: slot 1 (v3.0 … v1.5 saves are migrated into the matching slot on first load; older saves can't be continued)
// 3 named save slots — slot 1 keeps the plain key so older code paths still find it
const SLOT_KEYS = [SAVE_KEY, 'goe_save_v31_s2', 'goe_save_v31_s3'];
const PREV_SAVE_KEY = 'goe_save_v30';
const PREV_CHAIN = [PREV_SAVE_KEY, 'goe_save_v30_s2', 'goe_save_v30_s3', 'goe_save_v29', 'goe_save_v29_s2', 'goe_save_v29_s3', 'goe_save_v28', 'goe_save_v28_s2', 'goe_save_v28_s3', 'goe_save_v27', 'goe_save_v27_s2', 'goe_save_v27_s3', 'goe_save_v26', 'goe_save_v26_s2', 'goe_save_v26_s3', 'goe_save_v25', 'goe_save_v25_s2', 'goe_save_v25_s3', 'goe_save_v24', 'goe_save_v24_s2', 'goe_save_v24_s3', 'goe_save_v23', 'goe_save_v23_s2', 'goe_save_v23_s3', 'goe_save_v22', 'goe_save_v22_s2', 'goe_save_v22_s3', 'goe_save_v21', 'goe_save_v20', 'goe_save_v19', 'goe_save_v18', 'goe_save_v17', 'goe_save_v16', 'goe_save_v15'];
const SAVE_CHAIN = SLOT_KEYS.concat(PREV_CHAIN);
const OLD_SAVE_KEYS = ['goe_save_v14', 'goe_save_v13', 'goe_save_v12', 'goe_save_v1', 'eog_save_v1'];
E.SAVE_CHAIN = SAVE_CHAIN; E.SLOT_KEYS = SLOT_KEYS; E.PREV_CHAIN = PREV_CHAIN;
E.SAVE_KEY = SAVE_KEY; E.PREV_SAVE_KEY = PREV_SAVE_KEY; E.OLD_SAVE_KEYS = OLD_SAVE_KEYS;
E.hasOldSave = function () { try { return OLD_SAVE_KEYS.some(k => !!localStorage.getItem(k)); } catch (e) { return false; } };

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// v1.8 item 3: seeded, savable RNG for all sim randomness (state.rngS); falls back to Math.random with no game loaded
E.srand = function () {
  const st = E.state; if (!st || st.rngS == null) return Math.random();
  let a = st.rngS = (st.rngS + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
E.rand = E.srand;
E.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
E.lerp = (a, b, t) => a + (b - a) * t;
E.dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
E.fmt = function (n) {
  n = Math.floor(n);
  if (Math.abs(n) >= 1e12) return (n / 1e12).toFixed(1) + 'T';
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
};
// v1.6: exact counts (ships, troops) with thousands separators up to 10 million, then the short form
E.fmtN = function (n) { n = Math.floor(n); if (!isFinite(n)) return '∞'; return Math.abs(n) >= 1e4 ? E.fmt(n) : n.toLocaleString('en-US'); }; // v2.6 item 9: compact K/M/B from 10k so late-game UI does not wrap
// v1.8: per-unit build time — sub-second values are shown (no 1 s floor)
E.fmtUnit = function (s) { return s < 1 ? (Math.max(0.01, s)).toFixed(s < 0.1 ? 2 : 1) + 's' : s < 60 ? (Math.round(s * 10) / 10) + 's' : E.fmtTime(s); };
E.fmtTime = function (s) {
  s = Math.max(0, Math.ceil(s));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
  if (h) return h + ':' + String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
  return m + ':' + String(ss).padStart(2, '0');
};

const SYL = ['Ka', 'ri', 'on', 'Vel', 'tha', 'Cor', 'mi', 'Zen', 'da', 'Lu', 'Ny', 'xa', 'Or', 'pha', 'Tal', 'ion', 'Sar', 'dis', 'Er', 'Mor', 'Vey', 'quin', 'Hel', 'ast', 'Bri', 'Ul', 'ka', 'ne', 'Ith', 'Pra', 'su', 'Dra', 'vos', 'Ae', 'lun', 'Cy', 'ra', 'Tem', 'Ob'];
E.makeName = (r, used) => makeName(r, used);
E.rng = seed => mulberry32(seed);
function makeName(r, used) {
  for (let tries = 0; tries < 50; tries++) {
    const caps = SYL.filter(s => s[0] === s[0].toUpperCase());
    const lows = SYL.filter(s => s[0] !== s[0].toUpperCase() || true);
    let n = caps[Math.floor(r() * caps.length)];
    const k = r() < 0.55 ? 1 : 2;
    for (let i = 0; i < k; i++) n += lows[Math.floor(r() * lows.length)].toLowerCase();
    if (n.length < 4 || n.length > 10 || used.has(n)) continue;
    used.add(n); return n;
  }
  return 'Sys' + used.size;
}

E.segCross = (a, b, c, d) => segCross(a, b, c, d);
function segCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  if (a === c || a === d || b === c || b === d) return false;
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}

E.newPlanet = function (id, sys, name, type, size, owner) {
  return {
    id, sys, name, type, size, owner,
    slots: Array.from({ length: 11 }, () => ({ b: null, lvl: 0 })),
    spec: null,
    def: { shield: 0, turret: 0, mines: 0, station: 0, laser: 0, railgun: 0 },
    shieldHp: 0, mineCharge: 1,
    garrison: { inf: 0 },
    queues: { build: [], def: [], ship: [], troop: [] },
    blockade: false, capturedAt: 0, lastAttacked: -999,
  };
};

// Derived settings for a (difficulty, size, rivals) choice; also used by the setup screen preview.
E.computeCfg = function (diff, sizeKey, nRivals) {
  const SZ = E.SIZES[sizeKey], D = E.DIFFICULTY[diff], N = SZ.n;
  const share = E.clamp(SZ.share * D.shareMul * (1 - 0.03 * (nRivals - 3)), 0.12, 0.6);
  return { size: sizeKey, n: N, rivals: nRivals, travel: SZ.travel, crisisMult: SZ.crisis, waves: SZ.waves, need: Math.max(5, Math.round(share * N)), crisisAt: D.crisisAt * SZ.time };
};

E.newGame = function (diff, seed, opts) {
  opts = opts || {};
  const sizeKey = E.SIZES[opts.size] ? opts.size : 'small';
  const SZ = E.SIZES[sizeKey];
  const endless = opts.mode === 'endless';
  const nRivals = endless ? 1 : E.clamp(Math.round(opts.rivals == null ? 3 : opts.rivals), 1, 8);
  const rivals = E.RIVALS.slice(0, nRivals);
  const nAllies = E.clamp(Math.round(opts.allies || 0), 0, E.ALLIES.length);
  const allies = E.ALLIES.slice(0, nAllies);
  const species = E.SPECIES[opts.species] && !E.SPECIES[opts.species].hidden ? opts.species : E.PICK_SPECIES[0];
  let N = endless ? 20 : (opts.n ? E.clamp(Math.round(opts.n), 10, 600) : SZ.n);
  seed = seed || (Math.random() * 1e9) | 0;
  const r = mulberry32(seed);
  let k = N === 20 ? 1 : Math.sqrt(N / 20 * 1.15);
  let W = Math.round(1600 * k), H = Math.round(1050 * k);
  // v2.8: designed home start + short non-crossing lanes (E.buildMap28). Fall back to the v2.7 path if missing.
  let pts, lanes, CC;
  if (E.buildMap28) {
    const built = E.buildMap28({ N, W, H, r, nRivals, nAllies, sizeKey });
    N = built.N; W = built.W; H = built.H; pts = built.pts; lanes = built.lanes; CC = built.CC;
  } else {
    const minD = N === 20 ? 215 : 205;
    pts = [];
    let guard = 0;
    const cell = minD, gw = Math.ceil(W / cell), grid = new Map();
    const near = p => { const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const l = grid.get((cx + dx) + (cy + dy) * gw); if (l) for (const q of l) if (E.dist(p, q) <= minD) return true; } return false; };
    const addPt = p => { pts.push(p); const key = Math.floor(p.x / cell) + Math.floor(p.y / cell) * gw; (grid.get(key) || grid.set(key, []).get(key)).push(p); };
    while (pts.length < N && guard++ < 60000) {
      const p = { x: 90 + r() * (W - 180), y: 90 + r() * (H - 180) };
      if (!near(p)) addPt(p);
    }
    while (pts.length < N) addPt({ x: 90 + r() * (W - 180), y: 90 + r() * (H - 180) });
  }
  const used = new Set();
  const types = Object.keys(E.PLANET_TYPES);
  const systems = pts.map((p, i) => ({
    id: i, name: makeName(r, used), x: p.x, y: p.y, lanes: [], rift: false, planetId: i,
    star: { color: ['#fff3c4', '#ffd27f', '#ff9f6b', '#bcd7ff', '#ffffff', '#ffb4e0'][Math.floor(r() * 6)], size: 5 + r() * 4 },
    decor: Array.from({ length: 1 + Math.floor(r() * 3) }, () => ({ r: 16 + r() * 18, a: r() * 6.28, c: ['#8a7a66', '#5f7fa3', '#a36d5f', '#6fa37a'][Math.floor(r() * 4)], s: 1.5 + r() * 2 })),
  }));
  if (!lanes) {
    // Lanes: MST then non-crossing nearest neighbours (edges limited to near pairs so 150 systems stay fast)
    const edges = [];
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { const d = E.dist(systems[i], systems[j]); if (N <= 40 || d < 560) edges.push([d, i, j]); }
    edges.sort((a, b) => a[0] - b[0]);
    const parent = systems.map((s, i) => i);
    const find = x => parent[x] === x ? x : (parent[x] = find(parent[x]));
    lanes = []; const laneSet = new Set(), deg = new Array(N).fill(0);
    const addLane = (i, j) => { lanes.push([i, j]); laneSet.add(i + ',' + j); laneSet.add(j + ',' + i); deg[i]++; deg[j]++; };
    for (const [d, i, j] of edges) { if (find(i) !== find(j)) { parent[find(i)] = find(j); addLane(i, j); } }
    for (let i = 1; i < N; i++) if (find(i) !== find(0)) { let bj = -1, bd = Infinity; for (let j = 0; j < N; j++) if (find(j) === find(0)) { const d = E.dist(systems[i], systems[j]); if (d < bd) { bd = d; bj = j; } } parent[find(i)] = find(0); addLane(i, bj); }
    for (const [d, i, j] of edges) {
      if (d > 380) break;
      if (laneSet.has(i + ',' + j)) continue;
      if (deg[i] >= 4 || deg[j] >= 4) continue;
      const a = systems[i], b = systems[j];
      let cross = false;
      for (const l of lanes) { const A = systems[l[0]], B = systems[l[1]]; if (Math.max(A.x, B.x) < Math.min(a.x, b.x) || Math.min(A.x, B.x) > Math.max(a.x, b.x) || Math.max(A.y, B.y) < Math.min(a.y, b.y) || Math.min(A.y, B.y) > Math.max(a.y, b.y)) continue; if (segCross(a, b, A, B)) { cross = true; break; } }
      if (cross) continue;
      addLane(i, j);
    }
    CC = (E.cornerClusters26 ? E.cornerClusters26(systems, lanes, N, W, H, r, nRivals, nAllies, sizeKey) : cornerClusters(systems, lanes, N, W, H, r, nRivals, nAllies));
  }
  const home = CC.home, homes = CC.homes, allyHomes = CC.allyHomes;
  const clusterOf = CC.clusterOf; // system id -> empire index (0 = you)
  // v2.7: the Rift sits in the centre of every map (inside the walled centre cluster on Massive/Galactic).
  const hp = systems[home];
  const Cxy = { x: W / 2, y: H / 2 };
  let rc = { x: Cxy.x, y: Cxy.y };
  const mid = (E._map26 && E._map26.center && E._map26.center.length) ? E._map26.center : null;
  if (mid && mid.length) {
    let sx = 0, sy = 0; for (const i of mid) { sx += systems[i].x; sy += systems[i].y; }
    rc = { x: sx / mid.length, y: sy / mid.length };
  }
  const riftId = N;
  const rift = { id: riftId, name: 'The Rift', x: rc.x, y: rc.y, lanes: [], rift: true, planetId: null, star: { color: '#7dff6b', size: 14 }, decor: [] };
  systems.push(rift);
  let nearR;
  if (mid && mid.length) nearR = mid.map(id => [E.dist(systems[id], rift), id]).sort((a, b) => a[0] - b[0]);
  else nearR = systems.slice(0, N).filter(s => clusterOf[s.id] == null).map(s => [E.dist(s, rift), s.id]).sort((a, b) => a[0] - b[0]);
  if (nearR.length < 2) systems.slice(0, N).filter(s => CC.chokes.includes(s.id)).forEach(s => nearR.push([E.dist(s, rift), s.id]));
  lanes.push([riftId, nearR[0][1]]); lanes.push([riftId, nearR[1][1]]);
  lanes.forEach(([a, b]) => { systems[a].lanes.push(b); systems[b].lanes.push(a); });

  const planets = [];
  systems.slice(0, N).forEach((s, i) => {
    const type = types[Math.floor(r() * types.length)];
    const p = E.newPlanet(i, i, s.name + ' ' + ['Prime', 'II', 'III', 'IV', 'Major', 'Minor'][Math.floor(r() * 6)], type, 5 + Math.floor(r() * 4), 'neutral');
    planets.push(p);
  });
  const cfg = E.computeCfg(diff, endless ? 'small' : sizeKey, nRivals), D = E.DIFFICULTY[diff];
  cfg.n = N; cfg.need = Math.max(5, Math.round(E.clamp((E.SIZES[endless ? 'small' : sizeKey].share * D.shareMul * (1 - 0.03 * (nRivals - 3))), 0.12, 0.6) * N));
  const st = {
    v: 2, ver: E.VERSION, ffa: true, seed, rngS: (seed ^ 0x2545F491) | 0, cmdLog: [], tick: 0, t: 0, speed: 1, paused: false, diff, nextId: 1, cfg, rivals, allies: allies.slice(), riftId,
    mode: endless ? 'endless' : 'classic', species, endless: endless ? { stage: 0, banner: null } : null, defeated: {},
    world: { w: W, h: H }, systems, planets, lanes, fleets: [], routes: [], battles: [], log: [], toasts: [],
    emp: {}, windows: [], alerts: {}, results: [], scoutMissions: [], intel: {}, fleetIntel: {},
    waves: { next: D.firstWave, count: 0 },
    crisis: { started: false, waveIdx: 0, nextWave: 0, defeated: false, warned: false, open: false, cycle: 0, cw: 0, phaseEnd: 0 },
    over: null, continued: false,
    stats: { captured: 0, lost: 0, battlesWon: 0, battlesLost: 0, tradeEarned: 0, shipsBuilt: 0, shipsLost: 0, enemyKilled: 0, windowsWon: 0, windowsLost: 0 },
    tutorial: { step: 0, done: false },
    homeId: home,
    clusters: CC.clusters, chokes: CC.chokes,
  };
  E.state = st;
  const allRivals = endless ? E.RIVALS.slice() : rivals; // endless mode wakes more rivals each stage
  // v1.8: AI species + AI timers come from their own seeded stream (map layout stays identical to v1.7 for a seed)
  const rA = mulberry32((seed ^ 0x51ED270B) | 0);
  st.aiSpecies = {}; for (const f of allRivals.concat(allies)) st.aiSpecies[f] = E.PICK_SPECIES[Math.floor(rA() * E.PICK_SPECIES.length)];
  for (const f of ['player'].concat(allRivals, allies, ['neutral', 'crisis'])) {
    st.emp[f] = { res: { metal: 0, crystal: 0 }, rp: 0, techs: {}, research: null, designs: {}, ai: { next: 5 + rA() * 10, expandNext: (120 + rA() * 120) * E.TIME_MUL, raidNext: 300 * E.TIME_MUL }, war: !!(E.PERS[f] ? E.PERS[f].aggressive : (f === 'crisis')), alive: true };
    for (const h of E.ALL_HULLS) st.emp[f].designs[h] = E.defaultFit(h);
    if (endless && f !== 'player' && f !== 'neutral' && f !== 'crisis' && !allies.includes(f)) st.emp[f].war = true; // endless: every rival is at war
    if (allies.includes(f)) st.emp[f].war = false;
  }
  st.emp.player.res = { metal: 900, crystal: 700 };
  st.emp.player.cmd = { xp: 0, lv: 1, kills: 0 };
  // Setup player home
  const ph = planets[home];
  ph.owner = 'player'; ph.type = 'garden'; ph.size = 9; ph.perfect = true; ph.name = systems[home].name + ' ' + E.SPECIES[species].capital;
  setSlots(ph, [['mine', 2], ['plant', 2], ['power', 1], ['shipyard', 2], ['lab', 1], ['barracks', 1], ['scoutpost', 1], ['warehouse', 1]]);
  ph.def = { shield: 1, turret: 2, mines: 0, station: 0 };
  ph.garrison = { inf: 24 };
  // AI homes
  rivals.forEach((f, q) => {
    const P = E.PERS[f];
    const p = planets[homes[q + 1]];
    p.owner = f; p.size = 9; p.perfect = true;
    setSlots(p, P.base);
    p.def = { shield: P.def[0], turret: P.def[1], mines: P.def[2], station: 0 };
    p.garrison = { inf: P.garrison[0] + P.garrison[1] * 2 };
    p.spec = P.spec;
    st.emp[f].res = { metal: 900, crystal: 700 };
    st.emp[f].home = p.id;
  });
  allies.forEach((f, q) => {
    const P = E.PERS[f], p = planets[allyHomes[q]]; if (!p) return;
    p.owner = f; p.size = 8; p.perfect = true; setSlots(p, P.base);
    p.def = { shield: P.def[0], turret: P.def[1], mines: P.def[2], station: 0 };
    p.garrison = { inf: P.garrison[0] }; p.spec = P.spec;
    st.emp[f].res = { metal: 700, crystal: 500 }; st.emp[f].home = p.id;
  });
  st.emp.player.home = home;
  // Neutrals: scale by distance from player
  const maxD = Math.max(...systems.slice(0, N).map(s => E.dist(s, hp)));
  planets.forEach(p => {
    if (p.owner !== 'neutral') return;
    const d = E.dist(systems[p.sys], hp) / maxD; // 0..1
    p.distFactor = d;
    const nb = 2 + Math.floor(r() * 3);
    const opts2 = ['mine', 'plant', 'power', 'warehouse', 'lab', 'tradeport', 'barracks', 'bunker'];
    const list = [];
    for (let i = 0; i < nb; i++) list.push([opts2[Math.floor(r() * opts2.length)], 1 + Math.floor(r() * (1 + d * 3))]);
    setSlots(p, list);
    p.def = { shield: Math.floor(d * 3.5 * r() + d), turret: Math.floor(d * 5 * r()), mines: Math.floor(d * 2 * r()), station: 0 };
    p.garrison = { inf: Math.round(6 + d * 30 + r() * 6 + d * d * 25 + (d > 0.75 ? d * 15 : 0)) };
    // v1.5: worlds inside a starting pocket are lightly held so every empire can fill its corner first
    if (clusterOf[p.sys] != null) { const k = CC.clusters[clusterOf[p.sys]].indexOf(p.sys); p.def = { shield: k > 2 ? 1 : 0, turret: k > 1 ? 1 : 0, mines: 0, station: 0 }; p.garrison = { inf: 6 + 5 * k }; }
    // v1.5: about 1 in 5 independent worlds is a Perfect planet with every planet-type and specialization bonus
    if (r() < 0.2) p.perfect = true;
  });
  // Guarantee a weak neighbour for the first capture
  const nbs = systems[home].lanes.filter(id => id < N && planets[id].owner === 'neutral');
  if (nbs.length) {
    const w = planets[nbs[0]];
    w.def = { shield: 0, turret: 0, mines: 0, station: 0 }; w.garrison = { inf: 8 };
    if (nbs[1]) { const w2 = planets[nbs[1]]; w2.def = { shield: 1, turret: 1, mines: 0, station: 0 }; w2.garrison = { inf: 16 }; }
  }
  planets.forEach(p => { p.shieldHp = E.shieldMax(st, p); });
  E.state = st;
  // starting fleets
  const pf = E.makeFleet('player', home, 'Home Guard');
  for (let i = 0; i < 12; i++) pf.ships.push(E.makeShip('player', 'fighter')); // v1.6: no Flagship, so a few more Fighters to start
  pf.ships.push(E.makeShip('player', 'transport'));
  const mf = E.makeFleet('player', home, 'Merchant'); mf.ships.push(E.makeShip('player', 'trader'));
  allies.forEach(f => { if (st.emp[f].home == null) return; const fl = E.makeFleet(f, st.emp[f].home, 'Guard'); for (let i = 0; i < 5; i++) fl.ships.push(E.makeShip(f, 'fighter')); fl.guard = true; });
  rivals.forEach(f => {
    const fl = E.makeFleet(f, st.emp[f].home, 'Guard');
    const sw = f === 'swarm';
    for (let i = 0; i < (sw ? 10 : 6); i++) fl.ships.push(E.makeShip(f, 'fighter'));
    for (let i = 0; i < (sw ? 0 : 1); i++) fl.ships.push(E.makeShip(f, 'destroyer'));
    fl.guard = true;
  });
  E.addLog('Colony founded on ' + ph.name + '. Build, defend, trade — and watch the Rift.', 'info');
  return st;
};

// v1.5 map generation: corner pockets with one chokepoint each.
function cornerClusters(systems, lanes, N, W, H, r, nRivals, nAllies) {
  const nE = 1 + nRivals + nAllies;
  const inset = 90, X0 = inset, Y0 = inset, X1 = W - inset, Y1 = H - inset;
  // candidate anchor spots: corners first, then edge midpoints, then evenly along the border
  let spots = [{ x: X0, y: Y0 }, { x: X1, y: Y1 }, { x: X1, y: Y0 }, { x: X0, y: Y1 }, { x: (X0 + X1) / 2, y: Y0 }, { x: (X0 + X1) / 2, y: Y1 }, { x: X0, y: (Y0 + Y1) / 2 }, { x: X1, y: (Y0 + Y1) / 2 }];
  if (nE > spots.length) {
    spots = []; const P = 2 * (X1 - X0) + 2 * (Y1 - Y0);
    for (let i = 0; i < nE; i++) { let d = P * i / nE; if (d < X1 - X0) { spots.push({ x: X0 + d, y: Y0 }); continue; } d -= X1 - X0; if (d < Y1 - Y0) { spots.push({ x: X1, y: Y0 + d }); continue; } d -= Y1 - Y0; if (d < X1 - X0) { spots.push({ x: X1 - d, y: Y1 }); continue; } d -= X1 - X0; spots.push({ x: X0, y: Y1 - d }); }
  }
  const anchors = [spots[0]]; let free = spots.slice(1);
  // rivals: farthest-point among the spots; allies: the spots nearest you
  for (let q = 0; q < nRivals; q++) { let bi = 0, bd = -1; free.forEach((sp, i) => { const d = Math.min(...anchors.map((a, k) => E.dist(sp, a) * (k === 0 ? 1.15 : 1))); if (d > bd) { bd = d; bi = i; } }); anchors.push(free[bi]); free.splice(bi, 1); }
  for (let q = 0; q < nAllies; q++) { let bi = 0, bd = Infinity; free.forEach((sp, i) => { const d = E.dist(sp, anchors[0]); if (d < bd) { bd = d; bi = i; } }); anchors.push(free[bi]); free.splice(bi, 1); }
  const cap = Math.max(1, Math.min(5, Math.floor(N * 0.75 / nE)));
  const claimed = new Set(), clusters = [], clusterOf = {};
  anchors.forEach((a, e) => {
    let h = -1, hd = Infinity; for (let i = 0; i < N; i++) if (!claimed.has(i)) { const d = E.dist(systems[i], a); if (d < hd) { hd = d; h = i; } }
    const want = Math.min(cap, 3 + Math.floor(r() * 3));
    const cl = [h]; claimed.add(h);
    const cand = []; for (let i = 0; i < N; i++) if (!claimed.has(i)) cand.push([E.dist(systems[i], systems[h]) + 0.35 * E.dist(systems[i], a), i]);
    cand.sort((x, y) => x[0] - y[0]);
    for (const [, i] of cand) { if (cl.length >= want) break; cl.push(i); claimed.add(i); }
    cl.forEach(i => { clusterOf[i] = e; }); clusters.push(cl);
  });
  // chokepoint = the pocket world nearest the map centre (the home itself only if the pocket is a single world)
  const C = { x: W / 2, y: H / 2 };
  const chokes = clusters.map(cl => { if (cl.length === 1) return cl[0]; let b = cl[1], bd = Infinity; cl.slice(1).forEach(i => { const d = E.dist(systems[i], C); if (d < bd) { bd = d; b = i; } }); return b; });
  // drop every lane that leaves a pocket
  const keep = lanes.filter(([a, b]) => (clusterOf[a] == null && clusterOf[b] == null) || (clusterOf[a] != null && clusterOf[a] === clusterOf[b]));
  lanes.length = 0; keep.forEach(l => lanes.push(l));
  const par = Array.from({ length: N }, (_, i) => i), find = x => par[x] === x ? x : (par[x] = find(par[x]));
  const uni = (a, b) => { par[find(a)] = find(b); };
  const link = (a, b) => { lanes.push([a, b]); uni(a, b); };
  lanes.forEach(([a, b]) => uni(a, b));
  // pockets: internally connected
  for (const cl of clusters) for (let g = 0; g < 8; g++) {
    const roots = new Set(cl.map(find)); if (roots.size <= 1) break;
    const r0 = find(cl[0]); let best = null, bd = Infinity;
    for (const a of cl) if (find(a) === r0) for (const b of cl) if (find(b) !== r0) { const d = E.dist(systems[a], systems[b]); if (d < bd) { bd = d; best = [a, b]; } }
    link(best[0], best[1]);
  }
  // the open galaxy (non-pocket systems): connected
  const open = []; for (let i = 0; i < N; i++) if (clusterOf[i] == null) open.push(i);
  for (let g = 0; g < N && open.length; g++) {
    const r0 = find(open[0]); const out = open.filter(i => find(i) !== r0); if (!out.length) break;
    let best = null, bd = Infinity;
    for (const a of open) if (find(a) === r0) for (const b of out) { const d = E.dist(systems[a], systems[b]); if (d < bd) { bd = d; best = [a, b]; } }
    link(best[0], best[1]);
  }
  // one lane from each chokepoint into the open galaxy (or to the next pocket's chokepoint on tiny maps)
  clusters.forEach((cl, e) => {
    const c = chokes[e]; let b = -1, bd = Infinity;
    const pool = open.length ? open : chokes.filter((x, k) => k !== e);
    for (const i of pool) { const d = E.dist(systems[i], systems[c]); if (d < bd) { bd = d; b = i; } }
    if (b >= 0) link(c, b);
  });
  // final safety net: any pocket still cut off joins through its chokepoint
  for (let g = 0; g < nE; g++) { const r0 = find(chokes[0]); const e = chokes.findIndex(c => find(c) !== r0); if (e < 0) break; let b = -1, bd = Infinity; chokes.forEach(c => { if (find(c) === r0) { const d = E.dist(systems[c], systems[chokes[e]]); if (d < bd) { bd = d; b = c; } } }); link(chokes[e], b); }
  return { home: clusters[0][0], homes: clusters.slice(0, 1 + nRivals).map(cl => cl[0]), allyHomes: clusters.slice(1 + nRivals).map(cl => cl[0]), clusters, clusterOf, chokes };
}

E.setSlots = (p, list) => setSlots(p, list);
function setSlots(p, list) {
  p.slots.forEach(s => { s.b = null; s.lvl = 0; });
  list.forEach(([b, lvl], i) => { if (i < p.slots.length) { p.slots[i].b = b; p.slots[i].lvl = lvl; } });
}

E.defaultFit = function (h) {
  const n = E.HULLS[h].slots;
  if (E.HULLS[h].noWeapon) return [0, n, 0];
  const w = Math.ceil(n / 2), rest = n - w;
  return [w, Math.ceil(rest / 2), Math.floor(rest / 2)];
};

E.id = function () { return E.state.nextId++; };

E.makeFleet = function (owner, sys, name) {
  if (!name && owner === 'player' && E.newFleetName) name = E.newFleetName();
  const f = { id: E.id(), owner, sys, name: name || null, ships: [], troops: { inf: 0 }, path: [], prog: 0, order: 'idle', target: null, origin: sys, routeId: null, patrol: null, guard: false, wave: false, born: E.state.t };
  E.state.fleets.push(f);
  return f;
};
E.makeShip = function (owner, h, fit, boost) {
  const s = { uid: E.id(), h, f: fit || E.state.emp[owner].designs[h].slice(), hp: 0, sh: 0 };
  if (boost > 0) s.bo = Math.round(boost); // v1.9 item 3: Keelwright Forge boost (%) stamped at launch
  const st = E.shipStats(owner, s);
  s.hp = st.hp; s.sh = st.sh;
  return s;
};

// ---- Tech / modifiers ----
E.has = function (owner, id) {
  const st = E.state;
  if (owner === 'player') return !!st.emp.player.techs[id];
  if (owner === 'neutral') return false;
  const t = E.TECH_BY_ID[id];
  if (owner === 'crisis') return true;
  const eco = E.DIFFICULTY[st.diff].aiEco;
  const boost = (E.PERS[owner] && E.PERS[owner].techBoost) || 1;
  return st.t > (t.tier + 1) * 10 * 60 * E.TIME_MUL / (eco * boost);
};

E.shipStats = function (owner, s) {
  const H = E.HULLS[s.h];
  const [w, a, sh] = s.f;
  let dmgM = 1, armM = 1, shM = 1;
  if (E.has(owner, 'f1')) dmgM += 0.15;
  if (E.has(owner, 'f8')) dmgM += 0.2;
  if (E.has(owner, 'f2')) armM += 0.2;
  if (E.has(owner, 'f9')) armM += 0.1;
  if (E.has(owner, 'f5')) shM += 0.25;
  if (owner === 'crisis') { dmgM *= 1.15; armM *= 1.2; }
  const hp = H.hp * (1 + 0.35 * a) * armM * (s.h === 'destroyer' && E.has(owner, 'f6') ? 1.2 : 1);
  const shield = H.hp * 0.3 * sh * shM;
  const capital = E.CAPITAL.includes(s.h);
  const dps = H.noWeapon ? 0 : w * 5.5 * H.sf * dmgM * (capital && E.has(owner, 'f3') ? 1.15 : 1);
  let cap = H.cap ? H.cap * (E.has(owner, 'f4') ? 1.5 : 1) : 0;
  if (s.bo) { const bm = 1 + s.bo / 100; return { hp: hp * bm, sh: shield * bm, dps: dps * bm, cap, speed: H.speed, range: H.range, size: H.size, bo: s.bo }; }
  return { hp, sh: shield, dps, cap, speed: H.speed, range: H.range, size: H.size };
};
E.shipPts = function (h) { const c = E.HULLS[h].cost; return (c.metal || 0) + (c.crystal || 0); };

// v1.7 (item 7): one shipStats() per distinct design instead of one per ship — a 300 000-ship fleet used to cost ~25 ms per call
let HULL_IDX = null;
// shipStats memoised per design inside one caller-owned memo object (design = hull + fit)
E.shipStatsM = function (owner, s, memo) {
  if (!HULL_IDX) { HULL_IDX = {}; Object.keys(E.HULLS).forEach((h, i) => { HULL_IDX[h] = i; }); }
  const fv = s.f, a0 = fv[0], a1 = fv[1], a2 = fv[2];
  if (a0 >= 0 && a0 < 10 && a1 >= 0 && a1 < 10 && a2 >= 0 && a2 < 10 && (a0 | 0) === a0 && (a1 | 0) === a1 && (a2 | 0) === a2) {
    const k = ((HULL_IDX[s.h] * 10 + a0) * 10 + a1) * 10 + a2 + (s.bo ? 100000 * s.bo : 0);
    return memo[k] || (memo[k] = E.shipStats(owner, s));
  }
  return E.shipStats(owner, s);
};
E.fleetStats = function (f) {
  let hp = 0, dps = 0, cap = 0, speed = 9, armed = 0;
  const S = f.ships, n = S.length, memo = {};
  for (let i = 0; i < n; i++) {
    const s = S[i], st = E.shipStatsM(f.owner, s, memo);
    hp += s.hp + s.sh; dps += st.dps; cap += st.cap; if (st.speed < speed) speed = st.speed;
    if (st.dps > 0) armed++;
  }
  return { hp, dps, cap, speed: n ? speed : 1, power: Math.sqrt(Math.max(0, hp * dps)), armed, troopsUsed: E.troopSize(f.troops) };
};
// cheap "does this fleet have any weapon?" (stops at the first armed ship)
E.fleetArmed = function (f) { const S = f.ships; for (let i = 0; i < S.length; i++) { const s = S[i]; if (!E.HULLS[s.h].noWeapon && s.f[0] > 0) return true; } return false; };
E.troopSize = function (t) { let n = 0; for (const k of E.TROOP_KEYS) n += (t[k] || 0) * E.TROOPS[k].size; return n; };
E.troopCount = function (t) { let n = 0; for (const k of E.TROOP_KEYS) n += (t[k] || 0); return n; };
E.troopPower = function (t, owner, attacking) {
  let a = 0; for (const k of E.TROOP_KEYS) a += (t[k] || 0) * E.TROOPS[k].atk;
  let m = 1; if (E.has(owner, 'f7')) m += 0.25; if (attacking && E.has(owner, 'f4')) m += 0.15;
  if (owner === 'player' && E.speciesBonus('troopAtk') !== 1) m *= E.speciesBonus('troopAtk');
  return a * m;
};

E.planetSlots = function (p) {
  let n = p.size + (E.ptype(p).slots || 0) + (E.has(p.owner, 'e8') ? 1 : 0);
  return Math.min(n, p.slots.length);
};
E.bLevel = function (p, b) { let m = 0; for (let i = 0; i < E.planetSlots(p); i++) if (p.slots[i].b === b) m = Math.max(m, p.slots[i].lvl); return m; };
E.bSum = function (p, b) { let m = 0; for (let i = 0; i < E.planetSlots(p); i++) if (p.slots[i].b === b) m += p.slots[i].lvl; return m; };
E.bCost = function (b, lvl, owner) {
  const c = E.BUILDINGS[b].cost, f = Math.pow(1.55, Math.min(lvl, 10) - 1) * Math.pow(1.5, Math.max(0, lvl - 10)), o = {}; // v1.6: Lv11–15 grow ×1.5
  for (const k in c) if (c[k]) o[k] = Math.round(c[k] * f * 0.85); // v1.5: −15% to keep pace with the leaner metal
  return o;
};
E.bTime = function (b, lvl, owner) {
  let t = E.BUILDINGS[b].time * Math.pow(1.42, Math.min(lvl, 10) - 1) * Math.pow(1.25, Math.max(0, lvl - 10)) * E.TIME_MUL; // v1.6: Lv11–15 ×1.25
  if (E.has(owner, 'e4')) t *= 0.9; if (E.has(owner, 'e6')) t *= 0.8;
  t /= E.spBonus(owner, 'buildSpeed'); // v1.8 species
  return t * E.BUILD_TIME_X; // v1.9 item 6: building upgrades take twice as long
};
E.defCap = function (p, d) {
  if (d === 'turret') return 6 + (E.hasSpec(p, 'defense') ? 4 : 0) + (E.has(p.owner, 'd5') ? 2 : 0);
  if (d === 'station') return 1 + (E.hasSpec(p, 'defense') ? 1 : 0) + (E.has(p.owner, 'd6') ? 1 : 0);
  if (d === 'laser') { const hq = (E.hqLevel && E.hqLevel(p.owner)) || 5; return Math.min(5, 1 + Math.floor(hq / 3)); }
  if (d === 'railgun') return 1;
  return (E.DEFENSES[d] && E.DEFENSES[d].max) || 0;
};
E.defCost = function (d, next) {
  const c = E.DEFENSES[d].cost, o = {};
  const f = d === 'railgun' ? 1 : d === 'laser' ? Math.pow(1.28, next - 1) : d === 'turret' ? Math.pow(1.18, next - 1) : d === 'station' ? Math.pow(1.6, next - 1) : Math.pow(1.5, next - 1);
  for (const k in c) o[k] = Math.round(c[k] * f);
  return o;
};
E.defTime = function (d, next, owner) {
  let t = E.TIME_MUL * E.DEFENSES[d].time * (d === 'railgun' ? 1 : d === 'laser' ? Math.pow(1.15, next - 1) : d === 'turret' ? Math.pow(1.12, next - 1) : Math.pow(1.35, next - 1));
  if (E.has(owner, 'd7')) t *= 0.6;
  return t;
};
E.defMult = function (p) {
  let m = 1; if (E.hasSpec(p, 'defense')) m += 0.4; if (E.has(p.owner, 'd9')) m += 0.25;
  m *= (E.ptype(p).defHp || 1);
  if (p.owner === 'player') m *= E.speciesBonus('defHp');
  return m;
};
E.shieldMax = function (st, p) {
  if (!p.def.shield) return 0;
  let v = 800 * Math.pow(p.def.shield, 1.3) * (E.ptype(p).shield || 1) * E.defMult(p);
  if (E.has(p.owner, 'd2')) v *= 1.3;
  return v;
};
E.turretStats = function (p) {
  let hp = 900 * E.defMult(p) * (E.has(p.owner, 'd1') ? 1.25 : 1), dps = 36 * (E.has(p.owner, 'd5') ? 1.25 : 1) * (E.has(p.owner, 'd9') ? 1.25 : 1);
  return { hp, dps, range: 230 };
};
E.stationStats = function (p) {
  let hp = 7000 * E.defMult(p) * (E.has(p.owner, 'd1') ? 1.25 : 1) * (E.has(p.owner, 'd6') ? 1.4 : 1), dps = 120 * (E.has(p.owner, 'd9') ? 1.25 : 1);
  return { hp, dps, range: 260 };
};
// v2.6 item 6: Defense Laser — continuous beam, unlimited range, DPS ramps on a held target.
E.LASER_RAMP = 8; E.LASER_RAMP_MAX = 3;
E.laserStats = function (p) {
  const n = Math.max(1, p.def.laser || 1);
  const hp = 850 * E.defMult(p) * (E.has(p.owner, 'd1') ? 1.25 : 1);
  const dps = 24 * (E.has(p.owner, 'd9') ? 1.2 : 1);
  return { hp, dps, range: 9999, ramp: E.LASER_RAMP, rampMax: E.LASER_RAMP_MAX };
};
// Planetary Railgun — one per planet, slow heavy hits, unlimited range. Strong, not invincible.
E.railgunStats = function (p) {
  const hp = 4800 * E.defMult(p) * (E.has(p.owner, 'd1') ? 1.25 : 1);
  return { hp, dps: 0, shot: 2200, range: 9999, cd: 3.5 };
};
E.mineDamage = function (p) { return p.def.mines * 40 * (E.has(p.owner, 'd3') ? 1.6 : 1); };
E.garrisonCap = function (p) { return Infinity; }; // v1.4: no garrison cap
E.garrisonDefMult = function (p, specFrac) {
  const bunk = E.bSum(p, 'bunker') * 0.15 * (1 - 0.5 * (specFrac || 0));
  let m = 1 + bunk; if (E.hasSpec(p, 'defense')) m *= 1.3; if (E.has(p.owner, 'd4')) m *= 1.2; if (E.has(p.owner, 'd9')) m *= 1.25; if (E.has(p.owner, 'f7')) m *= 1.25;
  return m;
};
E.defenseRating = function (p) {
  const t = E.turretStats(p), s = E.stationStats(p), L = E.laserStats ? E.laserStats(p) : { hp: 0, dps: 0 }, R = E.railgunStats ? E.railgunStats(p) : { hp: 0, shot: 0, cd: 1 };
  const hp = p.shieldHp + p.def.turret * t.hp + p.def.station * s.hp + (p.def.laser || 0) * L.hp + (p.def.railgun || 0) * R.hp;
  const dps = p.def.turret * t.dps + p.def.station * s.dps + (p.def.laser || 0) * L.dps * 2 + (p.def.railgun || 0) * ((R.shot || 0) / Math.max(1, R.cd || 3.5));
  return { hp, dps, power: Math.sqrt(hp * Math.max(dps, 1)) };
};

// v1.5: trader slots. Each Trade Center level adds 2–3 slots (Lv10 = 25) and every Trade Center on a planet stacks.
E.traderSlotsFor = lv => Math.round(2.5 * lv);
E.routeCap = function (p) {
  let n = 0; for (let i = 0; i < E.planetSlots(p); i++) { const sl = p.slots[i]; if (sl.b === 'tradeport' && sl.lvl) n += E.traderSlotsFor(sl.lvl); }
  if (!n) return 0;
  return n + (E.hasSpec(p, 'trade') ? 2 : 0) + (E.has(p.owner, 'e5') ? 2 : 0);
};

// v1.5: no storage cap on resources.
E.storageCap = function () { return Infinity; };
// v1.5: Perfect planets carry every planet-type bonus and every specialization.
const PERFECT_T = {}; (function () { for (const k in E.PLANET_TYPES) { const T = E.PLANET_TYPES[k]; for (const q in T) if (typeof T[q] === 'number') PERFECT_T[q] = Math.max(PERFECT_T[q] || 0, T[q]); } })();
E.ptype = function (p) { const T = E.PLANET_TYPES[p.type]; if (!p.perfect) return T; return Object.assign({}, T, PERFECT_T); };
E.hasSpec = function (p, k) { return !!p && (p.spec === k || !!p.perfect); };

// Sum of a building type's levels on a planet with diminishing returns for extra copies (best copy counts fully).
E.bPower = function (p, b, fn) {
  const lv = []; for (let i = 0; i < E.planetSlots(p); i++) if (p.slots[i].b === b && p.slots[i].lvl) lv.push(p.slots[i].lvl);
  lv.sort((x, y) => y - x); let t = 0; lv.forEach((l, k) => { t += (fn ? fn(l) : l) * Math.pow(E.MULTI_DR, k); }); return t;
};
E.bCount = function (p, b) { let n = 0; for (let i = 0; i < E.planetSlots(p); i++) if (p.slots[i].b === b) n++; return n; };
// ---- Energy (v1.3): per-planet capacity, not a stockpile ----
E.energyMax = function (p) {
  let e = E.ENERGY_BASE + (E.ptype(p).energy || 0) + (E.hasSpec(p, 'resource') ? 4 : 0) + E.bSum(p, 'plant') * E.ENERGY_PER_PLANT;
  for (const q of (p.queues && p.queues.build) || []) if (q.b === 'plant' && false) e += E.ENERGY_PER_PLANT;
  if (E.has(p.owner, 'e2')) e *= 1.25;
  return Math.floor(e);
};
E.energyUsed = function (p, withQueue) {
  let u = 0;
  for (let i = 0; i < E.planetSlots(p); i++) { const s = p.slots[i]; if (s.b && s.lvl) u += (E.BUILDINGS[s.b].energy || 0) * s.lvl; }
  if (withQueue) for (const q of (p.queues && p.queues.build) || []) u += E.BUILDINGS[q.b].energy || 0;
  return u;
};
E.planetProd = function (p) {
  // per minute (v1.3: halved with TIME_MUL so the economy keeps pace with the slower clock)
  // v1.5 rebalance: extractors give less metal and more crystal (ships and troops are plentiful); buildings got cheaper to match.
  const o = { metal: 14, crystal: 14, rp: 1 };
  const g = l => l * Math.pow(1.13, l - 1);
  o.metal += 34 * E.bPower(p, 'mine', g);
  o.crystal += 46 * E.bPower(p, 'power', g);
  o.rp += 9 * E.bPower(p, 'lab', g);
  const T = E.ptype(p), own = p.owner;
  o.metal *= (T.metal || 1) * (E.has(own, 'e1') ? 1.2 : 1) * (E.hasSpec(p, 'resource') ? 1.3 : 1);
  o.crystal *= (T.crystal || 1) * (E.has(own, 'e3') ? 1.2 : 1) * (E.hasSpec(p, 'resource') ? 1.3 : 1);
  o.rp *= (T.rp || 1);
  const depot = 1 + 0.06 * E.bSum(p, 'warehouse') + (E.has(own, 'e4') ? 0.05 : 0); o.metal *= depot; o.crystal *= depot;
  if (own === 'player') { o.metal *= E.speciesBonus('metal'); o.crystal *= E.speciesBonus('crystal'); if (E.hqMul) o.rp *= E.hqMul('rp'); }
  const all = (E.has(own, 'e9') ? 1.25 : 1) * (p.blockade ? 0.5 : 1) / E.TIME_MUL;
  for (const k in o) o[k] *= all;
  return o;
};

E.sysPlanet = function (sysId) { const s = E.state.systems[sysId]; return s.planetId == null ? null : E.state.planets[s.planetId]; };
E.ownerOfSys = function (sysId) { const p = E.sysPlanet(sysId); return p ? p.owner : 'none'; };
E.playerPlanets = function () { return E.state.planets.filter(p => p.owner === 'player'); };

// v1.4: teams — you and your computer allies are one team; rivals fight the team when at war with you.
E.isAlly = o => !!(E.state && E.state.allies && E.state.allies.includes(o));
E.team = o => (o === 'player' || E.isAlly(o)) ? 'player' : o;
E.hostile = function (a, b) {
  if (a === b) return false;
  if (a === 'neutral' || b === 'neutral') return false; // neutrals only fight when attacked (handled in sim)
  if (a === 'crisis' || b === 'crisis') return true;
  const ta = E.team(a), tb = E.team(b);
  if (ta === tb) return false;
  if (ta === 'player' || tb === 'player') {
    const o = ta === 'player' ? b : a;
    return !!(E.state.emp[o] && E.state.emp[o].war);
  }
  // v1.7: free-for-all — rival AI empires fight each other too (the peaceful ones only defend)
  if (E.state.ffa === false) return false;
  return !!((E.PERS[a] && E.PERS[a].aggressive) || (E.PERS[b] && E.PERS[b].aggressive));
};
E.BUILD_TIME_X = 2;
// v1.9 item 3: Keelwright Forge — +3% per Forge level on this planet (all copies stack), capped at +75%
E.FORGE_PER_LVL = 3; E.FORGE_MAX = 75;
E.forgeBoost = function (p) { const n = E.bSum ? E.bSum(p, 'forge') : 0; return Math.min(E.FORGE_MAX, n * E.FORGE_PER_LVL); };
E.speciesBonus = function (k) { return E.spBonus('player', k); };
// v1.8 item 6: species of any empire (player = st.species, AIs = st.aiSpecies[owner]); bonus multiplier k or 1
E.speciesOf = function (owner) { const st = E.state; if (!st) return 'none'; if (owner === 'player') return st.species || 'none'; return (st.aiSpecies && st.aiSpecies[owner]) || 'none'; };
E.spBonus = function (owner, k) { const sp = E.SPECIES[E.speciesOf(owner)]; return (sp && sp[k]) || 1; };
E.speciesLook = function () { const st = E.state; if (!st) return 'human'; return st.look || (E.SPECIES[st.species] && E.SPECIES[st.species].look) || 'human'; };

// ---- v1.3 movement rules ----
// A fleet may pass through systems that are its own, allied/at peace, independent or uncolonised, never through a
// planet held by an empire it is at war with. Enemy planets can only be entered as the destination, and only when
// they touch a system the fleet can reach: the front line. The Hollow and independents are not bound by this.
E.blocksPassage = function (owner, sys) {
  if (owner === 'neutral') return false;
  const p = E.sysPlanet(sys); if (!p) return false;
  if (owner === 'crisis') return E.team(p.owner) === 'player'; // v1.5: your worlds are a wall even for the Hollow
  if (p.owner === owner || p.owner === 'neutral') return false;
  return E.hostile(owner, p.owner) || p.owner === 'crisis';
};
E.pathFor = function (owner, from, to) {
  if (from === to) return [];
  if (owner === 'neutral') return E.path(from, to);
  // v2.1 item 10: inside an AI batch scope (target scans) the blocking weight is the same for every target except the
  // target itself (never blocked), so ONE full tree per (owner, from) serves every `to` — same routes, far fewer searches.
  if (E._pbatch && !E.NO_PBATCH) {
    const k = owner + ':' + from; let t = E._pbatch.get(k);
    if (!t) { t = dijkstra(E.state.systems, from, v => E.blocksPassage(owner, v) ? Infinity : 1, -1); E._pbatch.set(k, t); E.pbStats.trees++; }
    E.pbStats.hits++;
    if (t.d[to] < Infinity) return walkPath(t.prev, from, to, null);
    // a blocked (enemy) target: reachable through its best reached, non-blocked neighbour — the same choice a search
    // that treats only `to` as passable makes
    const S = E.state.systems, st = S[to]; let bd = Infinity, bu = -1;
    for (const u of st.lanes) { if (!(t.d[u] < Infinity) || (u !== from && E.blocksPassage(owner, u))) continue; const su = S[u]; const nd = t.d[u] + (1 + Math.hypot(su.x - st.x, su.y - st.y) * 1e-4); if (nd < bd) { bd = nd; bu = u; } }
    if (bu < 0) return null;
    return walkPath(t.prev, from, bu, to);
  }
  return E.path(from, to, v => (v !== to && E.blocksPassage(owner, v)) ? Infinity : 1);
};
E.pbStats = { trees: 0, hits: 0 };
E._walkPath = (prev, from, end) => walkPath(prev, from, end, null);
// walk a predecessor chain back to `from`; null (never an endless loop) if the chain is broken
function walkPath(prev, from, end, extra) {
  const p = []; let c = end, guard = prev.length + 1;
  while (c !== from) { if (c < 0 || guard-- <= 0) return null; p.push(c); c = prev[c]; }
  p.reverse(); if (extra != null) p.push(extra); return p;
}
// run fn with the per-(owner, from) route cache; nested scopes share the outer cache
E.withPathBatch = function (fn) {
  if (E._pbatch) return fn();
  E._pbatch = new Map();
  try { return fn(); } finally { E._pbatch = null; }
};
// Why can't `owner` send a fleet from `from` to `to`? '' when allowed.
E.targetBlock = function (owner, from, to) {
  if (from === to) return '';
  if (E.pathFor(owner, from, to)) return '';
  const p = E.sysPlanet(to);
  if (p && E.blocksPassage(owner, to)) {
    const front = E.state.systems[to].lanes.some(n => !E.blocksPassage(owner, n) && (n === from || E.pathFor(owner, from, n)));
    return front ? 'No safe route' : 'Behind the enemy front — capture a neighbouring world first';
  }
  return 'No route that avoids enemy worlds';
};
E.isFrontLine = function (owner, sys) {
  const p = E.sysPlanet(sys); if (!p || !E.blocksPassage(owner, sys)) return false;
  return E.state.systems[sys].lanes.some(n => !E.blocksPassage(owner, n) && E.reachableFrom(owner).has(n));
};
// systems any of owner's planets/fleets can reach without crossing enemy worlds (cached per tick)
E.reachableFrom = function (owner) {
  const st = E.state; const key = owner + ':' + Math.floor(st.t * 2);
  E._reach = E._reach || {}; if (E._reach[owner] && E._reach[owner].key === key) return E._reach[owner].set;
  const set = new Set(), q = [];
  for (const p of st.planets) if (p.owner === owner) { set.add(p.sys); q.push(p.sys); }
  for (const f of st.fleets) if (f.owner === owner) { const s0 = f.path.length ? f.path[0] : f.sys; if (!set.has(s0)) { set.add(s0); q.push(s0); } }
  while (q.length) { const u = q.shift(); for (const v of st.systems[u].lanes) if (!set.has(v) && !E.blocksPassage(owner, v)) { set.add(v); q.push(v); } }
  E._reach[owner] = { key, set }; return set;
};

// Shortest path on lanes (Dijkstra). Returns list of system ids excluding start.
E.tradePath = function (from, to) { const st = E.state, stamp = Math.floor(st.t / 5); if (!E._tpc || E._tpc.st !== st || E._tpc.stamp !== stamp) E._tpc = { st, stamp, m: new Map() }; const k = from * 4096 + to; if (E._tpc.m.has(k)) return E._tpc.m.get(k); const r = E._tradePath(from, to); E._tpc.m.set(k, r); return r; }; // v1.5 perf: 100+ routes re-ran Dijkstra every tick
E._tradePath = function (from, to) { return E.path(from, to, s => { const p = E.sysPlanet(s); return p && s !== to && (E.hostile('player', p.owner) || p.owner === 'crisis') ? 6 : 1; }); };
// Binary-heap Dijkstra. Unweighted trees are cached per start system (the lane graph never changes in a game).
// hop-first shortest paths: each lane = 1 tile, lane length only breaks ties
function dijkstra(S, from, weight, to) {
  const n = S.length, d = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1);
  const heap = [[0, from]]; d[from] = 0;
  const push = it => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [du, u] = pop();
    if (du > d[u]) continue;
    if (u === to) break;
    const su = S[u];
    for (const v of su.lanes) { const sv = S[v]; const nd = du + (1 + Math.hypot(su.x - sv.x, su.y - sv.y) * 1e-4) * (weight ? weight(v) : 1); if (nd < d[v]) { d[v] = nd; prev[v] = u; push([nd, v]); } }
  }
  return { d, prev };
}
E.spTree = function (from) {
  const S = E.state.systems;
  if (!E._sp || E._sp.S !== S) E._sp = { S, trees: [] };
  return E._sp.trees[from] || (E._sp.trees[from] = dijkstra(S, from, null, -1));
};
E.path = function (from, to, weight) {
  const S = E.state.systems;
  if (from === to) return [];
  const t = weight ? dijkstra(S, from, weight, to) : E.spTree(from);
  if (t.d[to] === Infinity) return null;
  return walkPath(t.prev, from, to, null);
};
// Distance (lane px) between two systems along the shortest lane route; Infinity when unreachable.
E.laneDist = function (from, to) { return from === to ? 0 : E.spTree(from).d[to]; };
E.pathLen = function (from, path) { let L = 0, c = from; for (const n of path) { L += E.dist(E.state.systems[c], E.state.systems[n]); c = n; } return L; };
// ---- Travel (v1.2): 2 game-minutes per tile (lane hop) at 1x. f.speedMul (0.25..1) only slows a fleet down. ----
E.hops = function (from, to) { if (from === to) return 0; const d = E.laneDist(from, to); return d === Infinity ? Infinity : Math.round(d); };
// v1.8: species fleet speed + hull travel factor (slowest ship sets it; only Freighters are faster than 1)
E.fleetTravel = function (f) { if (!f || !f.ships || !f.ships.length) return 1; let m = Infinity; for (const s of f.ships) { const t = E.HULLS[s.h].travel || 1; if (t < m) m = t; } return m; };
E.hopTime = function (f) { return E.HOP_TIME / E.clamp((f && f.speedMul) || 1, 0.25, 1) / (f ? E.spBonus(f.owner, 'shipSpeed') * E.fleetTravel(f) : 1); };
E.pxPerSec = function () { return 0; }; // legacy (unused)
E.travelTime = function (f, to) { const h = E.hops(f.sys, to); return h * E.hopTime(f); };
// Map position of a fleet (interpolated along its current lane).
E.fleetXY = function (f) {
  const S = E.state.systems, a = S[f.sys];
  if (!f.path.length) return { x: a.x, y: a.y };
  const b = S[f.path[0]];
  return { x: E.lerp(a.x, b.x, f.prog), y: E.lerp(a.y, b.y, f.prog) };
};
// Seconds until a moving fleet finishes its current path (0 when docked).
E.fleetETA = function (f) { if (!f || !f.path || !f.path.length) return 0; try { return ((1 - (f.prog || 0)) + f.path.length - 1) * E.hopTime(f); } catch (e) { return 0; } };
// Seconds for a fleet to reach `to` from where it is now at full speed (speedMul 1) unless keepMul; Infinity when unreachable.
E.etaTo = function (f, to, keepMul) {
  const ht = keepMul ? E.hopTime(f) : E.HOP_TIME;
  // v1.3: travel time follows the legal route (never through enemy worlds)
  const hopsTo = (a) => { if (a === to) return 0; const pth = E.pathFor(f.owner, a, to); return pth ? pth.length : Infinity; };
  if (!f.path.length) return hopsTo(f.sys) * ht;
  const nx = f.path[0];
  return ((1 - f.prog) + hopsTo(nx)) * ht;
};
// Time (s) for a moving fleet to reach each node of its remaining path: [{sys, t}]
E.pathTimes = function (f) {
  const out = []; if (!f.path.length) return out; const ht = E.hopTime(f);
  let T = (1 - f.prog) * ht; out.push({ sys: f.path[0], t: T });
  for (let i = 1; i < f.path.length; i++) { T += ht; out.push({ sys: f.path[i], t: T }); }
  return out;
};
// v1.2: win odds are PERCENTAGE RANGES ("42–65%"); a single number when the range is tight (high scout level).
E.fmtPct = function (lo, hi) {
  if (lo == null) return 'unknown';
  lo = Math.round(E.clamp(lo, 0, 1) * 100); hi = Math.round(E.clamp(hi == null ? lo / 100 : hi, 0, 1) * 100);
  if (hi < lo) [lo, hi] = [hi, lo];
  return hi - lo <= 2 ? Math.round((lo + hi) / 2) + '%' : lo + '–' + hi + '%';
};
E.fmtOdds = function (k, n) { return n ? E.fmtPct(k / n, k / n) : 'unknown'; };
E.addLog = function (msg, kind, sys, rep) {
  const st = E.state; if (!st) return;
  st.log.unshift({ t: st.t, msg, kind: kind || 'info', sys: sys == null ? null : sys, rep: rep == null ? undefined : rep });
  if (st.log.length > 160) st.log.length = 160;
  if (E.onLog) E.onLog(st.log[0]);
};

// ---- Save / Load ----
// v2.1 item 6: the save picks the NEWEST slot (by its write time) instead of trusting key order, every write is
// stamped with this window's session id, autosaves never overwrite a newer save written by another copy of the
// game (second tab / window / stale PWA instance), and a failed write (e.g. storage full) is reported, not
// flashed as "saved".
// v2.2 item 4: 3 named slots (E.slot = the slot this game saves into), Export (JSON download) / Import (file).
// Continue = the newest slot.
E.SESSION = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
E._myWhen = 0; E.saveConflict = false; E.lastSaveError = null; E.slot = 1;
const readMeta = k => { try { return JSON.parse(localStorage.getItem(k + '_meta') || 'null'); } catch (e) { return null; } };
E.readSaveMeta = readMeta;
E.slotKey = n => SLOT_KEYS[(n || E.slot || 1) - 1] || SAVE_KEY;
// newest save slot: highest meta.when; ties (or no meta) go to the earlier key in the chain (slots before old versions)
E.newestSaveKey = function () {
  let best = null, bw = -Infinity;
  try { for (const k of SAVE_CHAIN) { if (!localStorage.getItem(k)) continue; const m = readMeta(k), w = m && +m.when || 0; if (w > bw) { bw = w; best = k; } } } catch (e) { return null; }
  return best;
};
function writeSave(key, raw, meta) {
  localStorage.setItem(key, raw);
  localStorage.setItem(key + '_meta', meta);
}
E.slotName = function (n) { const m = readMeta(E.slotKey(n)); return (m && m.name) || 'Slot ' + n; };
function serialize(st) {
  if (E.serializeState) return E.serializeState(st);
  const copy = Object.assign({}, st, { toasts: [] });
  copy.battles = st.battles.map(b => Object.assign({}, b, { fx: [] }));
  return JSON.stringify(copy, (k, v) => (k === '_f' || k === '_s') ? undefined : v);
}
E.serialize = function () { return serialize(E.state); };
function metaFor(st, when, name) {
  return { t: st.t, diff: st.diff, when, sid: E.SESSION, ver: E.VERSION, planets: E.playerPlanets().length, size: st.cfg && st.cfg.size, rivals: st.cfg && st.cfg.rivals, mode: st.mode, stage: st.endless ? st.endless.stage + 1 : 0, species: st.species, name: name || null };
}
E.save = function (opts) {
  opts = opts || {};
  try {
    const st = E.state; if (!st) return false;
    if (st._sim) return false; // never save a throw-away sandbox
    const slot = opts.slot || E.slot || 1, key = E.slotKey(slot), old = readMeta(key);
    if (opts.auto) { // autosave / app hidden: don't clobber a newer save written by another copy of the game
      if (old && old.sid && old.sid !== E.SESSION && (+old.when || 0) > E._myWhen) { E.saveConflict = true; return false; }
    }
    const when = Math.max(Date.now(), E._myWhen + 1);
    st.savedAt = when; st.slot = slot;
    const raw = serialize(st);
    const name = opts.name != null ? String(opts.name).slice(0, 24) : (old && old.name) || null;
    const meta = JSON.stringify(metaFor(st, when, name));
    try { writeSave(key, raw, meta); }
    catch (e) { // storage full: drop the superseded older-version slots and try once more
      for (const k of PREV_CHAIN) { localStorage.removeItem(k); localStorage.removeItem(k + '_meta'); }
      writeSave(key, raw, meta);
    }
    if (localStorage.getItem(key + '_meta') !== meta) throw new Error('save did not stick');
    E._myWhen = when; E.saveConflict = false; E.lastSaveError = null; E.slot = slot;
    return true;
  } catch (e) { E.lastSaveError = String(e && e.message || e); console.warn('save failed', e); return false; }
};
E.hasSave = function () { try { return SAVE_CHAIN.some(k => !!localStorage.getItem(k)); } catch (e) { return false; } };
E.migratedFromV25 = false; E.migratedFromV24 = false; E.migratedFromV23 = false; E.migratedFromV22 = false; E.migratedFromV21 = false; E.migratedFromV20 = false; E.migratedFromV19 = false; E.migratedFromV18 = false; E.migratedFromV17 = false; E.migratedFromV16 = false; E.migratedFromV15 = false;
E.saveMeta = function () { const k = E.newestSaveKey(); return k ? readMeta(k) || readMeta(SAVE_KEY) : null; };
// the 3 slots for the title / settings screen
E.slotInfo = function () { return SLOT_KEYS.map((k, i) => { let has = false; try { has = !!localStorage.getItem(k); } catch (e) { } const m = has ? readMeta(k) : null; return { n: i + 1, key: k, has, name: (m && m.name) || 'Slot ' + (i + 1), meta: m }; }); };
function parseSave(raw) {
  if (E.unpackSave) raw = E.unpackSave(raw);
  const st = JSON.parse(raw);
  if (!st || (st.v !== 1 && st.v !== 2) || !st.planets || !st.systems || !st.emp) throw new Error('not a Galaxies of Empires save');
  E.migrate(st);
  st.toasts = []; (st.battles || []).forEach(b => b.fx = []); st.battles = st.battles || [];
  return st;
}
E.parseSave = parseSave;
E.loadKey = function (key) {
  try {
    const raw = localStorage.getItem(key); if (!raw) return null;
    const fromPrev = SLOT_KEYS.indexOf(key) < 0;
    const st = parseSave(raw);
    const m = readMeta(key); E._myWhen = Math.max(E._myWhen, m && +m.when || 0);
    E.state = st; E.loadedFrom = key;
    if (fromPrev) { E.slot = 1; E.migratedFromV24 = E.migratedFromV23 = E.migratedFromV22 = E.migratedFromV21 = E.migratedFromV20 = E.migratedFromV19 = E.migratedFromV18 = E.migratedFromV17 = E.migratedFromV16 = E.migratedFromV15 = true; E.save({ slot: 1 }); }
    else E.slot = SLOT_KEYS.indexOf(key) + 1;
    return st;
  } catch (e) { console.warn('load failed', e); return null; }
};
E.load = function () { if (E.migratePrevSlots) E.migratePrevSlots(); const key = E.newestSaveKey(); return key ? E.loadKey(key) : null; };
E.loadSlot = n => E.loadKey(E.slotKey(n));
E.deleteSlot = function (n) { try { const k = E.slotKey(n); localStorage.removeItem(k); localStorage.removeItem(k + '_meta'); } catch (e) { } };
E.renameSlot = function (n, name) { try { const k = E.slotKey(n), m = readMeta(k); if (!m) return false; m.name = String(name || '').slice(0, 24) || null; localStorage.setItem(k + '_meta', JSON.stringify(m)); return true; } catch (e) { return false; } };
// Export: a self-describing JSON file; Import: validates, migrates and writes into a slot
E.exportSave = function (n) {
  const k = n ? E.slotKey(n) : E.newestSaveKey(); let raw = null, meta = null;
  if (E.state && !E.state._sim && (!n || n === E.slot)) { raw = serialize(E.state); meta = metaFor(E.state, Date.now(), E.slotName(E.slot)); }
  else { try { raw = k && localStorage.getItem(k); meta = k && readMeta(k); } catch (e) { } }
  if (!raw) return null;
  if (E.unpackSave) raw = E.unpackSave(raw);
  return JSON.stringify({ format: 'goe-save', ver: E.VERSION, exported: new Date().toISOString(), meta, state: JSON.parse(raw) });
};
E.importSave = function (text, n) {
  let obj; try { obj = JSON.parse(text); } catch (e) { return { ok: false, msg: 'Not a JSON file' }; }
  const stObj = obj && obj.format === 'goe-save' ? obj.state : obj;
  let st; try { st = parseSave(JSON.stringify(stObj)); } catch (e) { return { ok: false, msg: 'Not a Galaxies of Empires save' }; }
  const slot = n || 1, prev = E.state, prevSlot = E.slot;
  E.state = st;
  const nm0 = obj && obj.meta && obj.meta.name; const ok = E.save({ slot, name: nm0 && !/^Slot \d$/.test(nm0) ? nm0 : 'Imported' });
  if (!ok) { E.state = prev; E.slot = prevSlot; return { ok: false, msg: 'Could not write the save (storage full?)' }; }
  E.state = prev; E.slot = prevSlot;
  return { ok: true, slot };
};
// Bring an older (v1.0) save up to the current shape.
E.migrate = function (st) {
  if (!st.cfg) {
    const D = E.DIFFICULTY[st.diff];
    st.cfg = { size: 'small', n: 20, rivals: 3, travel: 1, crisisMult: 1, waves: 8, need: Math.max(5, Math.round(0.4 * D.shareMul * 20)), crisisAt: D.crisisAt };
  }
  if (!st.rivals) st.rivals = ['raider', 'expansionist', 'trader'];
  if (st.riftId == null) st.riftId = st.systems.findIndex(s => s.rift);
  st.windows = st.windows || []; st.alerts = st.alerts || {}; st.results = st.results || [];
  st.stats = Object.assign({ windowsWon: 0, windowsLost: 0 }, st.stats);
  for (const f in st.emp) for (const h of E.ALL_HULLS) if (!st.emp[f].designs[h]) st.emp[f].designs[h] = E.defaultFit(h);
  st.allies = st.allies || []; st.mode = st.mode || 'classic'; st.species = st.species || 'none'; st.defeated = st.defeated || {};
  st.emp.player.cmd = st.emp.player.cmd || { xp: 0, lv: 1, kills: 0 };
  // v1.6: the Flagship (hero) is gone — drop its data and ship, keep Commander level
  delete st.emp.player.hero; for (const f in st.emp) if (st.emp[f].designs) delete st.emp[f].designs.hero;
  st.fleets = st.fleets.filter(f => { f.ships = f.ships.filter(s => s.h !== 'hero'); return f.ships.length || E.troopCount(f.troops || {}); });
  for (const b of st.battles || []) b.units = (b.units || []).filter(u => u.h !== 'hero');
  E.migrate17(st);
  E.migrate18(st);
  if (E.migrate19) E.migrate19(st);
  if (E.migrate20) E.migrate20(st);
  if (E.migrate21) E.migrate21(st);
  if (E.migrate22) E.migrate22(st);
  if (E.migrate23) E.migrate23(st);
  if (E.migrate24) E.migrate24(st);
  if (E.migrate25) E.migrate25(st);
  if (E.migrate26) E.migrate26(st);
  if (E.migrate27) E.migrate27(st);
  if (E.migrate28) E.migrate28(st);
  if (E.migrate29) E.migrate29(st);
  if (E.migrate30) E.migrate30(st);
  if (E.migrate31) E.migrate31(st);
  st.ver = '3.1';
  st.v = 2;
  return st;
};
E.victoryNeed = () => E.state.cfg.need;
E.crisisWaves = () => E.state.cfg.waves;
E.crisisAt = () => E.state.cfg.crisisAt;
E.rivals = () => (E.state && E.state.rivals) || E.AI_FACTIONS;
E.allies = () => (E.state && E.state.allies) || [];
E.isPeaceful = o => !!(E.PERS[o] && E.PERS[o].peaceful);

// v2.6: copy each v2.5 slot into the matching v2.6 slot (once), so a 3-slot v2.5 game is not collapsed into slot 1.
E.migratePrevSlots = function () {
  const groups = [
    { flag: 'migratedFromV27', keys: ['goe_save_v27', 'goe_save_v27_s2', 'goe_save_v27_s3'] },
    { flag: 'migratedFromV26', keys: ['goe_save_v26', 'goe_save_v26_s2', 'goe_save_v26_s3'] },
    { flag: 'migratedFromV25', keys: ['goe_save_v25', 'goe_save_v25_s2', 'goe_save_v25_s3'] },
    { flag: 'migratedFromV24', keys: ['goe_save_v24', 'goe_save_v24_s2', 'goe_save_v24_s3'] },
    { flag: 'migratedFromV23', keys: ['goe_save_v23', 'goe_save_v23_s2', 'goe_save_v23_s3'] },
    { flag: 'migratedFromV22', keys: ['goe_save_v22', 'goe_save_v22_s2', 'goe_save_v22_s3'] },
    { flag: 'migratedFromV21', keys: ['goe_save_v21'] },
    { flag: 'migratedFromV20', keys: ['goe_save_v20'] },
    { flag: 'migratedFromV19', keys: ['goe_save_v19'] },
    { flag: 'migratedFromV18', keys: ['goe_save_v18'] },
    { flag: 'migratedFromV17', keys: ['goe_save_v17'] },
    { flag: 'migratedFromV16', keys: ['goe_save_v16'] },
    { flag: 'migratedFromV15', keys: ['goe_save_v15'] }
  ];
  try {
    for (let i = 0; i < 3; i++) {
      if (localStorage.getItem(SLOT_KEYS[i])) continue;
      for (const g of groups) {
        const src = g.keys[i]; if (!src) continue;
        const raw = localStorage.getItem(src); if (!raw) continue;
        const st = parseSave(raw);
        const prev = E.state, prevSlot = E.slot;
        E.state = st;
        const m = readMeta(src);
        const ok = E.save({ slot: i + 1, name: (m && m.name) || null });
        E.state = prev; E.slot = prevSlot;
        if (ok) E[g.flag] = true;
        break;
      }
    }
  } catch (e) { console.warn('prev slot migrate failed', e); }
};
E.deleteSave = function () { E.slot = 1; try { for (const k of SAVE_CHAIN) { localStorage.removeItem(k); localStorage.removeItem(k + '_meta'); } } catch (e) { } };
})();
