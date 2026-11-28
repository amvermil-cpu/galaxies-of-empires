// Galaxies of Empires v2.6
'use strict';
(function () {
const E = window.EOG;

// v2.6: keep a hook for load-time migration of already-current (2.6) state.
// Do not call E.migratePrevSlots from here — parseSave → migrate → migrate26 would recurse.
E.migrate26 = function (st) {
  if (!st) return st;
  st.ver = '2.6';
  if (st.fleets) for (const f of st.fleets) {
    if (!f.troops) f.troops = { inf: 0 };
  }
  if (st.planets) for (const p of st.planets) {
    p.def = p.def || {};
    if (p.def.laser == null) p.def.laser = 0;
    if (p.def.railgun == null) p.def.railgun = 0;
  }
  return st;
};

// Safe faction lookup — Hollow (crisis), pirates/raiders, dead or unknown empires.
E.factionOf = function (o) {
  if (o && E.FACTIONS[o]) return E.FACTIONS[o];
  return { name: (o && String(o)) || 'Unknown force', short: (o && String(o)) || 'Unknown', color: '#8899aa', desc: '' };
};

const _hostile = E.hostile;
E.hostile = function (a, b) {
  try {
    if (a === b || a === 'neutral' || b === 'neutral') return false;
    if (a === 'crisis' || b === 'crisis') return true;
    const st = E.state;
    const gone = x => !x || (st && (!st.emp[x] || st.emp[x].alive === false));
    if (gone(a) || gone(b)) return a !== b;
    return _hostile(a, b);
  } catch (e) { return a !== b && a !== 'neutral' && b !== 'neutral'; }
};


const _troopCount = E.troopCount;
E.troopCount = function (t) { if (!t) return 0; try { return _troopCount(t); } catch (e) { return 0; } };
const _troopSize = E.troopSize;
E.troopSize = function (t) { if (!t) return 0; try { return _troopSize(t); } catch (e) { return 0; } };
const _troopPower = E.troopPower;
E.troopPower = function (t, owner, attacking) { if (!t) t = {}; try { return _troopPower(t, owner, attacking); } catch (e) { return 0; } };
const _fleetStats = E.fleetStats;
E.fleetStats = function (f) {
  if (!f) return { hp: 0, dps: 0, cap: 0, speed: 1, power: 0, armed: 0, troopsUsed: 0 };
  if (!f.troops) f.troops = { inf: 0 };
  if (!f.ships) f.ships = [];
  try { return _fleetStats(f); } catch (e) { return { hp: 0, dps: 0, cap: 0, speed: 1, power: (f.ships && f.ships.length) || 0, armed: 0, troopsUsed: 0 }; }
};


const _fleetComp = E.fleetComposition;
E.fleetComposition = function (f) {
  if (!f) return { ships: {}, troops: {} };
  if (!f.troops) f.troops = { inf: 0 };
  if (!f.ships) f.ships = [];
  try { return _fleetComp(f); } catch (e) { return { ships: {}, troops: {} }; }
};

const _fleetIntel = E.fleetIntel;
E.fleetIntel = function (f, L) {
  if (!f || !L || L <= 0) return null;
  try { return _fleetIntel(f, L); } catch (e) { return null; }
};

// Cheap power-based odds so the Incoming sheet never blocks the UI on 36 full battle sims.
// The exact Monte Carlo still runs in the background and replaces this when ready.
E.cheapDefenseOdds = function (ctx, mode) {
  if (!ctx) return { known: false, text: 'unknown' };
  const extra = mode === 'nearest' ? ctx.nearest : mode === 'all' ? ctx.all : [];
  let atk = 0, def = 0;
  const pow = f => { try { return (E.fleetStats(f) || {}).power || (f.ships && f.ships.length) || 0; } catch (e) { return (f && f.ships && f.ships.length) || 0; } };
  for (const f of ctx.attackers || []) atk += pow(f);
  for (const f of ctx.defDocked || []) def += pow(f);
  for (const x of ctx.defInbound || []) def += pow(x.f);
  for (const x of extra || []) def += pow(x.f);
  if (ctx.p) {
    def += (ctx.p.def && ctx.p.def.turret || 0) * 40;
    def += (ctx.p.shieldHp || 0) * 0.02;
    def += E.troopCount(ctx.p.garrison) * 2;
  }
  if (!ctx.level) return { known: false, text: 'unknown', cheap: true };
  const p = def + atk <= 0 ? 0.5 : def / (def + atk);
  const lo = Math.max(0, p - 0.12), hi = Math.min(1, p + 0.12);
  return { known: true, lo, hi, p, level: ctx.level, text: E.fmtPct(lo, hi), cheap: true };
};

const _defenseOdds = E.defenseOdds;
E._oddsBusy = false;
E.defenseOdds = function (ctx, mode, trials, level) {
  // UI path: never run the heavy resolver synchronously.
  if (E._oddsSyncCheap) return E.cheapDefenseOdds(ctx, mode);
  try { return _defenseOdds(ctx, mode, trials, level); } catch (e) { return { known: false, text: 'unknown' }; }
};

// Snapshot of a fleet for the scout popup (survives if the live fleet is later destroyed).
E.scoutSnapshot = function (f, L) {
  const fac = E.factionOf(f && f.owner);
  const out = { id: f && f.id, owner: f && f.owner, name: (f && f.name) || (fac.short + ' fleet'), short: fac.short, color: fac.color, sys: f && (f.path && f.path.length ? f.path[f.path.length - 1] : f.sys), arrived: !!(f && !f.path.length), ships: {}, troops: {}, total: null, level: L || 0, missing: !f };
  if (!f) return out;
  const intel = L ? E.fleetIntel(f, L) : null;
  if (intel) {
    out.ships = intel.ships || {}; out.troops = intel.troops || {}; out.total = intel.total; out.level = intel.level;
  } else {
    const c = E.fleetComposition(f);
    // Unscouted: wide Lv1-style ranges so the popup still shows numbers.
    const estL = 1;
    for (const h in c.ships) out.ships[h] = E.scoutRange(c.ships[h], estL, (f.id || 1) * 31 + (h.length || 1));
    for (const k in c.troops) out.troops[k] = E.scoutRange(c.troops[k], estL, (f.id || 1) * 17 + (k.charCodeAt(0) || 1));
    out.total = E.scoutRange(f.ships.length, estL, (f.id || 1) * 13 + 5);
    out.level = 0;
    out.unscouted = true;
  }
  return out;
};

E.rememberScout = function (f, L) {
  const st = E.state; if (!st || !f) return;
  st.scoutSnaps = st.scoutSnaps || {};
  st.scoutSnaps[f.id] = E.scoutSnapshot(f, L || (st.alerts[f.id] && st.alerts[f.id].level) || 0);
};

// ----- UI install (called at the end of ui.js, once U exists) -----
E.installV26UI = function () {
  const U = E.ui; if (!U || U._v26) return; U._v26 = true;
  const Rd = E.render || {};

  // Don't let a bad strip update kill the rAF loop.
  const _updateTop = U.updateTop;
  U.updateTop = function () { try { return _updateTop.apply(this, arguments); } catch (e) { console.warn('updateTop', e); } };

  const _badge = (typeof factionBadge === 'function') ? null : null;
  // factionBadge is file-local; wrap the places we can from here via RENDER patches.

  const origIncoming = U.RENDER && U.RENDER.incoming;
  // RENDER is also file-local. We hook via U.open and a registered RENDER set below.

  U.openScout = function (fid, opts) {
    opts = opts || {};
    const st = E.state, f = E.fleetById(+fid);
    const L = (f && st.alerts[f.id] && st.alerts[f.id].level) || (st.fleetIntel && st.fleetIntel[+fid] && st.fleetIntel[+fid].level) || 0;
    if (f) E.rememberScout(f, L);
    const sys = opts.sys != null ? opts.sys : (f ? (f.path.length ? f.path[f.path.length - 1] : f.sys) : null);
    if (sys != null && Rd.focus) try { Rd.focus(+sys); } catch (e) {}
    U.open('scout', { fid: +fid, sys: sys, battle: !!opts.battle });
  };

  U.ACT = U.ACT || U; // ACT is file-local; we assign on the exported handlers below
};

// ACT/RENDER are locals inside ui.js — installV26UIBind is called with them.
E.installV26UIBind = function (U, ACT, RENDER, factionBadge, esc, btn, oddsChip) {
  if (!U || U._v26bind) return; U._v26bind = true;

  ACT.openAlert = function () {
    const st = E.state; if (!st) return;
    const inc = (E.incoming() || []).filter(a => a.kind === 'attack' && a.f);
    const wins = (st.windows || []).filter(w => !w.closed && st.systems[w.sys]);
    if (wins.length) {
      const w = wins.slice().sort((a, b) => a.end - b.end)[0];
      let fid = null;
      try {
        const ctx = E.defenseContext(w.sys);
        if (ctx && ctx.attackers && ctx.attackers[0]) fid = ctx.attackers[0].id;
      } catch (e) {}
      if (fid == null) {
        const hf = (st.fleets || []).find(f => f.sys === w.sys && f.owner !== 'player' && f.ships && f.ships.length);
        if (hf) fid = hf.id;
      }
      if (fid != null) return U.openScout(fid, { sys: w.sys, battle: true });
      if (E.render && E.render.focus) E.render.focus(w.sys);
      return U.open('incoming', {});
    }
    if (inc.length) return U.openScout(inc[0].fid, { sys: inc[0].target });
    U.open('incoming', {});
  };

  ACT.openScout = function (d) { U.openScout(+d.f, { sys: d.s !== '' && d.s != null ? +d.s : null }); };

  // Defer heavy odds: first paint uses cheap odds, then a background pass fills exact ones.
  const origOddsFor = null; // patched inside attackCard via E._oddsSyncCheap
  const origIncoming = RENDER.incoming;
  RENDER.incoming = function () {
    E._oddsSyncCheap = true;
    let out;
    try { out = origIncoming(); }
    finally { E._oddsSyncCheap = false; }
    // Kick the exact resolver off the critical path.
    if (!E._oddsTimer) {
      E._oddsTimer = setTimeout(function () {
        E._oddsTimer = null;
        if (!U.sheet || U.sheet.type !== 'incoming') return;
        try {
          const inc = E.incoming() || [];
          const targets = [...new Set((E.state.windows || []).filter(w => !w.closed).map(w => w.sys).concat(inc.filter(a => a.kind === 'attack').map(a => a.target)))];
          for (const sys of targets) {
            const ctx = E.defenseContext(sys); if (!ctx) continue;
            for (const mode of ['now', 'nearest', 'all']) {
              try { E.defenseOdds(ctx, mode, 4); } catch (e) {}
            }
          }
        } catch (e) {}
        if (U.sheet && U.sheet.type === 'incoming') U.render(false);
      }, 40);
    }
    return out;
  };

  RENDER.scout = function (o) {
    const st = E.state, fid = +o.fid;
    const f = E.fleetById(fid);
    const L = (f && st.alerts[f.id] && st.alerts[f.id].level) || (st.fleetIntel && st.fleetIntel[fid] && st.fleetIntel[fid].level) || 0;
    const snap = f ? E.scoutSnapshot(f, L) : ((st.scoutSnaps && st.scoutSnaps[fid]) || { missing: true, name: 'Unknown fleet', short: 'Unknown', color: '#8899aa', ships: {}, troops: {}, level: 0 });
    const fac = E.factionOf(snap.owner);
    const sys = o.sys != null ? o.sys : snap.sys;
    const sysName = (sys != null && st.systems[sys]) ? st.systems[sys].name : 'unknown space';
    let status;
    if (!f) status = '<span class="bad">Fleet destroyed or no longer on the map</span>';
    else if (f.path && f.path.length) status = 'En route to <b>' + esc(sysName) + '</b> · ETA <b>' + E.fmtTime(E.fleetETA(f)) + '</b>';
    else status = '<span class="bad">Arrived / in orbit</span> at <b>' + esc((E.sysPlanet(f.sys) || {}).name || sysName) + '</b>';
    const shipLine = Object.keys(snap.ships).length
      ? Object.entries(snap.ships).map(([h, r]) => {
          const H = E.HULLS[h]; const nm = H ? H.short : h;
          return `<span class="chip">${E.fmtRange(r)}× ${esc(nm)}</span>`;
        }).join('')
      : '<span class="chip muted">no ships reported</span>';
    const troopLine = Object.keys(snap.troops || {}).length
      ? Object.entries(snap.troops).map(([k, r]) => {
          const T = E.TROOPS[k]; const nm = T ? (T.icon + ' ' + T.short) : k;
          return `<span class="chip">${nm} ${E.fmtRange(r)}</span>`;
        }).join('')
      : '<span class="chip muted">no troops seen</span>';
    const cov = snap.unscouted || !snap.level
      ? '<div class="small muted">No Scout Post coverage — showing a wide estimate. Build or upgrade a 📡 Scout Post for a tighter report.</div>'
      : `<div class="small muted">📡 Scout Lv${snap.level}${snap.level >= (E.SCOUT_EXACT || 15) ? ' (exact)' : ''}</div>`;
    const title = '🔭 ' + esc(fac.short) + ' fleet';
    let h = `<div class="card alertcard"><div class="hd"><div><b style="color:${fac.color}">${esc(snap.name)}</b><div class="small">${esc(fac.name)}</div></div></div>`;
    h += `<div class="small" style="margin:8px 0">${status}</div>`;
    h += cov;
    h += `<div class="comp" style="margin-top:8px"><b class="small">Ships</b> ${shipLine}</div>`;
    h += `<div class="comp"><b class="small">Troops</b> ${troopLine}</div>`;
    if (snap.total) h += `<div class="small" style="margin-top:6px">Total ships ≈ <b>${E.fmtRange(snap.total)}</b></div>`;
    h += `<div class="row" style="margin-top:10px">${btn('📡 Incoming list', 'open', { t: 'incoming' }, 'mini2')}${sys != null ? btn('🎯 Go to system', 'jump', { s: sys }, 'mini2') : ''}${sys != null && E.battleAt && E.battleAt(sys) ? btn('⚔ Battle status', 'watch', { s: sys }, 'warn mini2') : ''}</div></div>`;
    return { title, html: h };
  };

  // Make each incoming attacker row open the scout popup (and stay safe if the fleet vanished mid-render).
  const origAttackCard = typeof attackCard === 'function' ? null : null;
};


// ---------- item 3: rally departure must not silently garrison ----------
// Invalid / unreachable / lost / enemy-owned targets clear rallyTo immediately and raise an alert.
// A fleet with a valid rallyTo may gather for 3s/12s, then must depart; it is not allowed to sit idle
// for more than ~15s after that window (we keep retrying instead of giving up at 8 silent failures).
E.RALLY_IDLE_MAX = 15;
E.rallyDestOk = function (f) {
  const st = E.state, q = st && st.planets[f.rallyTo];
  if (!q || q.owner !== 'player') return { ok: false, why: !q ? 'rally target is gone' : (q.name + ' is no longer yours') };
  if (f.sys === q.sys) return { ok: true, arrived: true, q };
  let path = null;
  try { path = E.pathFor(f.owner, f.sys, q.sys); } catch (e) { path = null; }
  if (!path) return { ok: false, why: (E.targetBlock && E.targetBlock(f.owner, f.sys, q.sys)) || ('no route to ' + q.name), q };
  return { ok: true, q, path };
};
E.clearRallyInvalid = function (f, why) {
  const st = E.state; if (!st || !f) return;
  const sys = f.sys, name = f.name, dest = f.rallyTo;
  if (E.clearRally) E.clearRally(f); else { f.rallyTo = null; f.rallyFrom = null; }
  f.rallyFail = 0;
  const msg = '⚑ Rally cancelled' + (name ? ' for ' + name : '') + (why ? ' — ' + why : '') + '. The fleet is holding position.';
  try { E.addLog(msg, 'warn', sys); } catch (e) {}
  try { if (E.toast) E.toast('⚑ Rally cancelled — ' + (why || 'target invalid'), 'warn', sys); } catch (e) {}
  st.stuckAlerts = st.stuckAlerts || [];
  st.stuckAlerts.unshift({ t: st.t, fid: f.id, sys, dest, name, why: why || 'invalid', invalid: true });
  if (st.stuckAlerts.length > 8) st.stuckAlerts.length = 8;
};
E.rallyTick26 = function () {
  const st = E.state; if (!st) return;
  for (const p of st.planets) {
    if (p.owner !== 'player' || p.rally == null) continue;
    const q = st.planets[p.rally];
    if (!q || q.owner !== 'player' || q.id === p.id) {
      const why = !q ? 'rally target is gone' : (q.id === p.id ? 'rally target is itself' : (q.name + ' is no longer yours'));
      p.rally = null;
      try { E.addLog('⚑ Rally point on ' + p.name + ' cleared — ' + why, 'warn', p.sys); } catch (e) {}
      try { if (E.toast) E.toast('⚑ Rally on ' + p.name + ' cleared — ' + why, 'warn', p.sys); } catch (e) {}
    }
  }
  const act = E.act || {};
  for (const f of st.fleets) {
    if (f.owner !== 'player' || f.rallyTo == null) continue;
    if (!f.path) f.path = [];
    if (f.path.length) continue;
    if (!f.ships || !f.ships.length) { E.clearRallyInvalid(f, 'fleet has no ships'); continue; }
    const dest = E.rallyDestOk(f);
    if (dest.arrived) {
      f.rallyTo = null; f.rallyFrom = null;
      const dock = st.fleets.find(x => x !== f && x.owner === 'player' && x.sys === dest.q.sys && !x.path.length && (x.order === 'idle' || x.guard) && !x.routeId && x.rallyTo == null);
      if (dock && act.merge) act.merge([dock.id, f.id]);
      else if (dest.q) f.name = dest.q.name.split(' ')[0] + ' Guard';
      continue;
    }
    if (!dest.ok) { E.clearRallyInvalid(f, dest.why); continue; }
    const t0 = f.rallyT0 != null ? f.rallyT0 : (f.rallyT != null ? f.rallyT : st.t);
    if (f.rallyT0 == null) f.rallyT0 = t0;
    const tLast = f.rallyT != null ? f.rallyT : t0;
    if (st.t - tLast < 3 && st.t - t0 < 12) continue;
    const src = st.planets[f.rallyFrom];
    if (src && src.owner === 'player' && src._rallyInf > 0) {
      try {
        const cap = (E.fleetStats(f) || {}).cap;
        if (cap && act.load) { const r = act.load(f.id, src._rallyInf); if (r && r.ok) src._rallyInf -= r.moved; }
      } catch (e) {}
    }
    // Hold / garrison / idle does not cancel a rally — departure is forced.
    E._quiet = true; E._rallyMove = true; let r;
    try { r = act.move(f.id, dest.q.sys, 'relocate'); }
    catch (e) { r = { ok: false, msg: String(e && e.message || e) }; }
    finally { E._quiet = false; E._rallyMove = false; }
    if (r && r.ok) { f.rallyFail = 0; continue; }
    f.rallyFail = (f.rallyFail || 0) + 1;
    const readyAt = Math.min(t0 + 12, tLast + 3);
    if (st.t - readyAt >= E.RALLY_IDLE_MAX) {
      const why = (r && r.msg) || (E.targetBlock && E.targetBlock(f.owner, f.sys, dest.q.sys)) || 'could not depart';
      E.clearRallyInvalid(f, why);
    }
  }
};

// compactState already drops '_' keys only; assert rally fields are not in that set and
// rehydrate rallyT0 after load so a compacted save cannot stall a forming fleet.
const _compact = E.compactState;
if (_compact) {
  E.compactState = function (st) {
    const raw = _compact.apply(this, arguments);
    if (raw && raw.fleets) for (const f of raw.fleets) {
      if (f.rallyTo != null && f.rallyT0 == null && f.rallyT != null) f.rallyT0 = f.rallyT;
    }
    return raw;
  };
}



// ---------- item 11: IndexedDB saves (LZW kept), LS fallback, stale-key cleanup ----------
E.IDB_NAME = 'goe_saves_v26';
E.IDB_STORE = 'slots';
E._kv = Object.create(null);      // in-memory mirror (source of truth after a write)
E._kvHas = Object.create(null);   // keys we know about (even if value is empty)
E.storeMode = 'ls';               // 'idb' | 'ls'
E.storagePersisted = false;
E._idb = null;
E._idbQueue = Promise.resolve();

E.isSaveKey = function (k) {
  return typeof k === 'string' && (/^goe_save_/.test(k) || /^eog_save_/.test(k));
};
E.staleSaveKeys = function () {
  const keys = [];
  for (let v = 15; v <= 24; v++) {
    keys.push('goe_save_v' + v, 'goe_save_v' + v + '_meta');
    if (v >= 22) keys.push('goe_save_v' + v + '_s2', 'goe_save_v' + v + '_s2_meta', 'goe_save_v' + v + '_s3', 'goe_save_v' + v + '_s3_meta');
  }
  for (const k of (E.OLD_SAVE_KEYS || ['goe_save_v14', 'goe_save_v13', 'goe_save_v12', 'goe_save_v1', 'eog_save_v1'])) keys.push(k, k + '_meta');
  return keys;
};
E.lsGet = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
E.lsSet = function (k, v) { localStorage.setItem(k, v); };
E.lsDel = function (k) { try { localStorage.removeItem(k); } catch (e) {} };
E.lsKeys = function () {
  const out = [];
  try {
    if (typeof localStorage.length === 'number' && typeof localStorage.key === 'function') {
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k) out.push(k); }
    } else if (localStorage._d) {
      out.push.apply(out, Object.keys(localStorage._d));
    }
  } catch (e) {}
  return out;
};

