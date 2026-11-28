// Galaxies of Empires — DOM user interface (panels, top bar, toasts, tutorial, modals)
'use strict';
(function () {
const E = window.EOG, Rd = E.render;
const U = E.ui = { sheet: null, splitCounts: {}, lastTouch: 0, groundQueue: [], groundBusy: false };
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = E.fmt, fmtN = E.fmtN;

function costHTML(cost, owner, n) {
  n = n || 1; owner = owner || 'player'; const r = E.state.emp[owner].res; let h = '';
  for (const k of E.RES) if (cost[k]) { const v = cost[k] * n; h += `<span class="c ${r[k] < v ? 'no' : ''}" style="--c:${E.RES_COLOR[k]}">${E.RES_ICON[k]}${fmt(v)}</span>`; }
  return h;
}
// v1.3 quantity sliders (build ships, train troops, load troops). U.qty keeps the chosen value per key.
U.qty = U.qty || {}; U.qtyMeta = {};
function qtySlider(key, max, label, act, data, cost) {
  const v = E.clamp(U.qty[key] || Math.min(max, 1), max ? 1 : 0, Math.max(0, max));
  U.qtyMeta[key] = { label, cost, max };
  let d = ''; for (const k in data) d += ` data-${k}="${esc(data[k])}"`;
  if (!max) return `<div class="qty dis"><input type="range" min="0" max="1" value="0" disabled data-in="qty" data-k="${key}"><b class="qv">0</b><button class="b mini2 dis" disabled>Max</button><button class="b primary dis" disabled>${label}</button></div>`;
  return `<div class="qty"><input type="range" min="1" max="${max}" step="1" value="${v}" data-in="qty" data-k="${key}" aria-label="${esc(label)} quantity"><input type="number" class="qnum" inputmode="numeric" min="1" max="${max}" value="${v}" aria-label="${esc(label)} amount">${btn('Max', 'qtyMax', { k: key, max }, 'mini2')}<button class="b primary qgo" data-a="${act}"${d} data-n="${v}" data-qgo="${key}">${label} ${fmtN(v)}</button>${cost ? `<span class="cost qc" data-qc="${key}">${costHTML(cost, 'player', v)}</span>` : ''}</div>`;
}
U.onQty = function (el) {
  const key = el.dataset.k, v = +el.value, m = U.qtyMeta[key]; U.qty[key] = v; U.lastTouch = performance.now();
  const box = el.closest('.qty') || document;
  
  const tq = box.querySelector('[data-tq]'); if (tq) tq.textContent = E.fmtN(v) + ' trader' + (v === 1 ? '' : 's');
  const go = box.querySelector('[data-qgo]'); if (go && m) { go.dataset.n = v; go.textContent = m.label + ' ' + E.fmtN(v); }
  const qc = box.querySelector('[data-qc]'); if (qc && m && m.cost) qc.innerHTML = costHTML(m.cost, 'player', v);
};
document.addEventListener('input', e => { const el = e.target;
  if (el.dataset && el.dataset.in === 'qty') U.onQty(el); if (el.dataset && el.dataset.in === 'sendLoad' && U.sendSel) { U.lastTouch = performance.now(); U.sendSel.load[el.dataset.f] = +el.value; const v = document.querySelector('[data-lv="' + el.dataset.f + '"]'); if (v) v.textContent = E.fmtN(+el.value); } });
document.addEventListener('change', e => { const el = e.target; if (el.dataset && el.dataset.in === 'sendLoad' && U.sendSel) { U.sendSel.load[el.dataset.f] = +el.value; U.render(false); } if (el.dataset && el.dataset.in === 'annihHalt50' && U.sendSel) { U.sendSel.halt50 = !!el.checked; } });
function energyHTML(p) {
  const u = E.energyUsed(p, true), m = E.energyMax(p);
  return `<div class="energy ${u >= m ? 'full' : ''}"><span>⚡ Energy <b>${u}/${m}</b></span>${bar(u / Math.max(1, m), u >= m ? '#ff6b6b' : '#7fd8ff')}<small class="muted">${u >= m ? 'At capacity — build or upgrade a ⚡ Power Plant' : (m - u) + ' free · buildings draw power, Power Plants and the planet type supply it'}</small></div>`;
}
function bar(frac, color) { return `<div class="bar"><i style="width:${Math.round(E.clamp(frac, 0, 1) * 100)}%;background:${color || '#38e1ff'}"></i></div>`; }
function btn(label, a, data, cls) { let d = ''; for (const k in (data || {})) d += ` data-${k}="${esc(data[k])}"`; return `<button class="b ${cls || ''}" data-a="${a}"${d}>${label}</button>`; }
function factionBadge(o) { const F = E.factionOf ? E.factionOf(o) : (E.FACTIONS[o] || { color: '#8899aa', short: o || 'Unknown' }); return `<span class="badge" style="--c:${F.color}">${Rd.bannerImg ? Rd.bannerImg(o) : ''}${esc(F.short)}</span>`; } // v2.0 O: empire banner; v2.6: safe for Hollow / missing factions
U.flash = function (msg, kind) { E.toast(msg, kind || 'warn'); };

// ---------- top bar ----------
U.updateTop = function () {
  const st = E.state; if (!st) return;
  const em = st.emp.player, inc = em.income || { metal: 0, crystal: 0, rp: 0 };
  const cap = E.storageCap('player');
  const tr = { metal: 0, crystal: 0 }; for (const r of st.routes) if (r.ship && r.blocked == null) { const y = E.routeYield(r, E.routeIncome(st.planets[r.from], st.planets[r.to])); tr[y.k] += y.n; }
  const set = (id, v, sub, full, skipB) => { const el = document.getElementById(id); if (!el) return; if (!skipB) el.querySelector('b').textContent = v; el.querySelector('small').textContent = sub; el.classList.toggle('full', !!full); };
  set('r-metal', fmt(em.res.metal), '+' + fmt(inc.metal + tr.metal) + '/m', em.res.metal >= cap - 1, true);
  set('r-crystal', fmt(em.res.crystal), '+' + fmt(inc.crystal + tr.crystal) + '/m', em.res.crystal >= cap - 1, true);
  const c = em.cmd, cc = document.getElementById('r-cmd');
  if (cc && c) { cc.querySelector('b').textContent = 'Lv ' + c.lv; cc.querySelector('small').textContent = '🪐 ' + E.sysCount() + '/' + E.sysCap(); const xb = cc.querySelector('.xpbar i'); if (xb) xb.style.width = Math.round(E.clamp(c.xp / E.cmdXpFor(c.lv), 0, 1) * 100) + '%'; cc.classList.toggle('full', E.atSysCap()); }
  set('r-rp', fmt(em.rp + (em.research ? (em.rpProg?.[em.research] || 0) : 0)), '+' + fmt(inc.rp) + '/m', false, true);
  const ic = document.getElementById('r-idle');
  if (ic) { const n = E.idleCount(); ic.querySelector('b').textContent = fmt(n.total); ic.classList.toggle('some', n.total > 0); ic.title = n.total ? n.total + ' planet' + (n.total === 1 ? '' : 's') + ' with an empty construction slot — tap to jump there' : 'No empty construction slots'; }
  { const ar = E.armyTotals(), set = (id, v) => { const el = document.getElementById(id); if (!el) return; const b = el.querySelector('b'), t = fmt(v); if (b.textContent !== t) b.textContent = t; el.title = ({ 'a-troops': 'Troops', 'a-fighters': 'Fighters', 'a-destroyers': 'Destroyers', 'a-carriers': 'Warship Carriers', 'a-transports': 'Transports', 'a-freighters': 'Freighters' }[id] || '') + ': ' + E.fmtN(v); }; set('a-troops', ar.troops); set('a-fighters', ar.fighters); set('a-destroyers', ar.destroyers); set('a-carriers', ar.carriers); set('a-transports', ar.transports); set('a-freighters', ar.freighters); }
  // v1.9 item 19: Rift countdown + next-wave size
  { const rb = document.getElementById('riftbar'), ri = E.riftInfo && E.riftInfo();
    if (rb) { let t = '';
      // v2.1 item 3: always show the Rift cycle — OPEN/CLOSED with a countdown to the next change
      if (ri && !ri.open && ri.opensIn <= (E.RIFT_WARN || 600)) t = `<span class="rift-st warn">⚠ RIFT OPENS SOON</span> in <b>${E.fmtTime(ri.opensIn)}</b> · wave 1 ≈ <b>${fmtN(ri.ships)}</b> ships (${fmtN(ri.mine)} at you)`; // v2.2 item 7
      else if (ri && !ri.open) t = `<span class="rift-st closed">☢ Rift CLOSED</span> opens in <b>${E.fmtTime(ri.opensIn)}</b> · wave 1 ≈ <b>${fmtN(ri.ships)}</b> ships (${fmtN(ri.mine)} at you)`;
      else if (ri && ri.phase === 'wave') t = `<span class="rift-st open">☢ Rift OPEN</span> closes in <b>${E.fmtTime(ri.closesIn)}</b> · wave <b>${ri.idx}/${ri.NW}</b> in <b>${E.fmtTime(ri.in)}</b> ≈ <b>${fmtN(ri.ships)}</b> ships (${fmtN(ri.mine)} at you)`;
      else if (ri && ri.phase === 'last') t = `<span class="rift-st open">☢ Rift OPEN</span> closes in <b>${E.fmtTime(ri.closesIn)}</b> · all ${ri.NW} waves out`;
      rb.innerHTML = t; rb.classList.toggle('hidden', !t); rb.classList.toggle('hot', !!(ri && ri.in != null && ri.in < 60)); rb.classList.toggle('open', !!(ri && ri.open)); rb.classList.toggle('warn', !!(ri && !ri.open && ri.opensIn <= (E.RIFT_WARN || 600))); rb.dataset.phase = ri ? ri.phase : ''; } }
  const D = E.DIFFICULTY[st.diff];
  let status;
  if (st.crisis.open) status = '☢ Rift open · wave ' + (st.crisis.cw || 0) + '/' + E.crisisWaves();
  else if (E.riftNextOpen && E.riftNextOpen() != null && st.t > E.riftNextOpen() - 20 * 60) status = '☢ Rift ' + E.fmtTime(E.riftNextOpen() - st.t);
  else status = '⚠ Wave ' + E.fmtTime(st.waves.next - st.t);
  $('#clock').textContent = E.fmtTime(st.t);
  $('#status').textContent = status;
  const left = E.rivals().filter(o => !E.isDefeated(o)).length;
  $('#share').textContent = (st.mode === 'endless' ? '♾' + (st.endless.stage + 1) + ' ' : '') + '☠ ' + (E.rivals().length - left) + '/' + E.rivals().length;
  document.querySelectorAll('[data-a="speed"]').forEach(b => b.classList.toggle('on', !st.paused && +b.dataset.v === st.speed));
  $('#pauseBtn').classList.toggle('on', st.paused);
  $('#pauseBtn').textContent = st.paused ? '▶' : '❚❚';
  $('#muteBtn').textContent = E.audio.muted ? '🔇' : '🔊';
  const incAll = E.incoming(), incA = incAll.filter(a => a.kind === 'attack'), wins = st.windows.filter(w => !w.closed);
  const tb = document.getElementById('navAlerts');
  if (tb) { tb.classList.toggle('alert', incAll.length > 0 || wins.length > 0); tb.classList.toggle('idle', (st._idleN || 0) > 0); tb.dataset.idle = st._idleN || ''; }
  updateStrip(incA, wins);
  const bb = st.battles.some(b => !b.done && (b.owners[0].includes('player') || b.owners[1].includes('player')));
  $('#battleBtn').classList.toggle('hidden', !bb);
};

function updateStrip(incA, wins) {
  const st = E.state, strip = $('#alertStrip'); if (!strip) return;
  // v2.7: the full incoming-attack list lives in updateStrip27. Do not fight it
  // by rewriting #alertStrip to a single row (that also reflowed --tbh).
  if (E.updateStrip27) {
    E.updateStrip27();
    document.querySelectorAll('[data-eta-fid]').forEach(el => { const f = E.fleetById(+el.dataset.etaFid); if (f && f.path.length) el.textContent = E.fmtTime(E.fleetETA(f)); });
    document.querySelectorAll('[data-wend]').forEach(el => { el.textContent = E.fmtTime(Math.max(0, +el.dataset.wend - st.t)); const bar = el.closest('.alertcard') && el.closest('.alertcard').querySelector('.wbar i'); if (bar) bar.style.width = Math.max(0, Math.min(100, (+el.dataset.wend - st.t) / E.ATTACK_WINDOW * 100)) + '%'; });
    const tb = $('#topbar'), h = tb.offsetHeight; if (U._tbh !== h) { U._tbh = h; document.documentElement.style.setProperty('--tbh', h + 'px'); }
    return;
  }
  let cls = 'alertrow hidden', html = '';
  if (wins.length) {
    const w = wins.slice().sort((a, b) => a.end - b.end)[0];
    cls = 'alertrow win';
    const wn = st.systems[w.sys] ? st.systems[w.sys].name : 'a system';
    html = `<span>⚔</span><span class="grow">Battle at <b>${esc(wn)}</b> — reinforce now!</span><b>${E.fmtTime(Math.max(0, w.end - st.t))}</b>`;
  } else if (incA.length) {
    const a = incA[0]; cls = 'alertrow';
    const F = E.factionOf ? E.factionOf(a.owner) : (E.FACTIONS[a.owner] || { short: a.owner || 'Enemy' });
    const tn = st.systems[a.target] ? st.systems[a.target].name : 'a system';
    html = `<span>⚠</span><span class="grow">${incA.length > 1 ? incA.length + ' attacks · soonest: ' : ''}${esc(F.short)} → <b>${esc(tn)}</b>${a.scouted ? ' 🔭' : ''}</span><b>${E.fmtTime(a.eta)}</b>`;
  }
  if (strip._h !== html || strip.className !== cls) { strip.innerHTML = html; strip.className = cls; strip._h = html; }
  // live countdowns inside an open Alerts sheet
  document.querySelectorAll('[data-eta-fid]').forEach(el => { const f = E.fleetById(+el.dataset.etaFid); if (f && f.path.length) el.textContent = E.fmtTime(E.fleetETA(f)); });
  document.querySelectorAll('[data-wend]').forEach(el => { el.textContent = E.fmtTime(Math.max(0, +el.dataset.wend - st.t)); const bar = el.closest('.alertcard') && el.closest('.alertcard').querySelector('.wbar i'); if (bar) bar.style.width = Math.max(0, Math.min(100, (+el.dataset.wend - st.t) / E.ATTACK_WINDOW * 100)) + '%'; });
  const tb = $('#topbar'), h = tb.offsetHeight; if (U._tbh !== h) { U._tbh = h; document.documentElement.style.setProperty('--tbh', h + 'px'); }
}

// ---------- sheets ----------
U.open = function (type, opts) {
  U.sheet = Object.assign({ type }, opts || {});
  if (type === 'system') { Rd.sel.sys = opts.sys; Rd.sel.fleet = null; }
  if (type === 'fleet') { Rd.sel.fleet = opts.fid; }
  $('#sheet').classList.remove('hidden');
  document.body.classList.add('sheet-open');
  $('#sheet').dataset.type = type; // v2.2 item 10: the planet window sits lower (CSS)
  U.render(true);
  U.syncSheetTop();
  E.emit('sfx', 'click');
  if (Rd.sheetChanged) Rd.sheetChanged(); // v2.1 item 1: animated close-up in the panel, camera stays put
};
// v2.2 item 10: keep alerts out of the panel's ✕ — the open panel sits above the toast / battle-card / capture-banner
// layers, and in portrait the toast stack is clipped to the gap between the top bar and the panel's top edge.
U.syncSheetTop = function () {
  const sh = $('#sheet'); if (!sh || sh.classList.contains('hidden')) return;
  const r = sh.getBoundingClientRect(); document.documentElement.style.setProperty('--sheetTop', Math.round(r.top) + 'px');
  const tb = document.getElementById('topbar'); if (tb) document.documentElement.style.setProperty('--tbhLive', Math.round(tb.getBoundingClientRect().bottom) + 'px');
};
window.addEventListener('resize', () => U.syncSheetTop && U.syncSheetTop());
U.close = function () { U.sheet = null; $('#sheet').classList.add('hidden'); document.body.classList.remove('sheet-open'); Rd.sel.fleet = null; if (Rd.sheetChanged) Rd.sheetChanged(); };
U.render = function (resetScroll) {
  if (!U.sheet) return;
  const body = $('#sheet-body'), sc = body.scrollTop;
  const r = RENDER[U.sheet.type]; if (!r) return;
  let out;
  try { out = r(U.sheet); } catch (e) { console.error(e); out = { title: 'Error', html: '<p>' + esc(e.message) + '</p>' }; }
  if (!out) { U.close(); return; }
  $('#sheet-title').innerHTML = out.title;
  body.innerHTML = out.html;
  body.scrollTop = resetScroll ? 0 : sc;
  if (resetScroll) U.syncSheetTop();
};
U.refresh = function () { if (U.sheet && !U.holding && performance.now() - U.lastTouch > 600) U.render(false); };
// v1.9 item 5: never re-render under a finger that is still holding a slider (a long press used to drop the drag)
document.addEventListener('pointerdown', e => { if (e.target && e.target.type === 'range') U.holding = true; }, true);
for (const ev of ['pointerup', 'pointercancel', 'touchend', 'touchcancel']) document.addEventListener(ev, () => { if (U.holding) { U.holding = false; U.lastTouch = performance.now(); } }, true);

const RENDER = {};

RENDER.system = function (o) {
  const st = E.state, s = st.systems[o.sys];
  if (s.rift) return { title: '☢ The Rift', html: `<p class="muted">A wound in space beyond the last Lantern Gate. ${st.crisis.open ? 'OPEN — the Hollow pours through it.' : st.crisis.started ? 'Closed for now; it re-opens on a cycle.' : 'Long-range scans show something vast and patient on the other side. ETA: ' + E.fmtTime(E.crisisAt() - st.t)}</p><p>The Rift cannot be colonised.</p>` };
  const p = st.planets[s.planetId], T = E.PLANET_TYPES[p.type];
  const mine = p.owner === 'player';
  const head = `<div class="phead"><canvas class="pthumb" data-ptype="${p.type}" width="56" height="56"></canvas><div><div>${factionBadge(p.owner)} <b>${T.name}</b> world · ${E.planetSlots(p)} slots ${p.spec ? '· ' + E.SPECS[p.spec].icon + ' ' + E.SPECS[p.spec].name : ''}</div><div class="muted small">${T.desc}</div>${T.shipSpeed ? `<div class="small good shipworld">🚀 <b>${T.tag || 'Shipwright world'}</b> — ships build ${Math.round((T.shipSpeed - 1) * 100)}% faster here</div>` : ''}${p.perfect ? '<div class="perfect small">✦ <b>Perfect planet</b> — every planet-type bonus and every specialization at once</div>' : ''}</div></div>`;
  const title = esc(p.name) + (st.emp.player.home === p.id && mine ? ' ★' : '');
  if (!mine) return { title, html: head + intel(p) };
  const headE = head + energyHTML(p);
  const tabs = [['build', 'Build'], ['overview', 'Overview'], ['defense', 'Defense'], ['troops', 'Troops'], ['shipyard', 'Shipyard']]; // v1.6: Build first and default; fleet control lives in the bottom Fleets tab
  if (st.emp.player.home === p.id && E.hq) tabs.unshift(['hq', '🏛 HQ']); // v2.5: HQ is the first tab on the capital
  const tab = (o.tab && o.tab !== 'fleets' && TAB[o.tab]) ? o.tab : 'build';
  let h = headE + `<div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${tab === k ? 'on' : ''}" data-a="tab" data-tab="${k}">${l}</button>`).join('')}</div>`;
  h += TAB[tab](p, o);
  return { title, html: h };
};

// v1.3: is this world attackable now? '' or the reason (behind the enemy front)
function frontNote(p) {
  if (p.owner === 'player') return '';
  const fl = E.state.fleets.filter(f => f.owner === 'player' && f.ships.length);
  const from = fl.length ? fl.map(f => f.path.length ? f.path[0] : f.sys) : E.playerPlanets().map(q => q.sys);
  if (from.some(s => !E.targetBlock('player', s, p.sys))) return '';
  return E.targetBlock('player', from[0], p.sys) || 'No route';
}
function intel(p) {
  const st = E.state;
  const fn = frontNote(p);
  const frontCard = E.blocksPassage('player', p.sys) ? (fn ? `<div class="card front no">🚫 <b>Not attackable yet</b><div class="small">${esc(fn)}. Fleets can't fly through enemy worlds — only front-line planets next to space you can reach are targets.</div></div>` : '<div class="card front ok">⚔ <b>Front-line world</b><div class="small">Your fleets can reach and attack it.</div></div>') : '';
  let I = (st.intel || {})[p.sys]; if (I && I.owner !== p.owner) I = null; // a scan of a previous owner is worthless
  const busy = (st.scoutMissions || []).find(m => m.kind === 'planet' && m.target === p.sys);
  const best = E.bestScoutFor('planet', p.sys);
  let scan = busy ? `<div class="small">📡 Scouts en route — report in ${E.fmtTime(busy.done - st.t)}</div>` : best ? btn(`📡 Scan with scouts from ${esc(best.p.name)} (Lv${best.L}, ${E.fmtTime(best.t)})`, 'scan', { k: 'planet', id: p.sys }, I ? 'mini2' : 'primary mini2') : `<div class="small muted">📡 ${E.scoutPosts().length ? 'All Scout Posts are busy' : 'Build a Scout Post to scan enemy worlds'}</div>`;
  if (!I) {
    let h0 = frontCard + `<div class="card"><h4>Unknown world</h4><p class="small muted">No scout snapshot yet, so the map shows no ship or troop counts here. Defenses, garrison and fleets in orbit are unknown until you scan.</p>${scan}</div>`;
    h0 += `<div class="row">${btn('🚀 Send fleets here', 'send', { s: p.sys }, 'primary')}${btn('🎯 Center', 'jump', { s: p.sys })}</div>`;
    const rel0 = E.isPeaceful(p.owner) ? (st.emp[p.owner].war ? '<p class="bad">At war with the ' + E.FACTIONS[p.owner].name + '.</p>' : '<p class="muted">' + E.FACTIONS[p.owner].name + ': at peace. You can trade with them. Attacking declares war.</p>') : '';
    return h0 + rel0;
  }
  const age = st.t - I.t;
  let hh = frontCard + `<div class="card"><h4>📡 Scout snapshot · Lv${I.level} · ${E.fmtTime(age)} old</h4><div class="small muted">Numbers from the latest scout only — they don't update by themselves. Scan again for fresh ones.</div>`;
  hh += `<div class="grid2"><div>◯ Shield Lv${E.fmtRange(I.def.shield)}</div><div>✛ Turrets ${E.fmtRange(I.def.turret)}</div><div>✳ Mines Lv${E.fmtRange(I.def.mines)}</div><div>⬢ Stations ${E.fmtRange(I.def.station)}</div></div>`;
  hh += `<div class="small" style="margin-top:4px">Garrison: ${Object.entries(I.troops).map(([k, r]) => E.TROOPS[k].icon + ' ' + E.fmtRange(r) + '× ' + E.TROOPS[k].short).join(' · ') || 'none seen'}</div>`;
  hh += `<div class="small">Ships in orbit: ${Object.entries(I.ships).map(([k, r]) => E.fmtRange(r) + '× ' + E.HULLS[k].short).join(' · ') || 'none seen'}</div>${scan}</div>`;
  if (true) { const rel1 = E.isPeaceful(p.owner) ? (st.emp[p.owner].war ? '<p class="bad">At war with the ' + E.FACTIONS[p.owner].name + '.</p>' : '<p class="muted">' + E.FACTIONS[p.owner].name + ': at peace. Attacking declares war.</p>') : '';
    return hh + `<div class="row">${btn('🚀 Send fleets here', 'send', { s: p.sys }, 'primary')}${btn('🎯 Center', 'jump', { s: p.sys })}</div>` + rel1; }
  const dr = E.defenseRating(p), sm = E.shieldMax(st, p);
  let h = '<div class="card"><h4>Orbital defenses</h4>';
  h += `<div class="grid2"><div>◯ Shield Lv${p.def.shield} ${sm ? Math.round(p.shieldHp / sm * 100) + '%' : ''}</div><div>✛ Turrets ${p.def.turret}</div><div>✳ Mines Lv${p.def.mines}</div><div>⬢ Stations ${p.def.station}</div><div>🔆 Lasers ${p.def.laser || 0}</div><div>⇉ Railgun ${p.def.railgun || 0}</div></div>`;
  h += `<div class="muted small">Defense power ≈ ${fmt(dr.power)}</div></div>`;
  h += `<div class="card"><h4>Garrison</h4><div class="grid2">${E.TROOP_KEYS.map(k => `<div>${E.TROOPS[k].icon} ${E.TROOPS[k].name}: ${fmtN(p.garrison[k])}</div>`).join('')}</div><div class="muted small">Bunkers Lv${E.bSum(p, 'bunker')} · defense ×${E.garrisonDefMult(p, 0).toFixed(2)} · troop power to beat ≈ ${fmt(E.troopPower(p.garrison, p.owner) * E.garrisonDefMult(p, 0))}</div></div>`;
  const bl = p.slots.slice(0, E.planetSlots(p)).filter(s => s.b).map(s => E.BUILDINGS[s.b].icon + ' ' + E.BUILDINGS[s.b].name + ' ' + s.lvl).join(' · ');
  h += `<div class="card"><h4>Infrastructure</h4><div class="small">${bl || 'None'}</div></div>`;
  const here = E.fleetsAt(p.sys).filter(f => f.owner !== 'player');
  if (here.length) h += `<div class="card"><h4>Fleets in orbit</h4>${here.map(f => `<div>${factionBadge(f.owner)} ${f.ships.length} ships · power ${fmt(E.fleetStats(f).power)}</div>`).join('')}</div>`;
  const rel = E.isPeaceful(p.owner) ? (st.emp[p.owner].war ? '<p class="bad">At war with the ' + E.FACTIONS[p.owner].name + '.</p>' : '<p class="muted">' + E.FACTIONS[p.owner].name + ': at peace. You can trade with them. Attacking declares war.</p>') : '';
  h += rel;
  h += `<div class="row">${btn('🚀 Send fleet here', 'send', { s: p.sys }, 'primary')}`;
  const tradeFrom = E.playerPlanets().filter(q => E.bLevel(q, 'tradeport') && E.validTradeTarget(q, p));
  if (tradeFrom.length) h += btn('⚖ Trade route here', 'routeToPick', { to: p.id });
  h += btn('🎯 Center', 'jump', { s: p.sys }) + '</div>';
  const b = E.battleAt(p.sys); if (b) h += `<div class="row">${btn('⚔ Battle status', 'watch', { s: p.sys }, 'warn')}</div>`;
  return h;
}

