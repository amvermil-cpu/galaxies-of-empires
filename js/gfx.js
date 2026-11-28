// Galaxies of Empires v2.0 — graphics overhaul: procedural sprites, backdrop, territory, planet close-up,
// map effects, replay viewer, quality/FPS handling, photo mode. Everything is drawn in code (no image assets).
'use strict';
(function () {
const E = window.EOG, Rd = E.render;
const TAU = Math.PI * 2;
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
const hexA = Rd.hexA;
function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function mix(a, b, t) { const A = rgb(a), B = rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
function seeded(s) { return E.mulberry(s * 7919 + 13); }
Rd.Q = () => E.Q();
Rd.gstats = { sprites: 0, fx: 0, fxDropped: 0, trails: 0, planetFrames: 0 };

// =====================================================================================
// A / D / S / W: ship sprites — pre-rendered once per hull × colour × style × boost, then reused
// =====================================================================================
const SPR = new Map();
const K = 3; // sprite pixels per hull-size unit
const ENGINES = { fighter: [[-0.62, 0.42], [-0.62, -0.42]], destroyer: [[-1, 0.22], [-1, -0.22], [-1, 0]], transport: [[-0.95, 0.28], [-0.95, -0.28]], trader: [[-0.9, 0]], carrier: [[-0.98, 0.34], [-0.98, -0.34], [-0.98, 0.12], [-0.98, -0.12]], freighter: [[-1, 0.2], [-1, -0.2]] };
Rd.ENGINES = ENGINES;
function shipStyle(owner) { if (owner === 'crisis') return 'hollow'; if (owner === 'player' && E.state && E.speciesLook() === 'alien') return 'alien'; return 'std'; }
function hullPath(g, h, s, style) {
  g.beginPath();
  if (style === 'hollow') { // organic carapace; spike count/size per hull
    const sp = { fighter: 5, destroyer: 9, transport: 7, trader: 6, carrier: 13, freighter: 10 }[h] || 8;
    for (let i = 0; i <= sp * 2; i++) { const a = i / (sp * 2) * TAU, r = s * (i % 2 ? 0.55 : 1) * (i === 0 || i === sp * 2 ? 1.25 : 1) * (1 + 0.12 * Math.sin(i * 2.3)); const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.72; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath(); return;
  }
  if (style === 'alien') {
    if (h === 'fighter') { g.moveTo(s, 0); g.quadraticCurveTo(0, s * 0.95, -s * 0.8, s * 0.55); g.quadraticCurveTo(-s * 0.3, 0, -s * 0.8, -s * 0.55); g.quadraticCurveTo(0, -s * 0.95, s, 0); }
    else if (h === 'carrier' || h === 'freighter') { g.ellipse(0, 0, s, s * 0.42, 0, 0, TAU); g.moveTo(-s * 0.4, s * 0.38); g.quadraticCurveTo(-s * 0.9, s * 0.8, -s * 1.05, s * 0.3); g.moveTo(-s * 0.4, -s * 0.38); g.quadraticCurveTo(-s * 0.9, -s * 0.8, -s * 1.05, -s * 0.3); }
    else { g.moveTo(s, 0); g.bezierCurveTo(s * 0.5, s * 0.6, -s * 0.3, s * 0.3, -s * 0.9, s * 0.55); g.quadraticCurveTo(-s * 0.6, 0, -s * 0.9, -s * 0.55); g.bezierCurveTo(-s * 0.3, -s * 0.3, s * 0.5, -s * 0.6, s, 0); }
    g.closePath(); return;
  }
  const P = {
    fighter: [[1, 0], [0.25, 0.16], [-0.1, 0.78], [-0.55, 0.82], [-0.42, 0.26], [-0.7, 0.2], [-0.7, -0.2], [-0.42, -0.26], [-0.55, -0.82], [-0.1, -0.78], [0.25, -0.16]],
    destroyer: [[1, 0], [0.7, 0.12], [0.35, 0.14], [0.2, 0.34], [-0.25, 0.36], [-0.4, 0.22], [-0.8, 0.26], [-1, 0.3], [-1, -0.3], [-0.8, -0.26], [-0.4, -0.22], [-0.25, -0.36], [0.2, -0.34], [0.35, -0.14], [0.7, -0.12]],
    transport: [[0.85, 0.12], [0.95, 0], [0.85, -0.12], [0.6, -0.3], [-0.7, -0.42], [-0.95, -0.34], [-0.95, 0.34], [-0.7, 0.42], [0.6, 0.3]],
    trader: [[1, 0], [0.6, 0.3], [-0.2, 0.42], [-0.8, 0.3], [-0.95, 0.12], [-0.95, -0.12], [-0.8, -0.3], [-0.2, -0.42], [0.6, -0.3]],
    carrier: [[1, 0], [0.75, 0.22], [0.35, 0.3], [0.1, 0.55], [-0.6, 0.6], [-0.75, 0.42], [-1, 0.42], [-1, -0.42], [-0.75, -0.42], [-0.6, -0.6], [0.1, -0.55], [0.35, -0.3], [0.75, -0.22]],
    freighter: [[1, 0], [0.82, 0.16], [0.6, 0.2], [-0.75, 0.24], [-1, 0.3], [-1, -0.3], [-0.75, -0.24], [0.6, -0.2], [0.82, -0.16]],
  }[h] || [[1, 0], [-0.8, 0.6], [-0.8, -0.6]];
  P.forEach(([x, y], i) => i ? g.lineTo(x * s, y * s) : g.moveTo(x * s, y * s)); g.closePath();
}
function drawShipArt(g, h, s, col, style, bo) {
  const base = style === 'hollow' ? '#1b2a17' : style === 'alien' ? mix(col, '#2a1838', 0.55) : mix(col, '#2b3446', 0.62);
  const light = style === 'hollow' ? '#3d5a2f' : mix(base, '#ffffff', 0.35), dark = mix(base, '#000000', 0.45);
  const eng = style === 'hollow' ? '#9dff6b' : style === 'alien' ? '#e08bff' : mix(col, '#ffffff', 0.45);
  // engine glow (behind hull)
  for (const [ex, ey] of (style === 'hollow' ? [[-0.9, 0]] : ENGINES[h] || [])) {
    const x = ex * s, y = ey * s, r = s * (h === 'fighter' ? 0.35 : 0.28);
    const gg = g.createRadialGradient(x - r * 0.4, y, 0, x - r * 0.4, y, r * 2.2); gg.addColorStop(0, hexA(eng, 0.95)); gg.addColorStop(0.35, hexA(eng, 0.45)); gg.addColorStop(1, hexA(eng, 0));
    g.fillStyle = gg; g.fillRect(x - r * 3, y - r * 2.2, r * 4.4, r * 4.4);
  }
  // forge aura (D)
  if (bo) { g.save(); g.shadowColor = '#ffcc4d'; g.shadowBlur = s * 0.5; hullPath(g, h, s * 1.04, style); g.fillStyle = 'rgba(255,204,77,0.55)'; g.fill(); g.restore(); }
  // hull body with top-lit gradient
  hullPath(g, h, s, style);
  const gr = g.createLinearGradient(0, -s * 0.7, 0, s * 0.7); gr.addColorStop(0, light); gr.addColorStop(0.5, base); gr.addColorStop(1, dark);
  g.fillStyle = gr; g.fill();
  g.lineWidth = Math.max(1, s * 0.05); g.strokeStyle = bo ? '#ffd35a' : style === 'hollow' ? '#6dff4f' : mix(col, '#ffffff', 0.25); g.stroke();
  g.save(); hullPath(g, h, s, style); g.clip();
  g.lineWidth = Math.max(0.6, s * 0.022); g.strokeStyle = 'rgba(0,0,0,0.45)';
  if (style === 'hollow') {
    // bioluminescent veins + core
    g.strokeStyle = 'rgba(125,255,107,0.7)'; g.lineWidth = Math.max(0.8, s * 0.04);
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(Math.cos(a + 0.5) * s * 0.4, Math.sin(a + 0.5) * s * 0.3, Math.cos(a) * s * 0.85, Math.sin(a) * s * 0.6); g.stroke(); }
    const cg = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.35); cg.addColorStop(0, '#eaffd8'); cg.addColorStop(0.4, 'rgba(125,255,107,0.8)'); cg.addColorStop(1, 'rgba(125,255,107,0)'); g.fillStyle = cg; g.fillRect(-s, -s, s * 2, s * 2);
  } else if (style === 'alien') {
    g.strokeStyle = hexA(eng, 0.6); g.lineWidth = Math.max(0.7, s * 0.03);
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(s * 0.8, 0); g.quadraticCurveTo(0, i * s * 0.18, -s, i * s * 0.22); g.stroke(); }
    for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(182,255,158,0.85)'; g.beginPath(); g.arc(s * (0.2 - i * 0.3), (i % 2 ? 1 : -1) * s * 0.12, Math.max(1, s * 0.07), 0, TAU); g.fill(); }
  } else {
    // panel lines: longitudinal spine + cross panels
    g.beginPath(); g.moveTo(s * 0.9, 0); g.lineTo(-s, 0); g.stroke();
    for (let i = 1; i <= 5; i++) { const x = s * (0.7 - i * 0.32); g.beginPath(); g.moveTo(x, -s); g.lineTo(x - s * 0.08, s); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.moveTo(s * 0.85, -s * 0.04); g.lineTo(-s * 0.9, -s * 0.06); g.stroke();
    // accent stripes in faction colour
    g.fillStyle = hexA(col, 0.85);
    if (h === 'fighter') { g.fillRect(-s * 0.45, s * 0.5, s * 0.28, s * 0.12); g.fillRect(-s * 0.45, -s * 0.62, s * 0.28, s * 0.12); }
    else if (h === 'destroyer') { g.fillRect(-s * 0.2, -s * 0.36, s * 0.12, s * 0.72); g.fillRect(s * 0.45, -s * 0.13, s * 0.08, s * 0.26); }
    else if (h === 'carrier') { g.fillRect(-s * 0.55, -s * 0.06, s * 1.3, s * 0.12); }
    else g.fillRect(-s * 0.5, -s * 0.5, s * 0.1, s);
  }
  g.restore();
  if (style === 'std') {
    // hull-specific details
    if (h === 'fighter') { const cg = g.createLinearGradient(s * 0.1, -s * 0.1, s * 0.6, s * 0.1); cg.addColorStop(0, '#9ff3ff'); cg.addColorStop(1, '#1b6a8a'); g.fillStyle = cg; g.beginPath(); g.ellipse(s * 0.35, 0, s * 0.24, s * 0.09, 0, 0, TAU); g.fill(); }
    if (h === 'destroyer') { g.fillStyle = light; g.fillRect(-s * 0.15, -s * 0.12, s * 0.3, s * 0.24); g.fillStyle = '#bff6ff'; g.fillRect(s * 0.05, -s * 0.08, s * 0.06, s * 0.16); g.fillStyle = dark; for (const tx of [0.5, -0.5]) { g.beginPath(); g.arc(s * tx, 0, s * 0.08, 0, TAU); g.fill(); g.fillRect(s * tx, -s * 0.02, s * 0.22, s * 0.04); } }
    if (h === 'transport') { g.fillStyle = mix(base, '#000', 0.25); for (let i = 0; i < 3; i++) { g.beginPath(); g.roundRect ? g.roundRect(s * (-0.55 + i * 0.4), s * 0.16, s * 0.32, s * 0.2, s * 0.05) : g.rect(s * (-0.55 + i * 0.4), s * 0.16, s * 0.32, s * 0.2); g.roundRect ? g.roundRect(s * (-0.55 + i * 0.4), -s * 0.36, s * 0.32, s * 0.2, s * 0.05) : g.rect(s * (-0.55 + i * 0.4), -s * 0.36, s * 0.32, s * 0.2); g.fill(); } g.fillStyle = '#bff6ff'; g.fillRect(s * 0.62, -s * 0.07, s * 0.12, s * 0.14); }
    if (h === 'trader') { const cs = ['#ffb454', '#7fe3ff', '#9be37a', '#ff7ad9']; for (let i = 0; i < 4; i++) { g.fillStyle = cs[i]; g.fillRect(s * (-0.6 + i * 0.28), -s * 0.24, s * 0.22, s * 0.2); g.fillStyle = cs[(i + 2) % 4]; g.fillRect(s * (-0.6 + i * 0.28), s * 0.04, s * 0.22, s * 0.2); } g.strokeStyle = hexA(col, 0.9); g.lineWidth = s * 0.04; g.beginPath(); g.arc(s * 0.62, 0, s * 0.14, 0, TAU); g.stroke(); }
    if (h === 'carrier') { g.fillStyle = 'rgba(0,0,0,0.6)'; for (let i = 0; i < 4; i++) { g.fillRect(s * (-0.5 + i * 0.28), s * 0.28, s * 0.18, s * 0.14); g.fillRect(s * (-0.5 + i * 0.28), -s * 0.42, s * 0.18, s * 0.14); } g.fillStyle = '#ffe9a8'; for (let i = 0; i < 4; i++) { g.fillRect(s * (-0.47 + i * 0.28), s * 0.39, s * 0.12, s * 0.025); g.fillRect(s * (-0.47 + i * 0.28), -s * 0.415, s * 0.12, s * 0.025); } g.fillStyle = light; g.fillRect(s * 0.05, -s * 0.5, s * 0.22, s * 0.14); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.setLineDash([s * 0.06, s * 0.05]); g.lineWidth = s * 0.02; g.beginPath(); g.moveTo(s * 0.85, 0); g.lineTo(-s * 0.7, 0); g.stroke(); g.setLineDash([]); }
    if (h === 'freighter') { for (let i = 0; i < 5; i++) { const x = s * (0.4 - i * 0.26); const cg = g.createLinearGradient(0, -s * 0.2, 0, s * 0.2); cg.addColorStop(0, light); cg.addColorStop(1, dark); g.fillStyle = cg; g.beginPath(); g.ellipse(x, 0, s * 0.11, s * 0.21, 0, 0, TAU); g.fill(); g.strokeStyle = hexA(col, 0.8); g.lineWidth = s * 0.02; g.stroke(); } }
    // nav lights
    g.fillStyle = '#ff5050'; g.beginPath(); g.arc(-s * 0.3, s * 0.5 * (h === 'fighter' ? 1.5 : 0.75), Math.max(0.8, s * 0.04), 0, TAU); g.fill();
    g.fillStyle = '#50ff8a'; g.beginPath(); g.arc(-s * 0.3, -s * 0.5 * (h === 'fighter' ? 1.5 : 0.75), Math.max(0.8, s * 0.04), 0, TAU); g.fill();
  }
  if (bo) { // gold trim lines (D)
    g.save(); hullPath(g, h, s * 0.86, style); g.strokeStyle = 'rgba(255,211,90,0.9)'; g.lineWidth = Math.max(0.8, s * 0.03); g.setLineDash([s * 0.12, s * 0.06]); g.stroke(); g.restore();
  }
}
Rd.shipSprite = function (h, color, owner, bo) {
  const style = shipStyle(owner), key = h + '|' + color + '|' + style + '|' + (bo ? 1 : 0);
  let c = SPR.get(key); if (c) return c;
  const s = (E.HULLS[h] || { size: 10 }).size * K, pad = s * 1.35;
  c = mk(pad * 2, pad * 2); const g = c.getContext('2d'); g.translate(pad, pad);
  drawShipArt(g, h, s, color, style, bo); c.r = pad / K; SPR.set(key, c); Rd.gstats.sprites = SPR.size;
  return c;
};
const drawHullOld = Rd.drawHull; Rd.drawHullBasic = drawHullOld;
Rd.drawHull = function (ctx, h, x, y, ang, color, owner, scale, bo) {
  if (!E.HULLS[h]) return drawHullOld(ctx, h, x, y, ang, color, owner, scale);
  const c = Rd.shipSprite(h, color, owner, bo), sc = (scale || 1), r = c.r * sc;
  if (ang) { ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.drawImage(c, -r, -r, r * 2, r * 2); ctx.restore(); }
  else ctx.drawImage(c, x - r, y - r, r * 2, r * 2);
};

// =====================================================================================
// B: cheap map planets (pre-rendered discs) and owner glows
// =====================================================================================
const PSPR = new Map();
Rd.planetDisc = function (type, seed) {
  const key = type + '|' + (seed % 4); let c = PSPR.get(key); if (c) return c;
  c = mk(64, 64); Rd.drawPlanet(c.getContext('2d'), 32, 32, 28, E.PLANET_TYPES[type], seed % 4); PSPR.set(key, c); return c;
};
const GLOW = new Map();
Rd.glowSprite = function (color, a0) {
  const key = color + a0; let c = GLOW.get(key); if (c) return c;
  c = mk(128, 128); const g = c.getContext('2d'), gg = g.createRadialGradient(64, 64, 64 * 0.18, 64, 64, 64);
  gg.addColorStop(0, hexA(color, a0)); gg.addColorStop(0.45, hexA(color, 0.2)); gg.addColorStop(1, hexA(color, 0)); g.fillStyle = gg; g.fillRect(0, 0, 128, 128);
  GLOW.set(key, c); return c;
};

// v2.6: cache the zoomed-in colour disc + star glow so close pans blit instead of rebuilding gradients.
const CDISC = new Map(), STARSPR = new Map();
Rd.colorDisc = function (color) {
  let c = CDISC.get(color); if (c) return c;
  c = mk(64, 64); const g = c.getContext('2d');
  g.fillStyle = color; g.beginPath(); g.arc(32, 32, 28, 0, 7); g.fill();
  CDISC.set(color, c); return c;
};
Rd.starGlowSpr = function (color) {
  let c = STARSPR.get(color); if (c) return c;
  c = mk(128, 128); const g = c.getContext('2d');
  const gg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gg.addColorStop(0, color); gg.addColorStop(0.25, hexA(color, 0.5)); gg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gg; g.fillRect(0, 0, 128, 128);
  STARSPR.set(color, c); return c;
};

// =====================================================================================
// E: layered starfield + drifting nebulas with parallax
// =====================================================================================
const BG = Rd._bg = { layers: null, nebs: null, grad: null, gkey: '' };
function starTile(seed, n, maxS, tint, sc) {
  sc = sc || 1; const c = mk(512 * sc, 512 * sc), g = c.getContext('2d'), R = seeded(seed); g.scale(sc, sc);
  for (let i = 0; i < n; i++) {
    const a = R(), x = R() * 512, y = R() * 512, s = 0.4 + a * maxS;
    const col = R() < tint ? (R() < 0.5 ? '255,214,170' : '170,200,255') : '255,255,255';
    g.fillStyle = 'rgba(' + col + ',' + (0.25 + a * 0.7) + ')';
    if (s > 1.4) { const gg = g.createRadialGradient(x, y, 0, x, y, s * 2.5); gg.addColorStop(0, 'rgba(' + col + ',0.9)'); gg.addColorStop(1, 'rgba(' + col + ',0)'); g.fillStyle = gg; g.fillRect(x - s * 3, y - s * 3, s * 6, s * 6); }
    else g.fillRect(x, y, s, s);
  }
  return c;
}
function nebulaSprite(seed, hue) {
  const c = mk(512, 512), g = c.getContext('2d'), R = seeded(seed);
  for (let i = 0; i < 26; i++) {
    const x = 256 + (R() - 0.5) * 300, y = 256 + (R() - 0.5) * 300, r = 60 + R() * 150, h2 = hue + (R() - 0.5) * 60;
    const gg = g.createRadialGradient(x, y, 0, x, y, r); gg.addColorStop(0, 'hsla(' + h2 + ',70%,55%,' + (0.05 + R() * 0.06) + ')'); gg.addColorStop(1, 'hsla(' + h2 + ',70%,40%,0)');
    g.fillStyle = gg; g.fillRect(0, 0, 512, 512);
  }
  // dark dust lanes
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 6; i++) { const x = 256 + (R() - 0.5) * 260, y = 256 + (R() - 0.5) * 260, r = 30 + R() * 70; const gg = g.createRadialGradient(x, y, 0, x, y, r); gg.addColorStop(0, 'rgba(0,0,0,0.5)'); gg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gg; g.fillRect(0, 0, 512, 512); }
  return c;
}
const STAR_DEF = [[11, 700, 0.8, 0.1], [23, 220, 1.3, 0.25], [37, 60, 2.2, 0.4]];
function ensureBg() {
  if (BG.nebs) return;
  BG.nebs = [nebulaSprite(5, 265), nebulaSprite(9, 195), nebulaSprite(14, 320), nebulaSprite(21, 160)]; BG.tiles = {};
}
function tileFor(li, sc) { const k = li + '@' + sc; return BG.tiles[k] || (BG.tiles[k] = starTile(STAR_DEF[li][0], STAR_DEF[li][1], STAR_DEF[li][2], STAR_DEF[li][3], sc)); }
const PF = [0.02, 0.06, 0.12];
// W: the deep layer (gradient + nebulas) is composed once into a screen-sized canvas with a margin; drift and pan
// just slide it (drawImage offset) and it is only re-composed when the offset runs past the margin. Star layers are blitted tiles.
const MARG = 160;
function composeDeep(g, W, H, sc, Q, ox, oy) {
  const w = W / sc, h = H / sc;
  g.setTransform(sc, 0, 0, sc, 0, 0);
  const grd = g.createLinearGradient(0, 0, w, h); grd.addColorStop(0, '#040714'); grd.addColorStop(0.55, '#070a1f'); grd.addColorStop(1, '#0d0622'); g.fillStyle = grd; g.fillRect(0, 0, w, h);
  if (Q.nebula) {
    g.globalCompositeOperation = 'lighter';
    const PL = [[-0.25, -0.2, 1.6], [0.55, 0.35, 1.3], [0.2, 0.9, 1.5], [1.1, -0.1, 1.2]], span = w + 900;
    for (let i = 0; i < Q.nebula; i++) {
      const [fx, fy, sc2] = PL[i], size = 512 * sc2;
      const x = (((fx * w + ox) % span) + span) % span - size * 0.45, y = fy * h + oy * 0.6 - size * 0.3;
      g.globalAlpha = 0.85; g.drawImage(BG.nebs[i], x, y, size, size);
    }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
}
function blitStars(g, W, H, sc, cam, li) {
  const t = tileFor(li, sc), T = t.width, f = PF[li];
  let ox = -((cam.x * cam.z * f * sc) % T), oy = -((cam.y * cam.z * f * sc) % T); if (ox > 0) ox -= T; if (oy > 0) oy -= T;
  ox = Math.round(ox); oy = Math.round(oy);
  for (let x = ox; x < W; x += T) for (let y = oy; y < H; y += T) g.drawImage(t, x, y);
}
// W/X: when the camera is still, backdrop + territory are composed once into one screen-sized layer and reused
const BASE = Rd._base = { c: null, key: '', prev: '', hits: 0, builds: 0 };
Rd.drawBase = function (ctx, w, h, cam, time) {
  const st = E.state, Q = E.Q(), z = cam.z, ox = w / 2 - cam.x * z, oy = h / 2 - cam.y * z;
  Rd.updateTerritory(time);
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const camKey = W + '|' + H + '|' + (ctx.getTransform().a || 1) + '|' + cam.x.toFixed(2) + '|' + cam.y.toFixed(2) + '|' + z.toFixed(5) + '|' + E.effQuality() + '|' + TER.sig.length + ':' + TER.ver;
  const key = camKey + '|' + (Q.drift ? Math.round(time * 3) : 0); // nebula drift (3 px/s) re-composes the cached layer once per css pixel
  if (key === BASE.key && BASE.c) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(BASE.c, 0, 0); ctx.restore(); BASE.hits++; return; }
  if (key === BASE.prev || (BASE.c && camKey === BASE.camKey)) {
    BASE.camKey = camKey;
    if (!BASE.c || BASE.c.width !== W || BASE.c.height !== H) BASE.c = mk(W, H);
    const g = BASE.c.getContext('2d'); g.setTransform(ctx.getTransform()); Rd.drawBackdrop(g, w, h, cam, time); Rd.drawTerritory(g, ox, oy, z, time);
    BASE.key = key; BASE.builds++; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(BASE.c, 0, 0); ctx.restore(); return;
  }
  BASE.prev = key; BASE.key = ''; BASE.camKey = ''; Rd.drawBackdrop(ctx, w, h, cam, time); Rd.drawTerritory(ctx, ox, oy, z, time);
};
// v2.2 item 1: backdrop for the simplified map — only the pre-composed deep layer (one blit, no star tiles)
Rd.drawBackdropLite = function (ctx, w, h, cam, time) {
  if (E.effQuality() === 'low' || Rd.SIMPLE_PLAIN_BG) { ctx.fillStyle = '#060a1a'; ctx.fillRect(0, 0, w, h); return; }
  const Q = E.Q(), ns = Q.stars; Q.stars = 0; try { Rd.drawBackdrop(ctx, w, h, cam, time); } finally { Q.stars = ns; }
};
Rd.drawBackdrop = function (ctx, w, h, cam, time) {
  ensureBg(); const Q = E.Q(), qn = E.effQuality(), sc = ctx.getTransform().a || 1;
  const W = Math.round((w + MARG * 2) * sc), H = Math.round((h + MARG * 2) * sc);
  if (!BG.deep || BG.deep.width !== W || BG.deep.height !== H) { BG.deep = mk(W, H); BG.dk = null; }
  // desired nebula offset (css px): slow drift to the right + gentle parallax against the camera
  const nx = (Q.drift ? time * 3 : 0) - cam.x * cam.z * 0.04, ny = -cam.y * cam.z * 0.04;
  let dx = nx - (BG.nx || 0), dy = ny - (BG.ny || 0);
  if (BG.dk !== qn || BG.sc !== sc || Math.abs(dx) > MARG - 2 || Math.abs(dy) > MARG - 2) {
    composeDeep(BG.deep.getContext('2d'), W, H, sc, Q, nx, ny); BG.nx = nx; BG.ny = ny; BG.dk = qn; BG.sc = sc; dx = 0; dy = 0; Rd.gstats.bgCompose = (Rd.gstats.bgCompose || 0) + 1;
  }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(BG.deep, Math.round((-MARG + dx) * sc), Math.round((-MARG + dy) * sc));
  const WW = Math.round(w * sc), HH = Math.round(h * sc);
  for (let li = 0; li < Q.stars; li++) blitStars(ctx, WW, HH, sc, cam, li);
  ctx.restore();
  Rd.gstats.bgShift = (Rd.gstats.bgShift || 0) + (dx || dy ? 1 : 0);
};

// =====================================================================================
// F: soft colored empire territory (cached in world space; rebuilt only when ownership changes)
// =====================================================================================
const TER = Rd._ter = { c: null, sig: '', f: 1 / 6, at: 0, ver: 0 };
Rd.TERR_RIM = 9; // v2.1 item 11: thinner empire borders (rim was 16 world units, blur 1.6 px, alpha 0.48)
function terrSig(st) { let s = st.world.w + 'x' + st.world.h + ':'; for (const p of st.planets) s += p.owner === 'neutral' ? '.' : p.owner.charCodeAt(0) + p.owner.length; return s + (E.Q().terrRim ? 'r' : ''); }
Rd.updateTerritory = function (now) {
  const st = E.state;
  if (!TER.c || now - TER.at > 0.5) {
    TER.at = now; const sig = terrSig(st);
    if (sig !== TER.sig) {
      TER.sig = sig; TER.ver = (TER.ver || 0) + 1; const f = TER.f, W = st.world.w + 400, H = st.world.h + 400;
      TER.c = TER.c && TER.c.width === Math.ceil(W * f) ? TER.c : mk(W * f, H * f);
      const g = TER.c.getContext('2d'); g.clearRect(0, 0, TER.c.width, TER.c.height);
      const tmp = mk(TER.c.width, TER.c.height), tg = tmp.getContext('2d');
      const by = {}; for (const s of st.systems) { if (s.rift) continue; const p = st.planets[s.planetId]; if (p.owner === 'neutral') continue; (by[p.owner] = by[p.owner] || []).push(s); }
      const R0 = 128, rim = E.Q().terrRim;
      for (const o in by) {
        tg.clearRect(0, 0, tmp.width, tmp.height); tg.globalCompositeOperation = 'source-over'; tg.fillStyle = E.FACTIONS[o].color;
        tg.beginPath(); for (const s of by[o]) { tg.moveTo((s.x + 200 + R0) * f, (s.y + 200) * f); tg.arc((s.x + 200) * f, (s.y + 200) * f, R0 * f, 0, TAU); } tg.fill();
        if (rim) { tg.globalCompositeOperation = 'destination-out'; tg.fillStyle = 'rgba(0,0,0,0.7)'; tg.beginPath(); for (const s of by[o]) { tg.moveTo((s.x + 200 + R0 - Rd.TERR_RIM) * f, (s.y + 200) * f); tg.arc((s.x + 200) * f, (s.y + 200) * f, (R0 - Rd.TERR_RIM) * f, 0, TAU); } tg.fill(); }
        g.globalAlpha = rim ? 0.42 : 0.16; if (rim) g.filter = 'blur(0.8px)'; g.drawImage(tmp, 0, 0); g.filter = 'none'; g.globalAlpha = 1;
      }
    }
  }
};
Rd.drawTerritory = function (ctx, ox, oy, z, now) {
  Rd.updateTerritory(now);
  if (!TER.c) return;
  // X: blit only the part of the territory layer that is on screen
  const sw = ctx.canvas.width / (ctx.getTransform().a || 1), shh = ctx.canvas.height / (ctx.getTransform().a || 1), f = TER.f, k = z / f;
  let sx = (-(ox - 200 * z)) / k, sy = (-(oy - 200 * z)) / k, sW = sw / k, sH = shh / k, dx = 0, dy = 0, dW = sw, dH = shh;
  if (sx < 0) { dx = -sx * k; dW -= dx; sW += sx; sx = 0; } if (sy < 0) { dy = -sy * k; dH -= dy; sH += sy; sy = 0; }
  if (sx + sW > TER.c.width) { const cut = sx + sW - TER.c.width; sW -= cut; dW -= cut * k; } if (sy + sH > TER.c.height) { const cut = sy + sH - TER.c.height; sH -= cut; dH -= cut * k; }
  if (sW > 0.5 && sH > 0.5 && dW > 0 && dH > 0) { const sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'medium'; ctx.drawImage(TER.c, sx, sy, sW, sH, dx, dy, dW, dH); ctx.imageSmoothingEnabled = sm; }
};

// =====================================================================================
// S: the Rift — swirling portal (pre-rendered spiral rotated per frame)
// =====================================================================================
let RIFT = null;
// v2.7: a torn seam in space — dark void core, jagged pale-green lip, violet wisps (original art).
function riftSprite() {
  const c = mk(256, 256), g = c.getContext('2d'); g.translate(128, 128);
  const halo = g.createRadialGradient(0, 0, 8, 0, 0, 124);
  halo.addColorStop(0, 'rgba(40,0,50,0.0)'); halo.addColorStop(0.25, 'rgba(90,20,120,0.28)');
  halo.addColorStop(0.55, 'rgba(80,255,140,0.22)'); halo.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = halo; g.beginPath(); g.arc(0, 0, 124, 0, TAU); g.fill();
  // jagged tear (elongated, irregular)
  g.save(); g.rotate(-0.35); g.scale(0.55, 1);
  g.fillStyle = '#020104';
  g.beginPath();
  g.moveTo(0, -108);
  for (let i = 0; i <= 16; i++) {
    const t = i / 16, y = -108 + t * 216, x = (i % 2 ? 1 : -1) * (10 + 18 * Math.sin(t * 9) * (1 - Math.abs(t * 2 - 1)));
    g.lineTo(x, y);
  }
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(190,255,160,0.95)'; g.lineWidth = 4; g.stroke();
  g.strokeStyle = 'rgba(160,80,255,0.55)'; g.lineWidth = 2; g.stroke();
  g.restore();
  const core = g.createRadialGradient(0, 0, 0, 0, 0, 36);
  core.addColorStop(0, '#f6ffe8'); core.addColorStop(0.25, '#7dff6b'); core.addColorStop(0.7, 'rgba(20,0,30,0.9)'); core.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = core; g.beginPath(); g.arc(0, 0, 36, 0, TAU); g.fill();
  return c;
}
Rd.drawRiftX = function (ctx, x, y, z, t) {
  RIFT = RIFT || riftSprite();
  const st = E.state, c = st && st.crisis;
  const nextAt = (E.riftWaveTime && c) ? E.riftWaveTime((c.waveIdx || 0) + 1) : 0;
  const imminent = !!(st && nextAt && (nextAt - st.t) < (E.RIFT_WARN || 600));
  const pulse = 1 + 0.08 * Math.sin(t * (imminent ? 7 : 2.2));
  const r = (52 * z + 16) * pulse, Q = E.Q();
  if (Q.glow) ctx.drawImage(Rd.glowSprite(imminent ? '#c6ff7a' : '#7dff6b', imminent ? 0.7 : 0.5), x - r * 2.1, y - r * 2.1, r * 4.2, r * 4.2);
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.15 + 0.04 * Math.sin(t * 0.7));
  ctx.drawImage(RIFT, -r, -r, r * 2, r * 2);
  ctx.restore();
  // drifting motes along the tear (fillRect, same budget as v2.6)
  if (Q.glow) for (let i = 0; i < 10; i++) {
    const py = y + (i / 9 - 0.5) * r * 1.6, px = x + Math.sin(t * 0.8 + i) * r * 0.18;
    ctx.fillStyle = 'rgba(' + (i % 2 ? '200,255,170,' : '190,140,255,') + (0.35 + 0.4 * Math.sin(t * 3 + i)) + ')';
    ctx.fillRect(px, py, 2, 2);
  }
  Rd.gstats.rift = (Rd.gstats.rift || 0) + 1;
};

