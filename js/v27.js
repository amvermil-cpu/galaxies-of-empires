// Galaxies of Empires v2.7 — portrait lock, trade nerf, commander planet cap,
// perfect home, HQ tab cleanup, central rift cadence, full attack list, Siege order.
'use strict';
(function () {
const E = window.EOG;

E.migrate27 = function (st) {
  if (!st) return st;
  st.ver = '2.7';
  if (st.emp && st.emp.player && st.emp.player.home != null && st.planets && st.planets[st.emp.player.home]) {
    st.planets[st.emp.player.home].perfect = true;
  }
  return st;
};

// ---------- item 2: trade yields 25% less than v2.6 ----------
E.TRADE_NERF = 0.75;
const _routeIncome = E.routeIncome;
E.routeIncome = function () {
  return _routeIncome.apply(this, arguments) * E.TRADE_NERF;
};

// ---------- item 3: planet cap of 50 through commander levels ----------
// ~40 at commander Lv23 (~10 hours of normal play). The last 10 unlock from
// Lv24–Lv33, which takes about another 10 hours as XP costs climb.
E.CMD_CAP_MAX = 50;
E.sysCapAt = function (lv) {
  lv = Math.max(1, lv | 0);
  if (lv <= 23) return Math.round(10 + 30 * (lv - 1) / 22);
  return Math.min(E.CMD_CAP_MAX, 40 + (lv - 23));
};
E.sysCap = function () {
  try { return Math.min(E.CMD_CAP_MAX, E.sysCapAt(E.cmd().lv)); } catch (e) { return E.CMD_CAP_BASE || 10; }
};
E.nextCapUnlock = function () {
  const lv = (E.cmd() && E.cmd().lv) || 1, cur = E.sysCapAt(lv);
  if (cur >= E.CMD_CAP_MAX) return null;
  for (let l = lv + 1; l <= lv + 40; l++) {
    const c = E.sysCapAt(l);
    if (c > cur) return { lv: l, cap: c };
  }
  return null;
};

// ---------- item 4: home always starts perfect (also set in newGame; keep on migrate) ----------
const _newGame = E.newGame;
E.newGame = function () {
  const st = _newGame.apply(this, arguments);
  if (st && st.emp && st.emp.player && st.planets) {
    const ph = st.planets[st.emp.player.home];
    if (ph) ph.perfect = true;
  }
  return st;
};

// ---------- item 8: Siege order (existing siege blockade, no landing) ----------
E.SEND_ACTIONS = E.SEND_ACTIONS || {};
E.SEND_ACTIONS.siege = {
  name: 'Siege',
  icon: '⛓',
  desc: 'Blockade the world (enemy output −50%, shields drain). No landing.'
};
const _sendActionsFor = E.sendActionsFor;
E.sendActionsFor = function (fids, sys, opts) {
  const out = _sendActionsFor(fids, sys, opts);
  out.siege = out.attack;
  return out;
};
function wrapSend(actObj) {
  if (!actObj || typeof actObj.send !== 'function' || actObj.send._v27) return;
  const _send = actObj.send;
  actObj.send = function (fids, sys, action, opts) {
    const r = _send.call(this, fids, sys, action === 'siege' ? 'attack' : action, opts);
    if (r && r.ok && action === 'siege') {
      for (const row of r.fleets || []) {
        const f = E.fleetById(row.fid);
        if (f) { f.order = 'siege'; f.raze = false; f.colonize = false; }
      }
    }
    return r;
  };
  actObj.send._v27 = true;
}
wrapSend(E.act);
if (E.actRaw) wrapSend(E.actRaw);

// ---------- item 6: rift waves every 3 game hours, bigger, all from the rift ----------
E.RIFT_WAVE_EVERY = 3 * 3600;
E.RIFT_FIRST_WAVE = 3 * 3600;
E.RIFT_WAVE_MULT = 1.5;
const _riftWaveTotal = E.riftWaveTotal;
E.riftWaveTotal = function (idx, t) {
  return _riftWaveTotal.apply(this, arguments) * E.RIFT_WAVE_MULT;
};
E.riftWaveTime = function (idx) { return Math.max(1, idx | 0) * E.RIFT_WAVE_EVERY; };
E.crisisAt = function () { return E.RIFT_FIRST_WAVE; };
E.riftNextOpen = function () {
  const st = E.state, c = st && st.crisis;
  if (!c) return E.RIFT_FIRST_WAVE;
  return E.riftWaveTime((c.waveIdx || 0) + 1);
};
let _riCache = null;
E.riftInfo = function () {
  const st = E.state; if (!st || !st.crisis || st.riftId == null || st.riftId < 0) return null;
  const c = st.crisis, nextIdx = (c.waveIdx || 0) + 1, at = E.riftWaveTime(nextIdx), AVG = 280;
  const tFloor = st.t | 0;
  if (_riCache && _riCache.idx === nextIdx && _riCache._at === at && _riCache._t === tFloor) {
    _riCache.in = Math.max(0, at - st.t);
    _riCache.opensIn = _riCache.in;
    return _riCache;
  }
  const plan = E.riftWavePlan(nextIdx, Math.max(st.t, at));
  const mine = plan.targets.filter(x => x.owner === 'player').reduce((a, x) => a + x.budget, 0);
  const inSec = Math.max(0, at - st.t);
  _riCache = {
    phase: c.waveIdx ? 'wave' : 'pre',
    open: !!c.started,
    cycle: 1,
    idx: nextIdx,
    NW: '∞',
    in: inSec,
    opensIn: inSec,
    ships: Math.round(plan.targets.reduce((a, x) => a + x.budget, 0) / AVG),
    mine: Math.round(mine / AVG),
    fleets: plan.targets.length,
    _at: at,
    _t: tFloor
  };
  return _riCache;
};

E.crisisTick27 = function () {
  const st = E.state, c = st.crisis, rid = st.riftId;
  if (rid == null || rid < 0 || !c) return;
  const nextIdx = (c.waveIdx || 0) + 1;
  const at = E.riftWaveTime(nextIdx);
  // 10 game-min warning before every wave
  if (!c.warned && st.t >= at - (E.RIFT_WARN || 600) && st.t < at) {
    c.warned = true; c.warnT = st.t;
    const left = Math.max(0, at - st.t);
    E.addLog('☢ The Rift is tearing wider — a Hollow wave leaves in ' + E.fmtTime(left) + '.', 'warn', rid);
    if (E.toast) E.toast('⚠ Hollow wave in ' + E.fmtTime(left) + '!', 'warn', rid);
    E.emit('sfx', 'alert'); E.emit('riftWarn', { at, left, idx: nextIdx });
  }
  if (st.t < at) return;
  // fire the wave from the Rift
  c.started = true; c.open = true; c.warned = false;
  c.waveIdx = nextIdx; c.cw = nextIdx; c.cycle = 1; c.lastWaveT = st.t; c.nextWave = E.riftWaveTime(nextIdx + 1);
  const plan = E.riftWavePlan(nextIdx, st.t), sent = [];
  for (const w of plan.targets) {
    const tgt = w.p;
    const garrison = (E.troopCount && tgt.garrison) ? E.troopCount(tgt.garrison) : 0;
    const troops = nextIdx >= 2 ? Math.ceil(garrison * 1.3) + 8 : 0;
    const fac = (E.FACTIONS && E.FACTIONS[w.owner]) || { short: w.owner };
    const fl = E.spawnFleet('crisis', rid, w.budget, {
      troops, name: 'Hollow Wave ' + nextIdx + ' → ' + fac.short, hulls: ['fighter', 'destroyer'], vs: w.owner
    });
    fl.wave = true; fl.riftWave = nextIdx;
    E.act.move(fl.id, tgt.sys, troops ? 'attack' : 'siege');
    sent.push({ fl, tgt, owner: w.owner });
  }
  c.lastWave = {
    idx: nextIdx, cycle: 1, t: st.t, fleets: sent.length,
    ships: sent.reduce((a, x) => a + x.fl.ships.length, 0),
    mine: sent.filter(x => x.owner === 'player' || (E.isAlly && E.isAlly(x.owner))).map(x => x.tgt.sys)
  };
  const mine = sent.filter(x => x.owner === 'player');
  E.addLog('☢ Hollow wave ' + nextIdx + ': ' + sent.length + ' fleet' + (sent.length === 1 ? '' : 's') + ' (' + E.fmtN(c.lastWave.ships) + ' ships) left the Rift' + (mine.length ? ' — ' + mine.map(x => x.tgt.name).join(', ') + ' targeted' : ''), 'bad', mine.length ? mine[0].tgt.sys : rid);
  if (E.toast) E.toast('☢ Hollow wave ' + nextIdx + ' — ' + sent.length + ' fleets left the Rift' + (mine.length ? ' (' + mine.length + ' at you)' : ''), 'bad', mine.length ? mine[0].tgt.sys : rid);
  E.emit('riftWave', c.lastWave); E.emit('sfx', 'alert'); E.emit('crisis');

  // Hollow fleets that finish a siege pick a new target (same as v2.6, without a close-cycle collapse)
  let merged = false;
  for (const f of st.fleets) {
    if (f.owner !== 'crisis' || (f.path && f.path.length) || E.battleAt(f.sys) || !f.ships || !f.ships.length) continue;
    const p = E.sysPlanet(f.sys);
    if (p && p.owner === 'crisis' && !E.troopCount(f.troops)) {
      if (!f.riftWave && !f.wave) continue;
      for (const g of st.fleets) if (g !== f && g.owner === 'crisis' && g.sys === f.sys && !(g.path && g.path.length) && g.ships && g.ships.length && !E.troopCount(g.troops)) { f.ships.push(...g.ships); g.ships = []; merged = true; }
      const next = st.planets.filter(q => q.owner !== 'crisis').sort((a, b) => E.laneDist(f.sys, a.sys) - E.laneDist(f.sys, b.sys))[0];
      if (next) E.act.move(f.id, next.sys, 'siege');
    }
  }
  if (merged && E.cleanupFleets) E.cleanupFleets();
};

// ---------- migrate previous slots: walk v26 … v15 (v26.js migrator stopped at v25) ----------
E.migratePrevSlots = function () {
  const groups = [
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

// portrait lock helper
E.lockPortrait = function () {
  try {
    if (screen.orientation && screen.orientation.lock) {
      const p = screen.orientation.lock('portrait');
      if (p && p.catch) p.catch(function () {});
    }
  } catch (e) {}
  try { document.documentElement.classList.add('portrait-lock'); document.body && document.body.classList.add('portrait-lock'); } catch (e) {}
};

E.installV27UI = function () {};

E.installV27UIBind = function (U, ACT, RENDER, factionBadge, esc, btn) {
  E.lockPortrait();
  window.addEventListener('orientationchange', E.lockPortrait);

  // item 5: no duplicate Headquarters button under Build / Overview (HQ tab stays)
  if (U) U.hqFirstBtn = function () { return ''; };

  // item 3: show cap + next unlock on the commander chip and commander sheet
  if (U && U.updateTop) {
    const _up = U.updateTop;
    U.updateTop = function () {
      if (E.render && E.render.panning) return;
      _up.apply(this, arguments);
      try {
        const st = E.state;
        const cc = document.getElementById('r-cmd');
        if (cc && st) {
          const cap = E.sysCap(), n = E.sysCount(), nx = E.nextCapUnlock();
          const small = cc.querySelector('small');
          if (small) small.textContent = '🪐 ' + n + '/' + cap + (nx ? ' · next Lv' + nx.lv + ' → ' + nx.cap : cap >= E.CMD_CAP_MAX ? ' · max' : '');
        }
        const ri = E.riftInfo && E.riftInfo();
        const statusEl = document.getElementById('status');
        if (statusEl && ri) statusEl.textContent = '☢ Wave ' + ri.idx + ' in ' + E.fmtTime(ri.in);
      } catch (e) {}
    };
  }
  if (RENDER && RENDER.commander) {
    const _cmd = RENDER.commander;
    RENDER.commander = function () {
      const r = _cmd.apply(this, arguments);
      try {
        const cap = E.sysCap(), nx = E.nextCapUnlock();
        const extra = '<div class="card small" id="capUnlock">🪐 Planet cap <b>' + cap + '</b> of ' + E.CMD_CAP_MAX +
          (nx ? ' · next unlock at Commander <b>Lv' + nx.lv + '</b> (cap ' + nx.cap + ')' : ' · maximum reached') +
          '. The cap rises with your Commander — about 40 at Lv23, then the last 10 over later levels.</div>';
        if (r && r.html) r.html = extra + r.html;
        else if (typeof r === 'string') return extra + r;
      } catch (e) {}
      return r;
    };
  }
  // HQ upgrade copy no longer promises +1 planet cap
  if (typeof hqHTML === 'undefined' && RENDER) {
    const _hq = RENDER.hq;
    if (_hq) RENDER.hq = function () {
      const r = _hq.apply(this, arguments);
      if (r && r.html) r.html = r.html.replace(', planet cap +1', '').replace('planet cap +1, ', '').replace(' and the planet cap', '');
      return r;
    };
  }

  // item 7: incoming attack alert lists every attack, soonest first; tap jumps
  E.updateStrip27 = function () {
    const st = E.state, strip = document.getElementById('alertStrip');
    if (!st || !strip) return;
    const incAll = E.incoming() || [];
    const incA = incAll.filter(a => a.kind === 'attack');
    const wins = (st.windows || []).filter(w => !w.closed);
    const list = wins.slice().sort((a, b) => a.end - b.end);
    // Identity of the list (not the ticking clocks) — rebuild the DOM only when membership changes.
    const key = list.map(w => 'w' + w.sys + '.' + w.end).join() + '|' + incA.map(a => (a.fid || a.target) + ':' + a.target + (a.scouted ? 's' : '')).join();
    const cls = (list.length || incA.length) ? 'alertstack' : 'alertstack hidden';
    if (strip._k !== key || strip.className !== cls) {
      let html = '';
      for (const w of list) {
        const wn = st.systems[w.sys] ? st.systems[w.sys].name : 'a system';
        html += '<button type="button" class="alertrow win" data-a="jump" data-s="' + w.sys + '"><span>⚔</span><span class="grow">Battle at <b>' + (esc ? esc(wn) : wn) + '</b> — reinforce now!</span><b data-eta="w" data-end="' + w.end + '">' + E.fmtTime(Math.max(0, w.end - st.t)) + '</b></button>';
      }
      for (const a of incA) {
        const F = E.factionOf ? E.factionOf(a.owner) : (E.FACTIONS[a.owner] || { short: a.owner || 'Enemy' });
        const tn = st.systems[a.target] ? st.systems[a.target].name : 'a system';
        html += '<button type="button" class="alertrow" data-a="jump" data-s="' + a.target + '"><span>⚠</span><span class="grow">' + (esc ? esc(F.short) : F.short) + ' → <b>' + (esc ? esc(tn) : tn) + '</b>' + (a.scouted ? ' 🔭' : '') + '</span><b data-eta="a">' + E.fmtTime(a.eta) + '</b></button>';
      }
      strip.innerHTML = html; strip.className = cls; strip._k = key;
    } else {
      const times = strip.querySelectorAll('[data-eta]');
      let i = 0;
      for (const w of list) {
        const el = times[i++]; if (el) el.textContent = E.fmtTime(Math.max(0, w.end - st.t));
      }
      for (const a of incA) {
        const el = times[i++]; if (el) el.textContent = E.fmtTime(a.eta);
      }
    }
  };
  // replace the button with a container once
  const strip = document.getElementById('alertStrip');
  if (strip && strip.tagName === 'BUTTON') {
    const d = document.createElement('div');
    d.id = 'alertStrip';
    d.className = strip.className || 'alertstack hidden';
    strip.parentNode.replaceChild(d, strip);
  }
};

})();
