// Galaxies of Empires — simulation: economy, queues, fleets, battles, invasions, trade, AI, crisis
'use strict';
(function () {
const E = window.EOG;
const R = () => E.srand(); // v1.8: seeded, saved RNG
E.listeners = {};
E.on = (ev, fn) => { (E.listeners[ev] = E.listeners[ev] || []).push(fn); };
E.emit = (ev, d) => { if (E._quiet) return; (E.listeners[ev] || []).forEach(fn => { try { fn(d); } catch (e) { console.error(e); } }); };
E.toast = (msg, kind, sys) => E.emit('toast', { msg, kind: kind || 'info', sys });

// v2.1 item 8: ids that arrive as strings (DOM data attributes, JSON) still find their fleet
E.fleetById = id => { const F = E.state.fleets; for (let i = 0; i < F.length; i++) if (F[i].id === id) return F[i]; if (typeof id === 'string' && id !== '' && !isNaN(+id)) { const n = +id; for (let i = 0; i < F.length; i++) if (F[i].id === n) return F[i]; } return undefined; };
E.routeById = id => E.state.routes.find(r => r.id === id);
E.battleAt = sys => E.state.battles.find(b => b.sys === sys && !b.done);
E.fleetsAt = (sys, owner) => E.state.fleets.filter(f => f.sys === sys && !f.path.length && f.ships.length && (!owner || f.owner === owner));

// ---------- resources ----------
E.canAfford = function (owner, cost, n) {
  n = n || 1; const r = E.state.emp[owner].res;
  for (const k in cost) if ((r[k] || 0) < cost[k] * n - 1e-6) return false;
  return true;
};
E.pay = function (owner, cost, n) { n = n || 1; const r = E.state.emp[owner].res; for (const k in cost) r[k] -= cost[k] * n; };
E.refund = function (owner, cost, n, frac) { n = n || 1; frac = frac == null ? 1 : frac; const r = E.state.emp[owner].res; for (const k in cost) r[k] += cost[k] * n * frac; };
E.missing = function (owner, cost, n) {
  n = n || 1; const r = E.state.emp[owner].res, o = [];
  for (const k in cost) if ((r[k] || 0) < cost[k] * n) o.push(E.RES_ICON[k] + ' ' + E.fmt(cost[k] * n - r[k]));
  return o.join(' ');
};
E.shipCost = function (p, h) {
  const c = E.HULLS[h].cost, o = {}; const f = p && E.hasSpec(p, 'production') ? 0.85 : 1;
  for (const k in c) o[k] = Math.round(c[k] * f);
  return o;
};

// ---------- actions (shared by player & AI) ----------
const act = E.act = {};
function fail(msg) { return { ok: false, msg }; }
const OK = { ok: true };

act.build = function (pid, slot, b) {
  const st = E.state, p = st.planets[pid]; if (!p) return fail('No planet');
  const o = p.owner; if (o === 'neutral' || o === 'crisis') return fail('Not yours');
  if (slot >= E.planetSlots(p)) return fail('Slot locked');
  const s = p.slots[slot];
  const type = s.b || b; if (!type) return fail('Pick a building');
  const queued = p.queues.build.filter(q => q.slot === slot).length;
  if (!s.b && queued === 0) {
    if (!b) return fail('Pick a building');
    const B = E.BUILDINGS[b]; if (!B) return fail('Unknown building');
    // v1.3: extractors, power plants, shipyards and barracks may be built several times; the rest once per planet
    if (!B.multi && (E.bCount(p, b) || p.queues.build.some(q => !p.slots[q.slot].b && q.b === b))) return fail('Only one ' + B.name + ' per planet');
  }
  const lvl = s.lvl + queued + 1;
  if (lvl > E.BUILD_MAX_LVL) return fail('Max level');
  if (o === 'player' && E.hqCap && lvl > E.hqCap('player')) return fail('Headquarters Lv' + E.hqLevel('player') + ' caps buildings at Lv' + E.hqCap('player') + ' — spend research points at the HQ'); // v2.1 item 2
  if (p.queues.build.length >= 3) return fail('Build queue full (3)');
  const eNeed = E.BUILDINGS[type].energy || 0;
  if (eNeed && E.energyUsed(p, true) + eNeed > E.energyMax(p)) return fail('Not enough energy (' + E.energyUsed(p, true) + '/' + E.energyMax(p) + ' ⚡) — build or upgrade a Power Plant');
  const cost = E.bCost(type, lvl, o);
  if (!E.canAfford(o, cost)) return fail('Need ' + E.missing(o, cost));
  E.pay(o, cost);
  const tt = E.bTime(type, lvl, o);
  p.queues.build.push({ slot, b: type, lvl, total: tt, left: tt, cost });
  if (o === 'player') E.emit('sfx', 'click');
  return OK;
};

// v1.3: demolish a building (frees the slot, refunds part of what all its levels cost)
E.demolishRefund = function (p, slot) {
  const s = p.slots[slot]; if (!s || !s.b) return {};
  const o = {}; for (let l = 1; l <= s.lvl; l++) { const c = E.bCost(s.b, l, p.owner); for (const k in c) o[k] = (o[k] || 0) + c[k]; }
  for (const k in o) o[k] = Math.floor(o[k] * E.DEMOLISH_REFUND); return o;
};
act.demolish = function (pid, slot) {
  const st = E.state, p = st.planets[pid]; if (!p) return fail('No planet');
  if (p.owner === 'neutral' || p.owner === 'crisis') return fail('Not yours');
  const s = p.slots[slot]; if (!s || !s.b) return fail('Nothing to demolish');
  if (p.queues.build.some(q => q.slot === slot)) return fail('Cancel the queued upgrade first');
  if (s.b === 'plant') { const after = E.energyMax(p) - Math.round(s.lvl * E.ENERGY_PER_PLANT * (E.has(p.owner, 'e2') ? 1.25 : 1)); if (E.energyUsed(p, true) > after) return fail('Other buildings need this power — demolish them first'); }
  const ref = E.demolishRefund(p, slot), name = E.BUILDINGS[s.b].name;
  for (const k in ref) st.emp[p.owner].res[k] += ref[k];
  const wasProd = s.b === 'shipyard' || s.b === 'barracks'; s.b = null; s.lvl = 0; if (wasProd) E.retimeProd(p);
  if (p.owner === 'player') { E.emit('sfx', 'click'); E.addLog(name + ' demolished on ' + p.name, 'info', p.sys); }
  return { ok: true, refund: ref };
};

act.defense = function (pid, d) {
  const p = E.state.planets[pid], o = p.owner;
  if (o === 'neutral' || o === 'crisis') return fail('Not yours');
  const queued = p.queues.def.filter(q => q.d === d).length;
  const next = p.def[d] + queued + 1;
  if (next > E.defCap(p, d)) return fail('At cap');
  if (d === 'station' && E.bLevel(p, 'shipyard') < 4) return fail('Needs Shipyard 4');
  if (p.queues.def.length >= 3) return fail('Defense queue full (3)');
  const cost = E.defCost(d, next);
  if (!E.canAfford(o, cost)) return fail('Need ' + E.missing(o, cost));
  E.pay(o, cost);
  const tt = E.defTime(d, next, o);
  p.queues.def.push({ d, total: tt, left: tt, cost });
  if (o === 'player') E.emit('sfx', 'click');
  return OK;
};

act.ship = function (pid, h, n) {
  n = n || 1;
  const p = E.state.planets[pid], o = p.owner, H = E.HULLS[h];
  const yard = E.bLevel(p, 'shipyard');
  if (!yard) return fail('Needs a Shipyard');
  if (!(n >= 1)) return fail('Pick how many');
  if (yard < H.yard) return fail('Needs Shipyard ' + H.yard);
  if (H.tech && !E.has(o, H.tech)) return fail('Research ' + E.TECH_BY_ID[H.tech].name);
  if (p.queues.ship.length >= 5) return fail('Ship queue full (5)');
  if (H.ownCap && E.ownedHull(o, h) + n > H.ownCap) return fail(H.name + ' cap: ' + E.ownedHull(o, h) + '/' + H.ownCap + ' owned or queued');
  const cost = E.shipCost(p, h);
  if (!E.canAfford(o, cost, n)) return fail('Need ' + E.missing(o, cost, n));
  E.pay(o, cost, n);
  const each = H.time * E.TIME_MUL / E.yardSpeed(p);
  p.queues.ship.push({ h, n, total: each, left: each, cost, fit: E.state.emp[o].designs[h].slice() });
  if (o === 'player') E.emit('sfx', 'click');
  return OK;
};
// v1.3: several shipyards/barracks stack with diminishing returns (each extra copy counts 85% of the one before)
// v1.5: every Shipyard / Barracks on a planet stacks its full level bonus (no diminishing returns)
// v1.8 item 7: production speeds up strongly with total shipyard / barracks levels (quadratic term), so late-game piles can be spent
E.prodCurve = function (sum, base, lin, quad) { return base + lin * sum + quad * sum * sum; };
E.yardSpeed = function (p) { return E.prodCurve(E.bSum(p, 'shipyard'), 0.85, 0.15, 0.045) * (E.ptype(p).shipSpeed || 1) * (E.hasSpec(p, 'production') ? 1.3 : 1) * (p.owner === 'player' && E.hqMul ? E.hqMul('shipBuild') : 1); };
// v1.9 item 7: when shipyard/barracks levels change, every queued ship/troop batch on the planet is re-timed at
// the new speed at once (the unit in progress keeps its completed share)
E.retimeProd = function (p) {
  const ys = E.yardSpeed(p), ts = E.troopSpeed(p);
  for (const q of p.queues.ship) { const nt = E.HULLS[q.h].time * E.TIME_MUL / ys; if (!(q.total > 0)) { q.total = q.left = nt; continue; } const frac = q.left / q.total; q.total = nt; q.left = nt * frac; }
  for (const q of p.queues.troop) { const nt = E.TROOPS[q.tr].time * E.TIME_MUL / ts; if (!(q.total > 0)) { q.total = q.left = nt; continue; } const frac = q.left / q.total; q.total = nt; q.left = nt * frac; }
};
E.troopSpeed = function (p) { return E.prodCurve(E.bSum(p, 'barracks'), 0.88, 0.12, 0.05) * (E.ptype(p).troopSpeed || 1) * (E.hasSpec(p, 'production') ? 1.3 : 1); };
// Slider maxima: how many of a hull / troops can be queued right now with resources (and garrison room)
E.maxAfford = function (owner, cost) { const r = E.state.emp[owner].res; let n = Infinity; for (const k in cost) if (cost[k] > 0) n = Math.min(n, Math.floor((r[k] || 0) / cost[k])); return isFinite(n) ? Math.max(0, n) : 0; };
// v2.1 item 7: no Freighter ownership cap any more. AIs still keep their Freighter count in proportion to their empire
// (10, plus 1 per world above 10) so a big AI doesn't swap every landing for 20 000-HP hulls at once.
E.aiFreighterLimit = function (owner) { let n = 0; for (const p of E.state.planets) if (p.owner === owner) n++; return Math.max(10, n); };
E.maxShips = function (p, h) { const H = E.HULLS[h], a = E.maxAfford(p.owner, E.shipCost(p, h)); return H.ownCap ? Math.max(0, Math.min(a, H.ownCap - E.ownedHull(p.owner, h))) : a; };
// v1.9 item 14: ships of hull h an empire owns (in fleets) plus ones queued at its shipyards
E.ownedHull = function (owner, h) { const st = E.state; let n = 0; for (const f of st.fleets) if (f.owner === owner) for (const s of f.ships) if (s.h === h) n++; for (const p of st.planets) if (p.owner === owner) for (const q of p.queues.ship) if (q.h === h) n += q.n; return n; };
E.troopRoom = function (p) { const queued = p.queues.troop.reduce((a, q) => a + q.n * E.TROOPS[q.tr].size, 0); return Math.max(0, E.garrisonCap(p) - E.troopSize(p.garrison) - queued); };
E.maxTroops = function (p, tr) { tr = tr || 'inf'; return Math.min(Math.floor(E.troopRoom(p) / E.TROOPS[tr].size), E.maxAfford(p.owner, E.TROOPS[tr].cost)); };

act.troop = function (pid, tr, n) {
  n = n || 1;
  const p = E.state.planets[pid], o = p.owner, T = E.TROOPS[tr];
  const b = E.bLevel(p, 'barracks');
  if (!b) return fail('Needs Barracks');
  if (!(n >= 1)) return fail('Pick how many');
  if (b < T.barracks) return fail('Needs Barracks ' + T.barracks);
  const queuedSize = p.queues.troop.reduce((a, q) => a + q.n * E.TROOPS[q.tr].size, 0);
  if (E.troopSize(p.garrison) + queuedSize + n * T.size > E.garrisonCap(p)) return fail('Garrison full (' + E.garrisonCap(p) + ')');
  if (p.queues.troop.length >= 5) return fail('Training queue full (5)');
  if (!E.canAfford(o, T.cost, n)) return fail('Need ' + E.missing(o, T.cost, n));
  E.pay(o, T.cost, n);
  const each = T.time * E.TIME_MUL / E.troopSpeed(p);
  p.queues.troop.push({ tr, n, total: each, left: each, cost: T.cost });
  if (o === 'player') E.emit('sfx', 'click');
  return OK;
};

act.cancel = function (pid, qn, idx) {
  const p = E.state.planets[pid], q = p.queues[qn][idx]; if (!q) return fail('none');
  if (qn === 'build' && p.queues.build.some((o, i) => i > idx && o.slot === q.slot)) return fail('Cancel the later upgrade first');
  if (qn === 'def' && p.queues.def.some((o, i) => i > idx && o.d === q.d)) return fail('Cancel the later one first');
  p.queues[qn].splice(idx, 1);
  E.refund(p.owner, q.cost, q.n || 1, 0.9);
  return OK;
};

act.spec = function (pid, sp) {
  const p = E.state.planets[pid], o = p.owner;
  if (p.spec === sp) return fail('Already');
  if (p.spec) { const c = { metal: 300 }; if (!E.canAfford(o, c)) return fail('Changing costs 300 metal'); E.pay(o, c); }
  p.spec = sp; if (o === 'player') { E.emit('sfx', 'build'); E.addLog(p.name + ' specialised as ' + E.SPECS[sp].name, 'good', p.sys); }
  return OK;
};

act.research = function (id) {
  const em = E.state.emp.player, t = E.TECH_BY_ID[id];
  if (em.techs[id]) return fail('Known');
  if (t.tier > 0) { const prev = E.TECHS.find(x => x.br === t.br && x.tier === t.tier - 1); if (!em.techs[prev.id]) return fail('Requires ' + prev.name); }
  if (em.research && em.research !== id) { /* switch: keep progress pooled */ }
  const rc = { crystal: t.crystal || 0 };
  if (rc.crystal && !em.researchPaid?.[id]) { if (!E.canAfford('player', rc)) return fail('Needs ' + E.missing('player', rc)); E.pay('player', rc); em.researchPaid = em.researchPaid || {}; em.researchPaid[id] = 1; }
  em.research = id; em.rpProg = em.rpProg || {};
  E.emit('sfx', 'click');
  return OK;
};

act.market = function () { return fail('The credit market closed in v1.3 — use the Trade Center to swap metal and crystal'); };

// Trade Center: swap one resource for another. Rate (give:get) improves with the best Trade Center level you own.
E.tradeCenterLevel = function (owner) { owner = owner || 'player'; let L = 0; for (const p of E.state.planets) if (p.owner === owner) L = Math.max(L, E.bLevel(p, 'tradeport')); return L; };
// v1.3: metal ↔ crystal only. 2.5 : 1 at Lv1 down to 1.4 : 1 at Lv10; Market Algorithms (e7) and a Trade-bonus world with a Trade Center improve it.
E.swapRate = function (lvl, owner) {
  owner = owner || 'player'; if (lvl == null) lvl = E.tradeCenterLevel(owner); if (!lvl) return null;
  let r = 2.5 - (Math.min(10, lvl) - 1) * (1.1 / 9) - Math.max(0, Math.min(15, lvl) - 10) * 0.05; // v1.6: Lv11–15 keep improving to 1.15
  if (E.has(owner, 'e7')) r /= 1.2;
  if (E.state.planets.some(p => p.owner === owner && E.hasSpec(p, 'trade') && E.bLevel(p, 'tradeport'))) r /= 1.1;
  return +Math.max(1.05, r).toFixed(2);
};
act.swap = function (from, to, amount) {
  const em = E.state.emp.player; amount = Math.floor(amount);
  if (from === to || !E.RES.includes(from) || !E.RES.includes(to)) return fail('Swap metal for crystal or crystal for metal');
  const rate = E.swapRate(); if (!rate) return fail('Build a Trade Center first');
  if (!(amount > 0)) return fail('Nothing to swap');
  if (em.res[from] < amount) return fail('Not enough ' + E.RES_NAME[from]);
  const got = Math.floor(amount / rate);
  em.res[from] -= amount; em.res[to] += got;
  E.emit('sfx', 'click');
  return { ok: true, got, rate };
};

// ---------- v1.2 send flow: many fleets, one target, one action, arrival-speed control and Sync arrival ----------
E.SEND_ACTIONS = {
  attack:   { name: 'Attack',        icon: '⚔', desc: 'Destroy defenders and blockade. No landing. Always allowed on a front-line target.' },
  invade:   { name: 'Invade',        icon: '🪖', desc: 'Fight for orbit, then land the troops your Transports carry. Load troops first.' },
  relocate: { name: 'Relocate',      icon: '⇄', desc: 'Move to one of your planets and stay there.' },
  colonize: { name: 'Colonize',      icon: '🏳', desc: 'Settle an independent world. No troops needed: clear its orbit and the colony joins you after a short survey (troops aboard speed it up and fight its militia).' },
  raze:     { name: 'Raze',          icon: '🔥', desc: 'Land troops to wipe out an enemy colony — it becomes an empty independent world. Works even at your system cap.' },
};
// Which actions make sense against this target, for these fleets? → { key: '' (ok) | 'reason' }
E.sendActionsFor = function (fids, sys, opts) {
  const st = E.state, p = E.sysPlanet(sys), fs = fids.map(E.fleetById).filter(Boolean);
  const own = p && p.owner === 'player', neutral = p && p.owner === 'neutral', rift = !p;
  const peacefulFriend = p && E.isPeaceful(p.owner) && !st.emp[p.owner].war;
  const cap = fs.reduce((a, f) => a + E.fleetStats(f).cap, 0);
  const armed = fs.some(f => E.fleetArmed(f));
  // v1.3: troops must already be aboard (load them on the fleet panel or in the send flow's Load step)
  const loaded = (opts && opts.load) || {};
  const troopsAboard = fs.reduce((a, f) => a + E.troopCount(f.troops) + (loaded[f.id] || 0), 0);
  // v1.3: front-line rule — the target must be reachable without passing through enemy worlds
  const reach = fs.filter(f => !E.targetBlock(f.owner, f.path.length ? f.path[0] : f.sys, sys));
  const block = reach.length ? '' : (fs.length ? E.targetBlock('player', fs[0].path.length ? fs[0].path[0] : fs[0].sys, sys) : 'Pick a fleet');
  const out = {};
  const allyP = p && E.isAlly(p.owner);
  const capMsg = E.atSysCap() ? 'System cap reached (' + E.sysCount() + '/' + E.sysCap() + ') — level up your Commander, abandon a world, or Raze instead' : '';
  out.attack = own ? 'That is your planet' : allyP ? 'That is your ally' : block || (!armed ? 'Needs warships' : '');
  out.invade = own || rift ? 'Pick an enemy planet' : allyP ? 'That is your ally' : neutral ? 'Use Colonize for independent worlds' : block || (!cap ? 'Needs Transports' : !troopsAboard ? 'Load troops first' : capMsg);
  out.raze = own || rift || neutral || allyP ? 'Only enemy colonies' : block || (!cap ? 'Needs Transports' : !troopsAboard ? 'Load troops first' : '');
  out.relocate = own ? block : 'Only to your own planets';
  // v1.5: Colonize needs no troops (any ships can settle once orbit is clear); Invade still needs troops aboard
  out.colonize = !neutral ? 'Only independent worlds' : block || (!fs.length ? 'Pick a fleet' : capMsg);
  return out;
};
// ETA preview: base = full-speed time to target; eta = with the arrival-speed slider and optional sync.
E.sendPreview = function (fids, sys, speed, sync) {
  speed = E.clamp(speed == null ? 1 : speed, 0.25, 1);
  const rows = fids.map(id => E.fleetById(id)).filter(Boolean).map(f => ({ f, fid: f.id, base: E.etaTo(f, sys) }));
  const reach = rows.filter(r => isFinite(r.base));
  const T = reach.length ? Math.max(...reach.map(r => r.base)) / speed : 0;
  for (const r of rows) {
    if (!isFinite(r.base)) { r.mul = 1; r.eta = Infinity; continue; }
    if (r.base === 0) { r.mul = 1; r.eta = 0; continue; }
    r.mul = sync ? E.clamp(r.base / T, 0.25, 1) : speed;
    r.eta = r.base / r.mul;
  }
  return { rows, T: sync ? Math.max(0, ...rows.filter(r => isFinite(r.eta)).map(r => r.eta)) : null, speed };
};
act.send = function (fids, sys, action, opts) {
  opts = opts || {};
  const st = E.state, p = E.sysPlanet(sys);
  fids = (fids || []).filter(id => { const f = E.fleetById(id); return f && f.owner === 'player' && f.ships.length; });
  if (!fids.length) return fail('Pick at least one fleet');
  if (!E.SEND_ACTIONS[action]) return fail('Pick an action');
  const why = E.sendActionsFor(fids, sys, opts)[action]; if (why) return fail(why);
  // optional Load step: { fid: n } troops to take aboard from the docked garrison first
  if (opts.load) for (const id in opts.load) if (opts.load[id] > 0) act.load(isNaN(+id) ? id : +id, opts.load[id]);
  const pv = E.sendPreview(fids, sys, opts.speed, opts.sync);
  const order = { attack: 'siege', invade: 'attack', relocate: 'relocate', colonize: 'attack', raze: 'attack' }[action];
  const out = []; const q = E._quiet;
  for (const r of pv.rows) {
    const f = r.f; if (!isFinite(r.eta)) continue;
    f.raze = action === 'raze'; f.colonize = action === 'colonize';
    if (f.rallyTo != null) clearRally(f); // v2.1 item 8
    if (f.sys === sys && !f.path.length) { f.order = order === 'relocate' ? 'idle' : order; f.target = sys; out.push({ fid: f.id, eta: 0 }); continue; }
    E._quiet = true; const res = act.move(f.id, sys, order); E._quiet = q;
    if (!res.ok) continue;
    f.speedMul = r.mul;
    out.push({ fid: f.id, eta: E.fleetETA(f) });
  }
  if (!out.length) return fail('No fleet could be sent');
  E.emit('sfx', 'launch');
  return { ok: true, n: out.length, fleets: out, eta: Math.max(...out.map(o => o.eta)) };
};
// v1.9 item 1: cargo is gone. Any cargo still aboard an old save's fleet goes back into its owner's stock.
function deliverCargo(f) {
  const st = E.state, c = f.cargo; if (f.order === 'deliver') f.order = 'idle'; f.cargo = null; delete f.deliverHops;
  if (c && st.emp[f.owner]) for (const k of E.RES) st.emp[f.owner].res[k] += c[k] || 0;
}
E.deliverCargo = deliverCargo;

// fleet actions
act.split = function (fid, counts, name) {
  const f = E.fleetById(fid); if (!f || f.path.length) return fail('Fleet must be docked');
  const nf = E.makeFleet(f.owner, f.sys, name || null);
  for (const h in counts) {
    let n = counts[h];
    for (let i = f.ships.length - 1; i >= 0 && n > 0; i--) if (f.ships[i].h === h) { nf.ships.push(f.ships.splice(i, 1)[0]); n--; }
  }
  if (!nf.ships.length) { E.state.fleets.splice(E.state.fleets.indexOf(nf), 1); return fail('No ships picked'); }
  // move troops that no longer fit
  rebalanceTroops(f, nf);
  E.cleanupFleets();
  return { ok: true, fleet: nf };
};
function rebalanceTroops(a, b) {
  const capA = E.fleetStats(a).cap;
  for (const k of E.TROOP_KEYS) {
    while (E.troopSize(a.troops) > capA && a.troops[k] > 0) { a.troops[k]--; b.troops[k]++; }
  }
  const capB = E.fleetStats(b).cap;
  if (E.troopSize(b.troops) > capB) clampTroops(b);
}
function clampTroops(f) {
  const cap = E.fleetStats(f).cap; let lost = 0;
  for (const k of E.TROOP_KEYS) while (E.troopSize(f.troops) > cap && f.troops[k] > 0) { f.troops[k]--; lost++; }
  return lost;
}
E.clampTroops = clampTroops;
act.merge = function (fids) {
  const fs = fids.map(E.fleetById).filter(Boolean);
  if (fs.length < 2) return fail('Pick 2+ fleets');
  const a = fs[0];
  for (const f of fs.slice(1)) {
    if (f.sys !== a.sys || f.path.length || a.path.length || f.owner !== a.owner) return fail('Fleets must be docked together');
  }
  // v2.5: if any merged fleet was forming a rally at this system, keep that rally on the surviving fleet
  // (previously merge dropped rallyTo and the ships just garrisoned).
  const rallySrc = fs.find(f => f.rallyTo != null);
  for (const f of fs.slice(1)) { a.ships.push(...f.ships); f.ships = []; for (const k of E.TROOP_KEYS) { a.troops[k] += f.troops[k]; f.troops[k] = 0; } if (f.routeId && !a.routeId) { a.routeId = f.routeId; } }
  if (rallySrc && a.rallyTo == null) {
    a.rallyTo = rallySrc.rallyTo; a.rallyFrom = rallySrc.rallyFrom;
    a.rallyT0 = rallySrc.rallyT0 != null ? rallySrc.rallyT0 : a.rallyT0;
    a.rallyT = rallySrc.rallyT != null ? rallySrc.rallyT : a.rallyT;
  }
  E.cleanupFleets();
  return OK;
};
function clearRally(f) { f.rallyTo = null; f.rallyFrom = null; if (f.owner === 'player' && /^Rally → /.test(f.name || '') && E.newFleetName) f.name = E.newFleetName(); }
E.clearRally = clearRally;
act.move = function (fid, target, order) {
  const st = E.state, f = E.fleetById(fid); if (!f) return fail('No fleet');
  if (f.sys === target && !f.path.length) { f.order = order || 'idle'; f.target = target; if (!E._rallyMove && f.rallyTo != null) clearRally(f); return OK; }
  const from = f.path.length ? f.path[0] : f.sys;
  if (f.path.length) { // reroute from next node; keep progress
    const fb = order === 'retreat' || order === 'return';
    const p2 = E.pathFor(f.owner, f.path[0], target) || (fb ? E.path(f.path[0], target) : null); if (!p2) return fail(E.targetBlock(f.owner, f.path[0], target) || 'No route');
    f.path = [f.path[0], ...p2];
  } else {
    const p = E.pathFor(f.owner, f.sys, target) || ((order === 'retreat' || order === 'return') ? E.path(f.sys, target) : null);
    if (!p) { const w = wallOnRoute(f, f.sys, target, order); if (w != null) return act.move(fid, w, order); return fail(E.targetBlock(f.owner, f.sys, target) || 'No route'); }
    if (order !== 'return' && order !== 'retreat') f.origin = f.sys; // v1.7: where Recall brings it back to
    f.path = p; f.prog = 0;
    E.leaveBattle(f);
  }
  f.order = order || 'move'; f.target = target;
  f.routeId = null;
  if (!E._rallyMove && f.rallyTo != null) clearRally(f); // v2.1 item 8: a new order ends the rally — the fleet is no longer pulled back to the rally point
  if (order !== 'patrol') f.patrol = null;
  const tp = E.sysPlanet(target);
  if (f.owner === 'player' && tp && E.isPeaceful(tp.owner) && (order === 'attack' || order === 'siege') && !st.emp[tp.owner].war) {
    const nm = E.FACTIONS[tp.owner].name;
    st.emp[tp.owner].war = true; E.addLog('War declared on the ' + nm + '! Their trade routes close.', 'bad', target); E.toast('War with the ' + nm + '!', 'bad');
    E.cancelRoutesTo(tp.owner);
  }
  if (f.owner === 'player') E.emit('sfx', 'launch');
  return OK;
};
// v1.5: your worlds are a wall. An enemy that can't get past them to its real target attacks the first world in the way.
function wallOnRoute(f, from, target, order) {
  if (f.owner === 'player' || E.isAlly(f.owner) || (order !== 'attack' && order !== 'siege')) return null;
  const raw = E.path(from, target); if (!raw) return null;
  const w = raw.find(v => v !== target && E.blocksPassage(f.owner, v));
  return w == null ? null : w;
}
act.patrol = function (fid, target) {
  const f = E.fleetById(fid); if (!f || f.path.length) return fail('Dock first');
  const a = f.sys; const r = act.move(fid, target, 'patrol'); if (!r.ok) return r;
  f.patrol = [a, target]; f.patrolWait = 0;
  return OK;
};
act.retreat = function (fid) {
  const f = E.fleetById(fid); if (!f) return fail('No fleet');
  const dest = E.nearestFriendly(f.owner, f.path.length ? f.path[0] : f.sys);
  if (dest == null) return fail('Nowhere to go');
  if (dest === f.sys && !f.path.length) { E.leaveBattle(f); f.order = 'idle'; return OK; }
  return act.move(fid, dest, 'retreat');
};
act.load = function (fid, n) {
  if (n == null) n = Infinity;
  const f = E.fleetById(fid); if (!f || f.path.length) return fail('Dock first');
  const p = E.sysPlanet(f.sys); if (!p || p.owner !== f.owner) return fail('Must be at your planet');
  const cap = E.fleetStats(f).cap; if (!cap) return fail('No Transports in this fleet');
  let moved = 0;
  for (const k of E.TROOP_KEYS) {
    const sz = E.TROOPS[k].size;
    while (moved < n && p.garrison[k] > 0 && E.troopSize(f.troops) + sz <= cap) { p.garrison[k]--; f.troops[k]++; moved++; }
  }
  if (!moved) return fail(E.troopCount(p.garrison) ? 'Transports full' : 'No troops in garrison');
  E.emit('sfx', 'click');
  return { ok: true, moved };
};
// How many troops this fleet could take aboard right now (slider max)
E.loadMax = function (f) {
  if (!f || f.path.length) return 0; const p = E.sysPlanet(f.sys); if (!p || p.owner !== f.owner) return 0;
  const room = E.fleetStats(f).cap - E.troopSize(f.troops); return Math.max(0, Math.min(E.troopCount(p.garrison), Math.floor(room)));
};
act.unload = function (fid) {
  const f = E.fleetById(fid); if (!f || f.path.length) return fail('Dock first');
  const p = E.sysPlanet(f.sys); if (!p || p.owner !== f.owner) return fail('Must be at your planet');
  let moved = 0; const cap = E.garrisonCap(p);
  for (const k of E.TROOP_KEYS) while (f.troops[k] > 0 && E.troopSize(p.garrison) + E.TROOPS[k].size <= cap) { f.troops[k]--; p.garrison[k]++; moved++; }
  if (!moved) return fail('Garrison full or nothing to unload');
  return { ok: true, moved };
};
act.rename = function (fid, name) { const f = E.fleetById(fid); if (f) f.name = String(name).slice(0, 18); return OK; };

// trade
E.routeHopsPath = function (r) { const a = E.state.planets[r.from].sys, b = E.state.planets[r.to].sys; return E.tradePath(a, b) || []; };
E.TRADE_BASE = 10; E.TRADE_HOP = 7; E.TRADE_PORT_FROM = 0.35; E.TRADE_PORT_TO = 0.15; E.TRADE_NET = 0.012;
E.routeIncome = function (fromP, toP, routesFrom) {
  const path = E.tradePath(fromP.sys, toP.sys) || []; const hops = path.length;
  const port = E.bLevel(fromP, 'tradeport');
  let v = (E.TRADE_BASE + E.TRADE_HOP * hops) * (1 + E.TRADE_PORT_FROM * (port - 1));
  if (toP.owner !== fromP.owner) v *= 1.6; else v *= 1 + E.TRADE_PORT_TO * E.bLevel(toP, 'tradeport');
  if (toP.owner === 'trader') v *= 1.25; else if (E.isPeaceful(toP.owner)) v *= 1.15;
  if (E.hasSpec(fromP, 'trade')) v *= 1.5;
  if (E.hasSpec(toP, 'trade') && toP.owner === fromP.owner) v *= 1.2;
  if (E.has(fromP.owner, 'e5')) v *= 1.3;
  v *= E.spBonus(fromP.owner, 'trade'); // v1.8 species
  v *= (E.ptype(fromP).trade || 1);
  // v1.7: network bonus — every other active route out of this world adds +1.2% to each route (38 slots ≈ +44%)
  const n = routesFrom != null ? routesFrom : (E.state ? E.state.routes.reduce((a, r) => a + (r.from === fromP.id ? 1 : 0), 0) : 0);
  v *= 1 + E.TRADE_NET * Math.max(0, n - 1);
  return v / E.TIME_MUL; // trade value per minute (paid as ROUTE_METAL× metal + ROUTE_CRYSTAL× crystal)
};
E.validTradeTarget = function (fromP, toP) {
  if (!toP || toP.id === fromP.id) return false;
  // v1.5: routes only link your own planets that both have a Trade Center (no independents, allies or rivals)
  return toP.owner === fromP.owner && E.bLevel(toP, 'tradeport') > 0;
};
act.route = function (fromPid, toPid, res) {
  const st = E.state, a = st.planets[fromPid], b = st.planets[toPid];
  if (a.owner !== 'player') return fail('Not your planet');
  if (!E.bLevel(a, 'tradeport')) return fail('Needs a Trade Center');
  const n = st.routes.filter(r => r.from === fromPid).length;
  if (n >= E.routeCap(a)) return fail('All ' + E.routeCap(a) + ' trader slots in use — upgrade or add a Trade Center');
  if (!E.validTradeTarget(a, b)) return fail(b && b.owner === 'player' ? 'That world needs its own Trade Center' : 'Routes only run between your own Trade Center worlds');
  // v1.5: several traders may share one lane (each fills a trader slot)
  // consume a docked trade freighter
  // prefer an idle Transport carrying no troops (never strip the lift from an invasion fleet)
  // v1.3: routes are run by Traders (v1.7: no escorts — trade ships are untouchable)
  const f = E.fleetsAt(a.sys, 'player').find(f => !f.routeId && f.ships.some(s => s.h === 'trader'));
  if (f) { const i = f.ships.findIndex(s => s.h === 'trader'); f.ships.splice(i, 1); }
  else { const c = { crystal: E.HULLS.trader.cost.crystal }; if (!E.canAfford('player', c)) return fail('Needs a Trader docked at ' + a.name + ' (or ' + c.crystal + ' crystal to charter one)'); E.pay('player', c); }
  st.routes.push({ id: E.id(), from: fromPid, to: toPid, ship: true, prog: 0, dir: 1, blocked: null, earned: 0, res: res === 'crystal' ? 'crystal' : 'metal' });
  E.cleanupFleets();
  E.addLog('Trade route opened: ' + a.name + ' → ' + b.name, 'good', a.sys);
  E.emit('sfx', 'build');
  return OK;
};
// v1.4: each route pays one resource; switch it any time
act.routeRes = function (rid, res) { const r = E.routeById(rid); if (!r) return fail('?'); if (res !== 'metal' && res !== 'crystal') return fail('Pick metal or crystal'); r.res = res; return OK; };
E.routeYield = function (r, inc) { const k = r.res === 'crystal' ? 'crystal' : 'metal'; return { k, n: inc * (k === 'crystal' ? E.ROUTE_CRYSTAL : E.ROUTE_METAL) }; };
act.cancelRoute = function (rid) {
  const st = E.state, r = E.routeById(rid); if (!r) return fail('?');
  st.routes.splice(st.routes.indexOf(r), 1);
  if (r.ship) { const p = st.planets[r.from]; if (p.owner === 'player') E.dockShip('player', p.sys, E.makeShip('player', 'trader')); }
  return OK;
};
act.replaceFreighter = function (rid) {
  const st = E.state, r = E.routeById(rid); if (!r || r.ship) return fail('?');
  const a = st.planets[r.from];
  // prefer an idle Transport carrying no troops (never strip the lift from an invasion fleet)
  const f = E.fleetsAt(a.sys, 'player').find(f => !f.routeId && f.ships.some(s => s.h === 'trader'));
  if (f) { f.ships.splice(f.ships.findIndex(s => s.h === 'trader'), 1); E.cleanupFleets(); }
  else { const c = { metal: 150 }; if (!E.canAfford('player', c)) return fail('Dock a Trader or pay 150 metal'); E.pay('player', c); }
  r.ship = true; r.prog = 0;
  return OK;
};
E.cancelRoutesTo = function (owner) {
  for (const r of E.state.routes.slice()) if (E.state.planets[r.to].owner === owner) act.cancelRoute(r.id);
};

// withdraw from battle
act.withdraw = function (bid, mode, uids) {
  const st = E.state, b = st.battles.find(x => x.id === bid); if (!b) return fail('No battle');
  const owner = 'player';
  const pulled = [];
  for (const fid of b.fleets) {
    const f = E.fleetById(fid); if (!f || f.owner !== owner) continue;
    const take = f.ships.filter(s => {
      if (mode === 'uids') return uids.includes(s.uid);
      const mx = E.shipStats(owner, s).hp; return s.hp / mx < 0.45;
    });
    if (take.length) pulled.push([f, take]);
  }
  if (!pulled.length) return fail(mode === 'uids' ? 'Select your ships first' : 'No badly damaged ships');
  const dest = E.nearestFriendly(owner, b.sys, true);
  let n = 0;
  for (const [f, take] of pulled) {
    const nf = E.makeFleet(owner, b.sys, owner === 'player' ? null : 'Withdrawn'); nf.withdrawn = true;
    for (const s of take) { f.ships.splice(f.ships.indexOf(s), 1); nf.ships.push(s); n++; }
    rebalanceTroops(f, nf);
    if (dest != null && dest !== b.sys) { nf.path = E.pathFor(nf.owner, b.sys, dest) || E.path(b.sys, dest) || []; nf.order = 'retreat'; nf.target = dest; }
    else nf.order = 'retreat';
    b.units = b.units.filter(u => !take.some(s => s.uid === u.uid));
  }
  E.cleanupFleets();
  E.emit('sfx', 'launch');
  return { ok: true, n };
};

E.nearestFriendly = function (owner, from, excludeFrom) {
  let best = null, bd = Infinity;
  for (const p of E.state.planets) {
    if (p.owner !== owner) continue; if (excludeFrom && p.sys === from && E.battleAt(from)) continue;
    if (p.sys === from) return from;
    const path = E.pathFor(owner, from, p.sys) || E.path(from, p.sys); if (!path) continue;
    const L = E.pathLen(from, path); if (L < bd) { bd = L; best = p.sys; }
  }
  return best;
};

E.dockShip = function (owner, sys, ship) {
  let f = E.state.fleets.find(f => f.owner === owner && f.sys === sys && !f.path.length && (f.order === 'idle' || f.guard) && !f.routeId && !f.wave && f.rallyTo == null && !f.withdrawn);
  if (!f) { f = E.makeFleet(owner, sys, owner === 'player' ? null : 'Guard'); f.guard = owner !== 'player'; }
  f.ships.push(ship);
  return f;
};

E.cleanupFleets = function () {
  const st = E.state;
  for (const f of st.fleets) {
    if (!f.ships.length) continue;
    if (E.troopSize(f.troops) > E.fleetStats(f).cap) clampTroops(f);
  }
  st.fleets = st.fleets.filter(f => f.ships.length > 0);
};

// ---------- step ----------
E.step = function (dt) {
  if (E.step29) return E.step29(dt);
  const st = E.state; if (!st || st.over && !st.continued) return;
  st.t += dt;
  economy(dt);
  queues(dt);
  moveFleets(dt);
  st._al = (st._al || 0) + dt;
  if (st._al >= 0.5) { scoutTick(); alertsTick(st._al); settleOrders(); st._al = 0; }
  st._bd = (st._bd || 0) + dt;
  if (st._bd >= 0.5) { detectBattles(); st._bd = 0; }
  let left = dt; const sub = st._ff ? 0.2 : 0.1;
  while (left > 1e-6) { const d = Math.min(sub, left); stepBattles(d); left -= d; }
  windowsTick(dt);
  sieges(dt);
  trade(dt);
  st._ai = (st._ai || 0) + dt;
  if (st._ai >= 2) { aiTick(st._ai); st._ai = 0; }
  waves();
  if (E.crisisTick27) E.crisisTick27(); else crisis();
  if (E.v14Tick) E.v14Tick(dt);
  if (E.v15Tick) E.v15Tick(dt);
  checkEnd();
};

// v1.7 (item 7): docked fleets bucketed by system once per call (was a scan of every fleet for every planet)
const NOF = [];
function dockedBySys() { const m = new Map(); for (const f of E.state.fleets) if (!f.path.length) { let a = m.get(f.sys); if (!a) m.set(f.sys, a = []); a.push(f); } return m; }
function economy(dt) {
  const st = E.state;
  const dk = dockedBySys();
  const caps = {};
  const inc = {};
  for (const f in st.emp) inc[f] = { metal: 0, crystal: 0, rp: 0 };
  for (const p of st.planets) {
    if (p.owner === 'neutral') continue;
    const pr = E.planetProd(p);
    const m = p.owner === 'player' ? 1 : E.DIFFICULTY[st.diff].aiEco;
    inc[p.owner].metal += pr.metal * m; inc[p.owner].crystal += pr.crystal * m; inc[p.owner].rp += pr.rp;
    // shields & mines
    const sm = E.shieldMax(st, p);
    const hostileHere = (dk.get(p.sys) || NOF).some(f => hostileToPlanet(f, p) && E.fleetArmed(f));
    if (!hostileHere && !E.battleAt(p.sys)) {
      p.shieldHp = Math.min(sm, p.shieldHp + sm * (E.has(p.owner, 'd8') ? 0.02 : 0.01) * dt * (E.dyingMul ? E.dyingMul(p.owner, 'regen') : 1)); // v2.2 item 3
      p.blockade = false;
    }
    if (p.shieldHp > sm) p.shieldHp = sm;
    p.mineCharge = Math.min(1, p.mineCharge + dt / (120 * E.TIME_MUL));
  }
  for (const f in inc) {
    const em = st.emp[f]; if (f === 'neutral') continue;
    const cap = E.storageCap(f) * (f === 'player' ? 1 : 2);
    for (const k of E.RES) { em.res[k] = Math.min(Math.max(cap, em.res[k]), em.res[k] + inc[f][k] / 60 * dt); }
    em.income = inc[f];
    if (f === 'player') {
      em.rp += inc[f].rp / 60 * dt;
      if (em.research) {
        const t = E.TECH_BY_ID[em.research];
        em.rpProg = em.rpProg || {};
        const need = t.cost - (em.rpProg[t.id] || 0);
        const use = Math.min(em.rp, need);
        em.rpProg[t.id] = (em.rpProg[t.id] || 0) + use; em.rp -= use;
        if (em.rpProg[t.id] >= t.cost - 1e-6) {
          em.techs[t.id] = true; em.research = null;
          E.addLog('Research complete: ' + t.name + ' — ' + t.desc, 'good');
          E.toast('🔬 ' + t.name + ' researched', 'good'); E.emit('sfx', 'build');
          // auto-queue next in branch
          const nx = E.TECHS.find(x => x.br === t.br && x.tier === t.tier + 1);
          if (nx && !nx.crystal) em.research = nx.id;
          E.state.planets.forEach(p => { if (p.owner === 'player') p.shieldHp = Math.min(p.shieldHp, E.shieldMax(st, p)); });
        }
      }
    }
  }
  // repairs & ship shield regen
  for (const f of st.fleets) {
    if (f.path.length || E.battleAt(f.sys)) continue;
    // v1.7: very large fleets repair in bigger, staggered chunks (same regen per second, far fewer per-ship passes)
    let dtf = dt;
    if (f.ships.length > 200) { const iv = Math.min(3, f.ships.length / 1500); f._rg = (f._rg == null ? R() * iv : f._rg) + dt; if (f._rg < iv) continue; dtf = f._rg; f._rg = 0; }
    const p = E.sysPlanet(f.sys);
    const docked = p && p.owner === f.owner;
    const memo = {}, rep = docked ? 0.008 * (E.has(f.owner, 'f9') ? 3 : 1) * dtf : 0; // v1.7: one stats lookup per design, not per ship
    for (const s of f.ships) {
      const ss = E.shipStatsM(f.owner, s, memo);
      s.sh = Math.min(ss.sh, s.sh + ss.sh * 0.05 * dtf);
      if (docked && s.hp < ss.hp) s.hp = Math.min(ss.hp, s.hp + ss.hp * rep);
    }
  }
}

function queues(dt) {
  const st = E.state;
  for (const p of st.planets) {
    if (p.owner === 'neutral') continue;
    const sp = (p.blockade ? 0.5 : 1) * (p.supplyT > st.t ? 1.5 : 1) * (E.dyingMul ? E.dyingMul(p.owner, 'prod') : 1); // v2.2 item 3: collapsing empires build/train slower
    // build
    let q = p.queues.build[0];
    if (q) { q.left -= dt * sp; if (q.left <= 0) { p.queues.build.shift(); const s = p.slots[q.slot]; s.b = q.b; s.lvl = q.lvl; if (q.b === 'shipyard' || q.b === 'barracks') E.retimeProd(p); if (p.owner === 'player') { E.addLog(E.BUILDINGS[q.b].name + ' Lv' + q.lvl + ' complete on ' + p.name, 'info', p.sys); E.emit('sfx', 'build'); E.emit('built', { p, q }); } } }
    q = p.queues.def[0];
    if (q) { q.left -= dt * sp; if (q.left <= 0) { p.queues.def.shift(); p.def[q.d]++; if (q.d === 'shield') p.shieldHp = Math.min(E.shieldMax(st, p), p.shieldHp + E.shieldMax(st, p) * 0.4); if (q.d === 'mines') p.mineCharge = 1; if (p.owner === 'player') { E.addLog(E.DEFENSES[q.d].name + ' built on ' + p.name, 'info', p.sys); E.emit('sfx', 'build'); } } }
    q = p.queues.ship[0];
    if (q) {
      q.left -= dt * sp;
      while (q && q.left <= 0) {
        const s = E.makeShip(p.owner, q.h, q.fit, E.forgeBoost(p));
        if (E.rallyDock) E.rallyDock(p, s); else E.dockShip(p.owner, p.sys, s); // v1.5: rally points
        if (p.owner === 'player') { st.stats.shipsBuilt++; E.emit('sfx', 'ship'); }
        q.n--; const over = q.left;
        if (q.n <= 0) { p.queues.ship.shift(); if (p.owner === 'player') E.addLog(E.HULLS[q.h].name + ' batch complete at ' + p.name, 'info', p.sys); q = null; }
        else q.left = q.total + over;
      }
    }
    q = p.queues.troop[0];
    if (q) {
      q.left -= dt * sp;
      while (q && q.left <= 0) {
        p.garrison[q.tr]++; if (p.rally != null) p._rallyInf = (p._rallyInf || 0) + 1; q.n--; const over = q.left;
        if (q.n <= 0) { p.queues.troop.shift(); q = null; } else q.left = q.total + over;
      }
    }
  }
}

function hostileToPlanet(f, p) {
  if (!p || f.owner === p.owner) return false;
  if (p.owner === 'neutral') return (f.order === 'attack' || f.order === 'siege') && f.target === p.sys || f.owner === 'crisis';
  return E.hostile(f.owner, p.owner);
}
E.hostileToPlanet = hostileToPlanet;

function moveFleets(dt) {
  const st = E.state;
  for (const f of st.fleets) {
    if (E._skipFleet && E._skipFleet(f)) continue;
    if (!f.path.length) {
      if (f.order === 'patrol' && f.patrol) {
        f.patrolWait = (f.patrolWait || 0) + dt;
        if (f.patrolWait > 20 && !E.battleAt(f.sys)) { const nx = f.sys === f.patrol[0] ? f.patrol[1] : f.patrol[0]; const p = E.pathFor(f.owner, f.sys, nx); if (p) { f.path = p; f.prog = 0; f.target = nx; f.patrolWait = 0; } }
      }
      continue;
    }
    f.prog += dt / E.hopTime(f);
    if (f.prog >= 1) {
      f.sys = f.path.shift(); f.prog = 0;
      if (f.path.length) wallCheck(f);
      if (!f.path.length) arrive(f);
    }
  }
}
// v1.5 (items 8 & 9): an enemy fleet whose route now runs into one of your worlds (e.g. one you just colonized)
// stops and attacks that world instead. If it wins, it stays there until its owner re-assigns it.
function wallCheck(f) {
  if (f.owner === 'player' || E.isAlly(f.owner) || f.owner === 'neutral') return;
  if (f.order !== 'attack' && f.order !== 'siege' && f.order !== 'raid') return;
  const here = E.sysPlanet(f.sys), final = f.path[f.path.length - 1];
  const retarget = (sys) => { f.path = sys === f.sys ? [] : [sys]; f.target = sys; f.order = E.troopCount(f.troops) ? 'attack' : 'siege'; f.retargeted = true; f.stay = true;
    const p = E.sysPlanet(sys); if (p && E.team(p.owner) === 'player') E.addLog('⚠ ' + E.FACTIONS[f.owner].short + ' fleet diverted to ' + p.name + ' — your world blocks its route', 'warn', sys); };
  if (here && E.blocksPassage(f.owner, f.sys)) return retarget(f.sys);
  const nx = f.path[0];
  if (nx !== final && E.blocksPassage(f.owner, nx)) return retarget(nx);
}
E.divertForNewColony = function (p) {
  // a freshly settled world near an enemy fleet's route pulls that fleet in if it is closer than the original target
  for (const f of E.state.fleets) {
    if (!f.path.length || f.owner === 'player' || E.isAlly(f.owner) || f.owner === 'neutral') continue;
    if (f.order !== 'attack' && f.order !== 'siege') continue;
    const tgt = E.sysPlanet(f.path[f.path.length - 1]); if (!tgt || E.team(tgt.owner) !== 'player' || tgt.id === p.id) continue;
    const nx = f.path[0]; if (!E.hostile(f.owner, p.owner)) continue;
    const onPath = f.path.includes(p.sys);
    const near = f.path.some(s => E.state.systems[s].lanes.includes(p.sys));
    if (!onPath && !near) continue;
    const dNew = E.hops(nx, p.sys), dOld = f.path.length - 1;
    if (onPath || dNew < dOld) {
      const pth = E.pathFor(f.owner, nx, p.sys); if (!pth) continue;
      f.path = [nx, ...pth]; f.target = p.sys; f.order = E.troopCount(f.troops) ? 'attack' : 'siege'; f.retargeted = true; f.stay = true;
      E.addLog('⚠ ' + E.FACTIONS[f.owner].short + ' fleet changed course for your new colony ' + p.name, 'warn', p.sys);
    }
  }
};
function arrive(f) {
  const st = E.state, p = E.sysPlanet(f.sys);
  if (f.order === 'retreat' || f.order === 'move' || f.order === 'relocate') f.order = 'idle';
  f.speedMul = 1;
  if (f.order === 'deliver') deliverCargo(f);
  if (f.order === 'return') { f.order = 'idle'; }
  if (p && hostileToPlanet(f, p) && p.def.mines && p.mineCharge > 0.99) {
    const dmg = E.mineDamage(p); let killed = 0;
    for (const s of f.ships.slice()) { s.hp -= dmg * (0.6 + 0.4 * R()); if (s.hp <= 0) { f.ships.splice(f.ships.indexOf(s), 1); killed++; } }
    p.mineCharge = 0;
    if (f.owner === 'player' || p.owner === 'player') E.addLog('Minefield at ' + p.name + ' hit ' + (f.owner === 'player' ? 'your' : E.FACTIONS[f.owner].short) + ' fleet' + (killed ? ' (' + killed + ' ships lost)' : ''), p.owner === 'player' ? 'good' : 'bad', f.sys);
    clampTroops(f); E.cleanupFleets();
  }
  if (p && p.owner === 'player' && f.owner !== 'player' && f.ships.length && hostileToPlanet(f, p)) openWindow(f.sys, f);
  E.emit('arrive', f);
}

// ---------- battles ----------
const BW = 1200, BH = 700, PX = 1060, PY = 350;
E.BATTLE_SIZE = { w: BW, h: BH, px: PX, py: PY };

function detectBattles() {
  const st = E.state;
  const bySys = {};
  for (const f of st.fleets) if (!f.path.length && f.ships.length) (bySys[f.sys] = bySys[f.sys] || []).push(f);
  for (const sk in bySys) {
    const sys = +sk, fs = bySys[sk], p = E.sysPlanet(sys);
    let b = E.battleAt(sys);
    if (b) { // join newcomers
      for (const f of fs) if (!b.fleets.includes(f.id) && !(b.reserve && b.reserve.includes(f.id))) {
        const side = sideOf(b, f); if (side < 0) continue;
        // v1.8 item 1: while the turrets are holding, newly docked defenders wait with the garrison
        if (side === 0 && b.reserve && !b.reserveOut) { b.reserve.push(f.id); E.reportReserve(b); continue; }
        joinBattle(b, f, side);
      }
      continue;
    }
    // planet vs fleets
    const atk = p ? fs.filter(f => hostileToPlanet(f, p)) : [];
    const planetCombat = p && (p.def.turret > 0 || p.def.station > 0 || p.def.laser > 0 || p.def.railgun > 0);
    const defShips = p ? fs.filter(f => f.owner === p.owner || (p.owner !== 'neutral' && !E.hostile(f.owner, p.owner) && atk.some(a => E.hostile(a.owner, f.owner)))) : [];
    if (atk.length && (planetCombat || defShips.length)) {
      startBattle(sys, defShips, atk, true);
      continue;
    }
    // fleet vs fleet
    let found = null;
    for (const a of fs) for (const c of fs) if (E.hostile(a.owner, c.owner)) { found = [a, c]; break; }
    if (found) {
      const A = found[0].owner;
      startBattle(sys, fs.filter(f => !E.hostile(f.owner, A)), fs.filter(f => E.hostile(f.owner, A)), false);
    }
  }
}
function sideOf(b, f) {
  const p = E.sysPlanet(b.sys);
  if (b.planetSide && p) {
    if (hostileToPlanet(f, p)) return 1;
    if (f.owner === p.owner) return 0;
    if (b.owners[1].some(o => E.hostile(o, f.owner))) return 0;
    return -1;
  }
  if (b.owners[0].some(o => E.hostile(o, f.owner))) return 1;
  if (b.owners[1].some(o => E.hostile(o, f.owner))) return 0;
  return -1;
}
function startBattle(sys, side0, side1, planetSide) {
  const st = E.state, p = E.sysPlanet(sys);
  const b = { id: E.id(), sys, planetSide, owners: [[], []], fleets: [], units: [], t: 0, fx: [], done: false, startPow: [0, 0], log: [] };
  if (planetSide) {
    b.owners[0].push(p.owner);
    const ts = E.turretStats(p), ss = E.stationStats(p);
    for (let i = 0; i < p.def.turret; i++) { const a = -Math.PI / 2 + (i + 0.5) / p.def.turret * Math.PI; b.units.push({ uid: 'T' + i, kind: 'turret', side: 0, x: PX + Math.cos(a + Math.PI) * 95, y: PY + Math.sin(a + Math.PI) * 95 * 1.1, hp: ts.hp, max: ts.hp, dps: ts.dps, range: ts.range, cd: R(), owner: p.owner }); }
    for (let i = 0; i < p.def.station; i++) b.units.push({ uid: 'S' + i, kind: 'station', side: 0, x: PX - 170, y: PY + (i === 0 ? -160 : 160), hp: ss.hp, max: ss.hp, dps: ss.dps, range: ss.range, cd: R(), owner: p.owner, oa: i * Math.PI });
    // v2.6 item 6: lasers (behind the planet, like defending ships) and a single railgun
    if (p.def.laser && E.laserStats) { const ls = E.laserStats(p); for (let i = 0; i < p.def.laser; i++) { const yy = PY - 90 + (p.def.laser === 1 ? 0 : (i / Math.max(1, p.def.laser - 1)) * 180); b.units.push({ uid: 'L' + i, kind: 'laser', side: 0, x: PX + 70, y: yy, hp: ls.hp, max: ls.hp, dps: ls.dps, range: ls.range, cd: 0, owner: p.owner, beamT: 0, lock: null }); } }
    if (p.def.railgun && E.railgunStats) { const rs = E.railgunStats(p); b.units.push({ uid: 'RG0', kind: 'railgun', side: 0, x: PX + 40, y: PY + 140, hp: rs.hp, max: rs.hp, dps: (rs.shot||2200)/Math.max(1,rs.cd||3.5), range: rs.range, cd: 1.2, shot: rs.shot, rcd: rs.cd, owner: p.owner }); }
    p.lastAttacked = st.t;
  }
  st.battles.push(b);
  // v1.8 item 1: turret-first defence — docked garrison ships hold back while the planet's turrets engage;
  // they launch the moment any turret is hit (see damage()). No turrets → they fight from the start.
  if (planetSide && p.def.turret > 0 && side0.length && E.TURRET_FIRST !== false) { b.reserve = side0.map(f => f.id); b.reserveOut = false; side0 = []; st.stats.tfHold = (st.stats.tfHold || 0) + 1; }
  side0.forEach(f => joinBattle(b, f, 0));
  side1.forEach(f => joinBattle(b, f, 1));
  b.startPow = [sidePower(b, 0), sidePower(b, 1)];
  const involved = b.owners[0].includes('player') || b.owners[1].includes('player');
  if (involved) {
    const enemy = (b.owners[0].includes('player') ? b.owners[1] : b.owners[0]).map(o => E.FACTIONS[o].short).join(', ');
    b.rep = E.openBattleReport(b); if (b.reserve) E.reportReserve(b);
    E.addLog('⚔ Battle at ' + st.systems[sys].name + ' vs ' + enemy, 'battle', sys, b.id);
    E.emit('battleStart', b);
    E.emit('sfx', 'alert');
  }
  return b;
}
function joinBattle(b, f, side) {
  b.fleets.push(f.id);
  if (b.rep) E.reportJoin(b, f, side);
  if (!b.owners[side].includes(f.owner)) b.owners[side].push(f.owner);
  const n = f.ships.length;
  f.ships.forEach((s, i) => {
    const st = E.shipStats(f.owner, s);
    const unarmed = st.dps <= 0;
    let x, y;
    if (side === 1) { x = (unarmed ? 40 : 120) + R() * 120; y = 120 + R() * (BH - 240); }
    else if (b.planetSide) {
      // v2.6 item 5: defenders spawn BEHIND the planet (right of PX; attackers approach from the left) with a y-spread so they fly in before engaging.
      const spread = 70 + R() * (BH - 140);
      x = Math.min(BW - 20, PX + (unarmed ? 30 : 50) + R() * 110);
      y = 70 + spread;
    } else { x = unarmed ? BW - 70 : BW - 300 + R() * 160; y = 120 + R() * (BH - 240); }
    const un = { uid: s.uid, fid: f.id, kind: 'ship', side, h: s.h, x, y, vx: 0, vy: 0, cd: R() * 1.2, owner: f.owner, tgt: null };
    if (s.bo) un.bo = s.bo; // v1.9 item 23: Forge-boosted ship (gold badge on its sprite)
    b.units.push(un);
  });
}
E.leaveBattle = function (f) {
  for (const b of E.state.battles) {
    if (!b.fleets.includes(f.id)) continue;
    b.fleets = b.fleets.filter(id => id !== f.id);
    b.units = b.units.filter(u => u.fid !== f.id);
  }
};
function sidePower(b, side) {
  let hp = 0, dps = 0; const p = E.sysPlanet(b.sys);
  for (const u of b.units) { if (u.side !== side) continue; const v = unitVals(b, u); if (!v) continue; hp += v.hp + (v.sh || 0); dps += v.dps; }
  if (side === 0 && b.planetSide && p) hp += p.shieldHp;
  return Math.sqrt(hp * Math.max(1, dps));
}
E.sidePower = sidePower;
function shipOf(b, u) {
  if (u._f && u._f.id === u.fid && u._s && u._f.ships.includes(u._s)) return u._s;
  const f = E.fleetById(u.fid); if (!f) return null;
  const s = f.ships.find(s => s.uid === u.uid); u._f = f; u._s = s; return s || null;
}
function unitVals(b, u) {
  if (u.kind !== 'ship') return { hp: u.hp, max: u.max, dps: u.dps, range: u.range, sh: 0 };
  const s = shipOf(b, u); if (!s) return null;
  const st = E.shipStats(u.owner, s);
  return { hp: s.hp, max: st.hp, sh: s.sh, shmax: st.sh, dps: st.dps, range: st.range, speed: st.speed, ship: s };
}
E.unitVals = unitVals;
E.damage = damage;

function stepBattles(dt) {
  const st = E.state;
  for (const b of st.battles) if (!b.done) stepBattle(b, dt);
  if (st.battles.some(b => b.done)) st.battles = st.battles.filter(b => !b.done || (b.viewing && st.t - b.endT < 4));
}
// flak bursts hit `flak` extra fighters, plus one more per FLAK_MASS fighters massed on the enemy side
E.flakOf = function (owner, massed) { return (E.HULLS.destroyer.flak || 0) + (E.has(owner, 'f6') ? 1 : 0) + Math.min(E.FLAK_MASS_CAP == null ? 3 : E.FLAK_MASS_CAP, Math.floor((massed || 0) / (E.FLAK_MASS || 12))); };
// v1.3: Fighters swarm Destroyers (×bonus); the Destroyer's answer is flak splash, not a damage multiplier
// v1.8 item 4: table-driven counter loop (see E.COUNTER_TABLE in data.js)
E.counterMult = function (a, d) { const r = E.COUNTER_TABLE[a]; return (r && r[d]) || 1; };
E.defMultVs = function (h, kind) { const r = E.DEF_BONUS[h]; return (r && r[kind]) || 1; }; // v1.9 item 9
function stepBattle(b, dt) {
  const st = E.state, p = E.sysPlanet(b.sys);
  b.t += dt;
  Object.defineProperty(b, 'vfx', { value: E.LIVE_FX !== false && !!b.viewing && b.units.length <= (E.BATTLE_ANIM_MAX || 1e9), writable: true, configurable: true, enumerable: false }); // v1.9 item 17: no fx for huge battles
  // prune dead units / missing ships
  b.units = b.units.filter(u => u.kind === 'ship' ? !!shipOf(b, u) : u.hp > 0);
  const vals = new Map();
  for (const u of b.units) vals.set(u, unitVals(b, u));
  const bySide = [[], []];
  for (const u of b.units) bySide[u.side].push(u);
  const uidMap = [new Map(), new Map()]; for (const u of b.units) uidMap[u.side].set(u.uid, u); // v1.5 perf: O(1) target lookup in big fights
  b._fc = [0, 1].map(sd => bySide[1 - sd].filter(e => e.h === 'fighter').length); // enemy fighters massed against each side
  for (const u of b.units) {
    const v = vals.get(u); if (!v) continue;
    // movement & targeting
    if (u.kind === 'station') { u.oa = (u.oa || 0) + dt * 0.08; u.x = PX - 40 + Math.cos(u.oa + Math.PI) * 190; u.y = PY + Math.sin(u.oa + Math.PI) * 190; }
    const enemies = bySide[1 - u.side];
    if (!enemies.length) continue;
    if (v.dps <= 0) {
      // unarmed: hang back
      if (u.kind === 'ship') { const homeX = u.side === 1 ? 60 : (b.planetSide ? PX + 90 : BW - 60); u.x += (homeX - u.x) * Math.min(1, dt * 0.5); }
      continue;
    }
    let t = u.tgt ? uidMap[1 - u.side].get(u.tgt) || null : null;
    u.retarget = (u.retarget || 0) - dt;
    if (!t || u.retarget <= 0) {
      u.retarget = 2 + R() * 2;
      let pool = enemies;
      if (u.kind !== 'ship') { const tr = enemies.filter(e => e.h === 'transport' || e.h === 'freighter'); if (tr.length && R() < 0.45) pool = tr; }
      else if (b.planetSide && u.side === 1) { const tu = enemies.filter(e => e.kind === 'turret'); if (tu.length) pool = tu; } // v1.8: attackers engage turrets first
      let best = null, bd = Infinity;
      const prey = u.kind === 'ship' && pool === enemies ? E.COUNTERS[u.h] : null;
      for (const e of pool) { let d = (e.x - u.x) ** 2 + (e.y - u.y) ** 2 * 1.2 + (e.kind === 'ship' && E.HULLS[e.h].noWeapon && pool === enemies ? 90000 : 0); if (prey && e.h === prey) d *= 0.3; if (d < bd) { bd = d; best = e; } }
      t = best; u.tgt = t ? t.uid : null;
    }
    if (!t) continue;
    const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy) || 1;
    if (u.kind === 'ship') {
      const sp = v.speed * 42;
      const want = v.range * 0.8;
      let ax = 0, ay = 0;
      if (d > want) { ax = dx / d; ay = dy / d; } else if (d < want * 0.5) { ax = -dx / d * 0.5; ay = -dy / d * 0.5; } else { ax = -dy / d * 0.4; ay = dx / d * 0.4; }
      u.vx = E.lerp(u.vx || 0, ax * sp, Math.min(1, dt * 3)); u.vy = E.lerp(u.vy || 0, ay * sp, Math.min(1, dt * 3));
      u.x = E.clamp(u.x + u.vx * dt, 10, BW - 10); u.y = E.clamp(u.y + u.vy * dt, 20, BH - 20);
      u.ang = Math.atan2(dy, dx);
    }
    // fire
    if (E.specialDefFire && E.specialDefFire(b, u, t, v, dt, d)) continue;
    u.cd -= dt;
    if (u.cd <= 0 && d <= v.range + 8) {
      const fast = u.h === 'fighter';
      u.cd = (fast ? 0.5 : 1) * (0.9 + R() * 0.2);
      const dmg0 = v.dps * (fast ? 0.5 : 1) * (0.85 + R() * 0.3);
      const dmg = dmg0 * (u.kind === 'ship' && t.kind === 'ship' ? E.counterMult(u.h, t.h) : u.kind === 'ship' ? E.defMultVs(u.h, t.kind) : 1);
      const vol = u.kind === 'ship' ? E.HULLS[u.h].volley || 0 : 0;
      if (vol > 1) { // v1.8: a Warship Carrier splits each volley across several targets in range (its strike wings)
        const part = dmg0 / vol, r2 = (v.range + 8) ** 2, mul = e => e.kind === 'ship' ? E.counterMult(u.h, e.h) : E.defMultVs(u.h, e.kind); let k = 1; damage(b, t, part * mul(t), u);
        for (const e of enemies) { if (k >= vol) break; if (e === t || (e.x - u.x) ** 2 + (e.y - u.y) ** 2 > r2) continue; damage(b, e, part * mul(e), u); k++; }
        if (k < vol) damage(b, t, part * (vol - k) * mul(t), u);
      } else damage(b, t, dmg, u);
      // v1.3 flak: a Destroyer's shot at a Fighter also shreds nearby massed Fighters
      if (u.h === 'destroyer' && t.h === 'fighter' && u.kind === 'ship') {
        const n = E.flakOf(u.owner, b._fc ? b._fc[u.side] : 0); let k = 0;
        for (const e of enemies) { if (k >= n) break; if (e === t || e.h !== 'fighter' || e.kind !== 'ship') continue; if ((e.x - t.x) ** 2 + (e.y - t.y) ** 2 > 90 * 90) continue; damage(b, e, dmg * E.FLAK_SPLASH, u); k++; b.flakHits = (b.flakHits || 0) + 1; }
      }
      if (b.vfx && b.fx.length < 260) b.fx.push({ k: 'bolt', x1: u.x, y1: u.y, x2: t.x + (R() - 0.5) * 8, y2: t.y + (R() - 0.5) * 8, c: E.FACTIONS[u.owner].color, life: 0.18, big: u.kind !== 'ship' || u.h === 'destroyer' });
      if (b.vfx && R() < 0.25) E.emit('sfx', 'laser');
    }
  }
  // fleet morale: AI wave fleets retreat when shattered
  b.moraleT = (b.moraleT || 0) + dt;
  if (b.moraleT > 3) {
    b.moraleT = 0;
    for (const fid of b.fleets.slice()) {
      const f = E.fleetById(fid); if (!f || f.owner === 'player' || f.owner === 'crisis' || !f.wave) continue;
      const fs = E.fleetStats(f);
      if (f.startPower && fs.power < f.startPower * 0.3 && fs.armed) { E.leaveBattle(f); const d = E.nearestFriendly(f.owner, f.sys); if (d != null && d !== f.sys) { f.path = E.pathFor(f.owner, f.sys, d) || E.path(f.sys, d) || []; f.order = 'retreat'; f.wave = false; f.target = d; } }
    }
  }
  if (E.battleTick) E.battleTick(b, dt);
  // fx decay
  for (const fx of b.fx) fx.life -= dt;
  if (b.fx.length) b.fx = b.fx.filter(f => f.life > 0);
  // end check
  const alive = [0, 1].map(s => b.units.some(u => u.side === s));
  const armed = [0, 1].map(s => b.units.some(u => u.side === s && (vals.get(u) || {}).dps > 0));
  if (!alive[0] || !alive[1] || (!armed[0] && !armed[1])) endBattle(b, alive, armed);
  else if (!armed[1] && alive[1] && armed[0]) { /* unarmed attackers will be shot; let them flee */ for (const fid of b.fleets) { const f = E.fleetById(fid); if (f && sideOf(b, f) === 1 && !E.fleetStats(f).armed && f.owner !== 'player') E.act.retreat(f.id); } }
}
function damage(b, t, dmg, src) {
  const st = E.state, p = E.sysPlanet(b.sys);
  if (t.kind !== 'ship') {
    if (t.kind === 'turret' && b.reserve && !b.reserveOut) launchReserve(b);
    if (p && p.shieldHp > 0) { p.shieldHp -= dmg; if (b.vfx && b.fx.length < 260) b.fx.push({ k: 'shield', x: t.x, y: t.y, life: 0.3 }); if (p.shieldHp < 0) { t.hp += p.shieldHp; p.shieldHp = 0; } return; }
    t.hp -= dmg;
    if (t.hp <= 0) { if (b.vfx) b.fx.push({ k: 'boom', x: t.x, y: t.y, r: t.kind === 'station' ? 60 : 30, life: 0.8, max: 0.8 }); if (b.vfx) E.emit('sfx', 'boom'); }
    if (E.battleHit) E.battleHit(b, src, t, dmg, t.hp <= 0);
    return;
  }
  const s = shipOf(b, t); if (!s) return;
  if (s.sh > 0) { const a = Math.min(s.sh, dmg); s.sh -= a; dmg -= a; if (b.vfx && b.fx.length < 260) b.fx.push({ k: 'hit', x: t.x, y: t.y, c: '#7fd8ff', life: 0.15 }); }
  s.hp -= dmg;
  if (s.hp <= 0) {
    const f = E.fleetById(t.fid);
    if (b.rep) E.reportLoss(b, t);
    if (f) { f.ships.splice(f.ships.indexOf(s), 1); if (f.owner === 'player') st.stats.shipsLost++; else if (src && src.owner === 'player') { st.stats.enemyKilled++; if (E.hostile('player', f.owner)) E.addXP(E.shipXP(s.h), 'ship'); } if (E.troopSize(f.troops) > E.fleetStats(f).cap) clampTroops(f); }
    if (b.vfx) { b.fx.push({ k: 'boom', x: t.x, y: t.y, r: E.HULLS[t.h].size * 2, life: 0.7, max: 0.7 }); E.emit('sfx', 'boom'); }
    if (E.battleHit) E.battleHit(b, src, t, dmg, true);
    b.units.splice(b.units.indexOf(t), 1);
  } else if (E.battleHit) E.battleHit(b, src, t, dmg, false);
}
// v1.8 item 1: a turret was hit — every garrison ship still docked here launches and joins
function launchReserve(b) {
  const st = E.state; b.reserveOut = true; b.reserveAt = b.t; let n = 0, ships = 0; st.stats.tfLaunch = (st.stats.tfLaunch || 0) + 1;
  for (const id of b.reserve) { const f = E.fleetById(id); if (!f || f.path.length || f.sys !== b.sys || !f.ships.length || b.fleets.includes(f.id)) continue; const side = sideOf(b, f); if (side !== 0) continue; joinBattle(b, f, 0); n++; ships += f.ships.length; }
  b.reserveShips = ships;
  E.reportReserve(b, true);
  if (n && (b.owners[0].includes('player') || b.owners[1].includes('player'))) E.addLog('🛡 Turret hit at ' + st.systems[b.sys].name + ' — ' + ships + ' garrison ship' + (ships === 1 ? '' : 's') + ' launched', 'battle', b.sys, b.rep);
}
E.launchReserve = launchReserve;
function endBattle(b, alive) {
  const st = E.state, p = E.sysPlanet(b.sys);
  b.done = true; b.endT = st.t;
  const winner = alive[0] && !alive[1] ? 0 : alive[1] && !alive[0] ? 1 : -1;
  b.winner = winner;
  if (b.planetSide && p) {
    p.def.turret = b.units.filter(u => u.kind === 'turret').length;
    p.def.station = b.units.filter(u => u.kind === 'station').length;
    if (p.def.laser != null) p.def.laser = b.units.filter(u => u.kind === 'laser').length;
    if (p.def.railgun != null) p.def.railgun = b.units.filter(u => u.kind === 'railgun').length;
    if (winner === 1) p.bombardT = 0;
  }
  for (const fid of b.fleets) { const f = E.fleetById(fid); if (f) clampTroops(f); }
  E.cleanupFleets();
  if (b.rep) E.closeBattleReport(b, winner);
  const pl0 = b.owners[0].includes('player'), pl1 = b.owners[1].includes('player');
  if (pl0 || pl1) {
    const won = (pl0 && winner === 0) || (pl1 && winner === 1);
    if (winner >= 0) { if (won) st.stats.battlesWon++; else st.stats.battlesLost++; }
    E.addLog((won ? '✔ Victory' : winner < 0 ? '— Stalemate' : '✖ Defeat') + ' at ' + st.systems[b.sys].name, won ? 'good' : 'bad', b.sys, b.id);
    if (!windowAt(b.sys)) E.toast((won ? 'Victory at ' : winner < 0 ? 'Stalemate at ' : 'Defeat at ') + st.systems[b.sys].name, won ? 'good' : 'bad', b.sys);
    E.emit('battleEnd', { b, won });
  }
}

// After orbit is clear: blockade, bombard shields, land troops
function sieges(dt) {
  const st = E.state;
  const dk = dockedBySys();
  for (const p of st.planets) {
    if (E.battleAt(p.sys) || windowAt(p.sys)) continue;
    const hf = (dk.get(p.sys) || NOF).filter(f => f.ships.length && hostileToPlanet(f, p));
    if (!hf.length) { p.bombardT = 0; continue; }
    const planetCombat = p.def.turret > 0 || p.def.station > 0 || (p.def.laser || 0) > 0 || (p.def.railgun || 0) > 0;
    const defenders = (dk.get(p.sys) || NOF).some(f => f.owner === p.owner && E.fleetArmed(f));
    if (planetCombat || defenders) continue; // battle will start
    let dps = 0; for (const f of hf) dps += E.fleetStats(f).dps;
    if (dps > 0) { p.blockade = true; p.shieldHp = Math.max(0, p.shieldHp - dps * 0.6 * dt); }
    p.bombardT = (p.bombardT || 0) + dt;
    // invasion
    const byOwner = {};
    for (const f of hf) if (f.order === 'attack' && f.target === p.sys && E.troopCount(f.troops) > 0) (byOwner[f.owner] = byOwner[f.owner] || []).push(f);
    for (const o in byOwner) {
      if (p.shieldHp > 0 && p.bombardT < 15) continue;
      invade(p, o, byOwner[o]);
      break;
    }
    // v1.5: Colonize without troops — once orbit is clear, the survey takes 20 s and the world joins you
    if (p.owner === 'neutral' && !byOwner.player) {
      const col = hf.filter(f => f.owner === 'player' && f.colonize && f.order === 'attack' && f.target === p.sys);
      if (col.length && p.bombardT >= 20) E.colonizeNow(p, col);
    }
    // AI siege fleets go home after a while
    for (const f of hf) {
      if (f.owner === 'player') continue;
      f.siegeT = (f.siegeT || 0) + dt;
      if (f.owner === 'crisis') {
        if (f.siegeT > 150 && !E.troopCount(f.troops)) {
          f.siegeT = 0;
          const cands = st.planets.filter(q => q.owner !== 'crisis' && q.id !== p.id);
          const pl = cands.filter(q => q.owner === 'player');
          const pool = pl.length ? pl : cands;
          const next = pool.sort((a, b) => E.laneDist(f.sys, a.sys) - E.laneDist(f.sys, b.sys))[0];
          if (next) E.act.move(f.id, next.sys, 'siege');
        }
        continue;
      }
      if (f.siegeT > 200 && !f.stay && !(f.order === 'attack' && E.troopCount(f.troops))) { const d = E.nearestFriendly(f.owner, f.sys); if (d != null) { f.siegeT = 0; E.act.move(f.id, d, 'return'); f.wave = false; } }
    }
  }
}

E.colonizeNow = function (p, fleets) {
  const st = E.state;
  if (E.atSysCap()) { fleets.forEach(f => { f.order = 'siege'; f.colonize = false; }); E.addLog('System cap reached (' + E.sysCount() + '/' + E.sysCap() + ') — colony on ' + p.name + ' called off.', 'warn', p.sys); E.toast('System cap reached — colony called off', 'warn', p.sys); return false; }
  captureP(p, 'player'); p.garrison = { inf: 0 };
  fleets.forEach(f => { f.order = 'idle'; f.colonize = false; });
  st.stats.captured++;
  E.addLog('🏳 ' + p.name + ' colonized!', 'good', p.sys); E.toast('Colonized ' + p.name + '!', 'good', p.sys); E.emit('sfx', 'victory');
  return true;
};
function invade(p, owner, fleets, quiet) {
  const st = E.state;
  const razing = owner === 'player' && fleets.some(f => f.raze) && p.owner !== 'neutral';
  if (owner === 'player' && !razing && E.atSysCap()) {
    // v1.4: system cap — the landing is called off, troops stay aboard
    for (const f of fleets) { f.order = 'siege'; }
    if (!quiet) { E.addLog('System cap reached (' + E.sysCount() + '/' + E.sysCap() + ') — landing on ' + p.name + ' called off. Level up your Commander, abandon a world, or choose Raze.', 'warn', p.sys); E.toast('System cap reached — landing called off', 'warn', p.sys); }
    return { p, owner, prevOwner: p.owner, captured: false, capBlocked: true };
  }
  const atk = { inf: 0 };
  for (const f of fleets) for (const k of E.TROOP_KEYS) { atk[k] += f.troops[k]; f.troops[k] = 0; }
  // v1.7: troops sitting in your transports docked here defend the world together with the garrison
  const aboardF = E.defFleets ? E.defFleets(p).filter(f => !fleets.includes(f)) : [];
  const gar0 = Object.assign({}, p.garrison), pool = Object.assign({}, p.garrison);
  for (const f of aboardF) for (const k of E.TROOP_KEYS) pool[k] = (pool[k] || 0) + (f.troops[k] || 0);
  const pool0 = Object.assign({}, pool);
  const before = { atk: Object.assign({}, atk), def: Object.assign({}, pool) };
  // shield burn on landing
  const sm = E.shieldMax(st, p);
  const burn = sm > 0 ? 0.5 * p.shieldHp / sm : 0;
  if (burn > 0) for (const k of E.TROOP_KEYS) atk[k] = Math.floor(atk[k] * (1 - burn));
  const def = pool;
  const specFrac = E.troopCount(atk) ? (atk.spec || 0) / E.troopCount(atk) : 0;
  const dm = E.garrisonDefMult(p, specFrac);
  let am = (E.has(owner, 'f7') ? 1.25 : 1) * (E.has(owner, 'f4') ? 1.15 : 1) * (owner === 'player' ? E.speciesBonus('troopAtk') : 1);
  let dAtkM = (E.has(p.owner, 'f7') ? 1.25 : 1) * (E.hasSpec(p, 'defense') ? 1.15 : 1) * (p.owner === 'player' ? E.speciesBonus('troopAtk') : 1);
  const rounds = [];
  const hpOf = (side, k) => side === 'a' ? E.TROOPS[k].def * am : E.TROOPS[k].def * dm;
  function apply(target, side, dmg) {
    let guard = 0;
    while (dmg > 0 && E.troopCount(target) > 0 && guard++ < 500) {
      const ks = E.TROOP_KEYS.filter(k => target[k] > 0);
      const k = ks[Math.floor(R() * ks.length)];
      const h = hpOf(side, k);
      if (dmg >= h) { target[k]--; dmg -= h; } else { if (R() < dmg / h) target[k]--; dmg = 0; }
    }
  }
  for (let r = 0; r < 40 && E.troopCount(atk) > 0 && E.troopCount(def) > 0; r++) {
    let da = 0, dd = 0;
    for (const k of E.TROOP_KEYS) { da += atk[k] * E.TROOPS[k].atk; dd += def[k] * E.TROOPS[k].atk; }
    da *= am * 0.3 * (0.8 + R() * 0.4); dd *= dAtkM * 0.3 * (0.8 + R() * 0.4);
    apply(def, 'd', da); apply(atk, 'a', dd);
    rounds.push([E.troopCount(atk), E.troopCount(def)]);
  }
  // write the survivors back: losses are shared between the garrison and the transports in proportion
  for (const k of E.TROOP_KEYS) {
    const tot0 = pool0[k] || 0, left = def[k] || 0; if (!tot0) continue;
    const g = Math.min(left, Math.round(left * (gar0[k] || 0) / tot0)); p.garrison[k] = g; let rest = left - g;
    for (const f of aboardF) { const had = f.troops[k] || 0; const keep = Math.min(had, rest); f.troops[k] = keep; rest -= keep; }
    if (rest > 0) p.garrison[k] += rest;
  }
  const captured = E.troopCount(def) === 0 && E.troopCount(atk) > 0;
  const prevOwner = p.owner;
  const res = { p, owner, prevOwner, before, after: { atk: Object.assign({}, atk), def: Object.assign({}, def) }, captured, burn, rounds };
  // v1.4 Commander XP from troops killed
  if (owner === 'player' && E.hostile('player', prevOwner)) E.addXP(Math.max(0, E.troopCount(before.def) - E.troopCount(def)) * E.XP_TROOP, 'troops');
  if (prevOwner === 'player' && E.hostile('player', owner)) E.addXP(Math.max(0, E.troopCount(before.atk) - E.troopCount(atk)) * E.XP_TROOP, 'troops');
  if (captured && razing) { captureP(p, owner); E.razePlanet(p); res.razed = true; }
  else if (captured) { captureP(p, owner); p.garrison = atk; }
  else { /* attackers wiped */ }
  const pl = owner === 'player' || prevOwner === 'player';
  if (pl) {
    const rid = E.groundReport(res, owner, prevOwner, razing, aboardF.length);
    if (!quiet) E.emit('ground', res);
    if (captured && res.razed) { E.addLog('🔥 ' + p.name + ' razed — it is now an empty independent world.', 'good', p.sys, rid); E.toast('Razed ' + p.name, 'good', p.sys, rid); E.emit('sfx', 'victory'); }
    else if (captured && owner === 'player') { E.addLog('🏳 ' + p.name + ' captured!', 'good', p.sys, rid); E.toast('Captured ' + p.name + '!', 'good', p.sys, rid); E.emit('sfx', 'victory'); st.stats.captured++; }
    else if (captured) { E.addLog('🏴 ' + p.name + ' fell to ' + E.FACTIONS[owner].name + '!', 'bad', p.sys, rid); E.toast(p.name + ' has fallen!', 'bad', p.sys, rid); E.emit('sfx', 'alert'); st.stats.lost++; }
    else if (owner === 'player') { E.addLog('Ground assault on ' + p.name + ' failed.', 'bad', p.sys, rid); E.toast('Invasion of ' + p.name + ' repelled', 'bad', p.sys, rid); }
    else { E.addLog('Garrison on ' + p.name + ' repelled a ' + E.FACTIONS[owner].short + ' landing!', 'good', p.sys, rid); E.toast(p.name + ' held the landing!', 'good', p.sys, rid); }
  }
  else if (captured && owner !== 'neutral' && prevOwner !== 'neutral' && (st.stats.rivalCaps = (st.stats.rivalCaps || 0) + 1) && !quiet) E.addLog('🏴 ' + E.FACTIONS[owner].short + ' took ' + p.name + ' from ' + E.FACTIONS[prevOwner].short, 'info', p.sys);
  return res;
}
E.invade = invade;

function captureP(p, owner) {
  const st = E.state, prev = p.owner;
  p.owner = owner; p.capturedAt = st.t;
  for (const qn in p.queues) p.queues[qn] = [];
  for (const s of p.slots) if (s.b && s.lvl > 1 && R() < 0.25) s.lvl--;
  p.def.turret = 0; p.def.station = 0; p.def.mines = 0; p.def.laser = 0; p.def.railgun = 0; p.shieldHp = 0; p.blockade = false;
  if (owner === 'crisis') p.spec = null;
  // routes
  for (const r of st.routes.slice()) {
    if (r.from === p.id && owner !== 'player') E.act.cancelRoute(r.id);
    else if (r.to === p.id && !E.validTradeTarget(st.planets[r.from], p)) E.act.cancelRoute(r.id);
  }
  // fleets of the previous owner here that were idle become homeless: send them to nearest friendly
  for (const f of st.fleets) if (f.owner === prev && f.sys === p.sys && !f.path.length) { const d = E.nearestFriendly(prev, p.sys); if (d != null) E.act.move(f.id, d, 'retreat'); }
  if (prev !== 'neutral' && prev !== 'player' && st.emp[prev] && !st.planets.some(q => q.owner === prev)) {
    st.emp[prev].alive = false; E.addLog(E.FACTIONS[prev].name + ' has been eliminated!', prev === 'crisis' ? 'good' : 'info');
    E.toast(E.FACTIONS[prev].name + ' eliminated!', 'good');
  }
  if (owner !== 'neutral' && st.emp[owner]) st.emp[owner].alive = true;
  if (owner === 'player') E.divertForNewColony(p);
}
E.captureP = captureP;

// ---------- trade ----------
function trade(dt) {
  const st = E.state;
  const cnt = {}; for (const r of st.routes) cnt[r.from] = (cnt[r.from] || 0) + 1;
  for (const r of st.routes.slice()) {
    const a = st.planets[r.from], b = st.planets[r.to];
    if (a.owner !== 'player' || !E.validTradeTarget(a, b)) { E.act.cancelRoute(r.id); continue; }
    const path = [a.sys, ...(E.tradePath(a.sys, b.sys) || [])];
    r.path = path;
    // v1.5: trade ships are untouchable: nothing can attack or block them
    const blockSys = null;
    r.blocked = blockSys;
    if (!r.ship) continue;
    if (blockSys == null) {
      const inc = E.routeIncome(a, b, cnt[r.from]) / 60 * dt;
      const em = st.emp.player, cap = E.storageCap('player');
      const y = E.routeYield(r, inc);
      em.res[y.k] = Math.min(Math.max(cap, em.res[y.k]), em.res[y.k] + y.n);
      r.earned += y.n; st.stats.tradeEarned += y.n;
      const L = Math.max(1, E.pathLen(a.sys, path.slice(1)));
      r.prog += r.dir * dt * 14 / L;
      if (r.prog >= 1) { r.prog = 1; r.dir = -1; } if (r.prog <= 0) { r.prog = 0; r.dir = 1; }
    }
  }
}

// ---------- AI ----------
const AI_WEIGHTS = {
  raider:       { mine: 3, plant: 2, power: 2, shipyard: 3, barracks: 2, warehouse: 1, lab: 0.5, tradeport: 0.2, bunker: 0.5, def: 0.8 },
  expansionist: { mine: 3, plant: 2, power: 2, shipyard: 2, barracks: 3, warehouse: 1, lab: 0.5, tradeport: 0.3, bunker: 1, def: 1 },
  trader:       { mine: 2, plant: 2, power: 2, shipyard: 1.5, barracks: 1.5, warehouse: 1.5, lab: 1, tradeport: 2, bunker: 2, def: 2 },
  crisis:       { mine: 1, plant: 1, power: 1, shipyard: 1, barracks: 1, warehouse: 0, lab: 0, tradeport: 0, bunker: 1, def: 1 },
};
const AIW = {
  warlord:   Object.assign({}, AI_WEIGHTS.raider, { shipyard: 4, barracks: 2.5, def: 0.7 }),
  turtle:    Object.assign({}, AI_WEIGHTS.trader, { def: 2.5, bunker: 3, tradeport: 0.5 }),
  swarm:     Object.assign({}, AI_WEIGHTS.expansionist, { barracks: 4, shipyard: 2.5, def: 0.6 }),
  scholar:   Object.assign({}, AI_WEIGHTS.trader, { lab: 3, def: 1.5, tradeport: 0.5 }),
  syndicate: Object.assign({}, AI_WEIGHTS.raider, { tradeport: 1, lab: 0.3 }),
  ally1: Object.assign({}, AI_WEIGHTS.expansionist), ally2: Object.assign({}, AI_WEIGHTS.expansionist, { def: 1.5 }), ally3: Object.assign({}, AI_WEIGHTS.expansionist, { mine: 3.5 }),
};
E.AIW = AIW;
function aiTick(dt) {
  const st = E.state;
  for (const f of E.rivals().concat(E.allies(), ['crisis'])) {
    const em = st.emp[f];
    // flat stipend so AIs never stall
    const eco = E.DIFFICULTY[st.diff].aiEco;
    const myPlanets = st.planets.filter(p => p.owner === f);
    if (!myPlanets.length) continue;
    const stip = (6 + st.t / (600 * E.TIME_MUL)) * eco * dt / 60 * 10 / E.TIME_MUL;
    em.res.metal += stip * 1.0; em.res.crystal += stip * 0.95;
    em.ai.next -= dt;
    if (em.ai.next > 0) continue;
    em.ai.next = 6 + R() * 4;
    // v1.4: AIs rebalance metal ↔ crystal through their Trade Centers (20% loss) so neither stockpile stalls
    if (f !== 'crisis') { const r = em.res; if (r.crystal > 2 * r.metal + 800) { const x = r.crystal * 0.15; r.crystal -= x; r.metal += x * 0.8; } else if (r.metal > 2 * r.crystal + 800) { const x = r.metal * 0.15; r.metal -= x; r.crystal += x * 0.8; } }
    const W = AI_WEIGHTS[f] || AIW[f];
    for (const p of myPlanets) {
      // buildings
      if (p.queues.build.length < 1) {
        let best = null, bw = 0;
        for (let i = 0; i < E.planetSlots(p); i++) {
          const s = p.slots[i];
          if (!s.b) continue;
          if (s.lvl >= Math.min(10, E.BUILD_MAX_LVL)) continue; // v1.6: the AI keeps its v1.5 Lv10 ceiling (Lv11–15 is a player edge)
          let w = (W[s.b] || 0.5) / Math.pow(s.lvl, 1.1) * (0.6 + R() * 0.8);
          if ((E.BUILDINGS[s.b].energy || 0) + E.energyUsed(p, true) > E.energyMax(p)) w = 0;
          if (s.b === 'plant' && E.energyUsed(p, true) + 4 > E.energyMax(p)) w *= 6;
          if (w > bw) { bw = w; best = [i, null]; }
        }
        const empty = p.slots.slice(0, E.planetSlots(p)).findIndex(s => !s.b);
        if (empty >= 0 && R() < 0.6) {
          const opts = E.energyUsed(p, true) + 4 > E.energyMax(p) ? ['plant'] : ['mine', 'plant', 'power', 'warehouse', 'bunker'];
          if (!E.bLevel(p, 'barracks')) opts.push('barracks', 'barracks');
          if (!E.bLevel(p, 'shipyard') && myPlanets.length > 1 && R() < 0.4) opts.push('shipyard');
          best = [empty, opts[Math.floor(R() * opts.length)]];
        }
        if (best) act.build(p.id, best[0], best[1]);
      }
      // defenses
      if (p.queues.def.length < 1 && R() < 0.5 * W.def + st.t / 7200) {
        const opts = ['turret', 'turret', 'shield', 'mines'];
        if (st.t > 1800 && E.bLevel(p, 'shipyard') >= 4) opts.push('station');
        act.defense(p.id, opts[Math.floor(R() * opts.length)]);
      }
      // troops
      // v1.4: garrisons are uncapped, so the AI keeps its own v1.3-style target instead of pouring all crystal into troops
      const aiGar = 40 + E.bLevel(p, 'barracks') * 25 + E.bSum(p, 'bunker') * 15 + (E.hasSpec(p, 'defense') ? 30 : 0);
      if (p.queues.troop.length < 2 && E.bLevel(p, 'barracks') && E.troopCount(p.garrison) + p.queues.troop.reduce((a, q) => a + q.n, 0) < aiGar) {
        act.troop(p.id, 'inf', 6 + 2 * Math.min(4, E.bLevel(p, 'barracks')));
      }
      // ships (v1.9: Hollow worlds build none — the Hollow attacks only with Rift waves)
      if (f !== 'crisis' && p.queues.ship.length < 2 && E.bLevel(p, 'shipyard')) {
        const yard = E.bLevel(p, 'shipyard');
        const hulls = E.COMBAT_HULLS.filter(h => E.HULLS[h].yard <= yard && (!E.HULLS[h].tech || E.has(f, E.HULLS[h].tech)) && (!(E.PERS[f] && E.PERS[f].hulls) || E.PERS[f].hulls.includes(h) || yard < 3));
        // v1.8: rich late-game AIs mix in Warship Carriers (counter loop: Destroyers beat them, they beat Fighters)
        const cRich = hulls.includes('carrier') && em.res.crystal > E.HULLS.carrier.cost.crystal * 2;
        const h = cRich && R() < 0.3 ? 'carrier' : hulls.includes('destroyer') && R() < 0.35 ? 'destroyer' : 'fighter';
        const guard = st.fleets.filter(x => x.owner === f && x.sys === p.sys && x.guard).reduce((a, x) => a + x.ships.length, 0);
        if (guard < 10 + st.t / (240 * E.TIME_MUL)) act.ship(p.id, h, h === 'fighter' ? 3 : 1);
      }
    }
    // expansion
    em.ai.expandNext -= 8;
    if (em.ai.expandNext <= 0 && f !== 'crisis') {
      const per = (E.PERS[f] ? E.PERS[f].expand : 600) * E.TIME_MUL / eco * E.AI_EXPAND_GAP; // v1.5: AIs colonize far more often
      em.ai.expandNext = per * (0.8 + R() * 0.4);
      aiExpand(f);
    }
    // raider: raid trade routes
    if (E.PERS[f] && E.PERS[f].raid && st.t > 12 * 60 * E.TIME_MUL) {
      em.ai.raidNext -= 8;
      if (em.ai.raidNext <= 0) { em.ai.raidNext = (240 + R() * 120) * E.TIME_MUL / E.DIFFICULTY[st.diff].wave; aiRaid(f); }
    }
  }
  // v1.7 free-for-all campaigns
  for (const f of E.rivals()) {
    const em = st.emp[f]; if (!em || !em.alive || st.ffa === false || !E.PERS[f] || !E.PERS[f].aggressive || st.t < 14 * 60 * E.TIME_MUL) continue;
    if (em.ai.ffaNext == null) em.ai.ffaNext = (120 + R() * 120) * E.TIME_MUL;
    em.ai.ffaNext -= dt;
    if (em.ai.ffaNext <= 0) { em.ai.ffaNext = (150 + R() * 90) * E.TIME_MUL / Math.max(0.5, E.DIFFICULTY[st.diff].wave * 1.5); aiFfa(f); }
  }
  for (const fl of st.fleets) if (fl.ffa && !fl.path.length) { const p = E.sysPlanet(fl.sys); if (p && p.owner === fl.owner && !E.battleAt(fl.sys)) { fl.ffa = false; fl.wave = false; fl.guard = true; fl.order = 'idle'; } }
  // raid fleets go home after a while
  for (const fl of st.fleets) {
    if (fl.order !== 'raid' || fl.path.length) continue;
    fl.raidT = (fl.raidT || 0) + dt;
    if (fl.raidT > 240 * E.TIME_MUL && !E.battleAt(fl.sys)) { const d = E.nearestFriendly(fl.owner, fl.sys); if (d != null) { E.act.move(fl.id, d, 'return'); fl.wave = false; } }
  }
  // neutral growth
  st._ng = (st._ng || 0) + dt;
  if (st._ng > 600 * E.TIME_MUL) { st._ng = 0; for (const p of st.planets) if (p.owner === 'neutral') { p.garrison.inf = Math.round(p.garrison.inf * 1.1 + 1); if (R() < 0.3 && p.def.turret < 4) p.def.turret++; } }
}

E.hullsAllowedAt = function (t) {
  const o = ['fighter'];
  if (t > 8 * 60 * E.TIME_MUL) o.push('destroyer');
  if (t > 60 * 60 * E.TIME_MUL) o.push('carrier'); // v1.8: AI reserves add Warship Carriers late
  return o;
};
// spawn a fleet from a points budget (AI reserves)
E.spawnFleet = function (owner, sys, budget, opts) {
  opts = opts || {};
  const st = E.state;
  const f = E.makeFleet(owner, sys, opts.name || null);
  const hulls = opts.hulls || E.hullsAllowedAt(st.t);
  // AI uses the counter cycle: lean towards the hull that counters the target's most common warship
  let favour = null;
  if (opts.vs) { const cnt = {}; for (const g of st.fleets) if (g.owner === opts.vs) for (const s of g.ships) if (!E.HULLS[s.h].noWeapon) cnt[s.h] = (cnt[s.h] || 0) + 1;
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]; if (top) favour = Object.keys(E.COUNTERS).find(h => E.COUNTERS[h] === top[0]); }
  let left = budget, guard = 0;
  while (left > E.shipPts('fighter') && guard++ < 600) {
    const pick = [];
    for (let i = 0; i < hulls.length; i++) for (let k = 0; k <= (hulls[i] === 'carrier' ? 0 : i); k++) pick.push(hulls[i]);
    if (hulls.includes('fighter')) pick.push('fighter', 'fighter');
    if (favour && hulls.includes(favour)) for (let k = 0; k < hulls.length; k++) pick.push(favour);
    let h = pick[Math.floor(R() * pick.length)];
    if (E.shipPts(h) > left) h = hulls.filter(x => E.shipPts(x) <= left).pop();
    if (!h) break;
    f.ships.push(E.makeShip(owner, h)); left -= E.shipPts(h);
  }
  if (opts.troops) {
    const needSize = opts.troops; // in size units
    // v1.8: late-game AIs carry big landings in Freighters (100 troops each) instead of many Transports
    const th = opts.troops >= 80 && st.t > 75 * 60 * E.TIME_MUL && owner !== 'crisis' && E.ownedHull(owner, 'freighter') + Math.ceil(opts.troops / E.HULLS.freighter.cap) <= E.aiFreighterLimit(owner) ? 'freighter' : 'transport';
    const cap = E.shipStats(owner, { h: th, f: E.defaultFit(th) }).cap;
    const n = Math.ceil(needSize / cap);
    for (let i = 0; i < n; i++) f.ships.push(E.makeShip(owner, th));
    f.troops.inf += Math.ceil(needSize);
    clampTroops(f);
  }
  f.startPower = E.fleetStats(f).power;
  return f;
};
// v1.3: AI obeys the front-line rule too — nearest own planet with a legal route to sys
function aiSourceFor(owner, sys) {
  let best = null, bd = Infinity;
  for (const p of E.state.planets) if (p.owner === owner) { const pth = E.pathFor(owner, p.sys, sys); if (!pth) continue; const L = E.pathLen(p.sys, pth); if (L < bd) { bd = L; best = p; } }
  return best;
}
E.aiSourceFor = aiSourceFor;
function aiPlanetNearest(owner, sys) {
  let best = null, bd = Infinity;
  for (const p of E.state.planets) if (p.owner === owner) { const L = E.laneDist(p.sys, sys); if (L < bd) { bd = L; best = p; } }
  return best;
}
E.garrisonStrength = p => garrisonStrength(p);
function garrisonStrength(p) {
  return E.troopPower(E.defPool ? E.defPool(p) : p.garrison, p.owner, false) * E.garrisonDefMult(p, 0) * 1.0 + 1;
}
E.AI_EXPAND_GAP = 0.5;
function aiExpand(f) { return E.withPathBatch(() => aiExpand0(f)); } // v2.1 item 10
function aiExpand0(f) {
  const st = E.state;
  const mine = st.planets.filter(p => p.owner === f);
  let target = null, td = Infinity;
  for (const p of st.planets) {
    if (p.owner !== 'neutral') continue;
    if (st.fleets.some(x => x.owner === f && x.target === p.sys && x.path.length)) continue;
    const src = aiSourceFor(f, p.sys); if (!src) continue;
    const L = E.pathLen(src.sys, E.pathFor(f, src.sys, p.sys)) * (1 + garrisonStrength(p) / 60);
    if (L < td) { td = L; target = p; }
  }
  if (!target) return;
  const src = aiSourceFor(f, target.sys);
  const dr = E.defenseRating(target);
  const em = st.emp[f];
  const budget = Math.max(300, dr.power * 1.6 + 150 + st.t / 6);
  const troopNeed = Math.ceil(garrisonStrength(target) * 1.7 / 1.0) + 4;
  const cost = budget + troopNeed * 20;
  const have = em.res.metal + em.res.crystal;
  if (have < cost * 0.45) return;
  const sc = cost / have * 0.45; for (const k of E.RES) em.res[k] = Math.max(0, em.res[k] - em.res[k] * Math.min(0.9, sc));
  const fl = E.spawnFleet(f, src.sys, budget, { troops: troopNeed, name: 'Expedition' });
  E.act.move(fl.id, target.sys, 'attack');
  fl.wave = true;
}
function aiRaid(who) { return E.withPathBatch(() => aiRaid0(who)); } // v2.1 item 10
function aiRaid0(who) {
  const st = E.state;
  if (!st.emp[who].alive) return;
  // v1.5: trade ships are untouchable, so raiders strike your weakest reachable world instead of a lane
  { const tg = E.playerPlanets().filter(p => aiSourceFor(who, p.sys)).sort((a, b) => (E.defenseRating(a).power + garrisonStrength(a) * 5) - (E.defenseRating(b).power + garrisonStrength(b) * 5))[0];
    if (!tg) return; const src = aiSourceFor(who, tg.sys); if (!src) return;
    const fl = E.spawnFleet(who, src.sys, waveBudget() * 0.35 * (E.PERS[who].waveMult || 1), { name: 'Raiders', hulls: E.hullsAllowedAt(st.t).slice(0, 3) });
    E.act.move(fl.id, tg.sys, 'siege'); fl.wave = true; return; }
  const r = st.routes[Math.floor(R() * st.routes.length)];
  const path = r.path || E.routeHopsPath(r);
  const cands = path.filter(s => E.ownerOfSys(s) !== 'player' && aiSourceFor(who, s));
  const sys = cands.length ? cands[Math.floor(R() * cands.length)] : path[path.length - 1];
  if (sys == null) return;
  const src = aiSourceFor(who, sys); if (!src) return;
  const budget = waveBudget() * 0.2 * (E.PERS[who].waveMult || 1);
  const fl = E.spawnFleet(who, src.sys, budget, { name: 'Raiders', hulls: E.hullsAllowedAt(st.t).slice(0, 3) });
  E.act.move(fl.id, sys, 'raid'); fl.wave = true;
  if (E.state.systems[sys]) E.addLog(E.FACTIONS[who].short + ' raiders spotted heading for your trade lane at ' + st.systems[sys].name, 'warn', sys);
}