E.kvGet = function (k) {
  if (E._kvHas[k]) return E._kv[k] == null ? null : E._kv[k];
  const v = E.lsGet(k);
  if (v != null) { E._kv[k] = v; E._kvHas[k] = 1; }
  return v;
};
E.kvDel = function (k) {
  delete E._kv[k]; E._kvHas[k] = 1;
  E.lsDel(k);
  if (E.storeMode === 'idb') E._idbOp('delete', k);
};
E.kvSet = function (k, v) {
  v = String(v);
  E._kv[k] = v; E._kvHas[k] = 1;
  // Journal into localStorage first so a reload before the IDB put completes cannot lose the slot.
  // Once IndexedDB has acknowledged the write, drop the LS copy to free quota (item 11).
  let journaled = false;
  try { E.lsSet(k, v); journaled = true; } catch (e) { E._lsJournalErr = e; }
  if (E.storeMode === 'idb') {
    const p = E._idbOp('put', k, v);
    // Drop the journaled body once IDB has it, but keep tiny _meta keys in LS
    // so other tabs can see a newer save (storage events) and the title menu stays current.
    if (journaled && !/_meta$/.test(k)) p.then(() => { try { E.lsDel(k); } catch (e) {} }, () => {});
    return;
  }
  if (!journaled) throw (E._lsJournalErr || new Error('storage is full'));
};

