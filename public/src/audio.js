// Sound and music (Web Audio). The sounds were made with ElevenLabs and the music with Suno.
//   Every sound plays with a little random pitch and volume, panned to where it happens on screen.
//   Music streams from an <audio> element routed through a filter, so it can be muffled
//   (title, pause), dipped under big hits, and slowed and muffled with everything else in the K.O. slow motion.
// Browsers stay silent until the first click, tap or key press; unlock() handles that.
import { W, params } from "./config.js";

const LOG = params.has("soundlog"); // testing: record every sound played in window.__sounds

const SFX = ["block", "crouch", "dodge", "footstep", "hit-heavy", "hit-light", "jump", "knockdown", "ko", "land", "spin-attack", "victory", "whiff"];
const MUSIC = ["sounds/bamboo-grove-duel.m4a", "sounds/bamboo-grove-duel.mp3"];

const AC = window.AudioContext || window.webkitAudioContext;
let ctx = null; // created on the first click, tap or key press
const buffers = {};
let master, sfxBus, musicBus, musicFilter, slowFilter, musicEl = null, unlocked = false;
const vol = { music: 0.6, sound: 0.8, muted: false };
const live = new Set(); // playing sounds, so the slow motion can slow them too
let speed = 1, muffle = 1, duckT = 0, musicDuck = 1;
const curve = (v) => v * v; // volume settings feel even when squared

// Download the sounds straight away; they are decoded once audio is allowed to start.
const raw = Object.fromEntries(SFX.map((name) => [name, fetch(`sounds/${name}.mp3`).then((r) => r.arrayBuffer()).catch(() => null)]));

function build() {
  ctx = new AC();
  master = ctx.createGain();
  slowFilter = ctx.createBiquadFilter(); slowFilter.type = "lowpass"; slowFilter.frequency.value = 20000;
  sfxBus = ctx.createGain(); musicBus = ctx.createGain(); musicBus.gain.value = 0;
  musicFilter = ctx.createBiquadFilter(); musicFilter.type = "lowpass"; musicFilter.frequency.value = 20000;
  sfxBus.connect(slowFilter); musicFilter.connect(musicBus); musicBus.connect(slowFilter);
  slowFilter.connect(master); master.connect(ctx.destination);
  for (const name of SFX) {
    raw[name].then((data) => data && new Promise((ok, bad) => ctx.decodeAudioData(data, ok, bad)))
      .then((buf) => { if (buf) buffers[name] = buf; }).catch(() => { /* a missing sound just stays silent */ });
  }
  applyVolumes();
}

function applyVolumes() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(vol.muted ? 0 : 1, t, 0.02);
  sfxBus.gain.setTargetAtTime(curve(vol.sound), t, 0.02);
}

/** Starts the audio after the first click, tap or key press (browsers require one). */
export function unlock() {
  if (!AC) return;
  if (unlocked) { heal(); return; }
  unlocked = true;
  if (!ctx) build();
  ctx.resume?.();
  if (!musicEl) {
    musicEl = new Audio();
    const m4a = musicEl.canPlayType('audio/mp4; codecs="mp4a.40.2"');
    musicEl.src = m4a ? MUSIC[0] : MUSIC[1];
    musicEl.loop = true; musicEl.preload = "auto";
    musicEl.preservesPitch = false; musicEl.mozPreservesPitch = false; musicEl.webkitPreservesPitch = false; // slow motion drops the pitch like tape
    try { ctx.createMediaElementSource(musicEl).connect(musicFilter); } catch { /* plays unfiltered */ }
  }
  musicEl.play().then(() => { if (LOG) (window.__sounds ||= []).push("music"); }).catch(() => { /* tried again on the next click or key */ });
}

/**
 * Gets the sound going again if something stopped it: the Mac or phone suspending web audio
 * (headphones plugged in, another app taking the speakers, sleep) or the music being paused.
 */
let healT = 0;
function heal() {
  if (!ctx || document.hidden) return;
  if (ctx.state !== "running") ctx.resume?.().catch?.(() => {});
  if (musicEl && musicEl.paused) musicEl.play().catch(() => {});
}

