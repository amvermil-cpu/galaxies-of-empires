// Galaxies of Empires v2.5 — battle playback, rally departure, compact saves, Annihilate, HQ order, pan hooks.
'use strict';
(function () {
const E = window.EOG;

E.migrate25 = function (st) {
  if (!st) return st;
  st.ver = '2.5';
  st.reports = st.reports || [];
  st.results = st.results || [];
  st.replays = st.replays || [];
  st.stuckAlerts = st.stuckAlerts || [];
  E.trimBattleLogs(st);
  return st;
};

// ---------- item 8: keep the last ~10 battles; trim derived log bulk ----------
E.REPORT_KEEP = 10;
E.RESULT_KEEP = 10;
E.REPLAY_SAVE = 8;
E.LOG_SAVE = 80;
E.CMD_LOG_SAVE = 40;
E.trimBattleLogs = function (st) {
  if (!st) st = E.state; if (!st) return;
  if (st.reports && st.reports.length > E.REPORT_KEEP) st.reports.length = E.REPORT_KEEP;
  if (st.results && st.results.length > E.RESULT_KEEP) st.results.length = E.RESULT_KEEP;
  if (st.log && st.log.length > E.LOG_SAVE) st.log.length = E.LOG_SAVE;
  if (st.cmdLog && st.cmdLog.length > E.CMD_LOG_SAVE) st.cmdLog.length = E.CMD_LOG_SAVE;
  if (st.replays && st.replays.length > E.REPLAY_SAVE) st.replays.length = E.REPLAY_SAVE;
};

// ---------- item 4: sample every resolved tick + real hit events; scale playback ----------
E.PLAY_DUR_MIN = 8;
E.PLAY_DUR_MAX = 18;
E.battleTick = function (b) {
  if (!b) return;
  if (E.recordBattle && !b._rec) E.recordBattle(b);
  const rec = b._rec; if (!rec || !E.recSample) return;
  if (b.t - rec.lastT >= (rec.dt || E.REC_DT || 0.33)) E.recSample(b);
};
E.battleHit = function (b, src, t, dmg, dead) {
  if (!b || !b._rec) return;
  const rec = b._rec;
  rec.ev = rec.ev || [];
  if (rec.ev.length > 4000) return;
  const ev = { t: b.t, k: dead ? 'boom' : 'shot', x: t ? t.x : 0, y: t ? t.y : 0, dead: !!dead };
  if (src) { ev.x0 = src.x; ev.y0 = src.y; ev.sh = src.h || src.kind || null; ev.owner = src.owner; ev.side = src.side; }
  if (t) { ev.x1 = t.x; ev.y1 = t.y; ev.th = t.h || t.kind || null; ev.ts = t.side; }
  rec.ev.push(ev);
};

function scaleReplay(out, rec) {
  if (!out || out._scaled) return out;
  const raw = Math.max(0.05, (out.dur || 0) - (out.t0 || 0));
  const play = raw < 6 ? Math.max(3, raw * 1.2) : Math.min(E.PLAY_DUR_MAX, Math.max(E.PLAY_DUR_MIN, 6 + Math.sqrt(raw) * 1.4));
  const k = play / raw, t0 = out.t0 || 0;
  const map = t => (t - t0) * k;
  for (const f of out.frames || []) f.t = map(f.t);
  out.events = out.events || [];
  for (const ev of out.events) ev.t = map(ev.t);
  // Real hit events fill in shots when a recording is too sparse (e.g. the old start+end-only bug).
  // Do not add them on top of a dense inferred timeline — that would double-count explosions.
  if (rec && rec.ev && rec.ev.length && (out.events.length < 8 || (out.frames && out.frames.length <= 3))) {
    for (const e of rec.ev) {
      const ev = { t: map(e.t), k: e.k === 'boom' ? 'boom' : (e.sh === 'station' ? 'beam' : e.sh === 'turret' ? 'heavy' : e.sh === 'destroyer' || e.sh === 'carrier' ? 'missile' : 'laser') };
      if (e.k === 'boom') { ev.x = e.x; ev.y = e.y; ev.r = 18; }
      else { ev.x0 = e.x0; ev.y0 = e.y0; ev.x1 = e.x1; ev.y1 = e.y1; ev.life = 0.28; }
      ev.side = e.side;
      out.events.push(ev);
    }
    out.events.sort((a, b) => a.t - b.t);
  }
  out.rawDur = raw;
  out.t0 = 0;
  out.dur = play;
  out._scaled = true;
  return out;
}
const _replayJob = E.replayJob;
if (_replayJob) {
  E.replayJob = function (rec, fxScale) {
    const job = _replayJob(rec, fxScale);
    const step0 = job.step;
    job.step = function (chunk) {
      const r = step0.call(job, chunk);
      if (job.done) scaleReplay(job.out, rec);
      return r;
    };
    return job;
  };
}
const _buildSync = E.buildReplaySync;
E.buildReplaySync = function (idOrRec, fxScale) {
  const rec = idOrRec && typeof idOrRec === 'object' && idOrRec.frames ? idOrRec : (E.getReplay && E.getReplay(idOrRec));
  if (!rec) return null;
  const j = E.replayJob(rec, fxScale);
  while (!j.step(200));
  return j.out;
};

// persist a compact replay into the save (item 9), counted in the size budget
E.persistReplay = function (rec) {
  const st = E.state; if (!st || !rec) return;
  st.replays = st.replays || [];
  const packed = packReplay(rec);
  const i = st.replays.findIndex(r => r.id === rec.id);
  if (i >= 0) st.replays.splice(i, 1);
  st.replays.unshift(packed);
  if (st.replays.length > E.REPLAY_SAVE) st.replays.length = E.REPLAY_SAVE;
};
function packReplay(rec) {
  const frames = (rec.frames || []).map(f => {
    const d = f.d ? Array.from(f.d) : [];
    for (let i = 0; i < d.length; i++) d[i] = Math.round(d[i]);
    return { t: +(+f.t).toFixed(3), d, s: f.shield ? +(+f.shield).toFixed(3) : 0 };
  });
  const ev = (rec.ev || []).filter((e, i) => i % 2 === 0 || e.dead).slice(0, 800).map(e => ({
    t: +(+e.t).toFixed(3), k: e.k === 'boom' ? 'b' : 's',
    x0: e.x0 == null ? undefined : Math.round(e.x0), y0: e.y0 == null ? undefined : Math.round(e.y0),
    x1: e.x1 == null ? undefined : Math.round(e.x1), y1: e.y1 == null ? undefined : Math.round(e.y1),
    x: e.x == null ? undefined : Math.round(e.x), y: e.y == null ? undefined : Math.round(e.y)
  }));
  return { id: rec.id, bid: rec.bid, sys: rec.sys, system: rec.system, owners: rec.owners, winner: rec.winner,
    t0: rec.t0, dur: rec.dur, ptype: rec.ptype, powner: rec.powner, planetSide: rec.planetSide, units: rec.units,
    frames, ev, total: rec.total, alive: rec.alive, t: rec.t0 };
}
E.restoreReplays = function (st) {
  st = st || E.state; if (!st || !st.replays) return;
  E.replays = E.replays || new Map();
  E.replayBySys = E.replayBySys || new Map();
  for (const p of st.replays) {
    if (!p || p.id == null) continue;
    const rec = unpackReplay(p);
    E.replays.set(rec.id, rec);
    if (rec.sys != null) E.replayBySys.set(rec.sys, rec.id);
  }
};
function unpackReplay(p) {
  const rec = Object.assign({}, p, {
    frames: (p.frames || []).map(f => ({ t: f.t, d: Float32Array.from(f.d || []), shield: f.s || 0 })),
    ev: (p.ev || []).map(e => ({ t: e.t, k: e.k === 'b' ? 'boom' : 'shot', x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1, x: e.x, y: e.y })),
    done: true, dt: E.REC_DT
  });
  return rec;
}
E.on('battleEnd', o => { if (o && o.b && o.b._rec) E.persistReplay(o.b._rec); });

// ---------- item 6: compact + compress saves ----------
E.compactState = function (st) {
  st = st || E.state;
  const json = JSON.stringify(st, function (k, v) {
    if (k === '_f' || k === '_s' || k === 'toasts') return undefined;
    if (typeof k === 'string' && k.charAt(0) === '_') return undefined;
    return v;
  });
  const raw = JSON.parse(json);
  E.trimBattleLogs(raw);
  if (raw.battles) for (const b of raw.battles) { delete b.fx; delete b.byId; if (b.units) for (const u of b.units) { delete u._f; delete u._s; } }
  if (raw.windows) for (const w of raw.windows) {
    if (w.reg && Object.keys(w.reg).length > 400) {
      const keep = {}; let n = 0;
      for (const id in w.reg) { if (n++ > 400) break; keep[id] = w.reg[id]; }
      w.reg = keep;
    }
  }
  return raw;
};
E.lzCompress = lzCompress;
E.lzDecompress = lzDecompress;
E.serializeRawJSON = function (st) {
  st = st || E.state;
  const copy = Object.assign({}, st, { toasts: [] });
  copy.battles = (st.battles || []).map(b => Object.assign({}, b, { fx: [] }));
  return JSON.stringify(copy, (k, v) => (k === '_f' || k === '_s') ? undefined : v);
};
E.serializeState = function (st) {
  const raw = E.compactState(st || E.state);
  const json = JSON.stringify(raw);
  E._lastSaveJson = json;
  E._lastSaveJsonBytes = json.length * 2;
  try {
    const z = 'GOEZ1:' + lzCompress(json);
    if (z.length + 8 < json.length) { E._lastSaveZ = z; E._lastSaveZBytes = z.length * 2; return z; }
  } catch (e) { /* fall through */ }
  E._lastSaveZ = json; E._lastSaveZBytes = json.length * 2;
  return json;
};
E.serialize = function () { return E.serializeState(E.state); };
E.unpackSave = function (raw) {
  if (raw && typeof raw === 'string' && raw.slice(0, 6) === 'GOEZ1:') {
    try { return lzDecompress(raw.slice(6)); } catch (e) { return raw; }
  }
  return raw;
};
const _loadKey = E.loadKey;
E.loadKey = function () {
  const st = _loadKey.apply(this, arguments);
  if (st) { E.trimBattleLogs(st); E.restoreReplays(st); }
  return st;
};
E.slotBytes = function (n) {
  const keys = E.SLOT_KEYS || [];
  const key = n == null ? (E.newestSaveKey && E.newestSaveKey()) : keys[n - 1];
  if (!key) return 0;
  try {
    const raw = localStorage.getItem(key);
    return raw ? raw.length * 2 : 0;
  } catch (e) { return 0; }
};
E.slotSizeKB = function (n) { return E.slotBytes(n) / 1024; };
const _slotInfo = E.slotInfo;
E.slotInfo = function () {
  const list = _slotInfo.apply(this, arguments);
  for (const sl of list) sl.bytes = sl.has ? E.slotBytes(sl.n) : 0;
  return list;
};

// Simple LZW over UTF-8 bytes (so em-dashes and other non-Latin-1 chars survive),
// packed as one UTF-16 code unit per dictionary code (localStorage-friendly).
function toUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}
function fromUtf8(s) {
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 255;
  return new TextDecoder().decode(bytes);
}
function lzCompress(input) {
  if (input == null) return '';
  input = toUtf8(input);
  const dict = Object.create(null);
  for (let i = 0; i < 256; i++) dict[String.fromCharCode(i)] = i;
  let dictSize = 256, w = '';
  const out = [];
  for (let i = 0; i < input.length; i++) {
    const c = input.charAt(i), wc = w + c;
    if (dict[wc] != null) w = wc;
    else {
      out.push(dict[w]);
      if (dictSize < 65500) dict[wc] = dictSize++;
      w = c;
    }
  }
  if (w !== '') out.push(dict[w]);
  out.push(0xFFFF);
  let s = '';
  for (let i = 0; i < out.length; i++) s += String.fromCharCode(out[i]);
  return s;
}
function lzDecompress(compressed) {
  if (!compressed) return '';
  const codes = [];
  for (let i = 0; i < compressed.length; i++) codes.push(compressed.charCodeAt(i));
  if (codes.length && codes[codes.length - 1] === 0xFFFF) codes.pop();
  if (!codes.length) return '';
  const dict = [];
  for (let i = 0; i < 256; i++) dict[i] = String.fromCharCode(i);
  let dictSize = 256, w = dict[codes[0]];
  if (w == null) return '';
  const result = [w];
  for (let i = 1; i < codes.length; i++) {
    const k = codes[i];
    let entry;
    if (dict[k] != null) entry = dict[k];
    else if (k === dictSize) entry = w + w.charAt(0);
    else return '';
    result.push(entry);
    if (dictSize < 65500) dict[dictSize++] = w + entry.charAt(0);
    w = entry;
  }
  return fromUtf8(result.join(''));
}

// ---------- item 2 / 7: Annihilate ----------
E.SEND_ACTIONS.annihilate = { name: 'Annihilate', icon: '💀', desc: 'Drive to any enemy world, even deep behind the front. The fleet fights and razes every enemy planet on the way, then holds at the target. Neutral and friendly worlds are passed through.' };
E.annihilatePath = function (owner, from, to) {
  if (from === to) return [];
  return E.path(from, to); // raw shortest path — may cross enemy worlds
};
E.annihilateStops = function (owner, from, to) {
  const path = E.annihilatePath(owner, from, to);
  if (!path) return null;
  const stops = [];
  for (const sys of path) {
    const p = E.sysPlanet(sys);
    if (p && E.hostile(owner, p.owner)) stops.push(sys);
  }
  return { path, stops };
};
const _sendActionsFor = E.sendActionsFor;
E.sendActionsFor = function (fids, sys, opts) {
  const out = _sendActionsFor(fids, sys, opts);
  const st = E.state, p = E.sysPlanet(sys);
  const fs = (fids || []).map(E.fleetById).filter(Boolean);
  const own = p && p.owner === 'player', neutral = p && p.owner === 'neutral', rift = !p;
  const allyP = p && E.isAlly(p.owner);
  const armed = fs.some(f => E.fleetArmed(f));
  let routeOk = '', route = null;
  if (fs.length && p) {
    const f0 = fs[0];
    const from = f0.path.length ? f0.path[0] : f0.sys;
    route = E.annihilateStops('player', from, sys);
    if (!route) routeOk = 'No route to that system';
  } else if (!fs.length) routeOk = 'Pick a fleet';
  out.annihilate = own || rift || !p ? 'Pick an enemy planet' : allyP ? 'That is your ally' : neutral ? 'Only enemy colonies' : !armed ? 'Needs warships' : routeOk;
  return out;
};
const _etaTo = E.etaTo;
E.etaToAnnihilate = function (f, sys) {
  const from = f.path.length ? f.path[0] : f.sys;
  if (from === sys) return 0;
  const path = E.annihilatePath(f.owner, from, sys);
  if (!path) return Infinity;
  // hopTime * hops, plus remaining progress on the current hop
  let t = 0;
  const cur = f.path.length ? f.prog || 0 : 0;
  // approximate: same as etaTo but on the raw path
  const hop = E.hopTime(f);
  t = hop * (path.length - (f.path.length ? cur : 0));
  if (f.path.length && f.path[f.path.length - 1] === sys && _etaTo) return _etaTo(f, sys);
  return Math.max(0, t);
};
const _sendPreview = E.sendPreview;
E.sendPreview = function (fids, sys, speed, sync) {
  const U = E.ui;
  const annihilate = U && U.sendSel && U.sendSel.action === 'annihilate' && U.sendSel.s === sys;
  if (!annihilate) return _sendPreview(fids, sys, speed, sync);
  speed = E.clamp(speed == null ? 1 : speed, 0.25, 1);
  const rows = (fids || []).map(E.fleetById).filter(Boolean).map(f => ({ f, fid: f.id, base: E.etaToAnnihilate(f, sys) }));
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
const _send = E.act.send;
E.act.send = function (fids, sys, action, opts) {
  if (action !== 'annihilate') return _send.apply(this, arguments);
  opts = opts || {};
  const st = E.state, p = E.sysPlanet(sys);
  fids = (fids || []).filter(id => { const f = E.fleetById(id); return f && f.owner === 'player' && f.ships.length; });
  if (!fids.length) return { ok: false, msg: 'Pick at least one fleet' };
  const why = E.sendActionsFor(fids, sys, opts).annihilate; if (why) return { ok: false, msg: why };
  if (opts.load) for (const id in opts.load) if (opts.load[id] > 0) E.act.load(isNaN(+id) ? id : +id, opts.load[id]);
  const out = []; let lastEta = 0;
  for (const id of fids) {
    const f = E.fleetById(id); if (!f) continue;
    if (f.rallyTo != null && E.clearRally) { /* leave a player-issued annihilate clear the rally */ try { f.rallyTo = null; f.rallyFrom = null; } catch (e) {} }
    f.raze = false; f.colonize = false;
    f.order = 'annihilate'; f.target = sys; f.annihDest = sys;
    f.annihHalt50 = !!opts.halt50;
    f.annihPow0 = (E.fleetStats(f).power) || 1;
    f.annihAlerted = false;
    if (f.sys === sys && !f.path.length) { E.annihilateArrive(f); out.push({ fid: f.id, eta: 0 }); continue; }
    const from = f.path.length ? f.sys : f.sys;
    const route = E.annihilateStops(f.owner, f.sys, sys);
    if (!route) continue;
    const first = route.stops.length ? route.stops[0] : sys;
    const idx = route.path.indexOf(first);
    f.path = idx >= 0 ? route.path.slice(0, idx + 1) : route.path.slice();
    f.prog = 0; f.speedMul = opts.speed != null ? E.clamp(opts.speed, 0.25, 1) : 1;
    const eta = E.etaToAnnihilate(f, sys);
    out.push({ fid: f.id, eta }); if (eta > lastEta) lastEta = eta;
  }
  if (!out.length) return { ok: false, msg: 'No route to that system' };
  const nm = p ? p.name : (st.systems[sys] && st.systems[sys].name) || 'target';
  const nStops = (() => { const f = E.fleetById(out[0].fid); const r = f && E.annihilateStops(f.owner, f.sys, sys); return r ? r.stops.length : 0; })();
  E.addLog('💀 Annihilate: ' + out.length + ' fleet' + (out.length > 1 ? 's' : '') + ' → ' + nm + (nStops ? ' · ' + nStops + ' enemy world' + (nStops === 1 ? '' : 's') + ' on the path' : ''), 'warn', sys);
  return { ok: true, n: out.length, eta: lastEta, rows: out };
};
E.annihilateRaze = function (f, p) {
  if (!f || !p || p.owner === 'neutral' || p.owner === f.owner) return false;
  const nm = p.name, prev = p.owner;
  E.razePlanet(p);
  E.addLog('💀 ' + (f.name || 'Fleet') + ' razed ' + nm + ' (' + ((E.FACTIONS[prev] || {}).short || prev) + ')', 'warn', p.sys);
  return true;
};
E.annihilateArrive = function (f) {
  if (!f || f.order !== 'annihilate') return;
  const st = E.state, p = E.sysPlanet(f.sys);
  if (E.battleAt(f.sys)) return; // fight first
  const pow = (E.fleetStats(f).power) || 0;
  const dest = f.annihDest != null ? f.annihDest : f.target;
  if (p && E.hostile(f.owner, p.owner)) {
    // still defenders in orbit? a battle should have started; if only a garrison remains, raze from orbit
    const defs = st.fleets.filter(g => !g.path.length && g.sys === f.sys && g.id !== f.id && g.ships.length && !E.hostile(g.owner, p.owner));
    if (defs.length) return;
    E.annihilateRaze(f, p);
  }
  if (f.annihHalt50 && f.annihPow0 && pow < 0.5 * f.annihPow0) {
    f.order = 'idle'; f.path = []; f.target = f.sys;
    if (!f.annihAlerted) {
      f.annihAlerted = true;
      E.toast('💀 Annihilate halted — fleet below 50% strength at ' + (p ? p.name : 'this system'), 'warn', f.sys);
      E.addLog('💀 Annihilate halted (below 50% strength) at ' + (p ? p.name : 'system ' + f.sys) + '. The fleet is holding.', 'warn', f.sys);
    }
    return;
  }
  if (f.sys === dest || dest == null) { f.order = 'idle'; f.target = f.sys; f.path = []; return; }
  const route = E.annihilateStops(f.owner, f.sys, dest);
  if (!route || !route.path.length) { f.order = 'idle'; return; }
  const first = route.stops.length ? route.stops[0] : dest;
  const idx = route.path.indexOf(first);
  f.path = idx >= 0 ? route.path.slice(0, idx + 1) : route.path.slice();
  f.prog = 0; f.target = dest; f.order = 'annihilate';
};
E.annihilateTick = function () {
  const st = E.state; if (!st) return;
  for (const f of st.fleets) {
    if (f.order !== 'annihilate' || !f.ships.length) continue;
    if (f.path.length) continue;
    E.annihilateArrive(f);
  }
};
E.drawAnnihilatePreview = function (ctx, z, ox, oy, time, ws) {
  const U = E.ui, st = E.state; if (!U || !U.sendSel || U.sendSel.action !== 'annihilate' || !st) return 0;
  const S = U.sendSel, dest = S.s;
  const fs = (S.fids || []).map(E.fleetById).filter(Boolean);
  const f = fs[0]; if (!f) return 0;
  const from = f.path.length ? f.sys : f.sys;
  const route = E.annihilateStops(f.owner, f.sys, dest);
  if (!route || !route.path.length) return 0;
  const nodes = [f.sys].concat(route.path);
  ctx.save();
  ctx.setLineDash([7, 6]); ctx.lineDashOffset = -(time || 0) * 16;
  ctx.strokeStyle = 'rgba(255,80,70,0.95)'; ctx.lineWidth = Math.max(3, 3.2 * (z > 1 ? 1 : 1));
  ctx.beginPath();
  nodes.forEach((s, i) => {
    const sy = st.systems[s]; if (!sy) return;
    const [x, y] = ws ? ws(sy.x, sy.y) : [sy.x * z + ox, sy.y * z + oy];
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
  for (const sys of route.stops) {
    const sy = st.systems[sys]; if (!sy) continue;
    const [x, y] = ws ? ws(sy.x, sy.y) : [sy.x * z + ox, sy.y * z + oy];
    ctx.fillStyle = 'rgba(255,60,60,0.9)';
    ctx.beginPath(); ctx.arc(x, y, Math.max(5, 8 * (z || 1)), 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
  }
  const last = st.systems[dest];
  if (last && route.stops.length) {
    const [x, y] = ws ? ws(last.x, last.y) : [last.x * z + ox, last.y * z + oy];
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('💀 ' + route.stops.length + ' raze' + (route.stops.length === 1 ? '' : 's'), x, y - 18);
  }
  ctx.restore();
  return route.stops.length;
};

// ---------- item 10: stuck rally-fleet alert (60 game seconds) ----------
// Game time, not wall-clock: a paused game will not fire, and 4× speed still alerts after
// one minute of in-game waiting (15s real at 4×, 60s real at 1×).
E.STUCK_RALLY_T = 60;
E.stuckRallyTick = function () {
  const st = E.state; if (!st) return;
  st.stuckAlerts = st.stuckAlerts || [];
  for (const f of st.fleets) {
    if (f.owner !== 'player' || f.rallyTo == null || !f.ships.length) { f._stuckSince = null; continue; }
    const moving = f.path.length > 0 || E.battleAt(f.sys);
    // still gathering (3s since last ship / 12s since first) — not stuck yet
    const t0 = f.rallyT0 != null ? f.rallyT0 : (f.rallyT || st.t);
    const tLast = f.rallyT != null ? f.rallyT : t0;
    const gathering = (st.t - tLast < 3 && st.t - t0 < 12);
    if (moving || gathering) { f._stuckSince = null; continue; }
    if (f._stuckSince == null) f._stuckSince = st.t;
    if (st.t - f._stuckSince >= E.STUCK_RALLY_T && !f._stuckAlerted) {
      f._stuckAlerted = true;
      const p = E.sysPlanet(f.sys), q = st.planets[f.rallyTo];
      const msg = '⚠ Rally fleet ' + (f.name || ('#' + f.id)) + ' has been sitting still at ' + (p ? p.name : 'its system') + ' for over a minute' + (q ? ' (bound for ' + q.name + ')' : '') + '.';
      E.addLog(msg, 'warn', f.sys);
      if (E.toast) E.toast('⚠ Rally fleet stuck — tap to jump', 'warn', f.sys);
      st.stuckAlerts.unshift({ t: st.t, fid: f.id, sys: f.sys, dest: f.rallyTo, name: f.name });
      if (st.stuckAlerts.length > 8) st.stuckAlerts.length = 8;
    }
    if (f.path.length) f._stuckAlerted = false;
  }
};

const stepPrev = E.step;
E.step = function (dt) {
  const r = stepPrev.apply(this, arguments);
  const st = E.state;
  if (st && !st.over) {
    E.annihilateTick();
    E.stuckRallyTick();
    if ((st.tick || 0) % 30 === 0) E.trimBattleLogs(st);
  }
  return r;
};

})();