const TAB = {};
TAB.overview = function (p) {
  const st = E.state, pr = E.planetProd(p);
  const dockedN = E.fleetsAt(p.sys, 'player').reduce((a, f) => a + f.ships.length, 0);
  let h = (p.id === st.emp.player.home && E.hq ? U.hqFirstBtn() : '') + `<div class="card small">🚀 ${E.fmtN(dockedN)} ship${dockedN === 1 ? '' : 's'} docked here · fleet control lives in the bottom <b>Fleets</b> tab ${btn('Open Fleets here', 'fleetsAt', { s: p.sys }, 'mini2')}</div>`;
  h += '<div class="card"><h4>Production / min</h4><div class="grid2">';
  for (const k of E.RES) h += `<div style="color:${E.RES_COLOR[k]}">${E.RES_ICON[k]} ${k} +${fmt(pr[k])}</div>`;
  h += `<div style="color:${E.RES_COLOR.rp}">⚗ research +${fmt(pr.rp)}</div></div>${p.blockade ? '<p class="bad">⛓ Blockaded: production and construction at 50%.</p>' : ''}</div>`;
  h += '<div class="card"><h4>Planet bonus</h4>';
  if (!p.spec) h += '<p class="muted small">Pick one bonus type for this world (free the first time).</p>';
  h += '<div class="specs">' + Object.entries(E.SPECS).map(([k, s]) => `<button class="b spec ${p.spec === k ? 'on' : ''}" data-a="spec" data-p="${p.id}" data-s="${k}"><b>${s.icon} ${s.name}</b><small>${s.desc}</small></button>`).join('') + '</div>';
  if (p.spec) h += '<p class="muted small">Changing costs 300 metal.</p>';
  h += '</div>';
  const dr = E.defenseRating(p), sm = E.shieldMax(st, p);
  h += `<div class="card"><h4>Defenses & garrison</h4><div class="grid2"><div>◯ Shield ${sm ? Math.round(p.shieldHp / sm * 100) + '%' : 'none'}</div><div>✛ Turrets ${p.def.turret}/${E.defCap(p, 'turret')}</div><div>✳ Mines Lv${p.def.mines} ${p.def.mines ? Math.round(p.mineCharge * 100) + '%' : ''}</div><div>⬢ Stations ${p.def.station}</div><div>🔆 Lasers ${p.def.laser || 0}</div><div>⇉ Railgun ${p.def.railgun || 0}</div></div>`;
  { const ab = E.aboardAt(p); h += `<div class="small">Troops ${E.fmtN(E.troopSize(p.garrison))} · ${E.TROOP_KEYS.map(k => E.TROOPS[k].icon + fmtN(p.garrison[k])).join(' ')}${ab ? ` <span class="good">+ ${E.fmtN(ab)} aboard docked transports (they defend too)</span>` : ''}</div><div class="small muted">Ground defense ≈ ${fmt(E.groundDefense(p))}</div></div>`; }
  const qs = [['build', 'Building'], ['def', 'Defense'], ['ship', 'Shipyard'], ['troop', 'Barracks']];
  h += '<div class="card"><h4>Queues</h4>' + qs.map(([q, l]) => { const it = p.queues[q][0]; if (!it) return `<div class="small">${l}: <span class="muted">idle</span></div>`; const t = qTimes(q, it, true); return `<div class="small">${l}: ${qLabel(q, it)} · <b>${E.fmtTime(t.unit)}</b>${t.batch ? ' this unit · ' + E.fmtTime(t.all) + ' batch' : ''}${p.queues[q].length > 1 ? ' · queue ' + E.fmtTime(queueTotal(p, q)) + ' (+' + (p.queues[q].length - 1) + ')' : ''}</div>`; }).join('') + '</div>';
  h += rallyCard(p);
  const routes = st.routes.filter(r => r.from === p.id);
  h += `<div class="card"><h4>Trade</h4><div class="small">Trader slots ${routes.length}/${E.routeCap(p)}${E.routeCap(p) ? '' : ' — build a Trade Center'}</div>${routes.map(r => `<div class="small">→ ${esc(st.planets[r.to].name)} ${r.ship ? (r.blocked != null ? '<span class="bad">blocked</span>' : (y => '+' + fmt(y.n) + E.RES_ICON[y.k] + '/m')(E.routeYield(r, E.routeIncome(p, st.planets[r.to])))) : '<span class="bad">no freighter</span>'}</div>`).join('')}${E.routeCap(p) > routes.length ? btn('⚖ New route from here', 'routeFrom', { p: p.id }) : ''}</div>`;
  return h;
};
function qLabel(q, it) {
  if (q === 'build') return E.BUILDINGS[it.b].icon + ' ' + E.BUILDINGS[it.b].name + ' Lv' + it.lvl;
  if (q === 'def') return E.DEFENSES[it.d].icon + ' ' + E.DEFENSES[it.d].name;
  if (q === 'ship') return fmtN(it.n) + '× ' + E.HULLS[it.h].name;
  return fmtN(it.n) + '× ' + E.TROOPS[it.tr].name;
}
// v1.5: time left on the current unit AND on the whole batch (ships/troops), plus the whole queue
function qTimes(q, it, first) {
  const batch = q === 'ship' || q === 'troop';
  const unit = first ? it.left : it.total;
  const all = batch ? unit + Math.max(0, (it.n || 1) - 1) * it.total : unit;
  return { unit, all, batch: batch && (it.n || 1) > 1 };
}
U.qTimes = qTimes;
function queueTotal(p, q) { return p.queues[q].reduce((a, it, i) => a + qTimes(q, it, i === 0).all, 0); }
function queueHTML(p, q) {
  const list = p.queues[q]; if (!list.length) return '';
  const rows = list.map((it, i) => { const t = qTimes(q, it, i === 0);
    const tl = t.batch ? `<span class="small qt">${it.total < 1 ? '<b>' + E.fmtUnit(it.total) + '</b> each' : '<b>' + E.fmtTime(t.unit) + '</b> this unit'}<br><span class="muted">${E.fmtTime(t.all)} batch</span></span>` : `<span class="small qt"><b>${E.fmtTime(t.unit)}</b>${i ? '<br><span class="muted">queued</span>' : ''}</span>`;
    const sk = q === 'build' && i === 0, tl2 = sk ? tl.replace(/<\/span>$/, skipBtn(p, it) + '</span>') : tl;
    return `<div class="qi${sk ? ' hasskip' : ''}"><span>${qLabel(q, it)}</span>${i === 0 ? bar(1 - it.left / it.total) : '<span class="muted small">queued</span>'}${tl2}<button class="x" data-a="cancel" data-p="${p.id}" data-q="${q}" data-i="${i}" aria-label="Cancel">✕</button></div>`; }).join('');
  return `<div class="queue">${rows}<div class="small muted qsum">⏱ Whole queue: <b>${E.fmtTime(queueTotal(p, q))}</b>${list.length > 1 ? ' · ' + list.length + ' orders' : ''}${q === 'build' && list.length > 1 ? skipAllBtn(p) : ''}</div></div>`;
}
// v1.9 items 8 / 21: finish building upgrades instantly for metal
function skipBtn(p, it) {
  const c = E.skipCostQ(it, true), ok = E.state.emp.player.res.metal >= c;
  return `<button class="skipb ${ok ? '' : 'dis'}" data-a="skip" data-p="${p.id}" ${ok ? '' : 'disabled'} aria-label="Finish now for ${c} metal">⏩ ${E.RES_ICON.metal}${fmtN(c)}</button>`;
}
function skipAllBtn(p) {
  const c = E.skipAllCost(p), ok = E.state.emp.player.res.metal >= c;
  return ` <button class="skipb skipall ${ok ? '' : 'dis'}" data-a="skipAll" data-p="${p.id}" ${ok ? '' : 'disabled'}>⏩ Skip all ${E.RES_ICON.metal}${fmtN(c)}</button>`;
}
TAB.hq = function () { return U.hqTipHTML() + hqHTML(); }; // v2.1 item 2 (+ v2.2 item 6 tip)
// v2.2 item 6: first-time Headquarters tip (once per device, dismissible)
U.hqFirstBtn = function () {
  return '<div class="row" style="margin:6px 0">' + btn('🏛 Headquarters', 'tab', { tab: 'hq' }, 'primary mini2') + '</div>';
};
U.hqTipHTML = function () {
  if (!E.hq || !E.tipSeen || E.tipSeen('hq')) return '';
  return `<div class="card tip" id="hqTip"><div class="hrow"><h4>🏛 Tip · Headquarters</h4><button class="x" data-a="hqTipOk" aria-label="Dismiss tip">✕</button></div><div class="small">Your <b>Headquarters level caps the level of every building on every planet</b> (it starts at Lv${E.HQ_START || 5}, so buildings stop at Lv${E.HQ_START || 5}). Spend <b>research points</b> at the HQ (capital › HQ tab) to raise the cap — Lv8 / Lv12 unlock extra building slots. Pause research to bank points faster.</div><div class="row">${btn('Got it', 'hqTipOk', {}, 'mini2')}${btn('🏛 Open HQ', 'hqTipHQ', {}, 'mini2')}</div></div>`;
};
U.renderBuildQueueMini = function (p) {
  const box = document.getElementById('pvqueue'); if (!box) return;
  if (!p || p.owner !== 'player') { box.innerHTML = ''; return; }
  const list = (p.queues && p.queues.build) || [];
  let h = '';
  for (let i = 0; i < 3; i++) {
    const it = list[i];
    if (!it) { h += '<div class="pvq empty"><span class="pvq-icon">＋</span><span class="pvq-lv">empty</span></div>'; continue; }
    const B = E.BUILDINGS[it.b] || {};
    const icon = (Rd.buildingImg && Rd.buildingImg(it.b)) || B.icon || '🏗';
    const pct = it.total ? Math.max(0, Math.min(1, 1 - it.left / it.total)) * 100 : 0;
    h += `<div class="pvq"><button class="x" data-a="cancel" data-p="${p.id}" data-q="build" data-i="${i}" aria-label="Cancel">✕</button><span class="pvq-icon">${icon}</span><span class="pvq-lv">Lv ${it.lvl}</span><span class="pvq-t">${E.fmtTime(it.left)}</span><span class="pvq-bar"><i style="width:${pct.toFixed(1)}%"></i></span></div>`;
  }
  // Reserved skip strip (same height empty or filled) so the pane below never shifts.
  if (list.length) {
    h += '<div class="pvq-skip">' + skipBtn(p, list[0]) + (list.length > 1 ? skipAllBtn(p) : '') + '</div>';
  } else {
    h += '<div class="pvq-skip empty"></div>';
  }
  box.innerHTML = h;
};
TAB.build = function (p, o) {
  let h = (p.id === E.state.emp.player.home && E.hq ? U.hqFirstBtn() : '') + (p.owner === 'player' && (p.id === E.state.emp.player.home || p.slots.some(s => s.b && E.hqCap && s.lvl >= E.hqCap('player'))) ? U.hqTipHTML() : '') /* v2.6: build queue lives in the top pane (#pvqueue), so the tab no longer shifts */;
  const eU = E.energyUsed(p, true), eM = E.energyMax(p);
  const n = E.planetSlots(p);
  h += '<div class="slots">';
  for (let i = 0; i < n; i++) {
    const s = p.slots[i];
    const queued = p.queues.build.filter(q => q.slot === i);
    const type = s.b || (queued[0] && queued[0].b);
    if (!type) {
      if (o.pick === i) {
        h += `<div class="slot pick"><div class="muted small">Choose a building for slot ${i + 1}:</div>`;
        for (const [k, B] of Object.entries(E.BUILDINGS)) {
          const unique = !B.multi && (E.bCount(p, k) || p.queues.build.some(q => q.b === k && !p.slots[q.slot].b));
          if (unique) continue;
          const c = E.bCost(k, 1, 'player'), noE = B.energy && eU + B.energy > eM;
          const have = E.bCount(p, k);
          h += `<button class="b opt ${noE ? 'dis' : ''}" data-a="build" data-p="${p.id}" data-slot="${i}" data-b="${k}">${Rd.buildingImg ? Rd.buildingImg(k) : ''}<b>${B.icon} ${B.name}${B.multi && have ? ' <span class="muted small">(copy ' + (have + 1) + (['mine', 'power', 'lab'].includes(k) ? ' · ×' + Math.pow(E.MULTI_DR, have).toFixed(2) + ' output' : ' · stacks in full') + ')</span>' : ''}</b><small>${B.desc}</small><span class="cost">${costHTML(c)} ⏱${E.fmtTime(E.bTime(k, 1, 'player'))} ${k === 'plant' ? '<span class="good">+' + E.ENERGY_PER_PLANT + '⚡</span>' : `<span class="${noE ? 'bad' : 'muted'}">−${B.energy}⚡</span>`}</span></button>`;
        }
        h += btn('Cancel', 'pickb', { p: p.id, slot: -1 }) + '</div>';
      } else h += `<button class="slot empty" data-a="pickb" data-p="${p.id}" data-slot="${i}">＋ Empty slot — tap to build</button>`;
      continue;
    }
    const lvl = s.lvl + queued.length;
    const B = E.BUILDINGS[type];
    const next = lvl + 1;
    let info = '';
    if (type === 'mine' || type === 'power' || type === 'lab') { const base = { mine: 34, power: 46, lab: 9 }[type]; info = '+' + fmt(base * Math.max(1, s.lvl) * Math.pow(1.13, Math.max(1, s.lvl) - 1) / E.TIME_MUL) + '/m' + (E.bCount(p, type) > 1 ? ' before stacking' : ''); }
    if (type === 'plant') info = '+' + (s.lvl * E.ENERGY_PER_PLANT) + '⚡ capacity';
    if (type === 'shipyard') info = (s.lvl >= 15 ? 'All ships unlocked' : s.lvl >= 10 ? 'Warship Carrier unlocked · Freighter at Lv15' : s.lvl >= 3 ? 'Destroyers unlocked · Carrier at Lv10' : 'Fighters, Transports, Traders · Destroyers at Lv3') + ' · speed ×' + E.yardSpeed(p).toFixed(2);
    if (type === 'tradeport') info = E.traderSlotsFor(s.lvl) + ' trader slots (planet total ' + E.routeCap(p) + ')';
    if (type === 'bunker') info = '+' + (s.lvl * 15) + '% garrison def (stacks: ×' + E.garrisonDefMult(p, 0).toFixed(2) + ' total)';
    if (type === 'barracks') info = 'no troop cap';
    h += `<div class="slot">${Rd.buildingImg ? Rd.buildingImg(type) : ''}<div class="sl"><b>${B.icon} ${B.name}</b> <span class="lv">Lv ${s.lvl}${queued.length ? '→' + lvl : ''}</span><div class="muted small">${info}${B.energy ? ' · uses ' + (B.energy * s.lvl) + '⚡' : ''}</div></div>`;
    if (o.confirm === i && s.b) {
      const ref = E.demolishRefund(p, i);
      h += `<div class="col confirm"><span class="small bad">Demolish? Refund ${costHTML(ref)}</span><span class="row">${btn('Yes, demolish', 'demolishDo', { p: p.id, slot: i }, 'warn mini2')}${btn('Keep', 'demolishAsk', { p: p.id, slot: -1 }, 'mini2')}</span></div>`;
    } else {
      const noE = B.energy && eU + B.energy > eM;
      if (next <= E.BUILD_MAX_LVL && E.hqCap && next > E.hqCap('player')) h += `<button class="b up dis hqcap" data-a="openHQ" title="Raise the Headquarters level with research points">🏛 HQ Lv${E.hqLevel('player')} cap<span class="cost">upgrade HQ for Lv${next}</span></button>`; // v2.1 item 2
      else if (next <= E.BUILD_MAX_LVL) { const c = E.bCost(type, next, 'player'); h += `<button class="b up ${noE ? 'dis' : ''}" data-a="build" data-p="${p.id}" data-slot="${i}">⬆ Lv${next}<span class="cost">${costHTML(c)} ⏱${E.fmtTime(E.bTime(type, next, 'player'))}${B.energy ? ` <span class="${noE ? 'bad' : 'muted'}">−${B.energy}⚡</span>` : ''}</span></button>`; }
      else h += '<span class="muted small">MAX</span>';
      if (s.b && !queued.length) h += `<button class="x demo" data-a="demolishAsk" data-p="${p.id}" data-slot="${i}" aria-label="Demolish" title="Demolish">🗑</button>`;
    }
    h += '</div>';
  }
  h += '</div>';
  if (n < p.slots.length) h += `<p class="muted small">${E.has('player', 'e8') ? '' : 'Research Terraforming for +1 slot. '}Slots: ${n}</p>`;
  h += `<p class="muted small">Any building can be built more than once. Extra Extractors and Labs give ×${E.MULTI_DR} of the one before; extra Shipyards, Barracks, Bunkers and Trade Centers stack in full. 🗑 demolishes a building and refunds ${Math.round(E.DEMOLISH_REFUND * 100)}% of what it cost.</p>`;
  return h;
};
TAB.defense = function (p) {
  const st = E.state;
  let h = queueHTML(p, 'def');
  const ts = E.turretStats(p), ss = E.stationStats(p), sm = E.shieldMax(st, p);
  const rows = [
    ['shield', `Lv ${p.def.shield} · ${fmt(p.shieldHp)}/${fmt(sm)} HP`],
    ['turret', `${p.def.turret}/${E.defCap(p, 'turret')} · each ${fmt(ts.hp)} HP, ${fmt(ts.dps)} dps`],
    ['mines', `Lv ${p.def.mines} · ${fmt(E.mineDamage(p))} dmg per ship · charge ${Math.round(p.mineCharge * 100)}%`],
    ['station', `${p.def.station}/${E.defCap(p, 'station')} · each ${fmt(ss.hp)} HP, ${fmt(ss.dps)} dps`],
    ['laser', `${p.def.laser || 0}/${E.defCap(p, 'laser')} · beam, ramp ×${E.LASER_RAMP_MAX || 3} over ${E.LASER_RAMP || 8}s, unlimited range`],
    ['railgun', `${p.def.railgun || 0}/${E.defCap(p, 'railgun')} · ${fmt((E.railgunStats(p).shot))} dmg / ${E.railgunStats(p).cd}s, unlimited range`],
  ];
  for (const [d, info] of rows) {
    const D = E.DEFENSES[d];
    const queued = p.queues.def.filter(q => q.d === d).length;
    const next = p.def[d] + queued + 1;
    const cap = E.defCap(p, d);
    h += `<div class="slot"><div class="sl"><b>${D.icon} ${D.name}</b><div class="small">${info}</div><div class="muted small">${D.desc}${d === 'station' && E.bLevel(p, 'shipyard') < 4 ? ' Needs Shipyard 4.' : ''}</div></div>`;
    if (next <= cap) h += `<button class="b up" data-a="def" data-p="${p.id}" data-d="${d}">${(d === 'turret' || d === 'station' || d === 'laser' || d === 'railgun') ? '＋ Build' : '⬆ Lv' + next}<span class="cost">${costHTML(E.defCost(d, next))} ⏱${E.fmtTime(E.defTime(d, next, 'player'))}</span></button>`;
    else h += '<span class="muted small">MAX</span>';
    h += '</div>';
  }
  h += `<p class="muted small">Shields absorb all damage to turrets and stations until depleted, and burn up to half of a landing force. Turrets prioritise Transports. Defense-bonus worlds get +40% defense HP.</p>`;
  return h;
};
TAB.troops = function (p) {
  let h = queueHTML(p, 'troop');
  const b = E.bLevel(p, 'barracks');
  h += `<div class="card small">Garrison ${E.fmtN(E.troopSize(p.garrison))} troops${E.aboardAt(p) ? ` + <b class="good">${E.fmtN(E.aboardAt(p))} aboard docked transports</b> (they defend too; unload them from the Fleets tab to garrison)` : ''} · Defense ×${E.garrisonDefMult(p, 0).toFixed(2)} from bunkers${p.spec === 'defense' ? ', defense bonus' : ''} & tech${b ? '' : '<br><b class="bad">Build Barracks to train troops.</b>'}</div>`;
  for (const k of E.TROOP_KEYS) {
    const T = E.TROOPS[k];
    const locked = b < T.barracks;
    h += `<div class="slot"><div class="sl"><b>${T.icon} ${T.name}</b> <span class="lv">×${fmtN(p.garrison[k])}</span><div class="small muted">ATK ${T.atk} · DEF ${T.def} · size ${T.size}${T.desc ? ' · ' + T.desc : ''}</div><span class="cost">${costHTML(T.cost)} each · ⏱${E.fmtUnit(T.time * E.TIME_MUL / E.troopSpeed(p))} · ≈${fmtN(Math.floor(60 * E.troopSpeed(p) / (T.time * E.TIME_MUL)))}/min</span></div>`;
    h += '</div>';
    if (locked) h += `<span class="muted small">Barracks ${T.barracks}</span>`;
    else { const mx = p.queues.troop.length >= 5 ? 0 : E.maxTroops(p, k); h += qtySlider('troop:' + p.id + ':' + k, mx, 'Train', 'troop', { p: p.id, tr: k }, T.cost); if (!mx) h += `<div class="small muted">${p.queues.troop.length >= 5 ? 'Training queue full' : E.troopRoom(p) < 1 ? 'Garrison full — build or upgrade Barracks/Bunkers' : 'Not enough metal'}</div>`; }
  }
  h += `<p class="muted small">Barracks speed ×${E.troopSpeed(p).toFixed(2)}${E.bCount(p, 'barracks') > 1 ? ' (' + E.bCount(p, 'barracks') + ' barracks)' : ''}. Troops ride in Transports: open a fleet and use <b>⬆ Load troops</b>, or the <b>Load troops</b> step when sending. Invade needs troops aboard; Colonize does not (v1.5). Troops stay aboard until you press <b>⬇ Unload</b>; transports docked at your planet add their troops to its defense.</p>`;
  return h;
};
TAB.shipyard = function (p, o) {
  const em = E.state.emp.player;
  let h = queueHTML(p, 'ship');
  const yard = E.bLevel(p, 'shipyard');
  if (!yard) return h + '<p class="bad">No Shipyard on this planet. Build one in the Build tab.</p>';
  const forgeB = E.forgeBoost(p), shipT = E.ptype(p).shipSpeed;
  h += `<div class="muted small">Shipyard Lv${yard}${E.bCount(p, 'shipyard') > 1 ? ' (+' + (E.bCount(p, 'shipyard') - 1) + ' more)' : ''} · build speed ×${E.yardSpeed(p).toFixed(2)}${shipT ? ` · <b class="good">🚀 ${esc(E.ptype(p).name)} world +${Math.round((shipT - 1) * 100)}% ship speed</b>` : ''}${p.spec === 'production' ? ' · Production −15% cost' : ''}</div>`;
  for (const k of E.BUILD_HULLS) {
    const H = E.HULLS[k];
    const locked = yard < H.yard ? 'Shipyard ' + H.yard : null;
    const fit = em.designs[k];
    const sst = E.shipStats('player', { h: k, f: fit });
    const cost = E.shipCost(p, k);
    h += `<div class="slot ship" data-hullcard="${k}"><canvas class="hthumb" data-hull="${k}" width="64" height="40"></canvas><div class="sl"><b>${H.name}</b>${(() => { const cl = E.counterLabel(k); return `<div class="ctr small"><span class="good">▲ ${cl.best}</span>${cl.weak ? ` <span class="bad">▼ ${cl.weak}</span>` : ''}</div>`; })()}<div class="small muted">HP ${fmt(sst.hp)}${sst.sh ? ' · SH ' + fmt(sst.sh) : ''}${sst.dps ? ' · DPS ' + fmt(sst.dps) : ''}${sst.cap ? ' · carries ' + fmtN(sst.cap) + ' troops' : ''}</div><div class="small">${H.role}</div>${H.ownCap ? `<div class="small capline ${E.ownedHull('player', k) >= H.ownCap ? 'bad' : 'good'}">Owned ${E.ownedHull('player', k)}/${H.ownCap} (cap, incl. queued)</div>` : ''}${forgeB ? `<div class="small forgeline">⬆ Keelwright Forge: +${forgeB}% hull/shields/damage on ships built here</div>` : ''}<span class="cost">${costHTML(cost)} each · ⏱${E.fmtUnit(H.time * E.TIME_MUL / E.yardSpeed(p))}${locked ? '' : ' · ≈' + fmtN(Math.floor(60 * E.yardSpeed(p) / (H.time * E.TIME_MUL))) + '/min'}</span>`;
    if (H.slots && !H.noWeapon) h += `<div class="fit">${['W', 'A', 'S'].map((l, i) => `<span class="fs">${['⚔', '▣', '◯'][i]}${fit[i]}<button class="mini" data-a="fit" data-h="${k}" data-i="${i}" data-d="-1">−</button><button class="mini" data-a="fit" data-h="${k}" data-i="${i}" data-d="1">＋</button></span>`).join('')}<span class="muted small">${H.slots} slots</span></div>`;
    h += '</div>';
    h += '</div>';
    if (locked) h += `<div class="small muted">🔒 ${locked}</div>`;
    else { const mx = p.queues.ship.length >= 5 ? 0 : E.maxShips(p, k); h += qtySlider('ship:' + p.id + ':' + k, mx, 'Build', 'ship', { p: p.id, h: k }, cost); if (!mx) h += `<div class="small muted">${p.queues.ship.length >= 5 ? 'Ship queue full (5)' : 'Need ' + E.missing('player', cost)}</div>`; }
  }
  h += '<p class="muted small">Fitting: ⚔ weapon slots add damage, ▣ armor adds hull, ◯ shields regenerate. Changes apply to ships built afterwards.</p>';
  return h;
};
function fleetRow(f) {
  const st = E.state, fs = E.fleetStats(f);
  const counts = {}; f.ships.forEach(s => counts[s.h] = (counts[s.h] || 0) + 1);
  const comp = Object.entries(counts).map(([h, n]) => fmtN(n) + ' ' + E.HULLS[h].short).join(' · ');
  let status;
  if (f.owner === 'player') { const fsx = E.fleetStatus(f); status = `<span class="fst ${fsx.k}">${fsx.icon} ${esc(fsx.text)}</span>`; }
  else if (f.path.length) status = `→ ${esc(st.systems[f.target]?.name || '')} (${f.order}) ETA ${E.fmtTime(fleetETA(f))}`;
  else status = `at ${esc(st.systems[f.sys].name)} · ${f.order}${E.battleAt(f.sys) ? ' · <span class="bad">in battle</span>' : ''}`;
  const tr = E.troopCount(f.troops) ? ' · 🪖' + E.troopCount(f.troops) : '';
  const own = f.owner === 'player';
  const btnHTML = `<button class="fleet ${own ? '' : 'enemy'}" data-a="${own ? 'openFleet' : 'jump'}" data-f="${f.id}" data-s="${f.path.length ? f.path[0] : f.sys}"><div><b style="color:${(E.factionOf ? E.factionOf(f.owner) : E.FACTIONS[f.owner] || {color:'#8899aa'}).color}">${esc(f.name || (own ? 'Fleet ' + f.id : (E.factionOf ? E.factionOf(f.owner) : E.FACTIONS[f.owner] || {short:'Enemy'}).short + ' fleet'))}</b> <span class="small">${f.ships.length} ships${tr}</span></div><div class="small muted">${comp}</div><div class="small">${status}</div><div class="small muted">Power ${fmt(fs.power)} · DPS ${fmt(fs.dps)} · HP ${fmt(fs.hp)}</div></button>`;
  if (own && f.path.length && f.order !== 'return' && f.rallyTo == null) return `<div class="fleetwrap">${btnHTML}${btn('↩ Recall', 'recall', { f: f.id }, 'mini2 recallbtn warn')}</div>`;
  return btnHTML;
}
const fleetETA = f => E.fleetETA(f);

