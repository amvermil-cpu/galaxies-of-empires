// Galaxies of Empires — boot, game loop, input, battle view, menus
'use strict';
(function () {
const E = window.EOG, Rd = E.render, U = E.ui;
const M = E.main = { battleSys: null, menu: true };
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let map, mctx, bcv, bctx, W = 0, H = 0, BW = 0, BH = 0;
let camTarget = null;
Rd.clearCamTarget = () => { camTarget = null; };
let zoomGoal = null; // v2.0 G: eased zoom (wheel / keys)

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, E.Q().dprCap); Rd.dpr = dpr; // v2.0 R: quality caps the render resolution
  W = Math.floor(window.innerWidth * dpr); H = Math.floor(window.innerHeight * dpr);
  map.width = W; map.height = H; map.style.width = window.innerWidth + 'px'; map.style.height = window.innerHeight + 'px';
  bcv.width = W; bcv.height = H; bcv.style.width = window.innerWidth + 'px'; bcv.style.height = window.innerHeight + 'px';
}
// v1.6: focusing only pans; it never changes the user's zoom (opts.zoom forces one)
Rd.focus = function (sys, opts) { const s = E.state.systems[sys]; if (!s) return; if (Rd.camAnim && Rd.camAnim.out) Rd.camAnim = null; camTarget = { x: s.x, y: s.y }; if (opts && opts.zoom && Rd.cam.z < 0.7) camTarget.z = 0.85; };
function fitZoom() { const st = E.state, w = window.innerWidth, h = window.innerHeight; return Math.min(w / (st.world.w + 200), h / (st.world.h + 200)); }
Rd.minZoom = function () { return E.state ? Math.min(0.3, fitZoom() * 0.85) : 0.3; };
function fitWorld() {
  const st = E.state;
  const z = fitZoom();
  const home = st.systems[st.emp.player.home];
  // small maps open zoomed out a little; big maps open on your home at a readable zoom
  const startZ = st.cfg.n <= 20 ? E.clamp(z * 1.5, 0.35, 1.2) : 0.5;
  Rd.cam = { x: st.cfg.n <= 20 ? E.lerp(st.world.w / 2, home.x, 0.35) : home.x, y: st.cfg.n <= 20 ? E.lerp(st.world.h / 2, home.y, 0.35) : home.y, z: startZ };
}