// =====================================================================================
// O: species emblems + empire banners
// =====================================================================================
const EMB = new Map(), BAN = new Map(), URL_ = new Map();
function drawEmblem(g, sp, cx, cy, r, col) {
  g.save(); g.translate(cx, cy); g.fillStyle = col; g.strokeStyle = col; g.lineWidth = r * 0.12; g.lineCap = 'round'; g.lineJoin = 'round';
  if (sp === 'forgeborn') { // anvil + gear
    g.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, rr = i % 2 ? r * 0.8 : r * 0.95; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr - r * 0.05); } g.closePath(); g.lineWidth = r * 0.1; g.stroke();
    g.beginPath(); g.moveTo(-r * 0.55, -r * 0.15); g.lineTo(r * 0.55, -r * 0.15); g.lineTo(r * 0.3, r * 0.1); g.lineTo(r * 0.18, r * 0.1); g.lineTo(r * 0.3, r * 0.42); g.lineTo(-r * 0.3, r * 0.42); g.lineTo(-r * 0.18, r * 0.1); g.lineTo(-r * 0.35, r * 0.1); g.closePath(); g.fill();
  } else if (sp === 'skyrunner') { // swept wings / chevrons
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-r * 0.75, r * (0.35 - i * 0.32)); g.lineTo(0, r * (-0.1 - i * 0.32)); g.lineTo(r * 0.75, r * (0.35 - i * 0.32)); g.stroke(); }
    g.beginPath(); g.arc(0, r * 0.55, r * 0.12, 0, TAU); g.fill();
  } else if (sp === 'veyari') { // crystal eye
    g.beginPath(); g.moveTo(-r * 0.9, 0); g.quadraticCurveTo(0, -r * 0.8, r * 0.9, 0); g.quadraticCurveTo(0, r * 0.8, -r * 0.9, 0); g.stroke();
    g.beginPath(); g.moveTo(0, -r * 0.38); g.lineTo(r * 0.24, 0); g.lineTo(0, r * 0.38); g.lineTo(-r * 0.24, 0); g.closePath(); g.fill();
  } else if (sp === 'hollow') { // jagged maw
    g.beginPath(); for (let i = 0; i <= 12; i++) { const a = i / 12 * TAU, rr = i % 2 ? r * 0.45 : r * 0.9; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.stroke();
    g.beginPath(); g.arc(0, 0, r * 0.2, 0, TAU); g.fill();
  } else { // ringed star
    g.beginPath(); for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.3 : r * 0.7, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill();
    g.beginPath(); g.ellipse(0, 0, r * 0.95, r * 0.35, -0.4, 0, TAU); g.lineWidth = r * 0.08; g.stroke();
  }
  g.restore();
}
Rd.emblem = function (sp, col, px) {
  px = px || 64; const key = sp + col + px; let c = EMB.get(key); if (c) return c;
  c = mk(px, px); drawEmblem(c.getContext('2d'), sp, px / 2, px / 2, px * 0.42, col || '#e8f3ff'); EMB.set(key, c); return c;
};
Rd.factionSpecies = function (o) { return o === 'crisis' ? 'hollow' : E.speciesOf ? E.speciesOf(o) : 'none'; };
Rd.banner = function (o) {
  const sp = Rd.factionSpecies(o), key = o + sp; let c = BAN.get(key); if (c) return c;
  const col = E.FACTIONS[o].color; c = mk(48, 64); const g = c.getContext('2d');
  g.fillStyle = '#c9d1dc'; g.fillRect(3, 2, 3, 60); // pole
  const gr = g.createLinearGradient(6, 0, 46, 0); gr.addColorStop(0, mix(col, '#000', 0.25)); gr.addColorStop(1, col);
  g.fillStyle = gr; g.beginPath(); g.moveTo(6, 4); g.lineTo(46, 4); g.lineTo(46, 44); g.lineTo(26, 54); g.lineTo(6, 44); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.5; g.stroke();
  drawEmblem(g, sp, 26, 26, 14, '#ffffff'); BAN.set(key, c); return c;
};
Rd.imgURL = function (kind, a, b) {
  const key = kind + '|' + a + '|' + (b || ''); let u = URL_.get(key); if (u) return u;
  try { const c = kind === 'banner' ? Rd.banner(a) : kind === 'emblem' ? Rd.emblem(a, b, 64) : kind === 'building' ? Rd.buildingCanvas(a) : kind === 'icon' ? null : null; u = c ? c.toDataURL('image/png') : ''; } catch (e) { u = ''; }
  URL_.set(key, u); return u;
};
Rd.bannerImg = o => { const u = Rd.imgURL('banner', o); return u ? `<img class="ban" alt="" src="${u}">` : ''; };
Rd.emblemImg = (sp, col) => { const u = Rd.imgURL('emblem', sp, col || '#e8f3ff'); return u ? `<img class="emb" alt="" src="${u}">` : ''; };

