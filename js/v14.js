// Galaxies of Empires v1.4 — Commander levels & system cap, Flagship (hero), computer allies, Endless mode, defeat rules.
(function () {
'use strict';
const E = window.EOG;
const R = () => Math.random();
const ok = { ok: true }; const fail = msg => ({ ok: false, msg });
const act = E.act;

// ---------------- Commander level (XP from kills) → system cap ----------------
E.XP_TROOP = 1;
E.shipXP = h => Math.max(1, Math.round(E.shipPts(h) / 15));
E.cmd = () => E.state.emp.player.cmd;
E.sysCap = () => Math.min(E.CMD_CAP_MAX, E.CMD_CAP_BASE + E.cmd().lv - 1);
E.sysCount = () => E.state.planets.filter(p => p.owner === 'player').length;
E.atSysCap = () => E.sysCount() >= E.sysCap();
E.addXP = function (n, src) {
  const st = E.state; if (!st || !n || n <= 0 || E._quiet) return; // never from odds sandboxes
  const c = st.emp.player.cmd; c.xp += n; c.total = (c.total || 0) + n; if (src === 'ship') c.kills = (c.kills || 0) + 1;
  let guard = 0;
  while (c.xp >= E.cmdXpFor(c.lv) && guard++ < 50) {
    c.xp -= E.cmdXpFor(c.lv); c.lv++;
    const cap = E.sysCap();
    E.addLog('★ Commander level ' + c.lv + ' — system cap ' + cap + (cap >= E.CMD_CAP_MAX ? ' (max)' : ''), 'good');
    E.toast('★ Commander Lv ' + c.lv + ' · system cap ' + cap, 'good'); E.emit('sfx', 'build'); E.emit('cmdLevel', c.lv);
  }
};

// ---------------- abandon / raze your own worlds ----------------
E.razePlanet = function (p) {
  const st = E.state;
  for (const r of st.routes.slice()) if (r.from === p.id || r.to === p.id) E.act.cancelRoute(r.id);
  p.owner = 'neutral'; p.spec = null; p.blockade = false;
  p.slots.forEach(s => { s.b = null; s.lvl = 0; });
  for (const qn in p.queues) p.queues[qn] = [];
  p.def = { shield: 0, turret: 0, mines: 0, station: 0 }; p.shieldHp = 0;
  p.garrison = { inf: 4 }; p.razedAt = st.t;
};
act.abandon = function (pid, mode) {
  const st = E.state, p = st.planets[pid];
  if (!p || p.owner !== 'player') return fail('Not your planet');
  if (p.id === st.emp.player.home) return fail('Your capital can’t be abandoned');
  if (E.battleAt(p.sys)) return fail('Not during a battle');
  if (mode === 'raze') { E.razePlanet(p); E.addLog('🔥 You razed ' + p.name + '.', 'warn', p.sys); }
  else {
    for (const r of st.routes.slice()) if (r.from === p.id) E.act.cancelRoute(r.id);
    p.owner = 'neutral'; for (const qn in p.queues) p.queues[qn] = []; p.garrison.inf = Math.max(5, Math.round(p.garrison.inf * 0.5));
    E.addLog('🏳 You abandoned ' + p.name + ' — it is independent again.', 'warn', p.sys);
  }
  E.emit('sfx', 'click');
  return ok;
};


// ---------------- defeat tracking ----------------
E.isDefeated = o => !E.state.planets.some(p => p.owner === o);
E.markDefeated = function () {
  const st = E.state; st.defeated = st.defeated || {};
  for (const o of E.rivals()) {
    if (st.defeated[o] != null || !E.isDefeated(o)) continue;
    st.defeated[o] = st.t; st.emp[o].alive = false;
    st.fleets = st.fleets.filter(f => f.owner !== o);
    const left = E.rivals().filter(x => !E.isDefeated(x)).length;
    E.addLog('☠ ' + E.FACTIONS[o].name + ' defeated — no colonized systems left.' + (left ? ' ' + left + ' rival' + (left > 1 ? 's' : '') + ' remain.' : ''), 'good');
    E.toast('☠ ' + E.FACTIONS[o].short + ' defeated!', 'good');
  }
};

// ---------------- computer allies ----------------
function allyTick(dt) {
  const st = E.state, D = E.DIFFICULTY[st.diff];
  for (const a of E.allies()) {
    const em = st.emp[a]; if (!em || E.isDefeated(a)) continue;
    const ai = em.ai;
    ai.helpNext = (ai.helpNext == null ? 30 : ai.helpNext) - dt;
    ai.offNext = (ai.offNext == null ? 26 * 60 * E.TIME_MUL : ai.offNext) - dt;
    // send help to a threatened team world
    if (ai.helpNext <= 0) {
      ai.helpNext = 75 * E.TIME_MUL;
      const threatened = [];
      for (const w of st.windows) if (!w.closed) threatened.push(w.sys);
      for (const b of st.battles) if (!b.done && b.planetSide) { const p = E.sysPlanet(b.sys); if (p && E.team(p.owner) === 'player') threatened.push(b.sys); }
      for (const i of (E.incoming ? E.incoming() : [])) if (i && i.sys != null) threatened.push(i.sys);
      const sys = threatened.find(x => E.aiSourceFor(a, x));
      if (sys != null) {
        const src = E.aiSourceFor(a, sys);
        const fl = E.spawnFleet(a, src.sys, E.waveBudget() * 0.45 * (E.PERS[a].waveMult || 1), { name: E.FACTIONS[a].short + ' Relief Wing' });
        if (fl.ships.length) { E.act.move(fl.id, sys, 'raid'); fl.wave = true; fl.helper = true; E.addLog('🤝 ' + E.FACTIONS[a].short + ' send a relief wing to ' + st.systems[sys].name, 'good', sys); }
        else st.fleets.splice(st.fleets.indexOf(fl), 1);
      }
    }
    // offensive against the nearest enemy world they can reach
    if (ai.offNext <= 0) {
      ai.offNext = D.waveEvery * 1.8 * (0.85 + R() * 0.3);
      let best = null, bd = Infinity, src = null;
      for (const p of st.planets) {
        if (!E.hostile(a, p.owner) || p.owner === 'crisis') continue;
        const s0 = E.aiSourceFor(a, p.sys); if (!s0) continue;
        const L = E.laneDist(s0.sys, p.sys); if (L < bd) { bd = L; best = p; src = s0; }
      }
      if (best) {
        const budget = E.waveBudget() * 0.8 * (E.PERS[a].waveMult || 1);
        const need = Math.ceil(E.garrisonStrength(best) * 1.5) + 6;
        const fl = E.spawnFleet(a, src.sys, budget, { troops: need, name: E.FACTIONS[a].short + ' Strike Force' });
        E.act.move(fl.id, best.sys, 'attack'); fl.wave = true;
        E.addLog('🤝 ' + E.FACTIONS[a].short + ' launch an offensive on ' + best.name, 'info', best.sys);
      }
    }
  }
}

// ---------------- Endless mode: the map grows when every rival is defeated ----------------
E.endlessStage = () => (E.state.endless ? E.state.endless.stage : -1);
E.endlessNext = function () {
  const st = E.state; if (!st.endless) return false;
  const next = st.endless.stage + 1;
  if (next >= E.ENDLESS_STAGES.length) return false;
  E.expandMap(E.ENDLESS_STAGES[next].n, E.ENDLESS_STAGES[next].rivals);
  st.endless.stage = next;
  st.endless.banner = { stage: next, t: st.t, n: E.ENDLESS_STAGES[next].n, rivals: E.ENDLESS_STAGES[next].rivals };
  E.addLog('🌌 STAGE ' + (next + 1) + ' — the Expanse opens to ' + E.ENDLESS_STAGES[next].n + ' systems. ' + E.ENDLESS_STAGES[next].rivals + ' rival empires stir.', 'warn');
  E.toast('🌌 Stage ' + (next + 1) + ': ' + E.ENDLESS_STAGES[next].n + ' systems · ' + E.ENDLESS_STAGES[next].rivals + ' rivals', 'warn');
  E.emit('stage', st.endless.banner); E.emit('sfx', 'alert');
  return true;
};
E.expandMap = function (newN, nRivals) {
  const st = E.state, S = st.systems;
  const r = E.rng((st.seed || 1) * 7 + newN);
  const rift = S.find(s => s.rift);
  const old = S.filter(s => !s.rift);
  const k = Math.sqrt(newN / 20 * 1.15);
  const W = Math.round(1600 * k), H = Math.round(1050 * k);
  const dx = (W - st.world.w) / 2, dy = (H - st.world.h) / 2;
  for (const s of S) { s.x += dx; s.y += dy; }
  st.world = { w: W, h: H };
  // new points around the existing map
  const minD = 205, pts = old.slice();
  const fresh = [];
  let guard = 0;
  while (old.length + fresh.length < newN && guard++ < 80000) {
    const p = { x: 90 + r() * (W - 180), y: 90 + r() * (H - 180) };
    let near = false; for (const q of pts) if ((q.x - p.x) ** 2 + (q.y - p.y) ** 2 <= minD * minD) { near = true; break; }
    if (!near) { pts.push(p); fresh.push(p); }
  }
  while (old.length + fresh.length < newN) { const p = { x: 90 + r() * (W - 180), y: 90 + r() * (H - 180) }; pts.push(p); fresh.push(p); }
  const used = new Set(S.map(s => s.name));
  const types = Object.keys(E.PLANET_TYPES);
  const added = fresh.map(p => {
    const id = S.length, pid = st.planets.length;
    const sys = { id, name: E.makeName(r, used), x: p.x, y: p.y, lanes: [], rift: false, planetId: pid,
      star: { color: ['#fff3c4', '#ffd27f', '#ff9f6b', '#bcd7ff', '#ffffff', '#ffb4e0'][Math.floor(r() * 6)], size: 5 + r() * 4 },
      decor: Array.from({ length: 1 + Math.floor(r() * 3) }, () => ({ r: 16 + r() * 18, a: r() * 6.28, c: ['#8a7a66', '#5f7fa3', '#a36d5f', '#6fa37a'][Math.floor(r() * 4)], s: 1.5 + r() * 2 })) };
    S.push(sys);
    const pl = E.newPlanet(pid, id, sys.name + ' ' + ['Prime', 'II', 'III', 'IV', 'Major', 'Minor'][Math.floor(r() * 6)], types[Math.floor(r() * types.length)], 5 + Math.floor(r() * 4), 'neutral');
    st.planets.push(pl);
    return sys;
  });
  // detach the Rift, rebuild lanes for the new systems (existing lanes are kept)
  const laneKey = (a, b) => a < b ? a + ',' + b : b + ',' + a;
  st.lanes = st.lanes.filter(([a, b]) => a !== rift.id && b !== rift.id);
  for (const s of S) s.lanes = s.lanes.filter(x => x !== rift.id);
  rift.lanes = [];
  const all = S.filter(s => !s.rift), set = new Set(st.lanes.map(([a, b]) => laneKey(a, b)));
  const deg = {}; for (const s of all) deg[s.id] = s.lanes.length;
  const parent = {}; for (const s of all) parent[s.id] = s.id;
  const find = x => parent[x] === x ? x : (parent[x] = find(parent[x]));
  for (const [a, b] of st.lanes) parent[find(a)] = find(b);
  const addLane = (a, b) => { st.lanes.push([a, b]); set.add(laneKey(a, b)); S[a].lanes.push(b); S[b].lanes.push(a); deg[a]++; deg[b]++; };
  const isNew = new Set(added.map(s => s.id));
  const edges = [];
  for (const a of added) for (const b of all) { if (a.id === b.id || (isNew.has(b.id) && b.id < a.id)) continue; const d = E.dist(a, b); if (d < 620) edges.push([d, a.id, b.id]); }
  edges.sort((x, y) => x[0] - y[0]);
  const crosses = (a, b) => { for (const [i, j] of st.lanes) { const A = S[i], B = S[j]; if (Math.max(A.x, B.x) < Math.min(a.x, b.x) || Math.min(A.x, B.x) > Math.max(a.x, b.x) || Math.max(A.y, B.y) < Math.min(a.y, b.y) || Math.min(A.y, B.y) > Math.max(a.y, b.y)) continue; if (E.segCross(a, b, A, B)) return true; } return false; };
  for (const [d, a, b] of edges) if (find(a) !== find(b) && !crosses(S[a], S[b])) { parent[find(a)] = find(b); addLane(a, b); }
  for (const [d, a, b] of edges) if (find(a) !== find(b)) { parent[find(a)] = find(b); addLane(a, b); } // safety net
  for (const s of added) if (find(s.id) !== find(all[0].id)) { let bj = null, bd = Infinity; for (const q of all) if (find(q.id) === find(all[0].id)) { const d = E.dist(s, q); if (d < bd) { bd = d; bj = q.id; } } if (bj != null) { parent[find(s.id)] = find(bj); addLane(s.id, bj); } }
  for (const [d, a, b] of edges) { if (d > 400) break; if (set.has(laneKey(a, b)) || deg[a] >= 4 || deg[b] >= 4) continue; if (!crosses(S[a], S[b])) addLane(a, b); }
  // the Rift moves to the new rim, far from your capital
  const hp = S[st.planets[st.emp.player.home].sys];
  const corners = [{ x: W + 60, y: H / 2 }, { x: W / 2, y: H + 60 }, { x: W / 2, y: -60 }, { x: W + 40, y: H + 40 }, { x: W + 40, y: -40 }, { x: -60, y: H / 2 }];
  let rc = corners[0]; corners.forEach(c => { if (E.dist(c, hp) > E.dist(rc, hp)) rc = c; });
  rift.x = rc.x; rift.y = rc.y;
  const nearR = all.map(s => [E.dist(s, rift), s.id]).sort((a, b) => a[0] - b[0]);
  for (const [, id] of nearR.slice(0, 2)) { st.lanes.push([rift.id, id]); rift.lanes.push(id); S[id].lanes.push(rift.id); }
  E._sp = null; E._reach = {};
  // neutrals on the new systems get tougher further from your worlds
  const team = st.planets.filter(p => E.team(p.owner) === 'player');
  const maxD = Math.max(...added.map(s => Math.min(...team.map(p => E.dist(s, S[p.sys])))), 1);
  for (const s of added) {
    const p = st.planets[s.planetId];
    const d = Math.min(1, Math.min(...team.map(q => E.dist(s, S[q.sys]))) / maxD) * (0.6 + 0.4 * st.endless.stage / 3 + 0.2);
    const opts2 = ['mine', 'plant', 'power', 'warehouse', 'lab', 'tradeport', 'barracks', 'bunker'], list = [];
    for (let i = 0, nb = 2 + Math.floor(r() * 3); i < nb; i++) list.push([opts2[Math.floor(r() * opts2.length)], 1 + Math.floor(r() * (1 + d * 3))]);
    E.setSlots(p, list);
    p.def = { shield: Math.floor(d * 3.5 * r() + d), turret: Math.floor(d * 5 * r()), mines: Math.floor(d * 2 * r()), station: 0 };
    p.garrison = { inf: Math.round(8 + d * 34 + r() * 6) };
    p.shieldHp = E.shieldMax(st, p);
  }
  // wake the next rivals on far new systems
  const rivals = E.RIVALS.slice(0, nRivals), homes = [];
  for (const f of rivals) {
    let best = null, bd = -1;
    for (const s of added) {
      const p = st.planets[s.planetId]; if (p.owner !== 'neutral' || homes.includes(s.id)) continue;
      const dTeam = Math.min(...team.map(q => E.dist(s, S[q.sys])));
      const dH = homes.length ? Math.min(...homes.map(h => E.dist(s, S[h]))) : 9999;
      const sc = Math.min(dTeam, dH * 1.1); if (sc > bd) { bd = sc; best = s; }
    }
    if (!best) continue;
    homes.push(best.id);
    const P = E.PERS[f], p = st.planets[best.planetId];
    p.owner = f; p.size = 9; E.setSlots(p, P.base);
    p.def = { shield: P.def[0] + 1, turret: P.def[1] + 1, mines: P.def[2], station: 0 }; p.shieldHp = E.shieldMax(st, p);
    p.garrison = { inf: P.garrison[0] + P.garrison[1] * 3 }; p.spec = P.spec;
    const em = st.emp[f];
    em.res = { metal: 1500, crystal: 1200 }; em.home = p.id; em.alive = true; em.war = true;
    em.ai = { next: 5 + R() * 10, expandNext: (90 + R() * 90) * E.TIME_MUL, raidNext: 300 * E.TIME_MUL };
    delete st.defeated[f];
    const fl = E.makeFleet(f, best.id, 'Guard');
    for (let i = 0; i < 10; i++) fl.ships.push(E.makeShip(f, 'fighter'));
    for (let i = 0; i < 2; i++) fl.ships.push(E.makeShip(f, 'destroyer'));
    fl.guard = true;
  }
  st.rivals = rivals;
  const SZ = newN >= 150 ? E.SIZES.huge : newN >= 80 ? E.SIZES.large : newN >= 40 ? E.SIZES.medium : E.SIZES.small;
  Object.assign(st.cfg, { n: newN, rivals: nRivals, travel: SZ.travel, crisisMult: SZ.crisis, waves: SZ.waves });
  st.waves.next = Math.max(st.waves.next, st.t + E.DIFFICULTY[st.diff].firstWave * 0.6);
  return added.length;
};

// ---------------- per-step hook ----------------
E.v14Tick = function (dt) {
  const st = E.state;
  st._v14 = (st._v14 || 0) + dt;
  if (st._v14 < 2) return;
  const d = st._v14; st._v14 = 0;
  allyTick(d);
};
})();