// ---------- menus ----------
M.setup = { diff: 'normal', size: 'small', rivals: 3, mode: 'classic', species: 'forgeborn', allies: 0, fast: false, slot: 0 };
M.showMenu = function () {
  M.menu = true;
  const meta = E.saveMeta(), S = M.setup;
  { const sl = E.slotInfo(); if (!S.slot || !sl[S.slot - 1]) { const empty = sl.find(x => !x.has); S.slot = empty ? empty.n : sl.slice().sort((a, b) => ((a.meta && a.meta.when) || 0) - ((b.meta && b.meta.when) || 0))[0].n; } } // v2.2 item 4
  const sizes = Object.entries(E.SIZES).filter(([k, d]) => !d.hidden), rv = [1, 2, 3, 4, 5, 6, 7, 8];
  $('#menu').innerHTML = `<div class="menubox"><div class="logo">GALAXIES<span>of</span>EMPIRES</div><div class="ver">v${E.VERSION}</div>
    <p class="premise">${E.PREMISE}</p>
    ${E.hasSave() ? `<button class="b primary big" id="mContinue">▶ Continue${meta ? ' <small>(' + E.fmtTime(meta.t) + ', ' + E.DIFFICULTY[meta.diff].name + (meta.mode === 'endless' ? ', Endless stage ' + meta.stage : meta.size ? ', ' + E.SIZES[meta.size].name : '') + ', ' + meta.planets + ' worlds)</small>' : ''}</button>` : ''}
    <div class="setup"><label>New game · Mode</label><div class="opts" id="optMode"><button class="b" data-mode="classic">Classic<small>pick map & rivals</small></button><button class="b" data-mode="endless">♾ Endless<small>20 → 160 systems</small></button></div>
    <label>Species <small class="muted">(one small bonus each · rivals get random species)</small></label><div class="opts" id="optSpecies">${E.PICK_SPECIES.map(k => [k, E.SPECIES[k]]).map(([k, d]) => `<button class="b" data-species="${k}">${d.icon} ${d.name}<small>${d.desc}</small></button>`).join('')}</div>
    <label>Difficulty</label><div class="opts" id="optDiff">${Object.entries(E.DIFFICULTY).map(([k, d]) => `<button class="b" data-diff="${k}">${d.name}</button>`).join('')}</div>
    <div id="classicOpts"><label>Map size</label><div class="opts" id="optSize">${sizes.map(([k, d]) => `<button class="b" data-size="${k}">${d.name}<small>${d.n} systems</small></button>`).join('')}</div>
    <label>Rival empires</label><div class="opts rv" id="optRiv">${rv.map(n => `<button class="b" data-riv="${n}">${n}</button>`).join('')}</div></div>
    <label>Computer allies <small class="muted">(your team)</small></label><div class="opts rv" id="optAllies">${[0, 1, 2, 3].map(n => `<button class="b" data-allies="${n}">${n}</button>`).join('')}</div>
    <label>Start <small class="muted">(v2.2 · any map size)</small></label><div class="opts" id="optFast"><button class="b" data-fast="0">Standard<small>normal economy</small></button><button class="b" data-fast="1">⚡ Fast start<small>×${E.FAST ? E.FAST.res : 5} resources · quick early builds</small></button></div>
    <label>Save into</label><div class="opts rv" id="optSlot">${E.slotInfo().map(sl => `<button class="b" data-slot="${sl.n}">${esc(sl.name)}<small>${sl.has ? 'in use' : 'empty'}</small></button>`).join('')}</div>
    <div class="note" id="setupNote"></div></div>
    <button class="b big ${E.hasSave() ? '' : 'primary'}" id="mNew">✦ Start new game</button>
    ${E.ui && E.ui.slotsHTML ? E.ui.slotsHTML(false) : ''}
    <button class="b big" id="mOnline" disabled aria-disabled="true" title="Online play is not available yet">🌐 Online <small>(coming soon)</small></button>
    ${E.hasOldSave && E.hasOldSave() && !E.hasSave() ? '<p class="note small" id="saveNote">v1.5 note: corner-start maps, carrier fleets, trader slots and the new pacing need a fresh game, so v1.4 and older saves can’t continue. (Your old save is kept on this device.)</p>' : !E.hasSave() ? '<p class="note small" id="saveNote">v1.5 uses a new save slot: games from v1.4 or earlier can’t be continued.</p>' : ''}
    <p class="muted small">Tip: on iPhone, tap Share → “Add to Home Screen” to play full-screen and offline.</p></div>`;
  $('#menu').classList.remove('hidden');
  $('#menu').querySelectorAll('[data-species]').forEach(b => { if (!b.querySelector('img.emb')) b.insertAdjacentHTML('afterbegin', Rd.emblemImg(b.dataset.species, '#e8f3ff')); }); // v2.0 O
  const paint = () => {
    $('#menu').querySelectorAll('[data-diff]').forEach(x => x.classList.toggle('on', x.dataset.diff === S.diff));
    $('#menu').querySelectorAll('[data-size]').forEach(x => x.classList.toggle('on', x.dataset.size === S.size));
    $('#menu').querySelectorAll('[data-riv]').forEach(x => x.classList.toggle('on', +x.dataset.riv === S.rivals));
    $('#menu').querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x.dataset.mode === S.mode));
    $('#menu').querySelectorAll('[data-species]').forEach(x => x.classList.toggle('on', x.dataset.species === S.species));
    $('#menu').querySelectorAll('[data-allies]').forEach(x => x.classList.toggle('on', +x.dataset.allies === S.allies));
    $('#menu').querySelectorAll('[data-fast]').forEach(x => x.classList.toggle('on', !!+x.dataset.fast === !!S.fast));
    $('#menu').querySelectorAll('#optSlot [data-slot]').forEach(x => x.classList.toggle('on', +x.dataset.slot === S.slot));
    $('#classicOpts').classList.toggle('hidden', S.mode === 'endless');
    const al = S.allies ? ' · ' + S.allies + ' all' + (S.allies > 1 ? 'ies' : 'y') + ' (' + E.ALLIES.slice(0, S.allies).map(f => E.FACTIONS[f].short).join(', ') + ')' : '';
    if (S.mode === 'endless') { $('#setupNote').innerHTML = `♾ Endless: start 1v1 on 20 systems. Defeat every rival and the Expanse grows — 40 systems & 2 rivals, 80 & 4, then 160 & 8.${al} · The Rift can still open.`; return; }
    const c = E.computeCfg(S.diff, S.size, S.rivals);
    const rn = E.RIVALS.slice(0, S.rivals).map(f => E.FACTIONS[f].short).join(', ');
    $('#setupNote').innerHTML = `${c.n} systems · ${S.rivals} rival${S.rivals > 1 ? 's' : ''} (${rn})${al} · win by leaving every rival with <b>no colonized systems</b> · the Hollow still comes (Rift ≈ ${Math.round(c.crisisAt / 60)} min)${S.size === 'small' && S.rivals > 6 ? ' · crowded!' : ''}${S.size === 'huge' ? ' · long game (4+ hours)' : S.size === 'massive' ? ' · very long game (6+ hours)' : S.size === 'galactic' ? ' · epic game (8+ hours)' : ''}`;
  };
  paint();
  $('#menu').querySelectorAll('[data-diff],[data-size],[data-riv],[data-mode],[data-species],[data-allies],[data-fast],#optSlot [data-slot]').forEach(b => b.onclick = () => {
    if (b.dataset.fast != null) S.fast = !!+b.dataset.fast; if (b.dataset.slot != null) S.slot = +b.dataset.slot;
    if (b.dataset.diff) S.diff = b.dataset.diff; if (b.dataset.size) { S.size = b.dataset.size; if (E.SIZES[S.size].rivals) S.rivals = E.SIZES[S.size].rivals; } /* v2.1 item 9: Massive defaults to 8 rivals */ if (b.dataset.riv) S.rivals = +b.dataset.riv;
    if (b.dataset.mode) S.mode = b.dataset.mode; if (b.dataset.species) S.species = b.dataset.species; if (b.dataset.allies != null) S.allies = +b.dataset.allies;
    paint(); E.audio.unlock(); E.audio.play('click');
  });
  $('#mNew').onclick = () => {
    const sl = E.slotInfo()[S.slot - 1];
    if (sl && sl.has && !confirm('Start a new game in “' + sl.name + '”? The game saved there will be replaced.')) return;
    E.audio.unlock(); E.slot = S.slot || 1; E._myWhen = 0;
    M.start(E.newGame(S.diff, 0, { size: S.size, rivals: S.rivals, mode: S.mode, species: S.species, allies: S.allies, fast: S.fast }));
    E.save({ slot: E.slot });
  };
  // v2.2 item 4: slot rows on the title screen (Load / rename / Export / Import / delete)
  $('#menu').querySelectorAll('#saveSlots [data-a="slotAct"]').forEach(b => b.onclick = () => E.ui.slotAct(b.dataset.op, b.dataset.n, false, () => M.showMenu()));
  const c = $('#mContinue'); if (c) c.onclick = () => { E.audio.unlock(); const st = E.load(); if (st) M.start(st); else alert('Save could not be loaded.'); };
};
// v1.4 Endless: stage banner + refit the camera to the bigger map
E.on('stage', b => { fitWorld(); const st = E.state; Rd.focus(st.emp.player.home); M.stageBanner(b); });
M.stageBanner = function (b) {
  const el = $('#stageBanner'); if (!el || !b) return;
  el.innerHTML = `<div class="sb-in"><div class="sb-k">ENDLESS · STAGE ${b.stage + 1} / ${E.ENDLESS_STAGES.length}</div><div class="sb-t">The Expanse grows</div><div class="sb-s">${b.n} systems · ${b.rivals} rival empire${b.rivals > 1 ? 's' : ''} awaken${b.rivals > 1 ? '' : 's'}</div><div class="sb-d small">Your worlds, fleets and Commander level carry over.</div></div>`;
  el.classList.remove('hidden', 'out'); el.classList.add('in');
  clearTimeout(M._sbT); M._sbT = setTimeout(() => { el.classList.add('out'); setTimeout(() => el.classList.add('hidden'), 700); }, 4200);
};
M.start = function (st) {
  M.menu = false; $('#menu').classList.add('hidden'); $('#modal').classList.add('hidden');
  U.close(); M.closeBattle();
  fitWorld(); Rd.focus(st.emp.player.home);
  U.updateTop(); U.renderTut();
  E.save();
  E.audio.play('build');
};

