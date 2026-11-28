// Galaxies of Empires — canvas rendering (galaxy map + battle view), procedural vector art
'use strict';
(function () {
const E = window.EOG;
const Rd = E.render = {};
let bgCache = null, bgKey = '';
Rd.cam = { x: 800, y: 525, z: 0.6 };
Rd.bcam = { x: 600, y: 350, z: 0.6 };
Rd.sel = { sys: null, fleet: null };
Rd.targetMode = null; // {fid, order}
Rd.dpr = 1;

function makeBg(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, w, h); grd.addColorStop(0, '#050816'); grd.addColorStop(1, '#0b0620');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  let seed = 7; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const neb = ['rgba(90,40,160,0.10)', 'rgba(20,120,170,0.09)', 'rgba(170,40,90,0.07)', 'rgba(40,160,120,0.06)'];
  for (let i = 0; i < 9; i++) {
    const x = r() * w, y = r() * h, rad = (0.2 + r() * 0.35) * Math.max(w, h);
    const ng = g.createRadialGradient(x, y, 0, x, y, rad); ng.addColorStop(0, neb[i % 4]); ng.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = ng; g.fillRect(0, 0, w, h);
  }
  for (let i = 0; i < (w * h) / 900; i++) { const a = r(); g.fillStyle = 'rgba(255,255,255,' + (0.15 + a * 0.7) + ')'; const s = a > 0.97 ? 1.6 : a > 0.85 ? 1.1 : 0.7; g.fillRect(r() * w, r() * h, s, s); }
  return c;
}

Rd.worldToScreen = function (x, y, cam, W, H) { cam = cam || Rd.cam; return [(x - cam.x) * cam.z + W / 2, (y - cam.y) * cam.z + H / 2]; };
Rd.screenToWorld = function (sx, sy, cam, W, H) { cam = cam || Rd.cam; return [(sx - W / 2) / cam.z + cam.x, (sy - H / 2) / cam.z + cam.y]; };

Rd.fleetPos = function (f) {
  const S = E.state.systems, a = S[f.sys];
  if (!f.path.length) return { x: a.x, y: a.y };
  const b = S[f.path[0]];
  return { x: E.lerp(a.x, b.x, f.prog), y: E.lerp(a.y, b.y, f.prog), ang: Math.atan2(b.y - a.y, b.x - a.x) };
};


// v2.4 item 2: zoomed-in pan cache is larger than the viewport (margin on each side) and is slid /
// incrementally re-rendered before the camera reaches the edge. The v2.3 screen-sized blit left the
// newly revealed leading edge blank or smeared (stale pixels, or a scaled leftover) until a full redraw.
// The simplified/blurred map is still zoom-only (z < Rd.LOD2_Z) — never mid-pan when zoomed in.
// No CSS/filter blur is applied to the map canvas during a drag.
// v2.5: a modest margin (15%) keeps the leading edge pre-rendered without a 2× bitmap to slide every few
// frames (v2.4's 50% cache was a 4×-pixel copy and was the hitch under 4× throttle). Newly exposed bands
// are filled immediately at 1:1 so the edge never blanks or smears. Slides blit onto a scratch canvas and
// swap (no copy → clear → copy-back). Tile experiments were slower than this path (Huge pan_close 18 fps)
// so the sliding cache is what ships. No pan-triggered simplification.
Rd.PAN_M = 0.15;
Rd.PAN_REBUILD = 0.05;
Rd._pan = { c: null, tmp: null, valid: false, z: 0, cx: 0, cy: 0, vw: 0, vh: 0, cw: 0, ch: 0 };
Rd._panScratch = function (W, H) {
  const P = Rd._pan;
  if (!P.tmp || P.tmp.width !== W || P.tmp.height !== H) { P.tmp = document.createElement('canvas'); P.tmp.width = W; P.tmp.height = H; }
  return P.tmp;
};
Rd._ensurePanCanvas = function (cw, ch) {
  const sc = Rd.dpr || 1, P = Rd._pan;
  const W = Math.round(cw * sc), H = Math.round(ch * sc);
  if (!P.c || P.c.width !== W || P.c.height !== H) { P.c = document.createElement('canvas'); P.c.width = W; P.c.height = H; }
  return P.c;
};
Rd._fillPanDirty = function (dirty, cw, ch, cam, time) {
  const sc = Rd.dpr || 1, g = Rd._pan.c.getContext('2d');
  g.setTransform(sc, 0, 0, sc, 0, 0);
  g.save();
  g.beginPath();
  for (const r of dirty) g.rect(r[0], r[1], r[2], r[3]);
  g.clip();
  Rd._cull = dirty;
  try { Rd.drawMapStatic(g, cw, ch, { x: cam.x, y: cam.y, z: cam.z }, time); }
  finally { Rd._cull = null; }
  g.restore();
};
// Seed the oversized cache from a just-drawn screen frame (center) and paint only the margin bands
// (tight-culled). Avoids a 4×-area first-frame hitch while still covering the leading edge.
Rd.seedPanCacheFromView = function (viewCtx, w, h, cam, time) {
  const m = Rd.PAN_M, sc = Rd.dpr || 1, P = Rd._pan;
  const cw = Math.ceil(w * (1 + 2 * m)), ch = Math.ceil(h * (1 + 2 * m));
  Rd._ensurePanCanvas(cw, ch);
  const g = P.c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, P.c.width, P.c.height);
  g.drawImage(viewCtx.canvas, Math.round(m * w * sc), Math.round(m * h * sc));
  P.z = cam.z; P.cx = cam.x; P.cy = cam.y; P.vw = w; P.vh = h; P.cw = cw; P.ch = ch; P.valid = true;
  const mh = m * h, mw = m * w;
  const dirty = [
    [0, 0, cw, mh],
    [0, mh + h, cw, mh],
    [0, mh, mw, h],
    [mw + w, mh, mw, h]
  ];
  Rd._fillPanDirty(dirty, cw, ch, cam, time);
  return true;
};
Rd.rebuildPanCache = function (w, h, cam, time) {
  const m = Rd.PAN_M, P = Rd._pan;
  const cw = Math.ceil(w * (1 + 2 * m)), ch = Math.ceil(h * (1 + 2 * m));
  Rd._ensurePanCanvas(cw, ch);
  const sc = Rd.dpr || 1, g = P.c.getContext('2d');
  g.setTransform(sc, 0, 0, sc, 0, 0);
  Rd._cull = null;
  Rd.drawMapStatic(g, cw, ch, { x: cam.x, y: cam.y, z: cam.z }, time);
  P.z = cam.z; P.cx = cam.x; P.cy = cam.y; P.vw = w; P.vh = h; P.cw = cw; P.ch = ch; P.valid = true;
  return true;
};
Rd.slidePanCache = function (w, h, cam, time) {
  const P = Rd._pan, sc = Rd.dpr || 1;
  if (!P.valid || !P.c) return Rd.rebuildPanCache(w, h, cam, time);
  const dxCss = (P.cx - cam.x) * cam.z, dyCss = (P.cy - cam.y) * cam.z;
  const dx = Math.round(dxCss * sc), dy = Math.round(dyCss * sc);
  // Almost no overlap left — cheaper and cleaner to rebuild the whole oversized cache.
  if (Math.abs(dx) > P.c.width * 0.7 || Math.abs(dy) > P.c.height * 0.7) return Rd.rebuildPanCache(w, h, cam, time);
  if (dx === 0 && dy === 0) { P.cx = cam.x; P.cy = cam.y; return true; }
  // v2.5: slide by blitting onto a second buffer and swapping, instead of copy → clear → copy-back.
  const nxt = Rd._panScratch(P.c.width, P.c.height);
  const ng = nxt.getContext('2d');
  ng.setTransform(1, 0, 0, 1, 0, 0);
  ng.imageSmoothingEnabled = false;
  ng.fillStyle = '#050816';
  ng.fillRect(0, 0, nxt.width, nxt.height);
  ng.drawImage(P.c, dx, dy);
  const prev = P.c; P.c = nxt; P.tmp = prev;
  // Re-center the cache on the current camera; fill only the newly exposed bands.
  P.cx = cam.x; P.cy = cam.y;
  const cw = P.cw, ch = P.ch;
  const dirty = [];
  if (dx > 0) dirty.push([0, 0, dx / sc, ch]);
  if (dx < 0) dirty.push([cw + dx / sc, 0, -dx / sc, ch]);
  if (dy > 0) dirty.push([0, 0, cw, dy / sc]);
  if (dy < 0) dirty.push([0, ch + dy / sc, cw, -dy / sc]);
  Rd._fillPanDirty(dirty, cw, ch, { x: P.cx, y: P.cy, z: P.z }, time);
  return true;
};
Rd.refreshPanCache = function (w, h, cam, time) {
  const P = Rd._pan, m = Rd.PAN_M;
  if (!P.valid || !P.c || P.z !== cam.z || P.vw !== w || P.vh !== h) return Rd.rebuildPanCache(w, h, cam, time);
  const sx = -m * w + (P.cx - cam.x) * cam.z;
  const sy = -m * h + (P.cy - cam.y) * cam.z;
  const left = -sx, right = sx + P.cw - w, top = -sy, bottom = sy + P.ch - h;
  const thresh = Rd.PAN_REBUILD * Math.min(w, h);
  if (left >= thresh && right >= thresh && top >= thresh && bottom >= thresh) return true;
  return Rd.slidePanCache(w, h, cam, time);
};
Rd.blitPanCache = function (ctx, w, h, cam) {
  const P = Rd._pan, m = Rd.PAN_M;
  if (!P.valid || !P.c || P.z !== cam.z || P.vw !== w || P.vh !== h) return false;
  const sx = -m * w + (P.cx - cam.x) * cam.z;
  const sy = -m * h + (P.cy - cam.y) * cam.z;
  // The oversized cache must fully cover the viewport — never blit a short image that leaves a blank edge.
  if (sx > 0.5 || sy > 0.5 || sx + P.cw < w - 0.5 || sy + P.ch < h - 0.5) return false;
  const sc = Rd.dpr || 1;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#050816';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(P.c, Math.round(sx * sc), Math.round(sy * sc));
  ctx.restore();
  ctx.setTransform(Rd.dpr, 0, 0, Rd.dpr, 0, 0);
  return true;
};

