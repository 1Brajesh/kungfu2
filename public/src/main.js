// Game loop (fixed 60 Hz updates, drawing every screen frame) and the flow between screens:
//   title    two computer fighters spar behind the logo and the menu
//   match    you against the computer: best of 3 rounds, 60 s each
//   practice you against a practice dummy (or the computer), no rounds; T, 1/2/3 and B change things
//   demo     (?demo) the computer plays both sides, for testing
import { W, H, DT, PAL, params, time } from "./config.js";
import { readP1, take, clearPressed, anyPressed } from "./input.js";
import { makeFighter, resetFighter, updateFighter, resolveSpacing, finishFighter, checkHit, applyHit, startMove, toWorld, TRAIL_LIFE, snapFighter, applySnap } from "./fighter.js";
import { MOVES } from "./rig.js";
import { connect, newCode, CODE_LEN } from "./net.js";
import { drawFighter, drawRibbons, drawShadow, drawRig, drawDizzy, tintPal } from "./draw.js";
import { STAGES } from "./stage.js";
import { spawnHit, updateFx, drawFx, drawTrail, drawDust, drawFlash, fighterEvent, clearFx, setDustColors } from "./fx.js";
import { hudTick, drawHud } from "./hud.js";
import { makeAI, resetAI, aiIntent, LEVEL_NAMES } from "./ai.js";
import { makeMenu, menuKeys, menuPointer, drawMenu, drawLogo, drawControls, dim, drawText } from "./menu.js";
import { touch, initTouch, drawTouch, resetTouch, isPortrait } from "./touch.js";
import { sfx, duck, unlock, audioTick, setVolumes, toggleMute, isMuted } from "./audio.js";

const canvas = document.getElementById("game");
const g = canvas.getContext("2d");
let scale = 1;
function fit() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const cw = Math.min(innerWidth, (innerHeight * W) / H), ch = (cw * H) / W;
  canvas.style.width = cw + "px"; canvas.style.height = ch + "px";
  canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
  scale = canvas.width / W;
}
addEventListener("resize", fit);
fit();

// --- settings, remembered between visits ---
const settings = { level: "Normal", stage: "temple", music: 6, sound: 8 };
try { Object.assign(settings, JSON.parse(localStorage.getItem("kf2.settings") || "{}")); } catch { /* private mode */ }
const saveSettings = () => { try { localStorage.setItem("kf2.settings", JSON.stringify(settings)); } catch { /* ignore */ } };
if (!LEVEL_NAMES.includes(settings.level)) settings.level = "Normal";
if (LEVEL_NAMES.includes(params.get("level"))) settings.level = params.get("level");
setVolumes(settings.music, settings.sound);

const START = [330, 630];
const P1 = makeFighter("p1", START[0], PAL.white, 1);
const P2 = makeFighter("p2", START[1], PAL.blue, -1);
let slow = params.has("slow"), showRig = params.has("rig");
let freeze = 0, shake = 0, camX = 0, camY = 0, zoom = 0, zoomAt = [W / 2, H / 2];

// --- stage ---
let stageI = 0, stage, pals;
function setStage(i) {
  stageI = (i + STAGES.length) % STAGES.length; stage = STAGES[stageI];
  pals = new Map([[P1, tintPal(P1.pal, stage.tint)], [P2, tintPal(P2.pal, stage.tint)]]);
  setDustColors(stage.dust[0], stage.dust[1]);
}
const stageIndex = (id) => (id === "random" ? Math.floor(Math.random() * STAGES.length) : Math.max(0, STAGES.findIndex((s) => s.id === id)));
setStage(stageIndex(params.get("stage") || settings.stage));

let koT = -1, koSlow = 0, koFocus = null, lastAttacker = P1;
const KO_SLOW = 1.8; // s of real time the K.O. plays in slow motion

// --- who controls the fighters ---
const AI = makeAI(settings.level);    // the computer opponent (P2)
const AI1 = makeAI("Normal");          // plays P1 on the title screen and in ?demo
const MODES = ["Stand", "Block", "Crouch", "Jump", "CPU"]; // practice opponent
let mode = 0;
P2.nextJump = 0;
function dummyIntent(f) {
  const it = { dir: 0, speed: 0.55, crouch: false, block: false };
  if (f.hp <= 0 || koT >= 0) return it;
  const d = f.home - f.x;
  if (!f.homing && !f.move && !f.air && f.idleT > 0.7 && Math.abs(d) > 14) f.homing = true;
  if (f.homing && (Math.abs(d) < 5 || f.move)) f.homing = false;
  if (f.homing) { it.dir = Math.sign(d); return it; }
  const m = MODES[mode];
  if (m === "Block") it.block = true;
  if (m === "Crouch") it.crouch = true;
  if (m === "Jump" && time.gt >= f.nextJump && !f.move && !f.air) { it.jump = true; f.nextJump = time.gt + 1.3; }
  return it;
}

// --- scenes ---
const ROUND_TIME = 60, WINS_NEEDED = 2;
let scene = "title", menu = null, showControls = false;
/** phase: intro (ROUND n / FIGHT!), fight, end (K.O. or time up), over (match result) */
const match = { round: 1, wins: [0, 0], phase: "intro", t: 0, timer: ROUND_TIME, winner: null, why: "" };