// v1.7 free-for-all: aggressive rival AIs also campaign against each other's worlds. Targets are scored by distance and
// softness; your worlds are in the same pool (slightly less attractive), so a rival may pick a neighbour over you.
function aiFfa(f) { return E.withPathBatch(() => aiFfa0(f)); } // v2.1 item 10
function aiFfa0(f) {
  const st = E.state, em = st.emp[f];
  if (st.ffa === false || !em || !em.alive || !E.PERS[f] || !E.PERS[f].aggressive) return null;
  if (st.fleets.some(x => x.owner === f && x.ffa && (x.path.length || E.battleAt(x.sys)))) return null; // one campaign at a time
  let best = null, bs = Infinity;
  for (const p of st.planets) {
    if (p.owner === f || p.owner === 'neutral' || p.owner === 'crisis' || !E.hostile(f, p.owner)) continue;
    const src = aiSourceFor(f, p.sys); if (!src) continue;
    const pth = E.pathFor(f, src.sys, p.sys); if (!pth) continue;
    const L = E.pathLen(src.sys, pth);
    const sc = L * (1 + garrisonStrength(p) / 50 + E.defenseRating(p).power / 2500) * (E.team(p.owner) === 'player' ? 1.3 : 1);
    if (sc < bs) { bs = sc; best = { p, src }; }
  }
  if (!best) return null;
  const target = best.p, src = best.src, dr = E.defenseRating(target);
  const wb = waveBudget() * (E.PERS[f].waveMult || 1);
  const budget = Math.min(wb * 1.2, Math.max(wb * 0.55, dr.power * 1.4 + 150));
  const troopNeed = Math.ceil(garrisonStrength(target) * 1.5) + 6;
  const cost = budget + troopNeed * 20, have = em.res.metal + em.res.crystal;
  if (have < cost * 0.45) return null;
  const sc = cost / have * 0.45; for (const k of E.RES) em.res[k] = Math.max(0, em.res[k] - em.res[k] * Math.min(0.9, sc));
  const fl = E.spawnFleet(f, src.sys, budget, { troops: troopNeed, name: E.FACTIONS[f].short + ' Strike', vs: target.owner });
  fl.ffa = true; fl.wave = true;
  E.act.move(fl.id, target.sys, 'attack');
  return { fl, target };
}
E.aiFfa = aiFfa;
E.WAVE_SIZE = 1.7; E.WAVE_GAP = 1.75; // v1.5: fewer but bigger attacks
function waveBudget() {
  const st = E.state;
  return 170 * E.WAVE_SIZE * E.DIFFICULTY[st.diff].wave * Math.pow(1 + st.t / (480 * E.TIME_MUL), 1.5);
}
E.waveBudget = waveBudget;
function waves() { return E.withPathBatch(waves0); } // v2.1 item 10
function waves0() {
  const st = E.state;
  if (st.t < st.waves.next) return;
  const D = E.DIFFICULTY[st.diff];
  const shrink = Math.max(0.55, 1 - st.t / 10800);
  const aggr = E.rivals().filter(o => E.PERS[o].aggressive && st.emp[o].alive).length;
  const crowd = E.clamp(1 / (0.7 + 0.15 * aggr), 0.6, 1.3) / (1 + 0.15 * Math.log2(st.cfg.n / 20));
  st.waves.next = st.t + D.waveEvery * E.WAVE_GAP * shrink * crowd * (0.85 + R() * 0.3);
  const live = o => st.emp[o] && st.emp[o].alive && st.planets.some(p => p.owner === o);
  const cands = E.rivals().filter(o => E.PERS[o].aggressive && live(o));
  for (const o of E.rivals()) if (E.PERS[o].peaceful && live(o) && (st.emp[o].war || (st.t > 60 * 60 * E.TIME_MUL && R() < 0.3 / Math.max(1, E.rivals().filter(x => E.PERS[x].peaceful).length)))) cands.push(o);
  if (!cands.length) return;
  const f = cands[st.waves.count % cands.length];
  st.waves.count++;
  let mine = E.playerPlanets(); if (!mine.length) return;
  const allyPl = st.planets.filter(p => E.isAlly(p.owner));
  if (allyPl.length && R() < 0.3) mine = allyPl; // v1.4: rivals also hit your allies
  // choose target
  let target;
  mine = mine.filter(p => aiSourceFor(f, p.sys)); // only the player's front line is reachable
  if (!mine.length) return;
  if (E.PERS[f].raid && f === 'raider') target = mine.slice().sort((a, b) => (E.defenseRating(a).power + garrisonStrength(a) * 5) - (E.defenseRating(b).power + garrisonStrength(b) * 5))[0];
  else { let bd = Infinity; for (const p of mine) { const src = aiSourceFor(f, p.sys); if (!src) continue; const L = E.pathLen(src.sys, E.pathFor(f, src.sys, p.sys)); if (L < bd) { bd = L; target = p; } } }
  if (!target) return;
  if (mine[0] && mine[0].owner === 'player' && R() < 0.12 && mine.length > 1 && aiSourceFor(f, (st.planets[st.emp.player.home] || {}).sys)) target = st.planets[st.emp.player.home] && st.planets[st.emp.player.home].owner === 'player' ? st.planets[st.emp.player.home] : target;
  const src = aiSourceFor(f, target.sys); if (!src) return;
  const budget = waveBudget() * (E.PERS[f].waveMult || 1);
  const withTroops = st.t > 18 * 60 * E.TIME_MUL && R() < E.PERS[f].troopP;
  const troopNeed = withTroops ? Math.min(Math.ceil(garrisonStrength(target) * 1.4) + 6, Math.ceil(budget / 14)) : 0;
  const fl = E.spawnFleet(f, src.sys, budget - troopNeed * 5, { troops: troopNeed, name: E.FACTIONS[f].short + ' Siege Wave', hulls: E.PERS[f].hulls ? E.hullsAllowedAt(st.t).filter(h => E.PERS[f].hulls.includes(h) || h === 'fighter') : undefined, vs: 'player' });
  // add part of the guard
  const guard = st.fleets.find(x => x.owner === f && x.guard && x.sys === src.sys && !x.path.length);
  if (guard && guard.ships.length > 6 && st.t > 30 * 60 * E.TIME_MUL) { let added = 0; while (guard.ships.length > 4 && added < budget * 0.3) { const s = guard.ships.pop(); added += E.shipPts(s.h); fl.ships.push(s); } }
  fl.startPower = E.fleetStats(fl).power;
  fl.wave = true;
  E.act.move(fl.id, target.sys, troopNeed ? 'attack' : 'siege');
  const eta = E.pathLen(src.sys, E.pathFor(f, src.sys, target.sys)) / (E.fleetStats(fl).speed * E.pxPerSec());
  E.emit('wave', { f, target, fl });
}

