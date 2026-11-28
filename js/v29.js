// Galaxies of Empires v2.9 — still backdrop, center Perfect, v2.5 NN lanes, alerts, baked lanes, overview.
'use strict';
(function () {
const E = window.EOG;

E.migrate29 = function (st) {
  if (!st) return st;
  st.ver = '2.9';
  return st;
};

E.LANE_GRAZE = 56;
E.LOGIC_HZ = 5;
E.BG_STILL = true;
E.MST_CAP29 = 560;
E.NN_CAP29 = 380;

// ---------- point-to-segment distance (item 3) ----------
E.ptSegDist = function (p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  if (L2 < 1e-12) return { d: Math.hypot(p.x - a.x, p.y - a.y), t: 0 };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
  const tc = t;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { d: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)), t: t, tRaw: tc };
};

E.laneGrazes = function (pts, a, b, clearance) {
  const A = pts[a], B = pts[b];
  if (!A || !B) return -1;
  const len = E.dist(A, B);
  const end = Math.max(22, Math.min(70, len * 0.1));
  const clr = clearance == null ? E.LANE_GRAZE : clearance;
  for (let i = 0; i < pts.length; i++) {
    if (i === a || i === b) continue;
    const r = E.ptSegDist(pts[i], A, B);
    if (r.t <= 0 || r.t >= 1) continue;
    const along = r.t * len;
    if (along < end || (len - along) < end) continue;
    if (r.d < clr) return i;
  }
  return -1;
};

E.laneGrazeViolations = function (systems, lanes, clearance) {
  const hits = [];
  for (const l of lanes) {
    const g = E.laneGrazes(systems, l[0], l[1], clearance);
    if (g >= 0) hits.push([l, g]);
  }
  return hits;
};