function resetFighters() {
  resetFighter(P1, START[0], 1); resetFighter(P2, START[1], -1);
  P2.homing = false; koT = -1; koSlow = 0; koFocus = null; zoom = 0; freeze = 0; clearFx(); resetAI(AI); resetAI(AI1);
}

function startRound() {
  resetFighters();
  Object.assign(match, { phase: "intro", t: 0, timer: ROUND_TIME, winner: null, why: "" });
}
function startMatch() {
  scene = "match"; menu = null; clearPressed();
  AI.level = settings.level;
  setStage(stageIndex(settings.stage));
  match.round = 1; match.wins = [0, 0];
  startRound();
}
function startPractice() {
  scene = "practice"; menu = null; clearPressed();
  AI.level = settings.level; mode = 0;
  setStage(stageIndex(settings.stage));
  resetFighters();
}
function goTitle() {
  scene = "title"; clearPressed(); resetTouch(); showControls = false;
  setStage(stageIndex(settings.stage));
  resetFighters();
  menu = titleMenu();
}

const STAGE_IDS = [...STAGES.map((s) => s.id), "random"];
const STAGE_NAMES = [...STAGES.map((s) => s.name), "Random"];
function titleMenu() {
  return makeMenu([
    { label: "FIGHT THE CPU", action: "fight" },
    { label: "PLAY ONLINE", action: "online" },
    { label: "PRACTICE", action: "practice" },
    { label: "CPU LEVEL", values: LEVEL_NAMES, index: LEVEL_NAMES.indexOf(settings.level),
      onChange: (i) => { settings.level = LEVEL_NAMES[i]; saveSettings(); } },
    { label: "STAGE", values: STAGE_NAMES, index: Math.max(0, STAGE_IDS.indexOf(settings.stage)),
      onChange: (i) => { settings.stage = STAGE_IDS[i]; saveSettings(); if (STAGE_IDS[i] !== "random") setStage(i); } },
    { label: "SOUND", action: "sound" },
    { label: "CONTROLS", action: "controls" },
  ], { kind: "title", gap: 7, bh: 36 });
}
const onlineMenu = () => makeMenu([
  { label: "HOST A GAME", action: "host" },
  { label: "JOIN A GAME", action: "join" },
  { label: "BACK", action: "title" },
], { kind: "title", gap: 7, bh: 36 });
/** Music and sound volume, opened from the title or pause menu; BACK returns there. */
function soundMenu(back) {
  const levels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  return makeMenu([
    { label: "MUSIC", values: levels, index: settings.music, onChange: (i) => { settings.music = i; setVolumes(settings.music, settings.sound); saveSettings(); } },
    { label: "SOUND EFFECTS", values: levels, index: settings.sound, onChange: (i) => { settings.sound = i; setVolumes(settings.music, settings.sound); saveSettings(); sfx("hit-light", { vol: 0.6 }); } },
    { label: "BACK", action: "back" },
  ], { kind: back.kind, back, gap: back.gap, bh: back.bh });
}
function pauseMenu() {
  const items = [
    { label: "RESUME", action: "resume" },
    { label: scene === "match" ? "RESTART MATCH" : "RESET", action: "restart" },
    { label: "SOUND", action: "sound" },
    { label: "MAIN MENU", action: "title" },
  ];
  // practice settings live here too, so they can be changed without a keyboard
  if (scene === "practice") items.splice(1, 0,
    { label: "OPPONENT", values: MODES, index: mode, onChange: (i) => { mode = i; P2.homing = false; resetAI(AI); } },
    { label: "CPU LEVEL", values: LEVEL_NAMES, index: LEVEL_NAMES.indexOf(AI.level), onChange: (i) => { AI.level = LEVEL_NAMES[i]; } },
    { label: "STAGE", values: STAGES.map((st) => st.name), index: stageI, onChange: (i) => setStage(i) });
  return makeMenu(items, { kind: "pause" });
}
function openPause() { menu = net ? netPauseMenu() : pauseMenu(); clearPressed(); resetTouch(); }
// Online the game can't stop for one player, so this menu doesn't pause.
const netPauseMenu = () => makeMenu([{ label: "RESUME", action: "resume" }, { label: "SOUND", action: "sound" }, { label: "LEAVE MATCH", action: "leave" }], { kind: "net" });
const overMenu = () => makeMenu([{ label: "REMATCH", action: net ? "again" : "fight" }, { label: "MAIN MENU", action: net ? "leave" : "title" }], { kind: "over" });

