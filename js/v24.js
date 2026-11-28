// Galaxies of Empires v2.4 — core additions (loaded after v23.js):
//  item 1 idle-buildings chip jump/cycle · item 2 oversized incremental pan cache helpers · save migration
'use strict';
(function () {
const E = window.EOG;

// ---------------- item 1: idle-buildings counter jumps to an idle planet ----------------
// An "idle slot" is a construction slot that can still be built or upgraded (empty, or below max
// level) on a player world whose build queue is empty. Planets where every slot is idle are included.
E.idleSlotCount = function (p) {
  if (!p || p.owner !== 'player') return 0;
  if (p.queues && p.queues.build && p.queues.build.length) return 0;
  if (E.canBuildMore && !E.canBuildMore(p)) return 0;
  const n = E.planetSlots(p);
  let c = 0;
  for (let i = 0; i < n; i++) {
    const s = p.slots[i];
    if (!s || !s.b || s.lvl < E.BUILD_MAX_LVL) c++;
  }
  return c;
};
E.idlePlanetsSorted = function () {
  const list = (E.idleBuildPlanets ? E.idleBuildPlanets() : []).slice();
  list.sort((a, b) => E.idleSlotCount(b) - E.idleSlotCount(a) || a.id - b.id);
  return list;
};
E._idleJumpI = -1;
E._idleJumpSig = '';
E.idleJump = function () {
  const list = E.idlePlanetsSorted();
  if (!list.length) return null;
  const sig = list.map(p => p.id + ':' + E.idleSlotCount(p)).join(',');
  if (sig !== E._idleJumpSig) { E._idleJumpSig = sig; E._idleJumpI = -1; }
  E._idleJumpI = (E._idleJumpI + 1) % list.length;
  const p = list[E._idleJumpI];
  const Rd = E.render;
  if (Rd) {
    Rd.sel = Rd.sel || {};
    Rd.sel.sys = p.sys;
    // v2.1 rule: never auto-zoom on a planet jump. A center pan is fine and is what Rd.focus does by default.
    if (Rd.focus) Rd.focus(p.sys);
  }
  if (E.ui && E.ui.open) E.ui.open('system', { sys: p.sys, tab: 'build' });
  return p;
};

// ---------------- save migration ----------------
E.migrate24 = function (st) {
  if (!st) return st;
  st.ver = '2.4';
  return st;
};
try { if (E.migratePrevSlots) E.migratePrevSlots(); } catch (e) { }
})();
