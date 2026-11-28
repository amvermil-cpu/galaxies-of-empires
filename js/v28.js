// Galaxies of Empires v2.8 — designed home start for every empire, short non-crossing lanes.
'use strict';
(function () {
const E = window.EOG;

E.migrate28 = function (st) {
  if (!st) return st;
  st.ver = '2.8';
  return st;
};

const _newGame = E.newGame;
E.newGame = function () {
  const st = _newGame.apply(this, arguments);
  if (!st || !st.planets || !st.emp) return st;
  const mark = id => { const p = st.planets[id]; if (p) p.perfect = true; };
  if (st.emp.player && st.emp.player.home != null) mark(st.emp.player.home);
  for (const f of (st.rivals || []).concat(st.allies || [])) {
    if (st.emp[f] && st.emp[f].home != null) mark(st.emp[f].home);
  }
  return st;
};

E.installV28UI = function () {};
E.installV28UIBind = function () {};

// A lane may be at most this many times the nearer endpoint's other-neighbour distance.
E.LANE_LEN_MUL = 3.2;

E.segCross = E.segCross || function (a, b, c, d) {
  const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  if (a === c || a === d || b === c || b === d) return false;
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
};

E.laneCrossings = function (systems, lanes) {
  const hits = [];
  for (let i = 0; i < lanes.length; i++) {
    const A = systems[lanes[i][0]], B = systems[lanes[i][1]];
    for (let j = i + 1; j < lanes.length; j++) {
      const C = systems[lanes[j][0]], D = systems[lanes[j][1]];
      if (E.segCross(A, B, C, D)) hits.push([lanes[i], lanes[j]]);
    }
  }
  return hits;
};

E.nnOther = function (systems, i, except) {
  let bd = Infinity;
  const a = systems[i];
  for (let j = 0; j < systems.length; j++) {
    if (j === i || j === except) continue;
    const s = systems[j];
    if (s.rift) continue;
    const d = E.dist(a, s);
    if (d < bd) bd = d;
  }
  return bd;
};

E.laneLengthViolations = function (systems, lanes, mul) {
  mul = mul || E.LANE_LEN_MUL;
  const bad = [];
  const n = systems.length;
  // only score planet-planet lanes (the Rift is allowed its two short centre links)
  for (const [a, b] of lanes) {
    if (!systems[a] || !systems[b]) continue;
    if (systems[a].rift || systems[b].rift) continue;
    const d = E.dist(systems[a], systems[b]);
    const cap = mul * Math.min(E.nnOther(systems, a, b), E.nnOther(systems, b, a));
    if (d > cap + 1e-6) bad.push({ a, b, d, cap });
  }
  return bad;
};

E.mapConnected = function (n, lanes, skip) {
  const par = Array.from({ length: n }, (_, i) => i);
  const find = x => par[x] === x ? x : (par[x] = find(par[x]));
  for (const [a, b] of lanes) {
    if (skip && (skip(a) || skip(b))) continue;
    if (a >= 0 && b >= 0 && a < n && b < n) par[find(a)] = find(b);
  }
  let root = -1;
  for (let i = 0; i < n; i++) {
    if (skip && skip(i)) continue;
    if (root < 0) root = find(i);
    else if (find(i) !== root) return false;
  }
  return true;
};

// Mid two (adjacent) planets of a 3–5 row, used for the choke triangle.
E.midPair28 = function (n) {
  const a = Math.max(0, Math.floor(n / 2) - 1);
  return [a, a + 1];
};

E.buildMap28 = function (opts) {
  let N = opts.N, W = opts.W, H = opts.H;
  const r = opts.r || Math.random, nRivals = opts.nRivals | 0, nAllies = opts.nAllies | 0, sizeKey = opts.sizeKey || 'small';
  const nE = 1 + nRivals + nAllies;
  const C = { x: W / 2, y: H / 2 };
  const big = sizeKey === 'massive' || sizeKey === 'galactic';
  const centerN = big ? Math.min(20, Math.max(10, Math.round(12 + r() * 8))) : 0;

  const rows = [];
  for (let e = 0; e < nE; e++) rows.push({ low: 3 + (r() * 3 | 0), up: 3 + (r() * 3 | 0) });
  const clSize = e => 7 + rows[e].low + rows[e].up; // home+3 back+choke+rows+top pair
  const need = centerN + Math.max(8, 4 + nE * 2) + rows.reduce((s, _, e) => s + clSize(e), 0);
  if (N < need) {
    N = need;
    const k = Math.sqrt(N / 20 * 1.15);
    W = Math.round(1600 * k); H = Math.round(1050 * k);
    C.x = W / 2; C.y = H / 2;
  }

  const inset = 100;
  const X0 = inset, Y0 = inset, X1 = W - inset, Y1 = H - inset;
  let spots = [{ x: X0, y: Y0 }, { x: X1, y: Y1 }, { x: X1, y: Y0 }, { x: X0, y: Y1 },
    { x: (X0 + X1) / 2, y: Y0 }, { x: (X0 + X1) / 2, y: Y1 }, { x: X0, y: (Y0 + Y1) / 2 }, { x: X1, y: (Y0 + Y1) / 2 }];
  if (nE > spots.length) {
    spots = []; const P = 2 * (X1 - X0) + 2 * (Y1 - Y0);
    for (let i = 0; i < nE; i++) {
      let d = P * i / nE;
      if (d < X1 - X0) { spots.push({ x: X0 + d, y: Y0 }); continue; } d -= X1 - X0;
      if (d < Y1 - Y0) { spots.push({ x: X1, y: Y0 + d }); continue; } d -= Y1 - Y0;
      if (d < X1 - X0) { spots.push({ x: X1 - d, y: Y1 }); continue; } d -= X1 - X0;
      spots.push({ x: X0, y: Y1 - d });
    }
  }
  const anchors = [spots[0]]; let free = spots.slice(1);
  for (let q = 0; q < nRivals; q++) {
    let bi = 0, bd = -1;
    free.forEach((sp, i) => { const d = Math.min(...anchors.map(a => E.dist(sp, a))); if (d > bd) { bd = d; bi = i; } });
    anchors.push(free[bi]); free.splice(bi, 1);
  }
  for (let q = 0; q < nAllies; q++) {
    let bi = 0, bd = Infinity;
    free.forEach((sp, i) => { const d = E.dist(sp, anchors[0]); if (d < bd) { bd = d; bi = i; } });
    anchors.push(free[bi]); free.splice(bi, 1);
  }

  const pts = [];
  const addPt = (x, y) => {
    x = Math.max(50, Math.min(W - 50, x));
    y = Math.max(50, Math.min(H - 50, y));
    const i = pts.length;
    pts.push({ x, y });
    return i;
  };
  const loc = (o, f, s, lx, ly) => ({ x: o.x + s.x * lx + f.x * ly, y: o.y + s.y * lx + f.y * ly });

  // Scale: fit a 5-wide, ~7.7-deep cluster (ring + clear choke step + grid + top pair).
  const dist0 = Math.min(W, H) * 0.5 - inset;
  let S = Math.min(200, Math.max(110, dist0 / 8.5));
  if (nE >= 7) S = Math.min(S, 170);
  if (nE >= 9) S = Math.min(S, 155);

  const reserved = []; // {x,y,r} keep-out for open sampling
  const pockets = [];
  const clusterOf = {};
  const clusters = [];

  function placeCluster(anchor, e) {
    const nL = rows[e].low, nU = rows[e].up;
    let fx = C.x - anchor.x, fy = C.y - anchor.y;
    let fl = Math.hypot(fx, fy) || 1;
    const f = { x: fx / fl, y: fy / fl };
    const s = { x: -f.y, y: f.x };
    // Home sits inward so the back ring stays on the map.
    const origin = { x: anchor.x + f.x * (2.15 * S), y: anchor.y + f.y * (2.15 * S) };
    // Tiny side-jitter only on rows so they stay in a straight line; everything
    // else gets a very small nudge so the ring / choke / top pair stay readable.
    const jit = () => (r() - 0.5) * 0.025 * S;
    const put = (lx, ly, row) => {
      const p = loc(origin, f, s, lx + jit(), ly + (row ? 0 : jit()));
      return addPt(p.x, p.y);
    };
    const back = put(0, -2.05 * S);
    const backL = put(-1.08 * S, -1.05 * S);
    const backR = put(1.08 * S, -1.05 * S);
    const home = put(0, 0);
    // Choke is a clear step in front of home (not tucked into the lower row).
    const choke = put(0, 1.60 * S);
    const lower = [];
    for (let i = 0; i < nL; i++) lower.push(put((i - (nL - 1) / 2) * 1.2 * S, 3.20 * S, true));
    const upper = [];
    for (let i = 0; i < nU; i++) upper.push(put((i - (nU - 1) / 2) * 1.2 * S, 4.40 * S, true));
    const topL = put(-0.95 * S, 5.55 * S);
    const topR = put(0.95 * S, 5.55 * S);
    const mid = E.midPair28(nL);
    const side = r() < 0.8 ? (r() < 0.5 ? lower[0] : lower[nL - 1]) : null;

    // Verticals: link planets that line up (boxes in the grid).
    // Verticals: link planets that line up so the two rows form boxes.
    // Each planet in the shorter row joins its nearest partner in the longer row
    // (uneven 5-vs-4 rows don't share exact x, but they still make a grid).
    const verts = [];
    const usedL = new Set(), usedU = new Set();
    const pairRow = (from, to, usedTo) => {
      from.forEach(a => {
        let best = -1, bd = Infinity;
        to.forEach(b => {
          const pa = pts[a], pb = pts[b];
          const along = Math.abs((pb.x - pa.x) * s.x + (pb.y - pa.y) * s.y);
          if (along < bd) { bd = along; best = b; }
        });
        if (best >= 0) { verts.push([a, best]); usedTo.add(best); }
      });
    };
    if (nU <= nL) pairRow(upper, lower, usedL);
    else pairRow(lower, upper, usedU);

    const leftU = nU === 3 ? [0, 1] : nU === 4 ? [0, 1] : [0, 1];
    const rightU = nU === 3 ? [1, 2] : nU === 4 ? [2, 3] : [3, 4];

    const designed = [];
    const L = (a, b) => { if (a !== b) designed.push([a, b]); };
    L(home, backL); L(home, backR); L(backL, back); L(backR, back);
    L(home, choke);
    L(choke, lower[mid[0]]); L(choke, lower[mid[1]]);
    for (let i = 0; i < nL - 1; i++) L(lower[i], lower[i + 1]);
    for (let i = 0; i < nU - 1; i++) L(upper[i], upper[i + 1]);
    verts.forEach(v => L(v[0], v[1]));
    leftU.forEach(i => L(topL, upper[i]));
    rightU.forEach(i => L(topR, upper[i]));

    const cl = [home, back, backL, backR, choke].concat(lower, upper, [topL, topR]);
    cl.forEach(i => { clusterOf[i] = e; });
    clusters.push(cl);

    // Keep-out around the pocket (plus a little apron in front of the top pair).
    const xs = cl.map(i => pts[i].x), ys = cl.map(i => pts[i].y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const rad = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * 0.62 + S * 0.7;
    reserved.push({ x: cx, y: cy, r: rad });

    pockets.push({
      home, back, backL, backR, choke, lower, upper, topL, topR, side,
      mid: [lower[mid[0]], lower[mid[1]]], verts, designed,
      cl, nL, nU, exits: [topL, topR].concat(side != null ? [side] : []),
      f, s, origin, S
    });
  }

  anchors.forEach((a, e) => placeCluster(a, e));

  // Massive / Galactic walled centre cluster (10–20 worlds, 4 chokes).
  const center = [];
  if (centerN) {
    const minC = 95;
    let guard = 0;
    while (center.length < centerN && guard++ < 40000) {
      const ang = r() * Math.PI * 2, rad = (0.15 + r() * 0.55) * Math.min(S * 3.2, Math.min(W, H) * 0.16);
      const p = { x: C.x + Math.cos(ang) * rad, y: C.y + Math.sin(ang) * rad };
      if (p.x < 80 || p.y < 80 || p.x > W - 80 || p.y > H - 80) continue;
      if (reserved.some(R => E.dist(p, R) < R.r + 40)) continue;
      if (center.some(i => E.dist(p, pts[i]) < minC)) continue;
      center.push(addPt(p.x, p.y));
    }
    // if still short, drop min distance
    while (center.length < Math.min(10, centerN) && guard++ < 60000) {
      const p = { x: C.x + (r() - 0.5) * S * 5, y: C.y + (r() - 0.5) * S * 5 };
      if (center.some(i => E.dist(p, pts[i]) < 70)) continue;
      if (pockets.some(pk => pk.cl.some(i => E.dist(p, pts[i]) < S))) continue;
      center.push(addPt(p.x, p.y));
    }
    if (center.length) {
      const cx = center.reduce((s, i) => s + pts[i].x, 0) / center.length;
      const cy = center.reduce((s, i) => s + pts[i].y, 0) / center.length;
      reserved.push({ x: cx, y: cy, r: 40 + Math.max(...center.map(i => E.dist(pts[i], { x: cx, y: cy }))) });
    }
  }
  const pickChoke = (score) => { let b = center[0], bd = -Infinity; for (const i of center) { const s = score(pts[i]); if (s > bd) { bd = s; b = i; } } return b; };
  let centerChokes = [];
  if (center.length) {
    const Nch = pickChoke(s => -s.y), Ech = pickChoke(s => s.x), Sch = pickChoke(s => s.y), Wch = pickChoke(s => -s.x);
    centerChokes = [...new Set([Nch, Ech, Sch, Wch])];
    if (centerChokes.length < 4) {
      const left = center.filter(i => centerChokes.indexOf(i) < 0);
      left.sort((i, j) => Math.atan2(pts[i].y - C.y, pts[i].x - C.x) - Math.atan2(pts[j].y - C.y, pts[j].x - C.x));
      for (const i of left) { if (centerChokes.length >= 4) break; centerChokes.push(i); }
    }
  }
  const inCenter = new Set(center);

  // Fill the open galaxy.
  const minD = 200;
  const cell = minD, gw = Math.ceil(W / cell), grid = new Map();
  const blocked = p => reserved.some(R => E.dist(p, R) < R.r);
  const near = p => {
    if (blocked(p)) return true;
    const cx = Math.floor(p.x / cell), cy = Math.floor(p.y / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const l = grid.get((cx + dx) + (cy + dy) * gw);
      if (l) for (const q of l) if (E.dist(p, q) <= minD) return true;
    }
    for (const q of pts) if (E.dist(p, q) <= minD * 0.72) return true;
    return false;
  };
  const addOpen = p => {
    const i = addPt(p.x, p.y);
    const key = Math.floor(pts[i].x / cell) + Math.floor(pts[i].y / cell) * gw;
    (grid.get(key) || grid.set(key, []).get(key)).push(pts[i]);
    return i;
  };
  pts.forEach((p, i) => {
    const key = Math.floor(p.x / cell) + Math.floor(p.y / cell) * gw;
    (grid.get(key) || grid.set(key, []).get(key)).push(p);
  });

  // Plant approach worlds just in front of each top pair so fan-out stays short.
  pockets.forEach(pk => {
    const { f, s, origin } = pk;
    for (const side of [-1.4, -0.4, 0.4, 1.4]) {
      const p = loc(origin, f, s, side * S, 6.60 * S);
      if (p.x < 70 || p.y < 70 || p.x > W - 70 || p.y > H - 70) continue;
      if (center.some(i => E.dist(p, pts[i]) < 80)) continue;
      if (pockets.some(q => q.cl.some(i => E.dist(p, pts[i]) < S * 0.9))) continue;
      if (pts.some(q => E.dist(p, q) < Math.max(90, S * 0.55))) continue;
      addOpen(p);
    }
  });

  let guard = 0;
  while (pts.length < N && guard++ < 80000) {
    const p = { x: 80 + r() * (W - 160), y: 80 + r() * (H - 160) };
    if (!near(p)) addOpen(p);
  }
  // last resort: slightly relax keep-out
  while (pts.length < N && guard++ < 120000) {
    const p = { x: 80 + r() * (W - 160), y: 80 + r() * (H - 160) };
    if (pockets.some(pk => pk.cl.some(i => E.dist(p, pts[i]) < S * 0.9))) continue;
    if (pts.some(q => E.dist(p, q) < 120)) continue;
    addOpen(p);
  }
  N = pts.length;

  const isPocket = i => clusterOf[i] != null;
  const isOpen = i => clusterOf[i] == null && !inCenter.has(i);
  const lanes = [];
  const has = (a, b) => lanes.some(l => (l[0] === a && l[1] === b) || (l[0] === b && l[1] === a));
  const crosses = (a, b) => {
    const A = pts[a], B = pts[b];
    for (const l of lanes) {
      const C = pts[l[0]], D = pts[l[1]];
      if (Math.max(A.x, B.x) < Math.min(C.x, D.x) || Math.min(A.x, B.x) > Math.max(C.x, D.x) ||
          Math.max(A.y, B.y) < Math.min(C.y, D.y) || Math.min(A.y, B.y) > Math.max(C.y, D.y)) continue;
      if (E.segCross(A, B, C, D)) return true;
    }
    return false;
  };
  const tooLong = (a, b, mul) => {
    mul = mul || E.LANE_LEN_MUL;
    const d = E.dist(pts[a], pts[b]);
    const cap = mul * Math.min(E.nnOther(pts, a, b), E.nnOther(pts, b, a));
    return d > cap + 1e-6;
  };
  const link = (a, b, opts) => {
    if (a == null || b == null || a < 0 || b < 0 || a === b || has(a, b)) return false;
    const force = opts && opts.force;
    if (!force && crosses(a, b)) return false;
    if (!force && tooLong(a, b, opts && opts.mul)) return false;
    lanes.push([a, b]);
    return true;
  };

  // 1. Designed pocket lanes (these are short by construction).
  pockets.forEach(pk => pk.designed.forEach(([a, b]) => link(a, b, { force: true })));

  // 2–3. Short non-crossing nearest-neighbour / MST on centre and on the open map (separately), then stitch legally.
  const connectSet = (ids, mul) => {
    if (ids.length < 2) return;
    const edges = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      edges.push([E.dist(pts[ids[i]], pts[ids[j]]), ids[i], ids[j]]);
    }
    edges.sort((a, b) => a[0] - b[0]);
    const par = {}; ids.forEach(i => { par[i] = i; });
    const find = x => par[x] === x ? x : (par[x] = find(par[x]));
    for (const [d, a, b] of edges) {
      if (find(a) === find(b)) continue;
      if (link(a, b, { mul: mul || E.LANE_LEN_MUL })) par[find(a)] = find(b);
    }
    // extra short neighbours, cap degree at 4
    const deg = {};
    lanes.forEach(([a, b]) => { deg[a] = (deg[a] || 0) + 1; deg[b] = (deg[b] || 0) + 1; });
    for (const [d, a, b] of edges) {
      if (has(a, b)) continue;
      if ((deg[a] || 0) >= 4 || (deg[b] || 0) >= 4) continue;
      if (link(a, b, { mul: mul || E.LANE_LEN_MUL })) { deg[a] = (deg[a] || 0) + 1; deg[b] = (deg[b] || 0) + 1; }
    }
  };
  if (center.length) connectSet(center, E.LANE_LEN_MUL);
  const openIds = [];
  for (let i = 0; i < N; i++) if (isOpen(i)) openIds.push(i);
  connectSet(openIds, E.LANE_LEN_MUL);

  // 4. Top-pair fan-out: several short lanes into the open galaxy (or onto a centre choke).
  const fanTargets = () => {
    const t = openIds.slice();
    centerChokes.forEach(i => t.push(i));
    return t;
  };
  pockets.forEach(pk => {
    const targets = fanTargets();
    for (const ex of [pk.topL, pk.topR]) {
      const cand = targets.map(i => [E.dist(pts[ex], pts[i]), i]).sort((a, b) => a[0] - b[0]);
      let n = 0;
      for (const [d, i] of cand) {
        if (n >= 3) break;
        if (link(ex, i, { mul: E.LANE_LEN_MUL + 0.4 })) n++;
      }
      // guarantee at least one exit
      if (n === 0) {
        for (const [d, i] of cand) { if (link(ex, i, { mul: 4, force: false })) { n++; break; } }
        if (n === 0 && cand[0]) link(ex, cand[0][1], { force: true });
      }
    }
    // optional side exit from one lower-row end
    if (pk.side != null) {
      const cand = fanTargets().map(i => [E.dist(pts[pk.side], pts[i]), i]).sort((a, b) => a[0] - b[0]);
      let ok = false;
      for (const [d, i] of cand) { if (link(pk.side, i, { mul: E.LANE_LEN_MUL + 0.4 })) { ok = true; break; } }
      if (!ok) pk.side = null;
      if (!pk.side) pk.exits = [pk.topL, pk.topR];
    }
  });

  // 5. Centre chokes out into the open map (one each).
  centerChokes.forEach(ch => {
    const cand = openIds.map(i => [E.dist(pts[ch], pts[i]), i]).sort((a, b) => a[0] - b[0]);
    let n = 0;
    for (const [d, i] of cand) {
      if (n >= 2) break;
      if (link(ch, i, { mul: E.LANE_LEN_MUL + 0.3 })) n++;
    }
    if (n === 0 && cand[0]) link(ch, cand[0][1], { force: true });
  });

  // 6. Stitch remaining islands through legal short joins (never punch a hole in a pocket).
  const par = Array.from({ length: N }, (_, i) => i);
  const find = x => par[x] === x ? x : (par[x] = find(par[x]));
  const uni = (a, b) => { par[find(a)] = find(b); };
  lanes.forEach(([a, b]) => uni(a, b));
  const legalJoin = (i, j) => {
    const pk = x => isPocket(x), ct = x => inCenter.has(x);
    if (pk(i) && pk(j) && clusterOf[i] !== clusterOf[j]) return false;
    if ((pk(i) && ct(j)) || (pk(j) && ct(i))) {
      // only a pocket exit onto a centre choke
      const p = pk(i) ? i : j, c = pk(i) ? j : i;
      return centerChokes.indexOf(c) >= 0 && (pockets[clusterOf[p]].exits || []).indexOf(p) >= 0;
    }
    if (pk(i) && !pk(j)) return (pockets[clusterOf[i]].exits || []).indexOf(i) >= 0;
    if (pk(j) && !pk(i)) return (pockets[clusterOf[j]].exits || []).indexOf(j) >= 0;
    if (ct(i) && !ct(j)) return centerChokes.indexOf(i) >= 0;
    if (ct(j) && !ct(i)) return centerChokes.indexOf(j) >= 0;
    return true;
  };
  const stitch = (mul, force) => {
    for (let g = 0; g < N + 8; g++) {
      const r0 = find(0);
      let hole = -1;
      for (let i = 1; i < N; i++) if (find(i) !== r0) { hole = i; break; }
      if (hole < 0) return true;
      let best = null, bd = Infinity;
      for (let a = 0; a < N; a++) if (find(a) === r0) for (let b = 0; b < N; b++) if (find(b) === find(hole) && legalJoin(a, b)) {
        if (!force && crosses(a, b)) continue;
        if (!force && tooLong(a, b, mul)) continue;
        const d = E.dist(pts[a], pts[b]);
        if (d < bd) { bd = d; best = [a, b]; }
      }
      if (!best) return false;
      if (link(best[0], best[1], { force: force, mul: mul })) uni(best[0], best[1]);
      else return false;
    }
    return false;
  };
  if (!stitch(E.LANE_LEN_MUL, false)) {
    if (!stitch(3.4, false)) stitch(6, true);
  }

  // Drop accidental crossings (never drop a designed pocket lane). Re-stitch without crossings.
  const isDesigned = (a, b) => pockets.some(pk => pk.designed.some(l => (l[0] === a && l[1] === b) || (l[0] === b && l[1] === a)));
  for (let pass = 0; pass < 6; pass++) {
    const hits = E.laneCrossings(pts, lanes);
    if (!hits.length) break;
    const drop = new Set();
    for (const [l1, l2] of hits) {
      const d1 = E.dist(pts[l1[0]], pts[l1[1]]), d2 = E.dist(pts[l2[0]], pts[l2[1]]);
      const aDes = isDesigned(l1[0], l1[1]), bDes = isDesigned(l2[0], l2[1]);
      const longer = (aDes && !bDes) ? l2 : (bDes && !aDes) ? l1 : (d1 >= d2 ? l1 : l2);
      if (isDesigned(longer[0], longer[1]) && (aDes && bDes)) continue;
      drop.add(longer[0] + ',' + longer[1]);
      drop.add(longer[1] + ',' + longer[0]);
    }
    for (let i = lanes.length - 1; i >= 0; i--) {
      const a = lanes[i][0], b = lanes[i][1];
      if (drop.has(a + ',' + b) && !isDesigned(a, b)) lanes.splice(i, 1);
    }
    for (let i = 0; i < N; i++) par[i] = i;
    lanes.forEach(([a, b]) => uni(a, b));
    stitch(E.LANE_LEN_MUL, false) || stitch(4.5, false);
  }

  // Break leftover long (non-designed) lanes and stitch islands with midpoints so
  // every planet-planet lane stays within LANE_LEN_MUL of local neighbour distance.
  const splitLink = (a, b, depth) => {
    depth = depth || 0;
    if (a === b || has(a, b)) return true;
    if (!crosses(a, b) && !tooLong(a, b)) { lanes.push([a, b]); uni(a, b); return true; }
    if (crosses(a, b)) return false;
    const d = E.dist(pts[a], pts[b]);
    if (depth >= 6 || d < 36) { lanes.push([a, b]); uni(a, b); return true; }
    // Never keep a too-long hop just because it is under a fixed pixel cap
    // (d<80 used to sneak past LANE_LEN_MUL when the local neighbour was tight).
    const mx = (pts[a].x + pts[b].x) / 2, my = (pts[a].y + pts[b].y) / 2;
    // Reuse an existing open/centre point near the midpoint, or any point
    // close to the segment that yields two legal short hops.
    let mid = -1, bd = Math.max(48, Math.min(110, d * 0.38));
    for (let i = 0; i < pts.length; i++) {
      if (i === a || i === b || isPocket(i)) continue;
      const di = E.dist(pts[i], { x: mx, y: my });
      if (di < bd && !crosses(a, i) && !crosses(i, b) && !tooLong(a, i) && !tooLong(i, b)) { bd = di; mid = i; }
    }
    if (mid < 0) {
      // fall back: closest to the segment, even if one hop still needs a recurse
      bd = Math.max(40, Math.min(90, d * 0.32));
      for (let i = 0; i < pts.length; i++) {
        if (i === a || i === b || isPocket(i)) continue;
        const di = E.dist(pts[i], { x: mx, y: my });
        if (di < bd) { bd = di; mid = i; }
      }
    }
    if (mid < 0) {
      let x = mx, y = my;
      const minP = S * 0.9;
      for (let k = 0; k < 8; k++) {
        let hit = -1, bd = minP;
        for (const pk of pockets) for (const i of pk.cl) {
          const di = E.dist({ x, y }, pts[i]);
          if (di < bd) { bd = di; hit = i; }
        }
        if (hit < 0) break;
        const q = pts[hit], dx = x - q.x, dy = y - q.y, L = Math.hypot(dx, dy) || 1;
        x = q.x + dx / L * (minP + 4);
        y = q.y + dy / L * (minP + 4);
      }
      // if the nudged mid collapsed onto an endpoint, just keep the hop
      if (E.dist({ x, y }, pts[a]) < 40 || E.dist({ x, y }, pts[b]) < 40) {
        lanes.push([a, b]); uni(a, b); return true;
      }
      mid = addPt(x, y);
      N = pts.length;
      par.push(par.length);
    }
    return splitLink(a, mid, depth + 1) && splitLink(mid, b, depth + 1);
  };
  for (let i = lanes.length - 1; i >= 0; i--) {
    const a = lanes[i][0], b = lanes[i][1];
    if (isDesigned(a, b)) continue;
    if (!tooLong(a, b)) continue;
    lanes.splice(i, 1);
  }
  for (let i = 0; i < N; i++) par[i] = i;
  // par may be short if midpoints were not yet added
  while (par.length < pts.length) par.push(par.length);
  lanes.forEach(([a, b]) => uni(a, b));
  for (let g = 0; g < pts.length + 8; g++) {
    N = pts.length;
    while (par.length < N) par.push(par.length);
    const r0 = find(0);
    let hole = -1;
    for (let i = 1; i < N; i++) if (find(i) !== r0) { hole = i; break; }
    if (hole < 0) break;
    let best = null, bd = Infinity;
    for (let a = 0; a < N; a++) if (find(a) === r0) for (let b = 0; b < N; b++) if (find(b) === find(hole) && legalJoin(a, b)) {
      if (crosses(a, b)) continue;
      const d = E.dist(pts[a], pts[b]);
      if (d < bd) { bd = d; best = [a, b]; }
    }
    if (!best) break;
    if (!splitLink(best[0], best[1])) break;
  }
  // Split leftover long lanes. Midpoints added in earlier passes shrink
  // local neighbour distance, so a hop that was legal can become too long —
  // repeat until the cap holds or we run out of passes.
  for (let pass = 0; pass < 8; pass++) {
    let n = 0;
    for (let i = lanes.length - 1; i >= 0; i--) {
      const a = lanes[i][0], b = lanes[i][1];
      if (isDesigned(a, b) || !tooLong(a, b)) continue;
      lanes.splice(i, 1);
      splitLink(a, b);
      n++;
    }
    if (!n) break;
  }
  N = pts.length;

  const map = { pockets, center, centerChokes, homeChokes: pockets.map(p => p.choke), sizeKey, S };
  E._map28 = map;
  E._map26 = map; // rift placement in state.js reads E._map26.center

  return {
    N, W, H, pts, lanes,
    CC: {
      home: pockets[0] ? pockets[0].home : 0,
      homes: pockets.slice(0, 1 + nRivals).map(p => p.home),
      allyHomes: pockets.slice(1 + nRivals).map(p => p.home),
      clusters, clusterOf, chokes: pockets.map(p => p.choke)
    }
  };
};

// ---------- previous-slot migrator: walk v27 … v15 ----------
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

})();