function doAction(a) {
  if (!a) return;
  if (a === "fight") startMatch();
  else if (a === "practice") startPractice();
  else if (a === "controls") showControls = true;
  else if (a === "sound") { const back = menu; menu = soundMenu(back); menu.sel = 0; }
  else if (a === "back") { const back = menu.back; back.items.forEach((it) => { if (it.label === "SOUND") back.sel = back.items.indexOf(it); }); menu = back; }
  else if (a === "resume") { menu = null; clearPressed(); }
  else if (a === "restart") { if (scene === "match") startMatch(); else startPractice(); }
  else if (a === "title") goTitle();
  else if (a === "online") menu = onlineMenu();
  else if (a === "host") startHosting();
  else if (a === "join") startJoining("");
  else if (a === "go") joinRoom();
  else if (a === "share") shareInvite();
  else if (a === "cancel" || a === "leave") leaveOnline("");
  else if (a === "again") { if (net.role === "host") startOnlineMatch(); else { net.send({ type: "again" }); notify("Asked for a rematch…"); } }
}

const paused = () => !!menu && menu.kind === "pause";

// --- hits ---
// Hit-freeze (s) by what happened; normal hits add more for heavier blows.
const FREEZE = { hit: 0.05, block: 0.05, break: 0.14, kd: 0.14, ko: 0.3 };
function landHit(att, def) {
  const hit = checkHit(att, def);
  if (!hit) return;
  const r = applyHit(def, att, hit);
  lastAttacker = att;
  const big = r.kind === "kd" || r.kind === "ko" || r.kind === "break";
  freeze = Math.max(freeze, FREEZE[r.kind] + (r.kind === "hit" ? 0.03 * r.pow : 0));
  shake = Math.max(shake, (big ? 3.4 : 2.2) * r.pow);
  if (big || r.pow >= 1.5) { zoom = Math.max(zoom, r.kind === "ko" ? 0.14 : big ? 0.08 : 0.04); zoomAt = [hit.x, hit.y]; }
  hitEffects(hit.x, hit.y, r.pow, r.kind, att.sign);
  if (sharing()) out.push(["h", Math.round(hit.x), Math.round(hit.y), r.pow, r.kind, att.sign]);
  if (r.kind === "ko") {
    koT = 0; koSlow = KO_SLOW; koFocus = def;
    if (scene === "match" && match.phase === "fight") endRound(att, "ko");
  }
}

/** The star, words, sound and scenery reaction for a hit (also replayed by the joining player online). */
function hitEffects(x, y, pow, kind, dir) {
  spawnHit(x, y, pow, kind, dir);
  hitSound({ kind, pow }, x);
  if (kind !== "block") stage.impact(x, y, kind === "ko" ? 2.4 : kind === "kd" || kind === "break" ? Math.max(1.6, pow) : pow);
}

function endRound(winner, why) {
  match.phase = "end"; match.t = 0; match.winner = winner; match.why = why;
  if (winner) match.wins[winner === P1 ? 0 : 1]++;
}

const IDLE = { dir: 0, speed: 1 };
function intents() {
  if (scene === "title" || scene === "demo" || scene === "lobby") {
    return koT >= 0 ? [IDLE, IDLE] : [aiIntent(P1, P2, AI1), aiIntent(P2, P1, AI)];
  }
  const live = scene === "practice" ? koT < 0 : match.phase === "fight";
  const i1 = live ? readP1() : IDLE;
  if (net) { const i2 = remoteIntent(); return live ? [i1, i2] : [i1, IDLE]; }
  if (!live) return [i1, IDLE];
  if (scene === "practice" && MODES[mode] !== "CPU") return [i1, dummyIntent(P2)];
  return [i1, aiIntent(P2, P1, AI)];
}

function stepMatch(dt) {
  match.t += dt;
  if (match.phase === "intro" && match.t >= 1.7) { match.phase = "fight"; match.t = 0; }
  else if (match.phase === "fight" && freeze <= 0) {
    match.timer = Math.max(0, match.timer - dt);
    if (match.timer <= 0) {
      const w = P1.hp > P2.hp ? P1 : P2.hp > P1.hp ? P2 : null;
      endRound(w, "time");
    }
  } else if (match.phase === "end") {
    // the winner celebrates once things have settled
    if (match.t > (match.why === "ko" ? 1.6 : 1.2)) celebrate(match.winner);
    if (match.t > (match.why === "ko" ? 3.6 : 3.0)) {
      if (match.wins.some((n) => n >= WINS_NEEDED)) { match.phase = "over"; match.t = 0; menu = overMenu(); clearPressed(); resetTouch(); }
      else { match.round++; startRound(); }
    }
  } else if (match.phase === "over") celebrate(match.winner);
}
function celebrate(w) {
  if (!w || w.hp <= 0 || w.move || w.air) return;
  startMove(w, "victory"); sfx("victory", { vol: 0.7, x: w.x, vary: 0 });
  if (sharing()) out.push(["v", w === P1 ? 0 : 1]);
}