// v2.1 item 3: the Rift runs a continuous cycle. It first opens at crisisAt, stays OPEN for E.RIFT_OPEN game-seconds
// sending cfg.waves waves spread evenly over the opening, then CLOSES for E.RIFT_CLOSED (Hollow fleets still out there
// collapse with it, Hollow-held worlds fall back to independents), then opens again — forever. Each new opening
// starts a little stronger (wave strength index +1.5 per cycle) on top of the usual growth with game time.
E.RIFT_OPEN = 2 * 3600; E.RIFT_CLOSED = 2 * 3600; E.RIFT_CYCLE_STEP = 1.5; E.RIFT_WARN = 600; // v2.2 item 7: 10 game-min warning
E.riftWaveGap = () => E.RIFT_OPEN / Math.max(1, E.crisisWaves());
E.riftWaveIdx = c => (c.cw || 0) + E.RIFT_CYCLE_STEP * Math.max(0, (c.cycle || 1) - 1);
function riftOpen(c, st, rid) {
  c.started = true; c.open = true; c.cycle = (c.cycle || 0) + 1; c.cw = 0; c.openT = st.t; c.phaseEnd = st.t + E.RIFT_OPEN; c.nextWave = st.t; c.defeated = false;
  const NW = E.crisisWaves();
  E.addLog(c.cycle === 1 ? '☢ THE HOLLOW has emerged from the Rift. It stays open for ' + E.fmtTime(E.RIFT_OPEN) + ' and sends ' + NW + ' waves.' : '☢ The Rift has re-opened (cycle ' + c.cycle + ') — ' + NW + ' waves over the next ' + E.fmtTime(E.RIFT_OPEN) + '.', 'bad', rid);
  E.toast(c.cycle === 1 ? '☢ The Hollow invades!' : '☢ The Rift re-opens!', 'bad', rid); E.emit('crisis'); E.emit('riftPhase', { open: true, cycle: c.cycle });
}
function riftClose(c, st) {
  c.open = false; c.phaseEnd = st.t + E.RIFT_CLOSED; c.warned = false; c.closedN = (c.closedN || 0) + 1;
  st.fleets = st.fleets.filter(f => f.owner !== 'crisis');
  for (const p of st.planets) if (p.owner === 'crisis') { p.owner = 'neutral'; p.garrison = { inf: 19 }; }
  E.addLog('★ The Rift has closed — the Hollow fleets collapse with it. It re-opens in ' + E.fmtTime(E.RIFT_CLOSED) + '.', 'good'); E.toast('★ The Rift closes', 'good'); E.emit('sfx', 'victory'); E.emit('riftPhase', { open: false, cycle: c.cycle });
}
E.riftNextOpen = function () { const st = E.state, c = st.crisis; return !c.started ? E.crisisAt() : c.open ? null : c.phaseEnd; };
function crisis() {
  const st = E.state, c = st.crisis, rid = st.riftId, NW = E.crisisWaves();
  if (rid == null || rid < 0) return;
  const nextOpen = E.riftNextOpen();
  // v2.2 item 7: the warning fires 10 game-minutes (E.RIFT_WARN) before every opening
  if (nextOpen != null && !c.warned && st.t >= nextOpen - E.RIFT_WARN && st.t < nextOpen) { c.warned = true; c.warnT = st.t; const left = Math.max(0, nextOpen - st.t); E.addLog('☢ The Rift is destabilising — it opens in ' + E.fmtTime(left) + '. Get your fleets home.', 'warn', rid); E.toast('⚠ Rift opens in ' + E.fmtTime(left) + '!', 'warn', rid); E.emit('sfx', 'alert'); E.emit('riftWarn', { at: nextOpen, left }); }
  if (nextOpen != null && st.t >= nextOpen) riftOpen(c, st, rid);
  if (!c.open) return;
  if (st.t >= c.phaseEnd) { riftClose(c, st); return; }
  {
    if (c.cw < NW && st.t >= c.nextWave) {
      c.nextWave = st.t + E.riftWaveGap(); c.cw++; c.waveIdx = (c.waveIdx || 0) + 1; c.lastWaveT = st.t;
      const wi = E.riftWaveIdx(c);
      // v1.9 items 10/13/18: every wave launches FROM THE RIFT as one fleet per target, aimed at EVERY empire still on
      // the map at once (you, each rival, each ally). One summary log/toast per wave instead of one per fleet.
      const plan = E.riftWavePlan(wi), sent = [];
      for (const w of plan.targets) {
        const tgt = w.p;
        const troops = wi >= 3 ? Math.ceil(garrisonStrength(tgt) * 1.3 / Math.sqrt(w.share)) + 8 : 0;
        const fl = E.spawnFleet('crisis', rid, w.budget, { troops, name: 'Hollow Wave ' + c.cw + ' → ' + E.FACTIONS[w.owner].short, hulls: ['fighter', 'destroyer'], vs: w.owner });
        fl.wave = true; fl.riftWave = c.cw;
        E.act.move(fl.id, tgt.sys, troops ? 'attack' : 'siege');
        sent.push({ fl, tgt, owner: w.owner });
      }
      c.lastWave = { idx: c.cw, cycle: c.cycle, t: st.t, fleets: sent.length, ships: sent.reduce((a, x) => a + x.fl.ships.length, 0), mine: sent.filter(x => x.owner === 'player' || E.isAlly(x.owner)).map(x => x.tgt.sys) };
      const mine = sent.filter(x => x.owner === 'player');
      E.addLog('☢ Hollow wave ' + c.cw + '/' + NW + (c.cycle > 1 ? ' (cycle ' + c.cycle + ')' : '') + ': ' + sent.length + ' fleet' + (sent.length === 1 ? '' : 's') + ' (' + E.fmtN(c.lastWave.ships) + ' ships) left the Rift for every empire' + (mine.length ? ' — ' + mine.map(x => x.tgt.name).join(', ') + ' targeted' : ''), 'bad', mine.length ? mine[0].tgt.sys : rid);
      E.toast('☢ Hollow wave ' + c.cw + '/' + NW + ' — ' + sent.length + ' fleets → every empire' + (mine.length ? ' (' + mine.length + ' at you)' : ''), 'bad', mine.length ? mine[0].tgt.sys : rid);
      E.emit('riftWave', c.lastWave);
      E.emit('sfx', 'alert');
    }
    // crisis fleets that finish sieges pick a new target rather than going home
    let merged = false;
    for (const f of st.fleets) {
      if (f.owner !== 'crisis' || f.path.length || E.battleAt(f.sys) || !f.ships.length) continue;
      const p = E.sysPlanet(f.sys);
      if (p && p.owner === 'crisis' && !E.troopCount(f.troops)) {
        if (!f.riftWave && !f.wave) continue;
        for (const g of st.fleets) if (g !== f && g.owner === 'crisis' && g.sys === f.sys && !g.path.length && g.ships.length && !E.troopCount(g.troops)) { f.ships.push(...g.ships); g.ships = []; merged = true; }
        const next = st.planets.filter(q => q.owner !== 'crisis').sort((a, b) => E.laneDist(f.sys, a.sys) - E.laneDist(f.sys, b.sys))[0];
        if (next) E.act.move(f.id, next.sys, 'siege');
      }
    }
    if (merged) E.cleanupFleets();
  }
}
// v1.9: what Rift wave `idx` will send — one fleet per empire (you get 1–3 depending on map size), from the Rift
E.RIFT_AI_SHARE = 0.7;
E.riftWaveTotal = function (idx, t) {
  const st = E.state, D = E.DIFFICULTY[st.diff];
  return 2600 * D.crisisMult * st.cfg.crisisMult * (1 + 0.32 * idx) * Math.max(1, Math.pow(1 + t / (480 * E.TIME_MUL), 1.5) / 46);
};
E.riftWavePlan = function (idx, t) {
  const st = E.state, rid = st.riftId; t = t == null ? st.t : t;
  const total = E.riftWaveTotal(idx, t), targets = [];
  const nFleets = st.cfg.n >= 150 ? 3 : st.cfg.n >= 80 ? 2 : st.cfg.n >= 40 && idx % 2 === 0 ? 2 : 1;
  const near = o => st.planets.filter(p => p.owner === o && isFinite(E.laneDist(rid, p.sys))).sort((a, b) => E.laneDist(rid, a.sys) - E.laneDist(rid, b.sys));
  const pl = near('player');
  for (let k = 0; k < Math.min(nFleets, pl.length); k++) targets.push({ owner: 'player', p: pl[k], budget: total / nFleets * (nFleets > 1 ? 1.15 : 1), share: nFleets });
  for (const o of E.rivals().concat(E.allies())) { const list = near(o); if (list.length) targets.push({ owner: o, p: list[0], budget: total * E.RIFT_AI_SHARE, share: 1 }); }
  return { total, targets };
};
E.riftInfo = function () {
  const st = E.state; if (!st || !st.crisis || st.riftId == null || st.riftId < 0) return null;
  const c = st.crisis, NW = E.crisisWaves(), AVG = 280; // average Hollow ship value (fighters/destroyers mix)
  if (!c.open) { // closed (or not opened yet): countdown to the next opening + size of its first wave
    const at = E.riftNextOpen(), cyc = (c.cycle || 0) + 1, plan = E.riftWavePlan(1 + E.RIFT_CYCLE_STEP * (cyc - 1), Math.max(st.t, at));
    const mine = plan.targets.filter(x => x.owner === 'player').reduce((a, x) => a + x.budget, 0);
    return { phase: c.started ? 'closed' : 'pre', open: false, cycle: cyc, idx: 1, NW, in: Math.max(0, at - st.t), opensIn: Math.max(0, at - st.t), ships: Math.round(plan.targets.reduce((a, x) => a + x.budget, 0) / AVG), mine: Math.round(mine / AVG), fleets: plan.targets.length };
  }
  const closesIn = Math.max(0, c.phaseEnd - st.t);
  if (c.cw >= NW) return { phase: 'last', open: true, cycle: c.cycle, idx: c.cw, NW, in: closesIn, closesIn };
  const wi = (c.cw + 1) + E.RIFT_CYCLE_STEP * (c.cycle - 1), plan = E.riftWavePlan(wi, Math.max(st.t, c.nextWave));
  const mine = plan.targets.filter(x => x.owner === 'player').reduce((a, x) => a + x.budget, 0);
  return { phase: 'wave', open: true, cycle: c.cycle, idx: c.cw + 1, NW, in: Math.max(0, c.nextWave - st.t), closesIn, ships: Math.round(plan.targets.reduce((a, x) => a + x.budget, 0) / AVG), mine: Math.round(mine / AVG), fleets: plan.targets.length };
};
// Hollow fleets ignore the 200s go-home rule (handled above by not being 'wave' AI with nearestFriendly at rift)