// ---------- battle view ----------
M.openBattle = function (sys) {
  const b = E.battleAt(sys) || E.state.battles.find(x => x.sys === sys);
  if (!b) { U.flash('No battle there'); return; }
  E.state.battles.forEach(x => x.viewing = false);
  b.viewing = true; M.battleSys = sys; Rd.bsel = new Set();
  const w = window.innerWidth, h = window.innerHeight;
  Rd.bcam = { x: 700, y: 350, z: E.clamp(Math.min(w / 680, (h - 160) / 620), 0.5, 1.3) }; Rd.bfollow = true;
  $('#battleView').classList.remove('hidden');
  U.close();
  updateBattleHud(true);
};
M.closeBattle = function () {
  if (E.state) E.state.battles.forEach(x => x.viewing = false);
  M.battleSys = null; $('#battleView').classList.add('hidden');
};
function curBattle() { if (M.battleSys == null) return null; return E.state.battles.find(b => b.sys === M.battleSys && (!b.done || b.viewing)) || null; }
function updateBattleHud(force) {
  const b = curBattle(); const hud = $('#bhud');
  if (!b) { $('#bstatus').textContent = 'Battle over'; return; }
  const st = E.state, s = st.systems[b.sys];
  const p0 = E.sidePower(b, 0), p1 = E.sidePower(b, 1), tot = Math.max(1, p0 + p1);
  const n0 = b.owners[0].map(o => E.FACTIONS[o].short).join('+'), n1 = b.owners[1].map(o => E.FACTIONS[o].short).join('+');
  const c0 = E.FACTIONS[b.owners[0][0] || 'neutral'].color, c1 = E.FACTIONS[b.owners[1][0] || 'neutral'].color;
  $('#btitle').textContent = '⚔ ' + s.name + (b.planetSide ? ' — orbital assault' : ' — fleet battle');
  $('#bpow').innerHTML = `<span style="color:${c1}">${n1} ${E.fmt(p1)}</span><div class="pbar"><i style="width:${p1 / tot * 100}%;background:${c1}"></i><i style="width:${p0 / tot * 100}%;background:${c0}"></i></div><span style="color:${c0}">${E.fmt(p0)} ${n0}</span>`;
  const p = E.sysPlanet(b.sys);
  let status = '';
  if (b.done) status = b.winner === -1 ? 'Stalemate' : ((b.owners[b.winner] || []).includes('player') ? '✔ Victory!' : '✖ Defeat');
  else if (b.planetSide && p) { const sm = E.shieldMax(st, p); status = `Shield ${sm ? Math.round(p.shieldHp / sm * 100) : 0}% · Turrets ${b.units.filter(u => u.kind === 'turret').length} · Stations ${b.units.filter(u => u.kind === 'station').length}`; }
  else status = b.units.length + ' ships engaged';
  $('#bstatus').textContent = status;
  const sel = Rd.bsel ? Rd.bsel.size : 0;
  $('#bWithdrawSel').textContent = 'Withdraw selected (' + sel + ')';
  $('#bWithdrawSel').disabled = !sel;
  const mine = b.owners[0].includes('player') || b.owners[1].includes('player');
  $('#bctl').classList.toggle('hidden', !mine || b.done);
}
function battleTap(sx, sy) {
  const b = curBattle(); if (!b) return;
  const [wx, wy] = Rd.screenToWorld(sx, sy, Rd.bcam, window.innerWidth, window.innerHeight);
  let best = null, bd = 42 / Rd.bcam.z;
  for (const u of b.units) { if (u.kind !== 'ship' || u.owner !== 'player') continue; const d = Math.hypot(u.x - wx, u.y - wy); if (d < bd) { bd = d; best = u; } }
  if (best) { if (Rd.bsel.has(best.uid)) Rd.bsel.delete(best.uid); else Rd.bsel.add(best.uid); E.audio.play('click'); updateBattleHud(); }
}