function idbReq(req) {
  return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error || new Error('idb')); });
}
E._idbOp = function (op, key, value) {
  const run = () => {
    if (!E._idb) return Promise.reject(new Error('IndexedDB is not open'));
    const tx = E._idb.transaction(E.IDB_STORE, 'readwrite');
    const store = tx.objectStore(E.IDB_STORE);
    const req = op === 'put' ? store.put(value, key) : op === 'delete' ? store.delete(key) : store.get(key);
    return idbReq(req);
  };
  const p = E._idbQueue.then(run, run);
  E._idbQueue = p.then(() => {}, () => {});
  return p;
};
E.flushStorage = function () { return E._idbQueue || Promise.resolve(); };

E.idbAvailable = function () {
  try { return typeof indexedDB !== 'undefined' && indexedDB !== null; } catch (e) { return false; }
};
E.openIDB = function () {
  return new Promise((res, rej) => {
    let req;
    try { req = indexedDB.open(E.IDB_NAME, 1); }
    catch (e) { return rej(e); }
    req.onupgradeneeded = function (ev) {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains(E.IDB_STORE)) db.createObjectStore(E.IDB_STORE);
    };
    req.onsuccess = function () { res(req.result); };
    req.onerror = function () { rej(req.error || new Error('IndexedDB open failed')); };
    req.onblocked = function () { rej(new Error('IndexedDB open blocked')); };
  });
};
E.idbGetAll = function (db) {
  return new Promise((res, rej) => {
    const tx = db.transaction(E.IDB_STORE, 'readonly');
    const store = tx.objectStore(E.IDB_STORE);
    const out = {};
    if (store.getAllKeys && store.getAll) {
      const kReq = store.getAllKeys(), vReq = store.getAll();
      Promise.all([idbReq(kReq), idbReq(vReq)]).then(([keys, vals]) => {
        for (let i = 0; i < keys.length; i++) out[keys[i]] = vals[i];
        res(out);
      }).catch(rej);
      return;
    }
    const req = store.openCursor();
    req.onsuccess = function () {
      const c = req.result;
      if (c) { out[c.key] = c.value; c.continue(); }
      else res(out);
    };
    req.onerror = () => rej(req.error);
  });
};

