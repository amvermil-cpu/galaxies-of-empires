// Galaxies of Empires v2.0 — core (Node-testable) support for the graphics overhaul.
// No gameplay changes: battle recording only READS battle state; settings live in localStorage, not in the save.
'use strict';
(function () {
const E = window.EOG;

// ---------- H: the live battle view no longer animates, so the sim never builds live fx ----------
E.LIVE_FX = false;

// ---------- settings (R, P, AB, Z) ----------
const SKEY = 'goe_settings_v20';
E.SETTINGS_DEFAULT = { quality: 'auto', music: 0.45, sfx: 0.8, haptics: true };
E.QUALITIES = ['low', 'medium', 'high'];
function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(SKEY) || '{}') || {}; } catch (e) { s = {}; }
  const o = Object.assign({}, E.SETTINGS_DEFAULT, s);
  if (o.quality !== 'auto' && !E.QUALITIES.includes(o.quality)) o.quality = 'auto';
  o.music = E.clamp(+o.music || 0, 0, 1); o.sfx = E.clamp(o.sfx == null ? 0.8 : +o.sfx, 0, 1); o.haptics = o.haptics !== false;
  return o;
}
E.settings = loadSettings();
E.reloadSettings = function () { E.settings = loadSettings(); return E.settings; };
E.setSetting = function (k, v) {
  if (!(k in E.SETTINGS_DEFAULT)) return { ok: false, msg: 'Unknown setting' };
  if (k === 'quality' && v !== 'auto' && !E.QUALITIES.includes(v)) return { ok: false, msg: 'Unknown quality' };
  E.settings[k] = v;
  if (k === 'quality') { E.autoQ = null; E.autoDropped = false; }
  try { localStorage.setItem(SKEY, JSON.stringify(E.settings)); } catch (e) { }
  E.emit('settings', { k, v });
  return { ok: true };
};
// effective quality: manual choice wins; 'auto' = High until the FPS monitor drops it to Low
E.autoQ = null; E.autoDropped = false;
E.effQuality = function () { const q = E.settings.quality; return q === 'auto' ? (E.autoQ || 'high') : q; };
E.QUALITY = {
  low: { stars: 1, nebula: 0, drift: false, glow: false, trails: false, terrRim: false, fxCap: 24, dprCap: 1.5, planetScale: 0.6, planetFps: 15, replayFx: 0.35, moons: false },
  medium: { stars: 2, nebula: 2, drift: true, glow: true, trails: true, terrRim: true, fxCap: 60, dprCap: 2, planetScale: 0.85, planetFps: 24, replayFx: 0.7, moons: true },
  high: { stars: 3, nebula: 4, drift: true, glow: true, trails: true, terrRim: true, fxCap: 120, dprCap: 2.5, planetScale: 1, planetFps: 30, replayFx: 1, moons: true },
};
E.Q = function () { return E.QUALITY[E.effQuality()]; };

// ---------- Z: FPS monitor (auto → Low if the device struggles; manual setting overrides) ----------
const FM = E.fpsMon = { frames: [], win: 4, low: 30, slowFor: 0, avg: 60, min: 60, worst: 60, samples: 0 };
FM.reset = function () { FM.frames.length = 0; FM.slowFor = 0; FM.avg = 60; FM.min = 60; FM.worst = 60; FM.samples = 0; };
// feed one frame time (seconds); returns true when it just switched quality to Low
FM.feed = function (dt) {
  if (!(dt > 0) || dt > 1) return false; // ignore tab switches / stalls
  FM.frames.push(dt); let tot = 0; for (const d of FM.frames) tot += d;
  while (tot > FM.win && FM.frames.length > 2) tot -= FM.frames.shift();
  FM.samples++;
  FM.avg = FM.frames.length / Math.max(1e-6, tot);
  FM.min = Math.min(FM.min, 1 / dt);
  if (FM.samples > 30) FM.worst = Math.min(FM.worst, FM.avg);
  if (E.settings.quality !== 'auto' || E.effQuality() === 'low' || tot < FM.win * 0.9) { FM.slowFor = 0; return false; }
  if (FM.avg < FM.low) FM.slowFor += dt; else FM.slowFor = 0;
  if (FM.slowFor >= 2) { E.autoQ = 'low'; E.autoDropped = true; FM.slowFor = 0; E.emit('qualityDrop', { avg: FM.avg }); return true; }
  return false;
};