// ---------- input ----------
function setupInput(el, getCam, onTap, isBattle, onLong) {
  const pts = new Map(); let start = null, pinch = null, moved = false, longT = null, longFired = false;
  const clearLong = () => { if (longT) { clearTimeout(longT); longT = null; } };
  el.addEventListener('pointerdown', e => {
    E.audio.unlock();
    el.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) { start = { x: e.clientX, y: e.clientY, t: performance.now(), cx: getCam().x, cy: getCam().y }; moved = false; longFired = false; clearLong();
      if (onLong) { const lx = e.clientX, ly = e.clientY; longT = setTimeout(() => { longT = null; if (!moved && pts.size === 1) { longFired = true; onLong(lx, ly); } }, 550); } } // v1.6: long-press
    if (pts.size === 2) { clearLong(); const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: getCam().z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; moved = true; }
    camTarget = null; if (isBattle) Rd.bfollow = false; else { Rd.camAnim = null; zoomGoal = null; }
  });
  el.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const cam = getCam();
    if (pts.size >= 2 && pinch) {
      const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt(cam, pinch.mx, pinch.my, E.clamp(pinch.z * d / pinch.d, isBattle ? 0.25 : Rd.minZoom(), isBattle ? 3 : 2.5) / cam.z);
      if (!isBattle) { Rd.panning = true; Rd.gestureT = performance.now(); }
    } else if (start) {
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (Math.abs(dx) + Math.abs(dy) > 8) { moved = true; clearLong(); }
      if (moved) { cam.x = start.cx - dx / cam.z; cam.y = start.cy - dy / cam.z; clampCam(cam, isBattle); if (!isBattle) { Rd.panning = true; Rd.gestureT = performance.now(); } } // v2.2 item 1: simplified map while dragging
    }
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId); clearLong();
    if (pts.size < 2) pinch = null;
    if (pts.size === 0) { if (!isBattle) Rd.panning = false; if (!moved && !longFired && start && performance.now() - start.t < 600) onTap(e.clientX, e.clientY); start = null; }
    else { const [a] = [...pts.values()]; start = { x: a.x, y: a.y, t: 0, cx: getCam().x, cy: getCam().y }; }
  };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', e => { e.preventDefault(); const cam = getCam(); const f = Math.exp(-e.deltaY * 0.0015); if (!isBattle) { Rd.camAnim = null; const z0 = zoomGoal ? zoomGoal.z : cam.z; zoomGoal = { z: E.clamp(z0 * f, Rd.minZoom(), 2.5), sx: e.clientX, sy: e.clientY }; camTarget = null; Rd.gestureT = performance.now(); return; } zoomAt(cam, e.clientX, e.clientY, E.clamp(cam.z * f, isBattle ? 0.25 : Rd.minZoom(), isBattle ? 3 : 2.5) / cam.z); camTarget = null; }, { passive: false });
}
function zoomAt(cam, sx, sy, f) {
  const w = window.innerWidth, h = window.innerHeight;
  const [wx, wy] = Rd.screenToWorld(sx, sy, cam, w, h);
  cam.z *= f;
  cam.x = wx - (sx - w / 2) / cam.z; cam.y = wy - (sy - h / 2) / cam.z;
}
function clampCam(cam, isBattle) {
  if (isBattle) { cam.x = E.clamp(cam.x, -100, 1300); cam.y = E.clamp(cam.y, -100, 800); return; }
  const st = E.state; cam.x = E.clamp(cam.x, -150, st.world.w + 150); cam.y = E.clamp(cam.y, -150, st.world.h + 150);
}
// v1.6: long-press one of your planets to make it the rally point. With one of your planets open, that planet rallies there;
// otherwise every other production world does. Long-press the same target again to clear.
function mapLongPress(sx, sy) {
  const st = E.state; if (!st || Rd.targetMode) return;
  const w = window.innerWidth, h = window.innerHeight;
  let bestS = null, bsd = Math.max(30, 34 * Rd.cam.z);
  for (const s of st.systems) { const [x, y] = Rd.worldToScreen(s.x, s.y, Rd.cam, w, h); const d = Math.hypot(x - sx, y - sy); if (d < bsd) { bsd = d; bestS = s; } }
  if (!bestS) return;
  const r = E.setRallyHere(bestS.id);
  if (navigator.vibrate) try { navigator.vibrate(25); } catch (e) { }
  U.flash(r.msg, r.ok ? 'good' : 'warn'); E.audio.play('click');
  if (U.sheet && U.sheet.type === 'system') U.render(false);
}
function mapTap(sx, sy) {
  const st = E.state; if (!st) return;
  const w = window.innerWidth, h = window.innerHeight;
  // moving fleets first
  let bestF = null, bfd = 22;
  for (const f of st.fleets) { if (!f.path.length || !E.fleetVisible(f)) continue; const p = Rd.fleetPos(f); const [x, y] = Rd.worldToScreen(p.x, p.y, Rd.cam, w, h); const d = Math.hypot(x - sx, y - sy); if (d < bfd) { bfd = d; bestF = f; } }
  let bestS = null, bsd = Math.max(30, 34 * Rd.cam.z);
  for (const s of st.systems) { const [x, y] = Rd.worldToScreen(s.x, s.y, Rd.cam, w, h); const d = Math.hypot(x - sx, y - sy); if (d < bsd) { bsd = d; bestS = s; } }
  if (Rd.targetMode) {
    if (!bestS) return;
    const tm = Rd.targetMode; Rd.targetMode = null; $('#banner').classList.add('hidden');
    if (tm.order === 'send') { U.openSend(bestS.id, [tm.fid]); return; }
    const r = tm.order === 'patrol' ? E.act.patrol(tm.fid, bestS.id) : E.act.move(tm.fid, bestS.id, tm.order);
    if (r.ok) { const f = E.fleetById(tm.fid); U.flash((tm.order === 'attack' ? '⚔ Attacking ' : '➜ Heading to ') + bestS.name + ' — ETA ' + E.fmtTime(E.fleetETA(f)), 'good'); U.open('fleet', { fid: tm.fid }); }
    else U.flash(r.msg);
    return;
  }
  if (bestF && bfd < bsd) { if (bestF.owner === 'player' && U.openTransit) U.openTransit(bestF.id); else U.open('fleet', { fid: bestF.id }); return; } // v1.8: your en-route fleets open the transit close-up
  if (bestS) { U.open('system', { sys: bestS.id, tab: U.sheet && U.sheet.type === 'system' && U.sheet.sys !== bestS.id ? undefined : undefined }); return; }
  Rd.sel.sys = null; if (U.sheet && (U.sheet.type === 'system' || U.sheet.type === 'fleet')) U.close();
}