RENDER.fleet = function (o) {
  const st = E.state, f = E.fleetById(o.fid);
  if (!f) return { title: 'Fleet', html: '<p class="muted">This fleet no longer exists.</p>' + btn('All fleets', 'open', { t: 'fleets' }) };
  if (f.owner !== 'player' && !E.isAlly(f.owner) && !E.fleetVisible(f)) return { title: 'Fleet', html: '<p class="muted">📡 Contact lost — you only see enemy ships heading for your planets.</p>' + btn('All fleets', 'open', { t: 'fleets' }) };
  const fs = E.fleetStats(f);
  let h = fleetRow(f).replace('<button class="fleet ', '<div class="fleet static ').replace(/<\/button>$/, '</div>');
  if (f.owner !== 'player') {
    const al = st.alerts[f.id], fi = (st.fleetIntel || {})[f.id];
    const lv = Math.max((al && al.level) || 0, fi ? fi.level : 0);
    h += '<div class="card">' + compChips(f, lv) + '</div>';
    const busy = (st.scoutMissions || []).find(m => m.kind === 'fleet' && m.target === f.id), best = E.bestScoutFor('fleet', f.id);
    h += `<div class="row">${busy ? '<span class="small">📡 Scouts en route — report in ' + E.fmtTime(busy.done - st.t) + '</span>' : best ? btn('📡 Scan with scouts from ' + esc(best.p.name) + ' (Lv' + best.L + ', ' + E.fmtTime(best.t) + ')', 'scan', { k: 'fleet', id: f.id }, 'primary mini2') : '<span class="small muted">📡 Build a Scout Post to scan enemy fleets</span>'}${btn('🎯 Center', 'jump', { s: f.path.length ? f.path[0] : f.sys }, 'mini2')}</div>`;
    return { title: esc((E.factionOf ? E.factionOf(f.owner) : E.FACTIONS[f.owner] || {short:'Enemy'}).short + ' fleet'), html: h };
  }
  const byHull = {};
  const boosted = {};
  for (const s of f.ships) { const m = E.shipStats(f.owner, s).hp; (byHull[s.h] = byHull[s.h] || []).push(s.hp / m); if (s.bo) { const b = boosted[s.h] = boosted[s.h] || { n: 0, max: 0 }; b.n++; b.max = Math.max(b.max, s.bo); } }
  h += '<div class="card">' + Object.entries(byHull).map(([k, a]) => `<div class="hrow"><canvas class="hthumb" data-hull="${k}" width="48" height="30"></canvas><span>${a.length}× ${E.HULLS[k].name}${boosted[k] ? ` <span class="fbadge" title="Built at a Keelwright Forge world">⬆${boosted[k].n === a.length ? '' : boosted[k].n} +${boosted[k].max}%</span>` : ''}</span>${bar(a.reduce((x, y) => x + y, 0) / a.length, '#6be08a')}</div>`).join('') + '</div>';
  if (fs.cap && f.owner === 'player') {
    const dockedHere = !f.path.length && E.sysPlanet(f.sys) && E.sysPlanet(f.sys).owner === 'player';
    h += `<div class="card loadcard"><h4>🪖 Troops aboard ${fmtN(E.troopCount(f.troops))}/${fmtN(fs.cap)}</h4>`;
    if (dockedHere) { const mx = E.loadMax(f); h += `<div class="small muted">Garrison here: ${fmtN(E.troopCount(E.sysPlanet(f.sys).garrison))} infantry</div>` + qtySlider('load:' + f.id, mx, '⬆ Load', 'order', { f: f.id, o: 'load' }); if (!mx) h += `<div class="small muted">${E.troopSize(f.troops) >= fs.cap ? 'Transports are full' : 'No troops in the garrison — train Infantry in the Troops tab'}</div>`; if (E.troopCount(f.troops)) h += btn('⬇ Unload all', 'order', { f: f.id, o: 'unload' }, 'mini2'); }
    else h += '<div class="small muted">Dock at one of your planets to load troops.</div>';
    h += `<div class="small ${E.troopCount(f.troops) ? 'good' : 'warn'}">${E.troopCount(f.troops) ? '✔ Ready to Invade' : '⚠ No troops aboard — Invade stays greyed until you load some. Attack and Colonize never need troops.'}</div></div>`;
  } else if (fs.cap) h += `<div class="card small">Troop capacity ${fs.troopsUsed}/${fmt(fs.cap)}</div>`;
  if (o.sub === 'split') {
    h += '<div class="card"><h4>Split off a new fleet</h4>';
    const counts = {}; f.ships.forEach(s => counts[s.h] = (counts[s.h] || 0) + 1);
    for (const [k, n] of Object.entries(counts)) { const v = E.clamp(U.splitCounts[k] || 0, 0, n); h += `<div class="qty xrow"><span class="small">${E.HULLS[k].name}</span><input type="range" min="0" max="${n}" step="1" value="${v}" data-in="splitN" data-h="${k}" aria-label="${esc(E.HULLS[k].name)} to split off"><input type="number" class="qnum" inputmode="numeric" min="0" max="${n}" value="${v}" aria-label="${esc(E.HULLS[k].name)} amount"><span class="small muted">/ ${E.fmtN(n)}</span>${btn('½', 'splitHalf', { h: k, max: n }, 'mini')}${btn('Max', 'splitMax', { h: k, max: n }, 'mini2')}</div>`; }
    h += `<div class="row">${btn('Create fleet', 'splitDo', { f: f.id }, 'primary')}${btn('Cancel', 'sub', { sub: '' })}</div></div>`;
    return { title: 'Fleet', html: h };
  }
  if (f.owner !== 'player') return { title: 'Fleet', html: h };
  const docked = !f.path.length;
  const p = E.sysPlanet(f.sys);
  h += '<div class="orders">';
  h += btn('🚀 Send…', 'sendFrom', { f: f.id }, 'primary') + btn('➜ Move', 'order', { f: f.id, o: 'move' }) +  btn('⛓ Siege', 'order', { f: f.id, o: 'siege' }) + btn('↻ Patrol', 'order', { f: f.id, o: 'patrol' }) + btn('↩ Retreat', 'order', { f: f.id, o: 'retreat' });
  if (!docked && f.order !== 'return') h += btn('↩ Recall', 'recall', { f: f.id }, 'warn');
  if (!docked) h += btn('🔭 Watch transit', 'transit', { f: f.id });
  if (docked && f.ships.length > 1) h += btn('✂ Split', 'sub', { sub: 'split' });
  const others = docked ? E.fleetsAt(f.sys, 'player').filter(x => x !== f) : [];
  if (others.length) h += btn('⊕ Merge fleets here', 'merge', { f: f.id });
  if (E.battleAt(f.sys) && docked) h += btn('⚔ Battle status', 'watch', { s: f.sys }, 'warn');
  h += btn('🎯 Center', 'jump', { s: f.path.length ? f.path[0] : f.sys });
  h += btn('✎ Rename', 'rename', { f: f.id });
  h += '</div>';
  h += '<p class="muted small">Send… opens the attack setup: pick fleets, an action (Attack, Invade, Raze, Relocate, Colonize), load troops and set the arrival timing. Fleets never fly through enemy worlds, so only front-line planets can be targeted. Siege: blockade (enemy output −50%, shields drain) without landing. Patrol: shuttle between here and a target.</p>';
  return { title: esc(f.name || 'Fleet ' + f.id), html: h };
};

// v1.6: the bottom Fleets tab is the one place for fleet control. Top: pick a planet (context) and manage its docked groups
// (sliders, merge/split, naming, send). Below: the global list — big docked groups first, big groups under way next,
// then rally traffic collapsed to one line per destination planet.
U.fleetCtx = null; U.fleetShowAll = false;
function fleetCtxPlanet() {
  const st = E.state, mine = E.playerPlanets(); if (!mine.length) return null;
  let p = U.fleetCtx != null ? st.planets[U.fleetCtx] : null;
  if (!p || p.owner !== 'player') {
    const sel = Rd.sel && Rd.sel.sys != null ? E.sysPlanet(Rd.sel.sys) : null;
    p = sel && sel.owner === 'player' ? sel : null;
    if (!p) { let best = -1; for (const q of mine) { const n = E.fleetsAt(q.sys, 'player').reduce((a, f) => a + f.ships.length, 0); if (n > best) { best = n; p = q; } } }
    U.fleetCtx = p.id;
  }
  return p;
}
const fleetSize = f => f.ships.length;
RENDER.fleets = function () {
  const st = E.state;
  const mine = st.fleets.filter(f => f.owner === 'player');
  const threats = E.incoming().filter(a => a.kind === 'attack' || a.kind == null).map(a => a.f);
  let h = '';
  const cp = fleetCtxPlanet();
  if (cp) {
    const opts = E.playerPlanets().map(q => { const n = E.fleetsAt(q.sys, 'player').reduce((a, f) => a + f.ships.length, 0); return `<option value="${q.id}" ${q.id === cp.id ? 'selected' : ''}>${esc(q.name)}${st.emp.player.home === q.id ? ' ★' : ''} · ${E.fmtN(n)} ships docked</option>`; }).join('');
    h += `<div class="card fctx"><div class="row small"><b>Planet</b> <select class="sel" data-in="fleetCtx" aria-label="Planet">${opts}</select>${btn('🎯', 'jump', { s: cp.sys }, 'mini2')}</div><label class="fhere"><input type="checkbox" data-in="onlyHere" ${U.onlyHere ? 'checked' : ''}> Only fleets here <span class="muted">(hide fleets at other planets — faster merging)</span></label></div>`;
    h += fleetScreenHTML(cp);
  }
  if (cp && U.onlyHere) {
    const here = mine.filter(f => !f.path.length && f.sys === cp.sys);
    h += `<h4>Fleets at ${esc(cp.name)} only</h4><div class="small muted">${E.fmtN(here.length)} groups · ${E.fmtN(here.reduce((a, f) => a + f.ships.length, 0))} ships docked here. Untick “Only fleets here” to see every fleet.</div>`;
    return { title: 'Fleets', html: h + rallyCollapse(here, 'fl-here', fleetRow) };
  }
  if (threats.length) h += '<h4 class="bad">⚠ Incoming threats</h4>' + threats.map(fleetRow).join('');
  const rally = mine.filter(f => f.rallyTo != null);
  const rest = mine.filter(f => f.rallyTo == null);
  const bySize = (a, b) => fleetSize(b) - fleetSize(a) || E.fleetStats(b).power - E.fleetStats(a).power;
  const docked = rest.filter(f => !f.path.length && !E.battleAt(f.sys) && E.fleetStatus(f).k === 'docked').sort(bySize);
  const moving = rest.filter(f => !docked.includes(f)).sort((a, b) => (a.path.length ? 0 : 1) - (b.path.length ? 0 : 1) || bySize(a, b));
  const ships = mine.reduce((a, f) => a + f.ships.length, 0), troops = mine.reduce((a, f) => a + E.troopCount(f.troops), 0);
  h += `<h4>All fleets</h4><div class="small muted">${E.fmtN(mine.length)} groups · ${E.fmtN(ships)} ships · ${E.fmtN(troops)} troops aboard.</div>`;
  if (!mine.length) h += '<p class="muted">No fleets. Build ships at a Shipyard.</p>';
  const LIM = 25, list = (arr) => { const shown = U.fleetShowAll ? arr : arr.slice(0, LIM); let o = shown.map(fleetRow).join(''); if (arr.length > shown.length) o += `<div class="small muted morefleets">+ ${E.fmtN(arr.length - shown.length)} smaller groups ${btn('Show all', 'fleetMore', {}, 'mini2')}</div>`; return o; };
  if (docked.length) h += `<div class="fgroup"><div class="small"><b>⚓ Docked</b> (${E.fmtN(docked.length)}) · biggest first</div>${list(docked)}</div>`;
  if (moving.length) h += `<div class="fgroup"><div class="small"><b>➜ En route &amp; active</b> (${E.fmtN(moving.length)}) · biggest first</div>${list(moving)}</div>`;
  if (rally.length) {
    const { groups } = E.rallyGroups(rally);
    h += `<div class="fgroup" id="rallyTraffic"><div class="small"><b>⚑ Rally traffic</b> · one group per rally point (collapsed)</div>`;
    for (const g of groups) h += E.rallyGroupHTML(g, 'fl-rally-' + g.key, { row: fleetRow });
    h += '</div>';
  }
  const battles = st.battles.filter(b => !b.done && (b.owners[0].includes('player') || b.owners[1].includes('player')));
  if (battles.length) h += '<h4>Battles</h4>' + battles.map(b => btn('⚔ ' + esc(st.systems[b.sys].name) + ' — watch', 'watch', { s: b.sys }, 'warn wide')).join('');
  return { title: 'Fleets', html: h };
};

RENDER.empire = function () {
  const st = E.state, mine = E.playerPlanets();
  const D = E.DIFFICULTY[st.diff];
  const dead = E.rivals().filter(o => E.isDefeated(o)).length, tot = E.rivals().length;
  let h = `<div class="card"><h4>${st.mode === 'endless' ? '♾ Endless · stage ' + (st.endless.stage + 1) + '/' + E.ENDLESS_STAGES.length : 'Victory'}</h4><div class="small">Defeat every rival: an empire is beaten when it has <b>no colonized systems</b>. ${dead}/${tot} defeated.${st.mode === 'endless' ? ' Clearing a stage grows the Expanse (20 → 40 → 80 → 160 systems).' : ''}</div>${bar(tot ? dead / tot : 0, '#38e1ff')}<div class="small">${st.crisis.defeated ? '★ Hollow defeated' : st.crisis.started ? '☢ Hollow wave ' + st.crisis.waveIdx + '/' + E.crisisWaves() : '☢ The Hollow arrives in ' + E.fmtTime(E.crisisAt() - st.t)} (not needed to win) · Difficulty ${D.name}</div></div>`;
  h += cmdCard();
  { const sp = E.SPECIES[st.species] || E.SPECIES.none; h += `<div class="card speciescard"><h4>🧬 Species: ${sp.icon} ${esc(sp.name)}</h4><div class="small">${st.species === 'none' ? 'Balanced — no species bonus (game carried over from v1.7).' : 'Bonus active: <b class="good">' + esc(sp.desc) + '</b>.'}</div></div>`; }
  h += '<h4>Your planets</h4>';
  const totP = mine.reduce((a, p) => { const pr = E.planetProd(p); a.m += pr.metal; a.c += pr.crystal; a.r += pr.rp; return a; }, { m: 0, c: 0, r: 0 });
  h += `<div class="small muted">${mine.length} worlds · ⛏ ${fmt(totP.m)} · ${E.RES_ICON.crystal} ${fmt(totP.c)} · ⚗ ${fmt(totP.r)} per min · ● = an order in that queue (3 shown per column)</div>`;
  for (const p of mine.slice().sort((a, b) => (b.id === st.emp.player.home) - (a.id === st.emp.player.home))) {
    h += planetCardHTML(p);
    if (p.id !== st.emp.player.home) h += U.abandonAsk === p.id ? `<div class="row confirmrow small">Give up ${esc(p.name)}? ${btn('🏳 Abandon (keeps buildings)', 'abandonDo', { p: p.id, m: 'abandon' }, 'mini2')}${btn('🔥 Raze (wipe it)', 'abandonDo', { p: p.id, m: 'raze' }, 'mini2 warn')}${btn('Cancel', 'abandonAsk', { p: -1 }, 'mini2')}</div>` : `<div class="row r small">${btn('🏳 Abandon / raze…', 'abandonAsk', { p: p.id }, 'mini2 ghost')}</div>`;
  }
  if (E.allies().length) { h += '<h4>Allies</h4>'; for (const f of E.allies()) { const n = st.planets.filter(p => p.owner === f).length; h += `<div class="card small">${factionBadge(f)} <b>${E.FACTIONS[f].name}</b> — ${n} worlds ${n ? '<span class="good">· your team</span>' : '<span class="muted">· fallen</span>'}<div class="muted">Expands, defends your worlds and sends relief wings. You can fly through allied space.</div></div>`; } }
  h += marketHTML();
  h += '<h4>Rivals</h4>';
  for (const f of E.rivals()) {
    const n = st.planets.filter(p => p.owner === f).length;
    h += `<div class="card small">${factionBadge(f)} <b>${E.FACTIONS[f].name}</b> — ${n} worlds ${E.isDefeated(f) ? '<span class="good">· ☠ defeated</span>' : st.emp[f].war ? '<span class="bad">· hostile</span>' : '<span class="good">· at peace (trade partner)</span>'}<div class="muted">${E.FACTIONS[f].desc}</div><div class="muted">Species: ${(E.SPECIES[E.speciesOf(f)] || E.SPECIES.none).icon} ${(E.SPECIES[E.speciesOf(f)] || E.SPECIES.none).name} (${(E.SPECIES[E.speciesOf(f)] || E.SPECIES.none).desc})</div></div>`;
  }
  return { title: 'Empire', html: h };
};
U.swap = U.swap || { from: 'metal', to: 'crystal' };
function marketHTML() {
  const em = E.state.emp.player, L = E.tradeCenterLevel('player'), rate = E.swapRate(L), S = U.swap;
  let h = `<div class="card tc"><h4>⚖ Trade Center ${L ? 'Lv' + L : ''} · metal ↔ crystal</h4>`;
  if (!rate) h += '<p class="bad small">Build a Trade Center on any planet to swap metal and crystal. Rates: 2.5 : 1 at Lv1, improving to 1.4 : 1 at Lv10.</p>';
  else {
    h += `<div class="small">Rate <b>${rate.toFixed(2)} : 1</b> (give ${rate.toFixed(2)}, get 1) · Lv10: 1.4 : 1${E.has('player', 'e7') ? ' · Market Algorithms' : ''}</div>`;
    h += `<div class="row">${['metal', 'crystal'].map(k => { const o = k === 'metal' ? 'crystal' : 'metal'; return `<button class="b chipb ${S.from === k ? 'on' : ''}" data-a="swapPick" data-side="from" data-r="${k}" style="--c:${E.RES_COLOR[k]}">${E.RES_ICON[k]} ${E.RES_NAME[k]} → ${E.RES_ICON[o]} ${E.RES_NAME[o]}</button>`; }).join('')}</div>`;
    const have = Math.floor(em.res[S.from]);
    h += '<div class="row">' + [100, 500, 1000].map(n => btn(`${n} → ${Math.floor(n / rate)}`, 'swap', { from: S.from, to: S.to, n }, n > have ? 'dis' : '')).join('') + btn(`All (${fmt(have)}) → ${fmt(Math.floor(have / rate))}`, 'swap', { from: S.from, to: S.to, n: have }) + '</div>';
  }
  return h + '</div>';
}

// ---------- v1.4: Commander card, ☰ menu ----------
function cmdCard() {
  const c = E.cmd(), need = E.cmdXpFor(c.lv), cap = E.sysCap(), n = E.sysCount();
  return `<div class="card cmdcard"><div class="hrow"><h4>★ Commander level ${c.lv}</h4><span class="small ${E.atSysCap() ? 'bad' : 'muted'}">🪐 Systems ${n}/${cap}${cap >= E.CMD_CAP_MAX ? ' (max)' : ''}</span></div>${bar(c.xp / need, '#ffd84d')}<div class="small muted">${fmt(c.xp)}/${fmt(need)} XP to Lv ${c.lv + 1}${cap < E.CMD_CAP_MAX ? ' (system cap → ' + (cap + 1) + ')' : ''} · earn XP by destroying enemy ships (bigger ships give more) and killing enemy troops · ${fmt(c.kills || 0)} ships destroyed</div>${E.atSysCap() ? '<div class="small bad">⚠ System cap reached: Invade and Colonize are blocked. Level up, abandon a world, or use 🔥 Raze on enemy colonies.</div>' : ''}</div>`;
}
U.cmdCard = cmdCard;
RENDER.commander = function () {
  const st = E.state;
  let o = cmdCard();
  o += `<p class="small muted">Commander XP comes from destroying enemy ships and killing enemy troops. Each level raises your system cap by 1 (up to ${E.CMD_CAP_MAX}). Research never raises it. ${fmt(E.cmd().kills || 0)} ships destroyed so far.</p>`;
  return { title: '★ Commander', html: o };
};

// v2.2 item 4: three named save slots + Export (JSON download) / Import (file) — shared by the title screen and ☰ Menu
U.slotsHTML = function (inGame) {
  const cur = E.slot || 1;
  let h = `<div class="card slots" id="${inGame ? 'saveSlotsGame' : 'saveSlots'}"><h4>💾 Save slots</h4>`;
  for (const sl of E.slotInfo()) {
    const m = sl.meta, isCur = inGame && sl.n === cur;
    const kb = sl.has && E.slotSizeKB ? E.slotSizeKB(sl.n) : 0;
    const info = sl.has && m ? `${E.fmtTime(m.t || 0)} · ${(E.DIFFICULTY[m.diff] || {}).name || ''}${m.size && E.SIZES[m.size] ? ' · ' + E.SIZES[m.size].name : ''} · ${m.planets || 0} world${m.planets === 1 ? '' : 's'}${kb ? ' · ' + (kb < 10 ? kb.toFixed(1) : Math.round(kb)) + ' KB' : ''}${m.when ? ' · ' + new Date(m.when).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}` : 'empty';
    h += `<div class="slot-row ${isCur ? 'cur' : ''}" data-slot="${sl.n}"><div class="slot-n"><b>${esc(sl.name)}</b>${isCur ? ' <span class="badge" style="--c:#38e1ff">playing</span>' : ''}<small class="muted">${esc(info)}</small></div><div class="slot-b">`;
    if (inGame) h += btn(isCur ? '💾 Save' : '💾 Save here', 'slotAct', { op: 'save', n: sl.n }, 'mini2');
    else if (sl.has) h += btn('▶ Load', 'slotAct', { op: 'load', n: sl.n }, 'mini2');
    if (sl.has || isCur) h += btn('✎', 'slotAct', { op: 'rename', n: sl.n }, 'mini2') + btn('⬇ Export', 'slotAct', { op: 'export', n: sl.n }, 'mini2');
    h += btn('⬆ Import', 'slotAct', { op: 'import', n: sl.n }, 'mini2');
    if (sl.has) h += btn('🗑 Delete', 'slotAct', { op: 'delete', n: sl.n }, 'mini2');
    h += '</div></div>';
  }
  h += `<div class="small muted">Continue loads the newest slot. Export downloads a .json file you can Import on another device.</div></div>`;
  return h;
};
U.download = function (name, text) {
  const b = new Blob([text], { type: 'application/json' }), a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  U.lastDownload = { name, size: text.length };
};
U.slotAct = function (op, n, inGame, after) {
  n = +n; const sl = E.slotInfo()[n - 1]; if (!sl) return;
  const redraw = () => { if (after) after(); else if (U.sheet) U.render(false); };
  if (op === 'save') {
    if (n !== E.slot && sl.has && !confirm('Overwrite “' + sl.name + '” with this game?')) return;
    const ok = E.save({ slot: n }); U.flash(ok ? 'Saved to ' + E.slotName(n) : '⚠ ' + (E.lastSaveError || 'Save failed — storage may be full'), ok ? 'good' : 'warn'); redraw();
  } else if (op === 'load') { const st = E.loadSlot(n); if (st) E.main.start(st); else alert('That save could not be loaded.'); }
  else if (op === 'rename') { const nm = prompt('Name this save slot', sl.name); if (nm == null) return; if (sl.has) E.renameSlot(n, nm); else if (inGame && n === E.slot) E.save({ slot: n, name: nm }); redraw(); }
  else if (op === 'export') { const txt = E.exportSave(n); if (!txt) return U.flash('Nothing to export in that slot'); const nm = (sl.name || 'slot' + n).replace(/[^a-z0-9_-]+/gi, '_'); U.download('galaxies-of-empires-' + nm + '-v' + E.VERSION + '.json', txt); U.flash('Exported ' + sl.name, 'good'); }
  else if (op === 'delete') { if (!confirm('Delete “' + sl.name + '”? This cannot be undone.')) return; E.deleteSlot(n); redraw(); }
  else if (op === 'import') {
    if (sl.has && !confirm('Importing replaces “' + sl.name + '”. Continue?')) return;
    let inp = document.getElementById('importFile');
    if (!inp) { inp = document.createElement('input'); inp.type = 'file'; inp.id = 'importFile'; inp.accept = '.json,application/json'; inp.style.display = 'none'; document.body.appendChild(inp); }
    inp.value = ''; inp.onchange = () => { const f = inp.files && inp.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { const r = E.importSave(String(rd.result), n); U.flash(r.ok ? 'Imported into ' + E.slotName(n) : '⚠ Import failed — ' + r.msg, r.ok ? 'good' : 'warn'); U.lastImport = r; redraw(); }; rd.readAsText(f); };
    inp.click();
  }
};
RENDER.menu = function () {
  const st = E.state;
  let h = `<div class="menulist">${btn('❔ Help · how to play', 'openHelp', {}, 'wide')}${btn('★ Commander', 'openT', { t: 'commander' }, 'wide')}${btn('📜 Event log', 'openT', { t: 'log' }, 'wide')}</div>`;
  h += (Rd.settingsHTML ? Rd.settingsHTML() : '') + `<h4>⚙ Settings</h4><div class="row">${btn(E.audio.muted ? '🔇 Sound off' : '🔊 Sound on', 'mute')}${btn('💾 Save now', 'save')}${btn('🎓 Restart tutorial', 'tutRestart')}${btn('🏠 Main menu', 'menu')}</div>`;
  h += U.slotsHTML(true);
  h += `<p class="muted small">Galaxies of Empires v${E.VERSION} · ${E.SPECIES[st.species].name} · ${st.mode === 'endless' ? 'Endless' : 'Classic'} · ${E.DIFFICULTY[st.diff].name}${E.allies().length ? ' · ' + E.allies().length + ' all' + (E.allies().length > 1 ? 'ies' : 'y') : ''} · autosaves every 30 s into ${esc(E.slotName(E.slot || 1))}.</p>`;
  return { title: '☰ Menu', html: h };
};