// =====================================================================================
// N: building art for planet slots
// =====================================================================================
Rd.buildingCanvas = function (b) {
  const c = mk(72, 72), g = c.getContext('2d');
  const B = E.BUILDINGS[b] || {}; const col = { mine: '#d9a066', power: '#7fe3ff', plant: '#ffd84d', shipyard: '#38e1ff', lab: '#d59bff', barracks: '#9be37a', warehouse: '#c9b48a', tradeport: '#9dff8a', bunker: '#b8c2d0', forge: '#ffb454', scoutpost: '#7fd8ff' }[b] || '#9fb3cc';
  // ground + sky plate
  const sky = g.createLinearGradient(0, 0, 0, 72); sky.addColorStop(0, '#0b1430'); sky.addColorStop(1, '#16223f'); g.fillStyle = sky; g.beginPath(); g.roundRect ? g.roundRect(0, 0, 72, 72, 12) : g.rect(0, 0, 72, 72); g.fill();
  g.fillStyle = '#25304a'; g.fillRect(0, 54, 72, 18);
  const glow = (x, y, r, cc) => { const gg = g.createRadialGradient(x, y, 0, x, y, r); gg.addColorStop(0, hexA(cc, 0.9)); gg.addColorStop(1, hexA(cc, 0)); g.fillStyle = gg; g.fillRect(x - r, y - r, r * 2, r * 2); };
  const metal = '#8a96ad', dk = '#4a5570';
  g.lineWidth = 2; g.strokeStyle = metal; g.fillStyle = metal;
  if (b === 'mine') { g.fillStyle = dk; g.beginPath(); g.moveTo(14, 56); g.lineTo(36, 18); g.lineTo(58, 56); g.fill(); g.strokeStyle = metal; g.beginPath(); g.moveTo(22, 56); g.lineTo(36, 22); g.lineTo(50, 56); g.moveTo(26, 44); g.lineTo(46, 44); g.moveTo(30, 34); g.lineTo(42, 34); g.stroke(); g.fillStyle = col; g.fillRect(33, 46, 6, 12); glow(36, 60, 10, col); }
  else if (b === 'power') { for (const [x, h] of [[24, 26], [36, 36], [48, 22]]) { g.fillStyle = hexA(col, 0.9); g.beginPath(); g.moveTo(x, 56 - h); g.lineTo(x + 6, 50); g.lineTo(x, 56); g.lineTo(x - 6, 50); g.closePath(); g.fill(); } glow(36, 34, 22, col); }
  else if (b === 'plant') { g.fillStyle = dk; g.beginPath(); g.arc(36, 56, 20, Math.PI, 0); g.fill(); glow(36, 46, 16, col); g.strokeStyle = col; g.beginPath(); g.moveTo(36, 24); g.lineTo(30, 38); g.lineTo(40, 38); g.lineTo(34, 52); g.stroke(); g.fillStyle = metal; g.fillRect(56, 30, 5, 26); }
  else if (b === 'shipyard') { g.strokeStyle = metal; g.beginPath(); g.moveTo(14, 56); g.lineTo(14, 16); g.lineTo(58, 16); g.moveTo(58, 16); g.lineTo(58, 56); g.moveTo(14, 24); g.lineTo(58, 24); g.stroke(); Rd.drawHull(g, 'destroyer', 36, 40, 0, col, 'player', 0.9); }
  else if (b === 'lab') { g.fillStyle = dk; g.fillRect(18, 40, 36, 16); g.fillStyle = hexA(col, 0.8); g.beginPath(); g.arc(36, 40, 14, Math.PI, 0); g.fill(); g.strokeStyle = metal; g.beginPath(); g.moveTo(36, 26); g.lineTo(36, 10); g.stroke(); glow(36, 10, 6, col); }
  else if (b === 'barracks') { g.fillStyle = dk; g.fillRect(12, 38, 48, 18); g.fillStyle = metal; for (let i = 0; i < 4; i++) g.fillRect(16 + i * 11, 44, 6, 8); g.fillStyle = col; g.fillRect(34, 18, 2, 20); g.beginPath(); g.moveTo(36, 18); g.lineTo(48, 22); g.lineTo(36, 26); g.fill(); }
  else if (b === 'warehouse') { for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { g.fillStyle = j ? '#8a7a5a' : col; g.fillRect(14 + i * 15, 42 - j * 12, 13, 11); } g.fillStyle = metal; g.fillRect(58, 20, 3, 36); g.fillRect(40, 20, 21, 3); }
  else if (b === 'tradeport') { g.fillStyle = dk; g.fillRect(14, 44, 44, 12); g.strokeStyle = col; g.beginPath(); g.arc(36, 30, 14, 0, TAU); g.stroke(); g.beginPath(); g.ellipse(36, 30, 22, 6, -0.3, 0, TAU); g.stroke(); glow(36, 30, 8, col); }
  else if (b === 'bunker') { g.fillStyle = dk; g.beginPath(); g.arc(36, 56, 22, Math.PI, 0); g.fill(); g.fillStyle = metal; g.beginPath(); g.arc(36, 56, 14, Math.PI, 0); g.fill(); g.fillStyle = '#ff6b6b'; g.fillRect(30, 46, 12, 3); }
  else if (b === 'forge') { g.fillStyle = dk; g.fillRect(16, 32, 40, 24); g.fillStyle = metal; g.fillRect(22, 18, 6, 14); g.fillRect(44, 22, 6, 10); glow(36, 46, 16, '#ff8a3d'); g.fillStyle = '#ffd35a'; g.fillRect(28, 42, 16, 6); }
  else if (b === 'scoutpost') { g.strokeStyle = metal; g.beginPath(); g.moveTo(36, 56); g.lineTo(36, 28); g.stroke(); g.strokeStyle = col; g.beginPath(); g.arc(36, 28, 16, -2.6, -0.5); g.stroke(); for (let i = 1; i <= 3; i++) { g.strokeStyle = hexA(col, 0.7 - i * 0.18); g.beginPath(); g.arc(36, 28, 16 + i * 6, -2.2, -0.9); g.stroke(); } }
  else { g.fillStyle = col; g.fillRect(24, 30, 24, 26); }
  // window lights
  g.fillStyle = 'rgba(255,233,168,0.85)'; for (let i = 0; i < 3; i++) g.fillRect(10 + i * 24 + (b.length % 5), 60, 3, 2);
  return c;
};
Rd.buildingImg = b => { const u = Rd.imgURL('building', b); return u ? `<img class="bart" alt="" src="${u}">` : ''; };