function keys(e) {
  if (M.menu || e.target.tagName === 'INPUT') return;
  const st = E.state; const k = e.key.toLowerCase();
  if (k === ' ') { st.paused = !st.paused; e.preventDefault(); }
  else if (k === '1' || k === '2' || k === '3') { st.speed = [1, 2, 4][+k - 1]; st.paused = false; }
  else if (k === 'escape') { if (Rd.RP && Rd.RP.on) Rd.closeReplay(); else if (Rd.photoOn) Rd.photo(false); else if (Rd.targetMode) U.ACT.cancelTarget(); else if (M.battleSys != null) M.closeBattle(); else U.close(); }
  else if (k === 'e') U.ACT.open({ t: 'empire' });
  else if (k === 'f') U.ACT.open({ t: 'fleets' });
  else if (k === 'r') U.ACT.open({ t: 'research' });
  else if (k === 't') U.ACT.open({ t: 'trade' });
  else if (k === 'l') U.ACT.open({ t: 'log' });
  else if (k === 'i') U.ACT.open({ t: 'incoming' });
  else if (k === 'h') { Rd.focus(st.emp.player.home); U.open('system', { sys: st.emp.player.home }); }
  else if (k === 'b') U.ACT.battle();
  else if (k === '+' || k === '=') zoomGoal = { z: Math.min(2.5, (zoomGoal ? zoomGoal.z : Rd.cam.z) * 1.2), sx: innerWidth / 2, sy: innerHeight / 2 };
  else if (k === '-') zoomGoal = { z: Math.max(Rd.minZoom(), (zoomGoal ? zoomGoal.z : Rd.cam.z) / 1.2), sx: innerWidth / 2, sy: innerHeight / 2 };
  else if (k === 'p') Rd.photo(!Rd.photoOn); // v2.0 AC
  else if (['arrowleft', 'a'].includes(k)) Rd.cam.x -= 60 / Rd.cam.z;
  else if (['arrowright', 'd'].includes(k)) Rd.cam.x += 60 / Rd.cam.z;
  else if (['arrowup', 'w'].includes(k)) Rd.cam.y -= 60 / Rd.cam.z;
  else if (['arrowdown', 's'].includes(k)) Rd.cam.y += 60 / Rd.cam.z;
  else return;
  U.updateTop();
}