E.saveErrorMessage = function (err, bytes) {
  const kb = bytes != null && isFinite(bytes) ? (bytes / 1024).toFixed(1) + ' KB' : '';
  const n = (err && err.name) || '', m = String((err && err.message) || err || '');
  let reason = 'unknown error';
  if (n === 'QuotaExceededError' || /quota|exceeded|full|out of space/i.test(n + ' ' + m)) reason = 'storage is full';
  else if (n === 'SecurityError' || /denied|not allowed|private/i.test(m)) reason = 'storage was blocked (private mode or permissions)';
  else if (/unavailable|IndexedDB|idb/i.test(n + ' ' + m)) reason = 'storage is unavailable';
  else if (m) reason = m;
  return 'Could not save (' + reason + ')' + (kb ? ' — tried to write ' + kb : '');
};

E.cleanupStaleSaves = function (opts) {
  opts = opts || {};
  const removed = [];
  const keys = E.staleSaveKeys();
  // After a successful v26 migration, also drop the v25 LS copies we already copied into v26 / IDB.
  if (opts.dropV25) {
    for (const k of ['goe_save_v25', 'goe_save_v25_s2', 'goe_save_v25_s3']) keys.push(k, k + '_meta');
  }
  // Sweep LS for anything matching old-version save/replay/cache patterns.
  for (const k of E.lsKeys()) {
    if (/^goe_save_v(1\d|2[0-5])/.test(k) || /^eog_save_/.test(k) || /^goe_replay/.test(k) || /^goe_cache/.test(k)) {
      if (keys.indexOf(k) < 0) keys.push(k);
    }
  }
  const keep = new Set(E.SLOT_KEYS || []);
  for (const k of (E.SLOT_KEYS || [])) keep.add(k + '_meta');
  for (const k of keys) {
    if (keep.has(k)) continue;
    try {
      if (E.lsGet(k) != null) { E.lsDel(k); removed.push(k); }
    } catch (e) {}
  }
  E._staleRemoved = removed;
  return removed;
};