// v2.1 item 2: Headquarters panel — HQ level (building cap, planet cap, slots) and passive bonuses, all paid in RP
function hqHTML() {
  const st = E.state, em = st.emp.player, hq = E.ensureHQ(st), L = hq.lvl, mx = L >= E.HQ_MAX, c = mx ? 0 : E.hqCost(L);
  const nextSlot = E.HQ_SLOT_LVLS.find(x => x > L);
  let h = `<div class="card hqcard" id="hqPanel"><div class="hrow"><h4>🏛 Headquarters · Lv ${L}${mx ? ' (max)' : ''}</h4><span class="small">⚗ <b style="color:${E.RES_COLOR.rp}">${fmt(em.rp)}</b> RP banked</span></div>
    <div class="hqstats small"><div>🏗 Building cap <b>Lv ${E.hqCap()}</b> on every planet</div><div>🪐 Planet cap <b>${E.sysCap()}</b> (${E.sysCount()} held)</div><div>▦ Extra slots <b>+${E.hqSlots('player')}</b> per planet${nextSlot ? ' · next at HQ Lv' + nextSlot : ''}</div></div>`;
  h += mx ? '<div class="small good">Headquarters fully upgraded.</div>' : `<button class="b primary wide ${em.rp < c ? 'dis' : ''}" data-a="hqUp">⬆ HQ Lv${L + 1} — ${fmt(c)} RP<span class="small"> · buildings to Lv${Math.min(E.BUILD_MAX_LVL, L + 1)}${E.HQ_SLOT_LVLS.includes(L + 1) ? ', +1 slot everywhere' : ''}</span></button>`;
  h += `<div class="small muted">Research points bank up while no research is running.${em.research ? ' Researching <b>' + E.TECH_BY_ID[em.research].name + '</b> uses your RP — ' + btn('⏸ Pause research', 'researchPause', {}, 'mini2') : ''}</div></div>`;
  h += `<div class="card"><h4>Passive bonuses</h4><div class="small muted">Permanent, empire-wide. A bonus can't go above the HQ level (max ${E.HQ_PERK_MAX}).</div><div class="perks">`;
  for (const k in E.HQ_PERKS) {
    const P = E.HQ_PERKS[k], lv = hq.perks[k] || 0, pc = E.perkCost(k, lv), done = lv >= E.HQ_PERK_MAX, lock = lv >= L;
    h += `<div class="perk"><div><b>${P.icon} ${P.name}</b> <span class="lv">Lv ${lv}</span><div class="small muted">${P.desc}${lv ? ' · now +' + Math.round(P.per * lv * 100) + '%' : ''}</div></div>${done ? '<span class="small muted">MAX</span>' : `<button class="b mini2 ${lock || em.rp < pc ? 'dis' : ''}" data-a="hqPerk" data-k="${k}" title="${lock ? 'Upgrade the HQ first' : ''}">${lock ? '🔒 HQ Lv' + (lv + 1) : '+1 · ' + fmt(pc) + ' RP'}</button>`}</div>`;
  }
  return h + '</div></div>';
}
RENDER.hq = function () { return { title: '🏛 Headquarters', html: hqHTML() }; };
RENDER.research = function () {
  const em = E.state.emp.player;
  let h = (E.hq ? `<div class="row">${btn('🏛 Headquarters Lv' + E.hqLevel('player') + ' — spend RP on caps & bonuses', 'openHQ', {}, 'mini2')}${em.research ? btn('⏸ Pause research (bank RP)', 'researchPause', {}, 'mini2') : ''}</div>` : '') + `<div class="small">Research points: <b style="color:${E.RES_COLOR.rp}">${fmt(em.rp)}</b> banked · +${fmt((em.income || {}).rp || 0)}/min. Build or upgrade Research Labs for more. ${em.research ? 'Researching <b>' + E.TECH_BY_ID[em.research].name + '</b>' : '<span class="warn">Nothing being researched!</span>'}</div><div class="branches">`;
  for (const br of Object.keys(E.BRANCHES)) {
    const B = E.BRANCHES[br];
    h += `<div class="branch"><h4 style="color:${B.color}">${B.name}</h4>`;
    for (const t of E.TECHS.filter(t => t.br === br)) {
      const done = em.techs[t.id], cur = em.research === t.id;
      const prev = E.TECHS.find(x => x.br === t.br && x.tier === t.tier - 1);
      const avail = !done && (!prev || em.techs[prev.id]);
      const prog = (em.rpProg || {})[t.id] || 0;
      h += `<button class="tech ${done ? 'done' : cur ? 'cur' : avail ? 'avail' : 'locked'}" data-a="research" data-id="${t.id}" style="--c:${B.color}"><b>${done ? '✔ ' : cur ? '⏳ ' : avail ? '' : '🔒 '}${t.name}</b><small>${t.desc}</small><span class="small">${done ? 'Researched' : '⚗ ' + fmt(prog) + '/' + t.cost + (!(em.researchPaid || {})[t.id] ? (t.crystal ? ' · ' + E.RES_ICON.crystal + fmt(t.crystal) : '') : '')}</span>${cur ? bar(prog / t.cost, B.color) : ''}</button>`;
    }
    h += '</div>';
  }
  return { title: 'Research', html: h + '</div>' };
};

RENDER.trade = function (o) {
  const st = E.state;
  let h = '';
  if (o.sub === 'from') {
    const origins = E.playerPlanets().filter(p => E.bLevel(p, 'tradeport'));
    h += '<h4>Pick an origin planet</h4><p class="muted small">Routes run only between your own worlds that both have a Trade Center. Each route fills one trader slot and uses a docked Trader (build one at a Shipyard), or charters one for crystal.</p>';
    if (!origins.length) h += '<p class="bad">No Trade Center yet. Build one on a planet first.</p>';
    if (origins.length < 2) h += '<p class="bad small">You need Trade Centers on at least two of your planets to open a route.</p>';
    for (const p of origins) { const n = st.routes.filter(r => r.from === p.id).length; const fr = E.fleetsAt(p.sys, 'player').reduce((a, f) => a + f.ships.filter(s => s.h === 'trader').length, 0); h += btn(`${esc(p.name)} · slots ${n}/${E.routeCap(p)} · Traders docked ${fr}`, 'routeFrom', { p: p.id }, 'wide'); }
    return { title: 'New trade route', html: h + btn('Back', 'sub', { sub: '' }) };
  }
  if (o.sub === 'to') {
    const a = st.planets[o.from];
    const targets = st.planets.filter(p => E.validTradeTarget(a, p));
    targets.sort((x, y) => E.routeIncome(a, y) - E.routeIncome(a, x));
    const rr = U.routeRes || 'metal';
    h += `<h4>Trade partner for ${esc(a.name)}</h4><div class="card resPick"><div class="small"><b>This route pays:</b> (you can switch later)</div><div class="row">${['metal', 'crystal'].map(k => `<button class="b chipb ${rr === k ? 'on' : ''}" data-a="routePick" data-r="${k}" style="--c:${E.RES_COLOR[k]}">${E.RES_ICON[k]} ${E.RES_NAME[k]}</button>`).join('')}</div></div><p class="muted small">Longer lanes and higher Trade Center levels pay more; every extra route from a world lifts all its routes (+1.2% each). Trade ships can't be attacked.</p>`;
    const tmx = E.maxTraders(a.id), tk = 'traders:' + a.id, tn = E.clamp(U.qty[tk] || 1, tmx ? 1 : 0, Math.max(1, tmx));
    h += `<div class="card tradeq"><div class="small"><b>Traders to send</b> on the route you tap (free slots ${E.routeCap(a) - st.routes.filter(r => r.from === a.id).length}, docked + charter max ${fmtN(tmx)})</div>${tmx ? `<div class="qty"><input type="range" min="1" max="${tmx}" step="1" value="${tn}" data-in="qty" data-k="${tk}" aria-label="Traders to send"><input type="number" class="qnum" inputmode="numeric" min="1" max="${tmx}" value="${tn}" aria-label="Traders amount">${btn('Max', 'qtyMax', { k: tk, max: tmx }, 'mini2')}<b class="qv" data-tq>${fmtN(tn)} trader${tn === 1 ? '' : 's'}</b></div>` : '<div class="small bad">No free trader slot or Trader available (dock Traders here or keep ' + E.HULLS.trader.cost.crystal + ' crystal per charter).</div>'}</div>`;
    U.qtyMeta[tk] = { label: 'Traders', max: tmx };
    for (const p of targets) { const tp = E.tradePath(a.sys, p.sys) || []; const risky = tp.some(s => { const q = E.sysPlanet(s); return q && E.hostile('player', q.owner); }); const y = E.routeYield({ res: rr }, E.routeIncome(a, p, st.routes.filter(r0 => r0.from === a.id).length + 1)); h += btn(`${factionBadge(p.owner)} ${esc(p.name)} · ${tp.length} jumps · +${fmt(y.n)}${E.RES_ICON[y.k]}/min${risky ? ' · ⚠ crosses hostile space' : ''}`, 'routeTo', { from: a.id, to: p.id }, 'wide'); }
    return { title: 'New trade route', html: h + btn('Back', 'sub', { sub: 'from' }) };
  }
  h += marketHTML();
  const tot = { metal: 0, crystal: 0 }; for (const r of st.routes) if (r.ship && r.blocked == null) { const y = E.routeYield(r, E.routeIncome(st.planets[r.from], st.planets[r.to])); tot[y.k] += y.n; }
  h += `<div class="card small">Trade income: <b style="color:${E.RES_COLOR.metal}">+${fmt(tot.metal)}⛏</b> <b style="color:${E.RES_COLOR.crystal}">+${fmt(tot.crystal)}${E.RES_ICON.crystal}</b> /min · earned ${fmt(st.stats.tradeEarned)} so far. Each route pays the resource you pick. Trade ships are untouchable, and every extra route from a world adds +1.2% to all of that world's routes.</div>` + traderSlotsHTML();
  h += btn('⚖ New trade route', 'sub', { sub: 'from' }, 'primary wide');
  for (const r of st.routes) {
    const a = st.planets[r.from], b = st.planets[r.to];
    const y = E.routeYield(r, E.routeIncome(a, b));
    const status = !r.ship ? '<span class="bad">Trader lost</span>' : r.blocked != null ? `<span class="bad">Blocked at ${esc(st.systems[r.blocked].name)}</span>` : `<span class="good">+${fmt(y.n)}${E.RES_ICON[y.k]}/min</span>`;
    h += `<div class="card route"><div><b>${esc(a.name)} → ${esc(b.name)}</b> ${factionBadge(b.owner)}</div><div class="row small resPick">Pays: ${['metal', 'crystal'].map(k => `<button class="b chipb mini2 ${y.k === k ? 'on' : ''}" data-a="routeRes" data-r="${r.id}" data-k="${k}" style="--c:${E.RES_COLOR[k]}">${E.RES_ICON[k]} ${E.RES_NAME[k]}</button>`).join('')}</div><div class="small">${status} · earned ${fmt(r.earned)}${E.RES_ICON[y.k]}</div><div class="row">${!r.ship ? btn('Replace Trader', 'routeFix', { r: r.id }) : ''}${btn('Close route', 'routeCancel', { r: r.id })}</div></div>`;
  }
  return { title: 'Trade', html: h };
};

RENDER.log = function () {
  const st = E.state;
  return { title: 'Event log', html: '<div class="small muted">Tap a battle entry (📋) for its full report.</div>' + st.log.map(l => { const has = l.rep != null && E.getReport(l.rep); return has ? `<button class="log hasrep ${l.kind}" data-a="report" data-r="${l.rep}"><span class="muted small">${E.fmtTime(l.t)}</span> ${esc(l.msg)}</button>` : `<button class="log ${l.kind}" data-a="jump" data-s="${l.sys == null ? '' : l.sys}"><span class="muted small">${E.fmtTime(l.t)}</span> ${esc(l.msg)}</button>`; }).join('') };
};
// v1.7: full battle report (space battles, ground assaults and attack-window results)
function repName(o) { return E.FACTIONS[o] ? E.FACTIONS[o].name : String(o); }
function repShips(start, lost, extra) {
  const rows = Object.keys(start).filter(h => start[h]).map(h => { const n = start[h], l = lost[h] || 0; return `<tr><td>${E.HULLS[h].name}</td><td>${fmtN(n)}</td><td class="${l ? 'l' : ''}">${fmtN(l)}</td><td>${fmtN(n - l)}</td></tr>`; });
  for (const [label, n, l] of extra || []) if (n || l) rows.push(`<tr><td>${label}</td><td>${fmtN(n)}</td><td class="${l ? 'l' : ''}">${fmtN(l)}</td><td>${fmtN(Math.max(0, n - l))}</td></tr>`);
  if (!rows.length) return '<p class="muted small">No ships on this side.</p>';
  const T = Object.keys(start).reduce((a, h) => a + (start[h] || 0), 0), L = Object.keys(start).reduce((a, h) => a + (lost[h] || 0), 0);
  return `<table><tr><th>Unit</th><th>Start</th><th>Lost</th><th>Left</th></tr>${rows.join('')}<tr><td><b>Ships</b></td><td><b>${fmtN(T)}</b></td><td class="${L ? 'l' : ''}"><b>${fmtN(L)}</b></td><td><b>${fmtN(T - L)}</b></td></tr></table>`;
}
function repTroops(before, after) {
  const rows = E.TROOP_KEYS.filter(k => before[k] || after[k]).map(k => { const b = before[k] || 0, a = after[k] || 0; return `<tr><td>${E.TROOPS[k].icon} ${E.TROOPS[k].name}</td><td>${fmtN(b)}</td><td class="${b - a ? 'l' : ''}">${fmtN(b - a)}</td><td>${fmtN(a)}</td></tr>`; });
  return rows.length ? `<table><tr><th>Troops</th><th>Start</th><th>Lost</th><th>Left</th></tr>${rows.join('')}</table>` : '<p class="muted small">No troops.</p>';
}
RENDER.report = function (o) {
  const st = E.state, r = E.getReport(o.r);
  const back = btn('← Event log', 'openT', { t: 'log' }, 'wide');
  if (!r) return { title: 'Battle report', html: '<p class="muted">This report is no longer stored (only the most recent battles are kept).</p>' + back };
  const ban = (k, t) => `<div class="banner ${k}">${t}</div>`;
  let h = '<div class="rep">';
  if (r.kind === 'battle') {
    const ps = r.sides.findIndex(s => s.owners.includes('player'));
    const mi = ps >= 0 ? ps : 0, fi = 1 - mi, me = r.sides[mi], foe = r.sides[fi];
    const names = sd => sd.owners.map(repName).join(' + ');
    h += `<h4>⚔ ${esc(r.system)}${r.planet ? ' · ' + esc(r.planet) : ''}</h4><div class="small muted">Started ${E.fmtTime(r.t)}${r.done ? ' · lasted ' + E.fmtTime(r.dur || 0) : ''}</div>`;
    if (!r.done) h += ban('stalemate', '⚔ Battle in progress — numbers update as ships fall');
    else if (ps < 0) h += ban('stalemate', r.winner < 0 ? '— Stalemate: both sides withdrew' : `${esc(names(r.sides[r.winner]))} won the fight`);
    else h += ban(r.outcome, r.outcome === 'victory' ? '✔ Victory — the enemy is beaten' : r.outcome === 'defeat' ? '✖ Defeat — your side lost the fight' : '— Stalemate: both sides withdrew');
    if (r.turretFirst) { const tf = r.turretFirst, dn = r.planetOwner === 'player' || E.isAlly(r.planetOwner) ? 'Your' : esc(repName(r.planetOwner)) + "'s";
      h += `<div class="card small turretfirst"><b>🛡 Turret-first defense</b><br>${dn} ${fmtN(tf.held)} garrison ship${tf.held === 1 ? '' : 's'} (${tf.fleets} fleet${tf.fleets === 1 ? '' : 's'}) held back while the turrets engaged.<br>${tf.launchedAt != null ? `⏱ ${E.fmtTime(tf.launchedAt)} in: a turret took fire — <b>${fmtN(tf.launched)} ship${tf.launched === 1 ? '' : 's'} launched</b> and joined the fight.` : r.done ? 'The turrets were never hit, so the garrison stayed docked.' : 'Waiting — they launch the moment any turret is hit.'}</div>`; }
    h += `<h4>${ps >= 0 ? 'Your side' : 'Side A'}: ${esc(names(me))}</h4>` + repShips(me.ships, me.lost, [['✛ Turrets', me.turrets, me.turretsLost], ['⬢ Stations', me.stations, me.stationsLost]]);
    h += `<h4>${ps >= 0 ? 'Enemy' : 'Side B'}: ${esc(names(foe))}</h4>` + repShips(foe.ships, foe.lost, [['✛ Turrets', foe.turrets, foe.turretsLost], ['⬢ Stations', foe.stations, foe.stationsLost]]);
    if (r.done) h += `<div class="row" style="margin:8px 0">${btn('Battle animation simulation', 'replay', { id: r.id }, 'primary rbtn' + (E.getReplay && E.getReplay(r.id) ? '' : ' dis'))}</div>${E.getReplay && E.getReplay(r.id) ? '' : '<div class="small muted">Replays are kept for battles fought since the game was opened (last ' + E.REPLAY_KEEP + ').</div>'}`;
    if (r.done && r.planet) h += `<div class="small">Planet <b>${esc(r.planet)}</b> afterwards: ${r.planetOwnerAfter != null ? esc(repName(r.planetOwnerAfter)) : 'unclaimed'}.</div>`;
  } else if (r.kind === 'ground') {
    const mine = r.attacker === 'player' || E.isAlly(r.attacker), theirs = r.defender === 'player' || E.isAlly(r.defender);
    h += `<h4>🪖 Ground assault · ${esc(r.planet)}</h4><div class="small muted">${esc(r.system)} · ${E.fmtTime(r.t)} · ${r.rounds} round${r.rounds === 1 ? '' : 's'}</div>`;
    const k = mine || theirs ? r.outcome : 'stalemate';
    h += ban(k, r.captured ? (r.razed ? '☄ ' + esc(r.planet) + ' was razed' : '⚑ ' + esc(r.planet) + ' captured by ' + esc(repName(r.attacker))) : 'The garrison held');
    h += `<h4>Attackers: ${esc(repName(r.attacker))}</h4>` + repTroops(r.atk.before, r.atk.after) + `<h4>Defenders: ${esc(r.defender != null ? repName(r.defender) : 'unclaimed')}</h4>` + repTroops(r.def.before, r.def.after);
    if (r.aboard) h += `<div class="small muted">Includes ${fmtN(r.aboard)} fleet${r.aboard === 1 ? '' : 's'} of troops that were aboard transports docked at the planet.</div>`;
    if (r.burn) h += `<div class="small muted">Shields still up burned ${Math.round(r.burn * 100)}% of the landing force.</div>`;
  } else {
    const A = r.a, D = r.d;
    h += `<h4>⚔ ${esc(r.system)} · ${esc(r.planet)}</h4><div class="small muted">Attack on your world · ${E.fmtTime(r.t)}</div>`;
    h += ban(r.outcome === 'victory' ? 'victory' : 'defeat', r.outcome === 'victory' ? `✔ Victory — ${esc(r.planet)} held` : r.outcome === 'defeat' ? `✖ ${esc(r.planet)} LOST to ${r.attackers.map(x => esc(repName(x))).join(' + ')}` : '⛓ Orbit lost — the enemy blockades the planet');
    h += '<h4>Your side</h4>' + repShips(D.start, D.lost, [['✛ Turrets lost', 0, D.turretsLost || 0], ['⬢ Stations lost', 0, D.stationsLost || 0]]) + `<div class="small">Garrison: <b class="${D.garrisonLost ? 'bad' : ''}">${fmtN(D.garrisonLost)}</b> / ${fmtN(D.garrisonStart)} lost</div>`;
    h += `<h4>Enemy: ${r.attackers.map(x => esc(repName(x))).join(' + ')}</h4>` + repShips(A.start, A.lost) + `<div class="small">${A.troopsStart ? `Troops: <b>${fmtN(A.troopsLost)}</b> / ${fmtN(A.troopsStart)} lost${r.landed ? '' : ' (no landing)'}` : 'No troops landed.'}</div>`;
  }
  return { title: 'Battle report', html: h + '</div>' + back };
};


