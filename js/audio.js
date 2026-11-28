// Galaxies of Empires — generated WebAudio sound effects
'use strict';
(function () {
const E = window.EOG;
const A = E.audio = { muted: false, ctx: null, last: {} };
try { const v = localStorage.getItem('goe_mute') ?? localStorage.getItem('eog_mute'); A.muted = v === '1'; } catch (e) { }
A.unlock = function () {
  if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
  const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
  A.ctx = new C(); A.out = A.ctx.createGain(); A.out.gain.value = A.muted ? 0 : 1; A.out.connect(A.ctx.destination);
  A.master = A.ctx.createGain(); A.master.connect(A.out); // sound effects bus
  A.musicBus = A.ctx.createGain(); A.musicBus.connect(A.out); // v2.0 P: ambient music bus
  A.applyVolumes(); A.startMusic();
};
// v2.0 P: volume settings (Menu › Settings) — music + effects buses, mute silences both
A.applyVolumes = function () {
  if (!A.ctx) return; const S = E.settings || { sfx: 0.8, music: 0.45 }, t = A.ctx.currentTime;
  A.master.gain.setTargetAtTime(0.42 * S.sfx, t, 0.05); A.musicBus.gain.setTargetAtTime(0.32 * S.music, t, 0.3); A.out.gain.setTargetAtTime(A.muted ? 0 : 1, t, 0.05);
  if (S.music > 0 && !A.muted) A.startMusic();
};
// Generative ambient score: slow detuned pads through a breathing low-pass, a soft bell arpeggio on top.
// Everything is synthesised here (no audio files). Starts only after a user gesture unlocks the AudioContext.
const CHORDS = [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]]; // Am9-ish, Fmaj7, G, Em
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
A.music = { on: false, step: 0, timer: null, next: 0 };
A.startMusic = function () {
  if (!A.ctx || A.music.on) return; const S = E.settings || {}; if (!(S.music > 0)) return;
  A.music.on = true; A.music.next = A.ctx.currentTime + 0.2;
  const lp = A.music.lp = A.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.7; lp.connect(A.musicBus);
  const lfo = A.ctx.createOscillator(), lg = A.ctx.createGain(); lfo.frequency.value = 0.05; lg.gain.value = 450; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
  const sched = () => {
    if (!A.ctx) return;
    while (A.music.next < A.ctx.currentTime + 4) { playBar(A.music.next, A.music.step++); A.music.next += 8; }
    A.music.timer = setTimeout(sched, 1500);
  };
  sched();
};
function playBar(t0, step) {
  const c = A.ctx, ch = CHORDS[step % CHORDS.length];
  for (const m of ch) for (const det of [-6, 6]) {
    const o = c.createOscillator(), g = c.createGain(); o.type = 'sawtooth'; o.frequency.value = mtof(m - 12); o.detune.value = det;
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.035, t0 + 2.5); g.gain.linearRampToValueAtTime(0.03, t0 + 6); g.gain.linearRampToValueAtTime(0.0001, t0 + 9);
    o.connect(g); g.connect(A.music.lp); o.start(t0); o.stop(t0 + 9.2);
  }
  // bell arpeggio (sparse, deterministic per bar)
  for (let i = 0; i < 6; i++) {
    if (((step * 7 + i * 3) % 5) > 2) continue;
    const t = t0 + 0.6 + i * 1.2, m = ch[(i + step) % ch.length] + 12, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.value = mtof(m); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    o.connect(g); g.connect(A.musicBus); o.start(t); o.stop(t + 2.3);
  }
}
A.setMuted = function (m) { A.muted = m; try { localStorage.setItem('goe_mute', m ? '1' : '0'); localStorage.removeItem('eog_mute'); } catch (e) { } A.applyVolumes(); };
function tone(freq, dur, type, vol, slide, delay) {
  const c = A.ctx, t = c.currentTime + (delay || 0);
  const o = c.createOscillator(), g = c.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(A.master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol, freq, delay) {
  const c = A.ctx, t = c.currentTime + (delay || 0);
  const len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = c.createBufferSource(); s.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 800;
  const g = c.createGain(); g.gain.value = vol || 0.4;
  s.connect(f); f.connect(g); g.connect(A.master); s.start(t);
}
const SFX = {
  click: () => tone(660, 0.06, 'square', 0.12),
  build: () => { tone(520, 0.1, 'triangle', 0.25); tone(780, 0.14, 'triangle', 0.25, null, 0.09); },
  ship: () => tone(220, 0.35, 'sawtooth', 0.12, 3),
  launch: () => { tone(160, 0.45, 'sawtooth', 0.12, 4); noise(0.3, 0.1, 1200); },
  laser: () => tone(1400 + Math.random() * 500, 0.09, 'square', 0.05, 0.3),
  boom: () => noise(0.5, 0.35, 500 + Math.random() * 400),
  alert: () => { tone(880, 0.12, 'square', 0.18); tone(660, 0.16, 'square', 0.18, null, 0.15); },
  victory: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.25, null, i * 0.12)),
  defeat: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.15, null, i * 0.18)),
  ground: () => { for (let i = 0; i < 6; i++) noise(0.12, 0.15, 1500, i * 0.09); },
  capture: () => { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.4, 'triangle', 0.18, null, i * 0.07)); noise(0.6, 0.08, 3000); },
  warp: () => { tone(300, 0.35, 'sine', 0.12, 4); noise(0.2, 0.05, 4000); },
};
A.play = function (name) {
  if (A.muted || !A.ctx || !SFX[name] || E.state && E.state._ff || (E.settings && !(E.settings.sfx > 0))) return;
  const now = performance.now(), gap = name === 'laser' ? 45 : name === 'boom' ? 70 : 30;
  if (A.last[name] && now - A.last[name] < gap) return;
  A.last[name] = now;
  try { SFX[name](); } catch (e) { }
};
E.on('sfx', A.play);
})();