E.requestPersist = function () {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      return navigator.storage.persist().then(function (ok) { E.storagePersisted = !!ok; return ok; }).catch(function () { return false; });
    }
  } catch (e) {}
  return Promise.resolve(false);
};

E.initStorage = async function () {
  E.requestPersist();
  // Seed the memory mirror from localStorage first (always available as fallback).
  for (const k of E.lsKeys()) {
    if (E.isSaveKey(k)) { E._kv[k] = E.lsGet(k); E._kvHas[k] = 1; }
  }
  if (!E.idbAvailable()) { E.storeMode = 'ls'; E.cleanupStaleSaves({ dropV25: false }); return { mode: 'ls' }; }
  try {
    const db = await E.openIDB();
    E._idb = db;
    const all = await E.idbGetAll(db);
    for (const k in all) { if (all[k] != null) { E._kv[k] = typeof all[k] === 'string' ? all[k] : String(all[k]); E._kvHas[k] = 1; } }
    // Migrate any localStorage save slots that are not yet in IDB.
    const migrated = [];
    for (const k of E.lsKeys()) {
      if (!E.isSaveKey(k)) continue;
      const v = E.lsGet(k); if (v == null) continue;
      if (E._kv[k] == null) { E._kv[k] = v; E._kvHas[k] = 1; }
      migrated.push(k);
    }
    for (const k of migrated) {
      try { await E._idbOp('put', k, E._kv[k]); } catch (e) { console.warn('idb migrate', k, e); }
    }
    E.storeMode = 'idb';
    // Now that IDB holds a copy, free the localStorage quota used by save slots (incl. older versions).
    // Only delete a key we actually have in the memory/IDB mirror, so a listing failure cannot drop data.
    const freed = [];
    for (const k of E.lsKeys()) {
      if (!E.isSaveKey(k)) continue;
      if (E._kv[k] == null) continue;
      if (/_meta$/.test(k) && (E.SLOT_KEYS || []).some(s => k === s + '_meta')) continue; // keep current-slot meta for cross-tab
      E.lsDel(k); freed.push(k);
    }
    E.cleanupStaleSaves({ dropV25: true });
    E._idbMigrated = migrated;
    E._idbFreed = freed;
    return { mode: 'idb', migrated: migrated.length, freed: freed.length, persisted: E.storagePersisted };
  } catch (e) {
    console.warn('IndexedDB unavailable, using localStorage', e);
    E.storeMode = 'ls';
    E._idb = null;
    E.cleanupStaleSaves({ dropV25: false });
    return { mode: 'ls', error: String(e && e.message || e) };
  }
};

// Wrap the existing sync save/load API so every slot read/write goes through kvGet/kvSet
// (IndexedDB after initStorage, localStorage otherwise). Callers stay synchronous because
// the in-memory mirror is updated immediately; IDB writes are flushed in the background.
const _save0 = E.save;
E.save = function (opts) {
  opts = opts || {};
  try {
    const st = E.state; if (!st) return false;
    if (st._sim) return false;
    const slot = opts.slot || E.slot || 1, key = E.slotKey(slot);
    const old = (function () {
      let raw = null;
      try { raw = E.lsGet && E.lsGet(key + '_meta'); } catch (e) {}
      if (raw == null) try { raw = E.kvGet(key + '_meta'); } catch (e) {}
      try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    })();
    if (opts.auto) {
      if (old && old.sid && old.sid !== E.SESSION && (+old.when || 0) > E._myWhen) { E.saveConflict = true; return false; }
    }
    const when = Math.max(Date.now(), E._myWhen + 1);
    st.savedAt = when; st.slot = slot;
    const raw = E.serialize ? E.serialize() : E.serializeState(st);
    const bytes = (raw ? raw.length : 0) * 2;
    E._lastSaveBytes = bytes;
    const name = opts.name != null ? String(opts.name).slice(0, 24) : (old && old.name) || null;
    const metaObj = { t: st.t, diff: st.diff, when, sid: E.SESSION, ver: E.VERSION, planets: E.playerPlanets().length, size: st.cfg && st.cfg.size, rivals: st.cfg && st.cfg.rivals, mode: st.mode, stage: st.endless ? st.endless.stage + 1 : 0, species: st.species, name: name || null, bytes };
    const meta = JSON.stringify(metaObj);
    try {
      E.kvSet(key, raw);
      E.kvSet(key + '_meta', meta);
    } catch (e) {
      // Last-ditch: drop stale/older-version keys and retry once (LS fallback only).
      try { E.cleanupStaleSaves({ dropV25: true }); E.kvSet(key, raw); E.kvSet(key + '_meta', meta); }
      catch (e2) {
        E.lastSaveError = E.saveErrorMessage(e2, bytes);
        console.warn('save failed', e2);
        return false;
      }
    }
    if (E.kvGet(key + '_meta') !== meta) throw new Error('save did not stick');
    E._myWhen = when; E.saveConflict = false; E.lastSaveError = null; E.slot = slot;
    return true;
  } catch (e) {
    const bytes = E._lastSaveBytes || (E._lastSaveZBytes || E._lastSaveJsonBytes);
    E.lastSaveError = E.saveErrorMessage(e, bytes);
    console.warn('save failed', e);
    return false;
  }
};