// ---------- incoming attacks / battle window / scouting / odds ----------
U.oddsCache = {};
function oddsFor(ctx, mode) {
  if (!ctx.level) return null;
  const extra = mode === 'nearest' ? ctx.nearest : mode === 'all' ? ctx.all : [];
  const sig = [ctx.sys, mode, ctx.level, ctx.attackers.map(f => f.id + ':' + f.ships.length).join(','), extra.map(x => x.f.id).join(','), ctx.defDocked.map(f => f.id + ':' + f.ships.length).join(','), ctx.defInbound.map(x => x.f.id).join(','), Math.round(ctx.p.shieldHp / 200), ctx.p.def.turret, !!ctx.w].join('|');
  const c = U.oddsCache[ctx.sys + mode], now = performance.now();
  if (c && (c.sig === sig || now - c.at < 2500)) return c.res;
  const res = E.defenseOdds(ctx, mode, 12);
  U.oddsCache[ctx.sys + mode] = { sig, at: now, res };
  return res;
}
function oddsChip(res, lead) {
  if (!res || !res.known) return `<span class="odds unk">odds unknown</span>`;
  const cls = res.p >= 0.7 ? 'hi' : res.p >= 0.4 ? 'mid' : 'lo';
  return `<span class="odds ${cls}">${lead || 'win'} ${res.text}</span>`;
}
function compChips(f, level) {
  if (!level) return `<div class="comp"><span class="chip unk">ships & troops unknown — no Scout Post covers this system</span></div>`;
  const I = E.fleetIntel(f, level); if (!I) return `<div class="comp"><span class="chip unk">ships & troops unknown — no Scout Post covers this system</span></div>`;
  const ships = Object.entries(I.ships || {}).map(([h, r]) => { const H = E.HULLS[h]; return `<span class="chip"><canvas class="hthumb" data-hull="${h}" width="30" height="20"></canvas>${E.fmtRange(r)}× ${H ? H.short : h}</span>`; }).join('');
  const troops = Object.entries(I.troops || {}).map(([k, r]) => { const T = E.TROOPS[k]; return `<span class="chip">${T ? T.icon : ''} ${E.fmtRange(r)}× ${T ? T.short : k}</span>`; }).join('') || '<span class="chip muted">no troops seen</span>';
  return `<div class="comp"><span class="chip lvl">📡 Lv${level}</span>${ships}</div><div class="comp">${troops}</div>`;
}
function attackCard(sys) {
  const st = E.state, ctx = E.defenseContext(sys); if (!ctx) return '';
  const w = ctx.w, name = esc((st.systems[sys] || {}).name || 'a system');
  let h = `<div class="alertcard ${w ? 'win' : ''}">`;
  if (w && w.quick) h += `<div class="small muted">No fleet could arrive within ${E.ATTACK_WINDOW}s, so this battle resolves at once.</div>`;
  if (w) h += `<div class="hd"><div><b>⚔ BATTLE WINDOW · ${name}</b><div class="small muted">Any fleet that arrives before it closes joins the fight. Then it resolves instantly.</div></div><div class="eta" data-wend="${w.end}">${E.fmtTime(Math.max(0, w.end - st.t))}</div></div><div class="wbar"><i style="width:${Math.max(0, (w.end - st.t) / E.ATTACK_WINDOW * 100)}%"></i></div>`;
  else h += `<div class="hd"><div><b>⚠ Attack on ${name}</b><div class="small muted">Battle window (${E.ATTACK_WINDOW}s) opens on arrival.</div></div><div class="eta"${ctx.attackers[0] ? ' data-eta-fid="' + ctx.attackers[0].id + '"' : ''}>${E.fmtTime(ctx.T0)}</div></div>`;
  for (const f of ctx.attackers) {
    const al = st.alerts[f.id], lv = (al && al.level) || 0, sc = lv > 0;
    const arrived = !f.path.length;
    h += `<button class="small" style="margin-top:8px;display:block;text-align:left;width:100%;background:none;border:0;color:inherit;padding:0" data-a="openScout" data-f="${f.id}" data-s="${sys}">${factionBadge(f.owner)} <b>${esc(f.name || 'Fleet')}</b> ${arrived ? '· <span class="bad">in orbit</span>' : '· ETA <b data-eta-fid="' + f.id + '">' + E.fmtTime(E.fleetETA(f)) + '</b>'}${sc ? ' · 📡 scout Lv' + lv : ''} · 🔭</button>`;
    h += compChips(f, lv);
    if (lv < 10) { const pl = E.scoutPlan(f.id); const busy = (st.scoutMissions || []).find(m => m.kind === 'fleet' && m.target === f.id); h += `<div class="row">${busy ? '<span class="small">📡 Scouts en route — report in ' + E.fmtTime(busy.done - st.t) + '</span>' : pl.ok ? btn('📡 Send scouts from ' + esc(pl.p.name) + ' (Lv' + pl.level + ', ' + E.fmtTime(pl.t) + ')', 'scout', { f: f.id }, (sc ? '' : 'primary ') + 'mini2') : sc ? '' : '<span class="small muted">📡 ' + esc(pl.msg) + '</span>'}</div>`; }
  }
  const o0 = oddsFor(ctx, 'now'), o1 = oddsFor(ctx, 'nearest'), o2 = oddsFor(ctx, 'all');
  h += `<div class="small" style="margin-top:8px">Your defense: ✛${(ctx.p && ctx.p.def && ctx.p.def.turret) || 0} turrets · ◯ shield ${ctx.p ? Math.round((ctx.p.shieldHp || 0) / Math.max(1, E.shieldMax(st, ctx.p)) * 100) : 0}% · 🪖${ctx.p ? E.troopCount(ctx.p.garrison) : 0} garrison${ctx.p && E.aboardAt(ctx.p) ? ' + ' + E.aboardAt(ctx.p) + ' aboard' : ''} · ${(ctx.defDocked || []).reduce((a, f) => a + ((f.ships && f.ships.length) || 0), 0) + (ctx.defInbound || []).reduce((a, x) => a + ((x.f && x.f.ships && x.f.ships.length) || 0), 0)} ships here or inbound</div>`;
  h += `<div class="small">If nothing else is sent: ${oddsChip(o0, 'win')}${ctx.level ? ' <span class="muted small">(scout Lv' + ctx.level + ')</span>' : ' <span class="muted">— no scout coverage: build a Scout Post here or nearby</span>'}</div>`;
  h += '<div class="sendrow">';
  const n = ctx.nearest[0];
  h += n ? `<button class="b sendbtn" data-a="sendDef" data-s="${sys}" data-m="nearest"><span>🚀 Send nearest fleet<br><small class="muted">${esc(n.f.name || 'Fleet ' + n.f.id)} · ${n.f.ships.length} ships · ETA ${E.fmtTime(n.eta)}</small></span>${oddsChip(o1)}</button>` : `<button class="b sendbtn" disabled><span>🚀 Send nearest fleet<br><small>No fleet can arrive before the window closes</small></span></button>`;
  h += ctx.all.length ? `<button class="b sendbtn" data-a="sendDef" data-s="${sys}" data-m="all"><span>🚀🚀 Send all fleets (${ctx.all.length})<br><small class="muted">everything that can arrive in time · last ETA ${E.fmtTime(ctx.all[ctx.all.length - 1].eta)}</small></span>${oddsChip(o2)}</button>` : `<button class="b sendbtn" disabled><span>🚀🚀 Send all fleets<br><small>No fleets available</small></span></button>`;
  h += '</div>';
  h += `<div class="row" style="margin-top:6px">${btn('🎯 Go to system', 'jump', { s: sys }, 'mini2')}${btn('🪐 Planet', 'openSys', { s: sys }, 'mini2')}${E.battleAt(sys) ? btn('⚔ Battle status', 'watch', { s: sys }, 'warn mini2') : ''}</div>`;
  return h + '</div>';
}
RENDER.incoming = function () {
  const st = E.state, inc = E.incoming();
  const targets = [...new Set(st.windows.filter(w => !w.closed).map(w => w.sys).concat(inc.filter(a => a.kind === 'attack').map(a => a.target)))];
  let h = '';
  if (!targets.length && !inc.length) h += '<p class="muted">All quiet. The moment an enemy fleet sets course for one of your systems it appears here with a live countdown. A <b>📡 Scout Post</b> on (or near) the target reports ship and troop estimates and win odds instantly; higher levels are more precise.</p>';
  for (const sys of targets) h += attackCard(sys);
  for (const a of inc.filter(a => a.kind === 'raid')) {
    const al = st.alerts[a.fid], lv = (al && al.level) || 0, sc = lv > 0;
    h += `<div class="alertcard raid"><div class="hd"><div><b>☠ Raid on trade lane · ${esc((st.systems[a.target] || {}).name || 'a system')}</b><div class="small">${factionBadge(a.owner)} ${esc(a.f.name || 'Raiders')}</div></div><div class="eta" data-eta-fid="${a.fid}">${E.fmtTime(a.eta)}</div></div>${compChips(a.f, lv)}<div class="row">${btn('🎯 Go to system', 'jump', { s: a.target }, 'mini2')}${sc ? '' : (E.scoutPlan(a.fid).ok ? btn('📡 Send scouts', 'scout', { f: a.fid }, 'mini2') : '')}</div></div>`;
  }
  h += idleHTML();
  const stuck = st.stuckAlerts || [];
  if (stuck.length) h += '<h4>⚠ Stuck fleets</h4>' + stuck.map(a => {
    const f = E.fleetById(a.fid), still = f && f.rallyTo != null && !f.path.length;
    return `<div class="card alertcard stuck"><div class="hd"><div><b>⚠ Rally fleet sitting still</b><div class="small">${esc(a.name || (f && f.name) || ('Fleet ' + a.fid))} at ${esc((E.sysPlanet(a.sys) || {}).name || 'a system')} for over a minute</div></div></div><div class="row">${btn('🎯 Jump to fleet', 'jumpStuck', { f: a.fid, s: a.sys }, 'primary mini2')}</div></div>`;
  }).join('');
  const last = (st.results || []).slice(0, 4);
  if (last.length) h += '<h4>Recent battles</h4>' + last.map(r => {
    const rp = (E.replayFor && (E.replayFor(r.id) || E.replayFor(r.sys, true)));
    return `<div class="fleet"><div><b class="${r.outcome === 'victory' ? 'good' : 'bad'}">${r.outcome === 'victory' ? '✔ Victory' : r.outcome === 'defeat' ? '✖ Planet lost' : '⛓ Blockaded'}</b> · ${esc(r.system)} <span class="muted small">${E.fmtTime(r.t)}</span></div><div class="row">${btn('Report', 'showResult', { i: st.results.indexOf(r) }, 'mini2')}${rp ? btn('▶ Replay', 'replayAlert', { id: rp.id }, 'mini2') : ''}</div></div>`;
  }).join('');
  return { title: '📡 Incoming attacks', html: h };
};
function stageLine(side, hulls) {
  const st0 = hulls.reduce((a, h) => a + (side.start[h] || 0), 0), lost = hulls.reduce((a, h) => a + (side.lost[h] || 0), 0);
  const list = hulls.filter(h => side.lost[h]).map(h => side.lost[h] + ' ' + E.HULLS[h].short).join(', ');
  return st0 ? `<b class="${lost ? 'l' : ''}">${lost}</b>/${st0} lost${list ? ' <span class="muted">(' + list + ')</span>' : ''}` : '<span class="muted">none</span>';
}
U.showResult = function (r) {
  const st = E.state, box = $('#result');
  const title = r.outcome === 'victory' ? 'VICTORY' : r.outcome === 'defeat' ? 'DEFEAT' : 'ORBIT LOST';
  const line = r.outcome === 'victory' ? `✔ ${esc(r.planet)} held — the attackers are gone` : r.outcome === 'defeat' ? `✖ ${esc(r.planet)} LOST to ${r.attackers.map(o => E.FACTIONS[o].short).join(' + ')}` : `⛓ ${esc(r.planet)} still ours, but the enemy holds orbit and is blockading it`;
  const A = r.a, D = r.d;
  const SC = E.SMALL_CRAFT, CAP = E.CAPITAL;
  const row = (stage, you, foe) => `<tr><th>${stage}</th><td>${you}</td><td>${foe}</td></tr>`;
  box.innerHTML = `<div class="resbox ${r.outcome}"><h2>${title}</h2><div class="sub">Battle report · ${esc(r.system)} · ${r.attackers.map(o => esc(E.FACTIONS[o].name)).join(' + ')}</div><div class="planetline">${line}</div>
    <table class="rep"><tr><th></th><th>You</th><th>Enemy</th></tr>
    ${row('① Small craft<br><small>Fighters · Transports · Traders</small>', stageLine(D, SC), stageLine(A, SC))}
    ${row('② Capital ships<br><small>Destroyers · defenses</small>', stageLine(D, CAP) + `<br><small>✛ ${D.turretsLost} turrets${D.stationsLost ? ' · ⬢ ' + D.stationsLost + ' stations' : ''} lost</small>`, stageLine(A, CAP))}
    ${row('③ Ground<br><small>Troops</small>', `Garrison <b class="${D.garrisonLost ? 'l' : ''}">${D.garrisonLost}</b>/${D.garrisonStart} lost`, A.troopsStart ? `Troops <b>${A.troopsLost}</b>/${A.troopsStart} lost${r.landed ? '' : ' <span class="muted">(no landing)</span>'}` : '<span class="muted">no troops</span>')}
    </table>
    <div class="row" style="margin-top:12px;justify-content:center">${(() => { const rp = E.replayFor && E.replayFor(r.sys, true); return rp ? btn('Battle animation simulation', 'replayClose', { id: rp.id }, 'rbtn big') : ''; })()}${btn('OK', 'closeResult', {}, 'primary big')}</div></div>`;
  box.classList.remove('hidden');
  E.emit('sfx', r.outcome === 'victory' ? 'victory' : 'alert');
};
// v1.9 item 18: while a result is on screen, further results stack into one '+N more' line instead of new pop-ups
E.on('windowResult', r => { if (E.state._ff) return; const box = $('#result');
  if (box && !box.classList.contains('hidden') && box.querySelector('.resbox')) { U.resultMore = (U.resultMore || 0) + 1; U.resultMoreList = (U.resultMoreList || []).concat(r);
    let m = box.querySelector('.resmore'); if (!m) { m = document.createElement('div'); m.className = 'resmore small'; box.querySelector('.resbox').insertBefore(m, box.querySelector('.resbox .row')); }
    const v = U.resultMoreList.filter(x => x.outcome === 'victory').length; m.innerHTML = `+${U.resultMore} more battle result${U.resultMore === 1 ? '' : 's'} (${v} won, ${U.resultMore - v} lost) — see Alerts › Recent battles`;
  } else { U.resultMore = 0; U.resultMoreList = []; U.showResult(r); }
  U.render(false); });

// v2.1 item 8: fleets already in orbit of an enemy / independent world are candidates too (e.g. switch an Attack to
// Invade after the space battle is won); only your own world excludes the fleets docked there.
function sendCandidates(sys) { const p = E.sysPlanet(sys), own = !p || p.owner === 'player'; return E.state.fleets.filter(f => f.owner === 'player' && f.ships.length && !f.routeId && !(own && f.sys === sys && !f.path.length)); }
U.openSend = function (sys, fids) {
  const p = E.sysPlanet(sys);
  const prev = U.sendSel && U.sendSel.s === sys ? U.sendSel : null;
  U.sendSel = prev || { s: sys, fids: fids ? fids.slice() : [], action: null, speed: 100, sync: false, load: {} };
  if (fids) for (const id of fids) if (!U.sendSel.fids.includes(id)) U.sendSel.fids.push(id);
  U.open('send', { s: sys });
};
// v2.2 item 5: invade check card on the send screen
function invadeCheckHTML(c) {
  if (!c) return '';
  if (c.unknown) return `<div class="invchk unk" id="invChk">❔ <b>Unknown — not scouted.</b> <span class="small">You land ${fmtN(c.troops)} troops; send a scout (or Attack first) to see the garrison.</span></div>`;
  const nums = `${fmtN(c.troops)} troops (power ${fmtN(Math.round(c.atk))}) vs ${c.exact ? '' : '≈'}${fmtN(c.defN)} defenders (power ${fmtN(Math.round(c.def))})`;
  const src = c.exact ? '' : ` <span class="muted">· from a scout report ${E.fmtTime(c.age)} old${c.range ? ', worst case' : ''}</span>`;
  const orbit = (c.orbit ? ' <span class="warn small">· win the space battle first</span>' : '') + (c.burn > 0.05 ? ` <span class="warn small">· shields up now: −${Math.round(c.burn * 100)}% troops on landing (counted)</span>` : '');
  if (c.will) return `<div class="invchk ok" id="invChk">✅ <b>Will capture</b> — ${nums}; ≈${fmtN(c.left)} of your troops survive.${src}${orbit}</div>`;
  return `<div class="invchk no" id="invChk">❌ <b>Not enough troops</b> — ${nums}. Load about <b>${fmtN(c.need)}</b> more.${src}${orbit}</div>`;
}
RENDER.send = function (o) {
  const st = E.state, sys = o.s, s = st.systems[sys], p = E.sysPlanet(sys);
  if (!U.sendSel || U.sendSel.s !== sys) U.sendSel = { s: sys, fids: [], action: null, speed: 100, sync: false, load: {} };
  const S = U.sendSel; S.load = S.load || {}; S.fids = S.fids.map(Number); // v2.1 item 8: ids are numbers
  const cands = sendCandidates(sys);
  const blockOf = {}; for (const f of cands) blockOf[f.id] = E.targetBlock('player', f.path.length ? f.path[0] : f.sys, sys);
  S.fids = S.fids.filter(id => cands.some(f => f.id === id) && !blockOf[id]);
  for (const id in S.load) if (!S.fids.includes(+id)) delete S.load[id];
  const acts = E.sendActionsFor(S.fids, sys, { load: S.load });
  if (!S.action || (acts[S.action] && S.fids.length)) {
    const own = p && p.owner === 'player', neu = p && p.owner === 'neutral';
    const pref = own ? ['relocate'] : neu ? ['colonize', 'attack'] : ['invade', 'raze', 'attack'];
    if (!S.action || !S.fids.length) S.action = pref.find(k => !acts[k]) || pref[0];
  }
  let h = `<div class="sendhead"><div><b>${esc(p ? p.name : s.name)}</b> ${p ? factionBadge(p.owner) : '<span class="badge" style="--c:#7dff6b">Rift</span>'}</div><div class="small muted">${E.fmtTime(E.HOP_TIME)} per tile at 1× · routes avoid enemy worlds</div></div>`;
  const allBlocked = cands.length && cands.every(f => blockOf[f.id]);
  if (allBlocked) h += `<div class="card front no">🚫 <b>Target greyed out</b><div class="small">${esc(blockOf[cands[0].id])}. Fleets travel only through your own, allied or independent space; inner enemy worlds open up once the front line next to them falls.</div></div>`;
  else if (p && E.blocksPassage('player', sys)) h += '<div class="card front ok small">⚔ Front-line target — reachable without crossing enemy worlds.</div>';
  const etaOf0 = (() => { const pv0 = E.sendPreview(cands.map(f => f.id), sys, 1, false); return id => pv0.rows.find(x => x.fid === id); })();
  // v2.3 item 3b: 1 Confirm/Send · 2 Order · 3 Load troops · 4 Arrival timing · 5 Time estimate · 6 Fleets to send
  const own = p && p.owner === 'player';
  const ORDER = ['attack', 'invade', 'colonize', 'raze', 'relocate', 'annihilate'].filter(k => E.SEND_ACTIONS[k]).concat(Object.keys(E.SEND_ACTIONS).filter(k => !['attack', 'invade', 'colonize', 'raze', 'relocate', 'annihilate'].includes(k)));
  const A = E.SEND_ACTIONS[S.action], why = S.fids.length ? acts[S.action] : (S.action === 'relocate' && !own ? 'Relocate works only to your own planets' : '');
  const lift = S.fids.map(E.fleetById).filter(f => f && E.fleetStats(f).cap);
  const wantTroops = S.action === 'invade' || S.action === 'colonize' || S.action === 'raze';
  const pv = E.sendPreview(cands.map(f => f.id), sys, S.speed / 100, false);
  const pvSel = E.sendPreview(S.fids, sys, S.speed / 100, S.sync);
  const etaOf = id => { const r = pvSel.rows.find(x => x.fid === id); return r ? r : pv.rows.find(x => x.fid === id); };

  // 1 · Confirm / Send
  h += `<div class="card sendgo" id="sendConfirm"><h4>1 · Confirm</h4><button class="b primary big wide" data-a="sendExec" ${!S.fids.length || why ? 'disabled' : ''}>${A.icon} ${A.name}${S.fids.length ? ' with ' + S.fids.length + ' fleet' + (S.fids.length > 1 ? 's' : '') : ''}</button>${why ? '<div class="small bad">⚠ ' + esc(why) + '</div>' : '<div class="small muted">Review the order, troops and arrival below, then confirm.</div>'}</div>`;

  // 2 · Order
  h += '<div class="card orders" id="sendOrders"><h4>2 · Order</h4><div class="acts acts6">' + ORDER.map(k => {
    const A0 = E.SEND_ACTIONS[k], w0 = S.fids.length ? acts[k] : (k === 'relocate' && !own ? 'Only to your own planets' : '');
    return `<button class="b act ${S.action === k ? 'on' : ''} ${w0 ? 'dis' : ''}" data-a="sendAction" data-k="${k}" title="${esc(w0 || A0.desc)}"><span>${A0.icon}</span>${A0.name}</button>`;
  }).join('') + '</div>';
  h += `<div class="small ${why ? 'bad' : 'muted'}">${why ? '⚠ ' + esc(why) : esc(A.desc)}</div>`;
  if (S.action === 'annihilate') {
    const f0 = S.fids.map(E.fleetById).find(Boolean);
    const route = f0 && E.annihilateStops ? E.annihilateStops(f0.owner, f0.sys, sys) : null;
    const n = route ? route.stops.length : 0;
    h += `<label class="small" style="display:flex;margin-top:8px;gap:8px;align-items:center;clear:both"><input type="checkbox" data-in="annihHalt50" ${S.halt50 ? 'checked' : ''}> Stop if fleet below 50% strength</label>`;
    h += n ? `<div class="small" id="annihCount">💀 Route will raze <b>${n}</b> enemy world${n === 1 ? '' : 's'} along the path, then hold at the target.</div>` : '<div class="small muted" id="annihCount">No enemy worlds on this path (it will just move to the target).</div>';
  }
  h += '</div>';

  // 3 · Load troops + invade check (always shown so the send-screen order stays fixed)
  if (true) {
    h += `<div class="card loadstep ${wantTroops ? 'hl' : ''}" id="sendLoad"><h4>3 · Load troops</h4>`;
    if (!lift.length) h += S.fids.length ? '<div class="small bad">None of the selected fleets has Transports. Add a fleet with Transports to carry troops.</div>' : '<div class="small muted">Tick a fleet with Transports in the list below to carry troops.</div>';
    for (const f of lift) {
      const mx = E.loadMax(f), v = E.clamp(S.load[f.id] || 0, 0, mx), aboard = E.troopCount(f.troops);
      h += `<div class="lrow"><div class="small"><b>${esc(f.name || 'Fleet ' + f.id)}</b> · 🪖 ${aboard} aboard${mx ? ' · +<b data-lv="${f.id}">' + fmtN(v) + '</b> to load' : ''} · capacity ${fmt(E.fleetStats(f).cap)}</div>`;
      if (mx) h += `<div class="qty"><input type="range" min="0" max="${mx}" step="1" value="${v}" data-in="sendLoad" data-f="${f.id}" aria-label="Troops to load"><input type="number" class="qnum" inputmode="numeric" min="0" max="${mx}" value="${v}" aria-label="Troops to load amount">${btn('Max', 'sendLoadMax', { f: f.id, max: mx }, 'mini2')}${btn('None', 'sendLoadMax', { f: f.id, max: 0 }, 'mini2')}</div>`;
      else h += `<div class="small muted">${f.path.length ? 'In flight — can only carry what is aboard' : E.sysPlanet(f.sys)?.owner !== 'player' ? 'Not at one of your worlds' : E.troopSize(f.troops) >= E.fleetStats(f).cap ? 'Transports full' : 'No troops in this garrison'}</div>`;
      h += '</div>';
    }
    h += `<div class="small muted">${wantTroops ? 'Invade lands only the troops aboard; Colonize works without any (troops aboard fight the militia and speed it up). ' : ''}Attack never needs troops.</div>`;
    if ((S.action === 'invade' || S.action === 'raze') && p && !own && E.invadeCheck) h += invadeCheckHTML(E.invadeCheck(S.fids, p.id, S.load));
    h += '</div>';
  }

  // 4 · Arrival timing
  h += `<div class="card arrival" id="sendArrival"><h4>4 · Arrival timing</h4>
    <div class="speedrow big"><span class="small muted">Slower</span><input type="range" id="sendSpeed" min="25" max="100" step="5" value="${S.speed}" data-in="sendSpeed" aria-label="Arrival speed"><span class="small muted">Full</span><b id="sendSpeedV">${S.speed}%</b></div>
    <div class="row">${[100, 75, 50, 25].map(v => btn(v + '%', 'sendSpeed', { v }, 'mini2' + (S.speed === v ? ' on' : ''))).join('')}<button class="b mini2 sync ${S.sync ? 'on' : ''}" data-a="sendSync">⏱ Sync arrival${S.sync ? ' ✓' : ''}</button></div>
    <div class="small muted">Slow fleets down so they land together or after a wave; Sync makes every selected fleet arrive with the slowest one.</div></div>`;

  // 5 · Time estimate
  const sel = pvSel.rows.filter(r => isFinite(r.eta));
  if (sel.length) {
    const lo = Math.min(...sel.map(r => r.eta)), hi = Math.max(...sel.map(r => r.eta));
    h += `<div class="card sumcard" id="sendEta"><h4>5 · Time estimate</h4>${S.sync ? '⏱ All ' + sel.length + ' fleets arrive together in <b>' + E.fmtTime(hi) + '</b>' : sel.length > 1 ? 'Arrivals from <b>' + E.fmtTime(lo) + '</b> to <b>' + E.fmtTime(hi) + '</b>' : 'Arrives in <b>' + E.fmtTime(hi) + '</b>'}${S.speed < 100 ? ' · slowed to ' + S.speed + '%' : ''}</div>`;
  } else {
    h += `<div class="card sumcard" id="sendEta"><h4>5 · Time estimate</h4><div class="small muted">Pick fleets below to see when they arrive.</div></div>`;
  }

  // 6 · Fleets to send — rallying fleets collapse into one group per rally point
  h += `<div class="hrow" id="sendFleetsHead" style="margin-top:8px"><span class="small muted">6 · Fleets to send (${S.fids.length}/${cands.length})</span>${cands.length > 1 ? btn(S.fids.length === cands.length ? 'None' : 'All', 'sendAllPick', {}, 'mini2') : ''}</div>`;
  if (!cands.length) h += '<p class="muted">No fleets available. Build ships in a Shipyard.</p>';
  const sendRow = f => {
    const on = S.fids.includes(f.id), r = etaOf(f.id), fs = E.fleetStats(f), blk = blockOf[f.id];
    const comp = Object.entries(E.fleetComposition(f).ships).map(([k, n]) => n + ' ' + E.HULLS[k].short).join(' · ');
    const pth = E.pathFor('player', f.path.length ? f.path[0] : f.sys, sys); const hops = (pth ? pth.length : 0) + (f.path.length ? 1 : 0);
    const slow = on && r && r.mul < 0.999 ? ` <span class="warn">@${Math.round(r.mul * 100)}%</span>` : '';
    if (blk) return `<button class="fl dis" data-a="sendPick" data-f="${f.id}" title="${esc(blk)}"><span class="ck">🚫</span><span class="fn"><b>${esc(f.name || 'Fleet ' + f.id)}</b><small>${comp}</small><small class="bad">${esc(blk)}</small></span><span class="eta">—</span></button>`;
    return `<button class="fl ${on ? 'on' : ''}" data-a="sendPick" data-f="${f.id}"><span class="ck">${on ? '☑' : '☐'}</span><span class="fn"><b>${esc(f.name || 'Fleet ' + f.id)}</b><small>${comp}${E.troopCount(f.troops) ? ' · 🪖' + E.troopCount(f.troops) : ''}${fs.cargo ? ' · 📦' + fmt(fs.cargo) : ''}</small><small class="muted">from ${esc(st.systems[f.path.length ? f.path[0] : f.sys].name)} · ${hops} tile${hops === 1 ? '' : 's'}</small></span><span class="eta">${r && isFinite(r.eta) ? E.fmtTime(on ? r.eta : r.base / (S.speed / 100)) : '—'}${slow}</span></button>`;
  };
  const { groups: sendG, rest: sendRest } = E.rallyGroups(cands);
  h += '<div class="sendlist">';
  h += sendRest.map(sendRow).join('');
  for (const g of sendG) {
    const ids = g.fleets.filter(f => !blockOf[f.id]).map(f => f.id);
    const allOn = ids.length && ids.every(id => S.fids.includes(id));
    const some = ids.some(id => S.fids.includes(id));
    const pick = (gg) => `<button class="fl rallypick ${allOn ? 'on' : ''}" data-a="sendPickGroup" data-dest="${gg.key}" title="Select every fleet in this rally group"><span class="ck">${allOn ? '☑' : some ? '☒' : '☐'}</span></button>`;
    h += E.rallyGroupHTML(g, 'send-' + g.key, { row: sendRow, pick });
  }
  h += '</div>';
  if (own) { const idle = cands.filter(f => !f.path.length && f.order === 'idle' && !blockOf[f.id]);
    const near = cands.filter(f => !blockOf[f.id]).map(f => ({ f, r: etaOf0(f.id) })).filter(x => x.r && isFinite(x.r.base)).sort((a, b) => a.r.base - b.r.base)[0];
    h += `<div class="quick" id="sendQuickRow">${btn('⚡ All idle fleets' + (idle.length ? ' (' + idle.length + ')' : ''), 'sendQuick', { q: 'idle' }, 'mini2' + (idle.length ? '' : ' dis'))}${btn('📍 Nearest fleet' + (near ? ' · ' + E.fmtTime(near.r.base) : ''), 'sendQuick', { q: 'near' }, 'mini2' + (near ? '' : ' dis'))}</div>`; }

  return { title: '🚀 Send fleets', html: h };
};