// ---------- game over ----------
E.on('gameover', o => {
  const st = E.state;
  $('#modal').innerHTML = `<div class="modalbox ${o.win ? 'win' : 'lose'}"><h2>${o.win ? '★ VICTORY ★' : 'DEFEAT'}</h2><p>${o.reason}</p><div class="grid2 small"><div>Time ${E.fmtTime(o.t)}</div><div>Worlds ${E.playerPlanets().length}</div><div>Planets captured ${st.stats.captured}</div><div>Planets lost ${st.stats.lost}</div><div>Battles won ${st.stats.battlesWon}</div><div>Battles lost ${st.stats.battlesLost}</div><div>Ships built ${st.stats.shipsBuilt}</div><div>Enemy ships destroyed ${st.stats.enemyKilled}</div><div>Trade earned ${E.fmt(st.stats.tradeEarned)}¢</div><div>Difficulty ${E.DIFFICULTY[st.diff].name}</div></div><div class="row">${o.win ? '<button class="b primary" id="goCont">Keep playing</button>' : ''}<button class="b" id="goMenu">Main menu</button></div></div>`;
  $('#modal').classList.remove('hidden');
  const c = $('#goCont'); if (c) c.onclick = () => { st.continued = true; $('#modal').classList.add('hidden'); };
  $('#goMenu').onclick = () => { if (!o.win) E.deleteSlot(E.slot || 1); else E.save(); $('#modal').classList.add('hidden'); M.showMenu(); };
  if (!o.win) E.deleteSlot(E.slot || 1); else E.save(); // v2.2: a lost game clears only its own slot
});
E.on('windowOpen', w => { const st = E.state; if (st._ff) return; if (st.speed > 1) st.speed = 1; });
E.on('incoming', a => { /* strip + toast are handled by updateTop / toast listeners */ });
// v1.9 item 18: battles that start close together become one toast ("⚔ Battle at X +N more")
const BT = { until: 0, more: [], timer: null };
E.on('battleStart', b => { if (E.state._ff) return; const now = performance.now(), nm = E.state.systems[b.sys].name;
  if (now < BT.until) { BT.more.push(nm); if (!BT.timer) BT.timer = setTimeout(() => { const l = BT.more.splice(0); BT.timer = null; BT.until = performance.now() + 4000; if (l.length) { E.toast('⚔ ' + l.length + ' more battle' + (l.length === 1 ? '' : 's') + ': ' + l.slice(0, 3).join(', ') + (l.length > 3 ? ' +' + (l.length - 3) : ''), 'warn'); E.state.stats.groupedBattles = (E.state.stats.groupedBattles || 0) + 1; } }, 4000); return; }
  BT.until = now + 4000; E.toast('⚔ Battle at ' + nm + ' — tap ⚔ for live status', 'warn', b.sys); });