function checkEnd() {
  const st = E.state; if (st.over) return;
  const home = st.planets[st.emp.player.home];
  if (!home || home.owner !== 'player') {
    st.over = { win: false, t: st.t, reason: 'Your capital ' + (home ? home.name : '') + ' has fallen.' };
    E.emit('gameover', st.over); E.emit('sfx', 'defeat'); return;
  }
  // v1.4: an enemy is defeated when it has no colonized systems; victory = every enemy defeated (Endless: next stage)
  E.markDefeated();
  if (E.rivals().every(o => E.isDefeated(o))) {
    if (st.mode === 'endless' && E.endlessNext()) return;
    const have = E.playerPlanets().length;
    st.over = { win: true, t: st.t, reason: (st.mode === 'endless' ? 'Endless mode complete — all ' + E.rivals().length + ' rivals of the 160-system Expanse defeated. ' : 'Every rival empire has been defeated. ') + 'You hold ' + have + ' systems.' };
    E.emit('gameover', st.over); E.emit('sfx', 'victory');
  }
}

// ================= early warning · battle windows · scouting · odds (v1.1) =================
function windowAt(sys) { return E.state.windows.find(w => w.sys === sys && !w.closed) || null; }
E.windowAt = windowAt;
function hostileFleetsAt(sys) {
  const p = E.sysPlanet(sys); if (!p || p.owner !== 'player') return [];
  return E.state.fleets.filter(f => f.sys === sys && !f.path.length && f.ships.length && hostileToPlanet(f, p));
}
function inActiveBattle(f) { return E.state.battles.some(b => !b.done && b.fleets.includes(f.id)); }