// =====================================================================================
// J / K / Y: map effects — engine trails, warp flashes, capture waves (capped)
// =====================================================================================
const FX = Rd.mapFx = [];
Rd.addFx = function (fx) {
  const cap = E.Q().fxCap;
  if (FX.length >= cap) { Rd.gstats.fxDropped++; if (fx.k !== 'capture') return false; FX.shift(); }
  fx.t0 = performance.now() / 1000; FX.push(fx); if (fx.k === 'warp') Rd.gstats.warps = (Rd.gstats.warps || 0) + 1; return true;
};
const TRAILS = Rd._trails = new Map(), MOVING = new Map(), OWN = { map: null, st: null };
let trackAt = 0;
Rd.trackMap = function (st, now) {
  // runs ~10×/s: fleet trails, depart/arrive flashes, capture detection
  if (now - trackAt < 0.1) return; trackAt = now;
  const Q = E.Q(), seen = new Set();
  for (const f of st.fleets) {
    if (!E.fleetVisible(f)) continue;
    const mv = f.path.length > 0; seen.add(f.id);
    const was = MOVING.get(f.id);
    if (mv) {
      const p = Rd.fleetPos(f);
      if (was === false || (was === undefined && trackAt > 1 && !TRAILS.has(f.id))) Rd.addFx({ k: 'warp', x: st.systems[f.sys].x, y: st.systems[f.sys].y, c: E.FACTIONS[f.owner].color, d: 0.6 });
      if (Q.trails) { let tr = TRAILS.get(f.id); if (!tr) { tr = []; TRAILS.set(f.id, tr); } tr.push(p.x, p.y); if (tr.length > 28) tr.splice(0, 2); }
    } else {
      if (was === true) { Rd.addFx({ k: 'warp', x: st.systems[f.sys].x, y: st.systems[f.sys].y, c: E.FACTIONS[f.owner].color, d: 0.6, arrive: true }); TRAILS.delete(f.id); }
    }
    MOVING.set(f.id, mv);
  }
  for (const id of [...MOVING.keys()]) if (!seen.has(id)) { MOVING.delete(id); TRAILS.delete(id); }
  // K: capture detection (owner changes since the last scan)
  if (OWN.st !== st) { OWN.st = st; OWN.map = st.planets.map(p => p.owner); return; }
  st.planets.forEach((p, i) => {
    const prev = OWN.map[i];
    if (prev !== p.owner) {
      OWN.map[i] = p.owner;
      if (p.owner === 'neutral' && prev === 'neutral') return;
      const s = st.systems[p.sys];
      Rd.addFx({ k: 'capture', x: s.x, y: s.y, c: E.FACTIONS[p.owner].color, d: 2.6 });
      Rd.gstats.captures = (Rd.gstats.captures || 0) + 1;
      if (p.owner === 'player' || prev === 'player' || E.isAlly(p.owner) || E.isAlly(prev)) Rd.captureBanner(p, prev);
      E.audio && E.audio.play && E.audio.play('capture');
    }
  });
};
Rd.captureBanner = function (p, prev) {
  const el = document.getElementById('capBanner'); if (!el || (E.state && E.state._ff)) return;
  const o = p.owner, F = E.FACTIONS[o], mine = o === 'player';
  el.style.setProperty('--c', F.color);
  el.innerHTML = `${Rd.bannerImg(o)}<div><div class="cb-k">${mine ? 'WORLD CAPTURED' : prev === 'player' ? 'WORLD LOST' : 'WORLD TAKEN'}</div><div class="cb-t">${p.name}</div><div class="cb-s">now held by ${F.name}</div></div>`;
  el.classList.remove('hidden', 'out'); void el.offsetWidth; el.classList.add('in');
  clearTimeout(Rd._cbT); Rd._cbT = setTimeout(() => { el.classList.add('out'); setTimeout(() => el.classList.add('hidden'), 600); }, 3200);
  Rd.lastCapture = { name: p.name, owner: o, at: performance.now() };
};
Rd.drawTrails = function (ctx, ws, inView, lod) {
  if (!E.Q().trails || lod === 2) return;
  const st = E.state; let n = 0;
  for (const f of st.fleets) {
    const tr = TRAILS.get(f.id); if (!tr || tr.length < 4 || !f.path.length) continue;
    const p = Rd.fleetPos(f), [hx, hy] = ws(p.x, p.y); if (!inView(hx, hy, 200)) continue;
    const col = E.FACTIONS[f.owner].color, L = tr.length / 2;
    ctx.lineCap = 'round';
    for (let i = 1; i < L; i++) {
      const [x1, y1] = ws(tr[(i - 1) * 2], tr[(i - 1) * 2 + 1]), [x2, y2] = ws(tr[i * 2], tr[i * 2 + 1]);
      ctx.strokeStyle = hexA(col, (i / L) * 0.55); ctx.lineWidth = 1 + (i / L) * 3; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    const [lx, ly] = ws(tr[tr.length - 2], tr[tr.length - 1]); ctx.strokeStyle = hexA(col, 0.6); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(hx, hy); ctx.stroke();
    n++;
  }
  Rd.gstats.trails = n;
};
Rd.drawMapFx = function (ctx, ws, inView, z) {
  const now = performance.now() / 1000; let n = 0;
  for (let i = FX.length - 1; i >= 0; i--) {
    const fx = FX[i], u = (now - fx.t0) / fx.d; if (u >= 1) { FX.splice(i, 1); continue; }
    const [x, y] = ws(fx.x, fx.y); if (!inView(x, y, 260 * z + 40)) continue; n++;
    if (fx.k === 'warp') {
      const r = (8 + 26 * u) * Math.max(0.6, z);
      ctx.drawImage(Rd.glowSprite(fx.c, 0.9), x - r, y - r, r * 2, r * 2);
      ctx.strokeStyle = 'rgba(255,255,255,' + (1 - u) + ')'; ctx.lineWidth = 2;
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + (fx.arrive ? 0.3 : 0), r1 = r * (fx.arrive ? 1.4 - u : 0.4 + u), r2 = r1 + 8 * (1 - u); ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); ctx.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2); ctx.stroke(); }
    } else if (fx.k === 'capture') {
      for (let k = 0; k < 3; k++) {
        const v = u * 1.4 - k * 0.2; if (v <= 0 || v >= 1) continue;
        const r = v * 170 * z + 10;
        ctx.strokeStyle = hexA(fx.c, (1 - v) * 0.9); ctx.lineWidth = 3 + 6 * (1 - v); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
        ctx.fillStyle = hexA(fx.c, (1 - v) * 0.12); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      }
      const fl = 1 - u; ctx.drawImage(Rd.glowSprite(fx.c, 0.9), x - 40 * fl * Math.max(z, 0.5), y - 40 * fl * Math.max(z, 0.5), 80 * fl * Math.max(z, 0.5), 80 * fl * Math.max(z, 0.5));
    }
  }
  Rd.gstats.fx = n;
};

// =====================================================================================
// G / T: extra detail when zoomed in — moons, stations, turrets, docked fleets
// =====================================================================================
Rd.mapDetail = function (ctx, x, y, pr, p, here, time, z) {
  // v2.6 item 4: no rotating moons, rings, or orbiting stations at zoomed-in LOD.
  // Docked fleet triangles still sit beside the disc (they do not orbit).
  if (z < 1.05) return; let n = 0;
  let k = 0;
  for (const f of here) { if (k >= 3) break; if (!f.ships || !f.ships.length) continue; const col = (E.factionOf ? E.factionOf(f.owner) : E.FACTIONS[f.owner] || { color: '#8899aa' }).color; Rd.fleetTri(ctx, x - pr * 1.9, y + pr * (0.9 + k * 0.7) - pr * 0.6, Math.max(4, Math.min(9, pr * 0.32)), 0, col); k++; n++; }
  Rd.gstats.detail = (Rd.gstats.detail || 0) + n;
};
// ---------- v2.1 item 11: cached, simplified zoomed-out (fit) view ----------
// At the far LOD the static map — lanes, owner-coloured system dots, your rings, capitals, front-line rings — is drawn
// ONCE into a world-space bitmap at the current zoom and then just blitted (pans are free). It is rebuilt only when
// ownership / the front line changes (checked twice a second) or the zoom moves more than ~18% from the build zoom.
const FIT = Rd._fit = { c: null, sig: '', z: 0, at: -1, dpr: 0, builds: 0, hits: 0, f: 1, x0: 0, y0: 0 };
function fitSig(st) {
  let s = terrSig(st) + '|';
  for (const sy of st.systems) { if (sy.rift) continue; const p = st.planets[sy.planetId]; if (p.owner !== 'player' && p.owner !== 'neutral' && E.isFrontLine('player', sy.id)) s += sy.id + ','; }
  return s + '|' + E.effQuality() + '|' + st.emp.player.home;
}
Rd.drawFitLayer = function (ctx, w, h, z, ox, oy, now) {
  const st = E.state, dpr = ctx.getTransform().a || 1;
  if (now - FIT.at > 0.5 || !FIT.c) { FIT.at = now; FIT.cur = fitSig(st); }
  const zr = FIT.z ? z / FIT.z : 0;
  if (!FIT.c || FIT.cur !== FIT.sig || zr < 0.85 || zr > 1.18 || FIT.dpr !== dpr) {
    FIT.sig = FIT.cur; FIT.z = z; FIT.dpr = dpr; FIT.builds++;
    let f = z * dpr; const PAD = 60, x0 = -PAD, y0 = -PAD, W0 = st.world.w + PAD * 2, H0 = st.world.h + PAD * 2;
    f = Math.min(f, 4096 / W0, 4096 / H0); FIT.f = f; FIT.x0 = x0; FIT.y0 = y0;
    const cw = Math.max(1, Math.ceil(W0 * f)), ch = Math.max(1, Math.ceil(H0 * f));
    if (!FIT.c || FIT.c.width !== cw || FIT.c.height !== ch) FIT.c = mk(cw, ch);
    const g = FIT.c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cw, ch);
    const k = f / dpr; // css px per world unit inside the cache = the zoom it was built at
    g.setTransform(f, 0, 0, f, -x0 * f, -y0 * f);
    // thin empire borders: union of soft discs per owner, interior faint, 1.3 css-px rim (drawn on a scratch layer)
    if (!Rd.NO_FIT_TERR) {
      const tmp = FIT.tmp && FIT.tmp.width === cw && FIT.tmp.height === ch ? FIT.tmp : (FIT.tmp = mk(cw, ch)), tg = tmp.getContext('2d');
      const Rt = Math.max(85, 8 / k), rimW = 1.3 / k, by = {};
      for (const sy of st.systems) { if (sy.rift) continue; const p = st.planets[sy.planetId]; if (p.owner === 'neutral' || !E.FACTIONS[p.owner]) continue; (by[p.owner] = by[p.owner] || []).push(sy); }
      for (const o in by) {
        tg.setTransform(1, 0, 0, 1, 0, 0); tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, cw, ch); tg.setTransform(f, 0, 0, f, -x0 * f, -y0 * f);
        tg.fillStyle = E.FACTIONS[o].color; tg.beginPath(); for (const sy of by[o]) { tg.moveTo(sy.x + Rt, sy.y); tg.arc(sy.x, sy.y, Rt, 0, TAU); } tg.fill();
        tg.globalCompositeOperation = 'destination-out'; tg.fillStyle = 'rgba(0,0,0,0.8)'; tg.beginPath(); for (const sy of by[o]) { tg.moveTo(sy.x + Rt - rimW, sy.y); tg.arc(sy.x, sy.y, Rt - rimW, 0, TAU); } tg.fill();
        g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 0.6; g.drawImage(tmp, 0, 0); g.restore();
      }
      tg.globalCompositeOperation = 'source-over';
    }
    // lanes: one batched path, thin
    g.lineWidth = Math.max(0.7, 1.2 * z) / k; g.strokeStyle = 'rgba(140,170,220,0.2)'; g.beginPath();
    const rift = [];
    for (const [a, b] of st.lanes) { const A = st.systems[a], B = st.systems[b]; if (A.rift || B.rift) { rift.push(A, B); continue; } g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); }
    g.stroke();
    if (rift.length) { g.strokeStyle = 'rgba(125,255,107,0.35)'; g.beginPath(); for (let i = 0; i < rift.length; i += 2) { g.moveTo(rift[i].x, rift[i].y); g.lineTo(rift[i + 1].x, rift[i + 1].y); } g.stroke(); }
    const rr = Math.max(3, 9 * z + 1.5) / k, homeId = st.emp.player.home;
    // dots batched per colour
    const byC = {};
    for (const sy of st.systems) { if (sy.rift) continue; const p = st.planets[sy.planetId], c = p.owner === 'neutral' ? '#6f7a8c' : E.FACTIONS[p.owner].color; (byC[c] = byC[c] || []).push(sy); }
    for (const c in byC) { g.fillStyle = c; g.beginPath(); for (const sy of byC[c]) { g.moveTo(sy.x + rr, sy.y); g.arc(sy.x, sy.y, rr, 0, TAU); } g.fill(); }
    g.strokeStyle = '#fff'; g.lineWidth = 1.2 / k; g.beginPath();
    for (const sy of st.systems) { if (sy.rift) continue; const p = st.planets[sy.planetId]; if (p.owner === 'player') { g.moveTo(sy.x + rr + 2 / k, sy.y); g.arc(sy.x, sy.y, rr + 2 / k, 0, TAU); } }
    g.stroke();
    // front-line rings (static dashes in the cached view)
    g.setLineDash([5 / k, 4 / k]); g.strokeStyle = 'rgba(255,140,70,0.8)'; g.lineWidth = 1.6 / k; g.beginPath();
    for (const sy of st.systems) { if (sy.rift) continue; const p = st.planets[sy.planetId]; if (p.owner !== 'player' && p.owner !== 'neutral' && E.isFrontLine('player', sy.id)) { const fr = rr + 9 / k; g.moveTo(sy.x + fr, sy.y); g.arc(sy.x, sy.y, fr, 0, TAU); } }
    g.stroke(); g.setLineDash([]);
    // capitals: your gold star, rival capitals a small crown dot
    const hs = st.systems[st.planets[homeId].sys];
    if (hs && st.planets[homeId].owner === 'player') { g.fillStyle = '#ffe066'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = (i % 2 ? 2.2 : 5) / k; g.lineTo(hs.x + rr + 4 / k + Math.cos(a) * r, hs.y - rr - 4 / k + Math.sin(a) * r); } g.closePath(); g.fill(); }
    for (const o in st.emp) { if (o === 'player' || !st.emp[o] || st.emp[o].home == null) continue; const q = st.planets[st.emp[o].home]; if (!q || q.owner !== o) continue; const sy = st.systems[q.sys]; g.strokeStyle = '#fff'; g.lineWidth = 1 / k; g.beginPath(); g.arc(sy.x, sy.y, rr + 3.5 / k, 0, TAU); g.stroke(); }
  } else FIT.hits++;
  // blit with the current zoom/pan (k = scale from cache px to css px)
  const k = z / FIT.f;
  const dx = ox + FIT.x0 * z, dy = oy + FIT.y0 * z;
  ctx.drawImage(FIT.c, dx, dy, FIT.c.width * k, FIT.c.height * k);
  return true;
};
Rd.dominantHull = function (f) { const c = {}; let best = 'fighter', bn = 0; for (const s of f.ships) { c[s.h] = (c[s.h] || 0) + 1; if (c[s.h] > bn) { bn = c[s.h]; best = s.h; } } return best; };
})();