// --- sounds for hits and for what the fighters do ---
function hitSound(r, x) {
  const o = (name, vol, rate = 1) => sfx(name, { vol, rate, x });
  if (r.kind === "block") o("block", 0.55);
  else if (r.kind === "break") { o("block", 0.8, 0.6); o("hit-heavy", 0.5, 1.2); duck(0.5, 0.3); }
  else if (r.kind === "ko") { o("ko", 0.95); o("hit-heavy", 0.6, 0.55); duck(0.2, 0.6); }
  else if (r.kind === "kd") { o("hit-heavy", 0.85); o("hit-heavy", 0.45, 0.6); duck(0.4, 0.35); }
  else if (r.pow >= 1.5) { o("hit-heavy", 0.75); duck(0.55, 0.25); }
  else o("hit-light", 0.45 + 0.15 * r.pow, 1.15 - 0.1 * r.pow);
}
// Whoosh pitch by attack: quick jabs swish high, the heavy kick swooshes low.
const SWING = { jab: 1.35, cross: 1.2, upper: 1.0, kick: 1.0, low: 1.1, heavy: 0.78 };
function eventSound(e, f) {
  if (e.t === "swing") {
    if (e.move.air) sfx("spin-attack", { vol: 0.45, x: e.x });
    else sfx("whiff", { vol: 0.22 + 0.08 * e.move.pow, rate: SWING[e.move.name] || 1, x: e.x });
  } else if (e.t === "step") {
    if (time.wt - (f.stepSnd || 0) > 0.16) { f.stepSnd = time.wt; sfx("footstep", { vol: 0.1 + Math.min(0.12, e.v / 2500), x: e.x, vary: 0.12 }); }
  } else if (e.t === "land" && !e.down) sfx("land", { vol: 0.2 + 0.25 * Math.min(1, e.v / 700), x: e.x });
  else if (e.t === "slam") sfx("knockdown", { vol: 0.7, x: e.x });
  else if (e.t === "roll") sfx("dodge", { vol: 0.5, x: e.x });
  else if (e.t === "jump") sfx("jump", { vol: 0.35, x: e.x });
  else if (e.t === "crouch") sfx("crouch", { vol: 0.22, x: e.x });
}

function step(dt) {
  if (net && net.role === "guest" && scene === "match") { guestStep(dt); return; }
  time.wt += dt;
  if (koT >= 0) koT += dt;
  if (scene === "match") stepMatch(dt);
  else if (koT > 3.2) resetFighters(); // practice, title, lobby, demo: just start again
  if (scene === "practice" && !menu) {
    if (take("KeyB")) setStage(stageI + 1);
    if (take("KeyT")) { mode = (mode + 1) % MODES.length; P2.homing = false; resetAI(AI); }
    LEVEL_NAMES.forEach((n, i) => { if (take("Digit" + (i + 1))) { AI.level = n; mode = MODES.indexOf("CPU"); } });
  }
  if (freeze > 0) freeze -= dt;
  else {
    time.gt += dt;
    const [i1, i2] = intents();
    updateFighter(P1, P2, dt, i1);
    updateFighter(P2, P1, dt, i2);
    resolveSpacing(P1, P2);
    finishFighter(P1, dt); finishFighter(P2, dt);
    for (const f of [P1, P2]) {
      for (const e of f.events) {
        if (e.t === "slam") { const h = toWorld(f, f.sol.head)[0], b = toWorld(f, f.sol.hip)[0]; e.x = (h + b) / 2; shake = Math.max(shake, 3); }
        fighterEvent(e, f); eventSound(e, f);
        if (sharing()) out.push(["f", f === P1 ? 0 : 1, e.move ? { ...e, move: e.move.name } : e]);
      }
      f.events.length = 0;
    }
    if (scene !== "match" || match.phase === "fight") { landHit(P1, P2); landHit(P2, P1); }
    if (koFocus && koSlow > 0) {
      // follow the falling fighter in close-up while the K.O. plays slowly
      const h = toWorld(koFocus, koFocus.sol.hip);
      zoom += (0.16 - zoom) * Math.min(1, dt * 6);
      zoomAt = [zoomAt[0] + (h[0] - zoomAt[0]) * Math.min(1, dt * 5), zoomAt[1] + (h[1] - 40 - zoomAt[1]) * Math.min(1, dt * 5)];
    } else zoom *= Math.exp(-dt * 3);
  }
  updateFx(dt); stage.update(dt); hudTick([P1, P2], dt);
  shake *= Math.exp(-dt * 10);
  camX = (Math.random() - 0.5) * 2 * shake; camY = (Math.random() - 0.5) * 2 * shake;
}

// --- online play ---
// The host's game runs the fight with the friend as P2; the friend (guest) sends what they press and
// draws the snapshots the host sends back, replaying the hits, dust and sounds listed in them.
let net = null;                                // the connection while online
const lobby = { kind: "", code: "", digits: "", status: "", tries: 0 };
const notice = { text: "", t: 0 };
const notify = (text, t = 3.5) => { notice.text = text; notice.t = t; };
let out = [];                                  // host: what happened since the last snapshot
let remote = { d: 0, c: 0, b: 0, p: "" };      // host: what the guest is pressing
let snaps = [], guestSpeed = 1, sentIn = "", sentInT = 0; // guest
const me = () => (net && net.role === "guest" ? P2 : P1);
/** Host, in a match: what happens is collected for the friend's screen. */
const sharing = () => net && net.role === "host" && scene === "match";
const inviteUrl = (code) => `${location.origin}/?join=${code}`;