// Hostile fleets heading for one of your systems (or raiding one of your trade lanes), soonest first.
E.incoming = function () {
  const st = E.state, out = [];
  for (const f of st.fleets) {
    if (f.owner === 'player' || !f.path || !f.path.length || !f.ships || !f.ships.length) continue;
    if (!E.hostile(f.owner, 'player')) continue;
    const tgt = f.path[f.path.length - 1], p = E.sysPlanet(tgt);
    let kind = null;
    if (p && p.owner === 'player') kind = 'attack';
    else if (f.order === 'raid' && st.routes.some(r => (r.path || []).includes(tgt))) kind = 'raid';
    if (!kind) continue;
    const al = st.alerts[f.id];
    out.push({ fid: f.id, f, kind, target: tgt, eta: E.fleetETA(f), owner: f.owner, level: (al && al.level) || 0, scouted: !!(al && al.level > 0) });
  }
  return out.sort((a, b) => a.eta - b.eta);
};
// ---- Scouting (v1.2): Scout Post buildings, not ships ----
// Effective scout level covering one of your systems: its own Scout Post, or a nearby post (−1 level per tile away).
E.scoutCoverage = function (sys) {
  const st = E.state; let best = 0;
  for (const p of st.planets) {
    if (p.owner !== 'player') continue; const L = E.bLevel(p, 'scoutpost'); if (!L) continue;
    // v1.5: a Scout Post reads incoming attacks on ANY of your planets (no range falloff)
    if (L > best) best = L;
  }
  return Math.max(0, Math.min(E.BUILD_MAX_LVL, best));
};
// Relative error of a scout report: Lv1 ≈ ±47%, Lv5 ≈ ±23%, Lv10 ≈ ±1.5% (near-exact), Lv15 ≈ ±0.5%. 0/none → unknown.
// v1.9 item 11: Lv1 ±50%, Lv5 ±33%, Lv10 ±15%, Lv14 ±4.5% (always a range below Lv15); Lv15 = exact (0).
E.SCOUT_EXACT = 15;
E.scoutErr = function (L) { if (!L || L <= 0) return null; if (L >= E.SCOUT_EXACT) return 0; return 0.03 + 0.47 * Math.pow((E.SCOUT_EXACT - Math.max(1, L)) / 14, 1.3); };
function hash01(a, b) { let h = (a * 2654435761 ^ b * 40503) >>> 0; h = (h ^ h >>> 13) * 1274126177 >>> 0; return (h % 10007) / 10007; }
// A quantity as a scout of level L reports it: [lo, hi], always containing the true value, not centred on it.
E.scoutRange = function (n, L, salt) {
  const e = E.scoutErr(L); if (e == null) return null;
  if (!n) return [0, 0];
  const c = (hash01(salt || 1, Math.round(L)) - 0.5) * e;
  let lo = Math.floor(n * (1 - e + c)), hi = Math.ceil(n * (1 + e + c));
  lo = Math.max(0, Math.min(lo, n)); hi = Math.max(hi, n);
  if (e === 0) lo = hi = n; // v1.9: Lv15 scouts are exact
  return [lo, hi];
};
E.fmtRange = function (r) { return !r ? '?' : r[0] === r[1] ? String(r[0]) : r[0] + '–' + r[1]; };
// What a scout of level L sees of a fleet: ranges per ship class and troop type.
E.fleetIntel = function (f, L) {
  if (!L || L <= 0) return null;
  const c = E.fleetComposition(f), ships = {}, troops = {};
  for (const h in c.ships) ships[h] = E.scoutRange(c.ships[h], L, f.id * 31 + h.length * 7 + h.charCodeAt(0));
  for (const k in c.troops) troops[k] = E.scoutRange(c.troops[k], L, f.id * 17 + k.charCodeAt(0) * 3);
  return { level: L, ships, troops, total: E.scoutRange(f.ships.length, L, f.id * 13 + 5) };
};
// Legacy rough estimate for a completely unscouted fleet (ship count only, very wide).
E.fleetEstimate = function (f) { const r = E.scoutRange(f.ships.length, 1, f.id * 13 + 5); return { lo: r[0], hi: r[1] }; };
E.fleetComposition = function (f) {
  const ships = {}; for (const s of f.ships) ships[s.h] = (ships[s.h] || 0) + 1;
  const troops = {}; for (const k of E.TROOP_KEYS) if (f.troops[k]) troops[k] = f.troops[k];
  return { ships, troops };
};
// Send a planet's scouts to scan an enemy planet (kind 'planet', id = system) or fleet (kind 'fleet', id = fleet id).
// Scouts fly 4× faster than fleets (30 s per tile) and need 20 s to scan. One mission per Scout Post at a time.
E.SCOUT_HOP = 30 * E.TIME_MUL; E.SCOUT_SCAN = 20 * E.TIME_MUL;
E.scoutMissionTime = function (pid, kind, id) {
  const st = E.state, p = st.planets[pid]; let sys;
  if (kind === 'fleet') { const f = E.fleetById(id); if (!f) return Infinity; sys = f.path.length ? f.path[0] : f.sys; } else sys = id;
  // v1.9 item 11: ≤ 60 s at Lv1, shrinking with level (Lv5 ≈ 33 s, Lv9 ≈ 7 s); nearer targets are quicker; Lv10+ instant
  const L = E.bLevel(p, 'scoutpost');
  if (L >= E.SCOUT_INSTANT) return 0;
  return E.scoutCapTime(L) * Math.min(1, (E.hops(p.sys, sys) + 1) / 4);
};
E.SCOUT_INSTANT = 10; E.SCOUT_MAX_T = 60; E.SCOUT_AUTO_T = 10;
E.scoutCapTime = function (L) { return L >= E.SCOUT_INSTANT ? 0 : E.SCOUT_MAX_T * (E.SCOUT_INSTANT - Math.max(1, L)) / 9 + 0; };
E.scoutPosts = function () { return E.state.planets.filter(p => p.owner === 'player' && E.bLevel(p, 'scoutpost') > 0); };
E.bestScoutFor = function (kind, id) {
  const st = E.state; let best = null;
  for (const p of E.scoutPosts()) { if (st.scoutMissions.some(m => m.from === p.id)) continue; const t = E.scoutMissionTime(p.id, kind, id); const L = E.bLevel(p, 'scoutpost'); if (!best || L > best.L || (L === best.L && t < best.t)) best = { p, t, L }; }
  return best;
};
act.scoutMission = function (pid, kind, id) {
  const st = E.state; st.scoutMissions = st.scoutMissions || [];
  if (pid == null) { const b = E.bestScoutFor(kind, id); if (!b) return fail(E.scoutPosts().length ? 'All Scout Posts are busy' : 'Build a Scout Post first'); pid = b.p.id; }
  const p = st.planets[pid]; if (!p || p.owner !== 'player') return fail('Not your planet');
  const L = E.bLevel(p, 'scoutpost'); if (!L) return fail('This planet has no Scout Post');
  if (st.scoutMissions.some(m => m.from === pid)) return fail('These scouts are already out');
  if (kind === 'fleet' && !E.fleetById(id)) return fail('Fleet lost');
  const t = E.scoutMissionTime(pid, kind, id);
  st.scoutMissions.push({ id: E.id(), from: pid, kind, target: id, level: L, start: st.t, done: st.t + t });
  if (p.owner === 'player') E.emit('sfx', 'click');
  if (t <= 0) scoutTick(); // v1.9: Lv10+ reports instantly
  return { ok: true, eta: t, level: L };
};
function scoutTick() {
  const st = E.state; st.scoutMissions = st.scoutMissions || []; st.intel = st.intel || {}; st.fleetIntel = st.fleetIntel || {};
  for (const m of st.scoutMissions.slice()) {
    if (st.t < m.done) continue;
    st.scoutMissions.splice(st.scoutMissions.indexOf(m), 1);
    const from = st.planets[m.from], L = from && from.owner === 'player' ? Math.max(m.level, E.bLevel(from, 'scoutpost')) : m.level;
    if (m.kind === 'fleet') {
      const f = E.fleetById(m.target); if (!f || !f.ships.length) { E.addLog('📡 Scouts lost track of the fleet', 'info'); continue; }
      st.fleetIntel[f.id] = { level: L, t: st.t };
      const al = st.alerts[f.id]; if (al) al.level = Math.max(al.level || 0, L);
      const tot = E.fleetIntel(f, L).total;
      E.addLog('📡 Scouts (Lv' + L + ') report ' + E.FACTIONS[f.owner].short + ' fleet: ' + E.fmtRange(tot) + ' ships', 'info', f.path.length ? f.path[f.path.length - 1] : f.sys);
      E.toast('📡 Scout report: ' + E.FACTIONS[f.owner].short + ' fleet ≈ ' + E.fmtRange(tot) + ' ships', 'good');
      E.emit('scouted', { fid: f.id, level: L });
    } else {
      const p = E.sysPlanet(m.target); if (!p) continue;
      planetIntel(p, L);
      E.addLog('📡 Scouts (Lv' + L + ') scanned ' + p.name, 'info', m.target);
      E.toast('📡 Scan of ' + p.name + ' complete', 'good', m.target);
      E.emit('scouted', { sys: m.target, level: L });
    }
  }
  // v1.9 item 11: a Lv15 Scout Post keeps exact intel on every foreign world and every non-friendly fleet, refreshed every 10 s
  if (E.scoutCoverage() >= E.SCOUT_EXACT && st.t >= (st.autoScoutT || 0)) {
    st.autoScoutT = st.t + E.SCOUT_AUTO_T;
    for (const p of st.planets) if (p.owner !== 'player') planetIntel(p, E.SCOUT_EXACT);
    for (const f of st.fleets) if (E.team(f.owner) !== 'player' && f.ships.length) { st.fleetIntel[f.id] = { level: E.SCOUT_EXACT, t: st.t, auto: true }; const al = st.alerts[f.id]; if (al) { al.level = E.SCOUT_EXACT; al.scouted = true; } }
    if (!st.autoScoutOn) { st.autoScoutOn = true; E.addLog('📡 Scout network Lv15 online: every world and fleet is now auto-scouted with exact numbers', 'good'); }
  }
}
function planetIntel(p, L) {
  const st = E.state, sys = p.sys;
  const docked = st.fleets.filter(f => f.sys === sys && !f.path.length && f.owner === p.owner);
  const ships = {}; for (const f of docked) for (const s of f.ships) ships[s.h] = (ships[s.h] || 0) + 1;
  const R2 = (n, salt) => E.scoutRange(n, L, sys * 101 + salt);
  st.intel[sys] = { level: L, t: st.t, owner: p.owner,
    ships: Object.fromEntries(Object.entries(ships).map(([h, n]) => [h, R2(n, h.charCodeAt(0))])),
    troops: Object.fromEntries(E.TROOP_KEYS.filter(k => p.garrison[k]).map(k => [k, R2(p.garrison[k], k.charCodeAt(1) + 50)])),
    def: { turret: R2(p.def.turret, 3), shield: R2(p.def.shield, 4), station: R2(p.def.station, 5), mines: R2(p.def.mines, 6) } };
}
E.planetIntel = planetIntel;
E.autoScouting = function () { const st = E.state; if (st._asT !== st.t) { st._asT = st.t; st._asV = E.scoutCoverage() >= E.SCOUT_EXACT; } return st._asV; };
E.scoutTick = scoutTick;