E.newestSaveKey = function () {
  let best = null, bw = -Infinity;
  try {
    for (const k of E.SAVE_CHAIN) {
      if (!E.kvGet(k)) continue;
      let m = null; try { m = JSON.parse(E.kvGet(k + '_meta') || 'null'); } catch (e) {}
      const w = m && +m.when || 0;
      if (w > bw) { bw = w; best = k; }
    }
  } catch (e) { return null; }
  return best;
};
E.hasSave = function () { try { return E.SAVE_CHAIN.some(k => !!E.kvGet(k)); } catch (e) { return false; } };
E.saveMeta = function () { const k = E.newestSaveKey(); if (!k) return null; try { return JSON.parse(E.kvGet(k + '_meta') || 'null'); } catch (e) { return null; } };
const _slotInfo0 = E.slotInfo;
E.slotInfo = function () {
  const keys = E.SLOT_KEYS;
  return keys.map((k, i) => {
    const raw = E.kvGet(k);
    const has = !!raw;
    let m = null; try { m = has ? JSON.parse(E.kvGet(k + '_meta') || 'null') : null; } catch (e) {}
    const bytes = has ? (raw.length * 2) : 0;
    return { n: i + 1, key: k, has, name: (m && m.name) || 'Slot ' + (i + 1), meta: m, bytes };
  });
};
const _loadKey0 = E.loadKey;
E.loadKey = function (key) {
  try {
    const raw = E.kvGet(key); if (!raw) return null;
    const fromPrev = E.SLOT_KEYS.indexOf(key) < 0;
    const st = E.parseSave(raw);
    let m = null; try { m = JSON.parse(E.kvGet(key + '_meta') || 'null'); } catch (e) {}
    E._myWhen = Math.max(E._myWhen, m && +m.when || 0);
    E.state = st; E.loadedFrom = key;
    if (fromPrev) { E.slot = 1; if (/v25/.test(key)) E.migratedFromV25 = true; else if (/v24/.test(key)) E.migratedFromV24 = true; else if (/v23/.test(key)) E.migratedFromV23 = true; else if (/v22/.test(key)) E.migratedFromV22 = true; else if (/v21/.test(key)) E.migratedFromV21 = true; else if (/v20/.test(key)) E.migratedFromV20 = true; else if (/v19/.test(key)) E.migratedFromV19 = true; else if (/v18/.test(key)) E.migratedFromV18 = true; else if (/v17/.test(key)) E.migratedFromV17 = true; else if (/v16/.test(key)) E.migratedFromV16 = true; else E.migratedFromV15 = true; E.save({ slot: 1 }); }
    else E.slot = E.SLOT_KEYS.indexOf(key) + 1;
    return st;
  } catch (e) { console.warn('load failed', e); return null; }
};
E.deleteSlot = function (n) { try { const k = E.slotKey(n); E.kvDel(k); E.kvDel(k + '_meta'); } catch (e) {} };
E.renameSlot = function (n, name) {
  try {
    const k = E.slotKey(n); let m = null; try { m = JSON.parse(E.kvGet(k + '_meta') || 'null'); } catch (e) {}
    if (!m) return false;
    m.name = String(name || '').slice(0, 24) || null;
    E.kvSet(k + '_meta', JSON.stringify(m));
    return true;
  } catch (e) { return false; }
};
E.deleteSave = function () { E.slot = 1; try { for (const k of E.SAVE_CHAIN) { E.kvDel(k); E.kvDel(k + '_meta'); } } catch (e) {} };
E.migratePrevSlots = function () {
  const groups = [
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
      if (E.kvGet(E.SLOT_KEYS[i])) continue;
      for (const g of groups) {
        const src = g.keys[i]; if (!src) continue;
        const raw = E.kvGet(src); if (!raw) continue;
        const st = E.parseSave(raw);
        const prev = E.state, prevSlot = E.slot;
        E.state = st;
        let m = null; try { m = JSON.parse(E.kvGet(src + '_meta') || 'null'); } catch (e) {}
        const ok = E.save({ slot: i + 1, name: (m && m.name) || null });
        E.state = prev; E.slot = prevSlot;
        if (ok) E[g.flag] = true;
        break;
      }
    }
  } catch (e) { console.warn('prev slot migrate failed', e); }
};
const _export0 = E.exportSave;
E.exportSave = function (n) {
  const k = n ? E.slotKey(n) : E.newestSaveKey(); let raw = null, meta = null;
  if (E.state && !E.state._sim && (!n || n === E.slot)) { raw = E.serialize(); try { meta = JSON.parse(E.kvGet(E.slotKey(E.slot) + '_meta') || 'null'); } catch (e) { meta = null; } }
  else { raw = k && E.kvGet(k); try { meta = k && JSON.parse(E.kvGet(k + '_meta') || 'null'); } catch (e) { meta = null; } }
  if (!raw) return null;
  if (E.unpackSave) raw = E.unpackSave(raw);
  return JSON.stringify({ format: 'goe-save', ver: E.VERSION, exported: new Date().toISOString(), meta, state: JSON.parse(raw) });
};
E.slotBytes = function (n) {
  const keys = E.SLOT_KEYS || [];
  const key = n == null ? E.newestSaveKey() : keys[n - 1];
  if (!key) return 0;
  const raw = E.kvGet(key);
  return raw ? raw.length * 2 : 0;
};
E.slotSizeKB = function (n) { return E.slotBytes(n) / 1024; };



// v2.6 item 6: laser beam (ramp DPS, reset on retarget) and railgun slow slugs. Unlimited range inside the battle.
E.specialDefFire = function (b, u, t, v, dt, d) {
  if (!u || !t || (u.kind !== 'laser' && u.kind !== 'railgun')) return false;
  const st = E.state, R = () => Math.random();
  if (u.kind === 'laser') {
    if (u.lock !== t.uid) { u.lock = t.uid; u.beamT = 0; }
    u.beamT = (u.beamT || 0) + dt;
    const ramp = 1 + ((E.LASER_RAMP_MAX || 3) - 1) * Math.min(1, u.beamT / (E.LASER_RAMP || 8));
    const dmg = (v.dps || 24) * ramp * dt;
    if (dmg > 0) E.damage ? E.damage(b, t, dmg, u) : damageSafe(b, t, dmg, u);
    if (b.fx && b.fx.length < 320) b.fx.push({ k: 'beam', x1: u.x, y1: u.y, x2: t.x, y2: t.y, c: '#7dff6b', life: 0.08, ramp });
    return true;
  }
  // railgun
  u.cd = (u.cd || 0) - dt;
  if (u.cd <= 0) {
    u.cd = u.rcd || (E.railgunStats && E.railgunStats(E.sysPlanet(b.sys) || { def: {} }).cd) || 3.5;
    const shot = u.shot || 2200;
    if (E.damage) E.damage(b, t, shot, u); else damageSafe(b, t, shot, u);
    if (b.fx && b.fx.length < 320) b.fx.push({ k: 'rail', x1: u.x, y1: u.y, x2: t.x, y2: t.y, c: '#fff5c8', life: 0.42 });
  }
  return true;
};
function damageSafe(b, t, dmg, src) {
  // Fallback if damage() is file-local and not exported — try the sim hook.
  try { if (typeof damage === 'function') return damage(b, t, dmg, src); } catch (e) {}
  if (t.kind === 'ship') {
    const f = (E.fleetById && t.fid != null) ? E.fleetById(t.fid) : null;
    const s = f && f.ships && f.ships.find(x => x.uid === t.uid);
    if (s) { let left = dmg; if (s.sh) { const use = Math.min(s.sh, left); s.sh -= use; left -= use; } s.hp -= left; }
  } else t.hp = (t.hp || 0) - dmg;
}
// Export damage if the sim later assigns it.
if (!E.damage && E.unitVals) { /* filled below if we can wrap */ }