function startHosting() {
  scene = "lobby"; menu = makeMenu([{ label: "SHARE INVITE LINK", action: "share" }, { label: "CANCEL", action: "cancel" }], { kind: "lobby" });
  Object.assign(lobby, { kind: "host", tries: 0 });
  openRoom();
}
function openRoom() {
  lobby.code = newCode(); lobby.status = "Connecting…";
  net = connect(lobby.code, true, onNet);
}
function startJoining(digits) {
  scene = "lobby"; menu = makeMenu([{ label: "JOIN", action: "go" }, { label: "CANCEL", action: "cancel" }], { kind: "lobby" });
  Object.assign(lobby, { kind: "join", digits, status: "Type the room code your friend sees" });
  if (digits.length === CODE_LEN) joinRoom();
}
function joinRoom() {
  if (lobby.digits.length !== CODE_LEN || net) return;
  lobby.code = lobby.digits; lobby.status = "Connecting…";
  net = connect(lobby.code, false, onNet);
}
function shareInvite() {
  const url = inviteUrl(lobby.code);
  if (navigator.share) navigator.share({ title: "KungFu 2", text: `Fight me in KungFu 2! Room ${lobby.code}`, url }).catch(() => {});
  else navigator.clipboard?.writeText(url).then(() => notify("Invite link copied"), () => notify(url, 6));
}
/** Leaves online play (or stops trying to connect) and goes back to the title, with a message. */
function leaveOnline(text) {
  if (net) { net.close(); net = null; }
  clearInterval(startOnlineMatch.ping);
  snaps = []; out = [];
  goTitle();
  if (text) notify(text, 4);
}

function onNet(type, msg) {
  const n = net;
  if (!n) return;
  if (type === "joined") lobby.status = n.role === "host" ? "Waiting for your friend to join…" : "Joined! Starting…";
  else if (type === "room_taken") { n.close(); net = null; if (++lobby.tries < 6) openRoom(); else leaveOnline("Couldn't open a room. Try again."); }
  else if (type === "no_room" || type === "room_full") {
    n.close(); net = null;
    lobby.status = type === "no_room" ? `No game is waiting with code ${lobby.code}` : `Game ${lobby.code} already has two players`;
    lobby.digits = "";
  } else if (type === "auth_failed") leaveOnline("Hosting is locked on this server");
  else if (type === "ready" && n.role === "host") startOnlineMatch();
  else if (type === "setup") { setStage(Math.max(0, STAGES.findIndex((st) => st.id === msg.stage))); startGuestMatch(); }
  else if (type === "st") { snaps.push(msg); if (snaps.length > 8) snaps.splice(0, snaps.length - 3); }
  else if (type === "in") { remote.d = msg.d; remote.c = msg.c; remote.b = msg.b; remote.p += msg.p || ""; }
  else if (type === "again" && n.role === "host" && match.phase === "over") startOnlineMatch();
  else if (type === "ping") n.send({ type: "pong", t: msg.t });
  else if (type === "pong") n.rtt = Math.round(performance.now() - msg.t);
  else if (type === "peer_left") leaveOnline("Your friend left the game");
  else if (type === "closed") leaveOnline("The connection was lost");
  else if (type === "error") { if (scene === "lobby" && n.role === "guest" && !n.open) { net = null; lobby.status = "Couldn't reach the server. Try again."; } else leaveOnline("Couldn't reach the server"); }
}

function startOnlineMatch() {
  scene = "match"; menu = null; clearPressed(); resetTouch();
  match.round = 1; match.wins = [0, 0];
  remote = { d: 0, c: 0, b: 0, p: "" };
  net.send({ type: "setup", stage: stage.id });
  startRound();
  clearInterval(startOnlineMatch.ping);
  startOnlineMatch.ping = setInterval(() => net && net.send({ type: "ping", t: performance.now() }), 2000);
}
function startGuestMatch() {
  scene = "match"; menu = null; clearPressed(); resetTouch(); snaps = [];
  resetFighters();
  Object.assign(match, { round: 1, wins: [0, 0], phase: "intro", t: 0, timer: ROUND_TIME, winner: null, why: "" });
}

/** Host: P2's intent from what the guest last sent; presses are used once. */
function remoteIntent() {
  const p = remote.p; remote.p = "";
  return { dir: remote.d, speed: 1, crouch: !!remote.c, block: !!remote.b,
    punch: p.includes("j"), kick: p.includes("k"), heavy: p.includes("l"), jump: p.includes("w"), roll: p.includes("u") };
}

function sendSnapshot(sp) {
  const w = match.winner === P1 ? 0 : match.winner === P2 ? 1 : -1;
  net.send({
    type: "st", t: Math.round(time.gt * 1000) / 1000, p: [snapFighter(P1), snapFighter(P2)],
    m: [match.phase, Math.round(match.t * 100) / 100, Math.round(match.timer * 10) / 10, match.wins, match.round, w, match.why],
    c: [Math.round(zoom * 1000) / 1000, Math.round(zoomAt[0]), Math.round(zoomAt[1]), Math.round(shake * 10) / 10],
    sp: Math.round(sp * 100) / 100, la: lastAttacker === P1 ? 0 : 1, rt: net.rtt, e: out,
  });
  out = [];
}