// A fleet that finished an attack/siege/deliver and now sits at one of its owner's own worlds goes back to idle,
// so it can merge, defend and be sent again.
function settleOrders() {
  const st = E.state;
  for (const f of st.fleets) {
    if (f.owner !== 'player' || f.path.length || f.routeId || !(f.order === 'attack' || f.order === 'siege')) continue;
    const p = E.sysPlanet(f.sys);
    if (p && p.owner === f.owner && !E.battleAt(f.sys)) { f.order = 'idle'; f.target = null; }
  }
}
E.alertSummary = function (list) {
  const st = E.state, by = {}, tg = [];
  let soon = Infinity, sys = list[0].target;
  for (const a of list) { by[a.owner] = (by[a.owner] || 0) + 1; if (a.eta < soon) { soon = a.eta; sys = a.target; } const nm = st.systems[a.target].name; if (!tg.includes(nm)) tg.push(nm); }
  const who = Object.keys(by).map(o => E.FACTIONS[o].short + (by[o] > 1 ? ' ×' + by[o] : '')).join(', ');
  const where = tg.slice(0, 3).join(', ') + (tg.length > 3 ? ' +' + (tg.length - 3) + ' more' : '');
  return { n: list.length, sys, short: list.length + ' attacks inbound (' + who + ') → ' + where + ' · first in ' + E.fmtTime(soon), long: list.length + ' fleets inbound (' + who + ') → ' + where + ' — first arrives in ' + E.fmtTime(soon) };
};
function alertsTick(dt) {
  const st = E.state;
  const inc = E.incoming(), seen = new Set(), fresh = []; let covAll = -1;
  st.fleetIntel = st.fleetIntel || {};
  for (const a of inc) {
    seen.add(a.fid);
    const cov = a.kind === 'attack' ? (covAll < 0 ? (covAll = E.scoutCoverage(a.target)) : covAll) : 0; // v2.1 item 10: same for every target — once per tick
    const fi = st.fleetIntel[a.fid];
    const lvl = Math.max(cov, fi ? fi.level : 0);
    if (!st.alerts[a.fid]) {
      st.alerts[a.fid] = { t: st.t, level: lvl, scouted: lvl > 0, kind: a.kind };
      if (a.kind === 'attack') { fresh.push({ a, lvl }); E.emit('incoming', a); }
    } else { const al = st.alerts[a.fid]; if (lvl > (al.level || 0)) { al.level = lvl; al.scouted = true; } }
  }
  // v1.9 item 18: new attacks spotted in the same tick (a Rift wave, a coordinated strike) become ONE summary
  if (fresh.length === 1) {
    const { a, lvl } = fresh[0], nm = st.systems[a.target].name, F = E.FACTIONS[a.owner];
    const est = lvl ? ' — scouts: ' + E.fmtRange(E.fleetIntel(a.f, lvl).total) + ' ships' : '';
    E.addLog('⚠ ' + F.name + ' fleet inbound to ' + nm + ' — arrives in ' + E.fmtTime(a.eta) + est, 'warn', a.target);
    E.toast('⚠ ' + F.short + ' fleet → ' + nm + ' in ' + E.fmtTime(a.eta) + est, 'warn', a.target);
    E.emit('sfx', 'alert');
  } else if (fresh.length > 1) {
    const s0 = E.alertSummary(fresh.map(x => x.a));
    E.addLog('⚠ ' + s0.long, 'warn', s0.sys); E.toast('⚠ ' + s0.short, 'warn', s0.sys);
    st.stats.groupedAlerts = (st.stats.groupedAlerts || 0) + 1;
    E.emit('sfx', 'alert'); E.emit('alertGroup', s0);
  }
  for (const k of Object.keys(st.alerts)) {
    if (seen.has(+k)) continue;
    const f = E.fleetById(+k);
    if (!f || !f.ships.length || f.path.length || !windowAt(f.sys)) delete st.alerts[k];
  }
}

