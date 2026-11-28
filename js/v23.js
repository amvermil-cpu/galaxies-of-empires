// Galaxies of Empires v2.3 — core additions (loaded after v22.js):
//  item 1 rally groups (every list) · item 2 zoom-only simplified map helpers · item 4 traveling-triangle sizes · save migration
'use strict';
(function () {
const E = window.EOG;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------- item 4: traveling fleet triangle sizes ----------------
// Ship-count thresholds chosen so they show up in normal play: a scout / single transport stays small,
// a typical 8–24 ship battle group is medium, and a 25+ ship stack (or a heavy capital wing) is large.
// Power is a backstop so a few Warship Carriers still read as large even with a low ship count.
// There are still no numbers or icons on traveling fleets.
E.TRI = {
  MED_SHIPS: 8, LARGE_SHIPS: 25,
  MED_POWER: 400, LARGE_POWER: 1800,
  PX: { small: 5, medium: 9, large: 15 }
};
E.fleetTriKind = function (f) {
  if (!f || !f.ships) return 'small';
  const n = f.ships.length, p = (E.fleetStats && E.fleetStats(f).power) || 0;
  if (n >= E.TRI.LARGE_SHIPS || p >= E.TRI.LARGE_POWER) return 'large';
  if (n >= E.TRI.MED_SHIPS || p >= E.TRI.MED_POWER) return 'medium';
  return 'small';
};
E.fleetTriPx = function (f) { return E.TRI.PX[E.fleetTriKind(f)] || E.TRI.PX.small; };

// ---------------- item 1: rally groups (bulletproof, every list) ----------------
E.RALLY_KEY = 'goe_rally_v23';
E.isRallying = f => !!(f && f.rallyTo != null);
function readRally() { try { return JSON.parse(localStorage.getItem(E.RALLY_KEY) || '{}'); } catch (e) { return {}; } }
function writeRally(o) { try { localStorage.setItem(E.RALLY_KEY, JSON.stringify(o)); } catch (e) { } }
E.rallyIsOpen = function (key) { return !!readRally()[key]; };
E.rallySetOpen = function (key, on) { const o = readRally(); if (on) o[key] = 1; else delete o[key]; writeRally(o); };
E.rallyToggle = function (key) { E.rallySetOpen(key, !E.rallyIsOpen(key)); return E.rallyIsOpen(key); };

// Group every rallying fleet (rallyTo set, whether en route or waiting at the rally point) by destination.
// Always returns one group per rally point, even when the group has a single fleet — the list must never flood.
E.rallyGroups = function (list) {
  const rest = [], by = {};
  for (const f of list || []) {
    if (!E.isRallying(f)) { rest.push(f); continue; }
    const k = String(f.rallyTo);
    (by[k] = by[k] || []).push(f);
  }
  const groups = Object.keys(by).map(k => {
    const fleets = by[k], dest = E.state && E.state.planets[+k];
    let ships = 0, forming = 0, eta = Infinity, troops = 0;
    for (const f of fleets) {
      ships += f.ships.length;
      troops += E.troopCount ? E.troopCount(f.troops) : 0;
      if (f.path && f.path.length) { const e = E.fleetETA(f); if (isFinite(e) && e < eta) eta = e; }
      else forming++;
    }
    return {
      key: k, destId: +k, dest, name: dest ? dest.name : null,
      fleets, n: fleets.length, ships, forming, eta, troops,
      sys: dest ? dest.sys : (fleets[0] && fleets[0].target)
    };
  });
  groups.sort((a, b) => b.ships - a.ships || a.key.localeCompare(b.key));
  return { groups, rest };
};

// One collapsed row per rally point, with a clear ▶/▼ toggle. Default collapsed (persisted).
// opts.row(f) renders an expanded member; opts.pick(g, allOn) is an optional group checkbox (send screen).
E.rallyGroupHTML = function (g, storeKey, opts) {
  opts = opts || {};
  const open = E.rallyIsOpen(storeKey);
  const title = g.name ? ('Rallying to ' + g.name) : ('Rallying (' + g.n + ')');
  const eta = isFinite(g.eta) ? ('next arrival ' + E.fmtTime(g.eta)) : (g.forming ? 'forming up' : '');
  const sub = g.n + ' fleet' + (g.n === 1 ? '' : 's') + ' · ' + (E.fmtN ? E.fmtN(g.ships) : g.ships) + ' ship' + (g.ships === 1 ? '' : 's')
    + (g.forming ? ' · ' + g.forming + ' waiting' : '') + (g.troops ? ' · 🪖' + (E.fmtN ? E.fmtN(g.troops) : g.troops) : '')
    + (eta ? ' · ' + eta : '');
  const pick = typeof opts.pick === 'function' ? opts.pick(g, open) : '';
  let h = `<div class="rallygroup ${open ? 'open' : 'closed'}" data-rally="${esc(g.key)}" data-k="${esc(storeKey)}" id="rally-${esc(storeKey)}">`;
  h += `<div class="rallyhead">${pick}<button class="rallytog" data-a="rallyToggle" data-k="${esc(storeKey)}" aria-expanded="${open ? 'true' : 'false'}" title="${open ? 'Collapse rally group' : 'Expand rally group'}">${open ? '▼' : '▶'}</button>`;
  h += `<div class="rallyinfo"><b>⚑ ${esc(title)}</b><span class="small muted">${esc(sub)}</span></div></div>`;
  if (open && typeof opts.row === 'function') h += `<div class="rallybody">${g.fleets.map(opts.row).join('')}</div>`;
  h += '</div>';
  return h;
};

E.rallyListHTML = function (list, keyPrefix, row) {
  const { groups, rest } = E.rallyGroups(list);
  let h = rest.map(row).join('');
  for (const g of groups) h += E.rallyGroupHTML(g, keyPrefix + '-' + g.key, { row });
  return h;
};


// Clearer rally status (use the rally-point name, not f.target which may be unset)
const _fleetStatus = E.fleetStatus;
if (typeof _fleetStatus === 'function') {
  E.fleetStatus = function (f) {
    if (E.isRallying(f)) {
      const p = E.state && E.state.planets[f.rallyTo];
      const nm = p ? p.name : 'rally point';
      if (f.path && f.path.length) return { k: 'rally', icon: '⚑', text: 'Rallying to ' + nm + ' · ETA ' + E.fmtTime(E.fleetETA(f)) };
      return { k: 'rally', icon: '⚑', text: 'Forming up at ' + nm };
    }
    return _fleetStatus.apply(this, arguments);
  };
}

// ---------------- save migration ----------------
E.migrate23 = function (st) {
  if (!st) return st;
  st.ver = '2.3';
  return st;
};
try { if (E.migratePrevSlots) E.migratePrevSlots(); } catch (e) { }
})();