// ---------- item 10: home choke / back cluster / front twin-chokes / Galactic center ----------
E.cornerClusters26 = function (systems, lanes, N, W, H, r, nRivals, nAllies, sizeKey) {
  const nE = 1 + nRivals + nAllies;
  const inset = 90, X0 = inset, Y0 = inset, X1 = W - inset, Y1 = H - inset;
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

  const C = { x: W / 2, y: H / 2 };
  const big = sizeKey === 'massive' || sizeKey === 'galactic';
  const centerN = big ? Math.min(20, Math.max(10, Math.round(12 + (r ? r() : Math.random()) * 8))) : 0;
  const budget = Math.max(3, Math.floor((N - centerN) * 0.78 / nE));

  function counts() {
    let backN = Math.min(5, Math.max(1, 3 + Math.floor((r ? r() : Math.random()) * 3))); // 3-5
    let frontN = Math.min(8, Math.max(2, 4 + Math.floor((r ? r() : Math.random()) * 5))); // 4-8
    while (1 + backN + 1 + frontN > budget) {
      if (frontN > 2 && frontN >= backN) frontN--;
      else if (backN > 1) backN--;
      else { frontN = Math.max(2, frontN - 1); if (1 + backN + 1 + frontN <= budget || (backN === 1 && frontN === 2)) break; }
    }
    return { backN, frontN };
  }

  const claimed = new Set(), clusters = [], clusterOf = {}, pockets = [];
  const nearest = (pred, from) => {
    let b = -1, bd = Infinity;
    for (let i = 0; i < N; i++) {
      if (claimed.has(i) || (pred && !pred(i))) continue;
      const d = E.dist(systems[i], from);
      if (d < bd) { bd = d; b = i; }
    }
    return b;
  };

  anchors.forEach((a, e) => {
    const { backN, frontN } = counts();
    const home = nearest(null, a);
    if (home < 0) return;
    claimed.add(home);
    const back = [], front = [];
    // behind home: further from centre than home is, preferably closer to the edge anchor
    for (let k = 0; k < backN; k++) {
      const i = nearest(j => E.dist(systems[j], C) >= E.dist(systems[home], C) * 0.92, { x: a.x, y: a.y });
      if (i < 0) break;
      back.push(i); claimed.add(i);
    }
    // if we couldn't fill "behind", take the leftover nearest to the anchor
    while (back.length < Math.min(backN, 2)) {
      const i = nearest(null, a); if (i < 0) break; back.push(i); claimed.add(i);
    }
    const entrance = nearest(j => E.dist(systems[j], C) <= E.dist(systems[home], C) * 1.08, C);
    if (entrance >= 0) claimed.add(entrance);
    for (let k = 0; k < frontN; k++) {
      const i = nearest(j => j !== entrance, C);
      if (i < 0) break;
      front.push(i); claimed.add(i);
    }
    const exits = front.slice().sort((i, j) => E.dist(systems[i], C) - E.dist(systems[j], C)).slice(0, 2);
    // if we have only one front world, it carries both outgoing lanes
    const cl = [home].concat(back);
    if (entrance >= 0 && cl.indexOf(entrance) < 0) cl.push(entrance);
    front.forEach(i => { if (cl.indexOf(i) < 0) cl.push(i); });
    cl.forEach(i => { clusterOf[i] = e; });
    clusters.push(cl);
    pockets.push({ home, back, entrance, front, exits, cl });
  });

  // Optional central cluster (Massive / Galactic): 10–20 worlds, 4 chokes N/E/S/W.
  let center = [], centerChokes = [];
  if (centerN) {
    const cand = [];
    for (let i = 0; i < N; i++) if (!claimed.has(i)) cand.push([E.dist(systems[i], C), i]);
    cand.sort((a, b) => a[0] - b[0]);
    const take = Math.min(centerN, cand.length);
    for (let k = 0; k < take; k++) { center.push(cand[k][1]); claimed.add(cand[k][1]); }
    if (center.length) {
      const pick = (score) => { let b = center[0], bd = -Infinity; for (const i of center) { const s = score(systems[i]); if (s > bd) { bd = s; b = i; } } return b; };
      const Nch = pick(s => -s.y), Ech = pick(s => s.x), Sch = pick(s => s.y), Wch = pick(s => -s.x);
      centerChokes = [...new Set([Nch, Ech, Sch, Wch])];
      // if direction ties collapsed, fill from remaining by angle
      if (centerChokes.length < 4) {
        const left = center.filter(i => centerChokes.indexOf(i) < 0);
        left.sort((i, j) => Math.atan2(systems[i].y - C.y, systems[i].x - C.x) - Math.atan2(systems[j].y - C.y, systems[j].x - C.x));
        for (const i of left) { if (centerChokes.length >= 4) break; centerChokes.push(i); }
      }
    }
  }
  const inCenter = new Set(center);

  // Rebuild lanes: drop anything that violates pocket / center rules, then add the required links.
  const has = (a, b) => lanes.some(l => (l[0] === a && l[1] === b) || (l[0] === b && l[1] === a));
  const keep = [];
  const owner = i => clusterOf[i];
  const isOpen = i => owner(i) == null && !inCenter.has(i);
  for (const [a, b] of lanes) {
    const oa = owner(a), ob = owner(b);
    if (oa != null && ob != null && oa === ob) { keep.push([a, b]); continue; } // may trim later
    if (oa != null && ob != null && oa !== ob) continue; // no direct pocket-to-pocket
    if ((oa != null && inCenter.has(b)) || (ob != null && inCenter.has(a))) continue;
    if (inCenter.has(a) && inCenter.has(b)) { keep.push([a, b]); continue; }
    if (oa == null && ob == null && !inCenter.has(a) && !inCenter.has(b)) { keep.push([a, b]); continue; }
    // pocket <-> open or center <-> open: drop for now; we add legal chokes below
  }
  lanes.length = 0;
  keep.forEach(l => lanes.push(l));

  const par = Array.from({ length: N }, (_, i) => i);
  const find = x => par[x] === x ? x : (par[x] = find(par[x]));
  const uni = (a, b) => { par[find(a)] = find(b); };
  const link = (a, b) => {
    if (a == null || b == null || a < 0 || b < 0 || a === b) return;
    if (!has(a, b)) lanes.push([a, b]);
    uni(a, b);
  };
  lanes.forEach(([a, b]) => uni(a, b));

  const connectSet = (ids) => {
    if (ids.length < 2) return;
    for (let g = 0; g < ids.length + 4; g++) {
      const r0 = find(ids[0]); const out = ids.filter(i => find(i) !== r0); if (!out.length) break;
      let best = null, bd = Infinity;
      for (const a of ids) if (find(a) === r0) for (const b of out) {
        const d = E.dist(systems[a], systems[b]); if (d < bd) { bd = d; best = [a, b]; }
      }
      if (best) link(best[0], best[1]);
    }
  };

  const homeChokes = [];
  pockets.forEach((pk, e) => {
    const { home, back, entrance, front, exits } = pk;
    // Drop any leftover intra-pocket lane that skips the intended topology (e.g. a back world linked to the front).
    for (let i = lanes.length - 1; i >= 0; i--) {
      const [a, b] = lanes[i];
      if (owner(a) !== e && owner(b) !== e) continue;
      const inBack = x => back.indexOf(x) >= 0;
      const inFront = x => front.indexOf(x) >= 0 || x === entrance;
      if ((inBack(a) && inFront(b)) || (inBack(b) && inFront(a))) { lanes.splice(i, 1); continue; }
      if ((inBack(a) && b !== home && !inBack(b)) || (inBack(b) && a !== home && !inBack(a))) { lanes.splice(i, 1); continue; }
    }
    // rebuild union-find for this pass? We only use connectSet + link going forward.
    connectSet(back.concat([home]));
    back.forEach(i => link(i, home)); // every back world touches home, so the only exit is home
    if (entrance >= 0) {
      link(home, entrance);
      if (front.length) {
        // entrance is the single choke in front of home: it is the only way into the front cluster
        let gate = front[0], gd = Infinity;
        for (const i of front) { const d = E.dist(systems[i], systems[entrance]); if (d < gd) { gd = d; gate = i; } }
        link(entrance, gate);
        connectSet(front.concat([entrance]));
        // remove any other home/back links into the front besides home-entrance-gate
        for (let i = lanes.length - 1; i >= 0; i--) {
          const [a, b] = lanes[i];
          const touchesHomeSide = a === home || b === home || back.indexOf(a) >= 0 || back.indexOf(b) >= 0;
          const touchesFront = front.indexOf(a) >= 0 || front.indexOf(b) >= 0;
          if (touchesHomeSide && touchesFront) {
            const ok = (a === home && b === entrance) || (b === home && a === entrance) || (a === entrance && b === gate) || (b === entrance && a === gate);
            if (!ok) lanes.splice(i, 1);
          }
        }
      }
    }
    // two exits from the front cluster into the open map (or onto a centre choke / another open world)
    const open = [];
    for (let i = 0; i < N; i++) if (isOpen(i) || (inCenter.has(i) && centerChokes.indexOf(i) >= 0)) open.push(i);
    const exitNodes = (exits && exits.length ? exits.slice() : front.slice()).slice(0, 2);
    if (exitNodes.length === 1 && front.length) exitNodes.push(front[0]);
    exitNodes.forEach(ex => {
      let b = -1, bd = Infinity;
      for (const i of open) { const d = E.dist(systems[ex], systems[i]); if (d < bd) { bd = d; b = i; } }
      if (b >= 0) link(ex, b);
    });
    homeChokes[e] = entrance >= 0 ? entrance : home;
  });

  if (center.length) {
    connectSet(center);
    const open = [];
    for (let i = 0; i < N; i++) if (isOpen(i)) open.push(i);
    // strip any center-to-open lane that is not one of the 4 official chokes
    for (let i = lanes.length - 1; i >= 0; i--) {
      const [a, b] = lanes[i];
      const aC = inCenter.has(a), bC = inCenter.has(b);
      if (aC === bC) continue;
      const ch = aC ? a : b, out = aC ? b : a;
      if (centerChokes.indexOf(ch) < 0 || !isOpen(out)) lanes.splice(i, 1);
    }
    centerChokes.forEach(ch => {
      let b = -1, bd = Infinity;
      for (const i of open) { const d = E.dist(systems[ch], systems[i]); if (d < bd) { bd = d; b = i; } }
      if (b >= 0) link(ch, b);
    });
  }

  // Rebuild union-find from the final lane list and stitch any remaining islands through legal chokes.
  for (let i = 0; i < N; i++) par[i] = i;
  lanes.forEach(([a, b]) => uni(a, b));
  const legalJoin = (i, j) => {
    // never punch a new hole through a pocket or the centre: only join two open worlds, or a choke to open.
    const pk = x => owner(x) != null, ct = x => inCenter.has(x);
    if (pk(i) && pk(j) && owner(i) !== owner(j)) return false;
    if ((pk(i) && ct(j)) || (pk(j) && ct(i))) return false;
    if (pk(i) && !pk(j)) return homeChokes[owner(i)] === i || (pockets[owner(i)].exits || []).indexOf(i) >= 0 || pockets[owner(i)].entrance === i;
    if (pk(j) && !pk(i)) return homeChokes[owner(j)] === j || (pockets[owner(j)].exits || []).indexOf(j) >= 0 || pockets[owner(j)].entrance === j;
    if (ct(i) && !ct(j)) return centerChokes.indexOf(i) >= 0;
    if (ct(j) && !ct(i)) return centerChokes.indexOf(j) >= 0;
    return true;
  };
  for (let g = 0; g < N; g++) {
    const r0 = find(0); let hole = -1;
    for (let i = 1; i < N; i++) if (find(i) !== r0) { hole = i; break; }
    if (hole < 0) break;
    let best = null, bd = Infinity;
    for (let a = 0; a < N; a++) if (find(a) === r0) for (let b = 0; b < N; b++) if (find(b) === find(hole) && legalJoin(a, b)) {
      const d = E.dist(systems[a], systems[b]); if (d < bd) { bd = d; best = [a, b]; }
    }
    if (!best) { // last resort: nearest pair, still recorded so the map stays connected
      for (let a = 0; a < N; a++) if (find(a) === r0) for (let b = 0; b < N; b++) if (find(b) === find(hole)) {
        const d = E.dist(systems[a], systems[b]); if (d < bd) { bd = d; best = [a, b]; }
      }
    }
    if (best) link(best[0], best[1]);
    else break;
  }

  E._map26 = { pockets, center, centerChokes, homeChokes, sizeKey };
  const chokes = homeChokes.slice();
  return {
    home: pockets[0] ? pockets[0].home : 0,
    homes: pockets.slice(0, 1 + nRivals).map(p => p.home),
    allyHomes: pockets.slice(1 + nRivals).map(p => p.home),
    clusters, clusterOf, chokes
  };
};

})();