// ---- battle windows ----
function registerWindow(w) {
  const st = E.state, p = E.sysPlanet(w.sys);
  for (const f of st.fleets) {
    if (f.sys !== w.sys || f.path.length || !f.ships.length) continue;
    const isAtk = f.owner !== 'player' && hostileToPlanet(f, p), isDef = f.owner === 'player';
    if (!isAtk && !isDef) continue;
    if (isAtk && !w.owners.includes(f.owner)) w.owners.push(f.owner);
    if (!w.reg) w.reg = {}; if (!w.regTroops) w.regTroops = {}; if (!w.owners) w.owners = [];
    for (const s of f.ships) if (!w.reg[s.uid]) w.reg[s.uid] = { side: isAtk ? 'a' : 'd', h: s.h };
    if (isAtk && w.regTroops[f.id] == null) w.regTroops[f.id] = E.troopCount(f.troops);
  }
}
function openWindow(sys, f) {
  const st = E.state, p = E.sysPlanet(sys);
  let w = windowAt(sys);
  if (!w) {
    // v1.5: the 30 s window only runs when one of your (or an ally's) fleets can arrive inside it; otherwise fight now
    const help = E.helpWithin(sys, E.ATTACK_WINDOW);
    w = { id: E.id(), sys, start: st.t, end: st.t + (help ? E.ATTACK_WINDOW : 0), quick: !help, closed: false, reg: {}, regTroops: {}, owners: [], snap: { turret: p.def.turret, station: p.def.station, garrison: Object.assign({}, p.garrison) } };
    st.windows.push(w);
    st._bd = 1;
    if (!st.alerts[f.id]) { const L = E.scoutCoverage(sys); st.alerts[f.id] = { t: st.t, level: L, scouted: L > 0, kind: 'attack' }; }
    if (help) {
      E.addLog('⚔ ' + E.FACTIONS[f.owner].short + ' fleet arrived at ' + p.name + ' — battle window open for ' + E.ATTACK_WINDOW + 's. Reinforcements can still join!', 'battle', sys);
      E.toast('⚔ Battle window open at ' + p.name + ' — ' + E.ATTACK_WINDOW + 's to reinforce!', 'bad', sys);
    } else {
      E.addLog('⚔ ' + E.FACTIONS[f.owner].short + ' fleet attacks ' + p.name + ' — no fleet can reach it within ' + E.ATTACK_WINDOW + 's, so the battle starts now.', 'battle', sys);
      E.toast('⚔ ' + p.name + ' under attack — battle resolving now', 'bad', sys);
    }
    E.emit('sfx', 'alert'); E.emit('windowOpen', w);
  }
  registerWindow(w);
}
// Can any of your or your allies' armed fleets (not already there) arrive at sys within `sec` seconds?
E.helpWithin = function (sys, sec) {
  for (const f of E.state.fleets) {
    if (E.team(f.owner) !== 'player' || !f.ships.length || !E.fleetStats(f).armed) continue;
    if (!f.path.length && f.sys === sys) continue;
    if (inActiveBattle(f)) continue;
    const eta = f.path.length && f.path[f.path.length - 1] === sys ? E.fleetETA(f) : E.etaTo(f, sys);
    if (isFinite(eta) && eta <= sec) return true;
  }
  return false;
};
function windowsTick(dt) {
  const st = E.state; if (!st.windows.length) return;
  for (const w of st.windows) {
    if (w.closed) continue;
    const p = E.sysPlanet(w.sys);
    if (p.owner !== 'player') { w.closed = true; continue; }
    registerWindow(w);
    const live = E.battleAt(w.sys);
    if (st.t >= w.end || (!hostileFleetsAt(w.sys).length && !live && st.t - w.start > 1)) closeWindow(w);
  }
  st.windows = st.windows.filter(w => !w.closed);
}
// Resolve every fight at a system instantly (the same resolver, just fast-forwarded).
function finishFight(sys) {
  for (let guard = 0; guard < 6; guard++) {
    detectBattles();
    const b = E.battleAt(sys); if (!b) return;
    let n = 0; while (!b.done && n++ < 1600) stepBattle(b, 0.5);
    if (!b.done) endBattle(b, [b.units.some(u => u.side === 0), b.units.some(u => u.side === 1)]);
  }
}
// Fast-forward the fight, then (if orbit fell) bombard and land troops at once.
function resolveSystem(sys) {
  finishFight(sys);
  const p = E.sysPlanet(sys);
  if (!p || p.owner !== 'player') return null;
  const hf = hostileFleetsAt(sys);
  if (!hf.length) return null;
  let dps = 0; for (const f of hf) dps += E.fleetStats(f).dps;
  if (dps > 0) { p.blockade = true; p.shieldHp = Math.max(0, p.shieldHp - dps * 0.6 * 15); }
  p.bombardT = 15;
  const byOwner = {};
  for (const f of hf) if (f.order === 'attack' && f.target === p.sys && E.troopCount(f.troops) > 0) (byOwner[f.owner] = byOwner[f.owner] || []).push(f);
  for (const o in byOwner) return invade(p, o, byOwner[o], true);
  return null;
}
function closeWindow(w) {
  const st = E.state, p = E.sysPlanet(w.sys);
  if (w.closed) return;
  w.closed = true;
  registerWindow(w);
  const landing = resolveSystem(w.sys);
  const alive = new Set(); for (const f of st.fleets) for (const s of f.ships) alive.add(s.uid);
  const A = { start: {}, lost: {}, troopsStart: 0, troopsLeft: 0 }, D = { start: {}, lost: {} };
  for (const uid in w.reg) { const r = w.reg[uid], side = r.side === 'a' ? A : D; side.start[r.h] = (side.start[r.h] || 0) + 1; if (!alive.has(+uid)) side.lost[r.h] = (side.lost[r.h] || 0) + 1; }
  for (const fid in w.regTroops) { A.troopsStart += w.regTroops[fid]; const f = E.fleetById(+fid); if (f) A.troopsLeft += E.troopCount(f.troops); }
  if (landing) A.troopsLeft += E.troopCount(landing.after.atk);
  A.troopsLost = Math.max(0, A.troopsStart - A.troopsLeft);
  const held = p.owner === 'player';
  const left = held ? hostileFleetsAt(w.sys).length > 0 : true;
  D.turretsLost = Math.max(0, w.snap.turret - (held ? p.def.turret : 0));
  D.stationsLost = Math.max(0, w.snap.station - (held ? p.def.station : 0));
  D.garrisonStart = E.troopCount(w.snap.garrison);
  D.garrisonLost = Math.max(0, D.garrisonStart - (held ? E.troopCount(p.garrison) : (landing ? E.troopCount(landing.after.def) : 0)));
  const outcome = !held ? 'defeat' : left ? 'blockade' : 'victory';
  const res = { id: E.id(), t: st.t, sys: w.sys, system: st.systems[w.sys].name, planet: p.name, outcome, held, captured: !held, attackers: w.owners.slice(), a: A, d: D, landed: !!landing };
  st.results.unshift(res); if (st.results.length > 20) st.results.length = 20;
  if (outcome === 'victory') st.stats.windowsWon++; else st.stats.windowsLost++;
  const nm = res.attackers.map(o => E.FACTIONS[o].short).join(' + ');
  E.addLog((outcome === 'victory' ? '✔ Victory at ' : outcome === 'defeat' ? '✖ ' + p.name + ' LOST to ' + nm + ' at ' : '⛓ Orbit lost, planet blockaded at ') + st.systems[w.sys].name, outcome === 'victory' ? 'good' : 'bad', w.sys, res.id);
  E.emit('sfx', outcome === 'victory' ? 'victory' : 'alert');
  E.emit('windowResult', res);
  return res;
}
E.closeWindowNow = function (sys) { const w = windowAt(sys); if (w) { closeWindow(w); E.state.windows = E.state.windows.filter(x => !x.closed); } };