Rd.drawMap = function (ctx, W, H, time) {
  const st = E.state; if (!st) return;
  const cam = Rd.cam;
  const key = W + 'x' + H;
  ctx.setTransform(Rd.dpr, 0, 0, Rd.dpr, 0, 0);
  const w = W / Rd.dpr, h = H / Rd.dpr;
  const z = cam.z, ox = w / 2 - cam.x * z, oy = h / 2 - cam.y * z;
  // v2.3/v2.4: the simplified / blurred universe is zoom-only. One fixed threshold (Rd.LOD2_Z ≈ 0.40) is the
  // zoom where a typical starting cluster fills a phone-width screen; below that (zoomed out) the simple map is
  // used whether you are panning or not. Zoomed-in panning keeps full detail — never drop to the blur mid-gesture.
  if (Rd.panning && performance.now() - (Rd.gestureT || 0) > 4000) Rd.panning = false;
  const gest = !!(Rd.panning || (Rd.gestureT && performance.now() - Rd.gestureT < 200));
  if (!gest) Rd._pan.valid = false;
  if (!Rd.NO_SIMPLE && z < Rd.LOD2_Z) { Rd.trackMap(st, time); Rd.drawSimple(ctx, w, h, z, ox, oy, time, false); return; }
  if (gest && !Rd.NO_PANCACHE) {
    const P = Rd._pan;
    const ready = P.valid && P.z === cam.z && P.vw === w && P.vh === h && P.c;
    if (ready) {
      Rd.refreshPanCache(w, h, cam, time);
      if (Rd.blitPanCache(ctx, w, h, cam)) {
        Rd.trackMap(st, time);
        const ws = (x, y) => [x * z + ox, y * z + oy];
        const lod = z < 0.5 ? 1 : 0;
        const inView = (x, y, m) => { const M = 90; return x > -(m || M) && y > -(m || M) && x < w + (m || M) && y < h + (m || M); };
        Rd.stats = Object.assign(Rd.stats || {}, { simple: false, panCache: true, lod, gesture: true, panW: Rd._pan.cw, panH: Rd._pan.ch });
        Rd.drawMapMoving(ctx, w, h, z, ox, oy, time, ws, inView, lod);
        return;
      }
    }
    // First pan frame (or a total miss): draw the screen at 1:1, then seed an oversized cache
    // from that frame plus tight-culled margin bands so the next pan frames stay crisp.
    Rd.trackMap(st, time);
    Rd.drawMapStatic(ctx, w, h, cam, time);
    Rd.seedPanCacheFromView(ctx, w, h, cam, time);
    {
      const ws = (x, y) => [x * z + ox, y * z + oy];
      const lod = z < 0.5 ? 1 : 0;
      const inView = (x, y, m) => { const M = 90; return x > -(m || M) && y > -(m || M) && x < w + (m || M) && y < h + (m || M); };
      Rd.stats = Object.assign(Rd.stats || {}, { simple: false, panCache: true, lod, gesture: true, panW: Rd._pan.cw, panH: Rd._pan.ch, panSeed: true });
      Rd.drawMapMoving(ctx, w, h, z, ox, oy, time, ws, inView, lod);
    }
    return;
  }
  Rd.trackMap(st, time); // v2.0 J/K: trails, warp flashes, capture detection
  Rd.drawMapStatic(ctx, w, h, cam, time);
  {
    const ws = (x, y) => [x * z + ox, y * z + oy];
    const lod = z < Rd.LOD2_Z ? 2 : z < 0.5 ? 1 : 0;
    const M = 90;
    const inView = (x, y, m) => x > -(m || M) && y > -(m || M) && x < w + (m || M) && y < h + (m || M);
    Rd.drawMapMoving(ctx, w, h, z, ox, oy, time, ws, inView, lod);
  }
  return;
};

