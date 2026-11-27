// Keyboard state: held keys plus presses waiting to be read by the next game update.
const held = new Set();
const pressed = new Set();
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
addEventListener("blur", () => held.clear());

export const isDown = (...codes) => codes.some((c) => held.has(c));

/** True once per press of any of the given keys. */
export function take(...codes) {
  let hit = false;
  for (const c of codes) if (pressed.delete(c)) hit = true;
  return hit;
}

/** Player 1 intent: dir is world direction (-1 left, +1 right). */
export function readP1() {
  const dir = (isDown("KeyD", "ArrowRight") ? 1 : 0) - (isDown("KeyA", "ArrowLeft") ? 1 : 0);
  return { dir, speed: 1, punch: take("KeyJ") };
}