// =====================================================================================
// v2.0 part 2: planet close-up, camera zoom, battle status card, replay viewer, title, photo mode, UI polish
// =====================================================================================
(function () {
const E = window.EOG, Rd = E.render;
const TAU = Math.PI * 2, hexA = Rd.hexA;
const $ = s => document.querySelector(s);
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

// ---------- B / C / U / T: detailed animated planet (only the open planet animates) ----------
function hash3(x, y, z, s) { let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vnoise(x, y, z, s) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(hash3(xi, yi, zi, s), hash3(xi + 1, yi, zi, s), u), L(hash3(xi, yi + 1, zi, s), hash3(xi + 1, yi + 1, zi, s), u), v),
    L(L(hash3(xi, yi, zi + 1, s), hash3(xi + 1, yi, zi + 1, s), u), L(hash3(xi, yi + 1, zi + 1, s), hash3(xi + 1, yi + 1, zi + 1, s), u), v), w);
}
function fbm(x, y, z, s, oct) { let a = 0, amp = 0.5, f = 1, n = 0; for (let i = 0; i < (oct || 4); i++) { a += amp * vnoise(x * f, y * f, z * f, s + i * 17); n += amp; amp *= 0.5; f *= 2.03; } return a / n; }
const TEX = new Map();
Rd.planetTexture = function (type, seed) {
  const key = type + '|' + seed; if (TEX.has(key)) return TEX.get(key);
  const W = 192, H = 96, col = new Uint8ClampedArray(W * H * 3), emi = new Uint8ClampedArray(W * H * 3), city = new Uint8Array(W * H), cloud = new Uint8Array(W * H);
  const T = E.PLANET_TYPES[type]; const base = [parseInt(T.color.slice(1, 3), 16), parseInt(T.color.slice(3, 5), 16), parseInt(T.color.slice(5, 7), 16)];
  const R = E.mulberry(seed * 31 + type.length);
  const craters = []; if (type === 'barren' || type === 'ice') for (let i = 0; i < 26; i++) craters.push([R() * TAU, (R() - 0.5) * 2.6, 0.05 + R() * 0.18]);
  const storm = [R() * TAU, (R() - 0.5) * 1.2];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const lon = x / W * TAU, lat = (y / H - 0.5) * Math.PI, cl = Math.cos(lat);
    const px = cl * Math.cos(lon), py = Math.sin(lat), pz = cl * Math.sin(lon), i = y * W + x, o = i * 3;
    let r = base[0], g = base[1], b = base[2], er = 0, eg = 0, eb = 0, cc = 0;
    if (type === 'garden') {
      const h = fbm(px * 2.2 + 3, py * 2.2, pz * 2.2, seed, 5);
      if (h < 0.5) { const d = h / 0.5; r = 12 + 30 * d; g = 40 + 70 * d; b = 90 + 90 * d; }
      else { const e = (h - 0.5) / 0.5; r = 60 + 120 * e; g = 140 - 30 * e + 40 * (1 - e); b = 50 + 30 * e; if (e > 0.55) { r = g = b = 200 + 50 * (e - 0.55); } city[i] = hash3(x, y, 1, seed) < 0.06 ? 1 : 0; }
      if (Math.abs(lat) > 1.2 + 0.15 * fbm(px * 4, py * 4, pz * 4, seed + 3, 2)) { r = 235; g = 245; b = 255; city[i] = 0; }
      const c = fbm(px * 3.2, py * 3.2 + 9, pz * 3.2, seed + 50, 4); cc = c > 0.52 ? Math.min(1, (c - 0.52) * 4) : 0;
    } else if (type === 'ice') {
      const h = fbm(px * 2.5, py * 2.5, pz * 2.5, seed, 4); r = 200 + 50 * h; g = 225 + 30 * h; b = 245;
      const cr = Math.abs(fbm(px * 5, py * 5, pz * 5, seed + 7, 3) - 0.5); if (cr < 0.02) { r = 90; g = 150; b = 200; }
      for (const [cl2, ca, cs] of craters) { const d = Math.hypot(lon - cl2, lat - ca); if (d < cs) { r *= 0.88; g *= 0.92; } }
      city[i] = h > 0.55 && hash3(x, y, 2, seed) < 0.03 ? 1 : 0;
      const c = fbm(px * 2.5, py * 6, pz * 2.5, seed + 60, 3); cc = c > 0.6 ? (c - 0.6) * 2 : 0;
    } else if (type === 'gas') {
      const t = fbm(px * 2, py * 2, pz * 2, seed, 3), band = Math.sin(lat * 14 + t * 4) * 0.5 + 0.5;
      r = base[0] * (0.6 + 0.5 * band); g = base[1] * (0.55 + 0.5 * band); b = base[2] * (0.7 + 0.35 * band);
      let dl = lon - storm[0]; if (dl > Math.PI) dl -= TAU; if (dl < -Math.PI) dl += TAU; const sd = Math.hypot(dl / 0.5, (lat - storm[1]) / 0.22);
      if (sd < 1) { const sw = 1 - sd; r = r * (1 - sw) + 240 * sw; g = g * (1 - sw) + 170 * sw; b = b * (1 - sw) + 140 * sw; }
    } else if (type === 'lava') {
      const h = fbm(px * 2.4, py * 2.4, pz * 2.4, seed, 4); r = 40 + 40 * h; g = 22 + 18 * h; b = 18 + 10 * h;
      const cr = Math.abs(fbm(px * 4, py * 4, pz * 4, seed + 5, 4) - 0.5);
      if (cr < 0.04) { const k = 1 - cr / 0.04; er = 255 * k; eg = 140 * k; eb = 30 * k; r += 120 * k; g += 50 * k; }
      if (h < 0.36) { const k = (0.36 - h) / 0.36; er = Math.max(er, 255 * (0.5 + k)); eg = Math.max(eg, 80 + 90 * k); eb = 20; r = 200; g = 70 + 60 * k; b = 20; }
      city[i] = h > 0.5 && hash3(x, y, 3, seed) < 0.05 ? 1 : 0; // forge lights (Shipwright foundries)
      const c = fbm(px * 3, py * 3, pz * 3, seed + 70, 3); cc = c > 0.58 ? -(c - 0.58) * 3 : 0; // negative = dark ash
    } else { // barren
      const h = fbm(px * 3, py * 3, pz * 3, seed, 5); r = base[0] * (0.6 + 0.6 * h); g = base[1] * (0.6 + 0.6 * h); b = base[2] * (0.6 + 0.6 * h);
      for (const [cl2, ca, cs] of craters) { let dl = lon - cl2; if (dl > Math.PI) dl -= TAU; if (dl < -Math.PI) dl += TAU; const d = Math.hypot(dl * Math.cos(lat), lat - ca); if (d < cs) { const k = d / cs; const f = k > 0.8 ? 1.25 : 0.7 + 0.2 * k; r *= f; g *= f; b *= f; } }
      city[i] = hash3(x, y, 4, seed) < 0.025 ? 1 : 0;
    }
    col[o] = r; col[o + 1] = g; col[o + 2] = b; emi[o] = er; emi[o + 1] = eg; emi[o + 2] = eb; cloud[i] = cc > 0 ? Math.min(255, cc * 255) : cc < 0 ? 128 + Math.min(127, -cc * 127) | 0 : 0;
    if (cc < 0) cloud[i] = 0, col[o] *= 0.6, col[o + 1] *= 0.6, col[o + 2] *= 0.6; // ash shadow baked in
  }
  const tex = { W, H, col, emi, city, cloud, type };
  TEX.set(key, tex); if (TEX.size > 12) TEX.delete(TEX.keys().next().value);
  return tex;
};
const ATMO = { garden: '#7fc8ff', ice: '#cfefff', gas: '#c9a3ff', lava: '#ff6a3d', barren: '#c8b89a' };
const PV = Rd.PV = { p: null, cv: null, ctx: null, lut: null, R: 0, img: null, off: null, last: 0, frames: 0 };
function buildLut(R) {
  const S = R * 2, n = []; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const nx = (x + 0.5 - R) / R, ny = (y + 0.5 - R) / R, d2 = nx * nx + ny * ny; if (d2 > 1) continue;
    const nz = Math.sqrt(1 - d2); n.push(y * S + x, nx, ny, nz, (Math.atan2(nx, nz) / TAU + 0.5), (Math.asin(ny) / Math.PI + 0.5));
  }
  return Float32Array.from(n);
}
Rd.planetViewOpen = function (p) {
  const box = $('#pview'); if (!box) return;
  if (!p) { box.classList.add('hidden'); PV.p = null; document.body.classList.remove('pv-on'); return; }
  box.classList.remove('hidden'); document.body.classList.add('pv-on');
  PV.cv = $('#pvcanvas'); PV.ctx = PV.cv.getContext('2d');
  const dpr = Math.min(Rd.dpr || 1, 2), cssW = 120, cssH = 104;
  if (PV.cv.width !== Math.round(cssW * dpr) || PV.cv.height !== Math.round(cssH * dpr)) { PV.cv.width = Math.round(cssW * dpr); PV.cv.height = Math.round(cssH * dpr); PV.cv.style.width = cssW + 'px'; PV.cv.style.height = cssH + 'px'; }
  const R = Math.round(cssH * 0.4 * dpr * E.Q().planetScale);
  if (PV.R !== R) { PV.R = R; PV.lut = buildLut(R); PV.off = mk(R * 2, R * 2); PV.img = PV.off.getContext('2d').createImageData(R * 2, R * 2); }
  if (PV.p !== p) { PV.p = p; PV.tex = Rd.planetTexture(p.type, p.id + 1); PV.t0 = performance.now() / 1000; }
  const T = E.PLANET_TYPES[p.type], cap = $('#pvcap');
  if (cap) cap.innerHTML = `<b>${T.name}</b>${T.tag ? ' · ' + T.tag : ''}<br><span class="muted">✛ ${p.def.turret} turret${p.def.turret === 1 ? '' : 's'} · ⬢ ${p.def.station} station${p.def.station === 1 ? '' : 's'}${p.shieldHp > 0 ? ' · shield up' : ''}</span>`;
  PV.last = 0; Rd.renderPlanetView(performance.now() / 1000, true);
  if (E.ui && E.ui.renderBuildQueueMini) E.ui.renderBuildQueueMini(p);
};
Rd.renderPlanetView = function (now, force) {
  if (!PV.p || !PV.cv) return;
  const Q = E.Q(); if (!force && now - PV.last < 1 / Q.planetFps) return; PV.last = now; PV.frames++; Rd.gstats.planetFrames = PV.frames;
  const p = PV.p, tex = PV.tex, R = PV.R, S = R * 2, lut = PV.lut, buf = new Uint32Array(PV.img.data.buffer), W = tex.W, H = tex.H;
  const t = now - PV.t0, rot = t * 0.035, crot = t * 0.05, owned = p.owner !== 'neutral';
  // v2.6 item 2: no day/night shadow on the planet-card graphic — even, front lighting.
  const lx = -0.25, ly = -0.35, lz = 0.9;
  PV.daySide = 'day';
  buf.fill(0);
  for (let k = 0; k < lut.length; k += 6) {
    const nx = lut[k + 1], ny = lut[k + 2], nz = lut[k + 3];
    const v = Math.min(H - 1, (lut[k + 5] * H) | 0); let u = ((lut[k + 4] + rot) % 1) * W | 0; if (u >= W) u -= W;
    const ti = v * W + u, o = ti * 3;
    const d = Math.max(0.35, nx * lx + ny * ly + nz * lz), day = 1, night = 0;
    let r = tex.col[o], g = tex.col[o + 1], b = tex.col[o + 2];
    let cu = ((lut[k + 4] + crot) % 1) * W | 0; if (cu >= W) cu -= W; const ca = tex.cloud[v * W + cu] / 255;
    if (ca > 0) { r += (255 - r) * ca * 0.85; g += (255 - g) * ca * 0.85; b += (255 - b) * ca * 0.85; }
    const lit = 0.07 + day * 0.98;
    r = r * lit * 1.02 + 6 * night; g = g * lit * 0.99 + 9 * night; b = b * lit * 0.94 + 22 * night; // warm day / cool night tint
    // v2.6: no terminator / night shadow on the planet card
    const nf = night * night;
    r += tex.emi[o] * (0.35 + 0.65 * nf); g += tex.emi[o + 1] * (0.35 + 0.65 * nf); b += tex.emi[o + 2] * (0.35 + 0.65 * nf);
    if (owned && tex.city[ti] && ca < 0.4) { r += 255 * nf; g += 210 * nf; b += 120 * nf; } // city lights on the night side
    const limb = 0.55 + 0.45 * nz; r *= limb; g *= limb; b *= limb;
    buf[lut[k]] = (255 << 24) | (Math.min(255, b) << 16) | (Math.min(255, g) << 8) | Math.min(255, r);
  }
  PV.off.getContext('2d').putImageData(PV.img, 0, 0);
  const c = PV.ctx, cw = PV.cv.width, ch = PV.cv.height, cx = cw / 2, cy = ch / 2, atm = ATMO[p.type] || '#9fd0ff';
  c.clearRect(0, 0, cw, ch);
  // stations behind the planet (T)
  const st = p.def.station || 0, drawStation = (a, front) => { const sx = cx + Math.cos(a) * R * 1.75, sy = cy + Math.sin(a) * R * 0.42; if ((Math.sin(a) > 0) !== front) return; c.fillStyle = '#a8b8d0'; c.strokeStyle = E.FACTIONS[p.owner].color; c.lineWidth = Math.max(1, R * 0.03); c.beginPath(); for (let k = 0; k < 6; k++) { const b = k / 6 * TAU + t; c.lineTo(sx + Math.cos(b) * R * 0.13, sy + Math.sin(b) * R * 0.13); } c.closePath(); c.fill(); c.stroke(); c.fillStyle = 'rgba(255,233,168,' + (0.5 + 0.5 * Math.sin(t * 4 + a)) + ')'; c.fillRect(sx - 1, sy - 1, 2, 2); };
  for (let i = 0; i < st; i++) drawStation(t * 0.4 + i * Math.PI, false);
  const ag = c.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.35); ag.addColorStop(0, hexA(atm, 0.55)); ag.addColorStop(1, hexA(atm, 0)); c.fillStyle = ag; c.beginPath(); c.arc(cx, cy, R * 1.35, 0, TAU); c.fill();
  c.drawImage(PV.off, cx - R, cy - R);
  // lit-side rim glow
  const rg = c.createRadialGradient(cx + lx * R * 0.5, cy + ly * R * 0.5, R * 0.6, cx, cy, R * 1.05); rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(0.85, 'rgba(0,0,0,0)'); rg.addColorStop(1, hexA(atm, 0.5)); c.fillStyle = rg; c.beginPath(); c.arc(cx, cy, R * 1.04, 0, TAU); c.fill();
  // turrets on the limb (T)
  const nt = Math.min(12, p.def.turret || 0);
  for (let i = 0; i < nt; i++) { const a = -Math.PI + (i + 0.5) / nt * Math.PI, tx = cx + Math.cos(a) * R, ty = cy + Math.sin(a) * R; c.fillStyle = '#c9d6e8'; c.beginPath(); c.arc(tx, ty, Math.max(1.5, R * 0.06), Math.PI + a - Math.PI / 2 - 1.2, Math.PI + a - Math.PI / 2 + 1.2 + Math.PI); c.fill(); c.strokeStyle = '#c9d6e8'; c.lineWidth = Math.max(1, R * 0.025); c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx + Math.cos(a) * R * 0.14, ty + Math.sin(a) * R * 0.14); c.stroke(); if ((t * 2 + i) % 3 < 0.3) { c.fillStyle = '#ff5050'; c.fillRect(tx - 1, ty - 1, 2, 2); } }
  for (let i = 0; i < st; i++) drawStation(t * 0.4 + i * Math.PI, true);
  if (p.shieldHp > 0) { c.strokeStyle = 'rgba(127,216,255,' + (0.25 + 0.15 * Math.sin(t * 3)) + ')'; c.lineWidth = Math.max(1.5, R * 0.05); c.beginPath(); c.arc(cx, cy, R * 1.22, 0, TAU); c.stroke(); }
  // owner emblem + day/night chip
  if (owned) { const em = Rd.banner(p.owner); c.drawImage(em, cw - 30 * (cw / 360) - 8, 6, 24 * (cw / 360), 32 * (cw / 360)); }
};