// ---------- item 3: keep v2.8 homes, relink the open map with v2.5 MST + NN ----------
E.relinkLanes29 = function (map) {
  if (!map || !map.pts || !map.lanes) return map;
  // buildMap28 returns {N,W,H,pts,lanes,CC}; pocket metadata lives on E._map28
  const meta = E._map28 || {};
  const pts = map.pts, pockets = map.pockets || meta.pockets || [];
  const center = map.center || meta.center || [];
  const centerChokes = map.centerChokes || meta.centerChokes || [];
  const inCenter = new Set(center);
  const clusterOf = {};
  pockets.forEach((pk, ci) => (pk.cl || []).forEach(i => { clusterOf[i] = ci; }));
  const isPocket = i => clusterOf[i] != null;
  const designedSet = new Set();
  const designed = [];
  pockets.forEach(pk => (pk.designed || []).forEach(l => {
    designed.push([l[0], l[1]]);
    designedSet.add(l[0] + ',' + l[1]); designedSet.add(l[1] + ',' + l[0]);
  }));
  const N0 = pts.length;
  const lanes = [];
  const has = (a, b) => lanes.some(l => (l[0] === a && l[1] === b) || (l[0] === b && l[1] === a));
  const crosses = (a, b) => {
    const A = pts[a], B = pts[b];
    for (const l of lanes) {
      if (l[0] === a || l[0] === b || l[1] === a || l[1] === b) continue;
      const C = pts[l[0]], D = pts[l[1]];
      if (Math.max(A.x, B.x) < Math.min(C.x, D.x) || Math.min(A.x, B.x) > Math.max(C.x, D.x) ||
          Math.max(A.y, B.y) < Math.min(C.y, D.y) || Math.min(A.y, B.y) > Math.max(C.y, D.y)) continue;
      if (E.segCross(A, B, C, D)) return true;
    }
    return false;
  };
  const grazes = (a, b) => E.laneGrazes(pts, a, b) >= 0;
  const legalJoin = (i, j) => {
    const pk = x => isPocket(x), ct = x => inCenter.has(x);
    if (pk(i) && pk(j) && clusterOf[i] !== clusterOf[j]) return false;
    if (pk(i) && pk(j) && clusterOf[i] === clusterOf[j]) return designedSet.has(i + ',' + j);
    if ((pk(i) && ct(j)) || (pk(j) && ct(i))) {
      const p = pk(i) ? i : j, c = pk(i) ? j : i;
      return centerChokes.indexOf(c) >= 0 && (pockets[clusterOf[p]].exits || []).indexOf(p) >= 0;
    }
    if (pk(i) && !pk(j)) return (pockets[clusterOf[i]].exits || []).indexOf(i) >= 0;
    if (pk(j) && !pk(i)) return (pockets[clusterOf[j]].exits || []).indexOf(j) >= 0;
    if (ct(i) && !ct(j)) return centerChokes.indexOf(i) >= 0;
    if (ct(j) && !ct(i)) return centerChokes.indexOf(j) >= 0;
    return true;
  };
  const link = (a, b, opts) => {
    if (a == null || b == null || a < 0 || b < 0 || a === b || has(a, b)) return false;
    const force = opts && opts.force;
    if (!force && !legalJoin(a, b)) return false;
    if (!force && crosses(a, b)) return false;
    if (!force && grazes(a, b)) return false;
    lanes.push([a, b]);
    return true;
  };

  // 1. Designed pocket lanes stay exactly as v2.8 placed them.
  designed.forEach(l => link(l[0], l[1], { force: true }));

  // 2. v2.5: MST on near edges, then short non-crossing (and non-grazing) neighbours.
  const N = pts.length;
  const capM = E.MST_CAP29, capN = E.NN_CAP29;
  const edges = [];
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    if (!legalJoin(i, j)) continue;
    const d = E.dist(pts[i], pts[j]);
    if (N <= 40 || d < capM) edges.push([d, i, j]);
  }
  edges.sort((a, b) => a[0] - b[0]);
  const par = Array.from({ length: N }, (_, i) => i);
  const find = x => par[x] === x ? x : (par[x] = find(par[x]));
  const uni = (a, b) => { par[find(a)] = find(b); };
  lanes.forEach(([a, b]) => uni(a, b));
  const deg = new Array(N).fill(0);
  lanes.forEach(([a, b]) => { deg[a]++; deg[b]++; });
  for (const [d, i, j] of edges) {
    if (find(i) === find(j)) continue;
    if (link(i, j)) { uni(i, j); deg[i]++; deg[j]++; }
  }
  // connectivity safety net (shortest legal, non-crossing, non-grazing join)
  const stitch = () => {
    for (let g = 0; g < N + 12; g++) {
      const r0 = find(0);
      let hole = -1;
      for (let i = 1; i < N; i++) if (find(i) !== r0) { hole = i; break; }
      if (hole < 0) return true;
      let best = null, bd = Infinity, bestAny = null, bdAny = Infinity;
      for (let a = 0; a < N; a++) if (find(a) === r0) for (let b = 0; b < N; b++) if (find(b) === find(hole) && legalJoin(a, b)) {
        const d = E.dist(pts[a], pts[b]);
        if (d < bdAny) { bdAny = d; bestAny = [a, b]; }
        if (crosses(a, b) || grazes(a, b)) continue;
        if (d < bd) { bd = d; best = [a, b]; }
      }
      if (best) { link(best[0], best[1]); uni(best[0], best[1]); deg[best[0]]++; deg[best[1]]++; continue; }
      // last resort: split the shortest hop with a midpoint that does not graze
      if (!bestAny) return false;
      const a = bestAny[0], b = bestAny[1];
      const mx = (pts[a].x + pts[b].x) / 2, my = (pts[a].y + pts[b].y) / 2;
      let mid = -1, md = 90;
      for (let i = 0; i < pts.length; i++) {
        if (i === a || i === b || isPocket(i)) continue;
        const di = E.dist(pts[i], { x: mx, y: my });
        if (di < md && !crosses(a, i) && !crosses(i, b) && E.laneGrazes(pts, a, i) < 0 && E.laneGrazes(pts, i, b) < 0) {
          md = di; mid = i;
        }
      }
      if (mid < 0) {
        mid = pts.length;
        pts.push({ x: mx, y: my });
        par.push(mid);
        deg.push(0);
        // if the new mid grazes, nudge off the nearest third planet
        let hit = E.laneGrazes(pts, a, mid);
        if (hit < 0) hit = E.laneGrazes(pts, mid, b);
        if (hit >= 0) {
          const q = pts[hit], dx = mx - q.x, dy = my - q.y, L = Math.hypot(dx, dy) || 1;
          pts[mid].x = q.x + dx / L * (E.LANE_GRAZE + 8);
          pts[mid].y = q.y + dy / L * (E.LANE_GRAZE + 8);
        }
      }
      if (link(a, mid) && link(mid, b)) { uni(a, mid); uni(mid, b); deg[a]++; deg[mid] += 2; deg[b]++; }
      else return false;
    }
    return false;
  };
  stitch();
  // extra short neighbours, cap degree at 4 (v2.5)
  for (const [d, i, j] of edges) {
    if (d > capN) break;
    if (has(i, j)) continue;
    if ((deg[i] || 0) >= 4 || (deg[j] || 0) >= 4) continue;
    if (link(i, j)) { deg[i]++; deg[j]++; }
  }
  // Midpoints added during stitch can sit on an earlier lane — drop those grazes and restitch.
  for (let pass = 0; pass < 8; pass++) {
    let n = 0;
    for (let i = lanes.length - 1; i >= 0; i--) {
      const a = lanes[i][0], b = lanes[i][1];
      if (designedSet.has(a + ',' + b)) continue;
      if (E.laneGrazes(pts, a, b) >= 0) { lanes.splice(i, 1); n++; }
    }
    if (!n) break;
    const M = pts.length;
    for (let i = 0; i < M; i++) par[i] = i;
    while (par.length < M) par.push(par.length);
    lanes.forEach(([a, b]) => uni(a, b));
    stitch();
  }

  map.lanes = lanes;
  map.N = pts.length;
  return map;
};

