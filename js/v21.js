// Galaxies of Empires v2.1 — core (Node-testable): Headquarters, save migration.
// (The continuous Rift cycle lives in sim.js crisis(); the batched AI route cache in state.js pathFor.)
'use strict';
(function () {
const E = window.EOG;
const OK = { ok: true }, fail = msg => ({ ok: false, msg });

// ---------- v2.1 item 2: Headquarters ----------
// One HQ per empire, on the capital. Research points (RP) are spent here two ways:
//  • HQ level (Lv5 → Lv15): caps the level of EVERY building on EVERY planet you own (building Lv ≤ HQ Lv), and each
//    level above 5 raises your planet (system) cap by 1; HQ Lv8 and Lv12 each unlock one more building slot on every
//    planet you own.
//  • Passive bonuses: permanent empire-wide perks bought level by level (a perk's level can't pass the HQ level).
E.HQ_START = 5; E.HQ_MAX = 15; E.HQ_SLOT_LVLS = [8, 12];
E.HQ_PERKS = {
  industry:     { name: 'Industrial Doctrine', icon: '⛏', key: 'metal',     per: 0.04, desc: '+4% metal output per level' },
  crystal:      { name: 'Crystal Lattices',    icon: '💎', key: 'crystal',   per: 0.04, desc: '+4% crystal output per level' },
  construction: { name: 'Civil Engineering',   icon: '🏗', key: 'buildSpeed', per: 0.05, desc: 'Buildings finish 5% faster per level' },
  shipworks:    { name: 'Fleet Yards',         icon: '🚀', key: 'shipBuild', per: 0.05, desc: 'Shipyards build 5% faster per level' },
  navigation:   { name: 'Lane Charts',         icon: '🧭', key: 'shipSpeed', per: 0.03, desc: 'Fleets travel 3% faster per level' },
  fortify:      { name: 'Fortified Worlds',    icon: '🏰', key: 'defHp',     per: 0.05, desc: '+5% turret & station HP per level' },
  drill:        { name: 'Drill Sergeants',     icon: '🪖', key: 'troopAtk',  per: 0.04, desc: '+4% troop attack per level' },
  scholars:     { name: 'Scholars’ Guild',     icon: '⚗', key: 'rp',        per: 0.04, desc: '+4% research points per level' },
};
E.HQ_PERK_MAX = 10;
E.hqCost = L => Math.round(70 * Math.pow(1.36, L - 1));            // RP for HQ Lv L → L+1 (Lv5→6 ≈ 240, Lv14→15 ≈ 3 800)
E.perkCost = (k, lvl) => Math.round(45 * Math.pow(1.55, lvl));      // RP for perk level lvl → lvl+1 (1st ≈ 45, 10th ≈ 2 300)
E.hq = function (owner) { const st = E.state; const em = st && st.emp[owner || 'player']; return em && em.hq || null; };
E.hqLevel = owner => { const h = E.hq(owner); return h ? h.lvl : E.HQ_MAX; };
// the building level cap for an owner (AIs have no HQ: their own Lv10 ceiling applies)
E.hqCap = owner => { owner = owner || 'player'; if (owner !== 'player') return E.BUILD_MAX_LVL; return Math.min(E.BUILD_MAX_LVL, E.hqLevel('player')); };
E.hqSlots = owner => { const h = E.hq(owner); return h ? E.HQ_SLOT_LVLS.filter(L => h.lvl >= L).length : 0; };
E.hqPlanetBonus = () => { const h = E.hq('player'); return h ? Math.max(0, h.lvl - E.HQ_START) : 0; };
E.hqMul = function (key) { const h = E.hq('player'); if (!h || !h.perks) return 1; let m = 1; for (const k in E.HQ_PERKS) { const P = E.HQ_PERKS[k]; if (P.key === key && h.perks[k]) m += P.per * h.perks[k]; } return m; };
E.ensureHQ = function (st) {
  st = st || E.state; const em = st.emp.player; if (!em) return null;
  if (!em.hq) {
    // existing saves: never downgrade — HQ level = the highest building level (built or queued) on any of your planets
    let top = 0;
    for (const p of st.planets) if (p.owner === 'player') { for (const s of p.slots) if (s.b && s.lvl > top) top = s.lvl; for (const q of (p.queues && p.queues.build) || []) if (q.lvl > top) top = q.lvl; }
    em.hq = { lvl: E.clamp(Math.max(E.HQ_START, top), E.HQ_START, E.HQ_MAX), perks: {}, spent: 0 };
  }
  em.hq.perks = em.hq.perks || {};
  return em.hq;
};
const act = E.actRaw || E.act;
act.hqUpgrade = function () {
  const st = E.state, em = st.emp.player, h = E.ensureHQ(st);
  if (h.lvl >= E.HQ_MAX) return fail('Headquarters is at max level');
  const c = E.hqCost(h.lvl); if (em.rp < c - 1e-6) return fail('Need ' + Math.ceil(c - em.rp) + ' more research points');
  em.rp -= c; h.spent = (h.spent || 0) + c; h.lvl++;
  const sl = E.HQ_SLOT_LVLS.includes(h.lvl);
  E.addLog('🏛 Headquarters Lv' + h.lvl + ': buildings up to Lv' + E.hqCap() + ', planet cap ' + E.sysCap() + (sl ? ', +1 building slot on every planet' : ''), 'good');
  E.emit('sfx', 'build'); E.emit('hq', { lvl: h.lvl });
  return { ok: true, lvl: h.lvl, slot: sl };
};
act.hqPerk = function (k) {
  const st = E.state, em = st.emp.player, h = E.ensureHQ(st), P = E.HQ_PERKS[k];
  if (!P) return fail('Unknown bonus');
  const lv = h.perks[k] || 0;
  if (lv >= E.HQ_PERK_MAX) return fail('Max level');
  if (lv >= h.lvl) return fail('Upgrade the Headquarters first (bonus level ≤ HQ level)');
  const c = E.perkCost(k, lv); if (em.rp < c - 1e-6) return fail('Need ' + Math.ceil(c - em.rp) + ' more research points');
  em.rp -= c; h.spent = (h.spent || 0) + c; h.perks[k] = lv + 1;
  E.emit('sfx', 'build');
  return { ok: true, lvl: lv + 1 };
};
act.researchPause = function () { const em = E.state.emp.player; if (!em.research) return fail('No research running'); em.research = null; return { ok: true }; }; // progress stays in rpProg
// route the new actions through the command layer like every other player action (v1.8 E.sync)
if (E.actRaw) for (const k of ['hqUpgrade', 'hqPerk', 'researchPause']) E.act[k] = function () { if (E._inStep || E._applying || !E.state) return E.actRaw[k].apply(null, arguments); return E.sync.submit(k, Array.prototype.slice.call(arguments)); };

// species bonus × HQ perk (player only)
const spB = E.spBonus;
E.spBonus = function (owner, k) { const b = spB(owner, k); return owner === 'player' ? b * E.hqMul(k) : b; };
// building slots: HQ Lv8/Lv12 add one each on every planet you own
const pSlots = E.planetSlots;
E.planetSlots = function (p) { const n = pSlots(p); if (p.owner !== 'player') return n; const x = E.hqSlots('player'); return x ? Math.min(n + x, p.slots.length) : n; };
// planet cap: +1 per HQ level above 5 (on top of the Commander level cap)
const sCap = E.sysCap;
if (sCap) E.sysCap = () => sCap() + E.hqPlanetBonus();

E.migrate21 = function (st) {
  // item 2: HQ on the home planet at a level that keeps every existing building
  if (st.emp && st.emp.player) E.ensureHQ(st);
  // item 3: continuous Rift cycle
  const c = st.crisis;
  if (c && c.cycle == null) {
    c.cw = 0; c.cycle = 0; c.open = false;
    if (c.defeated) { c.defeated = false; c.started = true; c.cycle = 1; c.open = false; c.phaseEnd = st.t + E.RIFT_CLOSED; c.warned = false; }
    else if (c.started) { const gap = E.RIFT_OPEN / Math.max(1, (st.cfg && st.cfg.waves) || 8); c.cycle = 1; c.open = true; c.cw = c.waveIdx || 0; c.phaseEnd = st.t + Math.max(30 * 60, E.RIFT_OPEN - c.cw * gap); }
  }
  return st;
};
// new games get their HQ right away
const ng = E.newGame;
E.newGame = function () { const st = ng.apply(this, arguments); if (st && st.emp && st.emp.player) E.ensureHQ(st); return st; };
})();