Rd.drawMapStatic = function (ctx, w, h, cam, time) {
  Rd.drawBase(ctx, w, h, cam, time); // v2.0 E/F: layered parallax starfield + drifting nebulas + territory (cached when the camera is still)
  Rd.drawMapStaticContent(ctx, w, h, cam, time);
};
Rd.drawMapStaticContent = function (ctx, w, h, cam, time) {
  const st = E.state; if (!st) return;
  const z = cam.z, ox = w / 2 - cam.x * z, oy = h / 2 - cam.y * z;
  const ws = (x, y) => [x * z + ox, y * z + oy];
  // level of detail: 0 full, 1 mid, 2 far (dots). Huge maps live at LOD 1-2 until you zoom in.
  const lod = z < Rd.LOD2_Z ? 2 : z < 0.5 ? 1 : 0;
  const M = 90; // cull margin (px)
  const C = Rd._cull;
  const inDirty = (x, y, pad) => {
    if (!C) return true;
    for (let i = 0; i < C.length; i++) { const r = C[i]; if (x >= r[0] - pad && y >= r[1] - pad && x <= r[0] + r[2] + pad && y <= r[1] + r[3] + pad) return true; }
    return false;
  };
  const inView = (x, y, m) => { const pad = m || M; return x > -pad && y > -pad && x < w + pad && y < h + pad && inDirty(x, y, pad); };
  Rd.stats = { drawn: 0, total: st.systems.length, lod, glows: 0, front: 0 };
  // bucket docked fleets by system once per frame
  const dock = {};
  for (const f of st.fleets) if (!f.path.length && f.ships.length && E.fleetVisible(f)) (dock[f.sys] = dock[f.sys] || []).push(f); // v1.7: fog of war on enemy ships
  const idleX = new Set(E.idleBuildPlanets().map(q => q.sys)); // v1.7: planets with every building slot idle
  const winSys = new Set(st.windows.filter(x => !x.closed).map(x => x.sys));
  // v2.0 F: soft territory regions with rim borders (cached; rebuilt only when ownership changes)
  // (territory is drawn by Rd.drawBase above)
  // v2.1 item 11: far zoom = one cached bitmap for lanes, dots, rings and capitals; only live overlays are drawn per frame
  const fitC = lod === 2 && !Rd.NO_FITCACHE && Rd.drawFitLayer ? Rd.drawFitLayer(ctx, w, h, z, ox, oy, time) : false;
  Rd.stats.fitCache = fitC;
  if (!fitC) {
  if (Rd.drawLanes29 && Rd.drawLanes29(ctx, w, h, z, ox, oy, lod)) { /* baked lanes */ } else {
  // lanes (batched, culled)
  ctx.lineWidth = Math.max(1, 1.6 * z);
  ctx.strokeStyle = 'rgba(140,170,220,' + (lod === 2 ? 0.22 : 0.28) + ')'; ctx.beginPath();
  let riftLanes = [];
  for (const [a, b] of st.lanes) {
    const A = st.systems[a], B = st.systems[b];
    const x1 = A.x * z + ox, y1 = A.y * z + oy, x2 = B.x * z + ox, y2 = B.y * z + oy;
    if ((x1 < 0 && x2 < 0) || (y1 < 0 && y2 < 0) || (x1 > w && x2 > w) || (y1 > h && y2 > h)) continue;
    if (A.rift || B.rift) { riftLanes.push(x1, y1, x2, y2); continue; }
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  }
  if (E.Q().glow && lod < 2) { ctx.save(); ctx.strokeStyle = 'rgba(90,150,255,0.10)'; ctx.lineWidth = Math.max(4, 7 * z); ctx.stroke(); ctx.strokeStyle = 'rgba(120,180,255,0.16)'; ctx.lineWidth = Math.max(2, 3.2 * z); ctx.stroke(); ctx.restore(); } // v2.0 F: glowing lanes
  ctx.stroke();
  if (riftLanes.length) { ctx.strokeStyle = 'rgba(125,255,107,0.35)'; ctx.beginPath(); for (let i = 0; i < riftLanes.length; i += 4) { ctx.moveTo(riftLanes[i], riftLanes[i + 1]); ctx.lineTo(riftLanes[i + 2], riftLanes[i + 3]); } ctx.stroke(); }
  }
  }
  // trade routes
  for (const r of st.routes) {
    const path = r.path || []; if (path.length < 2) continue;
    ctx.save(); ctx.setLineDash([6 * z + 2, 6 * z + 2]); ctx.lineDashOffset = -time * 20;
    ctx.strokeStyle = r.blocked != null ? 'rgba(255,90,90,0.9)' : r.ship ? 'rgba(157,255,138,0.85)' : 'rgba(157,255,138,0.3)';
    ctx.lineWidth = Math.max(1.5, 3 * z);
    ctx.beginPath(); path.forEach((s, i) => { const [x, y] = ws(st.systems[s].x, st.systems[s].y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); ctx.restore();
    if (r.ship) { const pos = alongPath(path, r.prog); const [x, y] = ws(pos.x, pos.y); ctx.fillStyle = r.blocked != null ? '#ff5a5a' : '#9dff8a'; ctx.beginPath(); ctx.arc(x, y, Math.max(3, 5 * z), 0, 7); ctx.fill(); }
  }
  // threat lines for hostile fleets heading to player systems
  const incSet = new Map(); for (const a of E.incoming()) incSet.set(a.fid, a);
  for (const f of st.fleets) {
    if (!f.path.length || f.owner === 'player' || !E.fleetVisible(f)) continue;
    const a = incSet.get(f.id); if (!a || a.kind !== 'attack') continue;
    const pos = Rd.fleetPos(f); const [x, y] = ws(pos.x, pos.y);
    ctx.save(); ctx.setLineDash([4, 6]); ctx.strokeStyle = hexA(E.FACTIONS[f.owner].color, 0.7); ctx.lineWidth = 1.8; ctx.lineDashOffset = -time * 14;
    ctx.beginPath(); ctx.moveTo(x, y); for (const s of f.path) { const [a2, b2] = ws(st.systems[s].x, st.systems[s].y); ctx.lineTo(a2, b2); } ctx.stroke(); ctx.restore();
  }
  // player fleet paths
  for (const f of st.fleets) {
    if (!f.path.length || f.owner !== 'player') continue;
    const pos = Rd.fleetPos(f); const [x, y] = ws(pos.x, pos.y);
    ctx.save(); ctx.setLineDash([3, 5]); ctx.strokeStyle = f.order === 'deliver' ? 'rgba(255,224,102,0.8)' : 'rgba(56,225,255,0.55)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y); for (const s of f.path) { const [a, b] = ws(st.systems[s].x, st.systems[s].y); ctx.lineTo(a, b); } ctx.stroke(); ctx.restore();
  }
  // systems
  const labelSize = lod === 0 ? 13 : 12;
  const homeId = st.emp.player.home;
  for (const s of st.systems) {
    const [x, y] = ws(s.x, s.y);
    if (!inView(x, y)) continue;
    Rd.stats.drawn++;
    if (s.rift) { Rd.drawRiftX(ctx, x, y, Math.max(z, 0.35), time); label(ctx, x, y + 46 * Math.max(z, 0.35) + 12, s.name, '#7dff6b', labelSize); continue; }
    const p = st.planets[s.planetId], T = E.PLANET_TYPES[p.type], fc = E.FACTIONS[p.owner].color;
    const here = dock[s.id] || [];
    const hot = winSys.has(s.id) || E.battleAt(s.id);
    // v1.3: soft glow around every controlled planet in its empire's colour
    if (p.owner !== 'neutral' && !fitC) {
      const gr = (lod === 2 ? Math.max(3, 9 * z + 1.5) * 3.2 : Math.max(7, 15 * z) * 3.1) * (1 + 0.04 * Math.sin(time * 1.6 + p.id));
      ctx.drawImage(Rd.glowSprite(fc, p.owner === 'player' ? 0.55 : 0.5), x - gr, y - gr, gr * 2, gr * 2); Rd.stats.glows++; // v2.0 W: cached glow sprite
    }
    // v1.5: Perfect planets wear a gold ring; chokepoints of the starting pockets a faint marker
    if (p.perfect && !fitC) { const pr2 = (lod === 2 ? Math.max(3, 9 * z + 1.5) : Math.max(7, 15 * z)) + 6; ctx.strokeStyle = 'rgba(255,216,77,0.85)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y, pr2, 0, 7); ctx.stroke(); }
    // v1.3: enemy front-line worlds (attackable now) get a pulsing dashed ring
    const front = !fitC && p.owner !== 'player' && p.owner !== 'neutral' && E.isFrontLine('player', s.id);
    if (front) {
      const fr = (lod === 2 ? Math.max(3, 9 * z + 1.5) : Math.max(7, 15 * z)) + 12;
      ctx.save(); ctx.setLineDash([6, 5]); ctx.lineDashOffset = -time * 10; ctx.strokeStyle = 'rgba(255,140,70,' + (0.65 + 0.3 * Math.sin(time * 3)) + ')'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(x, y, fr, 0, 7); ctx.stroke(); ctx.restore(); Rd.stats.front++;
    }
    if (lod === 2) {
      // far: flat dots, ring for owner, only key labels
      const rr = Math.max(3, 9 * z + 1.5);
      if (!fitC) {
        ctx.fillStyle = p.owner === 'neutral' ? '#6f7a8c' : fc; ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill();
        if (p.owner === 'player') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, rr + 2, 0, 7); ctx.stroke(); }
        if (s.id === homeId) { ctx.fillStyle = '#ffe066'; star5(ctx, x + rr + 4, y - rr - 4, 5); }
      }
      if (idleX.has(s.id)) redX(ctx, x - rr - 5, y - rr - 3, 3.5);
      if (hot) { ctx.strokeStyle = 'rgba(255,80,80,' + (0.5 + 0.5 * Math.sin(time * 8)) + ')'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, rr + 7, 0, 7); ctx.stroke(); }
      if (Rd.sel.sys === s.id || Rd.highlightSys === s.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, rr + 9, 0, 7); ctx.stroke(); }
      if (Rd.targetMode) { ctx.strokeStyle = 'rgba(255,224,102,' + (0.4 + 0.3 * Math.sin(time * 5)) + ')'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, rr + 6, 0, 7); ctx.stroke(); }
      if (here.length) { const o = here[0].owner; ctx.fillStyle = E.FACTIONS[o].color; tri(ctx, x + rr + 5, y + rr + 2, 4, 0); }
      continue;
    }
    const pr = Math.max(7, 15 * z);
    if (lod === 0) {
      // v2.6 item 4: zoomed-in planets are a simple disc of the planet's colour (no rotating rings/moons/orbiters).
      const sx = x - pr * 1.6, sy = y - pr * 1.2, sr = Math.max(2.5, s.star.size * z * 0.8);
      if (Rd.starGlowSpr) ctx.drawImage(Rd.starGlowSpr(s.star.color), sx - sr * 4, sy - sr * 4, sr * 8, sr * 8);
      else {
        const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 4); sg.addColorStop(0, s.star.color); sg.addColorStop(0.25, hexA(s.star.color, 0.5)); sg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sg; ctx.fillRect(sx - sr * 4, sy - sr * 4, sr * 8, sr * 8);
      }
      if (Rd.colorDisc) { const dr = pr * 32 / 28; ctx.drawImage(Rd.colorDisc(T.color), x - dr, y - dr, dr * 2, dr * 2); }
      else { ctx.fillStyle = T.color; ctx.beginPath(); ctx.arc(x, y, pr, 0, 7); ctx.fill(); }
      Rd.mapDetail(ctx, x, y, pr, p, here, time, z); // docked-fleet triangles only (no moons/rings)
    } else { ctx.fillStyle = T.color; ctx.beginPath(); ctx.arc(x, y, pr, 0, 7); ctx.fill(); }
    ctx.strokeStyle = fc; ctx.lineWidth = p.owner === 'neutral' ? 1.5 : 3;
    ctx.beginPath(); ctx.arc(x, y, pr + 4, 0, 7); ctx.stroke();
    if (p.owner !== 'neutral' && st.emp[p.owner] && st.emp[p.owner].home === p.id) { const bh = Math.max(14, 22 * Math.min(z, 1.2)); ctx.drawImage(Rd.banner(p.owner), x - pr - bh * 0.9, y - pr - bh * 1.1, bh * 0.75, bh); } // v2.0 O: empire banner on capitals
    if (p.shieldHp > 0) { ctx.strokeStyle = 'rgba(127,216,255,' + (0.25 + 0.35 * p.shieldHp / Math.max(1, E.shieldMax(st, p))) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, pr + 9, 0, 7); ctx.stroke(); }
    if (homeId === p.id && p.owner === 'player') { ctx.fillStyle = '#ffe066'; star5(ctx, x + pr + 4, y - pr - 4, 6); }
    if (hot) { const a = 0.5 + 0.5 * Math.sin(time * 8); ctx.strokeStyle = 'rgba(255,80,80,' + a + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, pr + 16, 0, 7); ctx.stroke(); ctx.font = 'bold 16px system-ui'; ctx.fillStyle = '#ff6060'; ctx.textAlign = 'center'; ctx.fillText('⚔', x + pr + 14, y + pr + 10); }
    else if (p.blockade) { ctx.font = 'bold 13px system-ui'; ctx.fillStyle = '#ffb040'; ctx.textAlign = 'center'; ctx.fillText('⛓', x - pr - 10, y + pr + 8); }
    if (winSys.has(s.id)) { const wn = st.windows.find(q => q.sys === s.id && !q.closed); if (wn) { ctx.font = 'bold 12px system-ui'; ctx.fillStyle = '#ffb040'; ctx.textAlign = 'center'; ctx.fillText(E.fmtTime(Math.max(0, wn.end - st.t)), x, y - pr - 24); } }
    if (Rd.sel.sys === s.id) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.arc(x, y, pr + 22, time * 0.8, time * 0.8 + 6.283); ctx.stroke(); ctx.setLineDash([]); }
    if (Rd.targetMode) { ctx.strokeStyle = 'rgba(255,224,102,' + (0.4 + 0.3 * Math.sin(time * 5)) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, pr + 18, 0, 7); ctx.stroke(); }
    if (Rd.highlightSys === s.id) { ctx.strokeStyle = 'rgba(255,224,102,' + (0.6 + 0.4 * Math.sin(time * 6)) + ')'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, pr + 26, 0, 7); ctx.stroke(); }
    if (lod === 0 || p.owner !== 'neutral' || Rd.sel.sys === s.id) {
      const lbl = s.name + (p.perfect ? ' ✦' : '') + (p.spec ? ' ' + E.SPECS[p.spec].icon : '');
      label(ctx, x, y + pr + 18, lbl, p.owner === 'neutral' ? '#c9d1dc' : fc, labelSize);
    }
    if (idleX.has(s.id)) redX(ctx, x - pr - 10, y - pr - 4, 5.5);
    if (p.owner !== 'neutral' && p.owner !== 'player' && !E.isAlly(p.owner) && (lod === 0 || Rd.sel.sys === s.id)) { // v1.7: enemy worlds show the latest scout snapshot only (never live numbers)
      const sn = E.planetSnapshot(p);
      if (sn) {
        const rg = r => r[0] === r[1] ? E.fmtN(r[0]) : E.fmtN(r[0]) + '–' + E.fmtN(r[1]);
        label(ctx, x, y + pr + 33, '📡 ' + rg(sn.ships) + ' ships · ' + rg(sn.troops) + ' troops · ' + E.fmtTime(sn.age) + ' old', 'rgba(255,196,110,0.95)', 10.5);
      }
    }
    const owners = [...new Set(here.map(f => f.owner))];
    owners.forEach((o, i) => {
      const n = here.filter(f => f.owner === o).reduce((a, f) => a + f.ships.length, 0);
      const ax = x + pr + 14, ay = y - pr + i * 18 - 2;
      ctx.fillStyle = E.FACTIONS[o].color; tri(ctx, ax, ay, 6, 0);
      ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.fillText(n, ax + 8, ay + 4);
    });
  }
};
Rd.drawMapMoving = function (ctx, w, h, z, ox, oy, time, ws, inView, lod) {
  if (E.drawAnnihilatePreview) E.drawAnnihilatePreview(ctx, z, ox, oy, time, ws);
  const st = E.state;
  // moving fleets
  // v2.2 item 8: traveling fleets are a plain triangle only (no numbers, no icons, no alert ring)
  Rd.drawTrails(ctx, ws, inView, lod);
  for (const f of st.fleets) {
    if (!f.path.length || !E.fleetVisible(f)) continue;
    const pos = Rd.fleetPos(f); const [x, y] = ws(pos.x, pos.y);
    if (!inView(x, y, 40)) continue;
    const sz = E.fleetTriPx ? E.fleetTriPx(f) : 7;
    Rd.fleetTri(ctx, x, y, sz, pos.ang, E.FACTIONS[f.owner].color); Rd.stats.tris = (Rd.stats.tris || 0) + 1;
    Rd.stats.triKind = Rd.stats.triKind || { small: 0, medium: 0, large: 0 }; if (E.fleetTriKind) Rd.stats.triKind[E.fleetTriKind(f)]++;
    if (Rd.sel.fleet === f.id) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, sz + 6, 0, 7); ctx.stroke(); }
  }
  Rd.drawMapFx(ctx, ws, inView, z);
};