// ---------- B / G: camera zooms into the tapped planet; closing zooms back out ----------
Rd.camAnim = null; Rd.preZoom = null;
function ease(u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; }
Rd.camTo = function (to, d) { const c = Rd.cam; Rd.camAnim = { from: { x: c.x, y: c.y, z: c.z }, to, t0: performance.now() / 1000, d: d || 0.5 }; };
Rd.applyCamAnim = function (now) {
  const a = Rd.camAnim; if (!a) return; const u = Math.min(1, (now - a.t0) / a.d), e = ease(u), c = Rd.cam;
  c.x = a.from.x + (a.to.x - a.from.x) * e; c.y = a.from.y + (a.to.y - a.from.y) * e; c.z = a.from.z + (a.to.z - a.from.z) * e;
  if (u >= 1) Rd.camAnim = null;
};
Rd.ZOOM_IN = 1.6;
// v2.1 item 1: tapping a planet no longer zooms or moves the camera — it still selects the planet and opens its
// panel, and the animated close-up art shows INSIDE the panel instead (Rd.planetViewOpen).
Rd.CAMERA_ON_OPEN = false;
Rd.sheetChanged = function () {
  const U = E.ui, st = E.state; if (!st || !U) return;
  const sh = U.sheet, sys = sh && sh.type === 'system' ? sh.sys : null, s = sys != null ? st.systems[sys] : null;
  if (s && !s.rift) { Rd.planetViewOpen(st.planets[s.planetId]); Rd.zoomedSys = null; }
  else { Rd.planetViewOpen(null); Rd.zoomedSys = null; Rd.preZoom = null; }
};

// ---------- H: live battle view = static status card (no animation) ----------
Rd.drawBattleStatus = function (ctx, W, H, b, time) {
  ctx.setTransform(Rd.dpr, 0, 0, Rd.dpr, 0, 0);
  const w = W / Rd.dpr, h = H / Rd.dpr;
  Rd.drawBackdrop(ctx, w, h, { x: 0, y: 0, z: 1 }, 0);
  const st = E.state, n = [{}, {}], cnt = [0, 0];
  for (const u of b.units) { const k = u.kind === 'ship' ? u.h : u.kind; n[u.side][k] = (n[u.side][k] || 0) + 1; cnt[u.side]++; }
  const p0 = E.sidePower(b, 0), p1 = E.sidePower(b, 1), tot = Math.max(1, p0 + p1);
  const cx = w / 2, top = Math.max(150, h * 0.22), bw = Math.min(340, w - 32);
  ctx.textAlign = 'center'; ctx.fillStyle = '#e8f3ff'; ctx.font = '700 18px system-ui, -apple-system, sans-serif';
  ctx.fillText('⚔ Battle at ' + st.systems[b.sys].name, cx, top);
  ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = '#9fb3cc';
  ctx.fillText(b.done ? 'Battle over — see the result card.' : 'Live status · numbers update as ships fall', cx, top + 20);
  ctx.fillText('After the battle: result card → "Battle animation simulation"', cx, top + 38);
  const by = top + 56;
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(cx - bw / 2, by, bw, 12);
  const c0 = E.FACTIONS[b.owners[0][0] || 'neutral'].color, c1 = E.FACTIONS[b.owners[1][0] || 'neutral'].color;
  ctx.fillStyle = c0; ctx.fillRect(cx - bw / 2, by, bw * p0 / tot, 12); ctx.fillStyle = c1; ctx.fillRect(cx - bw / 2 + bw * p0 / tot, by, bw * p1 / tot, 12);
  const col = (sd, x, al) => {
    const owners = b.owners[sd], c = E.FACTIONS[owners[0] || 'neutral'].color; let y = by + 40;
    if (owners[0]) ctx.drawImage(Rd.banner(owners[0]), al === 'left' ? x : x - 30, y - 8, 30, 40);
    ctx.textAlign = al; ctx.fillStyle = c; ctx.font = '700 14px system-ui, sans-serif';
    const tx = al === 'left' ? x + 36 : x - 36; ctx.fillText(owners.map(o => E.FACTIONS[o].short).join(' + '), tx, y + 6);
    ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#cfe0f5'; ctx.fillText(E.fmtN(cnt[sd]) + ' units', tx, y + 24); y += 50;
    for (const [k, v] of Object.entries(n[sd])) { const nm = E.HULLS[k] ? E.HULLS[k].name : k === 'turret' ? 'Turrets' : 'Stations'; ctx.fillText(E.fmtN(v) + ' × ' + nm, al === 'left' ? x : x, y); y += 17; }
  };
  col(0, cx - bw / 2, 'left'); col(1, cx + bw / 2, 'right');
  ctx.textAlign = 'left';
};