// ---------- AB: haptic taps ----------
E.HAPTICS = { result: [30, 40, 30], capture: [60, 40, 90], upgrade: [18], click: [8] };
E.hapticLog = [];
E.haptic = function (kind) {
  if (!E.settings.haptics || !E.HAPTICS[kind]) return false;
  if (E.state && E.state._ff) return false;
  E.hapticLog.push(kind); if (E.hapticLog.length > 50) E.hapticLog.shift();
  try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(E.HAPTICS[kind]); } catch (e) { }
  return true;
};
E.on('battleEnd', () => E.haptic('result'));
E.on('windowResult', () => E.haptic('result'));
E.on('built', () => E.haptic('upgrade'));
E.on('ground', r => { if (r && r.captured && (r.owner === 'player' || r.prevOwner === 'player')) E.haptic('capture'); });

// ---------- H/I: battle recording (memory only, never saved) ----------
E.REC_DT = 0.33; E.REC_MAX_UNITS = 240; E.REC_MAX_FRAMES = 900; E.REPLAY_KEEP = 16;
E.replays = new Map();
E.replayBySys = new Map();
function recOf(b) { return b._rec || null; }
function unitHp(u) {
  if (u.kind !== 'ship') return [Math.max(0, u.hp), 0];
  let s = u._f && u._f.id === u.fid && u._s && u._f.ships.includes(u._s) ? u._s : null;
  if (!s) { const f = E.fleetById(u.fid); s = f && f.ships.find(x => x.uid === u.uid); }
  return s ? [Math.max(0, s.hp), Math.max(0, s.sh || 0)] : [0, 0];
}
function recStart(b) {
  if (b._rec) return b._rec;
  const st = E.state, p = E.sysPlanet(b.sys);
  const rec = { id: b.rep || b.id, bid: b.id, sys: b.sys, system: st.systems[b.sys].name, planetSide: !!b.planetSide, ptype: p ? p.type : null, powner: p ? p.owner : null,
    owners: [b.owners[0].slice(), b.owners[1].slice()], units: [], idx: new Map(), frames: [], dt: E.REC_DT, lastT: -1, t0: b.t, partial: b.t > 1, seen: [new Set(), new Set()], done: false, winner: null, rngS: st.rngS };
  Object.defineProperty(b, '_rec', { value: rec, writable: true, configurable: true, enumerable: false });
  recSample(b);
  return rec;
}
function recSample(b, final) {
  const rec = recOf(b); if (!rec) return;
  const p = E.sysPlanet(b.sys);
  for (const i of [0, 1]) for (const o of b.owners[i]) if (!rec.owners[i].includes(o)) rec.owners[i].push(o);
  const out = [];
  for (const u of b.units) {
    if (u.kind !== 'ship' && u.hp <= 0) continue;
    const key = u.side + ':' + u.uid; rec.seen[u.side].add(u.uid);
    let i = rec.idx.get(key);
    const [hp, sh] = unitHp(u);
    if (u.kind === 'ship' && hp <= 0) continue;
    if (i == null) {
      if (rec.units.length >= E.REC_MAX_UNITS) continue;
      i = rec.units.length; rec.idx.set(key, i);
      rec.units.push({ k: u.kind, h: u.h || null, side: u.side, owner: u.owner, bo: !!u.bo, max: hp || 1, shMax: sh || 0, t0: b.t });
    }
    const m = rec.units[i]; if (hp > m.max) m.max = hp; if (sh > m.shMax) m.shMax = sh;
    const ti = u.tgt != null ? rec.idx.get((1 - u.side) + ':' + u.tgt) : undefined;
    out.push(i, Math.round(u.x), Math.round(u.y), hp, sh, ti == null ? -1 : ti);
  }
  rec.frames.push({ t: b.t, d: Float32Array.from(out), shield: p && b.planetSide ? (E.shieldMax(E.state, p) ? p.shieldHp / E.shieldMax(E.state, p) : 0) : 0 });
  rec.lastT = b.t;
  if (rec.frames.length > E.REC_MAX_FRAMES) { rec.frames = rec.frames.filter((f, k) => k % 2 === 0 || k === rec.frames.length - 1); rec.dt *= 2; }
}
function recFinish(b) {
  const rec = recOf(b); if (!rec || rec.done) return;
  recSample(b, true);
  rec.done = true; rec.winner = b.winner; rec.dur = b.t; rec.total = [rec.seen[0].size, rec.seen[1].size];
  rec.alive = [0, 1].map(sd => b.units.filter(u => u.side === sd && (u.kind === 'ship' ? unitHp(u)[0] > 0 : u.hp > 0)).length);
  delete rec.idx; delete rec.seen;
  E.replays.set(rec.id, rec); E.replayBySys.set(rec.sys, rec.id);
  while (E.replays.size > E.REPLAY_KEEP) { const k = E.replays.keys().next().value; E.replays.delete(k); }
}
E.recordBattle = recStart;
E.recSample = recSample;
E.recFinish = recFinish;
E.on('battleStart', b => recStart(b));
E.on('battleEnd', o => { if (o && o.b) recFinish(o.b); });
const step0 = E.step;
E.step = function (dt) {
  step0(dt);
  const st = E.state; if (!st || !st.battles) return;
  for (const b of st.battles) {
    if (b.done || b.rep == null) continue;
    const rec = b._rec || recStart(b);
    if (b.t - rec.lastT >= rec.dt) recSample(b);
  }
};
E.getReplay = function (id) { return E.replays.get(+id) || null; };
E.replayFor = function (repOrSys, bySys) { if (bySys) { const id = E.replayBySys.get(+repOrSys); return id != null ? E.getReplay(id) : null; } return E.getReplay(repOrSys); };

