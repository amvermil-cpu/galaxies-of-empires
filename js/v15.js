// Galaxies of Empires v1.5 — carrier fleets, per-planet fleet management, rally points, idle alerts
'use strict';
(function () {
const E = window.EOG, act = E.act;
const OK = { ok: true }, fail = msg => ({ ok: false, msg });

// ---- carrier groups ----
// Every fleet is a carrier group: its carrier is the Flagship if aboard, else a Transport (which also carries the
// troops), else its largest warship. Troop capacity comes from the Transports in the group.
E.fleetCarrier = function (f) {
  if (!f || !f.ships.length) return null;
  return f.ships.find(s => s.h === 'transport') || f.ships.reduce((a, s) => (!a || E.shipPts(s.h) > E.shipPts(a.h)) ? s : a, null);
};
E.fleetCounts = function (f) { const c = {}; for (const s of f.ships) c[s.h] = (c[s.h] || 0) + 1; return c; };
// one-word status + a line of detail, for the global fleet list
E.fleetStatus = function (f) {
  const st = E.state, nm = s => (st.systems[s] ? st.systems[s].name : '?');
  if (E.battleAt(f.sys) && !f.path.length) return { k: 'battle', icon: '⚔', text: 'In battle at ' + nm(f.sys) };
  if (f.rallyTo != null && f.path.length) return { k: 'rally', icon: '⚑', text: 'Rallying to ' + nm(f.target) + ' · ETA ' + E.fmtTime(E.fleetETA(f)) };
  if (f.path.length) {
    const verb = { siege: 'Sieging', attack: 'Attacking', relocate: 'Relocating to', move: 'Moving to', retreat: 'Retreating to', return: 'Returning to', patrol: 'Patrolling to', deliver: 'Delivering to' }[f.order] || 'Moving to';
    return { k: 'moving', icon: '➜', text: verb + ' ' + nm(f.target) + ' · ETA ' + E.fmtTime(E.fleetETA(f)) };
  }
  if (f.order === 'siege' || f.order === 'attack') return { k: 'siege', icon: '⛓', text: 'Besieging ' + nm(f.sys) };
  if (f.order === 'patrol') return { k: 'patrol', icon: '↻', text: 'Patrolling at ' + nm(f.sys) };
  if (f.rallyTo != null) return { k: 'rally', icon: '⚑', text: 'Forming up at ' + nm(f.sys) };
  return { k: 'docked', icon: '⚓', text: 'Docked at ' + nm(f.sys) };
};

// Move ships between two carrier groups docked at the same system. toId may be 'new' (creates a group).
act.transfer = function (fromId, toId, counts, name) {
  const st = E.state, a = E.fleetById(fromId); if (!a || a.owner !== 'player') return fail('Pick a fleet');
  if (a.path.length) return fail('Fleet must be docked');
  let b;
  if (toId === 'new') b = E.makeFleet('player', a.sys, (name && String(name).slice(0, 18)) || E.newFleetName());
  else { b = E.fleetById(toId); if (!b || b === a) return fail('Pick a different fleet'); if (b.path.length || b.sys !== a.sys) return fail('Both fleets must be docked together'); }
  let moved = 0;
  for (const h in counts || {}) { let n = Math.max(0, Math.floor(counts[h] || 0)); for (let i = a.ships.length - 1; i >= 0 && n > 0; i--) if (a.ships[i].h === h) { b.ships.push(a.ships.splice(i, 1)[0]); n--; moved++; } }
  if (!moved) { if (toId === 'new') st.fleets.splice(st.fleets.indexOf(b), 1); return fail('Pick ships to move'); }
  // troops follow the Transports: whatever no longer fits in `a` moves to `b`, then the planet garrison
  const capA = E.fleetStats(a).cap; const p = E.sysPlanet(a.sys);
  for (const k of E.TROOP_KEYS) while (a.troops[k] > 0 && E.troopSize(a.troops) > capA) {
    a.troops[k]--;
    if (E.troopSize(b.troops) + E.TROOPS[k].size <= E.fleetStats(b).cap) b.troops[k]++; else if (p && p.owner === 'player') p.garrison[k]++;
  }
  if (b.routeId == null && a.routeId == null) { b.order = 'idle'; }
  E.cleanupFleets();
  E.emit('sfx', 'click');
  return { ok: true, moved, fleet: b };
};
// Troops between a docked fleet and the planet garrison: n > 0 loads, n < 0 unloads.
act.troopsTo = function (fid, n) {
  const f = E.fleetById(fid); if (!f || f.path.length) return fail('Dock first');
  const p = E.sysPlanet(f.sys); if (!p || p.owner !== f.owner) return fail('Must be at your planet');
  n = Math.round(n || 0); if (!n) return fail('Nothing to move');
  if (n > 0) return act.load(fid, n);
  let moved = 0; for (const k of E.TROOP_KEYS) while (moved < -n && f.troops[k] > 0) { f.troops[k]--; p.garrison[k]++; moved++; }
  return moved ? { ok: true, moved: -moved } : fail('No troops aboard');
};

// ---- rally points (item 22) ----
act.setRally = function (pid, toPid) {
  const st = E.state, p = st.planets[pid]; if (!p || p.owner !== 'player') return fail('Not your planet');
  if (toPid == null || toPid === '' || +toPid === p.id || +toPid < 0) { p.rally = null; return OK; }
  const q = st.planets[+toPid]; if (!q || q.owner !== 'player') return fail('Rally point must be one of your planets');
  p.rally = q.id; return OK;
};
// v1.6: long-press helper. Returns { ok, msg }.
E.setRallyHere = function (sys) {
  const st = E.state, q = E.sysPlanet(sys);
  if (!q) return { ok: false, msg: 'Nothing to rally to there' };
  if (q.owner !== 'player') return { ok: false, msg: '⚑ A rally point must be one of your planets' };
  const sel = Rd_sel();
  const selP = sel != null ? E.sysPlanet(sel) : null;
  if (selP && selP.owner === 'player' && selP.id !== q.id) {
    if (selP.rally === q.id) { selP.rally = null; return { ok: true, msg: '⚑ Rally point cleared on ' + selP.name }; }
    const r = act.setRally(selP.id, q.id); return r.ok ? { ok: true, msg: '⚑ ' + selP.name + ' now rallies to ' + q.name } : { ok: false, msg: r.msg };
  }
  const others = E.playerPlanets().filter(p => p.id !== q.id);
  const todo = others.filter(p => p.rally !== q.id);
  if (!others.length) return { ok: false, msg: '⚑ You need a second planet to set a rally point' };
  if (!todo.length) { others.forEach(p => { p.rally = null; }); return { ok: true, msg: '⚑ Rally point cleared' }; }
  todo.forEach(p => { p.rally = q.id; });
  return { ok: true, msg: '⚑ Rally point set: ' + q.name + ' — new ships from ' + others.length + ' world' + (others.length === 1 ? '' : 's') + ' gather there' };
};
function Rd_sel() { const sh = E.ui && E.ui.sheet; return sh && sh.type === 'system' ? sh.sys : null; }
E.rallyOf = function (p) { if (!p || p.rally == null) return null; const q = E.state.planets[p.rally]; return q && q.owner === p.owner && q.id !== p.id ? q : null; };
// called by the shipyard queue for every finished ship
E.rallyDock = function (p, ship) {
  const q = p.owner === 'player' ? E.rallyOf(p) : null;
  if (!q) return E.dockShip(p.owner, p.sys, ship);
  const st = E.state;
  let f = st.fleets.find(x => x.owner === 'player' && x.rallyFrom === p.id && x.sys === p.sys && !x.path.length && x.rallyTo === q.id);
  if (!f) { f = E.makeFleet('player', p.sys, 'Rally → ' + q.name.split(' ')[0]); f.rallyTo = q.id; f.rallyFrom = p.id; f.rallyT0 = st.t; }
  f.ships.push(ship); f.rallyT = st.t; // last ship — used only as a short gather pause, not a reset of the departure
  return f;
};
function rallyTick() {
  if (E.rallyTick26) return E.rallyTick26();
  const st = E.state;
  for (const f of st.fleets) {
    if (f.owner !== 'player' || f.rallyTo == null || f.path.length) continue;
    const q = st.planets[f.rallyTo];
    if (!q || q.owner !== 'player') { f.rallyTo = null; f.rallyFrom = null; f.name = E.newFleetName(); continue; }
    if (f.sys === q.sys) { // arrived: ships join the docked group there; v1.7: troops stay aboard until you unload them
      f.rallyTo = null; f.rallyFrom = null;
      const dock = st.fleets.find(x => x !== f && x.owner === 'player' && x.sys === q.sys && !x.path.length && x.order === 'idle' && !x.routeId && x.rallyTo == null);
      if (dock) act.merge([dock.id, f.id]); else f.name = q.name.split(' ')[0] + ' Guard';
      continue;
    }
    // v2.5: wait 3s after the last new ship, but never more than 12s after the first (a busy yard used to reset
    // rallyT on every completion and the fleet never left).
    const t0 = f.rallyT0 != null ? f.rallyT0 : (f.rallyT || 0);
    const tLast = f.rallyT != null ? f.rallyT : t0;
    if (st.t - tLast < 3 && st.t - t0 < 12) continue;
    const src = st.planets[f.rallyFrom];
    if (src && src.owner === 'player' && src._rallyInf > 0 && E.fleetStats(f).cap) { const r = act.load(f.id, src._rallyInf); if (r.ok) src._rallyInf -= r.moved; }
    E._quiet = true; E._rallyMove = true; let r; try { r = act.move(f.id, q.sys, 'relocate'); } finally { E._quiet = false; E._rallyMove = false; }
    if (!r.ok) {
      f.rallyFail = (f.rallyFail || 0) + 1;
      if (f.rallyFail >= 8) { f.rallyTo = null; f.rallyFrom = null; f.name = E.newFleetName(); E.addLog('Rally route to ' + q.name + ' is blocked; new ships stay docked.', 'warn', f.sys); }
    } else f.rallyFail = 0;
  }
}

// ---- idle alerts (item 23) ----
E.idleAlerts = function () {
  const st = E.state, out = [];
  const mine = E.playerPlanets();
  const tcWorlds = mine.filter(p => E.bLevel(p, 'tradeport'));
  for (const p of mine) {
    const idleQ = [];
    if (!p.queues.build.length) idleQ.push('build');
    if (E.bLevel(p, 'shipyard') && !p.queues.ship.length) idleQ.push('ship');
    if (E.bLevel(p, 'barracks') && !p.queues.troop.length) idleQ.push('troop');
    if (idleQ.length) out.push({ kind: 'queue', p, q: idleQ });
    const traders = E.fleetsAt(p.sys, 'player').filter(f => !f.routeId && f.order === 'idle').reduce((a, f) => a + f.ships.filter(s => s.h === 'trader').length, 0);
    if (traders) out.push({ kind: 'trader', p, n: traders, canRoute: tcWorlds.length >= 2 && E.bLevel(p, 'tradeport') > 0 && st.routes.filter(r => r.from === p.id).length < E.routeCap(p) });
  }
  return out;
};
// v1.6: one number for the top bar: every empty production queue plus every idle trader
E.idleCount = function () { let queues = 0, traders = 0; for (const a of E.idleAlerts()) { if (a.kind === 'queue') queues += a.q.length; else traders += a.n; } return { queues, traders, total: queues + traders }; };
const QN = { build: 'Construction', ship: 'Shipyard', troop: 'Barracks' };
function idleTick() {
  const st = E.state; if (st._ff) return;
  st._idle = st._idle || {}; const now = {};
  for (const a of E.idleAlerts()) {
    if (a.kind === 'queue') for (const q of a.q) now['q' + a.p.id + q] = { msg: '⏸ ' + QN[q] + ' idle on ' + a.p.name, sys: a.p.sys };
    else now['t' + a.p.id] = { msg: '⚖ ' + a.n + ' idle Trader' + (a.n > 1 ? 's' : '') + ' at ' + a.p.name, sys: a.p.sys };
  }
  // toast only on transitions (something just went idle), at most one every 45 s
  for (const k in now) if (!st._idle[k] && st.t > 30 && (st.t - (st._idleToast || -99)) > 45) { st._idleToast = st.t; E.toast(now[k].msg, 'warn', now[k].sys); E.addLog(now[k].msg, 'info', now[k].sys); break; }
  st._idle = Object.fromEntries(Object.keys(now).map(k => [k, 1]));
  st._idleN = E.idleBuildPlanets().length; // v1.7: the badge counts only idle construction slots
}

E.v15Tick = function (dt) {
  const st = E.state;
  st._v15 = (st._v15 || 0) + dt;
  if (st._v15 < 1) return;
  st._v15 = 0;
  rallyTick();
  idleTick();
  hollowGarrisonCap();
};
// balance: a Hollow landing that captures a world keeps only a holding force, so a lost world can be won back
// (a full late-game landing party could leave 10 000+ troops on a chokepoint and seal off the map)
E.HOLLOW_GARRISON_CAP = 120;
function hollowGarrisonCap() {
  const st = E.state, cap = E.HOLLOW_GARRISON_CAP * (1 + 0.1 * Math.min(20, (st.crisis && (st.crisis.cw != null ? E.riftWaveIdx(st.crisis) : st.crisis.waveIdx)) || 0));
  for (const p of st.planets) {
    if (p.owner !== 'crisis') continue;
    const n = E.troopCount(p.garrison); if (n <= cap) continue;
    const k = cap / n; for (const t of E.TROOP_KEYS) if (p.garrison[t]) p.garrison[t] = Math.floor(p.garrison[t] * k);
  }
}

// ================= v1.7 =================
// ---- item 2: new fleets are called Fleet 1, Fleet 2, … (lowest number no fleet of yours is using) ----
E.newFleetName = function () {
  const used = new Set();
  for (const f of E.state.fleets) { const m = /^Fleet (\d+)$/.exec(f.name || ''); if (m) used.add(+m[1]); }
  let n = 1; while (used.has(n)) n++;
  return 'Fleet ' + n;
};

// ---- item 4: Recall — an en-route fleet turns around (even mid-lane) and flies back to where it set off from ----
act.recall = function (fid) {
  const st = E.state, f = E.fleetById(fid); if (!f) return fail('No fleet');
  if (!f.path.length) return fail('Already docked');
  if (f.owner !== 'player' && !E.isAlly(f.owner)) return fail('Not your fleet');
  const owner = f.owner;
  const isMine = s => { const p = E.sysPlanet(s); return !!(p && E.team(p.owner) === E.team(owner)); };
  const nxt = f.path[0], prev = f.sys;
  let origin = f.origin != null ? f.origin : prev;
  if (!isMine(origin)) origin = E.nearestFriendly(owner, prev);
  if (origin == null) return fail('Nowhere to return to');
  // route back from the node it last left: prev → … → origin
  const back = prev === origin ? [] : (E.pathFor(owner, prev, origin) || E.path(prev, origin));
  if (back == null) return fail('No route back');
  E.leaveBattle(f);
  if (f.prog > 0.001 && nxt !== prev) { f.sys = nxt; f.prog = 1 - f.prog; f.path = [prev, ...back]; } // turn round mid-lane
  else { f.prog = 0; f.path = back.slice(); }
  f.order = 'return'; f.target = origin; f.patrol = null; f.routeId = null; f.colonize = false; f.raze = false;
  f.rallyTo = null; f.rallyFrom = null; f.stay = false; f.retargeted = false;
  if (!f.path.length) { f.order = 'idle'; }
  E.emit('sfx', 'launch');
  return { ok: true, origin, name: st.systems[origin].name };
};

// ---- item 5: troops aboard transports docked at one of your planets defend it together with the garrison ----
E.defFleets = function (p) {
  if (!p || p.owner !== 'player') return [];
  return E.state.fleets.filter(f => f.owner === 'player' && f.sys === p.sys && !f.path.length && f.ships.length && E.troopCount(f.troops) > 0);
};
E.aboardAt = function (p) { let n = 0; for (const f of E.defFleets(p)) n += E.troopCount(f.troops); return n; };
E.defPool = function (p) {
  const o = Object.assign({}, p.garrison);
  for (const f of E.defFleets(p)) for (const k of E.TROOP_KEYS) o[k] = (o[k] || 0) + (f.troops[k] || 0);
  return o;
};
// ground defence value shown to the player: troop power of garrison + troops aboard docked transports, × bunker/spec multipliers
E.groundDefense = function (p) { return E.troopPower(E.defPool(p), p.owner, false) * E.garrisonDefMult(p, 0); };

// ---- items 11 & 13: idle construction slots ----
// a planet's construction slot is idle when nothing is being built and there is something to build or upgrade
E.canBuildMore = function (p) {
  const n = E.planetSlots(p);
  for (let i = 0; i < n; i++) { const s = p.slots[i]; if (!s.b || s.lvl < E.BUILD_MAX_LVL) return true; }
  return false;
};
E.isBuildIdle = function (p) { return !!p && p.owner === 'player' && !p.queues.build.length && E.canBuildMore(p); };
E.idleBuildPlanets = function () { return E.playerPlanets().filter(E.isBuildIdle); };
E.idleCount = function () { const l = E.idleBuildPlanets(); return { queues: l.length, traders: 0, total: l.length, planets: l }; };

// ---- item 12: army totals for the top bar ----
E.armyTotals = function () {
  const st = E.state; let sig = st.fleets.length * 7 + st.planets.length;
  for (const f of st.fleets) if (f.owner === 'player') sig = (sig * 31 + f.ships.length + E.troopCount(f.troops) * 3 + 1) % 2147483629;
  for (const p of st.planets) if (p.owner === 'player') sig = (sig * 31 + E.troopCount(p.garrison) + 1) % 2147483629;
  const c = st._armyC, now = Date.now();
  if (c && c.sig === sig && c.st === st && now - c.at < 2000) return c.v; // unchanged totals: skip the full ship scan (top bar asks 5×/s)
  let troops = 0, fighters = 0, destroyers = 0, carriers = 0, transports = 0, freighters = 0;
  for (const p of st.planets) if (p.owner === 'player') troops += E.troopCount(p.garrison);
  for (const f of st.fleets) {
    if (f.owner !== 'player') continue;
    troops += E.troopCount(f.troops);
    for (const s of f.ships) { const h = s.h; if (h === 'fighter') fighters++; else if (h === 'destroyer') destroyers++; else if (h === 'carrier') carriers++; else if (h === 'transport') transports++; else if (h === 'freighter') freighters++; }
  }
  const v2 = { troops, fighters, destroyers, carriers, transports, freighters }; // v1.9 item 15
  Object.defineProperty(st, '_armyC', { value: { sig, st, at: now, v: v2 }, enumerable: false, writable: true, configurable: true });
  return v2;
};

// ---- item 10: fog of war on fleets ----
// You see your own and allied fleets, and enemy fleets that are attacking one of YOUR planets (flying to it, or in orbit).
E.fleetVisible = function (f) {
  if (E.team(f.owner) === 'player') return true;
  if (E.autoScouting && E.autoScouting()) return true; // v1.9 item 11: Lv15 scout network sees everything
  if (f.path.length) { const p = E.sysPlanet(f.path[f.path.length - 1]); return !!(p && p.owner === 'player' && E.hostile(f.owner, 'player')); }
  const p = E.sysPlanet(f.sys); if (p && p.owner === 'player') return true;
  return E.state.fleets.some(g => g !== f && !g.path.length && g.sys === f.sys && E.team(g.owner) === 'player'); // a fleet of ours is on the spot
};

// ---- item 14: what the map may show of an enemy world: only the latest scout snapshot ----
E.planetSnapshot = function (p) {
  const st = E.state, it = st.intel && st.intel[p.sys];
  if (!it || it.owner !== p.owner) return null;
  const sum = o => { let lo = 0, hi = 0; for (const k in o) if (o[k]) { lo += o[k][0]; hi += o[k][1]; } return [lo, hi]; };
  return { level: it.level, t: it.t, age: st.t - it.t, ships: sum(it.ships), troops: sum(it.troops), raw: it };
};

// ---- item 6: battle reports ----
E.getReport = function (id) {
  const st = E.state; id = +id;
  let r = (st.reports || []).find(x => x.id === id); if (r) return r;
  r = (st.results || []).find(x => x.id === id); if (r) return Object.assign({ kind: 'window' }, r);
  return null;
};
E.openBattleReport = function (b) {
  const st = E.state, p = E.sysPlanet(b.sys);
  const rep = { id: b.id, kind: 'battle', t: st.t, sys: b.sys, system: st.systems[b.sys].name, planet: p ? p.name : null, planetOwner: p ? p.owner : null, planetSide: !!b.planetSide, done: false, winner: null,
    sides: [0, 1].map(i => ({ owners: b.owners[i].slice(), ships: {}, lost: {}, turrets: 0, stations: 0, turretsLost: 0, stationsLost: 0 })), startPow: b.startPow.slice() };
  for (const u of b.units) { const sd = rep.sides[u.side]; if (u.kind === 'ship') sd.ships[u.h] = (sd.ships[u.h] || 0) + 1; else if (u.kind === 'turret') sd.turrets++; else if (u.kind === 'station') sd.stations++; }
  st.reports = st.reports || []; st.reports.unshift(rep); if (st.reports.length > 160) st.reports.length = 160;
  return rep.id;
};
E.reportJoin = function (b, f, side) {
  const r = E.getReport(b.rep); if (!r || r.done || !r.sides) return;
  const sd = r.sides[side]; if (!sd.owners.includes(f.owner)) sd.owners.push(f.owner);
  for (const s of f.ships) sd.ships[s.h] = (sd.ships[s.h] || 0) + 1;
};
E.reportLoss = function (b, u) { const r = E.getReport(b.rep); if (!r || !r.sides) return; const sd = r.sides[u.side]; sd.lost[u.h] = (sd.lost[u.h] || 0) + 1; };
E.closeBattleReport = function (b, winner) {
  const st = E.state, r = E.getReport(b.rep); if (!r || !r.sides) return;
  r.done = true; r.winner = winner; r.endT = st.t; r.dur = b.t;
  r.sides[0].turretsLost = Math.max(0, r.sides[0].turrets - b.units.filter(u => u.kind === 'turret').length);
  r.sides[0].stationsLost = Math.max(0, r.sides[0].stations - b.units.filter(u => u.kind === 'station').length);
  const ps = r.sides.findIndex(s => s.owners.includes('player'));
  r.outcome = winner < 0 ? 'stalemate' : winner === ps ? 'victory' : 'defeat';
  const p = E.sysPlanet(b.sys); r.planetOwnerAfter = p ? p.owner : null;
};
E.groundReport = function (res, owner, prevOwner, razing, aboardN) {
  const st = E.state, p = res.p;
  const rep = { id: E.id(), kind: 'ground', t: st.t, sys: p.sys, system: st.systems[p.sys].name, planet: p.name, attacker: owner, defender: prevOwner,
    atk: { before: Object.assign({}, res.before.atk), after: Object.assign({}, res.after.atk) }, def: { before: Object.assign({}, res.before.def), after: Object.assign({}, res.after.def) },
    rounds: (res.rounds || []).length, captured: !!res.captured, razed: !!razing && !!res.captured, burn: res.burn || 0, aboard: aboardN || 0,
    outcome: (owner === 'player') ? (res.captured ? 'victory' : 'defeat') : (res.captured ? 'defeat' : 'victory') };
  st.reports = st.reports || []; st.reports.unshift(rep); if (st.reports.length > 160) st.reports.length = 160;
  return rep.id;
};

// ---- save migration v1.6 → v1.7 ----
E.migrate17 = function (st) {
  if (st.ffa == null) st.ffa = true;
  st.reports = st.reports || [];
  for (const f of st.fleets) {
    if (f.order === 'escort') f.order = 'idle';
    f.routeId = null;
    if (f.origin == null) f.origin = f.sys;
    if (f.owner === 'player' && f.name && /^Withdrawn$/.test(f.name)) { f.withdrawn = true; }
  }
  return st;
};

// ======================================================================================
// v1.8
// ======================================================================================
// ---- item 1: turret-first defence in the battle report ----
E.reportReserve = function (b, launched) {
  const r = E.getReport(b.rep); if (!r || !r.sides) return;
  let ships = 0; const byH = {};
  for (const id of b.reserve || []) { const f = E.fleetById(id); if (!f) continue; for (const s of f.ships) { ships++; byH[s.h] = (byH[s.h] || 0) + 1; } }
  if (!r.turretFirst) r.turretFirst = { held: 0, fleets: 0, ships: {}, launchedAt: null, launched: 0 };
  const tf = r.turretFirst;
  if (!launched) { tf.held = ships; tf.fleets = (b.reserve || []).length; tf.ships = byH; }
  else { tf.launchedAt = b.t; tf.launched = b.reserveShips || 0; }
};
// ---- item 4: counter text for ship cards, derived from the real multipliers ----
E.counterInfo = function (h) {
  const H = E.HULLS[h], best = [], weak = [], name = k => E.HULLS[k].name + 's';
  if (H.noWeapon) return { best, weak: Object.keys(E.COUNTER_TABLE).filter(k => E.COUNTER_TABLE[k][h] > 1).map(k => ({ h: k, m: E.COUNTER_TABLE[k][h] })), unarmed: true };
  if (E.FLAK_HULLS[h]) best.push({ h: E.FLAK_HULLS[h], flak: true });
  for (const d in (E.COUNTER_TABLE[h] || {})) best.push({ h: d, m: E.COUNTER_TABLE[h][d] });
  for (const a in E.COUNTER_TABLE) if (E.COUNTER_TABLE[a][h] > 1) weak.push({ h: a, m: E.COUNTER_TABLE[a][h] });
  for (const a in E.FLAK_HULLS) if (E.FLAK_HULLS[a] === h) weak.push({ h: a, flak: true });
  return { best, weak, name };
};
E.counterLabel = function (h) {
  const I = E.counterInfo(h), nm = k => E.HULLS[k].name + 's';
  const fmt = x => x.flak ? nm(x.h).replace(/s$/, '') + ' swarms (flak)' : nm(x.h) + ' (×' + x.m + ')';
  if (I.unarmed) return { best: E.HULLS[h].trader ? 'No weapons — trade routes only' : 'No weapons — troop carrier', weak: I.weak.length ? 'Hunted by ' + I.weak.map(x => nm(x.h)).join(', ') : '' };
  return { best: I.best.length ? 'Best vs ' + I.best.map(fmt).join(' · ') : 'No counter bonus', weak: I.weak.length ? 'Weak vs ' + I.weak.map(x => x.flak ? nm(x.h).replace(/s$/, '') + ' flak' : nm(x.h) + ' (×' + x.m + ')').join(' · ') : 'Light guns — escort it' };
};

// ---- item 3: online-ready groundwork (nothing connected, no network calls) ----
E.newPlayerId = function () {
  let hex = '';
  try { const a = new Uint8Array(8); (globalThis.crypto || window.crypto).getRandomValues(a); hex = Array.from(a, x => x.toString(16).padStart(2, '0')).join(''); }
  catch (e) { for (let i = 0; i < 16; i++) hex += Math.floor(Math.random() * 16).toString(16); }
  return 'p_' + hex;
};
E.makeProfile = function (old) {
  let id = old && old.playerId, name = old && old.displayName;
  try { id = id || localStorage.getItem('goe_player'); name = name || localStorage.getItem('goe_player_name'); } catch (e) {}
  id = id || E.newPlayerId(); name = name || 'Commander';
  try { localStorage.setItem('goe_player', id); localStorage.setItem('goe_player_name', name); } catch (e) {}
  return { playerId: id, displayName: name, created: (old && old.created) || null };
};
E.setDisplayName = function (n) {
  const st = E.state; n = String(n || '').replace(/[<>]/g, '').trim().slice(0, 24) || 'Commander';
  if (st) { st.profile = st.profile || E.makeProfile(); st.profile.displayName = n; }
  try { localStorage.setItem('goe_player_name', n); } catch (e) {}
  return n;
};
// Transport interface: send(cmd) → result. Local applies at once; Remote is a stub that refuses (online is not built yet).
E.LocalTransport = function () { return { kind: 'local', connected: true, send(cmd) { return E.applyCommand(cmd); } }; };
E.RemoteTransport = function (cfg) {
  return { kind: 'remote', connected: false, cfg: cfg || {},
    connect() { return Promise.reject(new Error('Online play is coming soon — no server exists yet')); },
    send(cmd) { return { ok: false, msg: 'Online play is coming soon', cmd }; }, close() {} };
};
E.CMD_LOG_MAX = 200;
E.sync = { transport: E.LocalTransport(), seq: 0,
  use(t) { this.transport = t; return t; },
  submit(op, args) {
    const st = E.state;
    const cmd = { seq: ++this.seq, tick: st ? st.tick || 0 : 0, t: st ? Math.round(st.t * 100) / 100 : 0, pid: st && st.profile ? st.profile.playerId : null, op, args: JSON.parse(JSON.stringify(args)) };
    return this.transport.send(cmd);
  } };
E.actRaw = Object.assign({}, E.act);
E.applyCommand = function (cmd) {
  const fn = E.actRaw[cmd.op]; if (!fn) return { ok: false, msg: 'unknown command ' + cmd.op };
  E._applying = true; let res;
  try { res = fn.apply(null, cmd.args || []); } finally { E._applying = false; }
  const st = E.state;
  if (st) { st.cmdLog = st.cmdLog || []; st.cmdLog.push({ tick: cmd.tick, t: cmd.t, op: cmd.op, args: cmd.args, ok: !res || res.ok !== false }); if (st.cmdLog.length > E.CMD_LOG_MAX) st.cmdLog.splice(0, st.cmdLog.length - E.CMD_LOG_MAX); }
  return res;
};
// Every player action goes through E.sync (UI → command → transport → sim). Sim-internal (AI) calls go straight through.
for (const k of Object.keys(E.actRaw)) E.act[k] = function () { if (E._inStep || E._applying || !E.state) return E.actRaw[k].apply(null, arguments); return E.sync.submit(k, Array.prototype.slice.call(arguments)); };
const rawStep = E.step;
E.step = function (dt) { const st = E.state; E._inStep = true; try { rawStep(dt); } finally { E._inStep = false; } if (st) st.tick = (st.tick || 0) + 1; };
// Fixed-tick stepping for lockstep / replays (the phone client keeps its adaptive loop offline)
E.FIXED_DT = 0.1;
E.stepFixed = function (dt) { const st = E.state; if (!st) return; st._acc = (st._acc || 0) + dt; while (st._acc >= E.FIXED_DT - 1e-9) { st._acc -= E.FIXED_DT; E.step(E.FIXED_DT); } };
// Compact hash of the authoritative state — two peers running the same seed + commands must agree
E.stateHash = function () {
  const st = E.state; if (!st) return '0';
  const parts = [Math.round(st.t * 10), st.rngS, st.planets.map(p => p.owner + ':' + Math.round(E.troopSize(p.garrison)) + ':' + p.slots.map(x => (x.b || '') + x.lvl).join('')).join('|'),
    st.fleets.map(f => f.id + f.owner + f.sys + ':' + f.ships.length + ':' + f.path.length).join('|'),
    Object.keys(st.emp).map(k => k + Math.round(st.emp[k].res.metal) + '/' + Math.round(st.emp[k].res.crystal)).join('|')].join('#');
  let h = 2166136261; for (let i = 0; i < parts.length; i++) { h ^= parts.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
};
const rawNewGame = E.newGame;
E.newGame = function () { const st = rawNewGame.apply(null, arguments); st.profile = E.makeProfile(); st.tick = 0; return st; };

// ---- save migration v1.7 → v1.8 ----
E.migrate18 = function (st) {
  if (st.ver !== '1.8') {
    if (st.species && !E.SPECIES[st.species]) { st.look = st.species === 'alien' ? 'alien' : 'human'; st.species = 'none'; } // v1.7 Humans/Aliens → Balanced, keep their look
    if (!st.species || !E.SPECIES[st.species]) st.species = 'none';
  }
  st.aiSpecies = st.aiSpecies || {};
  for (const f of (st.rivals || []).concat(st.allies || [])) if (!st.aiSpecies[f]) st.aiSpecies[f] = 'none';
  if (st.rngS == null) st.rngS = ((st.seed || 1) ^ 0x2545F491) | 0;
  st.cmdLog = st.cmdLog || []; if (st.tick == null) st.tick = 0;
  st.profile = st.profile && st.profile.playerId ? st.profile : E.makeProfile(st.profile);
  return st;
};
// ================= v1.9 =================
// ---- items 8 / 21: pay metal to finish building upgrades instantly ----
// cost = remaining minutes × (40·L² + 60) metal, L = the level being built (min 10). Lv2 with 3 min left ≈ 660;
// a full Lv14→15 upgrade (≈2.5 h) ≈ 1.39M — about an hour of late-game (≈25k/min) metal income.
E.SKIP_K = 40; E.SKIP_BASE = 60;
E.skipCost = function (lvl, leftSec) { return Math.max(10, Math.ceil(Math.max(0, leftSec) / 60 * (E.SKIP_K * lvl * lvl + E.SKIP_BASE))); };
E.skipCostQ = function (q, active) { return E.skipCost(q.lvl, active ? q.left : q.total); };
E.skipAllCost = function (p) { return p.queues.build.reduce((a, q, i) => a + E.skipCostQ(q, i === 0), 0); };
function finishBuild(p, q) {
  const s = p.slots[q.slot]; s.b = q.b; s.lvl = q.lvl;
  if (q.b === 'shipyard' || q.b === 'barracks') E.retimeProd(p);
  if (p.owner === 'player') { E.addLog(E.BUILDINGS[q.b].name + ' Lv' + q.lvl + ' finished instantly on ' + p.name, 'info', p.sys); E.emit('sfx', 'build'); E.emit('built', { p, q }); }
}
E.act.skip = function (pid) {
  const st = E.state, p = st.planets[pid]; if (!p || p.owner !== 'player') return { ok: false, msg: 'Not your planet' };
  const q = p.queues.build[0]; if (!q) return { ok: false, msg: 'Nothing to skip' };
  const c = { metal: E.skipCostQ(q, true) };
  if (!E.canAfford('player', c)) { E.toast && E.toast('Need ' + E.fmtN(c.metal) + ' metal to finish now', 'warn'); return { ok: false, msg: 'Need ' + E.fmtN(c.metal) + ' metal' }; }
  E.pay('player', c); p.queues.build.shift(); finishBuild(p, q); st.stats.skips = (st.stats.skips || 0) + 1; st.stats.skipMetal = (st.stats.skipMetal || 0) + c.metal;
  return { ok: true, cost: c.metal };
};
E.act.skipAll = function (pid) {
  const st = E.state, p = st.planets[pid]; if (!p || p.owner !== 'player') return { ok: false, msg: 'Not your planet' };
  if (!p.queues.build.length) return { ok: false, msg: 'Nothing to skip' };
  const c = { metal: E.skipAllCost(p) };
  if (!E.canAfford('player', c)) { E.toast && E.toast('Need ' + E.fmtN(c.metal) + ' metal to finish the whole queue', 'warn'); return { ok: false, msg: 'Need ' + E.fmtN(c.metal) + ' metal' }; }
  E.pay('player', c); const list = p.queues.build.splice(0); for (const q of list) finishBuild(p, q);
  st.stats.skips = (st.stats.skips || 0) + list.length; st.stats.skipMetal = (st.stats.skipMetal || 0) + c.metal;
  return { ok: true, cost: c.metal, n: list.length };
};

// ---- item 16: open several trade routes at once ----
E.maxTraders = function (fromPid, toPid) {
  const st = E.state, a = st.planets[fromPid], b = st.planets[toPid]; if (!a || a.owner !== 'player' || !E.bLevel(a, 'tradeport')) return 0;
  if (toPid != null && !E.validTradeTarget(a, b)) return 0;
  const free = Math.max(0, E.routeCap(a) - st.routes.filter(r => r.from === fromPid).length);
  let docked = 0; for (const f of E.fleetsAt(a.sys, 'player')) if (!f.routeId) for (const s of f.ships) if (s.h === 'trader') docked++;
  const charter = Math.floor((E.state.emp.player.res.crystal || 0) / E.HULLS.trader.cost.crystal);
  return Math.min(free, docked + charter);
};
E.act.routeMany = function (fromPid, toPid, res, n) {
  n = Math.max(1, Math.floor(n || 1)); let k = 0, last = null;
  for (let i = 0; i < n; i++) { const r = E.act.route(fromPid, toPid, res); if (!r || !r.ok) { last = r; break; } k++; }
  if (!k) return last || { ok: false, msg: 'No trader sent' };
  return { ok: true, n: k };
};

// register the new v1.9 commands with the E.sync command path like every other player action
for (const k of ['skip', 'skipAll', 'routeMany']) { E.actRaw[k] = E.act[k]; E.act[k] = function () { if (E._inStep || E._applying || !E.state) return E.actRaw[k].apply(null, arguments); return E.sync.submit(k, Array.prototype.slice.call(arguments)); }; }

// ---- item 17: huge battles skip the live animation (the fight itself is unchanged) ----
E.BATTLE_ANIM_MAX = 400; // units (ships + troops + defences) on the field
E.battleUnits = function (b) { return b ? (b.units ? b.units.length : 0) : 0; };
E.battleAnimated = function (b) { return E.battleUnits(b) <= E.BATTLE_ANIM_MAX; };

// ---- save migration v1.8 → v1.9 ----
E.migrate19 = function (st) {
  // item 1: cargo is gone — refund whatever is aboard to its owner's stock, deliveries become idle
  for (const f of st.fleets || []) {
    if (f.cargo) { const e = st.emp && st.emp[f.owner]; if (e) for (const k of E.RES) e.res[k] = (e.res[k] || 0) + (f.cargo[k] || 0); }
    delete f.cargo; delete f.deliverHops;
    if (f.order === 'deliver') f.order = 'idle';
  }
  st.stats = st.stats || {};
  return st;
};

})();