// ---------- I / V / Y: replay viewer ----------
const RP = Rd.RP = { on: false, out: null, job: null, t: 0, speed: 1, playing: false, fx: [], evI: 0, k: 0, cam: { x: 600, y: 350, z: 0.5 }, last: 0 };
Rd.openReplay = function (id) {
  const rec = E.getReplay(id), U = E.ui;
  if (!rec) { E.toast('Replay data is kept only for battles fought since the game was opened (last ' + E.REPLAY_KEEP + ').', 'warn'); return false; }
  const box = $('#replay'); box.classList.remove('hidden'); $('#rload').classList.remove('hidden'); $('#rhud').classList.add('hidden'); $('#rctl').classList.add('hidden');
  RP.on = true; RP.playing = false; RP.out = null; RP.fx = []; RP.t = 0; RP.k = 0; RP.evI = 0; RP.id = id;
  if (E.state && !E.state.paused) { RP.unpause = true; E.state.paused = true; } else RP.unpause = false;
  const cv = $('#rcanvas'), dpr = Math.min(Rd.dpr || 1, E.Q().dprCap); cv.width = Math.floor(innerWidth * dpr); cv.height = Math.floor(innerHeight * dpr); cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px'; RP.dpr = dpr;
  const job = RP.job = E.replayJob(rec, E.Q().replayFx), bar = $('#rload .rl-bar i'), sub = $('#rload .rl-s');
  const t0 = performance.now();
  // warm sprite caches while we build
  const combos = new Set(rec.units.filter(u => u.k === 'ship').map(u => u.h + '|' + u.owner + '|' + (u.bo ? 1 : 0)));
  for (const c of combos) { const [h, o, bo] = c.split('|'); Rd.shipSprite(h, E.FACTIONS[o].color, o, bo === '1'); }
  const tick = () => {
    if (!RP.on || RP.job !== job) return;
    job.step(25);
    bar.style.width = Math.round(job.progress * 100) + '%'; sub.textContent = Math.round(job.progress * 100) + '% · ' + rec.units.length + ' units · ' + rec.frames.length + ' snapshots';
    if (!job.done || performance.now() - t0 < 450) { setTimeout(tick, 16); return; }
    RP.out = job.out; RP.t = 0; RP.playing = true; RP.last = performance.now();
    $('#rload').classList.add('hidden'); $('#rhud').classList.remove('hidden'); $('#rctl').classList.remove('hidden');
    $('#rtitle').textContent = '▶ ' + rec.system + ' — battle animation simulation';
    fitCam(true); E.audio && E.audio.play && E.audio.play('alert');
  };
  setTimeout(tick, 16);
  return true;
};
Rd.closeReplay = function () { RP.on = false; RP.out = null; RP.job = null; RP.fx = []; $('#replay').classList.add('hidden'); if (RP.unpause && E.state) E.state.paused = false; RP.unpause = false; };
function frameAt(out, t) { const F = out.frames; let k = Math.min(RP.k, F.length - 1); if (k > 0 && F[k].t > t) k = 0; while (k < F.length - 1 && F[k + 1].t <= t) k++; RP.k = k; return k; }
function unitPos(out, k, i, t) {
  const F = out.frames, a = F[k], b = F[Math.min(k + 1, F.length - 1)];
  if (a.hp[i] < 0) return null;
  let x = a.pos[i * 2], y = a.pos[i * 2 + 1];
  if (b !== a && b.hp[i] >= 0) { const u = E.clamp((t - a.t) / Math.max(0.01, b.t - a.t), 0, 1); x += (b.pos[i * 2] - x) * u; y += (b.pos[i * 2 + 1] - y) * u; }
  return [x, y];
}
function fitCam(snap) {
  const out = RP.out; if (!out) return; const F = out.frames[RP.k], xs = [], ys = [];
  for (let i = 0; i < out.units.length; i++) if (F.hp[i] >= 0) { xs.push(F.pos[i * 2]); ys.push(F.pos[i * 2 + 1]); }
  if (!xs.length) return;
  xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
  const q = (A, f) => A[Math.min(A.length - 1, Math.max(0, Math.round((A.length - 1) * f)))];
  const x0 = q(xs, 0.06), x1 = q(xs, 0.94), y0 = q(ys, 0.06), y1 = q(ys, 0.94);
  const w = innerWidth, h = innerHeight - 170, z = E.clamp(Math.min(w / (x1 - x0 + 220), h / (y1 - y0 + 220)), 0.3, 1.3);
  const to = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z };
  if (snap) RP.cam = to; else { RP.cam.x += (to.x - RP.cam.x) * 0.04; RP.cam.y += (to.y - RP.cam.y) * 0.04; RP.cam.z += (to.z - RP.cam.z) * 0.03; }
}
let _boom = null; // W: explosion glow pre-rendered once
function boomSprite() { if (_boom) return _boom; _boom = mk(128, 128); const g = _boom.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.35, 'rgba(255,170,60,0.8)'); gr.addColorStop(1, 'rgba(255,60,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return _boom; }
function addRfx(fx, cap) { if (RP.fx.length >= cap) { Rd.gstats.fxDropped++; if (fx.k !== 'boom') return; RP.fx.shift(); } RP.fx.push(fx); }
Rd.replayTick = function () {
  if (!RP.on || !RP.out) return;
  const now = performance.now(), dt = Math.min(0.1, (now - RP.last) / 1000); RP.last = now;
  const out = RP.out, Q = E.Q(), cap = Math.round(Q.fxCap * (0.5 + out.scale * 0.5)) * 2;
  const dur = out.dur - out.t0;
  if (RP.playing) { RP.t = Math.min(dur, RP.t + dt * RP.speed); if (RP.t >= dur) { RP.playing = false; $('#rPlay').textContent = '↺'; } }
  const t = out.t0 + RP.t, k = frameAt(out, t);
  // spawn fx for events up to t
  while (RP.evI < out.events.length && out.events[RP.evI].t <= t) {
    const e = out.events[RP.evI++]; if (t - e.t > 0.6) continue; // skipped while seeking
    const pa = e.a != null ? unitPos(out, k, e.a, e.t) : null, pb = unitPos(out, k, e.b, e.t) || (e.x != null ? [e.x, e.y] : null);
    if (!pb) continue;
    const ua = e.a != null ? out.units[e.a] : null, col = ua ? E.FACTIONS[ua.owner].color : '#fff';
    if (e.k === 'boom') { addRfx({ k: 'boom', x: pb[0], y: pb[1], r: e.r * (out.scale < 1 ? 1.2 : 1), life: 0.9, max: 0.9 }, cap); const nd = Math.round((6 + e.r / 4) * Q.replayFx * out.scale); for (let d = 0; d < nd; d++) { const a = Math.random() * TAU, sp = 30 + Math.random() * 90; addRfx({ k: 'debris', x: pb[0], y: pb[1], vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.2, max: 1.2, c: Math.random() < 0.4 ? '#ffb454' : '#8a96ad' }, cap); } if (E.audio) E.audio.play('boom'); continue; }
    if (e.k === 'hit') { addRfx({ k: 'shield', b: e.b, life: 0.3, max: 0.3 }, cap); continue; }
    if (!pa) continue;
    if (e.k === 'missile') addRfx({ k: 'missile', a: pa, b: pb, bi: e.b, life: 0.7, max: 0.7, c: col, curve: (Math.random() - 0.5) * 120 }, cap);
    else addRfx({ k: e.k, a: pa, b: pb, life: e.k === 'rail' ? 0.45 : e.k === 'beam' ? 0.3 : 0.16, max: e.k === 'rail' ? 0.45 : e.k === 'beam' ? 0.3 : 0.16, c: e.k === 'rail' ? '#fff5c8' : e.k === 'beam' ? '#7dff6b' : col }, cap);
    if (e.sh) addRfx({ k: 'shield', b: e.b, life: 0.35, max: 0.35 }, cap);
    if (Math.random() < 0.15 && E.audio) E.audio.play('laser');
  }
  Rd.drawReplay(t, k, dt);
  if (!RP.seekHeld) { const s = $('#rSeek'); if (s) s.value = Math.round(RP.t / Math.max(0.01, dur) * 1000); }
  const tm = $('#rTime'); if (tm) tm.textContent = E.fmtTime(RP.t) + ' / ' + E.fmtTime(dur);
};
Rd.drawReplay = function (t, k, dt) {
  const out = RP.out, cv = $('#rcanvas'), ctx = cv.getContext('2d'), dpr = RP.dpr, w = cv.width / dpr, h = cv.height / dpr, Q = E.Q();
  fitCam(false);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cam = RP.cam; Rd.drawBackdrop(ctx, w, h, { x: cam.x * 0.5, y: cam.y * 0.5, z: cam.z }, t);
  ctx.save(); ctx.translate(w / 2, h / 2 + 20); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
  const BS = E.BATTLE_SIZE, F = out.frames[k];
  if (out.planetSide) {
    const T = E.PLANET_TYPES[out.ptype] || E.PLANET_TYPES.barren; ctx.drawImage(Rd.planetDisc(out.ptype || 'barren', out.id), BS.px - 20, BS.py - 140, 280, 280);
    if (F.shield > 0) { ctx.strokeStyle = 'rgba(127,216,255,' + (0.2 + 0.5 * F.shield) + ')'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(BS.px + 120, BS.py, 175, 0, TAU); ctx.stroke(); }
  }
  const n = out.units.length, small = n > 140, mag = E.clamp(0.62 / cam.z, 1, 2.2); // keep ships readable when the camera is far out
  // units
  for (let i = 0; i < n; i++) {
    const p = unitPos(out, k, i, t); if (!p) continue; const u = out.units[i], col = E.FACTIONS[u.owner].color;
    if (u.k === 'ship') {
      const tg = F.tg[i], tp = tg >= 0 ? unitPos(out, k, tg, t) : null, ang = tp ? Math.atan2(tp[1] - p[1], tp[0] - p[0]) : (u.side ? 0 : Math.PI);
      Rd.drawHull(ctx, u.h, p[0], p[1], ang, col, u.owner, mag, u.bo);
      if (Q.glow && !small) { const fl = 0.6 + 0.4 * Math.sin(t * 30 + i); for (const [ex, ey] of Rd.ENGINES[u.h] || []) { const s = E.HULLS[u.h].size, c = Math.cos(ang), sn = Math.sin(ang), x = p[0] + (ex * c - ey * sn) * s * mag, y = p[1] + (ex * sn + ey * c) * s * mag; ctx.fillStyle = hexA(u.owner === 'crisis' ? '#9dff6b' : '#cfefff', 0.5 * fl); ctx.beginPath(); ctx.arc(x, y, s * 0.18 * mag, 0, TAU); ctx.fill(); } }
    } else if (u.k === 'turret') { ctx.fillStyle = '#5a6680'; ctx.beginPath(); ctx.arc(p[0], p[1], 10, 0, TAU); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#c9d6e8'; ctx.fillRect(p[0] - 14, p[1] - 2, 14, 4); }
    else if (u.k === 'laser') { ctx.fillStyle = '#1a3320'; ctx.beginPath(); ctx.arc(p[0], p[1], 10, 0, TAU); ctx.fill(); ctx.strokeStyle = '#7dff6b'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#b8ff9a'; ctx.beginPath(); ctx.arc(p[0], p[1], 3.5, 0, TAU); ctx.fill(); }
    else if (u.k === 'railgun') { ctx.fillStyle = '#2a2a22'; ctx.strokeStyle = '#ffe9a0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.rect(p[0] - 16, p[1] - 8, 32, 16); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff5c8'; ctx.fillRect(p[0] - 18, p[1] - 3, 28, 6); }
    else { ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(t * 0.3); ctx.fillStyle = '#7d8aa6'; ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); for (let q = 0; q < 6; q++) { const a = q / 6 * TAU; ctx.lineTo(Math.cos(a) * 26, Math.sin(a) * 26); } ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ffe9a8'; ctx.fillRect(-4, -4, 8, 8); ctx.restore(); }
    if (!small && F.hp[i] < 0.999) { const s = u.k === 'ship' ? E.HULLS[u.h].size : 18; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(p[0] - s, p[1] - s - 6, s * 2, 3); ctx.fillStyle = F.hp[i] > 0.5 ? '#6be08a' : F.hp[i] > 0.25 ? '#ffc857' : '#ff6b6b'; ctx.fillRect(p[0] - s, p[1] - s - 6, s * 2 * Math.max(0, F.hp[i]), 3); }
  }
  // effects
  ctx.globalCompositeOperation = 'lighter';
  for (let j = RP.fx.length - 1; j >= 0; j--) {
    const fx = RP.fx[j]; fx.life -= dt * (RP.playing ? RP.speed : 0); if (fx.life <= 0) { RP.fx.splice(j, 1); continue; }
    const u = 1 - fx.life / fx.max;
    if (fx.k === 'laser' || fx.k === 'heavy' || fx.k === 'beam' || fx.k === 'rail') { ctx.strokeStyle = hexA(fx.c, 0.9 * (1 - u * 0.6)); ctx.lineWidth = fx.k === 'rail' ? 5 : fx.k === 'laser' ? 1.6 : fx.k === 'heavy' ? 3.2 : 3.5; ctx.beginPath(); ctx.moveTo(fx.a[0], fx.a[1]); ctx.lineTo(fx.b[0], fx.b[1]); ctx.stroke(); if (fx.k !== 'laser') { ctx.strokeStyle = 'rgba(255,255,255,' + (0.7 * (1 - u)) + ')'; ctx.lineWidth = fx.k === 'rail' ? 2 : 1.2; ctx.stroke(); } }
    else if (fx.k === 'missile') { const mx = (fx.a[0] + fx.b[0]) / 2, my = (fx.a[1] + fx.b[1]) / 2 + fx.curve, q = (s) => [(1 - s) * (1 - s) * fx.a[0] + 2 * (1 - s) * s * mx + s * s * fx.b[0], (1 - s) * (1 - s) * fx.a[1] + 2 * (1 - s) * s * my + s * s * fx.b[1]]; const [x, y] = q(u); ctx.strokeStyle = 'rgba(255,200,140,0.35)'; ctx.lineWidth = 2; ctx.beginPath(); for (let s = Math.max(0, u - 0.3); s <= u; s += 0.05) { const [a, b] = q(s); s === Math.max(0, u - 0.3) ? ctx.moveTo(a, b) : ctx.lineTo(a, b); } ctx.stroke(); ctx.fillStyle = '#fff2c0'; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, TAU); ctx.fill(); if (fx.life <= dt * RP.speed * 1.5) addRfx({ k: 'spark', x: fx.b[0], y: fx.b[1], life: 0.25, max: 0.25 }, 400); }
    else if (fx.k === 'shield') { const p = unitPos(out, k, fx.b, t); if (!p) continue; const s = out.units[fx.b].k === 'ship' ? E.HULLS[out.units[fx.b].h].size * 1.6 : 24; ctx.strokeStyle = 'rgba(127,216,255,' + (0.5 * (1 - u)) + ')'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(p[0], p[1], s, s * 0.8, t * 2, 0, TAU); ctx.stroke(); ctx.fillStyle = 'rgba(127,216,255,' + (0.05 * (1 - u)) + ')'; ctx.fill(); }
    else if (fx.k === 'boom') { const r = fx.r * (0.4 + u * 1.2); ctx.globalAlpha = 1 - u; ctx.drawImage(boomSprite(), fx.x - r, fx.y - r, r * 2, r * 2); ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(255,220,180,' + (0.6 * (1 - u)) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r * (0.5 + u * 2), 0, TAU); ctx.stroke(); }
    else if (fx.k === 'debris') { fx.x += fx.vx * dt * RP.speed; fx.y += fx.vy * dt * RP.speed; ctx.fillStyle = hexA(fx.c, 1 - u); ctx.fillRect(fx.x, fx.y, 2.5, 2.5); }
    else if (fx.k === 'spark') { ctx.fillStyle = 'rgba(255,230,170,' + (1 - u) + ')'; ctx.beginPath(); ctx.arc(fx.x, fx.y, 6 * (1 - u) + 2, 0, TAU); ctx.fill(); }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
  Rd.gstats.replayFx = RP.fx.length;
  // HUD counts
  const alive = [0, 0]; for (let i = 0; i < n; i++) if (F.hp[i] >= 0) alive[out.units[i].side]++;
  RP.alive = alive;
  const rc = $('#rcount'); if (rc) { const nm = sd => out.owners[sd].map(o => E.FACTIONS[o].short).join(' + '); const c = sd => E.FACTIONS[out.owners[sd][0] || 'neutral'].color;
    const html = `<span style="color:${c(0)}">${nm(0)} ${alive[0]}/${out.recorded[0]}</span> <span class="muted">vs</span> <span style="color:${c(1)}">${alive[1]}/${out.recorded[1]} ${nm(1)}</span>${out.total[0] + out.total[1] > out.recorded[0] + out.recorded[1] ? '<br><small class="muted">showing ' + (out.recorded[0] + out.recorded[1]) + ' of ' + (out.total[0] + out.total[1]) + ' units</small>' : ''}${!RP.playing && RP.t >= out.dur - out.t0 - 0.01 ? '<br><b>' + (out.winner < 0 ? 'Stalemate' : E.FACTIONS[out.owners[out.winner][0]].name + ' won') + '</b>' : ''}`;
    if (rc._h !== html) { rc.innerHTML = html; rc._h = html; } }
};
Rd.seekReplay = function (frac) { const out = RP.out; if (!out) return; RP.t = E.clamp(frac, 0, 1) * (out.dur - out.t0); RP.fx = []; RP.k = 0; const t = out.t0 + RP.t; RP.evI = 0; while (RP.evI < out.events.length && out.events[RP.evI].t <= t) RP.evI++; };

// ---------- H: result cards for every battle you fight ----------
Rd.cards = [];
Rd.cardHTML = function (c) {
  const sideRow = (s) => { const o = s.owners[0] || 'neutral'; return `<div class="bc-side" style="--c:${E.FACTIONS[o].color}">${Rd.bannerImg(o)}<div><b>${s.owners.map(x => E.FACTIONS[x].short).join(' + ')}${c.you === s.i ? ' (you)' : ''}</b><div class="small"><span>${E.fmtN(s.ships)} ships</span> · <span class="bad">−${E.fmtN(s.lost)} lost</span> · <span class="good">${E.fmtN(s.survivors)} left</span>${s.turrets ? ` · ✛ ${s.turrets - s.turretsLost}/${s.turrets}` : ''}${s.stations ? ` · ⬢ ${s.stations - s.stationsLost}/${s.stations}` : ''}</div></div></div>`; };
  const k = c.outcome || 'stalemate', title = k === 'victory' ? 'VICTORY' : k === 'defeat' ? 'DEFEAT' : 'STALEMATE';
  return `<div class="bcard ${k}" data-card="${c.id}"><div class="bc-h"><b>${title}</b><span>⚔ ${E.ui && E.ui.esc ? E.ui.esc(c.system) : c.system}</span><button class="bc-x" data-a="bcardClose" data-id="${c.id}" aria-label="Dismiss">✕</button></div>
    ${c.sides.map(sideRow).join('')}<div class="bc-w">Winner: <b>${c.winner}</b> · ${E.fmtTime(c.dur)}</div>
    <div class="bc-row"><button class="b primary mini2 rbtn" data-a="replay" data-id="${c.id}"${c.replay ? '' : ' disabled'}>Battle animation simulation</button><button class="b mini2" data-a="report" data-r="${c.id}">Report</button></div></div>`;
};
Rd.pushCard = function (id) {
  const c = E.resultCard(id); if (!c) return;
  const box = $('#bcards'); if (!box) return;
  Rd.cards = Rd.cards.filter(x => x !== id); Rd.cards.unshift(id);
  const el = document.createElement('div'); el.innerHTML = Rd.cardHTML(c); const card = el.firstElementChild;
  box.prepend(card); requestAnimationFrame(() => card.classList.add('in'));
  const extra = [...box.querySelectorAll('.bcard')].slice(3); extra.forEach(x => x.remove());
  card._t = setTimeout(() => Rd.dismissCard(id), 14000);
  card.addEventListener('pointerdown', () => { clearTimeout(card._t); });
  Rd.lastCard = c;
};
Rd.dismissCard = function (id) { const el = document.querySelector('.bcard[data-card="' + id + '"]'); if (el) { el.classList.add('out'); setTimeout(() => el.remove(), 350); } };
E.on('battleEnd', o => { if (!o || !o.b || (E.state && E.state._ff) || typeof document === 'undefined') return; const id = o.b.rep; if (id != null) setTimeout(() => Rd.pushCard(id), 0); });

// ---------- Q: animated galaxy title screen ----------
let TITLE = null;
Rd.drawTitle = function (ctx, w, h, time) {
  if (!TITLE) { const R = E.mulberry(42); TITLE = []; for (let i = 0; i < 1400; i++) { const arm = i % 3, d = Math.pow(R(), 0.6), a = arm / 3 * TAU + d * 4.2 + (R() - 0.5) * 0.6 * (1 - d * 0.5); TITLE.push(d, a, R(), R() < 0.15 ? 1 : 0); } }
  Rd.drawBackdrop(ctx, w, h, { x: 0, y: 0, z: 1 }, time);
  const Q = E.Q(), cx = w * 0.5, cy = h * 0.62, R0 = Math.max(w, h) * 0.55, n = Q.stars >= 3 ? TITLE.length : Q.stars === 2 ? 900 : 450;
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R0 * 0.35); core.addColorStop(0, 'rgba(255,236,200,0.75)'); core.addColorStop(0.3, 'rgba(200,150,255,0.25)'); core.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = core; ctx.fillRect(cx - R0, cy - R0, R0 * 2, R0 * 2);
  for (let i = 0; i < n * 4; i += 4) {
    const d = TITLE[i], a = TITLE[i + 1] + time * (0.05 + 0.12 * (1 - d)), r = d * R0;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.42; if (x < -4 || x > w + 4 || y < -4 || y > h + 4) continue;
    const b = TITLE[i + 2]; ctx.fillStyle = TITLE[i + 3] ? 'rgba(160,200,255,' + (0.5 + 0.5 * b) + ')' : 'rgba(255,' + Math.round(210 + 45 * b) + ',' + Math.round(170 + 85 * (1 - d)) + ',' + (0.35 + 0.6 * b * (1 - d * 0.5)) + ')';
    const s = 0.6 + b * 1.6 * (1 - d * 0.6); ctx.fillRect(x, y, s, s);
  }
  Rd.gstats.title = (Rd.gstats.title || 0) + 1;
};

// ---------- AC: photo mode ----------
Rd.photo = function (on) {
  document.body.classList.toggle('photo', !!on); Rd.photoOn = !!on;
  if (on) { E.ui && E.ui.close && E.ui.close(); const el = $('#photoExit'); if (el) { el.classList.remove('hidden'); el.classList.add('fresh'); setTimeout(() => el.classList.remove('fresh'), 2500); } }
  else { const el = $('#photoExit'); if (el) el.classList.add('hidden'); }
};

// ---------- L: consistent SVG icon set ----------
const IC = {
  metal: '<path d="M4 15l4-8h8l4 8-4 4H8z" fill="currentColor" opacity=".35"/><path d="M4 15l4-8h8l4 8-4 4H8zM8 7l4 4 4-4M12 11v8"/>',
  crystal: '<path d="M7 4h10l4 6-9 11L3 10z" fill="currentColor" opacity=".35"/><path d="M7 4h10l4 6-9 11L3 10zM3 10h18M9 4l3 6 3-6M12 10v11"/>',
  rp: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3"/><path d="M7.5 15h9" /><circle cx="11" cy="17.5" r="1" fill="currentColor"/>',
  idle: '<circle cx="12" cy="12" r="9"/><path d="M10 8v8M14 8v8"/>',
  cmd: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z" fill="currentColor" opacity=".35"/><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  troops: '<path d="M4 14a8 8 0 0116 0v2H4z" fill="currentColor" opacity=".35"/><path d="M4 14a8 8 0 0116 0v2H4zM2 16h20M12 6V3"/>',
  fighter: '<path d="M21 12L9 9 5 4H3l2 8-2 8h2l4-5z" fill="currentColor" opacity=".35"/><path d="M21 12L9 9 5 4H3l2 8-2 8h2l4-5z"/>',
  destroyer: '<path d="M22 12l-5-3H7L3 7v10l4-2h10z" fill="currentColor" opacity=".35"/><path d="M22 12l-5-3H7L3 7v10l4-2h10zM10 9v6M14 9v6"/>',
  carrier: '<path d="M22 12l-4-5H6L2 9v6l4 2h12z" fill="currentColor" opacity=".35"/><path d="M22 12l-4-5H6L2 9v6l4 2h12zM6 12h12"/>',
  transport: '<rect x="3" y="7" width="15" height="10" rx="2" fill="currentColor" opacity=".35"/><rect x="3" y="7" width="15" height="10" rx="2"/><path d="M18 10l3 2-3 2M7 7v10M11 7v10"/>',
  freighter: '<path d="M2 9h16l4 3-4 3H2z" fill="currentColor" opacity=".35"/><path d="M2 9h16l4 3-4 3H2zM6 9v6M10 9v6M14 9v6"/>',
  empire: '<circle cx="12" cy="12" r="6" fill="currentColor" opacity=".35"/><circle cx="12" cy="12" r="6"/><ellipse cx="12" cy="12" rx="10.5" ry="3.5" transform="rotate(-20 12 12)"/>',
  fleets: '<path d="M12 2c3 3 4 7 3 12H9C8 9 9 5 12 2z" fill="currentColor" opacity=".35"/><path d="M12 2c3 3 4 7 3 12H9C8 9 9 5 12 2zM9 14l-3 4h4M15 14l3 4h-4M11 18h2v3h-2z"/>',
  alerts: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12L19 6"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
  research: '<circle cx="12" cy="12" r="2" fill="currentColor"/><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/>',
  trade: '<path d="M12 3v18M5 7h14M5 7l-3 7h6zM19 7l-3 7h6zM8 21h8"/>',
  log: '<path d="M6 3h10l3 3v15H6z" fill="currentColor" opacity=".25"/><path d="M6 3h10l3 3v15H6zM9 9h7M9 13h7M9 17h5"/>',
  photo: '<rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8 6l2-3h4l2 3"/>',
};
Rd.ICONS = IC;
Rd.icon = (k, cls) => IC[k] ? `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>` : '';
Rd.applyIcons = function () {
  const map = { 'r-metal': 'metal', 'r-crystal': 'crystal', 'r-rp': 'rp', 'r-idle': 'idle', 'r-cmd': 'cmd', 'a-troops': 'troops', 'a-fighters': 'fighter', 'a-destroyers': 'destroyer', 'a-carriers': 'carrier', 'a-transports': 'transport', 'a-freighters': 'freighter' };
  for (const id in map) { const el = document.getElementById(id); const sp = el && el.querySelector('span'); if (sp && !sp.querySelector('svg')) sp.innerHTML = Rd.icon(map[id]); }
  const nav = { empire: 'empire', fleets: 'fleets', incoming: 'alerts', research: 'research', trade: 'trade', log: 'log' };
  document.querySelectorAll('#bottombar button[data-t]').forEach(b => { const k = nav[b.dataset.t], sp = b.querySelector('span'); if (k && sp && !sp.querySelector('svg')) sp.innerHTML = Rd.icon(k); });
};

// ---------- M: smooth counters (top-bar resources tween toward their new value) ----------
const TW = {};
Rd.tweenTop = function (dt) {
  const st = E.state; if (!st) return; const em = st.emp.player;
  const vals = { 'r-metal': em.res.metal, 'r-crystal': em.res.crystal, 'r-rp': em.rp + (em.research ? ((em.rpProg || {})[em.research] || 0) : 0) };
  for (const id in vals) {
    const v = vals[id], el = document.getElementById(id); if (!el) continue; const b = el.querySelector('b');
    let tw = TW[id]; if (!tw || st._ff) { TW[id] = tw = { d: v }; }
    if (Math.abs(v - tw.d) < 0.5 || Math.abs(v - tw.d) > Math.max(50000, Math.abs(v) * 0.9)) tw.d = v; else tw.d += (v - tw.d) * Math.min(1, dt * 7);
    const txt = E.fmt(Math.abs(v - tw.d) < 0.5 ? v : tw.d); if (b.textContent !== txt) b.textContent = txt;
    el.classList.toggle('tick', Math.abs(v - tw.d) >= 0.5);
  }
};

// ---------- per-frame hook from main.js ----------
Rd.frameTick = function (dt, inGame) {
  const now = performance.now() / 1000;
  if (inGame && !document.hidden && !RP.on) { if (E.fpsMon.feed(dt)) { /* dropped to Low */ } }
  Rd.applyCamAnim(now);
  if (PV.p && !$('#pview').classList.contains('hidden')) Rd.renderPlanetView(now);
  if (inGame) Rd.tweenTop(dt);
  if (RP.on) Rd.replayTick();
};
E.on('qualityDrop', o => { E.toast('Graphics switched to Low to keep the game smooth (' + Math.round(o.avg) + ' FPS). Change it in Menu › Settings.', 'warn'); window.dispatchEvent(new Event('resize')); });
E.on('settings', o => { if (o.k === 'quality') { window.dispatchEvent(new Event('resize')); document.body.classList.toggle('q-low', E.effQuality() === 'low'); } if (E.audio && E.audio.applyVolumes) E.audio.applyVolumes(); });

// ---------- R / P / AB / AC: settings block for the Menu sheet ----------
Rd.settingsHTML = function () {
  const S = E.settings, q = S.quality, eff = E.effQuality();
  const qb = (k, l) => `<button class="b mini2 ${q === k ? 'on' : ''}" data-a="setQuality" data-v="${k}">${l}</button>`;
  return `<div class="card settings" id="gfxSettings"><h4>🎨 Graphics &amp; sound</h4>
    <div class="srow"><span>Graphics quality</span><div class="seg">${qb('auto', 'Auto')}${qb('low', 'Low')}${qb('medium', 'Medium')}${qb('high', 'High')}</div></div>
    <div class="small muted">Now drawing at <b id="effQ">${eff[0].toUpperCase() + eff.slice(1)}</b>${q === 'auto' ? ' · Auto drops to Low by itself if the frame rate stays under ' + E.fpsMon.low + ' FPS' : ' · manual override'}${E.autoDropped && q === 'auto' ? ' · <span class="warn">dropped to Low (slow device)</span>' : ''} · ${Math.round(E.fpsMon.avg)} FPS</div>
    <div class="srow"><span>🎵 Music</span><input type="range" min="0" max="100" value="${Math.round(S.music * 100)}" data-in="vol" data-k="music"></div>
    <div class="srow"><span>🔊 Effects</span><input type="range" min="0" max="100" value="${Math.round(S.sfx * 100)}" data-in="vol" data-k="sfx"></div>
    <div class="srow"><span>Sound</span><div class="seg"><button class="b mini2 ${E.audio.muted ? '' : 'on'}" data-a="mute">${E.audio.muted ? '🔇 Muted' : '🔊 On'}</button></div></div>
    <div class="srow"><span>📳 Haptics</span><div class="seg"><button class="b mini2 ${S.haptics ? 'on' : ''}" data-a="toggleHaptics">${S.haptics ? 'On' : 'Off'}</button></div></div>
    <div class="small muted">Haptic taps use the vibration API (Android/Chrome). iPhone Safari does not allow web vibration, so it stays silent there.</div>
    <div class="srow"><span>📷 Photo mode</span><div class="seg"><button class="b mini2" data-a="photo">Hide the UI</button></div></div></div>`;
};
Rd.boot = function () {
  const U = E.ui;
  Rd.applyIcons();
  document.body.classList.toggle('q-low', E.effQuality() === 'low');
  Object.assign(U.ACT, {
    replay: d => Rd.openReplay(+d.id),
    replayClose: d => { U.ACT.closeResult(); Rd.openReplay(+d.id); },
    bcardClose: d => Rd.dismissCard(+d.id),
    report: d => { U.open('report', { r: +d.r }); },
    setQuality: d => { E.setSetting('quality', d.v); U.render(false); },
    toggleHaptics: () => { E.setSetting('haptics', !E.settings.haptics); if (E.settings.haptics) E.haptic('click'); U.render(false); },
    photo: () => Rd.photo(true),
  });
  document.addEventListener('input', e => { const el = e.target; if (el.dataset && el.dataset.in === 'vol') { U.lastTouch = performance.now(); E.setSetting(el.dataset.k, (+el.value) / 100); } });
  $('#photoExit').onclick = () => Rd.photo(false);
  $('#rClose').onclick = () => Rd.closeReplay();
  $('#rPlay').onclick = () => { const out = RP.out; if (!out) return; if (!RP.playing && RP.t >= out.dur - out.t0 - 0.01) Rd.seekReplay(0); RP.playing = !RP.playing; $('#rPlay').textContent = RP.playing ? '❚❚' : '▶'; };
  $('#rSpeed').onclick = () => { RP.speed = RP.speed === 1 ? 2 : RP.speed === 2 ? 4 : RP.speed === 4 ? 0.5 : 1; $('#rSpeed').textContent = RP.speed + '×'; };
  const sk = $('#rSeek'); sk.addEventListener('input', () => { RP.seekHeld = true; Rd.seekReplay(+sk.value / 1000); }); sk.addEventListener('change', () => { RP.seekHeld = false; });
  // pinch/drag-free replay: tap toggles play
  $('#rcanvas').addEventListener('click', () => $('#rPlay').click());
};
})();