const _build28 = E.buildMap28;
E.buildMap28 = function (opts) {
  const map = _build28.apply(this, arguments);
  return E.relinkLanes29(map);
};
E.buildMap29 = E.buildMap28;

// ---------- item 2: Perfect chance rises toward the centre ----------
E.perfectChance29 = function (t) {
  // t = 1 at the map centre, 0 at a corner
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return 0.06 + 0.62 * t * t;
};
E.centerPerfectCount29 = function (sizeKey, centerN) {
  if (centerN) return centerN;
  if (sizeKey === 'huge') return 8;
  if (sizeKey === 'large') return 6;
  if (sizeKey === 'medium') return 5;
  return 4;
};
E.applyPerfect29 = function (st) {
  if (!st || !st.planets || !st.world) return st;
  const cx = st.world.w / 2, cy = st.world.h / 2;
  const maxD = Math.hypot(cx, cy) || 1;
  const mulberry = E.mulberry || function (a) {
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  };
  const R = mulberry(((st.seed || 0) ^ 0x50657266) | 0);
  const map = E._map28 || E._map26;
  const sizeKey = (st.cfg && st.cfg.size) || (st.size) || 'small';
  for (const p of st.planets) {
    if (p.owner && p.owner !== 'neutral') { p.perfect = true; continue; }
    const s = st.systems[p.sys]; if (!s) continue;
    const t = 1 - Math.hypot(s.x - cx, s.y - cy) / maxD;
    p.perfect = R() < E.perfectChance29(t);
  }
  // guaranteed: centre cluster, or the nearest few on smaller maps. Homes already set.
  if (map && map.center && map.center.length) {
    map.center.forEach(i => { const p = (E.sysPlanet && E.sysPlanet(i)) || st.planets[i]; if (p) p.perfect = true; });
  } else {
    const ranked = st.planets.filter(p => p.owner === 'neutral').map(p => {
      const s = st.systems[p.sys];
      return { p, d: Math.hypot(s.x - cx, s.y - cy) };
    }).sort((a, b) => a.d - b.d);
    const n = E.centerPerfectCount29(sizeKey, 0);
    for (let i = 0; i < n && i < ranked.length; i++) ranked[i].p.perfect = true;
  }
  return st;
};

const _newGame = E.newGame;
E.scrubGraze29 = function (st) {
  if (!st || !st.systems || !st.lanes) return st;
  const sys = st.systems;
  const designed = new Set();
  const map = E._map28 || {};
  (map.pockets || []).forEach(pk => (pk.designed || []).forEach(l => {
    designed.add(l[0] + ',' + l[1]); designed.add(l[1] + ',' + l[0]);
  }));
  const rebuild = lanes => {
    st.lanes = lanes;
    sys.forEach(s => { s.lanes = []; });
    lanes.forEach(([a, b]) => { if (sys[a] && sys[b]) { sys[a].lanes.push(b); sys[b].lanes.push(a); } });
  };
  const legal = (i, j) => {
    if (i === j || !sys[i] || !sys[j]) return false;
    if (sys[i].rift || sys[j].rift) return false;
    const pockets = map.pockets || [];
    const clusterOf = {};
    pockets.forEach((pk, ci) => (pk.cl || []).forEach(id => { clusterOf[id] = ci; }));
    const inCenter = new Set(map.center || []);
    const chokes = map.centerChokes || [];
    const pk = x => clusterOf[x] != null;
    if (pk(i) && pk(j) && clusterOf[i] !== clusterOf[j]) return false;
    if (pk(i) && pk(j)) return designed.has(i + ',' + j);
    if (pk(i) && !pk(j)) return (pockets[clusterOf[i]].exits || []).indexOf(i) >= 0;
    if (pk(j) && !pk(i)) return (pockets[clusterOf[j]].exits || []).indexOf(j) >= 0;
    if (inCenter.has(i) && !inCenter.has(j)) return chokes.indexOf(i) >= 0;
    if (inCenter.has(j) && !inCenter.has(i)) return chokes.indexOf(j) >= 0;
    return true;
  };
  const crosses = (a, b, lanes) => {
    const A = sys[a], B = sys[b];
    for (const l of lanes) {
      if (l[0] === a || l[0] === b || l[1] === a || l[1] === b) continue;
      const C = sys[l[0]], D = sys[l[1]];
      if (E.segCross(A, B, C, D)) return true;
    }
    return false;
  };
  for (let pass = 0; pass < 8; pass++) {
    const lanes = st.lanes.slice();
    const next = [];
    let dropped = 0;
    for (const l of lanes) {
      if (sys[l[0]] && sys[l[1]] && (sys[l[0]].rift || sys[l[1]].rift)) { next.push(l); continue; }
      if (!designed.has(l[0] + ',' + l[1]) && E.laneGrazes(sys, l[0], l[1]) >= 0) { dropped++; continue; }
      next.push(l);
    }
    rebuild(next);
    if (!dropped) break;
    if (E.mapConnected(sys.length, next)) continue;
    const par = sys.map((_, i) => i);
    const find = x => par[x] === x ? x : (par[x] = find(par[x]));
    const uni = (a, b) => { par[find(a)] = find(b); };
    next.forEach(([a, b]) => uni(a, b));
    for (let g = 0; g < sys.length + 8; g++) {
      const r0 = find(0);
      let hole = -1;
      for (let i = 1; i < sys.length; i++) if (find(i) !== r0) { hole = i; break; }
      if (hole < 0) break;
      let best = null, bd = Infinity;
      for (let a = 0; a < sys.length; a++) if (find(a) === r0) for (let b = 0; b < sys.length; b++) if (find(b) === find(hole) && legal(a, b)) {
        if (crosses(a, b, st.lanes) || E.laneGrazes(sys, a, b) >= 0) continue;
        const d = E.dist(sys[a], sys[b]);
        if (d < bd) { bd = d; best = [a, b]; }
      }
      if (!best) break;
      st.lanes.push(best);
      sys[best[0]].lanes.push(best[1]); sys[best[1]].lanes.push(best[0]);
      uni(best[0], best[1]);
    }
  }
  return st;
};

