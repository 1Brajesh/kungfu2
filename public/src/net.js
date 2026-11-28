// Online play: one WebSocket to the relay (worker/index.js), which passes messages to the other player.
// The host's game runs the fight; the guest sends what they press and draws what the host sends back.
//
// Messages between the players (JSON):
//   in    guest → host  what the guest is pressing: d (dir -1/0/1), c (crouch), b (block), p (presses, e.g. "pk")
//   st    host → guest  a snapshot: both fighters, the match, the camera and what just happened (see main.js)
//   setup host → guest  the stage
//   again either        rematch
//   ping / pong         round-trip time

export const CODE_LEN = 3;
export const newCode = () => String(Math.floor(Math.random() * 10 ** CODE_LEN)).padStart(CODE_LEN, "0");

const relayUrl = (code, create) =>
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/${code}${create ? "?create=1" : ""}`;

/**
 * Opens a connection. on(type, msg) is called for every message, plus "open", "closed" and "error".
 * Returns { send(msg), close(), role, code }.
 */
export function connect(code, create, on) {
  const net = { code, role: create ? "host" : "guest", open: false, ready: false, rtt: 0, closedByUs: false };
  let ws;
  try { ws = new WebSocket(relayUrl(code, create)); } catch { setTimeout(() => on("error", { why: "connect" }), 0); return net; }
  ws.addEventListener("open", () => { net.open = true; on("open", {}); });
  ws.addEventListener("message", (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === "ready") net.ready = true;
    on(msg.type, msg);
  });
  ws.addEventListener("close", () => { const was = net.open; net.open = false; if (!net.closedByUs) on(was ? "closed" : "error", { why: "connect" }); });
  net.send = (msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
  net.close = () => { net.closedByUs = true; try { ws.close(); } catch { /* already closed */ } };
  return net;
}