RENDER.help = function () {
  const st = E.state;
  let h = `<p class="premise">${E.PREMISE}</p>
  <h4>New in v2.5</h4><p class="small"><b>Headquarters</b> is the first tab on your capital (and a button at the top of Build). <b>Annihilate:</b> send a fleet at any enemy world, even deep behind the front — it fights and razes every enemy planet on the way, then holds at the target. The map draws the razing path and a count; optionally stop if the fleet drops below 50% strength. <b>Battle playback</b> now follows the real fight (ships move, shoot, take damage and explode). Alerts have a <b>Replay</b> button for recent battles. <b>Saves</b> are compacted and compressed (each slot shows its size in KB); old battle logs keep the last ~10. Delete a slot from the title or in-game menu (with a confirm). <b>Stuck rally:</b> if a rallying fleet sits still for over a minute of game time, Alerts gets a jump-to notice. Zoomed-in panning is smoother (incremental bands, no leading-edge blur).</p>
  <h4>New in v2.4</h4><p class="small"><b>Idle chip:</b> tap the idle-buildings counter in the top bar to jump the camera to a planet with idle construction slots (the one with the most idle slots first, including worlds where every slot is idle). Each further tap cycles to the next idle planet. The camera pans to center that world without changing zoom. <b>Zoomed-in panning</b> keeps crisp full detail all the way to the leading edge — the map cache is now larger than the screen and refreshes before you reach the edge, so panning no longer leaves a blank or blurred strip.</p>
  <h4>New in v2.3</h4><p class="small"><b>Rally groups:</b> every fleet that is rallying (en route or waiting at a rally point) collapses into one group row per rally point, with a clear expand/collapse button, default collapsed and remembered. Same treatment on the main fleet list, the planet fleets screen, and the send screen. <b>Map:</b> the simplified/blurred universe is used only when zoomed out (past the cluster-fill threshold); zoomed-in panning keeps full detail. Traveling fleets are still plain triangles, now in three sizes (small / medium / large) by ship count and power, with no numbers or icons. <b>Send screen</b> order: Confirm/Send, Order, Load troops, Arrival timing, Time estimate, Fleets to send. <b>Docked fleets</b> (Overview › Open fleets here): list, Merge, Load troops, then Split into a new fleet.</p>
  <h4>New in v2.2</h4><p class="small"><b>Smoother map:</b> while you drag or pinch, and when zoomed far out, the map draws only dots, coloured territory and a few fleet markers; names, borders and effects come back when you let go or zoom in. <b>Fast start</b> (any map size): ×5 starting resources and quicker early builds. <b>Easier endings:</b> an empire down to 3 worlds or under 10% of its peak is collapsing — weaker shield regen, slower production and deserting garrisons. <b>Save slots:</b> 3 named slots with Export/Import (JSON file) on the title screen and in Menu; Continue loads the newest. <b>Invade check:</b> the send screen says whether your troops will capture, using scouted defense (or "unknown — not scouted"). <b>Rift warning</b> 10 game-minutes before it opens. Traveling fleets are plain triangles. <b>Galactic</b> maps: 400 systems. The planet window starts lower so alerts never cover its ✕. Send screen order: Order → Load troops → Fleets → Arrival + Send.</p>
  <h4>New in v2.1</h4><p class="small"><b>Headquarters:</b> your capital has an HQ (start Lv5). Its level caps every building on every planet; upgrade it with banked research points (pause research to bank them) to raise the cap and the planet cap, and unlock extra building slots at Lv8 and Lv12. The HQ also sells permanent perks (industry, construction, shipworks, navigation, fortify, drill, scholars). <b>Rift cycle:</b> the Rift opens for 2 h of game time sending waves, then closes for 2 h (its fleets collapse and Hollow worlds go neutral), forever — each opening is stronger; the top bar shows open/closed and the countdown. <b>Send screen:</b> Relocate is at the top with quick picks (all idle fleets, nearest fleet). <b>Map:</b> tapping a planet no longer moves the camera; fleets are simple triangles on the map; the zoomed-out view is cached and borders are thinner. <b>Massive</b> maps: 250 systems, 8 rivals. Freighters have no ownership cap. Fixed: invading with a rally-formed fleet, and Continue loading an older save.</p>
  <h4>New in v2.0</h4><p class="small"><b>Graphics overhaul:</b> detailed ship sprites (gold trim on Forge-boosted ships), layered parallax starfield with drifting nebulas, glowing lanes and soft empire borders, banners on capitals. Tap a planet and its animated close-up (rotating surface, clouds, day/night, turrets and stations) sits at the top of the panel; closing zooms back out. <b>No automatic battle animation:</b> every battle you fight ends with a result card; tap <b>Battle animation simulation</b> to build and watch a replay made from the recorded battle. Engine trails, warp flashes, capture waves, generated music and effects, haptics, Graphics quality Low/Medium/High (Auto drops to Low on slow devices) and a photo mode (Menu › Settings, or P).</p>
  <h4>New in v1.9</h4><p class="small"><b>No more cargo:</b> Transports and Freighters are troop ships only. <b>Freighter:</b> 1,000 troops, 20,000 HP, ${fmtN(E.HULLS.freighter.cost.crystal)} crystal, ≈1 min at a Lv15 Shipyard. No ownership cap since v2.1. <b>🔩 Keelwright Forge:</b> +${E.FORGE_PER_LVL}% hull, shields and damage per level for ships BUILT on that planet (max +${E.FORGE_MAX}%), shown with a ⬆ badge. <b>🚀 Lava worlds</b> build ships 15% faster. Building upgrades take twice as long — tap <b>⏩ Skip</b> to finish one for metal (cost grows with time left and level), or <b>Skip all</b>. Shipyard/Barracks upgrades speed up batches already queued. Carriers smash turrets (×${E.DEF_BONUS.carrier.turret}). Every Rift wave hits <b>every empire</b> at once, from the Rift; the top bar counts down to the next wave and its size. Scouts: ≤1 min at Lv1, instant from Lv10, exact auto-scouting at Lv15. Alerts and battle pop-ups are grouped; battles over ${E.BATTLE_ANIM_MAX} units skip the live animation. Sliders have Max + type-in boxes; trade routes can send several traders; Fleets tab has an “Only fleets here” filter.</p>
  <h4>New in v1.8</h4><p class="small"><b>Turret-first defense:</b> attackers hit your turrets first and your docked garrison waits; the moment a turret is hit, every docked garrison ship launches (see the battle report). <b>Warship Carrier</b> (Shipyard Lv10) and <b>Freighter</b> (Lv15, 100 troops, fast). Every ship card shows what it is <b>best vs</b>. Tap one of your fleets in flight for the <b>transit view</b> with ETA and Recall. Pick a <b>species</b> at the start. Big shipyards and barracks now build <b>much</b> faster (sub-second troops).</p>
  <h4>New in v1.7</h4><p class="small"><b>Free-for-all:</b> rival empires fight and capture each other's worlds too (you and your allies stay one team). <b>Fleets</b> are auto-named Fleet 1, 2, 3…; in the Fleets tab pick a fleet, press <b>⊕ Merge…</b> and tick the fleets docked beside it (others are greyed out). <b>↩ Recall</b> turns a fleet round mid-flight and sends it back to where it launched. Troops stay aboard transports until you unload them, and docked transports defend the planet. Tap a battle in the <b>Event log</b> for its full report. <b>Trade pays far more</b> (long routes, many routes per world and high Trade Center levels). Traders no longer take escorts. <b>Fog of war:</b> enemy ships are only visible when they are heading for one of your planets; enemy worlds show no counts until scouted, then only the latest 📡 scout snapshot with its age. The top bar shows your total 🪖 troops, ✈ fighters and ⛴ destroyers; the ⏸ chip counts planets with an empty construction slot, marked by a red ✕ on the map.</p>
  <h4>New in v1.6</h4><p class="small"><b>Buildings go to Lv15</b> (output, costs, times and trader slots keep scaling: 38 trader slots at Lv15). <b>No troop or ship caps</b> — queue as many as you can afford (sliders have a number box). <b>All fleet control is the bottom 🚀 Fleets tab</b>: pick a planet there, drag sliders to split ships or move them between groups, load troops, rename and send. The list shows big docked fleets first, then big fleets en route, then rally traffic as <b>one line per destination</b>. <b>Long-press</b> a planet on the map to make it the ⚑ rally point. Planet panels open on <b>Build</b>. The Empire tab never moves your map zoom. Your Commander level stays; the old unique super-ship is retired. The top bar's <b>⏸ chip</b> counts idle production queues and Traders; tap it to open Alerts.</p>
  <h4>From v1.5</h4><p class="small">You start in a <b>corner pocket</b> of 3–5 worlds with one <b>chokepoint</b> to the rest of the galaxy. Your worlds are a <b>wall</b>: enemies can't fly through them, so outer worlds are your fortress line and inner worlds your economy. A fleet whose route runs into a world you just settled attacks that world instead and stays there if it wins. Tiles take ${E.fmtTime(E.HOP_TIME)}. Storage is unlimited. Extractors give less metal and more crystal, so ships and troops are plentiful. ✦ <b>Perfect planets</b> (about 1 in 5 independents) carry every bonus. Extra Shipyards, Barracks, Bunkers and Trade Centers stack in full. Each Trade Center level adds 2–3 <b>trader slots</b> (25 at Lv10); routes only link your own Trade Center worlds and can't be attacked. Set a <b>⚑ rally point</b> on a planet's Overview to send new ships somewhere automatically. The 30 s battle window only runs when one of your fleets can arrive in time.</p>
  <h4>How to win</h4><p>An empire is <b>defeated when it has no colonized systems</b>. Defeat every rival to win. From mid-game the Rift opens for 2 h (game time), sending ${E.crisisWaves()} waves of the Hollow, then closes for 2 h — forever, a little stronger each time. Survive it; beating it is not required. You lose if your capital ★ falls.${st.mode === 'endless' ? ' <b>Endless mode:</b> each time every rival is defeated the Expanse grows around you — 20 → 40 systems (2 rivals) → 80 (4) → 160 (8), then it stays. You keep your worlds, fleets and Commander level.' : ''}</p>
  <h4>Species</h4><p class="small">You play as <b>${E.SPECIES[st.species].icon} ${E.SPECIES[st.species].name}</b> (${E.SPECIES[st.species].desc}). ${E.PICK_SPECIES.map(k => E.SPECIES[k]).map(x => x.icon + ' <b>' + x.name + '</b>: ' + x.desc).join(' · ')}. Rival empires get a random species. Games carried over from v1.7 play as ◎ Balanced (no bonus).</p>
  <h4>Resources</h4><p class="small">Only two resources pile up: <b style="color:${E.RES_COLOR.metal}">⛏ Metal</b> pays for <b>building and upgrading buildings and defenses</b>; <b style="color:${E.RES_COLOR.crystal}">${E.RES_ICON.crystal} Crystal</b> pays for <b>ships and troops</b>. <b style="color:${E.RES_COLOR.rp}">⚗ Research points</b> come from Labs. A <b>⚖ Trade Center</b> swaps metal ↔ crystal at 2.5 : 1 (Lv1) improving to 1.4 : 1 (Lv10); each trade route pays metal <i>or</i> crystal — your pick, switchable any time.</p>
  <h4>★ Commander & system cap</h4><p class="small">Your Commander levels up from <b>kills</b>: XP for every enemy ship destroyed (bigger ships give more) and every enemy soldier killed. You can hold <b>${E.CMD_CAP_BASE} colonized systems</b> at Lv1, +1 per level up to ${E.CMD_CAP_MAX}. At the cap, Invade and Colonize are blocked — level up, abandon or raze one of your worlds (Empire tab), or use <b>🔥 Raze</b> to wipe an enemy colony instead of taking it. The ★ chip in the top bar shows level, XP and systems/cap.</p>
  <h4>🤝 Allies</h4><p class="small">At setup you can add up to ${E.ALLIES.length} computer allies. They expand, defend your worlds, send relief wings and launch their own offensives. You can fly through allied space.</p>
  <h4 id="helpEnergy">⚡ Energy</h4><p class="small">Energy is <b>not</b> stored: each planet has a capacity (base ${E.ENERGY_BASE}, plus its planet type, plus ${E.ENERGY_PER_PLANT} per ⚡ Power Plant level). Every building level draws power; you can't build past the cap. The planet panel shows used/max.</p>
  <h4>Buildings</h4><p class="small"><b>Any building can be built several times</b> on one planet, limited only by slots and energy — each extra copy of the same type adds ×${E.MULTI_DR} of the one before. Garrisons have <b>no troop cap</b>. 🗑 <b>Demolish</b> frees a slot and refunds ${Math.round(E.DEMOLISH_REFUND * 100)}% of what the building cost.</p>
  <h4>Planet bonuses</h4><ul class="small">${Object.values(E.SPECS).map(x => '<li>' + x.icon + ' <b>' + x.name + '</b> — ' + x.desc + '</li>').join('')}</ul>
  <h4 id="helpRoster">Ships & counters</h4><p class="small">Four buildable hulls, all paid in crystal: <b>Fighters</b> (cheap), <b>Destroyers</b> (heavy), <b>Transports</b> (20 troops, unarmed), <b>Freighters</b> (Shipyard 15: 1,000 troops, 20,000 HP, no ownership cap), <b>Warship Carriers</b> (Shipyard 10: battleship, ×${E.DEF_BONUS.carrier.turret} damage vs turrets) and <b>Traders</b> (run trade routes, unarmed and untouchable). Fighters swarm Destroyers (×${E.COUNTER_BONUS} damage); a Destroyer's <b>flak</b> hits up to ${E.HULLS.destroyer.flak} extra Fighters near its target for ${Math.round(E.FLAK_SPLASH * 100)}% damage. A good fleet mixes both.</p>
  <div class="cycle">⚔ Fighters swarm Destroyers · Destroyer flak shreds massed Fighters</div>
  <p class="small muted">Look at the scout report: the AI leans towards whatever counters your most common warship.</p>
  <h4>Battles</h4><p class="small">Fights run in three stages — small craft (Fighters, Transports, Traders) clash first, then Destroyers and defenses, then infantry lands and fights the garrison (shields still up burn part of the landing force). Every defense ends with a <b>battle report</b> for all three stages.</p>
  <h4>Front lines</h4><p class="small">Fleets fly only through your own, allied or independent space — <b>never through an enemy-held world</b>. So only enemy planets next to space you can reach (the <b>front line</b>, ringed on the map) can be attacked; inner worlds are greyed out with the reason until the front breaks. The AI plays by the same rule.</p>
  <h4>Sending fleets & troops</h4><p class="small">Tap a planet → <b>🚀 Send fleets here</b> (or a fleet → <b>Send…</b>). Pick fleets and an action: Attack, Invade, Raze, Relocate or Colonize. <b>Load troops</b> on the fleet panel or in the send flow's Load step — <b>Invade and Raze are greyed until the fleet carries troops</b>; Attack and Colonize are always allowed (v1.5: Colonize needs no troops — troops aboard just speed it up). Travel takes <b>${E.fmtTime(E.HOP_TIME)} per tile</b> at 1× (2× and 4× game speed scale it). The big <b>Arrival timing</b> slider slows fleets down; <b>⏱ Sync arrival</b> lands every selected fleet together.</p>
  <h4>Scouting</h4><p class="small">Scouts are a building: the <b>📡 Scout Post</b>. v1.5: your best Scout Post covers <b>every</b> one of your planets. When a planet is attacked it instantly reports enemy ships and troops with ranges like <i>40–70 fighters</i> and win odds like <i>42–65%</i>. Higher levels narrow the ranges (Lv1 ±50%, Lv5 ±33%, Lv10 ±15%, Lv14 ±5%); <b>Lv15 is exact</b> and auto-scouts every world and fleet every ${E.SCOUT_AUTO_T} s. Without coverage, odds are unknown. You can also send a post's scouts to scan any enemy planet or fleet: at most ${E.SCOUT_MAX_T} s at Lv1, faster each level (Lv5 ≈ ${Math.round(E.scoutCapTime(5))} s), nearby targets quicker, and <b>instant from Lv${E.SCOUT_INSTANT}</b>.</p>
  <h4>Early warning</h4><p class="small">Fleets heading for your worlds appear in <b>📡 Alerts</b> with a live countdown. On arrival a <b>${E.ATTACK_WINDOW}-second battle window</b> opens: anything that gets there in time joins (<b>Send nearest fleet</b> / <b>Send all fleets</b> show the odds), then it resolves instantly. Tap ⚔ to watch live.</p>
  <h4>The loop</h4><ol class="small"><li>Build Metal and Crystal Extractors and Power Plants; pick a bonus for each planet (Trade, Defense, Troop & Ship Production, Resource Production).</li><li>Train infantry at Barracks with the quantity slider; load them onto Transports.</li><li>Build Fighters and Destroyers with the slider (Max = what you can afford).</li><li>Research with Labs (research points only).</li><li>Trade routes run by Traders pay metal or crystal (your pick); trade ships can't be attacked, so keep them busy.</li><li>Destroy enemy ships and troops to level your Commander and raise your system cap.</li></ol>
  <h4>Controls</h4><p class="small"><b>Touch</b>: tap a system or fleet · drag to pan · pinch to zoom · bottom bar for menus.<br><b>Mouse/keyboard</b>: click · drag · wheel zoom · <kbd>Space</kbd> pause · <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> speed 1×/2×/4× · <kbd>E</kbd> empire · <kbd>F</kbd> fleets · <kbd>R</kbd> research · <kbd>T</kbd> trade · <kbd>I</kbd> alerts · <kbd>L</kbd> log · <kbd>H</kbd> home · <kbd>B</kbd> battle · <kbd>Esc</kbd> close.</p>
  <p class="small muted">Settings (sound, save, tutorial, main menu) live in the <b>☰ Menu</b>.</p>
  <p class="muted small">Galaxies of Empires v${E.VERSION} · autosaves every 30 s · difficulty ${E.DIFFICULTY[st.diff].name}. All names, art and story are original.</p>`;
  return { title: 'Help & settings', html: h };
};