E.newGame = function () {
  const st = _newGame.apply(this, arguments);
  if (!st) return st;
  E.applyPerfect29(st);
  E.scrubGraze29(st);
  return st;
};

// ---------- item 9: 4–5 Hz off-screen fleet / economy, battles & on-screen fleets full rate ----------
E.fleetOnScreen29 = function (f) {
  const Rd = E.render, st = E.state;
  if (!f || !Rd || !Rd.cam || !st || !st.systems) return true;
  if (E.battleAt && (E.battleAt(f.sys) || (f.path && f.path[0] != null && E.battleAt(f.path[0])))) return true;
  const cam = Rd.cam, z = cam.z;
  const w = (typeof innerWidth !== 'undefined' ? innerWidth : 400);
  const h = (typeof innerHeight !== 'undefined' ? innerHeight : 800);
  const ox = w / 2 - cam.x * z, oy = h / 2 - cam.y * z, M = 200;
  const vis = sys => {
    const s = st.systems[sys]; if (!s) return false;
    const x = s.x * z + ox, y = s.y * z + oy;
    return x > -M && y > -M && x < w + M && y < h + M;
  };
  if (vis(f.sys)) return true;
  if (f.path && f.path[0] != null && vis(f.path[0])) return true;
  return false;
};

E._stepOrig = function (dt) {
  const s = E.step29;
  E.step29 = null;
  try { return E.step(dt); } finally { E.step29 = s; }
};

E.step29 = function (dt) {
  const P = E._simParts;
  const st = E.state;
  if (!st || (st.over && !st.continued)) return;
  const Rd = E.render;
  const useSlow = !st._ff && Rd && Rd.cam && st.world && P;
  if (!useSlow) return E._stepOrig(dt);

  st.t += dt;
  st._slow29 = (st._slow29 || 0) + dt;
  const iv = 1 / (E.LOGIC_HZ || 5);
  const runSlow = st._slow29 >= iv;
  const slowDt = runSlow ? st._slow29 : 0;
  if (runSlow) st._slow29 = 0;

  if (runSlow) {
    P.economy(slowDt);
    P.queues(slowDt);
    P.trade(slowDt);
    P.sieges(slowDt);
  }

  E._skipFleet = f => !E.fleetOnScreen29(f);
  P.moveFleets(dt);
  if (runSlow) {
    E._skipFleet = f => E.fleetOnScreen29(f);
    P.moveFleets(slowDt);
  }
  E._skipFleet = null;

  st._al = (st._al || 0) + dt;
  if (st._al >= 0.5) { P.scoutTick(); P.alertsTick(st._al); P.settleOrders(); st._al = 0; }
  st._bd = (st._bd || 0) + dt;
  if (st._bd >= 0.5) { P.detectBattles(); st._bd = 0; }
  let left = dt; const sub = st._ff ? 0.2 : 0.1;
  while (left > 1e-6) { const d = Math.min(sub, left); P.stepBattles(d); left -= d; }
  P.windowsTick(dt);
  st._ai = (st._ai || 0) + dt;
  if (st._ai >= 2) { P.aiTick(st._ai); st._ai = 0; }
  P.waves();
  if (E.crisisTick27) E.crisisTick27(); else P.crisis();
  if (E.v14Tick) E.v14Tick(dt);
  if (E.v15Tick) E.v15Tick(dt);
  P.checkEnd();
};

