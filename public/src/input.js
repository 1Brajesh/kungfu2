// Keyboard state: held keys plus presses waiting to be read by the next game update.
const held = new Set();
const pressed = new Set();
const touchHeld = new Set(); // keys held by on-screen touch controls
const GAME_KEYS = new Set(["Space", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Backquote"]);

/** Physical key code, falling back to the typed character when a browser leaves `code` empty. */
function codeOf(e) {
  if (e.code && e.code !== "Unidentified") return e.code;
  const k = e.key || "";
  if (/^[a-z]$/i.test(k)) return "Key" + k.toUpperCase();
  if (k === "`") return "Backquote";
  if (k === "Esc") return "Escape";
  return k;
}

addEventListener("keydown", (e) => {
  const c = codeOf(e);
  if (GAME_KEYS.has(c)) e.preventDefault();
  if (!e.repeat) pressed.add(c);
  held.add(c);
});
addEventListener("keyup", (e) => held.delete(codeOf(e)));
addEventListener("blur", () => { held.clear(); touchHeld.clear(); });

export const isDown = (...codes) => codes.some((c) => held.has(c) || touchHeld.has(c));

/** On-screen touch controls act as keys: a press, and holding a key down. */
export function touchPress(code) { pressed.add(code); }
export function touchHold(code, on) { if (on) touchHeld.add(code); else touchHeld.delete(code); }
export function touchRelease() { touchHeld.clear(); }

/** Forgets presses nobody has read yet (when switching between menus and play). */
export function clearPressed() { pressed.clear(); }

/** True (once) if any key was pressed. */
export function anyPressed() { const had = pressed.size > 0; pressed.clear(); return had; }

/** True once per press of any of the given keys. */
export function take(...codes) {
  let hit = false;
  for (const c of codes) if (pressed.delete(c)) hit = true;
  return hit;
}

/** Player 1 intent: dir is world direction (-1 left, +1 right); presses are true once. */
export function readP1() {
  const dir = (isDown("KeyD", "ArrowRight") ? 1 : 0) - (isDown("KeyA", "ArrowLeft") ? 1 : 0);
  return {
    dir, speed: 1,
    crouch: isDown("KeyS", "ArrowDown"), block: isDown("KeyI"),
    punch: take("KeyJ"), kick: take("KeyK"), heavy: take("KeyL"), jump: take("KeyW", "ArrowUp"), roll: take("KeyU"),
  };
}