// v2.3 item 2: the simplified map (zoomed out past LOD2_Z only — not while panning in). Everything is drawn straight to the canvas in a handful of
// batched paths: backdrop (one blit), one translucent union-of-discs path per empire, one dot path per colour, and up to
// SIMPLE_MAX_MARKERS fleet triangles (fleets of the same empire within one screen cell share one marker).
Rd.LOD2_Z = 0.40; // v2.3: cluster-fill threshold (was 0.26); simple map is zoom-only Rd.SIMPLE_CELL = 56; Rd.SIMPLE_MAX_MARKERS = 60;
Rd.drawSimple = function (ctx, w, h, z, ox, oy, time, gesture) {
  const st = E.state;
  if (Rd.drawBackdropLite) Rd.drawBackdropLite(ctx, w, h, Rd.cam, time); else { ctx.fillStyle = '#060a1a'; ctx.fillRect(0, 0, w, h); }
  const M = 60, R0 = 118 * z, rr = Math.min(9, Math.max(2.5, 9 * z + 1.5));
  const inV = (x, y, m) => x > -m && y > -m && x < w + m && y < h + m;
  const byO = {}, byC = {}; let drawn = 0;
  for (const s of st.systems) {
    const x = s.x * z + ox, y = s.y * z + oy; if (!inV(x, y, Math.max(M, R0))) continue;
    if (s.rift) { (byC['#7dff6b'] = byC['#7dff6b'] || []).push(x, y); continue; }
    const p = st.planets[s.planetId], o = p.owner;
    if (o !== 'neutral') (byO[o] = byO[o] || []).push(x, y);
    if (!inV(x, y, M)) continue; drawn++;
    const c = o === 'neutral' ? '#6f7a8c' : E.FACTIONS[o].color; (byC[c] = byC[c] || []).push(x, y);
  }
  // territory blobs (nonzero fill of one path = union, so overlaps don't darken)
  ctx.globalAlpha = 0.24;
  for (const o in byO) { const a = byO[o]; ctx.fillStyle = E.FACTIONS[o].color; ctx.beginPath(); for (let i = 0; i < a.length; i += 2) { ctx.moveTo(a[i] + R0, a[i + 1]); ctx.arc(a[i], a[i + 1], R0, 0, 6.2832); } ctx.fill(); }
  ctx.globalAlpha = 1;
  for (const c in byC) { const a = byC[c]; ctx.fillStyle = c; ctx.beginPath(); for (let i = 0; i < a.length; i += 2) { ctx.moveTo(a[i] + rr, a[i + 1]); ctx.arc(a[i], a[i + 1], rr, 0, 6.2832); } ctx.fill(); }
  // aggregated fleet markers
  const cell = Rd.SIMPLE_CELL, mk = new Map();
  for (const f of st.fleets) {
    if (!f.ships.length || !E.fleetVisible(f)) continue;
    const pos = Rd.fleetPos(f); let x = pos.x * z + ox, y = pos.y * z + oy; if (!f.path.length) { x += rr + 5; y += rr + 2; }
    if (!inV(x, y, 20)) continue;
    const k = f.owner + '|' + Math.floor(x / cell) + '|' + Math.floor(y / cell); const m = mk.get(k);
    if (m) { m.n++; m.x += x; m.y += y; if (f.path.length) m.mv = pos.ang; } else mk.set(k, { o: f.owner, n: 1, x, y, mv: f.path.length ? pos.ang : null });
  }
  let nm = 0;
  for (const m of mk.values()) { if (nm >= Rd.SIMPLE_MAX_MARKERS) break; Rd.fleetTri(ctx, m.x / m.n, m.y / m.n, m.n > 1 ? 6.5 : 5, m.mv || 0, E.FACTIONS[m.o].color); nm++; }
  // a few cheap cues stay when the map is merely zoomed out (not while dragging)
  if (!gesture) {
    const homeP = st.planets[st.emp.player.home];
    if (homeP && homeP.owner === 'player') { const hs = st.systems[homeP.sys], x = hs.x * z + ox, y = hs.y * z + oy; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, rr + 2, 0, 6.2832); ctx.stroke(); ctx.fillStyle = '#ffe066'; star5(ctx, x + rr + 4, y - rr - 4, 5); }
    for (const b of st.battles) { const s = st.systems[b.sys]; if (!s) continue; const x = s.x * z + ox, y = s.y * z + oy; if (!inV(x, y, 20)) continue; ctx.strokeStyle = 'rgba(255,80,80,' + (0.5 + 0.5 * Math.sin(time * 8)) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, rr + 6, 0, 6.2832); ctx.stroke(); }
    if (Rd.sel.sys != null && st.systems[Rd.sel.sys]) { const s = st.systems[Rd.sel.sys], x = s.x * z + ox, y = s.y * z + oy; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, rr + 8, 0, 6.2832); ctx.stroke(); }
    if (Rd.highlightSys != null && st.systems[Rd.highlightSys]) { const s = st.systems[Rd.highlightSys], x = s.x * z + ox, y = s.y * z + oy; ctx.strokeStyle = 'rgba(255,224,102,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, rr + 11, 0, 6.2832); ctx.stroke(); }
  }
  Rd.stats = { drawn, total: st.systems.length, lod: z < Rd.LOD2_Z ? 2 : z < 0.5 ? 1 : 0, glows: 0, front: 0, simple: true, gesture, markers: nm, blobs: Object.keys(byO).length, fitCache: false, tris: nm };
};
function alongPath(path, t) {
  const S = E.state.systems; let L = 0; const segs = [];
  for (let i = 0; i < path.length - 1; i++) { const d = E.dist(S[path[i]], S[path[i + 1]]); segs.push(d); L += d; }
  let k = t * L;
  for (let i = 0; i < segs.length; i++) { if (k <= segs[i]) { const a = S[path[i]], b = S[path[i + 1]], u = k / segs[i]; return { x: E.lerp(a.x, b.x, u), y: E.lerp(a.y, b.y, u) }; } k -= segs[i]; }
  return S[path[path.length - 1]];
}
// v1.7: red X = a player planet with nothing under construction
function redX(ctx, cx, cy, k) {
  ctx.save(); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx - k, cy - k); ctx.lineTo(cx + k, cy + k); ctx.moveTo(cx + k, cy - k); ctx.lineTo(cx - k, cy + k);
  ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = k * 1.0 + 1.5; ctx.stroke(); ctx.strokeStyle = '#ff3b3b'; ctx.lineWidth = k * 0.55 + 0.8; ctx.stroke(); ctx.restore();
}
function label(ctx, x, y, text, color, size) {
  const a31 = (size >= 12 && E.planetNameAlpha) ? E.planetNameAlpha(Rd.cam && Rd.cam.z) : 1;
  if (a31 <= 0) return;
  if (a31 < 1) { ctx.save(); ctx.globalAlpha *= a31; }
  if (Rd.drawLabel30 && Rd.drawLabel30(ctx, x, y, text, color, size)) { if (a31 < 1) ctx.restore(); return; }
  ctx.font = '600 ' + size + 'px system-ui, -apple-system, sans-serif'; ctx.textAlign = 'center';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
  if (a31 < 1) ctx.restore();
}
// v2.1 item 5: map fleet icon — a plain faction-coloured triangle with a thin dark rim so it reads on any backdrop
Rd.fleetTri = function (ctx, x, y, s, a, col) { ctx.fillStyle = col; tri(ctx, x, y, s, a); ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1; ctx.stroke(); };
function tri(ctx, x, y, s, a) {
  a = a || 0; ctx.beginPath();
  ctx.moveTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
  ctx.lineTo(x + Math.cos(a + 2.5) * s * 0.8, y + Math.sin(a + 2.5) * s * 0.8);
  ctx.lineTo(x + Math.cos(a - 2.5) * s * 0.8, y + Math.sin(a - 2.5) * s * 0.8);
  ctx.closePath(); ctx.fill();
}
function star5(ctx, x, y, r) { ctx.beginPath(); for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r, a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); }
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }
Rd.hexA = hexA;
function drawPlanet(ctx, x, y, r, T, seed) {
  const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.15, T.color); g.addColorStop(1, shade(T.color, -0.65));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  // bands / spots
  ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.clip();
  ctx.globalAlpha = 0.25; ctx.fillStyle = shade(T.color, -0.4);
  for (let i = 0; i < 3; i++) { const yy = y - r + ((seed * 37 + i * 53) % 100) / 100 * 2 * r; ctx.fillRect(x - r, yy, 2 * r, r * 0.18); }
  ctx.restore(); ctx.globalAlpha = 1;
  ctx.strokeStyle = hexA(T.glow, 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r + 1, 0, 7); ctx.stroke();
}
Rd.drawPlanet = drawPlanet;
// v1.4: species look for your worlds — Humans: orbital ring + city lights; Aliens: glowing spore hives and a living tendril
function speciesMark(ctx, x, y, r, t, seed) {
  const sp = E.state && E.speciesLook(); Rd.stats.species = (Rd.stats.species || 0) + 1;
  ctx.save();
  if (sp === 'alien') {
    ctx.strokeStyle = 'rgba(196,107,255,0.75)'; ctx.lineWidth = Math.max(1.2, r * 0.12);
    ctx.beginPath(); for (let i = 0; i <= 24; i++) { const a = i / 24 * 6.283 + t * 0.2; const rr = r * (1.28 + 0.1 * Math.sin(a * 3 + t)); i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.stroke();
    for (let i = 0; i < 5; i++) { const a = seed * 1.7 + i * 1.26, d = r * (0.25 + ((seed * 13 + i * 29) % 50) / 80); ctx.fillStyle = 'rgba(182,255,158,' + (0.55 + 0.45 * Math.sin(t * 2.5 + i)) + ')'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(1.2, r * 0.11), 0, 7); ctx.fill(); }
  } else {
    ctx.strokeStyle = 'rgba(207,230,255,0.8)'; ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.55, r * 0.42, -0.35, 0, 7); ctx.stroke();
    for (let i = 0; i < 4; i++) { const a = seed + i * 1.57 + t * 0.3; ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 1.55 * Math.cos(-0.35) - Math.sin(a) * r * 0.42 * Math.sin(-0.35), y + Math.cos(a) * r * 1.55 * Math.sin(-0.35) + Math.sin(a) * r * 0.42 * Math.cos(-0.35), Math.max(1, r * 0.08), 0, 7); ctx.fill(); }
    for (let i = 0; i < 3; i++) { const a = seed * 2.3 + i * 2.1, d = r * 0.5; ctx.fillStyle = 'rgba(255,233,168,0.85)'; ctx.fillRect(x + Math.cos(a) * d - 1, y + Math.sin(a) * d - 1, 2, 2); }
  }
  ctx.restore();
}
Rd.speciesMark = speciesMark;
function shade(hex, f) { const n = parseInt(hex.slice(1), 16); let r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255; const t = f < 0 ? 0 : 255, p = Math.abs(f); r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b); return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1); }
function drawRift(ctx, x, y, z, t) {
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = 'rgba(125,255,107,' + (0.5 - i * 0.1) + ')'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x, y, (30 + i * 8) * z + 8, (14 + i * 4) * z + 4, t * (0.3 + i * 0.1) + i, 0, 7); ctx.stroke();
  }
  const g = ctx.createRadialGradient(x, y, 0, x, y, 30 * z + 8); g.addColorStop(0, 'rgba(10,30,10,1)'); g.addColorStop(0.6, 'rgba(60,200,60,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 30 * z + 8, 0, 7); ctx.fill();
}

