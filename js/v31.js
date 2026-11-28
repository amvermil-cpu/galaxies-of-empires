// Galaxies of Empires v3.1 — pan-res, zoom-gated names, grouped far fleets,
// auto quality hysteresis, battery 30 FPS cap, far-AI throttle, black map backdrop.
//
// Item 7 — Web Worker (honest fallback)
// A full move of E.step / game state onto a Worker is too risky for this cook:
//   • The balance bot and every Node/core test call E.step synchronously and must
//     stay deterministic (same seeds → same W/T/L).
//   • Save/load, orders, and the UI all mutate the same E.state the sim owns.
//   • GitHub Pages does not send COOP/COEP, so SharedArrayBuffer is unavailable.
//   • Cloning a Galactic-size state every tick would cost more than the sim itself.
//   • Pathing, battles, and AI call back into E.* (act.build, pathFor, R(), …) and
//     expect an immediate result; making those APIs async would break tests, the
//     bot, offline single-file dist, and the PWA unless we also shipped a Blob
//     worker — the determinism/API issues would still remain.
// What stayed on the main thread: E.step, economy, fleets, battles, pathing, AI
// decisions, save/load.
// What we did instead so rendering never waits on extra sim work: far-away rival
// AIs decide less often (#6); pan-time backing scale, auto quality, and the
// optional 30 FPS cap (#1, #4, #5) keep the render path independent of hitching.
'use strict';
(function () {
const E = window.EOG;

E.SIM_ON_WORKER = false;
E.SIM_WORKER_MOVED = [];
E.SIM_WORKER_STAYED = ['step', 'economy', 'fleets', 'battles', 'pathing', 'AI', 'save/load'];

E.migrate31 = function (st) {
  if (!st) return st;
  st.ver = '3.1';
  return st;
};

const _newGame31 = E.newGame;
E.newGame = function () {
  const st = _newGame31.apply(this, arguments);
  if (st) E.migrate31(st);
  return st;
};


E.migratePrevSlots = function () {
  const groups = [
    { flag: 'migratedFromV30', keys: ['goe_save_v30', 'goe_save_v30_s2', 'goe_save_v30_s3'] },
    { flag: 'migratedFromV29', keys: ['goe_save_v29', 'goe_save_v29_s2', 'goe_save_v29_s3'] },
    { flag: 'migratedFromV28', keys: ['goe_save_v28', 'goe_save_v28_s2', 'goe_save_v28_s3'] },
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

// ---------- item 2: planet-name fade ----------
E.NAME_FADE_LO = 0.52;
E.NAME_FADE_HI = 0.62;
E.planetNameAlpha = function (z) {
  if (!(z > 0)) z = (E.render && E.render.cam && E.render.cam.z) || 0;
  if (z <= E.NAME_FADE_LO) return 0;
  if (z >= E.NAME_FADE_HI) return 1;
  return (z - E.NAME_FADE_LO) / (E.NAME_FADE_HI - E.NAME_FADE_LO);
};

// ---------- item 3: grouped traveling fleets per lane ----------
E.FLEET_GROUP_Z = 0.55;
E.laneKey31 = function (f) {
  if (!f || !f.path || !f.path.length) return null;
  const a = f.sys, b = f.path[0];
  if (b == null) return null;
  return (a < b ? a + '-' + b : b + '-' + a) + '|' + f.owner;
};
E.groupLaneFleets31 = function (fleets, ws) {
  const Rd = E.render, map = new Map();
  for (const f of fleets || []) {
    if (!f.path || !f.path.length) continue;
    if (E.fleetVisible && !E.fleetVisible(f)) continue;
    const k = E.laneKey31(f); if (!k) continue;
    const pos = Rd && Rd.fleetPos ? Rd.fleetPos(f) : { x: 0, y: 0, ang: 0 };
    const xy = ws ? ws(pos.x, pos.y) : [pos.x, pos.y];
    const n = f.ships ? f.ships.length : 1;
    const g = map.get(k);
    if (g) { g.n += n; g.x += xy[0]; g.y += xy[1]; g.c++; g.ang = pos.ang; g.ids.push(f.id); }
    else map.set(k, { o: f.owner, n, x: xy[0], y: xy[1], c: 1, ang: pos.ang, ids: [f.id] });
  }
  for (const g of map.values()) { g.x /= g.c; g.y /= g.c; }
  return Array.from(map.values());
};
E.drawGroupedLaneFleets31 = function (ctx, z, ox, oy, ws, inView) {
  const Rd = E.render, st = E.state; if (!Rd || !st || !ctx) return 0;
  const gs = E.groupLaneFleets31(st.fleets, ws);
  let n = 0;
  for (const g of gs) {
    if (inView && !inView(g.x, g.y, 40)) continue;
    const col = (E.FACTIONS[g.o] && E.FACTIONS[g.o].color) || '#fff';
    if (Rd.fleetTri) Rd.fleetTri(ctx, g.x, g.y, g.n > 8 ? 8 : 6, g.ang || 0, col);
    ctx.save();
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(String(g.n), g.x + 8, g.y);
    ctx.fillStyle = '#fff'; ctx.fillText(String(g.n), g.x + 8, g.y);
    if (Rd.sel && g.ids.indexOf(Rd.sel.fleet) >= 0) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(g.x, g.y, 12, 0, 7); ctx.stroke();
    }
    ctx.restore();
    n++;
  }
  Rd.stats = Rd.stats || {};
  Rd.stats.laneGroups = n;
  Rd.stats.tris = n;
  return n;
};

// ---------- item 8: solid black map backdrop ----------
E.BG_BLACK = true;

// ---------- item 5: battery pref (persisted in goe_settings_v20) ----------
if (E.SETTINGS_DEFAULT) E.SETTINGS_DEFAULT.battery = false;
if (E.settings && E.settings.battery == null) E.settings.battery = false;

// ---------- item 4: auto quality, hysteresis, no dpr flicker ----------
E.autoFx31 = { cut: false, slowFor: 0, fastFor: 0 };
(function hookQuality() {
  const _set = E.setSetting;
  if (_set) {
    E.setSetting = function (k, v) {
      const r = _set.call(E, k, v);
      if (k === 'quality' && E.autoFx31) { E.autoFx31.cut = false; E.autoFx31.slowFor = 0; E.autoFx31.fastFor = 0; }
      return r;
    };
  }
  const _Q = E.Q;
  if (_Q) {
    E.Q = function () {
      const q = Object.assign({}, _Q.call(E));
      if (E.settings && E.settings.quality === 'auto' && E.autoFx31 && E.autoFx31.cut) {
        q.glow = false; q.trails = false; q.nebula = 0;
        q.stars = Math.min(q.stars || 1, 1);
        q.fxCap = Math.min(q.fxCap || 24, 24);
        q.replayFx = Math.min(q.replayFx == null ? 1 : q.replayFx, 0.35);
        q.moons = false; q.terrRim = false; q.drift = false;
      }
      return q;
    };
  }
  const FM = E.fpsMon;
  if (!FM || !FM.feed) return;
  FM.low = 40;
  FM.restoreAt = 48;
  const _feed = FM.feed.bind(FM);
  FM.feed = function (dt) {
    if (!(dt > 0) || dt > 1) return false;
    FM.frames.push(dt); let tot = 0; for (const d of FM.frames) tot += d;
    while (tot > FM.win && FM.frames.length > 2) tot -= FM.frames.shift();
    FM.samples++;
    FM.avg = FM.frames.length / Math.max(1e-6, tot);
    FM.min = Math.min(FM.min, 1 / dt);
    if (FM.samples > 30) FM.worst = Math.min(FM.worst, FM.avg);
    const fx = E.autoFx31;
    if (!E.settings || E.settings.quality !== 'auto' || tot < FM.win * 0.9) {
      FM.slowFor = 0; if (fx) { fx.slowFor = 0; fx.fastFor = 0; }
      return false;
    }
    if (!fx.cut) {
      fx.fastFor = 0;
      if (FM.avg < 40) fx.slowFor += dt; else fx.slowFor = 0;
      if (fx.slowFor >= 2) {
        fx.cut = true; fx.slowFor = 0;
        E.emit('qualityFx', { cut: true, avg: FM.avg });
        return true;
      }
    } else {
      fx.slowFor = 0;
      if (FM.avg > 48) fx.fastFor += dt; else fx.fastFor = 0;
      if (fx.fastFor >= 2.5) {
        fx.cut = false; fx.fastFor = 0;
        E.emit('qualityFx', { cut: false, avg: FM.avg });
        return true;
      }
    }
    return false;
  };
  // keep _feed referenced so a later debug patch can restore it
  FM._feed20 = _feed;
})();

// ---------- item 6: far rival AIs decide less often (camera only; bot/_ff unchanged) ----------
E.AI_FAR_MUL = 3;
E.AI_FAR_VIEW_PAD = 400;
E.AI_FAR_TERRITORY = 800;
E.rivalIsFar31 = function (f) {
  const st = E.state, Rd = E.render;
  if (!st || st._ff) return false;
  if (!Rd || !Rd.cam || !(Rd.cam.z > 0)) return false;
  const cam = Rd.cam, pad = E.AI_FAR_VIEW_PAD;
  const w = (typeof window !== 'undefined' && window.innerWidth) || 800;
  const h = (typeof window !== 'undefined' && window.innerHeight) || 600;
  const z = cam.z;
  const x0 = cam.x - (w / 2) / z - pad, x1 = cam.x + (w / 2) / z + pad;
  const y0 = cam.y - (h / 2) / z - pad, y1 = cam.y + (h / 2) / z + pad;
  const mine = [];
  for (const p of st.planets) if (p.owner === 'player' || (E.isAlly && E.isAlly(p.owner))) mine.push(p);
  const theirs = [];
  for (const p of st.planets) if (p.owner === f) theirs.push(p);
  if (!theirs.length) return true;
  for (const p of theirs) {
    const s = st.systems[p.sys]; if (!s) continue;
    if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) return false;
    for (const m of mine) {
      const sm = st.systems[m.sys]; if (!sm) continue;
      if (E.dist(s, sm) < E.AI_FAR_TERRITORY) return false;
    }
  }
  return true;
};
(function hookAi() {
  const P = E._simParts;
  if (!P || !P.aiTick) return;
  const _ai = P.aiTick;
  P.aiTick = function (dt) {
    const st = E.state;
    if (!st || st._ff || !E.render || !E.render.cam || !(E.render.cam.z > 0)) return _ai.call(this, dt);
    const fac = E.rivals().concat(E.allies(), ['crisis']);
    const before = {};
    for (const f of fac) {
      const em = st.emp[f];
      if (!em || !em.ai) continue;
      if (E.rivalIsFar31(f)) before[f] = em.ai.next;
    }
    const r = _ai.call(this, dt);
    for (const f of fac) {
      if (before[f] == null) continue;
      const em = st.emp[f]; if (!em || !em.ai) continue;
      // They just took a decision (timer rolled over to a fresh 6–10s). Stretch it.
      if (before[f] - dt <= 0 && em.ai.next > 0) em.ai.next *= E.AI_FAR_MUL;
    }
    return r;
  };
  E._aiTick31 = true;
})();

// ---------- item 1: lower backing scale while panning ----------
E.PAN_RES_SCALE = 0.7;
E.PAN_RES_HOLD = 180;
E.applyPanRes31 = function (ctx) {
  if (typeof document === 'undefined') return;
  const Rd = E.render; if (!Rd) return;
  const map = ctx && ctx.canvas; if (!map) return;
  const gest = !!(Rd.panning || (Rd.gestureT && (typeof performance !== 'undefined' ? performance.now() : Date.now()) - Rd.gestureT < E.PAN_RES_HOLD));
  const want = gest ? E.PAN_RES_SCALE : 1;
  const cap = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, (E.Q && E.Q().dprCap) || 2);
  const dpr = cap * want;
  const W = Math.max(1, Math.floor(((typeof window !== 'undefined' && window.innerWidth) || map.clientWidth || 1) * dpr));
  const H = Math.max(1, Math.floor(((typeof window !== 'undefined' && window.innerHeight) || map.clientHeight || 1) * dpr));
  if (Rd._panScale31 === want && map.width === W && map.height === H && Rd.dpr === dpr) return;
  Rd.dpr = dpr;
  if (map.width !== W || map.height !== H) {
    map.width = W; map.height = H;
    if (typeof window !== 'undefined') {
      map.style.width = window.innerWidth + 'px';
      map.style.height = window.innerHeight + 'px';
    }
    if (Rd._pan) Rd._pan.valid = false;
    if (Rd._laneC) Rd._laneC.key = '';
  }
  Rd._panScale31 = want;
  Rd._panLo = gest;
};

E.installV31Gfx = function () {
  const Rd = E.render; if (!Rd || Rd._v31gfx) return; Rd._v31gfx = true;

  const _db = Rd.drawBackdrop;
  Rd.drawBackdrop = function (ctx, w, h, cam, time) {
    if (E._titleBg && _db) return _db.call(Rd, ctx, w, h, cam, time);
    if (!ctx) return;
    ctx.fillStyle = '#000000';
    ctx.fillRect(-4, -4, (w || 0) + 8, (h || 0) + 8);
  };
  Rd.drawBackdropLite = function (ctx, w, h) {
    if (!ctx) return;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
  };
  Rd.SIMPLE_PLAIN_BG = true;

  if (Rd.drawTitle) {
    const _title = Rd.drawTitle.bind(Rd);
    Rd.drawTitle = function (ctx, w, h, time) {
      E._titleBg = true;
      try { return _title(ctx, w, h, time); } finally { E._titleBg = false; }
    };
  }

  if (Rd.drawMap) {
    const _dm = Rd.drawMap.bind(Rd);
    Rd.drawMap = function (ctx, W, H, time) {
      E.applyPanRes31(ctx);
      const cv = ctx && ctx.canvas;
      return _dm(ctx, cv ? cv.width : W, cv ? cv.height : H, time);
    };
  }

  if (Rd.drawMapMoving) {
    const _mv = Rd.drawMapMoving.bind(Rd);
    Rd.drawMapMoving = function (ctx, w, h, z, ox, oy, time, ws, inView, lod) {
      if (z < E.FLEET_GROUP_Z) {
        if (E.drawAnnihilatePreview) E.drawAnnihilatePreview(ctx, z, ox, oy, time, ws);
        if (Rd.drawTrails) Rd.drawTrails(ctx, ws, inView, lod);
        E.drawGroupedLaneFleets31(ctx, z, ox, oy, ws, inView);
        if (Rd.drawMapFx) Rd.drawMapFx(ctx, ws, inView, z);
        return;
      }
      return _mv(ctx, w, h, z, ox, oy, time, ws, inView, lod);
    };
  }

  if (Rd.drawSimple) {
    const _ds = Rd.drawSimple.bind(Rd);
    Rd.drawSimple = function (ctx, w, h, z, ox, oy, time, gesture) {
      const st = E.state;
      const saved = st && st.fleets;
      try {
        if (st && saved) st.fleets = saved.filter(f => !f.path.length);
        _ds(ctx, w, h, z, ox, oy, time, gesture);
      } finally {
        if (st && saved) st.fleets = saved;
      }
      if (st) {
        const ws = (x, y) => [x * z + ox, y * z + oy];
        const inV = (x, y, m) => x > -(m || 40) && y > -(m || 40) && x < w + (m || 40) && y < h + (m || 40);
        E.drawGroupedLaneFleets31(ctx, z, ox, oy, ws, inV);
      }
    };
  }

  if (Rd.settingsHTML) {
    const _sh = Rd.settingsHTML.bind(Rd);
    Rd.settingsHTML = function () {
      let html = _sh();
      const on = !!(E.settings && E.settings.battery);
      const row = '<div class="srow"><span>Battery mode</span><div class="seg"><button class="b mini2 ' + (on ? 'on' : '') + '" data-a="toggleBattery">' + (on ? 'On · 30 FPS cap' : 'Off') + '</button></div></div>'
        + '<div class="small muted">Caps the display at 30 FPS to save power. Off by default.</div>';
      html = html.replace('<div class="srow"><span>📷 Photo mode</span>', row + '<div class="srow"><span>📷 Photo mode</span>');
      html = html.replace(/Auto drops to Low by itself if the frame rate stays under \d+ FPS/,
        'Auto eases glows and particles if the frame rate stays under 40 FPS, and restores them once it holds above 48');
      return html;
    };
  }
};

E.installV31UI = function () { try { E.installV31Gfx(); } catch (e) { console.warn('installV31Gfx', e); } };
E.installV31UIBind = function (U) {
  try { E.installV31Gfx(); } catch (e) {}
  if (!U || !U.ACT) return;
  U.ACT.toggleBattery = function () {
    E.setSetting('battery', !E.settings.battery);
    if (U.render) U.render(false);
  };
};

if (typeof document !== 'undefined') {
  const boot = function () { try { E.installV31Gfx(); } catch (e) {} };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}

})();