// ---------- migrate v2.8 slots first, then older ----------
E.migratePrevSlots = function () {
  const groups = [
    { flag: 'migratedFromV28', keys: ['goe_save_v28', 'goe_save_v28_s2', 'goe_save_v28_s3'] },
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
  const get = k => (E.kvGet ? E.kvGet(k) : null) || (function () { try { return localStorage.getItem(k); } catch (e) { return null; } })();
  try {
    for (let i = 0; i < 3; i++) {
      if (get(E.SLOT_KEYS[i])) continue;
      for (const g of groups) {
        const src = g.keys[i]; if (!src) continue;
        const raw = get(src); if (!raw) continue;
        const st = (E.parseSave || JSON.parse)(raw);
        const prev = E.state, prevSlot = E.slot;
        E.state = st;
        let m = null; try { m = JSON.parse(get(src + '_meta') || 'null'); } catch (e) {}
        const ok = E.save({ slot: i + 1, name: (m && m.name) || null });
        E.state = prev; E.slot = prevSlot;
        if (ok) E[g.flag] = true;
        break;
      }
    }
  } catch (e) { console.warn('prev slot migrate failed', e); }
};

// ---------- UI / gfx install (items 1, 4, 5, 6, 7, 8) ----------
E.installV29UI = function () {};

E.installV29Gfx = function () {
  const Rd = E.render; if (!Rd || Rd._v29gfx) return; Rd._v29gfx = true;
  const hasDoc = typeof document !== 'undefined';

  // item 1: draw the starfield / nebula once and leave it still (no parallax, no drift, no cam slide)
  const sky = { c: null, key: '' };
  if (Rd.drawBackdrop) {
    const _db = Rd.drawBackdrop;
    Rd.drawBackdrop = function (ctx, w, h, cam, time) {
      if (!ctx || !ctx.canvas) return _db.call(Rd, ctx, w, h, cam, time);
      const qn = E.effQuality ? E.effQuality() : 'high';
      const W = ctx.canvas.width, H = ctx.canvas.height;
      const key = W + 'x' + H + '|' + qn;
      if (!sky.c || sky.key !== key) {
        sky.c = (typeof document !== 'undefined' && document.createElement) ? document.createElement('canvas') : ctx.canvas.constructor ? new ctx.canvas.constructor() : null;
        if (!sky.c) return _db.call(Rd, ctx, w, h, { x: 0, y: 0, z: 1 }, 0);
        sky.c.width = Math.max(1, W); sky.c.height = Math.max(1, H);
        const g = sky.c.getContext('2d');
        try { const tr = ctx.getTransform && ctx.getTransform(); if (tr && g.setTransform) g.setTransform(tr.a, tr.b, tr.c, tr.d, tr.e, tr.f); } catch (e) {}
        _db.call(Rd, g, w, h, { x: 0, y: 0, z: 1 }, 0);
        sky.key = key;
        Rd.gstats = Rd.gstats || {};
        Rd.gstats.bgStillBuilds = (Rd.gstats.bgStillBuilds || 0) + 1;
      }
      ctx.save();
      if (ctx.setTransform) ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(sky.c, 0, 0);
      ctx.restore();
      Rd._bgStill = true;
    };
  }
  if (Rd.drawBase) {
    Rd.drawBase = function (ctx, w, h, cam, time) {
      if (Rd.drawBackdrop) Rd.drawBackdrop(ctx, w, h, cam, time);
      const z = cam.z, ox = w / 2 - cam.x * z, oy = h / 2 - cam.y * z;
      if (Rd.updateTerritory) Rd.updateTerritory(time);
      if (Rd.drawTerritory) Rd.drawTerritory(ctx, ox, oy, z, time);
    };
  }

  // item 8: bake lanes into an offscreen image; slide it on pan; rebuild on zoom / owner / lane change
  Rd.drawLanes29 = function (ctx, w, h, z, ox, oy, lod) {
    const st = E.state; if (!st || !hasDoc) return false;
    const LC = Rd._laneC = Rd._laneC || { c: null, key: '', ox: 0, oy: 0, dx: 0, dy: 0 };
    let own = '';
    for (const p of st.planets) own += (p.owner || 'n')[0];
    const qn = E.effQuality ? E.effQuality() : '';
    const sig = st.lanes.length + '|' + z.toFixed(4) + '|' + Math.round(w) + 'x' + Math.round(h) + '|' + lod + '|' + qn + '|' + own;
    const pad = 1.8;
    const need = !LC.c || LC.key !== sig || Math.abs(ox - LC.ox) > w * 0.32 || Math.abs(oy - LC.oy) > h * 0.32;
    if (need) {
      const cw = Math.max(1, Math.ceil(w * pad)), ch = Math.max(1, Math.ceil(h * pad));
      if (!LC.c || LC.c.width !== cw || LC.c.height !== ch) {
        LC.c = document.createElement('canvas'); LC.c.width = cw; LC.c.height = ch;
      }
      const g = LC.c.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cw, ch);
      const dx = (cw - w) / 2, dy = (ch - h) / 2;
      const bx = ox + dx, by = oy + dy;
      const xmin = -40, ymin = -40, xmax = cw + 40, ymax = ch + 40;
      g.lineWidth = Math.max(1, 1.6 * z);
      g.strokeStyle = 'rgba(140,170,220,' + (lod === 2 ? 0.22 : 0.28) + ')';
      g.beginPath();
      const rift = [];
      for (const L of st.lanes) {
        const A = st.systems[L[0]], B = st.systems[L[1]]; if (!A || !B) continue;
        const x1 = A.x * z + bx, y1 = A.y * z + by, x2 = B.x * z + bx, y2 = B.y * z + by;
        if ((x1 < xmin && x2 < xmin) || (y1 < ymin && y2 < ymin) || (x1 > xmax && x2 > xmax) || (y1 > ymax && y2 > ymax)) continue;
        if (A.rift || B.rift) { rift.push(x1, y1, x2, y2); continue; }
        g.moveTo(x1, y1); g.lineTo(x2, y2);
      }
      if (E.Q && E.Q().glow && lod < 2) {
        g.save(); g.strokeStyle = 'rgba(90,150,255,0.10)'; g.lineWidth = Math.max(4, 7 * z); g.stroke();
        g.strokeStyle = 'rgba(120,180,255,0.16)'; g.lineWidth = Math.max(2, 3.2 * z); g.stroke(); g.restore();
      }
      g.stroke();
      if (rift.length) {
        g.strokeStyle = 'rgba(125,255,107,0.35)'; g.beginPath();
        for (let i = 0; i < rift.length; i += 4) { g.moveTo(rift[i], rift[i + 1]); g.lineTo(rift[i + 2], rift[i + 3]); }
        g.stroke();
      }
      LC.key = sig; LC.ox = ox; LC.oy = oy; LC.dx = dx; LC.dy = dy;
      Rd.gstats = Rd.gstats || {}; Rd.gstats.laneBake = (Rd.gstats.laneBake || 0) + 1;
    }
    ctx.drawImage(LC.c, ox - LC.ox - LC.dx, oy - LC.oy - LC.dy);
    Rd.gstats = Rd.gstats || {}; Rd.gstats.laneBlit = (Rd.gstats.laneBlit || 0) + 1;
    return true;
  };
};