// ---------- actions ----------
function res(r) { if (r && !r.ok && r.msg) U.flash(r.msg); if (r && r.ok) U.render(false); return r; }
const ACT = {
  idleJump: () => { if (E.idleJump) E.idleJump(); },
  tab: d => { U.sheet.tab = d.tab; U.sheet.pick = undefined; U.render(true); },
  sub: d => { U.sheet.sub = d.sub; if (d.r) U.sheet.r = +d.r; U.splitCounts = {}; U.render(true); },
  pickb: d => { U.sheet.pick = +d.slot >= 0 ? +d.slot : undefined; U.render(false); },
  build: d => { const r = E.act.build(+d.p, +d.slot, d.b || null); if (r.ok) U.sheet.pick = undefined; res(r); },
  def: d => res(E.act.defense(+d.p, d.d)),
  ship: d => res(E.act.ship(+d.p, d.h, +d.n)),
  troop: d => res(E.act.troop(+d.p, d.tr, +d.n)),
  cancel: d => res(E.act.cancel(+d.p, d.q, +d.i)),
  skip: d => { const r = E.act.skip(+d.p); if (r.ok) U.flash('⏩ Finished for ' + E.RES_ICON.metal + fmtN(r.cost), 'good'); res(r); },
  skipAll: d => { const r = E.act.skipAll(+d.p); if (r.ok) U.flash('⏩ ' + r.n + ' upgrades finished for ' + E.RES_ICON.metal + fmtN(r.cost), 'good'); res(r); },
  spec: d => res(E.act.spec(+d.p, d.s)),
  fit: d => {
    const em = E.state.emp.player, f = em.designs[d.h], H = E.HULLS[d.h], i = +d.i, dd = +d.d;
    const nf = f.slice(); nf[i] += dd;
    if (nf[i] < 0) return;
    const sum = nf[0] + nf[1] + nf[2];
    if (sum > H.slots) { const j = [0, 1, 2].filter(k => k !== i && nf[k] > 0).sort((a, b) => nf[b] - nf[a])[0]; if (j == null) return; nf[j]--; }
    if (nf[0] < 1) { U.flash('Warships need at least one weapon slot'); return; }
    em.designs[d.h] = nf; E.emit('sfx', 'click'); U.render(false);
  },
  research: d => res(E.act.research(d.id)),
  hqUp: () => { const r = E.act.hqUpgrade(); U.flash(r.ok ? '🏛 Headquarters Lv' + r.lvl + (r.slot ? ' — +1 building slot on every planet' : '') : r.msg, r.ok ? 'good' : 'warn'); U.render(false); },
  hqPerk: d => { const r = E.act.hqPerk(d.k); U.flash(r.ok ? E.HQ_PERKS[d.k].icon + ' ' + E.HQ_PERKS[d.k].name + ' Lv' + r.lvl : r.msg, r.ok ? 'good' : 'warn'); U.render(false); },
  researchPause: () => { const r = E.act.researchPause(); U.flash(r.ok ? '⏸ Research paused — RP now bank up for the HQ' : r.msg); U.render(false); },
  openHQ: () => { const h = E.state.emp.player.home; U.open('system', { sys: E.state.planets[h].sys, tab: 'hq' }); },
  openSys: d => { const fromEmpire = U.sheet && U.sheet.type === 'empire'; U.open('system', { sys: +d.s }); if (!fromEmpire) Rd.focus(+d.s); }, // v1.6: the Empire tab never moves the map
  openFleet: d => { U.open('fleet', { fid: +d.f }); },
  order: d => {
    const f = E.fleetById(+d.f); if (!f) return;
    if (d.o === 'retreat') return res(E.act.retreat(f.id));
    if (d.o === 'load') { const r = E.act.load(f.id, d.n ? +d.n : undefined); if (r.ok) { U.flash('🪖 Loaded ' + r.moved + ' troops', 'good'); delete U.qty['load:' + f.id]; } return res(r); }
    if (d.o === 'unload') { const r = E.act.unload(f.id); if (r.ok) U.flash('Unloaded ' + r.moved + ' troops', 'good'); return res(r); }
    if (d.o === 'patrol' && f.path.length) return U.flash('Patrol must start from a docked fleet');
    Rd.targetMode = { fid: f.id, order: d.o };
    $('#banner').innerHTML = `Tap a destination for <b>${esc(f.name || 'Fleet ' + f.id)}</b> (${d.o}) <button class="b mini2" data-a="cancelTarget">Cancel</button>`;
    $('#banner').classList.remove('hidden');
    if (window.innerWidth < 700) U.close();
  },
  cancelTarget: () => { Rd.targetMode = null; $('#banner').classList.add('hidden'); },
  splitAdj: d => { const v = (U.splitCounts[d.h] || 0) + +d.d; U.splitCounts[d.h] = E.clamp(v, 0, +d.max || (U.splitCounts[d.h] || 0)); U.render(false); },
  splitDo: d => { const r = E.act.split(+d.f, U.splitCounts); if (r.ok) { U.splitCounts = {}; U.open('fleet', { fid: r.fleet.id }); U.flash('New fleet formed', 'good'); } else U.flash(r.msg); },
  merge: d => { const f = E.fleetById(+d.f); const ids = [f.id, ...E.fleetsAt(f.sys, 'player').filter(x => x !== f).map(x => x.id)]; res(E.act.merge(ids)); },
  rename: d => { const f = E.fleetById(+d.f); const n = prompt('Fleet name', f.name || ''); if (n) { E.act.rename(f.id, n); U.render(false); } },
  routeFrom: d => { U.open('trade', { sub: 'to', from: +d.p }); },
  routeToPick: d => { const to = +d.to; const from = E.playerPlanets().filter(q => E.bLevel(q, 'tradeport') && E.validTradeTarget(q, E.state.planets[to])); if (from.length === 1) res(E.act.route(from[0].id, to)); else U.open('trade', { sub: 'from' }); },
  routeTo: d => { const n = Math.max(1, Math.min(E.maxTraders(+d.from, +d.to) || 1, U.qty['traders:' + d.from] || 1)); const r = E.act.routeMany(+d.from, +d.to, U.routeRes || 'metal', n); if (r.ok) { if (r.n > 1) U.flash('⚖ ' + r.n + ' traders sent', 'good'); U.open('trade', {}); } else U.flash(r.msg); },
  routePick: d => { U.routeRes = d.r; U.render(false); },
  routeRes: d => res(E.act.routeRes(+d.r, d.k)),
  abandonAsk: d => { U.abandonAsk = +d.p; U.render(false); },
  abandonDo: d => { const r = E.act.abandon(+d.p, d.m); U.abandonAsk = -1; res(r); U.render(false); },
  openHelp: () => U.open('help', {}),
  openT: d => U.open(d.t, {}),
  routeCancel: d => res(E.act.cancelRoute(+d.r)),
  routeFix: d => res(E.act.replaceFreighter(+d.r)),
  qtyMax: d => { U.qty[d.k] = +d.max; U.render(false); },
  demolishAsk: d => { U.sheet.confirm = +d.slot >= 0 ? +d.slot : undefined; U.render(false); },
  demolishDo: d => { const r = E.act.demolish(+d.p, +d.slot); U.sheet.confirm = undefined; if (r.ok) U.flash('🗑 Demolished — refunded ' + Object.entries(r.refund).map(([k, v]) => E.RES_ICON[k] + fmt(v)).join(' '), 'good'); res(r); },
  watch: d => E.main.openBattle(+d.s),
  scout: d => { const r = E.act.scout(+d.f); U.flash(r.ok ? (r.eta > 0 ? '📡 Scouts out (Lv' + r.level + ') — report in ' + E.fmtTime(r.eta) : '📡 Instant scan (Lv' + r.level + ') — report ready') : r.msg, r.ok ? 'good' : 'warn'); U.render(false); },
  scan: d => { const r = E.act.scoutMission(null, d.k, +d.id); U.flash(r.ok ? (r.eta > 0 ? '📡 Scouts out (Lv' + r.level + ') — report in ' + E.fmtTime(r.eta) : '📡 Instant scan (Lv' + r.level + ') — report ready') : r.msg, r.ok ? 'good' : 'warn'); U.render(false); },
  swapPick: d => { U.swap.from = d.r; U.swap.to = d.r === 'metal' ? 'crystal' : 'metal'; U.render(false); },
  swap: d => { const r = E.act.swap(d.from, d.to, +d.n); if (r.ok) U.flash('⚖ Swapped ' + fmt(+d.n) + ' ' + E.RES_NAME[d.from] + ' → ' + fmt(r.got) + ' ' + E.RES_NAME[d.to], 'good'); else U.flash(r.msg); U.render(false); },
  sendLoadMax: d => { const S = U.sendSel; if (!S) return; S.load[d.f] = +d.max; U.render(false); },
  sendPick: d => { const S = U.sendSel; if (!S) return; const id = +d.f; const f = E.fleetById(id); const blk = f && E.targetBlock('player', f.path.length ? f.path[0] : f.sys, S.s); if (blk) return U.flash('🚫 ' + blk); if (S.fids.includes(id)) S.fids = S.fids.filter(x => x !== id); else S.fids.push(id); U.render(false); },
  sendAllPick: d => { const S = U.sendSel; if (!S) return; const all = sendCandidates(S.s).filter(f => !E.targetBlock('player', f.path.length ? f.path[0] : f.sys, S.s)).map(f => f.id); S.fids = S.fids.length === all.length ? [] : all; U.render(false); },
  sendPickGroup: d => { const S = U.sendSel; if (!S) return; const ids = sendCandidates(S.s).filter(f => String(f.rallyTo) === String(d.dest) && !E.targetBlock('player', f.path.length ? f.path[0] : f.sys, S.s)).map(f => f.id); const allOn = ids.length && ids.every(id => S.fids.includes(id)); if (allOn) S.fids = S.fids.filter(id => !ids.includes(id)); else for (const id of ids) if (!S.fids.includes(id)) S.fids.push(id); U.render(false); },
  sendAction: d => { if (U.sendSel) { U.sendSel.action = d.k; U.render(false); } },
  replayAlert: d => { const rec = E.getReplay && E.getReplay(+d.id); if (!rec) return U.flash('Replay no longer stored'); if (E.render && E.render.openReplay) E.render.openReplay(rec); else U.flash('Replay viewer is not ready'); },
  jumpStuck: d => { const f = E.fleetById(+d.f); const sys = f ? f.sys : +d.s; if (sys != null) { if (E.render && E.render.focus) E.render.focus(sys); if (f) U.open('fleet', { fid: f.id }); } },
  // v2.1 item 4: one-tap relocate shortcuts at the top of the send screen
  sendQuick: d => { const S = U.sendSel; if (!S) return; const p = E.sysPlanet(S.s); if (!p || p.owner !== 'player') return U.flash('Relocate only to your own planets');
    const cands = sendCandidates(S.s).filter(f => !E.targetBlock('player', f.path.length ? f.path[0] : f.sys, S.s));
    let fids = [];
    if (d.q === 'idle') fids = cands.filter(f => !f.path.length && f.order === 'idle').map(f => f.id);
    else { const pv = E.sendPreview(cands.map(f => f.id), S.s, 1, false); const r = pv.rows.filter(x => isFinite(x.base)).sort((a, b) => a.base - b.base)[0]; if (r) fids = [r.fid]; }
    if (!fids.length) return U.flash(d.q === 'idle' ? 'No idle fleets to relocate' : 'No fleet can reach this world');
    const r = E.act.send(fids, S.s, 'relocate', { speed: 1 });
    if (!r.ok) return U.flash(r.msg);
    U.flash('⇄ ' + r.n + ' fleet' + (r.n > 1 ? 's' : '') + ' relocating → ' + E.state.systems[S.s].name + ' · last arrives in ' + E.fmtTime(r.eta), 'good');
    U.sendSel = null; U.close(); },
  sendSync: () => { if (U.sendSel) { U.sendSel.sync = !U.sendSel.sync; U.render(false); } },
  sendSpeed: d => { if (U.sendSel) { U.sendSel.speed = E.clamp(+d.v, 25, 100); U.render(false); } },
  sendExec: () => {
    const S = U.sendSel; if (!S) return;
    const r = E.act.send(S.fids, S.s, S.action, { speed: S.speed / 100, sync: S.sync, load: S.load, halt50: !!S.halt50 });
    if (!r.ok) return U.flash(r.msg);
    U.flash(E.SEND_ACTIONS[S.action].icon + ' ' + r.n + ' fleet' + (r.n > 1 ? 's' : '') + ' → ' + E.state.systems[S.s].name + (S.sync ? ' · all arrive in ' : ' · last arrives in ') + E.fmtTime(r.eta), 'good');
    U.sendSel = null; U.close();
  },
  sendFrom: d => { const f = E.fleetById(+d.f); if (!f) return; Rd.targetMode = { fid: f.id, order: 'send' }; $('#banner').innerHTML = `Tap any planet or system to send <b>${esc(f.name || 'Fleet ' + f.id)}</b> <button class="b mini2" data-a="cancelTarget">Cancel</button>`; $('#banner').classList.remove('hidden'); if (window.innerWidth < 700) U.close(); },
  sendDef: d => { const r = E.act.sendDefense(+d.s, d.m); U.flash(r.ok ? '🚀 ' + r.n + ' fleet' + (r.n > 1 ? 's' : '') + ' sent — last arrives in ' + E.fmtTime(r.eta) : r.msg, r.ok ? 'good' : 'warn'); U.oddsCache = {}; U.render(false); },
  closeResult: () => { U.resultMore = 0; U.resultMoreList = []; const box = $('#result'); box.classList.add('hidden'); box.innerHTML = ''; if (E.main.battleSys != null && !E.battleAt(E.main.battleSys)) E.main.closeBattle(); },
  report: d => { const r = E.getReport(+d.r); if (!r) return U.flash('Report no longer stored'); U.open('report', { r: +d.r }); },
  showResult: d => { const r = E.state.results[+d.i]; if (r) U.showResult(r); },
  send: d => U.openSend(+d.s, d.f ? [+d.f] : null),
  sendGo: d => {
    const r = d.o === 'patrol' ? E.act.patrol(+d.f, +d.s) : E.act.move(+d.f, +d.s, d.o);
    if (r.ok) { const f = E.fleetById(+d.f); U.flash('Fleet en route — ETA ' + E.fmtTime(fleetETA(f)), 'good'); U.open('fleet', { fid: f.id }); } else U.flash(r.msg);
  },
  jump: d => { if (d.s !== '' && d.s != null) { Rd.focus(+d.s); if (d.a === 'jump' && U.sheet && U.sheet.type === 'log') U.open('system', { sys: +d.s }); } },
  open: d => { if (U.sheet && U.sheet.type === d.t) return U.close(); U.open(d.t, {}); },
  close: () => U.close(),
  mute: () => { E.audio.setMuted(!E.audio.muted); U.render(false); },
  slotAct: d => U.slotAct(d.op, d.n, true),
  hqTipOk: () => { E.tipDismiss('hq'); U.render(false); },
  hqTipHQ: () => { E.tipDismiss('hq'); ACT.openHQ(); },
  save: () => { const ok = E.save(); U.flash(ok ? 'Game saved' : '⚠ ' + (E.lastSaveError || 'Save failed') + '. Free some storage and try again.', ok ? 'good' : 'warn'); },
  menu: () => { E.save(); E.main.showMenu(); },
  speed: d => { E.state.speed = +d.v; E.state.paused = false; E.emit('sfx', 'click'); },
  pause: () => { E.state.paused = !E.state.paused; },
  battle: () => { const b = E.state.battles.find(b => !b.done && (b.owners[0].includes('player') || b.owners[1].includes('player'))); if (b) E.main.openBattle(b.sys); },
  tutNext: () => U.tutAdvance(true),
  tutSkip: () => { E.state.tutorial.done = true; U.renderTut(); },
  tutRestart: () => { E.state.tutorial = { step: 0, done: false }; U.renderTut(); U.close(); },
};
U.ACT = ACT;
U.dispatch = function (el) {
  const a = el.dataset.a; if (!ACT[a]) return;
  E.audio.unlock();
  const d = Object.assign({}, el.dataset);
  try { ACT[a](d); } catch (e) { console.error(e); }
  U.updateTop(); U.renderTut();
};

// ---------- toasts ----------
E.on('toast', t => {
  const box = $('#toasts'); if (!box || (E.state && E.state._ff)) return;
  const el = document.createElement('div'); el.className = 'toast ' + t.kind; el.textContent = t.msg;
  if (t.sys != null) { el.dataset.a = 'jump'; el.dataset.s = t.sys; }
  box.prepend(el);
  while (box.children.length > 4) box.lastChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 3800);
});

// ---------- ground combat animation ----------
E.on('ground', r => { if (E.state._ff) return; U.groundQueue.push(r); if (!U.groundBusy) nextGround(); });
function nextGround() {
  const r = U.groundQueue.shift(); if (!r) { U.groundBusy = false; return; }
  U.groundBusy = true;
  const box = $('#ground');
  const A = E.troopCount(r.before.atk), D = E.troopCount(r.before.def);
  const atkName = E.FACTIONS[r.owner].short, defName = E.FACTIONS[r.prevOwner].short;
  box.innerHTML = `<h3>Ground assault · ${esc(r.p.name)}</h3><div class="gside"><span style="color:${E.FACTIONS[r.owner].color}">${atkName} landing force</span><b id="gA">${A}</b></div><div class="bar big"><i id="gAb" style="width:100%;background:${E.FACTIONS[r.owner].color}"></i></div><div class="gside"><span style="color:${E.FACTIONS[r.prevOwner].color}">${defName} garrison</span><b id="gD">${D}</b></div><div class="bar big"><i id="gDb" style="width:100%;background:${E.FACTIONS[r.prevOwner].color}"></i></div><div id="gfield"></div><p id="gRes" class="small">${r.burn > 0.01 ? '🔥 ' + Math.round(r.burn * 100) + '% of the landing force burned in the shield.' : 'Troops are landing…'}</p>`;
  box.classList.remove('hidden');
  E.emit('sfx', 'ground');
  const rounds = r.rounds.length ? r.rounds : [[E.troopCount(r.after.atk), E.troopCount(r.after.def)]];
  let i = 0;
  const field = $('#gfield');
  for (let k = 0; k < 24; k++) { const s = document.createElement('i'); s.style.left = (Math.random() * 100) + '%'; s.style.top = (Math.random() * 100) + '%'; s.style.animationDelay = (Math.random() * 1.5) + 's'; field.appendChild(s); }
  i = rounds.length - 1; // v2.0 H: no automatic battle animation — jump straight to the result
  const iv = setInterval(() => {
    const [a, d] = rounds[Math.min(i, rounds.length - 1)];
    $('#gA').textContent = a; $('#gD').textContent = d;
    $('#gAb').style.width = (A ? a / A * 100 : 0) + '%'; $('#gDb').style.width = (D ? d / D * 100 : 0) + '%';
    i++;
    if (i >= rounds.length) {
      clearInterval(iv);
      const win = r.captured;
      $('#gRes').innerHTML = `<b class="${(win && r.owner === 'player') || (!win && r.prevOwner === 'player') ? 'good' : 'bad'}">${win ? r.p.name + ' captured by ' + atkName + '!' : 'The garrison holds!'}</b>`;
      setTimeout(() => { box.classList.add('hidden'); nextGround(); }, 1800);
    }
  }, 30);
}

// ---------- tutorial ----------
const TUT = [
  { t: 'Welcome, Governor! Build a strong economy, turtle up behind defenses, trade, and expand. Tap <b>Next</b> to begin.', next: true },
  { t: 'Tap your capital <b>★</b> on the map to open it.', done: st => U.sheet && U.sheet.type === 'system' && U.sheet.sys === st.emp.player.home, focusHome: true },
  { t: 'Open the <b>Build</b> tab and upgrade your <b>Metal Extractor</b>. <b>Metal</b> pays for buildings and defenses; <b>💎 Crystal</b> pays for ships and troops. Watch the <b>⚡ Energy</b> bar: every building draws power — add a <b>Power Plant</b> when it fills.', done: st => { const p = st.planets[st.emp.player.home]; return p.queues.build.length > 0 || E.bLevel(p, 'mine') >= 3; } },
  { t: 'Open <b>⚗ Research</b> in the bottom bar and pick a tech (Deep Core Drilling is a good start).', done: st => !!st.emp.player.research || Object.keys(st.emp.player.techs).length > 0 },
  { t: 'Back on your capital, open <b>Troops</b>, drag the <b>quantity slider</b> (or tap Max) and train Infantry.', done: st => { const p = st.planets[st.emp.player.home]; return p.queues.troop.length > 0 || E.troopCount(p.garrison) > 24 || st.fleets.some(f => f.owner === 'player' && E.troopCount(f.troops)); } },
  { t: 'Open <b>Shipyard</b> and use the slider to build some <b>Fighters</b>. Fighters swarm Destroyers; Destroyer flak shreds massed Fighters — mix them later.', done: st => st.stats.shipsBuilt > 0 || st.planets.some(p => p.owner === 'player' && p.queues.ship.length) },
  { t: '<b>Troops ride in Transports.</b> Open the <b>Fleets</b> tab, tap <b>Home Guard</b>, set the <b>🪖 Load</b> slider and tap Load. Invade needs troops aboard; Attack and Colonize do not.', skip: true, done: st => st.fleets.some(f => f.owner === 'player' && E.troopCount(f.troops) > 0) || st.stats.captured > 0 },
  { t: 'Now tap <b>🚀 Send…</b>, then the highlighted neutral world next door, and choose <b>Colonize</b> (no troops needed: clear its orbit and it joins you). Fleets never cross enemy worlds, so only front-line planets can be targeted (${E.fmtTime(E.HOP_TIME)} per tile).', done: st => st.fleets.some(f => f.owner === 'player' && f.order === 'attack' && f.path.length) || st.stats.captured > 0, highlightNeutral: true },
  { t: 'While they fly: build a <b>Trade Center</b> here. Once a second world of yours has one too, open <b>⚖ Trade → New trade route</b> and pick whether it pays <b>metal or crystal</b>. Each Trade Center level adds trader slots; it also swaps metal ↔ crystal.', done: st => st.routes.length > 0 || st.planets.some(p => p.owner === 'player' && E.bLevel(p, 'tradeport') > 0), skip: true },
  { t: 'Your <b>Home Guard</b> fleet sits at your capital. Destroying enemy ships and troops earns <b>★ Commander XP</b>, which raises your <b>system cap</b> (top-bar ★ chip).', next: true },
  { t: 'Enemy fleets show up in <b>📡 Alerts</b> with a countdown. Your <b>📡 Scout Post</b> reports their numbers and your <b>win odds</b> (higher levels are more precise); reinforce during the 30 s battle window.', next: true },
  { t: 'Last tip: <b>siege waves</b> start around minute ' + Math.round(E.DIFFICULTY.normal.firstWave / 60) + ' and grow. Build <b>Shields</b> and <b>Turrets</b> (Defense tab). To win, leave every rival with <b>no colonized systems</b>. Help and settings live in the <b>☰ Menu</b>. Good luck!', next: true, last: true },
];
U.tutAdvance = function (manual) {
  const st = E.state; if (!st || st.tutorial.done) return;
  const s = TUT[st.tutorial.step]; if (!s) { st.tutorial.done = true; return; }
  if (manual && (s.next || s.skip)) { if (s.last) st.tutorial.done = true; else st.tutorial.step++; U.renderTut(); return; }
  if (s.done && s.done(st)) { st.tutorial.step++; E.emit('sfx', 'build'); U.renderTut(); }
};
U.renderTut = function () {
  const st = E.state, box = $('#tut'); if (!st || !box) return;
  Rd.highlightSys = null;
  if (st.tutorial.done || !TUT[st.tutorial.step]) { box.classList.add('hidden'); return; }
  const s = TUT[st.tutorial.step];
  if (s.highlightNeutral) { const h = st.systems[st.planets[st.emp.player.home].sys].lanes.find(id => { const q = E.sysPlanet(id); return q && q.owner === 'neutral'; }); Rd.highlightSys = h; }
  if (s.focusHome) Rd.highlightSys = st.planets[st.emp.player.home].sys;
  const html = `<div class="tt">🎓 ${st.tutorial.step + 1}/${TUT.length} · ${s.t}</div><div class="row">${s.next || s.skip ? btn(s.last ? 'Done' : s.skip ? 'Skip step' : 'Next', 'tutNext', {}, 'primary mini2') : ''}${s.last ? '' : btn('Skip tutorial', 'tutSkip', {}, 'mini2')}</div>`;
  if (box._h !== html) { box.innerHTML = html; box._h = html; }
  box.classList.remove('hidden');
};

// thumbnails drawn after render
U.paintThumbs = function () {
  document.querySelectorAll('canvas.hthumb:not([data-done])').forEach(c => { const g = c.getContext('2d'); Rd.drawHull(g, c.dataset.hull, c.width / 2, c.height / 2, 0, '#38e1ff', 'player', Math.min(1.4, (c.width * 0.4) / E.HULLS[c.dataset.hull].size, (c.height * 0.4) / E.HULLS[c.dataset.hull].size)); c.dataset.done = 1; });
  document.querySelectorAll('canvas.pthumb:not([data-done])').forEach(c => { const g = c.getContext('2d'); Rd.drawPlanet(g, 28, 28, 24, E.PLANET_TYPES[c.dataset.ptype], 3); c.dataset.done = 1; });
};