// Deterministic tiny PRNG for replay cosmetics (shot timing jitter) — seeded by the battle id, never touches st.rngS
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
E.mulberry = mulberry;
// Build the playable replay from the recording. Processes `chunk` frames per call of step(); returns a job.
E.replayJob = function (rec, fxScale) {
  fxScale = fxScale == null ? 1 : fxScale;
  const R = mulberry((rec.bid || rec.id) * 9973 + 17);
  const n = rec.units.length, F = rec.frames;
  const big = n > 120 ? 0.45 : n > 60 ? 0.7 : 1; // V: per-shot effects thin out as battles grow
  const out = { id: rec.id, units: rec.units, frames: [], events: [], dur: Math.max(rec.dur || 0, F.length ? F[F.length - 1].t : 0), t0: F.length ? F[0].t : 0, planetSide: rec.planetSide, ptype: rec.ptype, powner: rec.powner,
    owners: rec.owners, winner: rec.winner, system: rec.system, total: rec.total || [0, 0], recorded: [0, 0], alive: rec.alive || [0, 0], scale: big, size: n, partial: rec.partial };
  for (const u of rec.units) out.recorded[u.side]++;
  let k = 0, prev = null;
  const job = { out, done: false, progress: 0 };
  job.step = function (chunk) {
    const end = Math.min(F.length, k + (chunk || 40));
    for (; k < end; k++) {
      const f = F[k], d = f.d, pos = new Float32Array(n * 2), hp = new Float32Array(n).fill(-1), sh = new Float32Array(n), tg = new Int16Array(n).fill(-1);
      for (let j = 0; j < d.length; j += 6) { const i = d[j]; pos[i * 2] = d[j + 1]; pos[i * 2 + 1] = d[j + 2]; const m = rec.units[i]; hp[i] = d[j + 3] / (m.max || 1); sh[i] = m.shMax ? d[j + 4] / m.shMax : 0; tg[i] = d[j + 5]; }
      const fr = { t: f.t, pos, hp, sh, tg, shield: f.shield };
      if (prev) {
        const t0 = prev.t, t1 = f.t, span = Math.max(0.05, t1 - t0);
        for (let i = 0; i < n; i++) {
          if (prev.hp[i] < 0) continue;
          const dead = fr.hp[i] < 0, dHp = dead ? prev.hp[i] : prev.hp[i] - fr.hp[i], dSh = prev.sh[i] - (dead ? 0 : fr.sh[i]);
          if (dHp > 0.001 || dSh > 0.001) {
            // who was shooting at i? every attacker that targeted it in either frame
            let shooters = 0;
            for (let a = 0; a < n; a++) {
              if (prev.hp[a] < 0 || (prev.tg[a] !== i && fr.tg[a] !== i)) continue;
              shooters++;
              const u = rec.units[a], heavy = u.k !== 'ship' || u.h === 'destroyer' || u.h === 'carrier';
              const shots = u.h === 'fighter' ? 2 : u.h === 'carrier' ? 3 : 1;
              for (let s = 0; s < shots; s++) {
                if (R() > fxScale * big && s > 0) continue;
                const kind = u.k === 'laser' ? 'beam' : u.k === 'railgun' ? 'rail' : u.k === 'station' ? 'beam' : u.k === 'turret' ? 'heavy' : (u.h === 'destroyer' || u.h === 'carrier') && R() < 0.6 ? 'missile' : heavy ? 'heavy' : 'laser';
                out.events.push({ t: t0 + R() * span, k: kind, a, b: i, sh: dSh > 0.001 && !dead });
              }
            }
            if (!shooters && !dead) out.events.push({ t: t0 + R() * span, k: 'hit', b: i, sh: dSh > 0.001 });
          }
          if (dead) out.events.push({ t: t0 + span * (0.6 + R() * 0.4), k: 'boom', b: i, x: prev.pos[i * 2], y: prev.pos[i * 2 + 1], r: rec.units[i].k === 'station' ? 60 : rec.units[i].k === 'turret' ? 30 : (E.HULLS[rec.units[i].h] || { size: 10 }).size * 2 });
        }
      }
      out.frames.push(fr); prev = fr;
    }
    job.progress = F.length ? k / F.length : 1;
    if (k >= F.length) { out.events.sort((a, b) => a.t - b.t); job.done = true; out.final = [0, 1].map(sd => { const L = out.frames[out.frames.length - 1]; let c = 0; if (L) for (let i = 0; i < n; i++) if (L.hp[i] >= 0 && rec.units[i].side === sd) c++; return c; }); }
    return job.done;
  };
  return job;
};
E.buildReplaySync = function (id, fxScale) { const rec = E.getReplay(id); if (!rec) return null; const j = E.replayJob(rec, fxScale); while (!j.step(200)); return j.out; };