// ---------- loop ----------
let last = performance.now(), acc = { top: 0, sheet: 0, tut: 0, save: 0, hud: 0 };
function frame(ts) {
  const dt = Math.min(0.1, Math.max(0, (ts - last) / 1000)); last = ts;
  try { frameBody(dt, ts); } catch (e) { console.error('frame', e); E.lastError = String(e && e.message || e); }
  requestAnimationFrame(frame);
}
function frameBody(dt, ts) {
  if (E.settings && E.settings.battery && E.state && !M.menu && M.battleSys == null) {
    E._batAcc = (E._batAcc || 0) + dt;
    if (E._batAcc < 1 / 30) return;
    dt = Math.min(0.1, E._batAcc);
    E._batAcc = 0;
  } else { E._batAcc = 0; }
  const st = E.state;
  const time = ts / 1000;
  Rd.frameTick(dt, !!(st && !M.menu && M.battleSys == null)); // v2.0: FPS monitor, camera ease, planet close-up, counters, replay
  if (st && !M.menu) {
    if (!st.paused && (!st.over || st.continued)) { let g = dt * st.speed; while (g > 1e-6) { const d = Math.min(0.25, g); E.step(d); g -= d; } }
    if (camTarget) { Rd.cam.x = E.lerp(Rd.cam.x, camTarget.x, Math.min(1, dt * 6)); Rd.cam.y = E.lerp(Rd.cam.y, camTarget.y, Math.min(1, dt * 6)); if (camTarget.z) Rd.cam.z = E.lerp(Rd.cam.z, camTarget.z, Math.min(1, dt * 6)); if (Math.abs(Rd.cam.x - camTarget.x) < 1 && Math.abs(Rd.cam.y - camTarget.y) < 1) camTarget = null; }
    if (M.battleSys != null) {
      const b = curBattle();
      if (b && Rd.bfollow && b.units.length) { let sx = 0, sy = 0, n = 0; for (const u of b.units) { if (u.kind !== 'ship' || !E.HULLS[u.h].noWeapon) { sx += u.x; sy += u.y; n++; } } if (n) { const tx = E.clamp(sx / n + 40, 300, 950), ty = E.clamp(sy / n, 250, 450); Rd.bcam.x = E.lerp(Rd.bcam.x, tx, Math.min(1, dt * 1.5)); Rd.bcam.y = E.lerp(Rd.bcam.y, ty, Math.min(1, dt * 1.5)); } }
      if (b) Rd.drawBattleStatus(bctx, W, H, b, time); else { bctx.setTransform(1, 0, 0, 1, 0, 0); } // v2.0 H: no automatic battle animation — static live status only
      acc.hud += dt; if (acc.hud > 0.25) { acc.hud = 0; updateBattleHud(); }
    } else { if (zoomGoal) { const f = Math.pow(zoomGoal.z / Rd.cam.z, Math.min(1, dt * 10)); zoomAt(Rd.cam, zoomGoal.sx, zoomGoal.sy, f); if (Math.abs(Rd.cam.z / zoomGoal.z - 1) < 0.003) zoomGoal = null; } if (!(Rd.RP && Rd.RP.on && Rd.RP.out)) Rd.drawMap(mctx, W, H, time); } // v2.0 X: the full-screen replay covers the map — don't draw it underneath
    acc.top += dt; if (acc.top > 0.2) { acc.top = 0; U.updateTop(); }
    acc.sheet += dt; if (acc.sheet > 1) { acc.sheet = 0; U.refresh(); }
    acc.tut += dt; if (acc.tut > 0.5) { acc.tut = 0; U.tutAdvance(false); }
    acc.save += dt; if (acc.save > 30) { acc.save = 0; E.save({ auto: true }); }
  } else if (st || M.menu) {
    if (E.state) Rd.drawMap(mctx, W, H, time); else drawMenuBg(time);
  }
}
function drawMenuBg(time) {
  mctx.setTransform(Rd.dpr, 0, 0, Rd.dpr, 0, 0);
  const w = W / Rd.dpr, h = H / Rd.dpr;
  Rd.drawTitle(mctx, w, h, time); // v2.0 Q: animated spiral galaxy
}

