// KungFu 2 relay for online play: a Cloudflare Worker plus one Durable Object per room.
// The site's files are served straight from public/; only /ws/<code> reaches this code.
//
//   Host:  wss://<site>/ws/<CODE>?create=1   (fails with room_taken if the code is in use;
//          if the HOST_TOKEN secret is set, also needs &token=<it>, else auth_failed)
//   Join:  wss://<site>/ws/<CODE>            (fails with no_room or room_full)
//
// The room passes every message from one player to the other without reading it. It sends its own
// messages too: joined {role}, ready (both are in), peer_left, room_taken, no_room, room_full, auth_failed.
// When the host leaves, the guest is told and the room closes, so the code is free again.

function sendSafe(ws, msg) {
  if (!ws) return;
  try { ws.send(typeof msg === "string" ? msg : JSON.stringify(msg)); } catch { /* the close handler tidies up */ }
}
function closeSafe(ws, code, reason) { try { ws.close(code, reason); } catch { /* already closed */ } }

/** Accepts the socket only to say why the player can't come in. */
function reject(type, code, reason) {
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  server.send(JSON.stringify({ type }));
  server.close(code, reason);
  return new Response(null, { status: 101, webSocket: client });
}

export class Room {
  constructor(state, env) { this.env = env; this.host = null; this.guest = null; }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    const url = new URL(request.url);
    let role;
    if (url.searchParams.get("create") === "1") {
      if (this.host) return reject("room_taken", 1013, "Room code in use");
      if (this.env.HOST_TOKEN && url.searchParams.get("token") !== this.env.HOST_TOKEN) return reject("auth_failed", 1008, "Not allowed to host");
      role = "host";
    } else {
      if (!this.host) return reject("no_room", 1008, "No such room");
      if (this.guest) return reject("room_full", 1013, "Room full");
      role = "guest";
    }

    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    this[role] = server;
    server.send(JSON.stringify({ type: "joined", role }));
    if (this.host && this.guest) { sendSafe(this.host, { type: "ready" }); sendSafe(this.guest, { type: "ready" }); }

    server.addEventListener("message", (e) => sendSafe(server === this.host ? this.guest : this.host, e.data));
    const gone = () => {
      if (server === this.host) {
        this.host = null;
        const guest = this.guest; this.guest = null;
        if (guest) { sendSafe(guest, { type: "peer_left" }); closeSafe(guest, 1000, "Host left"); }
      } else if (server === this.guest) {
        this.guest = null;
        sendSafe(this.host, { type: "peer_left" });
      }
      closeSafe(server, 1000, "Bye");
    };
    server.addEventListener("close", gone);
    server.addEventListener("error", gone);
    return new Response(null, { status: 101, webSocket: client });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/ws\/([0-9A-Za-z]{1,12})$/);
    if (!m) return new Response("Not found", { status: 404 });
    const code = m[1].toUpperCase();
    return env.ROOM.get(env.ROOM.idFromName(code)).fetch(request);
  },
};
