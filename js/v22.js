// Galaxies of Empires v2.2 — core additions (loaded after v21.js):
//  item 2 Fast start · item 3 easier endings (collapsing empires) · item 5 invade check · item 6 HQ tip flag · save migration
'use strict';
(function () {
const E = window.EOG;

// ---------------- item 2: Fast start (any map size) ----------------
// Every empire starts with FAST.res× the usual metal/crystal (so the AI keeps pace) and building levels up to
// FAST.earlyLvl build FAST.buildMul× as long; for the first FAST.earlyT game-seconds every build is FAST.earlyMul× as long.
E.FAST = { res: 5, rp: 150, buildMul: 0.35, earlyLvl: 5, earlyT: 40 * 60, earlyMul: 0.7 };
const ng = E.newGame;
E.newGame = function (diff, seed, opts) {
  const st = ng.apply(this, arguments); opts = opts || {};
  st.peak = {}; st.dying = {};
  if (opts.fast && st && st.emp) {
    st.fast = true; if (st.cfg) st.cfg.fast = true;
    for (const f in st.emp) { const em = st.emp[f]; if (!em || !em.res || f === 'crisis' || f === 'neutral') continue; em.res.metal = Math.round((em.res.metal || 0) * E.FAST.res); em.res.crystal = Math.round((em.res.crystal || 0) * E.FAST.res); }
    st.emp.player.rp = (st.emp.player.rp || 0) + E.FAST.rp;
  }
  return st;
};
const bt = E.bTime;
E.bTime = function (b, lvl, owner) {
  let t = bt.apply(this, arguments); const st = E.state;
  if (st && st.fast) { if (lvl <= E.FAST.earlyLvl) t *= E.FAST.buildMul; else if (st.t < E.FAST.earlyT) t *= E.FAST.earlyMul; }
  return t;
};

// ---------------- item 3: easier endings ----------------
// A rival that has grown to at least DYING.minPeak worlds and is now down to ≤ DYING.worlds worlds (or < DYING.frac of
// its peak) is COLLAPSING: its worlds regenerate shields at DYING.regen× and build/train (defenses, troops, ships) at
// DYING.prod×, and its garrisons slowly desert (DYING.desert per game-minute) — so the last sieges end instead of stalling.
E.DYING = { worlds: 3, frac: 0.1, minPeak: 6, regen: 0.25, prod: 0.4, desert: 0.01, every: 5 };
E.dyingTick = function () {
  const st = E.state; if (!st || !st.emp) return; st.peak = st.peak || {}; const prev = st.dying || {}, d = {}, cnt = {};
  for (const p of st.planets) if (p.owner !== 'neutral') cnt[p.owner] = (cnt[p.owner] || 0) + 1;
  for (const o of E.rivals()) {
    const n = cnt[o] || 0; st.peak[o] = Math.max(st.peak[o] || 0, n);
    if (n > 0 && st.peak[o] >= E.DYING.minPeak && (n <= E.DYING.worlds || n < st.peak[o] * E.DYING.frac)) {
      d[o] = true;
      if (!prev[o]) { E.addLog('☠ ' + E.FACTIONS[o].name + ' is collapsing (' + n + ' world' + (n === 1 ? '' : 's') + ' left of ' + st.peak[o] + ') — its defenses and garrisons are failing.', 'good'); E.toast('☠ ' + E.FACTIONS[o].short + ' is collapsing', 'good'); E.emit('dying', { owner: o, n }); }
    }
  }
  st.dying = d;
};
E.isDying = o => !!(E.state && E.state.dying && E.state.dying[o]);
E.dyingMul = function (o, k) { return E.isDying(o) ? E.DYING[k] : 1; };
const step0 = E.step;
E.step = function (dt) {
  const st = E.state;
  if (st && !st.over) {
    if (st._dyT == null || st.t - st._dyT >= E.DYING.every) { const el = st._dyT == null ? 0 : st.t - st._dyT; st._dyT = st.t; E.dyingTick();
      if (el > 0 && st.dying) for (const p of st.planets) if (st.dying[p.owner]) { const f = Math.min(0.5, E.DYING.desert * el / 60); for (const k of E.TROOP_KEYS) if (p.garrison[k] > 0) p.garrison[k] = Math.max(0, p.garrison[k] - Math.floor(p.garrison[k] * f + E.srand())); } }
  }
  return step0.apply(this, arguments);
};

// ---------------- item 5: invade check ----------------
// Expected-value replay of the ground battle (same formulas as groundBattle in sim.js, without the dice).
function expectedGround(atk0, def0, am, dm, dAtkM) {
  const K = E.TROOP_KEYS, atk = {}, def = {}; for (const k of K) { atk[k] = atk0[k] || 0; def[k] = def0[k] || 0; }
  const tot = t => K.reduce((a, k) => a + t[k], 0);
  const hit = (t, dmg, hpm) => { for (let g = 0; g < 6 && dmg > 1e-9; g++) { const ks = K.filter(k => t[k] > 1e-9); if (!ks.length) return; const share = dmg / ks.length; dmg = 0; for (const k of ks) { const hp = E.TROOPS[k].def * hpm, kill = share / hp; if (kill >= t[k]) { dmg += (kill - t[k]) * hp; t[k] = 0; } else t[k] -= kill; } } };
  for (let r = 0; r < 40 && tot(atk) >= 0.5 && tot(def) >= 0.5; r++) {
    let da = 0, dd = 0; for (const k of K) { da += atk[k] * E.TROOPS[k].atk; dd += def[k] * E.TROOPS[k].atk; }
    da *= am * 0.3; dd *= dAtkM * 0.3; hit(def, da, dm); hit(atk, dd, am);
  }
  return { win: tot(def) < 0.5 && tot(atk) >= 0.5, left: tot(atk), defLeft: tot(def) };
}
E.expectedGround = expectedGround;
E.INVADE_MARGIN = 0.85; // "will capture" only if it still wins with 15% fewer attackers (dice + losses in orbit)
E.invadeCheck = function (fids, pid, load) {
  const st = E.state, p = st.planets[pid]; if (!p) return null;
  const fs = (fids || []).map(E.fleetById).filter(Boolean);
  const atk = {}; for (const k of E.TROOP_KEYS) atk[k] = 0;
  for (const f of fs) {
    for (const k of E.TROOP_KEYS) atk[k] += f.troops[k] || 0;
    let n = load && +load[f.id] || 0; const src = n > 0 && !f.path.length ? E.sysPlanet(f.sys) : null;
    if (src && src.owner === 'player') { const room = E.fleetStats(f).cap - E.troopSize(f.troops); let size = 0; for (const k of E.TROOP_KEYS) { const sz = E.TROOPS[k].size; let c = Math.min(src.garrison[k] || 0, n); while (c > 0 && size + sz > room) c--; c = Math.max(0, Math.min(c, Math.floor((room - size) / sz))); atk[k] += c; n -= c; size += c * sz; if (n <= 0) break; } }
  }
  const troops = E.troopCount(atk);
  const here = st.fleets.some(f => f.owner === 'player' && f.sys === p.sys && !f.path.length && f.ships.length);
  const exact = p.owner === 'neutral' || here || (E.autoScouting && E.autoScouting());
  let def = null, age = 0, range = false;
  if (exact) def = Object.assign({}, E.defPool ? E.defPool(p) : p.garrison);
  else { const it = st.intel && st.intel[p.sys]; if (it && it.owner === p.owner && it.troops) { def = {}; for (const k of E.TROOP_KEYS) { const r = it.troops[k]; def[k] = r ? r[1] : 0; if (r && r[0] !== r[1]) range = true; } age = st.t - it.t; } }
  if (!def) return { unknown: true, troops };
  const specFrac = troops ? (atk.spec || 0) / troops : 0;
  const am = (E.has('player', 'f7') ? 1.25 : 1) * (E.has('player', 'f4') ? 1.15 : 1) * E.speciesBonus('troopAtk');
  const dm = E.garrisonDefMult(p, specFrac);
  const dAtkM = (E.has(p.owner, 'f7') ? 1.25 : 1) * (E.hasSpec(p, 'defense') ? 1.15 : 1);
  let burn = 0; if (exact) { const sm = E.shieldMax(st, p); burn = sm > 0 ? 0.5 * p.shieldHp / sm : 0; }
  const scale = (t, m) => { const o = {}; for (const k of E.TROOP_KEYS) o[k] = (t[k] || 0) * m; return o; };
  const eff = m => expectedGround(scale(atk, m * (1 - burn)), def, am, dm, dAtkM);
  const r = eff(E.INVADE_MARGIN), raw = eff(1);
  let need = 0;
  if (!r.win) { // more infantry-equivalents needed: grow the landing force until the margin case wins
    const inf = E.TROOP_KEYS[0], base = troops || 0; let lo = 0, hi = Math.max(10, base * 2 + E.troopCount(def) * 3);
    const wins = extra => { const t = Object.assign({}, atk); t[inf] = (t[inf] || 0) + extra; return expectedGround(scale(t, E.INVADE_MARGIN * (1 - burn)), def, am, dm, dAtkM).win; };
    let g = 0; while (!wins(hi) && g++ < 12) hi *= 2;
    for (let i = 0; i < 24 && hi - lo > 1; i++) { const mid = (lo + hi) >> 1; if (wins(mid)) hi = mid; else lo = mid; }
    need = hi;
  }
  const orbit = st.fleets.some(f => f.sys === p.sys && !f.path.length && f.ships.length && E.hostile('player', f.owner) && E.fleetArmed(f)) || (p.def && (p.def.turret || p.def.station) > 0 && !here);
  return { unknown: false, exact, range, age, troops, defN: E.troopCount(def), atk: E.troopPower(atk, 'player', true) * (1 - burn), def: E.troopPower(def, p.owner, false) * dm, will: r.win && troops > 0, likely: raw.win, left: Math.max(0, Math.round(r.left / E.INVADE_MARGIN)), need, burn, orbit };
};

// ---------------- item 6: HQ first-time tip (device-wide, shown once) ----------------
E.TIP_KEY = 'goe_tips_v22';
E.tipSeen = function (k) { try { return !!JSON.parse(localStorage.getItem(E.TIP_KEY) || '{}')[k]; } catch (e) { return false; } };
E.tipDismiss = function (k) { try { const o = JSON.parse(localStorage.getItem(E.TIP_KEY) || '{}'); o[k] = Date.now(); localStorage.setItem(E.TIP_KEY, JSON.stringify(o)); } catch (e) { } };

// ---------------- save migration ----------------
E.migrate22 = function (st) {
  st.peak = st.peak || {}; st.dying = st.dying || {};
  if (st.peak && st.planets) { const c = {}; for (const p of st.planets) if (p.owner !== 'neutral') c[p.owner] = (c[p.owner] || 0) + 1; for (const o in c) st.peak[o] = Math.max(st.peak[o] || 0, c[o]); }
  if (st.crisis && st.crisis.started === false) st.crisis.warned = false;
};
})();