/** Guest: send what is pressed (when it changes, and twice a second anyway), then show the next snapshot. */
function guestStep(dt) {
  time.wt += dt;
  const it = menu ? IDLE : readP1();
  const p = (it.punch ? "j" : "") + (it.kick ? "k" : "") + (it.heavy ? "l" : "") + (it.jump ? "w" : "") + (it.roll ? "u" : "");
  const held = `${it.dir}|${it.crouch ? 1 : 0}|${it.block ? 1 : 0}`;
  sentInT -= dt;
  if (p || held !== sentIn || sentInT <= 0) { net.send({ type: "in", d: it.dir, c: it.crouch ? 1 : 0, b: it.block ? 1 : 0, p }); sentIn = held; sentInT = 0.5; }
  // keep about two snapshots in hand to smooth out network jitter; skip ahead if they pile up
  if (snaps.length > 4) snaps.splice(0, snaps.length - 2);
  const s = snaps.shift();
  if (s) {
    time.gt = s.t;
    applySnap(P1, s.p[0], dt); applySnap(P2, s.p[1], dt);
    const [ph, t, timer, wins, round, w, why] = s.m;
    Object.assign(match, { phase: ph, t, timer, wins, round, winner: w === 0 ? P1 : w === 1 ? P2 : null, why });
    [zoom, zoomAt[0], zoomAt[1], shake] = s.c;
    guestSpeed = s.sp; lastAttacker = s.la === 0 ? P1 : P2; net.rtt = s.rt;
    for (const e of s.e) {
      if (e[0] === "h") hitEffects(e[1], e[2], e[3], e[4], e[5]);
      else if (e[0] === "v") sfx("victory", { vol: 0.7, x: (e[1] ? P2 : P1).x, vary: 0 });
      else if (e[0] === "f") { const f = e[1] ? P2 : P1, ev = e[2]; if (ev.move) ev.move = MOVES[ev.move]; fighterEvent(ev, f); eventSound(ev, f); }
    }
    if (ph === "over" && !menu) { menu = overMenu(); clearPressed(); resetTouch(); }
    else if (ph !== "over" && menu && menu.kind === "over") menu = null;
  }
  updateFx(dt); stage.update(dt); hudTick([P1, P2], dt);
  camX = (Math.random() - 0.5) * 2 * shake; camY = (Math.random() - 0.5) * 2 * shake;
}

// --- lobby screens ---
const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"];
const keypadRect = (i) => ({ x: W / 2 - 105 + (i % 3) * 72, y: 214 + Math.floor(i / 3) * 52, w: 66, h: 46 });
function typeDigit(k) {
  if (net) return;
  if (k === "⌫") lobby.digits = lobby.digits.slice(0, -1);
  else if (k === "OK") joinRoom();
  else if (lobby.digits.length < CODE_LEN) { lobby.digits += k; if (lobby.digits.length === CODE_LEN) joinRoom(); }
  sfx("whiff", { vol: 0.2, rate: 1.9, vary: 0.03 });
}
function lobbyKeys() {
  for (let d = 0; d <= 9; d++) if (take("Digit" + d, "Numpad" + d)) typeDigit(String(d));
  if (take("Backspace")) typeDigit("⌫");
}
function keypadTap(x, y) {
  for (let i = 0; i < KEYPAD.length; i++) {
    const r = keypadRect(i);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) { typeDigit(KEYPAD[i]); return true; }
  }
  return false;
}
function drawLobby(g) {
  dim(g, 0.35);
  drawText(g, lobby.kind === "host" ? "HOST A GAME" : "JOIN A GAME", W / 2, 62, 40, "#ffd93b", "center", 9);
  const dots = ".".repeat(1 + Math.floor(time.wt * 2) % 3);
  if (lobby.kind === "host") {
    drawText(g, "Your room code", W / 2, 128, 18, "#fff8ec", "center", 5);
    drawText(g, net && net.open ? lobby.code : "…", W / 2, 192, 84, "#fff8ec", "center", 14);
    drawText(g, `Your friend picks PLAY ONLINE, then JOIN A GAME, and types it in.`, W / 2, 262, 15, "#fff8ec", "center", 5);
    drawText(g, `Or send them the invite link: ${inviteUrl(lobby.code).replace(/^https?:\/\//, "")}`, W / 2, 288, 15, "#fff8ec", "center", 5);
    drawText(g, lobby.status.replace("…", dots), W / 2, 334, 18, "#ffd93b", "center", 5);
    drawMenu(g, menu, W / 2, 380, time.wt);
  } else {
    for (let i = 0; i < CODE_LEN; i++) {
      const x = W / 2 + (i - (CODE_LEN - 1) / 2) * 62;
      g.fillStyle = "#1d1622"; g.beginPath(); g.roundRect(x - 27, 106, 54, 66, 10); g.fill();
      g.fillStyle = "#fff8ec"; g.beginPath(); g.roundRect(x - 24, 109, 48, 60, 8); g.fill();
      if (lobby.digits[i]) drawText(g, lobby.digits[i], x, 141, 40, "#ffd93b", "center", 8);
    }
    drawText(g, net ? lobby.status.replace("…", dots) : lobby.status, W / 2, 192, 16, "#fff8ec", "center", 5);
    KEYPAD.forEach((k, i) => {
      const r = keypadRect(i);
      g.fillStyle = "#1d1622"; g.beginPath(); g.roundRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4, 10); g.fill();
      g.fillStyle = k === "OK" ? "#ffd93b" : "#fff8ec"; g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, 8); g.fill();
      g.font = '900 20px "Arial Black", Impact, system-ui, sans-serif'; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#1d1622";
      g.fillText(k, r.x + r.w / 2, r.y + r.h / 2 + 1);
    });
    drawMenu(g, menu, W / 2 + 290, 330, time.wt);
  }
}