// ---- defense planning & odds ----
function candidatesFor(sys, windowEnd) {
  const st = E.state, out = [];
  for (const f of st.fleets) {
    if (f.owner !== 'player' || !f.ships.length) continue;
    if (!E.fleetStats(f).armed) continue;
    if (f.path.length && f.path[f.path.length - 1] === sys) continue;
    if (!f.path.length && f.sys === sys) continue;
    if (inActiveBattle(f)) continue;
    const eta = E.etaTo(f, sys);
    if (!isFinite(eta) || eta > windowEnd) continue;
    out.push({ f, eta });
  }
  return out.sort((a, b) => a.eta - b.eta);
}
E.defenseContext = function (sys) {
  const st = E.state, p = E.sysPlanet(sys);
  if (!p || p.owner !== 'player') return null;
  const w = windowAt(sys);
  const inc = E.incoming().filter(a => a.target === sys && a.kind === 'attack');
  const present = w ? hostileFleetsAt(sys) : [];
  if (!inc.length && !present.length) return null;
  const T0 = present.length ? 0 : Math.min(...inc.map(a => a.eta));
  const rem = w ? Math.max(0, w.end - st.t) : E.ATTACK_WINDOW;
  const windowEnd = T0 + rem;
  const attackers = present.concat(inc.filter(a => a.eta <= windowEnd).map(a => a.f));
  const level = attackers.length ? Math.min(...attackers.map(f => (st.alerts[f.id] && st.alerts[f.id].level) || 0)) : 0;
  const scouted = level > 0;
  const defDocked = st.fleets.filter(f => f.owner === 'player' && f.sys === sys && !f.path.length && f.ships.length);
  const defInbound = st.fleets.filter(f => f.owner === 'player' && f.path.length && f.path[f.path.length - 1] === sys && f.ships.length).map(f => ({ f, eta: E.fleetETA(f) })).filter(x => x.eta <= windowEnd);
  const cands = candidatesFor(sys, windowEnd);
  return { sys, p, w, T0, rem, windowEnd, attackers, scouted, level, defDocked, defInbound, cands, nearest: cands.slice(0, 1), all: cands, present };
};
const cloneJ = o => JSON.parse(JSON.stringify(o, (k, v) => (k === '_f' || k === '_s' || k === 'fx') ? undefined : v));
function applyMinesTo(f, p) {
  if (!p.def.mines || p.mineCharge <= 0.99) return;
  const dmg = E.mineDamage(p);
  for (const s of f.ships.slice()) { s.hp -= dmg * (0.6 + 0.4 * R()); if (s.hp <= 0) f.ships.splice(f.ships.indexOf(s), 1); }
  p.mineCharge = 0; clampTroops(f);
}
// One run of the real battle resolver on a throw-away copy of the situation. Returns true if the planet holds
// and the attackers are gone.
let simSeedN = 0;
E.simulateDefense = function (ctx, extra, scale) {
  const real = E.state;
  const sb = Object.assign({}, real, { fleets: [], battles: [], log: [], toasts: [], windows: [], alerts: {}, routes: [], results: [], nextId: real.nextId + 1e6, planets: real.planets.slice(), stats: Object.assign({}, real.stats), _sim: true, _ff: true });
  const pc = cloneJ(ctx.p); sb.planets[ctx.p.id] = pc;
  // v1.8: every trial gets its own RNG stream, and the sandbox never advances the real game's seeded RNG
  sb.rngS = ((real.rngS || 1) + Math.imul(++simSeedN, 0x9E3779B9)) | 0;
  E.state = sb;
  const events = [];
  const add = (f, t, noMines) => events.push({ t, f: cloneJ(f), noMines });
  for (const f of ctx.defDocked) add(f, 0, true);
  for (const x of ctx.defInbound) add(x.f, x.eta, true);
  for (const x of extra || []) add(x.f, x.eta, true);
  for (const f of ctx.attackers) { const here = !f.path.length && f.sys === ctx.sys; add(f, here ? 0 : E.fleetETA(f), here); }
  if (scale && scale !== 1) for (const e of events) {
    const f = e.f; if (f.owner === 'player') continue;
    const n = f.ships.length, want = Math.max(1, Math.round(n * scale));
    if (want < n) { for (let i = n; i > want; i--) f.ships.splice(Math.floor(R() * f.ships.length), 1); }
    else for (let i = n; i < want; i++) { const c = Object.assign({}, f.ships[Math.floor(R() * n)]); c.uid = 'x' + i + '_' + f.id; f.ships.push(c); }
    for (const k of E.TROOP_KEYS) f.troops[k] = Math.round((f.troops[k] || 0) * scale);
  }
  events.sort((a, b) => a.t - b.t);
  if (ctx.w) { const b = real.battles.find(x => x.sys === ctx.sys && !x.done); if (b) { const bc = cloneJ(b); bc.viewing = false; bc.fx = []; sb.battles.push(bc); } }
  E._quiet = true; E.state = sb;
  let win = false;
  try {
    let ev = 0;
    for (let tau = 0; tau <= ctx.windowEnd + 1e-6; tau += 0.5) {
      // nothing happens in an empty sandbox: jump straight to the next arrival
      if (ev < events.length && events[ev].t > tau + 0.5 && !sb.battles.some(b => !b.done) && !hostileFleetsAt(ctx.sys).length) tau = Math.floor(events[ev].t * 2) / 2;
      while (ev < events.length && events[ev].t <= tau + 1e-6) {
        const e = events[ev++], f = e.f; f.path = []; f.prog = 0; f.sys = ctx.sys;
        if (f.owner !== 'player' && !e.noMines) applyMinesTo(f, pc);
        if (f.ships.length) sb.fleets.push(f);
      }
      detectBattles(); stepBattles(0.5);
    }
    resolveSystem(ctx.sys);
    win = pc.owner === 'player' && !hostileFleetsAt(ctx.sys).length;
  } finally { E.state = real; E._quiet = false; }
  return win;
};
// Monte Carlo odds as a PERCENTAGE RANGE. The width comes from scout accuracy: the resolver is run with the
// attackers scaled to the top and bottom of the scout's uncertainty. No scout coverage → unknown.
// `level` overrides the scout level (tests / the balance bot).
E.defenseOdds = function (ctx, mode, trials, level) {
  const L = level != null ? level : ctx && ctx.level;
  if (!ctx || !L) return { known: false, text: 'unknown' };
  trials = trials || 16;
  const extra = mode === 'nearest' ? ctx.nearest : mode === 'all' ? ctx.all : [];
  const e = E.scoutErr(L);
  const run = sc => { let k = 0; for (let i = 0; i < trials; i++) if (E.simulateDefense(ctx, extra, sc)) k++; return k / trials; };
  let lo, hi;
  if (e < 0.03) { lo = hi = run(1); }
  else { lo = run(1 + e); hi = run(Math.max(0.05, 1 - e)); if (lo > hi) [lo, hi] = [hi, lo]; }
  return { known: true, lo, hi, p: (lo + hi) / 2, level: L, text: E.fmtPct(lo, hi) };
};

act.sendDefense = function (sys, mode) {
  const ctx = E.defenseContext(sys); if (!ctx) return fail('No attack on this system');
  const list = mode === 'nearest' ? ctx.nearest : ctx.all;
  if (!list.length) return fail('No fleet can reach ' + E.state.systems[sys].name + ' before the battle window closes');
  let n = 0, last = 0;
  for (const x of list) { if (act.move(x.f.id, sys, 'move').ok) { n++; last = Math.max(last, x.eta); } }
  return { ok: true, n, eta: last };
};
// Can any Scout Post report on enemy fleet `fid` before it arrives? (UI helper)
E.scoutPlan = function (fid) {
  const st = E.state, e = E.fleetById(fid); if (!e) return { ok: false, msg: 'Target lost' };
  const b = E.bestScoutFor('fleet', fid);
  if (!b) return { ok: false, msg: E.scoutPosts().length ? 'All Scout Posts are busy' : 'No Scout Post — build one (any planet) to get estimates and odds' };
  const al = st.alerts[fid]; if (al && al.level >= b.L) return { ok: false, msg: 'Already scouted at Lv' + al.level };
  return { ok: true, p: b.p, t: b.t, level: b.L };
};
act.scout = function (fid) { const pl = E.scoutPlan(fid); if (!pl.ok) return pl; return act.scoutMission(pl.p.id, 'fleet', fid); };

// fast-forward helper (tests / debug)
E.ff = function (seconds, step) {
  const st = E.state; st._ff = true; step = step || 0.5;
  const n = Math.ceil(seconds / step);
  for (let i = 0; i < n; i++) { E.step(step); if (st.over && !st.continued) break; }
  st._ff = false;
};

E._simParts = {
  economy: economy, queues: queues, moveFleets: moveFleets,
  scoutTick: scoutTick, alertsTick: alertsTick, settleOrders: settleOrders,
  detectBattles: detectBattles, stepBattles: stepBattles,
  windowsTick: windowsTick, sieges: sieges, trade: trade, aiTick: aiTick,
  waves: waves, crisis: crisis, checkEnd: checkEnd
};
})();