/**
 * Plays a sound. o: vol (0–1), x (screen x, for panning), rate (pitch/speed), vary (random pitch spread).
 */
export function sfx(name, o = {}) {
  const buf = buffers[name];
  if (!ctx || !buf || !unlocked || vol.muted) return;
  if (LOG) (window.__sounds ||= []).push(name);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const vary = o.vary ?? 0.06, base = (o.rate ?? 1) * (1 + (Math.random() * 2 - 1) * vary);
  src.playbackRate.value = base * (0.45 + 0.55 * speed);
  const g = ctx.createGain(); g.gain.value = (o.vol ?? 0.7) * (0.9 + Math.random() * 0.2);
  let out = g;
  if (o.x !== undefined && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, (o.x / W) * 2 - 1)) * 0.65;
    g.connect(p); out = p;
  }
  src.connect(g); out.connect(sfxBus);
  const v = { src, base };
  live.add(v); src.onended = () => live.delete(v);
  src.start();
}

/** Briefly lowers the music under a big hit. */
export function duck(depth = 0.5, dur = 0.25) { duckT = Math.max(duckT, dur); musicDuck = Math.min(musicDuck, depth); }

/**
 * Called every frame. dt: real seconds. slow: game speed in the K.O. slow motion (1 = normal).
 * mood: "title" (music soft and muffled), "pause" (muffled more), or "play".
 */
export function audioTick(dt, slow, mood) {
  if (!ctx || !unlocked) return;
  if ((healT -= dt) <= 0) { healT = 1; heal(); }
  speed = slow;
  const t = ctx.currentTime;
  // slow motion: everything drops in pitch and loses its top end, coming back as the game speeds up
  slowFilter.frequency.setTargetAtTime(slow >= 0.999 ? 20000 : 350 + slow * slow * 12000, t, 0.03);
  for (const v of live) v.src.playbackRate.setTargetAtTime(v.base * (0.45 + 0.55 * slow), t, 0.03);
  if (musicEl) musicEl.playbackRate = 0.55 + 0.45 * slow;
  // music: muffled on the title and in the pause menu, dipped briefly under big hits
  const want = mood === "pause" ? 0.06 : mood === "title" ? 0.35 : 1;
  muffle += (want - muffle) * Math.min(1, dt * 4);
  musicFilter.frequency.setTargetAtTime(300 + muffle * muffle * 19700, t, 0.05);
  if (duckT > 0) { duckT -= dt; if (duckT <= 0) musicDuck = 1; }
  const level = curve(vol.music) * 0.55 * (mood === "title" ? 0.8 : 1) * musicDuck;
  musicBus.gain.setTargetAtTime(level, t, duckT > 0 ? 0.01 : 0.12);
}

/** Volume settings, 0–10. */
export function setVolumes(music, sound) { vol.music = music / 10; vol.sound = sound / 10; applyVolumes(); }
export function toggleMute() { vol.muted = !vol.muted; applyVolumes(); return vol.muted; }
export const isMuted = () => vol.muted;

// Quiet when the tab is hidden.
document.addEventListener("visibilitychange", () => {
  if (!ctx || !unlocked) return;
  if (document.hidden) { ctx.suspend?.(); musicEl?.pause(); } else { ctx.resume?.(); musicEl?.play().catch(() => {}); }
});

/** For testing: what the audio engine is doing right now. */
export function audioState() {
  if (!ctx) return { ctx: null, unlocked };
  return {
    state: ctx.state, unlocked, muted: vol.muted, speed, live: live.size, buffers: Object.keys(buffers).length,
    slowHz: Math.round(slowFilter.frequency.value), musicHz: Math.round(musicFilter.frequency.value),
    master: master.gain.value, sfxBus: sfxBus.gain.value, musicBus: +musicBus.gain.value.toFixed(3),
    music: musicEl ? { paused: musicEl.paused, rate: musicEl.playbackRate, t: Math.round(musicEl.currentTime) } : null,
  };
}