// --- what the HUD shows ---
function banner() {
  if (scene === "title") return null;
  if (scene === "match") {
    const m = match;
    if (m.phase === "intro") {
      const final = m.wins[0] === WINS_NEEDED - 1 && m.wins[1] === WINS_NEEDED - 1;
      return m.t < 1.05 ? { text: final ? "FINAL ROUND" : `ROUND ${m.round}`, t: m.t } : { text: "FIGHT!", t: m.t - 1.05, hot: true };
    }
    if (m.phase === "fight" && m.t < 0.45 && m.round) return { text: "FIGHT!", t: m.t + 0.65, hot: true };
    if (m.phase === "end") {
      const first = m.why === "ko" ? "K.O.!" : "TIME!";
      if (m.t < 1.5) return m.t > 0.1 ? { text: first, t: m.t - 0.1 } : null;
      const who = !m.winner ? "DRAW" : m.winner === me() ? "YOU WIN THE ROUND" : net ? "YOUR FRIEND WINS THE ROUND" : "CPU WINS THE ROUND";
      return { text: who, t: m.t - 1.5, small: true };
    }
    if (m.phase === "over") return { text: m.winner === me() ? "YOU WIN!" : "YOU LOSE", t: m.t, hot: m.winner === me() };
    return null;
  }
  return koT >= 0.15 ? { text: "K.O.!", t: koT - 0.15 } : null;
}

function render() {
  g.setTransform(scale, 0, 0, scale, 0, 0);
  g.save();
  g.translate(camX, camY);
  if (zoom > 0.002) { const z = 1 + zoom; g.translate(zoomAt[0], zoomAt[1]); g.scale(z, z); g.translate(-zoomAt[0], -zoomAt[1]); }
  stage.back(g);
  drawShadow(g, P2, stage.shadow); drawShadow(g, P1, stage.shadow);
  const order = lastAttacker === P1 ? [P2, P1] : [P1, P2];
  for (const f of order) { drawTrail(g, f.trail, TRAIL_LIFE); drawRibbons(g, f, pals.get(f)); drawFighter(g, f, pals.get(f)); }
  drawDust(g);
  for (const f of order) drawDizzy(g, f, time.wt);
  drawFx(g);
  stage.front(g);
  if (showRig) for (const f of order) drawRig(g, f);
  g.restore();
  drawFlash(g);

  if (scene === "title" || scene === "lobby") {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, "rgba(23,18,29,0.15)"); gr.addColorStop(0.5, "rgba(23,18,29,0.35)"); gr.addColorStop(1, "rgba(23,18,29,0.6)");
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    if (scene === "lobby") drawLobby(g);
    else { drawLogo(g, W / 2, 106, time.wt); drawMenu(g, menu, W / 2, 205, time.wt); }
    if (notice.t > 0) drawText(g, notice.text, W / 2, H - 16, 15, "#ffd93b", "center", 5);
    drawText(g, isMuted() ? "SOUND OFF  (M)" : "M: sound on/off", W - 14, H - 16, 12, "#fff8ec", "right", 4);
    if (showControls) drawControls(g);
    return;
  }
  drawHud(g, P1, P2, {
    scene, mode: MODES[mode], level: AI.level, stage: stage.name, slow, banner: banner(),
    timer: scene === "match" ? Math.ceil(match.timer) : null, wins: scene === "match" ? match.wins : null, touch: touch.on, muted: isMuted(),
    names: net ? (net.role === "host" ? ["YOU", "FRIEND"] : ["FRIEND", "YOU"]) : null, ping: net ? net.rtt : null,
  });
  if (notice.t > 0) drawText(g, notice.text, W / 2, 128, 18, "#ffd93b", "center", 5);
  if (menu) {
    const top = menu.kind === "pause" || menu.kind === "net" ? Math.max(150, 300 - menu.items.length * 30) : 300;
    if (menu.kind === "pause" || menu.kind === "net") { dim(g, 0.5); drawText(g, menu.kind === "net" ? "MENU" : "PAUSED", W / 2, top - 55, 44, "#ffd93b", "center", 10); }
    drawMenu(g, menu, W / 2, top, time.wt);
  } else if (!showControls && (scene === "match" || scene === "practice")) drawTouch(g);
}