// ---------- boot ----------
function boot() {
  const go = async () => {
    try { if (E.initStorage) await E.initStorage(); } catch (e) { console.warn('initStorage', e); }
    bootBody();
  };
  go();
}
function bootBody() {
  map = $('#map'); mctx = map.getContext('2d'); bcv = $('#bcanvas'); bctx = bcv.getContext('2d');
  resize(); window.addEventListener('resize', resize);
  setupInput(map, () => Rd.cam, mapTap, false, mapLongPress);
  setupInput(bcv, () => Rd.bcam, battleTap, true);
  document.addEventListener('click', e => { const el = e.target.closest('[data-a]'); if (el) { e.preventDefault(); U.dispatch(el); } });
  document.addEventListener('pointerdown', () => { U.lastTouch = performance.now(); }, true);
  document.addEventListener('input', e => { const el = e.target; if (el.dataset && el.dataset.in === 'sendSpeed' && U.sendSel) { U.lastTouch = performance.now(); U.sendSel.speed = +el.value; const v = document.getElementById('sendSpeedV'); if (v) v.textContent = el.value + '%'; } });
  document.addEventListener('change', e => { const el = e.target; if (el.dataset && el.dataset.in === 'sendSpeed' && U.sendSel) { U.sendSel.speed = +el.value; U.render(false); } });
  document.addEventListener('keydown', keys);
  $('#bClose').onclick = () => M.closeBattle();
  $('#bPull').onclick = () => { const b = curBattle(); if (!b) return; const r = E.act.withdraw(b.id, 'damaged'); U.flash(r.ok ? 'Pulled out ' + r.n + ' damaged ships' : r.msg, r.ok ? 'good' : 'warn'); };
  $('#bWithdrawSel').onclick = () => { const b = curBattle(); if (!b) return; const r = E.act.withdraw(b.id, 'uids', [...Rd.bsel]); Rd.bsel.clear(); U.flash(r.ok ? 'Withdrew ' + r.n + ' ships' : r.msg, r.ok ? 'good' : 'warn'); };
  $('#bRetreat').onclick = () => { const b = curBattle(); if (!b) return; let n = 0; for (const fid of b.fleets.slice()) { const f = E.fleetById(fid); if (f && f.owner === 'player') { if (E.act.retreat(f.id).ok) n++; } } U.flash(n ? 'All fleets retreating' : 'Nothing to retreat (defending your own world?)'); };
  const save = () => { if (E.state && !M.menu) E.save({ auto: true }); }; // v2.1 item 6: never clobber a newer save from another window
  window.addEventListener('storage', e => { if (!e.key) return; if (E.kvGet && (E.SLOT_KEYS || []).some(k => e.key === k + '_meta' || e.key === k)) { if (e.newValue != null) { E._kv[e.key] = e.newValue; E._kvHas[e.key] = 1; } } if (e.key === E.SAVE_KEY + '_meta' && E.state && !M.menu) { E.saveConflict = true; } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);
  E.onLog = () => { if (U.sheet && U.sheet.type === 'log') U.render(false); };
  Rd.boot(); // v2.0
  M.showMenu();
  requestAnimationFrame(frame);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
  window.addEventListener('error', e => { E.lastError = String(e.message || e); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