E.installV29UIBind = function (U, ACT, RENDER, factionBadge, esc, btn) {
  if (U && U._v29bind) return;
  if (U) U._v29bind = true;
  E.installV29Gfx();

  // item 6: strip the "Wave X in x:yy:zz" status on the 3rd top-bar line (rift bar stays)
  if (U && U.updateTop) {
    const _up = U.updateTop;
    U.updateTop = function () {
      _up.apply(this, arguments);
      try {
        const el = document.getElementById('status');
        if (el) el.textContent = '';
      } catch (e) {}
    };
  }

  // item 4: pop-up shows only the soonest incoming attack (pre-v2.7). Remove the v2.7 full list under the topbar.
  E.updateStrip27 = null;
  try {
    const strip = document.getElementById('alertStrip');
    if (strip && strip.tagName !== 'BUTTON') {
      const b = document.createElement('button');
      b.id = 'alertStrip';
      b.className = 'alertrow hidden';
      b.setAttribute('data-a', 'openAlert');
      strip.parentNode.replaceChild(b, strip);
    } else if (strip) {
      strip.setAttribute('data-a', 'openAlert');
      strip.classList.remove('alertstack');
    }
  } catch (e) {}

  // item 4: Alerts tab lists every incoming attack, soonest first; tap already jumps
  if (RENDER && RENDER.incoming) {
    const _inc = RENDER.incoming;
    RENDER.incoming = function () {
      const r = _inc.apply(this, arguments);
      try {
        const st = E.state; if (!r || !r.html || !st) return r;
        const inc = (E.incoming() || []).filter(a => a.kind === 'attack');
        // already soonest-first from E.incoming(); rebuild the attack cards in that order if needed
        const targets = [];
        const seen = new Set();
        (st.windows || []).filter(w => !w.closed).slice().sort((a, b) => a.end - b.end).forEach(w => { if (!seen.has(w.sys)) { seen.add(w.sys); targets.push(w.sys); } });
        inc.forEach(a => { if (!seen.has(a.target)) { seen.add(a.target); targets.push(a.target); } });
        r._incomingOrdered = inc;
        r._targetsSoonest = targets;
      } catch (e) {}
      return r;
    };
  }

  // item 5: do not auto-open the first (#result) window; keep the bcard (Battle animation simulation)
  if (U && U.showResult) {
    const _show = U.showResult;
    U.showResult = function (r, opts) {
      if (opts && opts.manual) return _show.call(this, r);
      // auto path from windowResult: swallow the first window
      return;
    };
    if (ACT) ACT.showResult = d => { const r = E.state && E.state.results[+d.i]; if (r) U.showResult(r, { manual: true }); };
  }

  // item 5: fully opaque battle card (no glass / backdrop blur)
  try {
    if (!document.getElementById('v29style')) {
      const s = document.createElement('style');
      s.id = 'v29style';
      s.textContent = [
        '.bcard{background:#0a1026 !important;-webkit-backdrop-filter:none !important;backdrop-filter:none !important;}',
        '.bcard.in{opacity:1 !important;}',
        '#alertStrip.alertrow{position:fixed;left:0;right:0;top:var(--tbh,84px);z-index:21;width:auto;margin:0;padding:6px calc(var(--sr) + 10px) 6px calc(var(--sl) + 10px);box-sizing:border-box;-webkit-backdrop-filter:none;backdrop-filter:none;}',
        '#alertStrip.alertrow.hidden{display:none;}',
        '#mapOverviewBtn{position:fixed;right:calc(var(--sr,0px) + 10px);bottom:calc(var(--bbh,56px) + var(--sb,0px) + 12px);z-index:18;width:40px;height:40px;border-radius:10px;border:1px solid rgba(130,190,255,0.45);background:#0c1630;color:#d6e8ff;font-size:18px;line-height:1;padding:0;box-shadow:0 4px 16px rgba(0,0,0,0.45);}',
        '#mapOverviewBtn.on{border-color:#38e1ff;color:#38e1ff;}',
        '#mapOverview{position:fixed;left:0;right:0;top:var(--tbh,84px);bottom:var(--bbh,56px);z-index:17;background:#050816;display:none;}',
        '#mapOverview.show{display:block;}',
        '#mapOverview canvas{width:100%;height:100%;display:block;}'
      ].join('\n');
      document.head.appendChild(s);
    }
  } catch (e) {}

  // item 7: small map button toggles a cheap whole-map overview
  try {
    if (!document.getElementById('mapOverviewBtn')) {
      const btnEl = document.createElement('button');
      btnEl.id = 'mapOverviewBtn';
      btnEl.type = 'button';
      btnEl.title = 'Whole-map overview';
      btnEl.setAttribute('aria-label', 'Whole-map overview');
      btnEl.textContent = '🗺️';
      btnEl.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); E.toggleMapOverview(); });
      document.body.appendChild(btnEl);
      const ov = document.createElement('div');
      ov.id = 'mapOverview';
      const cv = document.createElement('canvas');
      cv.id = 'mapOverviewCv';
      ov.appendChild(cv);
      document.body.appendChild(ov);
      const jump = ev => {
        if (!E._overviewOn) return;
        const r = cv.getBoundingClientRect();
        const t = ev.touches ? ev.touches[0] || ev.changedTouches[0] : ev;
        const x = (t.clientX - r.left) / r.width;
        const y = (t.clientY - r.top) / r.height;
        E.overviewJumpFrac(x, y);
      };
      cv.addEventListener('click', jump);
      cv.addEventListener('touchend', ev => { ev.preventDefault(); jump(ev); }, { passive: false });
    }
  } catch (e) {}
};

