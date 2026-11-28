// Galaxies of Empires v3.0 — interface cleanup, testing/debug, safe performance wins.
'use strict';
(function () {
const E = window.EOG;

E.migrate30 = function (st) {
  if (!st) return st;
  st.ver = '3.0';
  return st;
};

E.migratePrevSlots = function () {
  const groups = [
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

E.V30_CSS = [
  /* Opaque chrome: no backdrop-filter (pan FPS + contrast). Same ink, no blurred map bleeding through. */
  '#topbar,#bottombar,#sheet,.menubox,.modalbox,.resbox,#tut,#capBanner,#rhud,#rctl,#rload{',
    '-webkit-backdrop-filter:none !important;backdrop-filter:none !important;}',
  '#topbar{background:#0a1020 !important;}',
  '#bottombar{background:#080c1c !important;}',
  '#sheet{background:#0c142c !important;overflow:hidden;}',
  '.menubox,.modalbox,.resbox{background:#0c142c !important;}',

  /* Text that used to spill out of chips */
  '.res b,#r-cmd b,#r-cmd small,.army b,.army small{',
    'min-width:0;overflow:hidden;text-overflow:ellipsis;}',
  '#r-cmd,#r-idle{min-width:0;}',
  '#r-cmd{flex:1.1 1 auto;min-width:78px;}',
  '.res:not(.cmd){min-width:56px;}',
  '@media (max-width:899px){#r-cmd{max-width:36%;flex:1.05 1 auto;}}',
  '#sheet-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',

  /* Tap targets on primary chrome (keep compact visuals, raise the floor) */
  '.hb{min-height:40px;min-width:40px;padding:4px 7px;}',
  '.b.mini{min-height:36px;min-width:36px;}',
  '.b.mini2{min-height:40px;}',
  '.tab{min-height:40px;}',
  '.bc-x{min-width:44px;min-height:40px;}',
  '#mapOverviewBtn{width:44px;height:44px;}',
  '#alertStrip.alertrow{min-height:44px;align-items:center;z-index:27;}',
  '#bottombar button{font-size:12px;}',

  /* Sheet: keep content inside the panel (HQ tip was painting under the bottom bar) */
  '#sheet-body{padding-bottom:18px;}',
  '#sheet-body .tabs{position:sticky;top:-8px;z-index:2;background:#0c142c;padding-top:6px;padding-bottom:6px;margin-top:0;}',

  /* Floating chrome stacks under the top bar instead of overlapping */
  '#tut{top:calc(var(--tbh,84px) + var(--alerth,0px) + 2px) !important;}',
  'body.sheet-open #tut{top:auto !important;}',
  '#toasts,#bcards{top:calc(var(--tbh,84px) + var(--alerth,0px) + var(--tuth,0px) + 4px) !important;}',
  '#capBanner{top:calc(var(--tbh,84px) + var(--alerth,0px) + var(--tuth,0px) + 8px) !important;}',
  'body.sheet-open #capBanner{display:none !important;}',

  /* Title menu: hide leftover in-game chrome; compact so Start stays on-screen */
  'body.menu-open #topbar,body.menu-open #bottombar,body.menu-open #mapOverviewBtn,',
  'body.menu-open #alertStrip,body.menu-open #riftbar,body.menu-open #tut,',
  'body.menu-open #toasts,body.menu-open #bcards,body.menu-open #capBanner,',
  'body.menu-open #banner,body.menu-open #sheet{display:none !important;}',
  'body.menu-open #menu{background:rgba(3,5,14,0.88);}',
  '#menu .menubox{display:flex;flex-direction:column;max-height:100%;overflow:hidden;}',
  '#m30scroll{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-bottom:8px;}',
  '#m30foot{flex:0 0 auto;padding-top:6px;background:#0c142c;box-shadow:0 -10px 18px rgba(12,20,44,0.95);}',

  '@media (max-height: 920px){',
    '.menubox{padding:12px 14px;}',
    '.logo{font-size:28px;}',
    '.menubox > p{font-size:13px;line-height:1.3;margin:6px 0;}',
    '.b.big{padding:11px 16px;margin:4px 0;}',
    '.diff,.setup{margin:6px 0 2px;}',
  '}',

  /* Desktop: stop stretching resource/army chips across the full width */
  '@media (min-width: 900px){',
    '.resrow,.armyrow{justify-content:flex-start;gap:6px;}',
    '.res,.army{flex:0 1 auto;width:auto;min-width:92px;max-width:200px;padding:3px 10px;}',
    '.res.cmd{min-width:148px;max-width:280px;}',
    '#armyrow .army small{font-size:10px;}',
    '#armyrow .army b{font-size:14px;}',
  '}',

  /* Narrow phone: army captions were clipping by 2–3px */
  '@media (max-width: 380px){',
    '#armyrow .army{padding:1px 2px;column-gap:2px;}',
    '#armyrow .army small{font-size:8px;letter-spacing:-0.15px;overflow:hidden;text-overflow:ellipsis;}',
  '}',

  /* Overview sits above the sheet; hide the button while a sheet/battle covers its corner */
  '#mapOverview.show{z-index:28;}',
  '#mapOverviewBtn.on{z-index:29;}',
  'body.sheet-open #mapOverviewBtn:not(.on),body.battle-open #mapOverviewBtn{display:none !important;}',
  'body.overview-open #tut,body.overview-open #toasts,body.overview-open #bcards,body.overview-open #capBanner{display:none !important;}',
  'body.overview-open #sheet{display:none !important;}'
].join('');

E.pinMenuStart30 = function () {
  if (typeof document === 'undefined') return;
  const box = document.querySelector('#menu .menubox');
  const start = document.getElementById('mNew');
  if (!box || !start) return;
  if (start.parentElement && start.parentElement.id === 'm30foot' && box.querySelector('#m30scroll')) return;
  const scroll = document.createElement('div');
  scroll.id = 'm30scroll';
  const foot = document.createElement('div');
  foot.id = 'm30foot';
  const kids = Array.prototype.slice.call(box.childNodes);
  for (let i = 0; i < kids.length; i++) {
    const ch = kids[i];
    if (ch === start) foot.appendChild(ch);
    else scroll.appendChild(ch);
  }
  box.appendChild(scroll);
  box.appendChild(foot);
};

E.syncChrome30 = function () {
  if (typeof document === 'undefined') return;
  const body = document.body; if (!body) return;
  try { E.pinMenuStart30(); } catch (e) {}
  const vis = el => !!(el && !el.classList.contains('hidden') && el.offsetParent !== null || (el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0));
  const menu = document.getElementById('menu');
  const sheet = document.getElementById('sheet');
  const battle = document.getElementById('battleView');
  const ov = document.getElementById('mapOverview');
  const strip = document.getElementById('alertStrip');
  const tut = document.getElementById('tut');
  // If the game is running, never leave the title menu (and body.menu-open) up —
  // that class hides the attack pop-up, sheet, and chrome (v27_ui tap + wide sheet).
  if (E.main && E.main.menu === false && menu && !menu.classList.contains('hidden')) {
    menu.classList.add('hidden');
  }
  const menuOn = !!(menu && !menu.classList.contains('hidden') && !(E.main && E.main.menu === false));
  const sheetOn = !!(sheet && !sheet.classList.contains('hidden'));
  const battleOn = !!(battle && !battle.classList.contains('hidden'));
  const ovOn = !!(ov && ov.classList.contains('show'));
  const alertOn = !!(strip && !strip.classList.contains('hidden'));
  const tutOn = !!(tut && !tut.classList.contains('hidden'));
  body.classList.toggle('menu-open', menuOn);
  body.classList.toggle('sheet-open', sheetOn);
  body.classList.toggle('battle-open', battleOn);
  body.classList.toggle('overview-open', ovOn);
  body.classList.toggle('has-alert', alertOn);
  body.classList.toggle('has-tut', tutOn);
  const alh = alertOn ? Math.ceil(strip.getBoundingClientRect().height) : 0;
  const tuth = tutOn ? Math.ceil(tut.getBoundingClientRect().height) : 0;
  const root = document.documentElement;
  if (E._alerth30 !== alh) { E._alerth30 = alh; root.style.setProperty('--alerth', alh + 'px'); }
  if (E._tuth30 !== tuth) { E._tuth30 = tuth; root.style.setProperty('--tuth', tuth + 'px'); }
};

const _newGame30 = E.newGame;
E.newGame = function () {
  const st = _newGame30.apply(this, arguments);
  if (st) E.migrate30(st);
  return st;
};

E.installV30UI = function () {
  if (typeof document === 'undefined') return;
  try { E.installV30Perf(); } catch (e) {}
  if (!document.getElementById('v30style')) {
    const s = document.createElement('style');
    s.id = 'v30style';
    s.textContent = E.V30_CSS;
    document.head.appendChild(s);
  }
  const hook = () => {
    try {
      const M = E.main;
      if (M && !M._v30hooked) {
        M._v30hooked = true;
        const _start = M.start.bind(M);
        M.start = function (st) {
          const r = _start(st);
          try {
            const menu = document.getElementById('menu');
            if (menu) menu.classList.add('hidden');
            M.menu = false;
            E.syncChrome30();
          } catch (e) {}
          return r;
        };
        const _show = M.showMenu && M.showMenu.bind(M);
        if (_show) M.showMenu = function () {
          const r = _show();
          try { E.pinMenuStart30(); E.syncChrome30(); } catch (e) {}
          return r;
        };
      }
    } catch (e) {}
    E.syncChrome30();
    if (E._v30obs) return;
    const mo = new MutationObserver(() => { E._v30chromeDirty = true; try { E.syncChrome30(); } catch (e) {} });
    const ids = ['menu', 'sheet', 'battleView', 'mapOverview', 'alertStrip', 'tut', 'capBanner', 'toasts'];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) mo.observe(el, { attributes: true, attributeFilter: ['class'], childList: el.id === 'menu', subtree: el.id === 'menu' });
    }
    E._v30obs = mo;
    const tick = () => {
      if (E._v30chromeDirty) { E._v30chromeDirty = false; E.syncChrome30(); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hook);
  else hook();
};

E.installV30UIBind = function (U, ACT, RENDER, factionBadge, esc, btn) {
  if (U && U._v30bind) return;
  if (U) U._v30bind = true;

  // Opening the overview used to leave the planet sheet and tutorial sitting on top of it.
  const prevToggle = E.toggleMapOverview;
  if (typeof prevToggle === 'function') {
    E.toggleMapOverview = function (on) {
      if (on == null) on = !E._overviewOn;
      if (on && U && U.close) { try { U.close(); } catch (e) {} }
      const r = prevToggle.call(E, on);
      E.syncChrome30();
      return r;
    };
  }

  if (U && U.updateStrip) {
    const prev = U.updateStrip.bind(U);
    U.updateStrip = function () { const r = prev(); E.syncChrome30(); return r; };
  }
  if (U && U.updateTop) {
    const prevT = U.updateTop.bind(U);
    U.updateTop = function () { const r = prevT(); /* --tbh may have changed */ E._v30chromeDirty = true; return r; };
  }
};

// ---------- safe, invisible performance wins (no gameplay / no lod visual change) ----------
E.installV30Perf = function () {
  if (E._v30perf) return;
  E._v30perf = true;
  const Rd = E.render;

  // Cache static map labels (planet names) as tiny canvases. strokeText+fillText
  // on every planet every frame is a top hotspot at pan_close z=0.9. Live texts
  // (scout age, countdown) still go through the original path.
  const labelCache = new Map();
  E._labelCache30 = labelCache;
  if (Rd) {
    Rd.drawLabel30 = function (ctx, x, y, text, color, size) {
      if (text == null || text === '') return false;
      const s = String(text);
      if (/ old$/.test(s) || /\d+:\d{2}/.test(s)) return false;
      const dpr = Math.min(3, Math.max(1, (Rd.dpr || (typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1))));
      const key = s + '\x00' + color + '\x00' + size + '\x00' + dpr;
      let rec = labelCache.get(key);
      if (!rec) {
        const font = '600 ' + size + 'px system-ui, -apple-system, sans-serif';
        const mctx = document.createElement('canvas').getContext('2d');
        mctx.font = font;
        const w = Math.ceil(mctx.measureText(s).width + 8);
        const h = Math.ceil(size * 1.6 + 8);
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.ceil(w * dpr));
        cv.height = Math.max(1, Math.ceil(h * dpr));
        const g = cv.getContext('2d');
        g.scale(dpr, dpr);
        g.font = font;
        g.textAlign = 'center';
        g.textBaseline = 'alphabetic';
        const tx = w / 2, ty = size + 3;
        g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(s, tx, ty);
        g.fillStyle = color; g.fillText(s, tx, ty);
        rec = { cv, w, h, ox: w / 2, oy: ty };
        if (labelCache.size > 400) {
          const first = labelCache.keys().next().value;
          labelCache.delete(first);
        }
        labelCache.set(key, rec);
      }
      ctx.drawImage(rec.cv, x - rec.ox, y - rec.oy, rec.w, rec.h);
      return true;
    };
  }

  // idleBuildPlanets() allocates a new list every frame just to draw red X marks.
  // Reuse for 150 ms — construction queues don't change mid-pan at 60 Hz.
  if (typeof E.idleBuildPlanets === 'function') {
    const prev = E.idleBuildPlanets.bind(E);
    E.idleBuildPlanets = function () {
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (E._idle30 && (now - E._idle30t) < 150 && E._idle30st === E.state) return E._idle30;
      const v = prev();
      E._idle30 = v; E._idle30t = now; E._idle30st = E.state;
      return v;
    };
  }
};

if (typeof document !== 'undefined') {
  const bootPerf = () => { try { E.installV30Perf(); } catch (e) {} };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootPerf);
  else bootPerf();
}

})();