// ================= v1.5 UI =================
function radio(on, cls) { return `<i class="rd ${on ? 'on' : ''} ${cls || ''}"></i>`; }
// Empire tab: one card per planet with a 4×3 queue grid (columns: buildings, defenses, troops, ships)
function planetCardHTML(p) {
  const st = E.state, pr = E.planetProd(p), T = E.PLANET_TYPES[p.type];
  const cols = [['build', '🏗', 'Buildings'], ['def', '🛡', 'Defenses']];
  if (E.bLevel(p, 'barracks')) cols.push(['troop', '🪖', 'Troops']);
  if (E.bLevel(p, 'shipyard')) cols.push(['ship', '🚀', 'Ships']);
  let grid = `<div class="qgrid" style="grid-template-columns:repeat(${cols.length},1fr)">` + cols.map(([q, i, l]) => `<div class="qh" title="${l}">${i}<small>${l}</small></div>`).join('');
  for (let r = 0; r < 3; r++) for (const [q] of cols) { const it = p.queues[q][r]; grid += `<div class="qc">${radio(!!it, r === 0 && it ? 'cur' : '')}</div>`; }
  grid += cols.map(([q]) => { const n = p.queues[q].length; const it = p.queues[q][0]; return `<div class="qf small">${n > 3 ? '+' + (n - 3) + ' more' : it ? E.fmtTime(queueTotal(p, q)) : '<span class="muted">idle</span>'}</div>`; }).join('') + '</div>';
  const routes = st.routes.filter(r => r.from === p.id).length, cap = E.routeCap(p);
  const ral = E.rallyOf(p), fl = E.fleetsAt(p.sys, 'player'), ships = fl.reduce((a, f) => a + f.ships.length, 0);
  const sm = E.shieldMax(st, p);
  return `<div class="card pcard"><div class="hrow"><button class="lnk" data-a="openSys" data-s="${p.sys}"><b>${esc(p.name)}</b>${st.emp.player.home === p.id ? ' ★' : ''}</button><span class="small muted">${T.name}${p.spec ? ' · ' + E.SPECS[p.spec].icon : ''}${p.perfect ? ' · <span class="perfect">✦ Perfect</span>' : ''}${E.battleAt(p.sys) ? ' · <span class="bad">⚔ battle</span>' : p.blockade ? ' · <span class="bad">⛓</span>' : ''}</span></div>
    <div class="pstats small"><span style="color:${E.RES_COLOR.metal}">⛏ ${fmt(pr.metal)}</span><span style="color:${E.RES_COLOR.crystal}">${E.RES_ICON.crystal} ${fmt(pr.crystal)}</span><span style="color:${E.RES_COLOR.rp}">⚗ ${fmt(pr.rp)}</span><span>⚡ ${E.energyUsed(p)}/${E.energyMax(p)}</span><span>🪖 ${E.troopCount(p.garrison)}</span><span>✛ ${p.def.turret} ◯ ${sm ? Math.round(p.shieldHp / sm * 100) + '%' : '–'}</span><span>🚀 ${ships}</span>${cap ? `<span>⚖ ${routes}/${cap}</span>` : ''}${ral ? `<span>⚑ → ${esc(ral.name.split(' ')[0])}</span>` : ''}</div>
    ${grid}
    <div class="row small">${btn('Open', 'openSys', { s: p.sys }, 'mini2')}${btn('🚀 Fleets', 'fleetsAt', { s: p.sys }, 'mini2')}${btn('🏗 Build', 'openTab', { s: p.sys, tab: 'build' }, 'mini2')}</div></div>`;
}
// Overview tab: rally point picker
function rallyCard(p) {
  const opts = E.playerPlanets().filter(q => q.id !== p.id);
  const cur = E.rallyOf(p);
  return `<div class="card"><h4>⚑ Rally point</h4><div class="small muted">New ships built here fly to the rally planet on their own (troops trained here ride along when the convoy has Transports).</div><select class="sel" data-in="rally" data-p="${p.id}"><option value="">— none: new ships stay here —</option>${opts.map(q => `<option value="${q.id}" ${cur && cur.id === q.id ? 'selected' : ''}>${esc(q.name)}</option>`).join('')}</select></div>`;
}
// Trade sheet: trader slots per Trade Center world
function traderSlotsHTML() {
  const st = E.state, w = E.playerPlanets().filter(p => E.bLevel(p, 'tradeport'));
  if (!w.length) return '';
  let h = '<div class="card"><h4>⚖ Trader slots</h4><div class="small muted">Each Trade Center level adds 2–3 slots (25 at Lv10); several Trade Centers on one planet add up.</div>';
  for (const p of w) {
    const used = st.routes.filter(r => r.from === p.id).length, cap = E.routeCap(p);
    const tcs = p.slots.slice(0, E.planetSlots(p)).filter(s => s.b === 'tradeport' && s.lvl).map(s => 'Lv' + s.lvl + '→' + E.traderSlotsFor(s.lvl)).join(' + ');
    h += `<div class="tslots"><div class="small"><b>${esc(p.name)}</b> · ${used}/${cap} in use <span class="muted">(${tcs}${E.hasSpec(p, 'trade') ? ' + 2 trade bonus' : ''}${E.has('player', 'e5') ? ' + 2 guilds' : ''})</span></div><div class="dots">${Array.from({ length: cap }, (_, i) => radio(i < used)).join('')}</div></div>`;
  }
  return h + '</div>';
}
// Alerts sheet: idle traders and empty production queues
function idleHTML() {
  const planets = E.idleBuildPlanets(), list = E.idleAlerts().filter(a => a.kind === 'trader');
  if (!planets.length && !list.length) return '';
  let h = '';
  if (planets.length) h += '<h4>⏸ Empty construction slots</h4>' + planets.map(p => `<div class="card small idlecard">⏸ <b>${esc(p.name)}</b>: nothing under construction ${btn('Open', 'openTab', { s: p.sys, tab: 'build' }, 'mini2')}</div>`).join('');
  if (list.length) h += '<h4>Also idle <span class="muted small">(not counted in the chip)</span></h4>' + list.map(a => `<div class="card small idlecard">⚖ <b>${a.n} idle Trader${a.n > 1 ? 's' : ''}</b> at ${esc(a.p.name)} ${a.canRoute ? btn('Open a route', 'routeFrom', { p: a.p.id }, 'mini2') : '<span class="muted">· needs Trade Centers on two of your worlds with free slots</span>'}</div>`).join('');
  return h;
}
// Planet Fleets tab: the per-planet fleet screen (carrier groups, sliders, rename, merge/split, troops)
U.xfer = U.xfer || {};
// v1.7 merge mode: pick a target fleet (Select), press Merge…, then tick other fleets docked at the same planet
U.merge = null;
function mergeEligible(into, f) { return f !== into && f.owner === 'player' && f.ships.length && !f.path.length && f.sys === into.sys && !into.path.length; }
function mergePanel(p, into) {
  const st = E.state, all = st.fleets.filter(f => f.owner === 'player' && f !== into && f.ships.length);
  const here = all.filter(f => mergeEligible(into, f)), away = all.filter(f => !mergeEligible(into, f)).sort((a, b) => b.ships.length - a.ships.length);
  const picks = U.merge.picks.filter(id => here.some(f => f.id === id)); U.merge.picks = picks;
  const row = (f, ok) => {
    const on = picks.includes(f.id), c = E.fleetCounts(f), comp = Object.entries(c).map(([k, n]) => fmtN(n) + ' ' + E.HULLS[k].short).join(' · ');
    const where = ok ? 'docked here' : f.path.length ? '➜ en route to ' + esc(st.systems[f.path[f.path.length - 1]].name) : 'at ' + esc(st.systems[f.sys].name);
    return `<button class="fleet fl ${on ? 'sel on' : ''} ${ok ? '' : 'dis'}" data-a="mergePick" data-f="${f.id}" ${ok ? '' : 'disabled aria-disabled="true"'}><div><b>${ok ? (on ? '☑' : '☐') : '🚫'} ${esc(f.name || 'Fleet ' + f.id)}</b> <span class="small">${f.ships.length} ships</span></div><small class="muted">${comp} · ${where}</small></button>`;
  };
  let h = `<div class="card mergepanel"><h4>⊕ Merge into <b>${esc(into.name || 'Fleet ' + into.id)}</b> · ${esc(p.name)}</h4><div class="small muted">Tap the fleets docked here that should join ${esc(into.name || 'Fleet ' + into.id)}. Fleets at other planets or on the move are greyed out.</div>`;
  h += here.length ? rallyCollapse(here, 'merge-here', f => row(f, true)) : '<p class="muted small">No other fleets are docked here.</p>';
  const awayN = away.filter(f => f.rallyTo == null), awayR = away.filter(f => f.rallyTo != null);
  if (away.length && !U.onlyHere) h += `<div class="small muted" style="margin-top:6px">Not available (elsewhere or en route):</div>` + awayN.slice(0, 12).map(f => row(f, false)).join('') + (awayN.length > 12 ? `<div class="small muted">+ ${E.fmtN(awayN.length - 12)} more, also greyed out</div>` : '') + (awayR.length ? rallyCollapse(awayR, 'merge-away', f => row(f, false)) : '');
  h += `<div class="row" style="margin-top:8px">${btn(picks.length ? `⊕ Merge ${picks.length} fleet${picks.length === 1 ? '' : 's'} into ${esc(into.name || 'Fleet ' + into.id)}` : 'Pick fleets to merge', 'mergeGo', {}, 'primary' + (picks.length ? '' : ' dis'))}${here.length > picks.length ? btn('Select all here', 'mergeAllHere', {}, 'mini2') : ''}${btn('Cancel', 'mergeCancel', {}, 'mini2')}</div></div>`;
  return h;
}
// v2.3 item 1: every rallying fleet collapses into one group row per rally point (default collapsed, persisted).
U.rallyOpen = U.rallyOpen || {};
function rallyCollapse(list, key, render) {
  return E.rallyListHTML(list, key, render);
}
function fleetScreenHTML(p) {
  const st = E.state, mine = E.fleetsAt(p.sys, 'player');
  if (U.merge) { const into = E.fleetById(U.merge.into); if (into && into.owner === 'player' && !into.path.length && into.sys === p.sys) return mergePanel(p, into); U.merge = null; }
  let h = `<h4>🚀 Groups docked at ${esc(p.name)}</h4><div class="small muted">Select a group, then drag the sliders to split ships off or move them to another group; load troops from the garrison below.`;
  if (!mine.length) return h + '<p class="muted">No fleets docked here. Build ships in the Shipyard tab.</p>';
  h += rallyCollapse(mine, 'dock-' + p.id, f => {
    const c = E.fleetCounts(f), car = E.fleetCarrier(f), fs = E.fleetStats(f), sx = E.fleetStatus(f);
    return `<div class="card fcard ${U.xfer.from === f.id ? 'sel' : ''}"><div class="hrow"><b>${esc(f.name || 'Fleet ' + f.id)}</b><span class="small fst ${sx.k}">${sx.icon} ${esc(sx.k)}</span></div>
      <div class="small">Carrier: ${car ? E.HULLS[car.h].name : '—'} · ${Object.entries(c).map(([k, n]) => fmtN(n) + ' ' + E.HULLS[k].short).join(' · ')}</div>
      <div class="small muted">🪖 ${fmtN(E.troopCount(f.troops))}/${fmtN(Math.floor(fs.cap))} troops · power ${fmt(fs.power)}</div>
      <div class="row small">${btn(U.xfer.from === f.id ? '✓ Selected' : 'Select', 'xferFrom', { f: f.id }, 'mini2' + (U.xfer.from === f.id ? ' on' : ''))}${btn('🚀 Send…', 'sendFrom', { f: f.id }, 'mini2')}${btn('✎ Rename', 'rename', { f: f.id }, 'mini2')}${btn('Details', 'openFleet', { f: f.id }, 'mini2')}</div></div>`;
  });
  const from = E.fleetById(U.xfer.from);
  if (mine.length > 1 || (st.fleets.filter(f => f.owner === 'player').length > 1)) h += `<div class="row" id="dockMerge">${btn('⊕ Merge…', 'mergeStart', { f: from && from.sys === p.sys && !from.path.length ? from.id : mine[0].id }, 'mini2 mergebtn')}${mine.length > 1 ? btn('⊕ Merge all groups here', 'mergeAll', { s: p.sys }, 'mini2') : ''}</div>`;
  if (!from || from.sys !== p.sys || from.path.length || from.owner !== 'player') { U.xfer = { from: mine[0].id, to: 'new', counts: {}, sys: p.sys }; return fleetScreenHTML(p); }
  const to = U.xfer.to === 'new' ? 'new' : (mine.find(f => f.id === +U.xfer.to) ? +U.xfer.to : 'new'); U.xfer.to = to;
  // v2.3 item 3a: fleet list, Merge, Troop loader, then Split-into-new-fleet
  const cap = Math.floor(E.fleetStats(from).cap), aboard = E.troopCount(from.troops), gar = E.troopCount(p.garrison);
  if (cap) {
    const mx = Math.min(cap, aboard + gar), v = E.clamp(U.xfer.troops == null ? aboard : U.xfer.troops, 0, mx);
    h += `<div class="card xfer" id="dockTroops"><h4>🪖 Load troops</h4><div class="small muted">Garrison ${gar} · aboard ${aboard} · capacity ${cap}</div><div class="qty xrow"><span class="small">Aboard</span><input type="range" min="0" max="${mx}" step="1" value="${v}" data-in="xferT" aria-label="Troops aboard"><input type="number" class="qnum" inputmode="numeric" min="0" max="${mx}" value="${v}" aria-label="Troops aboard"></div>${btn('Apply', 'xferTroops', {}, 'primary')}</div>`;
  } else h += '<div class="card xfer" id="dockTroops"><div class="small muted">Add a Transport to this group to carry troops.</div></div>';
  const c = E.fleetCounts(from);
  h += `<div class="card xfer" id="dockSplit"><h4>✂ Split into a new fleet</h4><div class="row small">From <b>${esc(from.name || 'Fleet ' + from.id)}</b> to <select class="sel" data-in="xferTo">${mine.filter(f => f !== from).map(f => `<option value="${f.id}" ${to === f.id ? 'selected' : ''}>${esc(f.name || 'Fleet ' + f.id)}</option>`).join('')}<option value="new" ${to === 'new' ? 'selected' : ''}>➕ New group</option></select></div>`;
  for (const [k, n] of Object.entries(c)) {
    const v = E.clamp(U.xfer.counts[k] || 0, 0, n);
    h += `<div class="qty xrow"><span class="small">${E.HULLS[k].short}</span><input type="range" min="0" max="${n}" step="1" value="${v}" data-in="xferN" data-h="${k}" aria-label="${esc(E.HULLS[k].name)} to move"><input type="number" class="qnum" inputmode="numeric" min="0" max="${n}" value="${v}" aria-label="${esc(E.HULLS[k].name)} amount"><span class="small muted">/ ${E.fmtN(n)}</span></div>`;
  }
  h += `<div class="row">${btn('⇄ Move selected ships', 'xferGo', {}, 'primary')}${btn('Split half', 'xferHalf', {}, 'mini2')}</div></div>`;
  return h;
}
document.addEventListener('input', e => { const el = e.target; if (!el.dataset) return;
  if (el.dataset.in === 'splitN') { U.lastTouch = performance.now(); U.splitCounts[el.dataset.h] = +el.value; }
  if (el.dataset.in === 'xferN') { U.lastTouch = performance.now(); U.xfer.counts = U.xfer.counts || {}; U.xfer.counts[el.dataset.h] = +el.value; const b = document.querySelector('[data-xv="' + el.dataset.h + '"]'); if (b) b.textContent = el.value; }
  if (el.dataset.in === 'xferT') { U.lastTouch = performance.now(); U.xfer.troops = +el.value; const b = document.querySelector('[data-xt]'); if (b) b.textContent = el.value; } });
document.addEventListener('change', e => { const el = e.target; if (!el.dataset) return;
  if (el.dataset.in === 'onlyHere') { U.onlyHere = el.checked; U.render(false); }
  if (el.dataset.in === 'fleetCtx') { U.fleetCtx = +el.value; U.xfer = {}; U.merge = null; U.render(false); }
  if (el.dataset.in === 'xferTo') { U.xfer.to = el.value === 'new' ? 'new' : +el.value; U.render(false); }
  if (el.dataset.in === 'rally') { const r = E.act.setRally(+el.dataset.p, el.value === '' ? null : +el.value); if (!r.ok) U.flash(r.msg); else U.flash(el.value === '' ? 'Rally point cleared' : '⚑ Rally point set', 'good'); U.render(false); } });
Object.assign(ACT, {
  fleetsAt: d => { U.merge = null; const p = E.sysPlanet(+d.s); if (p && p.owner === 'player') U.fleetCtx = p.id; U.xfer = {}; U.open('fleets'); },
  fleetMore: () => { U.fleetShowAll = !U.fleetShowAll; U.render(false); },
  rallyToggle: d => { E.rallyToggle(d.k); U.rallyOpen[d.k] = E.rallyIsOpen(d.k); U.render(false); },
  splitMax: d => { U.splitCounts[d.h] = +d.max; U.render(false); },
  splitHalf: d => { U.splitCounts[d.h] = Math.floor(+d.max / 2); U.render(false); },
  openTab: d => { U.open('system', { sys: +d.s, tab: d.tab }); Rd.focus(+d.s); },
  transit: d => { U.openTransit(+d.f); },
  recall: d => { const r = E.act.recall(+d.f); if (r.ok) { U.flash('↩ Recalling to ' + r.name, 'good'); if (U.sheet && U.sheet.type === 'fleet') U.sheet.sub = ''; } res(r); },
  mergeStart: d => { const f = E.fleetById(+d.f); if (!f || f.path.length) return U.flash('Select a docked fleet first'); U.merge = { into: f.id, picks: [] }; U.xfer.from = f.id; U.render(false); },
  mergePick: d => { if (!U.merge) return; const into = E.fleetById(U.merge.into), f = E.fleetById(+d.f); if (!into || !f || !mergeEligible(into, f)) return; const i = U.merge.picks.indexOf(f.id); if (i < 0) U.merge.picks.push(f.id); else U.merge.picks.splice(i, 1); U.render(false); },
  mergeAllHere: () => { if (!U.merge) return; const into = E.fleetById(U.merge.into); if (!into) return; U.merge.picks = E.state.fleets.filter(f => mergeEligible(into, f)).map(f => f.id); U.render(false); },
  mergeCancel: () => { U.merge = null; U.render(false); },
  mergeGo: () => { if (!U.merge || !U.merge.picks.length) return U.flash('Pick at least one fleet'); const into = E.fleetById(U.merge.into), n = U.merge.picks.length; const r = E.act.merge([U.merge.into, ...U.merge.picks]); if (r.ok) { U.flash(`⊕ Merged ${n} fleet${n === 1 ? '' : 's'} into ${into ? into.name : 'fleet'}`, 'good'); U.xfer = { from: U.merge.into, to: 'new', counts: {}, troops: null }; U.merge = null; } res(r); },
  xferFrom: d => { U.merge = null; U.xfer = { from: +d.f, to: 'new', counts: {}, troops: null }; U.render(false); },
  xferHalf: d => { const f = E.fleetById(U.xfer.from); if (!f) return; const c = E.fleetCounts(f); U.xfer.counts = {}; for (const k in c) U.xfer.counts[k] = Math.floor(c[k] / 2); U.render(false); },
  xferGo: d => { const r = E.act.transfer(U.xfer.from, U.xfer.to, U.xfer.counts || {}); if (r.ok) { U.flash('⇄ Moved ' + r.moved + ' ships to ' + (r.fleet.name || 'a new group'), 'good'); U.xfer.counts = {}; U.xfer.to = r.fleet.id; } res(r); },
  xferTroops: d => { const f = E.fleetById(U.xfer.from); if (!f) return; const want = U.xfer.troops == null ? E.troopCount(f.troops) : U.xfer.troops; const r = E.act.troopsTo(f.id, want - E.troopCount(f.troops)); if (r.ok) { U.flash('🪖 ' + (r.moved > 0 ? 'Loaded ' + r.moved : 'Unloaded ' + (-r.moved)) + ' troops', 'good'); U.xfer.troops = null; } res(r); },
  mergeAll: d => { const ids = E.fleetsAt(+d.s, 'player').filter(f => !f.routeId).map(f => f.id); res(E.act.merge(ids)); },
});
// v1.6: every quantity slider has a number box next to it (counts are unlimited, so typing is faster than dragging)
document.addEventListener('input', e => {
  const el = e.target; if (!el || !el.classList) return;
  const box = el.closest && el.closest('.qty'); if (!box) return;
  const rg = box.querySelector('input[type=range]'), qn = box.querySelector('.qnum'); if (!rg || !qn) return;
  if (el.classList.contains('qnum')) { const lo = +rg.min || 0, hi = +rg.max || 0; const v = Math.max(lo, Math.min(hi, Math.floor(+el.value) || lo)); rg.value = v; rg.dispatchEvent(new Event('input', { bubbles: true })); }
  else if (el === rg && document.activeElement !== qn) qn.value = rg.value;
});
const origRender = U.render;
U.render = function (r) { origRender(r); U.paintThumbs(); U.sliderKit(); const sh = U.sheet, st = E.state; if (sh && sh.type === 'system' && st && st.systems[sh.sys]) U.renderBuildQueueMini && U.renderBuildQueueMini(st.planets[st.systems[sh.sys].planetId]); };
// v1.9 item 20: every quantity slider gets a type-in box and a Max button
U.sliderKit = function (root) {
  for (const box of (root || document).querySelectorAll('.qty:not(.dis)')) {
    const rg = box.querySelector('input[type=range]'); if (!rg) continue;
    if (!box.querySelector('.qnum')) { const q = document.createElement('input'); q.type = 'number'; q.className = 'qnum'; q.inputMode = 'numeric'; q.min = rg.min; q.max = rg.max; q.value = rg.value; q.setAttribute('aria-label', (rg.getAttribute('aria-label') || 'amount') + ' amount'); rg.after(q); }
    if (![...box.querySelectorAll('button')].some(b => b.textContent.trim() === 'Max')) { const b = document.createElement('button'); b.className = 'b mini2 qmaxg'; b.textContent = 'Max'; box.querySelector('.qnum').after(b); }
  }
};
document.addEventListener('click', e => {
  const d = e.target.closest && e.target.closest('.tech small, button.b small, .card .muted, .perk .small.muted');
  if (d && !e.target.closest('[data-a], a, input, select, textarea, button.x, button.b:not(.opt):not(.spec)')) {
    /* only expand desc-like text, not real buttons — still allow .opt/.spec small */
  }
  if (d && (d.tagName === 'SMALL' || d.classList.contains('muted'))) { d.classList.toggle('open'); }
});
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('.qmaxg'); if (!b) return;
  const box = b.closest('.qty'), rg = box && box.querySelector('input[type=range]'); if (!rg) return;
  rg.value = rg.max; const q = box.querySelector('.qnum'); if (q) q.value = rg.max;
  rg.dispatchEvent(new Event('input', { bubbles: true })); rg.dispatchEvent(new Event('change', { bubbles: true }));
});
U.RENDER = RENDER;
// v2.6: bind alert/scout handlers now that ACT/RENDER/helpers are in scope.
if (E.installV26UI) E.installV26UI();
if (E.installV26UIBind) E.installV26UIBind(U, ACT, RENDER, factionBadge, esc, btn);
if (E.installV27UI) E.installV27UI();
if (E.installV27UIBind) E.installV27UIBind(U, ACT, RENDER, factionBadge, esc, btn);
if (E.installV28UI) E.installV28UI();
if (E.installV28UIBind) E.installV28UIBind(U, ACT, RENDER, factionBadge, esc, btn);
if (E.installV29UI) E.installV29UI();
if (E.installV29UIBind) E.installV29UIBind(U, ACT, RENDER, factionBadge, esc, btn);
if (E.installV30UI) E.installV30UI();
if (E.installV30UIBind) E.installV30UIBind(U, ACT, RENDER, factionBadge, esc, btn);
if (E.installV31UI) E.installV31UI();
if (E.installV31UIBind) E.installV31UIBind(U, ACT, RENDER, factionBadge, esc, btn);
})();
// ---- v1.8 item 5: fleet transit close-up (tap an en-route fleet) ----
(function () {
'use strict';
const E = window.EOG, Rd = E.render, U = E.ui;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MAX_SPRITES = 24;
const T = U.transit = { fid: null, raf: 0, last: 0, hudT: 0, eta0: 1, stars: null, frames: 0 };
function sprites(f) {
  // biggest hulls first, at most MAX_SPRITES drawn; the rest are summarised as "+N"
  const ships = f.ships.slice().sort((a, b) => E.HULLS[b.h].size - E.HULLS[a.h].size);
  return { list: ships.slice(0, MAX_SPRITES).map(s => s.h), more: Math.max(0, ships.length - MAX_SPRITES) };
}
function hullScale(hh) { const H = E.HULLS[hh]; return Math.min(1.6, 26 / H.size) * (H.size > 20 ? 1.4 : 1); }
function layout(list, w, h) {
  // columns from the front (right) backwards: capital ships lead, small craft fill the wings behind
  const out = []; let x = w * 0.66, i = 0, col = 0;
  while (i < list.length) {
    const per = col === 0 ? Math.min(2, list.length) : 5, items = list.slice(i, i + per); i += per;
    const rad = Math.max(...items.map(hh => E.HULLS[hh].size * hullScale(hh)));
    const gap = rad * 2.3, y0 = h * 0.56 - (items.length - 1) * gap / 2;
    items.forEach((hh, k) => out.push({ h: hh, x: x - (k % 2) * rad * 0.4, y: y0 + k * gap, ph: (i + k) * 1.7 }));
    x -= rad * 2.6 + 10; col++;
  }
  return out;
}
function makeStars(n) { const a = []; for (let i = 0; i < n; i++) a.push({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8 }); return a; }
U.openTransit = function (fid) {
  const f = E.fleetById(fid); if (!f || !f.path.length) return U.open('fleet', { fid });
  T.fid = fid; T.eta0 = Math.max(1, E.fleetETA(f)); T.stars = T.stars || makeStars(90); T.frames = 0;
  const box = $('#transit'); box.classList.remove('hidden');
  box.innerHTML = `<div class="tr-head"><div><b id="trTitle"></b><div class="small muted" id="trSub"></div></div><button class="b" data-tr="close" aria-label="Close">✕</button></div>
    <canvas id="trCanvas"></canvas>
    <div class="tr-hud"><div class="tr-eta"><span class="small muted">ETA</span> <b id="trEta"></b></div><div class="small" id="trShips"></div>
    <div class="row"><button class="b warn" data-tr="recall" id="trRecall">↩ Recall</button><button class="b" data-tr="details">Details</button><button class="b" data-tr="close">Close</button></div></div>`;
  box.querySelectorAll('[data-tr]').forEach(b => b.onclick = ev => { ev.stopPropagation(); const k = b.dataset.tr;
    if (k === 'close') U.closeTransit();
    else if (k === 'details') { const id = T.fid; U.closeTransit(); U.open('fleet', { fid: id }); }
    else if (k === 'recall') { const r = E.act.recall(T.fid); if (r && r.ok) { U.flash('↩ Recalling to ' + r.name, 'good'); T.eta0 = Math.max(1, E.fleetETA(E.fleetById(T.fid)) || 1); } else U.flash((r && r.msg) || 'Cannot recall'); hud(true); }
  });
  hud(true); T.last = 0; cancelAnimationFrame(T.raf); T.raf = requestAnimationFrame(frame);
};
U.closeTransit = function () { cancelAnimationFrame(T.raf); T.raf = 0; T.fid = null; const box = $('#transit'); if (box) { box.classList.add('hidden'); box.innerHTML = ''; } };
function hud(force) {
  const f = E.fleetById(T.fid), st = E.state; if (!f) return U.closeTransit();
  const dest = f.path.length ? f.path[f.path.length - 1] : f.sys, ds = st.systems[dest], p = E.sysPlanet(dest);
  const ord = f.order === 'return' ? '↩ returning to' : f.order === 'attack' ? '⚔ attacking' : f.order === 'retreat' ? '⛑ retreating to' : '➜ flying to';
  $('#trTitle').textContent = '🚀 ' + (f.name || 'Fleet');
  $('#trSub').innerHTML = `${ord} <b>${esc(ds.name)}</b>${p && p.owner !== 'neutral' ? ' · ' + esc(E.FACTIONS[p.owner].short) : ''} · ${f.path.length} hop${f.path.length === 1 ? '' : 's'} left`;
  $('#trEta').textContent = f.path.length ? E.fmtTime(E.fleetETA(f)) : 'arrived';
  const cnt = {}; for (const s of f.ships) cnt[s.h] = (cnt[s.h] || 0) + 1;
  const tr = E.troopSize ? E.troopSize(f.troops || {}) : 0;
  $('#trShips').innerHTML = Object.entries(cnt).map(([h, n]) => `<span class="chip">${E.fmtN(n)}× ${E.HULLS[h].name}</span>`).join(' ') + (tr ? ` <span class="chip">🪖 ${E.fmtN(tr)} troops</span>` : '');
  const rb = $('#trRecall'); if (rb) rb.disabled = !f.path.length || f.order === 'return' || f.rallyTo != null;
}
function frame(now) {
  if (T.fid == null) return;
  T.raf = requestAnimationFrame(frame);
  if (document.hidden) return;
  const dt = T.last ? Math.min(0.05, (now - T.last) / 1000) : 0.016; T.last = now; T.frames++;
  const f = E.fleetById(T.fid);
  if (!f) { U.closeTransit(); return; }
  T.hudT += dt; if (T.hudT > 0.25) { T.hudT = 0; hud(); if (!f.path.length) { setTimeout(() => { if (T.fid === f.id) U.closeTransit(); }, 1200); } }
  const c = $('#trCanvas'); if (!c) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#03060f'; g.fillRect(0, 0, w, h);
  const t = now / 1000, moving = f.path.length > 0;
  // parallax starfield streaming past
  for (const s of T.stars) { if (moving) { s.x -= dt * 0.25 * s.z; if (s.x < 0) { s.x += 1; s.y = Math.random(); } }
    g.fillStyle = 'rgba(200,220,255,' + (0.25 + 0.6 * s.z) + ')'; const L = moving ? 2 + s.z * 10 : 1.5; g.fillRect(s.x * w, s.y * h, L, s.z > 0.7 ? 2 : 1); }
  // destination planet grows as the fleet closes in
  const st = E.state, dest = f.path.length ? f.path[f.path.length - 1] : f.sys, p = E.sysPlanet(dest);
  const prog = E.clamp(1 - (moving ? E.fleetETA(f) : 0) / T.eta0, 0, 1);
  const pr = Math.min(w, h) * (0.1 + 0.22 * prog), px = w - pr * 0.75 - 6, py = h * 0.2 + pr * 0.3;
  const col = p && p.owner !== 'neutral' ? E.FACTIONS[p.owner].color : '#7f8fa8';
  const gr = g.createRadialGradient(px - pr * 0.3, py - pr * 0.3, pr * 0.1, px, py, pr);
  gr.addColorStop(0, '#9fb4d8'); gr.addColorStop(1, '#1b2740');
  g.fillStyle = gr; g.beginPath(); g.arc(px, py, pr, 0, 7); g.fill();
  g.strokeStyle = col; g.globalAlpha = 0.6; g.lineWidth = 3; g.beginPath(); g.arc(px, py, pr + 4, 0, 7); g.stroke(); g.globalAlpha = 1;
  g.fillStyle = 'rgba(255,255,255,0.8)'; g.font = '12px system-ui'; g.textAlign = 'right'; g.fillText(st.systems[dest].name, Math.min(w - 8, px - pr * 0.2), py + pr + 18);
  // the fleet
  const sp = sprites(f), L = layout(sp.list, w, h), color = E.FACTIONS[f.owner].color;
  for (const u of L) {
    const bob = Math.sin(t * 1.6 + u.ph) * 3, H = E.HULLS[u.h], sc = hullScale(u.h);
    if (moving) { const tl = H.size * sc * 1.8; const tg = g.createLinearGradient(u.x - tl - H.size * sc, 0, u.x - H.size * sc, 0); tg.addColorStop(0, 'rgba(120,220,255,0)'); tg.addColorStop(1, 'rgba(160,240,255,0.7)'); g.fillStyle = tg; g.fillRect(u.x - tl - H.size * sc, u.y + bob - 2, tl, 4); }
    Rd.drawHull(g, u.h, u.x, u.y + bob, 0, color, f.owner, sc);
  }
  if (sp.more) { g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = '12px system-ui'; g.textAlign = 'left'; g.fillText('+' + E.fmtN(sp.more) + ' more ships', 10, h - 12); }
}
E.on && E.on('newGame', () => U.closeTransit());
})();