// --- the loop ---
let acc = 0, last = performance.now(), errShown = false, soundToast = 0;
function frame(now) {
  requestAnimationFrame(frame); // schedule first so one bad frame can't stop the game
  try {
    let fdt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (take("KeyO")) slow = !slow;
    // M only works on the title and in menus: in a fight it sits too close to J and K
    if ((scene === "title" || menu) && take("KeyM")) { toggleMute(); soundToast = 1.6; }
    soundToast = Math.max(0, soundToast - Math.min(0.1, (now - (frame.prev || now)) / 1000));
    if (take("Backquote")) showRig = !showRig;
    if (showControls) { if (anyPressed()) showControls = false; }
    else if (menu) {
      if ((menu.kind === "pause" || menu.kind === "net") && take("Escape", "KeyP")) doAction("resume");
      else if (scene === "lobby" && lobby.kind === "join") { lobbyKeys(); menuSounds(() => menuKeys(menu)); }
      else menuSounds(() => menuKeys(menu));
    } else if ((scene === "match" || scene === "practice") && (take("Escape", "KeyP") || isPortrait())) openPause();
    if (paused()) fdt = 0;
    if (koSlow > 0 && freeze <= 0) {
      // after the impact freeze: very slow at first, easing back to full speed
      koSlow = Math.max(0, koSlow - fdt);
      const u = 1 - koSlow / KO_SLOW;
      fdt *= 0.18 + 0.82 * u * u;
    }
    let speedNow = 1;
    if (koSlow > 0 && freeze <= 0) speedNow = 0.18 + 0.82 * Math.pow(1 - koSlow / KO_SLOW, 2);
    if (net && net.role === "guest") speedNow = guestSpeed;
    notice.t -= Math.min(0.1, (now - (frame.prev || now)) / 1000);
    audioTick(Math.min(0.1, (now - (frame.prev || now)) / 1000), speedNow, scene === "title" ? "title" : paused() ? "pause" : "play");
    frame.prev = now;
    acc += slow ? fdt * 0.25 : fdt;
    while (acc >= DT) { step(DT); acc -= DT; }
    if (net && net.role === "host" && net.ready && scene === "match" && now - (frame.sent || 0) > 14) { frame.sent = now; sendSnapshot(speedNow); }
    render();
    if (soundToast > 0) {
      g.globalAlpha = Math.min(1, soundToast * 3);
      drawText(g, isMuted() ? "SOUND OFF" : "SOUND ON", W / 2, H - 70, 30, isMuted() ? "#ff8a3d" : "#ffd93b", "center", 8);
      g.globalAlpha = 1;
    }
  } catch (e) {
    acc = 0;
    if (!errShown) { errShown = true; console.error(e); }
  }
}

canvas.tabIndex = 0;
canvas.addEventListener("pointerdown", (e) => {
  canvas.focus(); window.focus();
  if (showControls) { showControls = false; return; }
  if (!menu) return;
  const r = canvas.getBoundingClientRect();
  if (scene === "lobby" && lobby.kind === "join" && keypadTap(((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H)) return;
  menuSounds(() => menuPointer(menu, ((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H));
});

/** Runs menu input, with a tick when the selection or a setting changes and a thump when something is chosen. */
function menuSounds(read) {
  const m = menu, key = () => m.sel + ":" + (m.items[m.sel].index ?? "");
  const before = key(), a = read();
  if (a) sfx("hit-light", { vol: 0.3, rate: 1.4, vary: 0.02 });
  else if (key() !== before) sfx("whiff", { vol: 0.2, rate: 1.9, vary: 0.03 });
  doAction(a);
}
// Browsers only allow sound after the first click, tap or key press.
addEventListener("pointerdown", unlock); addEventListener("keydown", unlock);
canvas.focus();
document.getElementById("nojs")?.remove();
initTouch(canvas, { active: () => !menu && !showControls && (scene === "match" || scene === "practice"), onPause: openPause });
if (/^[0-9]+$/.test(params.get("join") || "")) {
  // an invite link: join straight away, and tidy the address so a reload doesn't join an old room
  const code = params.get("join");
  try { history.replaceState(null, "", location.pathname); } catch { /* ignore */ }
  setTimeout(() => startJoining(code), 0);
}

// Where to start. ?demo: computer vs computer; ?mode=Block (or Stand, Crouch, Jump, CPU): practice; ?fight: straight into a match.
if (params.has("demo")) {
  scene = "demo";
  if (LEVEL_NAMES.includes(params.get("demo"))) AI1.level = params.get("demo");
  resetFighters();
} else if (params.has("mode")) {
  startPractice();
  mode = Math.max(0, MODES.indexOf(params.get("mode") === "Fight" ? "CPU" : params.get("mode")));
} else if (params.has("fight")) startMatch();
else goTitle();
if (params.has("stage")) setStage(stageIndex(params.get("stage")));
requestAnimationFrame(frame);

// Test hook for screenshot scripts.
window.__kf = {
  P1, P2, AI, AI1, time, step, match, reset: resetFighters, startMatch, goTitle, doAction, lobby, get net() { return net; },
  setMode: (m) => { mode = Math.max(0, MODES.indexOf(m === "Fight" ? "CPU" : m)); },
  get scene() { return scene; }, get menu() { return menu; },
};