E._overviewOn = false;
E.toggleMapOverview = function (on) {
  const Rd = E.render;
  if (on == null) on = !E._overviewOn;
  const ov = typeof document !== 'undefined' ? document.getElementById('mapOverview') : null;
  const btn = typeof document !== 'undefined' ? document.getElementById('mapOverviewBtn') : null;
  if (on) {
    E._overviewOn = true;
    if (Rd && Rd.cam) E._overviewCam = { x: Rd.cam.x, y: Rd.cam.y, z: Rd.cam.z };
    if (ov) ov.classList.add('show');
    if (btn) btn.classList.add('on');
    E.drawMapOverview();
    if (typeof requestAnimationFrame !== 'undefined') {
      const loop = () => { if (!E._overviewOn) return; E.drawMapOverview(true); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
  } else {
    E._overviewOn = false;
    if (ov) ov.classList.remove('show');
    if (btn) btn.classList.remove('on');
    if (E._overviewCam && Rd && Rd.cam) {
      Rd.cam.x = E._overviewCam.x; Rd.cam.y = E._overviewCam.y; Rd.cam.z = E._overviewCam.z;
      if (Rd.clearCamTarget) Rd.clearCamTarget();
    }
  }
  return E._overviewOn;
};

E.overviewJumpFrac = function (fx, fy) {
  const st = E.state, Rd = E.render;
  if (!st || !st.world || !Rd) { E.toggleMapOverview(false); return; }
  const W = st.world.w, H = st.world.h;
  const pad = 40, vw = W + pad * 2, vh = H + pad * 2;
  const wx = fx * vw - pad, wy = fy * vh - pad;
  const z = E._overviewCam ? E._overviewCam.z : Rd.cam.z;
  Rd.cam.x = wx; Rd.cam.y = wy; Rd.cam.z = z;
  if (Rd.clearCamTarget) Rd.clearCamTarget();
  E._overviewCam = null; // stay at the jump; just close the overlay
  const ov = document.getElementById('mapOverview');
  const btn = document.getElementById('mapOverviewBtn');
  E._overviewOn = false;
  if (ov) ov.classList.remove('show');
  if (btn) btn.classList.remove('on');
};

E.drawMapOverview = function (liveOnly) {
  const st = E.state; if (!st || !st.world) return;
  const cv = typeof document !== 'undefined' ? document.getElementById('mapOverviewCv') : null;
  if (!cv) return;
  const ov = document.getElementById('mapOverview');
  if (!ov) return;
  const wr = ov.getBoundingClientRect();
  const dpr = Math.min(2, (typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1));
  const w = Math.max(1, Math.round(wr.width * dpr)), h = Math.max(1, Math.round(wr.height * dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; E._ovBake = null; }
  const g = cv.getContext('2d');
  const W = st.world.w, H = st.world.h, pad = 40;
  const sx = w / (W + pad * 2), sy = h / (H + pad * 2);
  const to = (x, y) => [(x + pad) * sx, (y + pad) * sy];
  const bakeNeeded = !liveOnly || !E._ovBake || E._ovBake.own !== st.planets.map(p => p.owner || 'n').join() || E._ovBake.n !== st.lanes.length;
  if (bakeNeeded) {
    if (!E._ovBake || E._ovBake.c.width !== w || E._ovBake.c.height !== h) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      E._ovBake = { c, own: '', n: 0 };
    }
    const b = E._ovBake.c.getContext('2d');
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.fillStyle = '#050816'; b.fillRect(0, 0, w, h);
    b.strokeStyle = 'rgba(140,170,220,0.35)'; b.lineWidth = 1; b.beginPath();
    for (const L of st.lanes) {
      const A = st.systems[L[0]], B = st.systems[L[1]]; if (!A || !B) continue;
      const p1 = to(A.x, A.y), p2 = to(B.x, B.y);
      b.moveTo(p1[0], p1[1]); b.lineTo(p2[0], p2[1]);
    }
    b.stroke();
    for (const s of st.systems) {
      const p = E.sysPlanet ? E.sysPlanet(s.id) : st.planets[s.id];
      const xy = to(s.x, s.y);
      if (s.rift) { b.fillStyle = '#7dff6b'; b.beginPath(); b.arc(xy[0], xy[1], 4, 0, 7); b.fill(); continue; }
      const o = p && p.owner && p.owner !== 'neutral' ? p.owner : null;
      b.fillStyle = o && E.FACTIONS[o] ? E.FACTIONS[o].color : '#8aa0c8';
      const r = o === 'player' ? 3.2 : 2.2;
      b.beginPath(); b.arc(xy[0], xy[1], r, 0, 7); b.fill();
    }
    E._ovBake.own = st.planets.map(p => p.owner || 'n').join();
    E._ovBake.n = st.lanes.length;
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(E._ovBake.c, 0, 0);
  // live: fleets + view rectangle + rift already baked
  for (const f of st.fleets) {
    if (!f.ships || !f.ships.length) continue;
    const s = st.systems[f.sys]; if (!s) continue;
    let x = s.x, y = s.y;
    if (f.path && f.path.length && f.prog != null) {
      const n = st.systems[f.path[0]];
      if (n) { x = s.x + (n.x - s.x) * f.prog; y = s.y + (n.y - s.y) * f.prog; }
    }
    const xy = to(x, y);
    g.fillStyle = (E.FACTIONS[f.owner] && E.FACTIONS[f.owner].color) || '#fff';
    g.fillRect(xy[0] - 1.5, xy[1] - 1.5, 3, 3);
  }
  const Rd = E.render;
  if (Rd && Rd.cam) {
    const vw = (typeof innerWidth !== 'undefined' ? innerWidth : wr.width);
    const vh = (typeof innerHeight !== 'undefined' ? innerHeight : wr.height);
    const z = Rd.cam.z || 1;
    const rw = vw / z, rh = vh / z;
    const p1 = to(Rd.cam.x - rw / 2, Rd.cam.y - rh / 2);
    const p2 = to(Rd.cam.x + rw / 2, Rd.cam.y + rh / 2);
    g.strokeStyle = 'rgba(255,232,140,0.9)'; g.lineWidth = 1.5;
    g.strokeRect(p1[0], p1[1], p2[0] - p1[0], p2[1] - p1[1]);
  }
};

})();