// ---------- H: result-card data for every battle you fight ----------
E.resultCard = function (id) {
  const r = E.getReport(id); if (!r || r.kind !== 'battle' || !r.sides) return null;
  const ps = r.sides.findIndex(s => s.owners.includes('player'));
  const sum = o => Object.values(o || {}).reduce((a, b) => a + b, 0);
  const sides = r.sides.map((s, i) => { const ships = sum(s.ships), lost = sum(s.lost); return { i, owners: s.owners.slice(), ships, lost, survivors: Math.max(0, ships - lost), turrets: s.turrets, turretsLost: s.turretsLost, stations: s.stations, stationsLost: s.stationsLost, byHull: s.ships, lostByHull: s.lost }; });
  const winner = r.done ? (r.winner < 0 ? 'Stalemate' : E.FACTIONS[r.sides[r.winner].owners[0]].name) : 'In progress';
  return { id: r.id, system: r.system, planet: r.planet, outcome: r.outcome || null, done: !!r.done, you: ps, sides, winner, winnerSide: r.winner, dur: r.dur || 0, replay: !!E.getReplay(r.id) };
};

// ---------- save migration v1.9 → v2.0 (no gameplay data changes) ----------
E.migrate20 = function (st) {
  for (const b of st.battles || []) b.viewing = false;
  return st;
};
})();