// --- ship art ---
Rd.drawHull = function (ctx, h, x, y, ang, color, owner, scale) {
  const H = E.HULLS[h]; const s = H.size * (scale || 1);
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang || 0);
  ctx.fillStyle = color; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
  ctx.beginPath();
  const alien = owner === 'player' && E.state && E.speciesLook() === 'alien';
  if (alien && h === 'fighter') { ctx.moveTo(s, 0); ctx.quadraticCurveTo(0, s * 0.95, -s * 0.8, s * 0.55); ctx.quadraticCurveTo(-s * 0.3, 0, -s * 0.8, -s * 0.55); ctx.quadraticCurveTo(0, -s * 0.95, s, 0); }
  else if (alien && h === 'destroyer') { ctx.moveTo(s, 0); ctx.bezierCurveTo(s * 0.5, s * 0.55, -s * 0.2, s * 0.25, -s * 0.5, s * 0.7); ctx.quadraticCurveTo(-s * 0.75, s * 0.3, -s, s * 0.35); ctx.quadraticCurveTo(-s * 0.7, 0, -s, -s * 0.35); ctx.quadraticCurveTo(-s * 0.75, -s * 0.3, -s * 0.5, -s * 0.7); ctx.bezierCurveTo(-s * 0.2, -s * 0.25, s * 0.5, -s * 0.55, s, 0); }
  else if (alien && (h === 'transport' || h === 'trader')) { ctx.ellipse(0, 0, s, s * 0.5, 0, 0, 7); ctx.moveTo(-s * 0.2, s * 0.5); ctx.quadraticCurveTo(-s * 0.6, s * 0.9, -s, s * 0.6); }
  else if (owner === 'crisis') {
    // organic
    for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283, rr = s * (i % 2 ? 0.6 : 1) * (i === 0 ? 1.3 : 1); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.7); }
  } else if (h === 'fighter') { ctx.moveTo(s, 0); ctx.lineTo(-s * 0.7, s * 0.7); ctx.lineTo(-s * 0.3, 0); ctx.lineTo(-s * 0.7, -s * 0.7); }
  else if (h === 'frigate_unused') { ctx.moveTo(s, 0); ctx.lineTo(s * 0.2, s * 0.35); ctx.lineTo(-s * 0.4, s * 0.7); ctx.lineTo(-s, s * 0.3); ctx.lineTo(-s, -s * 0.3); ctx.lineTo(-s * 0.4, -s * 0.7); ctx.lineTo(s * 0.2, -s * 0.35); }
  else if (h === 'cruiser_unused') { ctx.moveTo(s, 0); ctx.lineTo(s * 0.6, s * 0.3); ctx.lineTo(-s * 0.1, s * 0.35); ctx.lineTo(-s * 0.3, s * 0.7); ctx.lineTo(-s, s * 0.7); ctx.lineTo(-s * 0.85, s * 0.2); ctx.lineTo(-s, 0); ctx.lineTo(-s * 0.85, -s * 0.2); ctx.lineTo(-s, -s * 0.7); ctx.lineTo(-s * 0.3, -s * 0.7); ctx.lineTo(-s * 0.1, -s * 0.35); ctx.lineTo(s * 0.6, -s * 0.3); }
  else if (h === 'destroyer') { ctx.moveTo(s, 0); ctx.lineTo(s * 0.7, s * 0.25); ctx.lineTo(s * 0.1, s * 0.3); ctx.lineTo(-s * 0.1, s * 0.6); ctx.lineTo(-s * 0.9, s * 0.65); ctx.lineTo(-s, s * 0.3); ctx.lineTo(-s * 0.8, 0); ctx.lineTo(-s, -s * 0.3); ctx.lineTo(-s * 0.9, -s * 0.65); ctx.lineTo(-s * 0.1, -s * 0.6); ctx.lineTo(s * 0.1, -s * 0.3); ctx.lineTo(s * 0.7, -s * 0.25); }
  else if (h === 'trader') { ctx.moveTo(s, 0); ctx.quadraticCurveTo(s * 0.6, s * 0.5, -s * 0.2, s * 0.5); ctx.lineTo(-s * 0.9, s * 0.35); ctx.lineTo(-s * 0.9, -s * 0.35); ctx.lineTo(-s * 0.2, -s * 0.5); ctx.quadraticCurveTo(s * 0.6, -s * 0.5, s, 0); ctx.moveTo(-s * 0.1, s * 0.5); ctx.arc(-s * 0.35, s * 0.62, s * 0.22, 0, 7); ctx.moveTo(-s * 0.1, -s * 0.5); ctx.arc(-s * 0.35, -s * 0.62, s * 0.22, 0, 7); }
  // v1.8 original hulls: Warship Carrier (broad armoured deck, flanking hangar pods) and Freighter (cockpit + twin cargo pods)
  else if (h === 'carrier') { ctx.moveTo(s, 0); ctx.lineTo(s * 0.75, s * 0.22); ctx.lineTo(s * 0.2, s * 0.3); ctx.lineTo(s * 0.05, s * 0.55); ctx.lineTo(-s * 0.75, s * 0.55); ctx.lineTo(-s, s * 0.3); ctx.lineTo(-s, -s * 0.3); ctx.lineTo(-s * 0.75, -s * 0.55); ctx.lineTo(s * 0.05, -s * 0.55); ctx.lineTo(s * 0.2, -s * 0.3); ctx.lineTo(s * 0.75, -s * 0.22); }
  else if (h === 'freighter') { ctx.moveTo(s, 0); ctx.lineTo(s * 0.55, s * 0.3); ctx.lineTo(-s * 0.95, s * 0.3); ctx.lineTo(-s * 0.95, -s * 0.3); ctx.lineTo(s * 0.55, -s * 0.3); ctx.closePath(); ctx.rect(-s * 0.75, s * 0.3, s * 0.95, s * 0.24); ctx.rect(-s * 0.75, -s * 0.54, s * 0.95, s * 0.24); }
  else if (h === 'transport') { ctx.rect(-s * 0.9, -s * 0.45, s * 1.6, s * 0.9); ctx.moveTo(s * 0.7, -s * 0.3); ctx.lineTo(s, 0); ctx.lineTo(s * 0.7, s * 0.3); }
  else { ctx.ellipse(0, 0, s, s * 0.45, 0, 0, 7); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  if (h === 'carrier' && owner !== 'crisis') { // flight deck stripe, bridge tower, hangar lights
    ctx.fillStyle = 'rgba(10,20,40,0.55)'; ctx.fillRect(-s * 0.7, -s * 0.07, s * 1.3, s * 0.14);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; for (let i = 0; i < 5; i++) ctx.fillRect(-s * 0.6 + i * s * 0.26, -s * 0.015, s * 0.12, Math.max(0.6, s * 0.03));
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(-s * 0.35, -s * 0.5, s * 0.22, s * 0.16);
    ctx.fillStyle = '#ffd36b'; ctx.fillRect(-s * 0.55, s * 0.4, s * 0.08, s * 0.08); ctx.fillRect(-s * 0.15, s * 0.4, s * 0.08, s * 0.08);
  } else if (h === 'freighter' && owner !== 'crisis') { // container seams
    ctx.strokeStyle = 'rgba(10,20,40,0.6)'; ctx.beginPath(); for (let i = 1; i < 3; i++) { const x = -s * 0.75 + i * s * 0.32; ctx.moveTo(x, s * 0.3); ctx.lineTo(x, s * 0.54); ctx.moveTo(x, -s * 0.3); ctx.lineTo(x, -s * 0.54); } ctx.stroke();
    ctx.fillStyle = 'rgba(160,240,255,0.9)'; ctx.fillRect(s * 0.45, -s * 0.1, s * 0.22, s * 0.2);
  }
  if (alien) { ctx.fillStyle = 'rgba(182,255,158,0.8)'; ctx.beginPath(); ctx.arc(s * 0.25, 0, Math.max(1, s * 0.12), 0, 7); ctx.fill(); }
  // engine glow
  ctx.fillStyle = owner === 'crisis' ? '#d6ff9a' : alien ? '#d59bff' : '#9fe8ff';
  ctx.globalAlpha = 0.8; ctx.beginPath(); if (h === 'carrier') { ctx.arc(-s * 0.98, s * 0.2, Math.max(1.5, s * 0.1), 0, 7); ctx.arc(-s * 0.98, -s * 0.2, Math.max(1.5, s * 0.1), 0, 7); } else ctx.arc(-s * 0.95, 0, Math.max(1.5, s * 0.15), 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  ctx.restore();
};

// v1.9 item 17: battles above E.BATTLE_ANIM_MAX units show a light summary card instead of the live animation
Rd.drawBattleSummary = function (ctx, W, H, b, time) {
  ctx.setTransform(Rd.dpr, 0, 0, Rd.dpr, 0, 0);
  const w = W / Rd.dpr, h = H / Rd.dpr;
  if (bgKey !== W + 'x' + H) { bgCache = makeBg(Math.ceil(w) + 200, Math.ceil(h) + 200); bgKey = W + 'x' + H; }
  ctx.drawImage(bgCache, -100, -100);
  const p0 = E.sidePower(b, 0), p1 = E.sidePower(b, 1), tot = Math.max(1, p0 + p1);
  const c0 = E.FACTIONS[b.owners[0][0]].color, c1 = E.FACTIONS[b.owners[1][0]].color;
  const n = [0, 0]; for (const u of b.units) n[u.side]++;
  const cx = w / 2, cy = h * 0.45, bw = Math.min(320, w - 40);
  ctx.textAlign = 'center'; ctx.fillStyle = '#e8f3ff'; ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillText('⚔ Large battle at ' + E.state.systems[b.sys].name, cx, cy - 70);
  ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = '#9fb3cc';
  ctx.fillText(E.fmtN(b.units.length) + ' units on the field (over ' + E.BATTLE_ANIM_MAX + ')', cx, cy - 44);
  ctx.fillText('Live view skipped to keep the game smooth.', cx, cy - 28);
  ctx.fillText('The fight resolves normally; report at the end.', cx, cy - 12);
  const by0 = cy + 4; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(cx - bw / 2, by0, bw, 14);
  ctx.fillStyle = c0; ctx.fillRect(cx - bw / 2, by0, bw * p0 / tot, 14);
  ctx.fillStyle = c1; ctx.fillRect(cx - bw / 2 + bw * p0 / tot, by0, bw * p1 / tot, 14);
  ctx.font = 'bold 13px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = c0;
  ctx.fillText(b.owners[0].map(o => E.FACTIONS[o].short).join('+') + ' · ' + E.fmtN(n[0]) + ' units', cx - bw / 2, cy + 36);
  ctx.textAlign = 'right'; ctx.fillStyle = c1; ctx.fillText(E.fmtN(n[1]) + ' units · ' + b.owners[1].map(o => E.FACTIONS[o].short).join('+'), cx + bw / 2, cy + 36);
  const pulse = 0.5 + 0.5 * Math.sin(time * 4); ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,211,90,' + (0.4 + 0.6 * pulse) + ')'; ctx.fillText(b.done ? 'Battle over' : 'Resolving…', cx, cy + 62);
  ctx.textAlign = 'left';
};
Rd.drawBattle = function (ctx, W, H, b, time) {
  const st = E.state, cam = Rd.bcam, BS = E.BATTLE_SIZE;
  ctx.setTransform(Rd.dpr, 0, 0, Rd.dpr, 0, 0);
  const w = W / Rd.dpr, h = H / Rd.dpr;
  if (bgKey !== W + 'x' + H) { bgCache = makeBg(Math.ceil(w) + 200, Math.ceil(h) + 200); bgKey = W + 'x' + H; }
  ctx.drawImage(bgCache, -100, -100);
  ctx.save();
  ctx.translate(w / 2, h / 2); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
  // arena boundary
  ctx.strokeStyle = 'rgba(120,150,200,0.12)'; ctx.lineWidth = 2 / cam.z; ctx.strokeRect(0, 0, BS.w, BS.h);
  const p = E.sysPlanet(b.sys);
  if (b.planetSide && p) {
    drawPlanet(ctx, BS.px + 40, BS.py, 120, E.PLANET_TYPES[p.type], p.id);
    const sm = E.shieldMax(st, p);
    if (p.shieldHp > 0 && sm > 0) {
      const a = 0.12 + 0.35 * p.shieldHp / sm;
      const g = ctx.createRadialGradient(BS.px + 40, BS.py, 120, BS.px + 40, BS.py, 175);
      g.addColorStop(0, 'rgba(127,216,255,0)'); g.addColorStop(0.85, 'rgba(127,216,255,' + a + ')'); g.addColorStop(1, 'rgba(127,216,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(BS.px + 40, BS.py, 175, 0, 7); ctx.fill();
    }
  } else {
    const s = st.systems[b.sys];
    const g = ctx.createRadialGradient(BS.w / 2, -200, 0, BS.w / 2, -200, 500); g.addColorStop(0, s.star.color); g.addColorStop(0.2, hexA(s.star.color, 0.3)); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, -200, BS.w, 700);
  }
  for (const u of b.units) {
    const v = E.unitVals(b, u); if (!v) continue;
    const col = E.FACTIONS[u.owner].color;
    if (u.kind === 'turret') {
      ctx.fillStyle = '#334'; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(u.x, u.y, 11, 0, 7); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.lineTo(u.x - 18, u.y); ctx.stroke();
    } else if (u.kind === 'station') {
      ctx.save(); ctx.translate(u.x, u.y); ctx.rotate(time * 0.3); ctx.fillStyle = '#223'; ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; ctx.lineTo(Math.cos(a) * 26, Math.sin(a) * 26); } ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fillStyle = col; ctx.fill(); ctx.restore();
    } else if (u.kind === 'laser') {
      ctx.fillStyle = '#1a3320'; ctx.strokeStyle = '#7dff6b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(u.x, u.y, 10, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#b8ff9a'; ctx.beginPath(); ctx.arc(u.x, u.y, 3.5, 0, 7); ctx.fill();
    } else if (u.kind === 'railgun') {
      ctx.fillStyle = '#2a2a22'; ctx.strokeStyle = '#ffe9a0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.rect(u.x - 16, u.y - 8, 32, 16); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff5c8'; ctx.fillRect(u.x - 18, u.y - 3, 28, 6);
    } else {
      const ang = u.ang != null ? u.ang : (u.side === 1 ? 0 : Math.PI);
      Rd.drawHull(ctx, u.h, u.x, u.y, ang, col, u.owner, 1.9);
      if (u.bo) { const sz = E.HULLS[u.h].size; ctx.fillStyle = '#ffd35a'; ctx.strokeStyle = '#3a2a08'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(u.x + sz * 1.6, u.y - sz * 1.6, 3.2, 0, 7); ctx.fill(); ctx.stroke(); }
      if (v.sh > 0 && v.shmax > 0) { ctx.strokeStyle = 'rgba(127,216,255,' + (0.15 + 0.4 * v.sh / v.shmax) + ')'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(u.x, u.y, E.HULLS[u.h].size * 2 + 3, 0, 7); ctx.stroke(); }
      if (Rd.bsel && Rd.bsel.has(u.uid)) { ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 2; ctx.strokeRect(u.x - E.HULLS[u.h].size * 2.2, u.y - E.HULLS[u.h].size * 2.2, E.HULLS[u.h].size * 4.4, E.HULLS[u.h].size * 4.4); }
    }
    // hp bar
    const frac = Math.max(0, v.hp / v.max);
    const bw = u.kind === 'station' ? 50 : (u.kind === 'turret' || u.kind === 'laser' || u.kind === 'railgun') ? 24 : Math.max(18, (E.HULLS[u.h] || { size: 8 }).size * 3);
    const by = u.y - (u.kind === 'station' ? 36 : (u.kind === 'turret' || u.kind === 'laser' || u.kind === 'railgun') ? 17 : (E.HULLS[u.h] || { size: 8 }).size * 2 + 8);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(u.x - bw / 2, by, bw, 3.5);
    ctx.fillStyle = frac > 0.6 ? '#6be08a' : frac > 0.3 ? '#ffd166' : '#ff5a5a'; ctx.fillRect(u.x - bw / 2, by, bw * frac, 3.5);
  }
  for (const fx of b.fx) {
    if (fx.k === 'bolt') { ctx.strokeStyle = fx.c; ctx.globalAlpha = Math.min(1, fx.life * 6); ctx.lineWidth = fx.big ? 3 : 1.5; ctx.beginPath(); ctx.moveTo(fx.x1, fx.y1); ctx.lineTo(fx.x2, fx.y2); ctx.stroke(); ctx.globalAlpha = 1; }
    else if (fx.k === 'beam') { ctx.strokeStyle = fx.c || '#7dff6b'; ctx.globalAlpha = Math.min(1, 0.45 + (fx.ramp || 1) * 0.15); ctx.lineWidth = 2 + (fx.ramp || 1); ctx.beginPath(); ctx.moveTo(fx.x1, fx.y1); ctx.lineTo(fx.x2, fx.y2); ctx.stroke(); ctx.globalAlpha = 1; }
    else if (fx.k === 'rail') { ctx.strokeStyle = fx.c || '#fff5c8'; ctx.globalAlpha = Math.min(1, fx.life * 3); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(fx.x1, fx.y1); ctx.lineTo(fx.x2, fx.y2); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fx.x1, fx.y1); ctx.lineTo(fx.x2, fx.y2); ctx.stroke(); ctx.globalAlpha = 1; }
    else if (fx.k === 'boom') { const t = 1 - fx.life / fx.max; const r = fx.r * (0.4 + t); const g = ctx.createRadialGradient(fx.x, fx.y, 0, fx.x, fx.y, r); g.addColorStop(0, 'rgba(255,255,220,' + (1 - t) + ')'); g.addColorStop(0.4, 'rgba(255,150,50,' + (0.8 - t * 0.8) + ')'); g.addColorStop(1, 'rgba(255,60,20,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(fx.x, fx.y, r, 0, 7); ctx.fill(); }
    else if (fx.k === 'hit') { ctx.fillStyle = fx.c; ctx.globalAlpha = fx.life * 6; ctx.beginPath(); ctx.arc(fx.x, fx.y, 6, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    else if (fx.k === 'shield') { ctx.strokeStyle = 'rgba(160,230,255,' + fx.life * 2.5 + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(fx.x, fx.y, 18, 0, 7); ctx.stroke(); }
  }
  ctx.restore();
};
})();
