// Test mode: everything lives in this browser. Open the app in two tabs to
// watch "another device" update live. No internet or accounts needed.

const chan = "BroadcastChannel" in self ? new BroadcastChannel("phase10-table") : null;
const listeners = new Set();

function key(room, coll) {
  return `p10/${room}/${coll}`;
}
function load(room, coll) {
  try {
    return JSON.parse(localStorage.getItem(key(room, coll)) || "{}");
  } catch {
    return {};
  }
}
function save(room, coll, data) {
  localStorage.setItem(key(room, coll), JSON.stringify(data));
  const msg = { room, coll };
  listeners.forEach((fn) => fn(msg));
  chan?.postMessage(msg);
}

chan?.addEventListener("message", (e) => listeners.forEach((fn) => fn(e.data)));
addEventListener("storage", (e) => {
  const m = /^p10\/([^/]+)\/(.+)$/.exec(e.key || "");
  if (m) listeners.forEach((fn) => fn({ room: m[1], coll: m[2] }));
});

export function createLocalStore() {
  let room = null;
  return {
    mode: "test",
    label: "Test mode",
    async open(code) {
      room = code;
    },
    watch(coll, cb) {
      const emit = () => cb(load(room, coll));
      const fn = (m) => m.room === room && m.coll === coll && emit();
      listeners.add(fn);
      queueMicrotask(emit);
      return () => listeners.delete(fn);
    },
    async get(coll, id) {
      return load(room, coll)[id] ?? null;
    },
    async set(coll, id, value) {
      const all = load(room, coll);
      all[id] = value;
      save(room, coll, all);
    },
    async del(coll, id) {
      const all = load(room, coll);
      delete all[id];
      save(room, coll, all);
    },
    /** Read-modify-write; return null from fn to leave the document unchanged. */
    async update(coll, id, fn) {
      const all = load(room, coll);
      const next = fn(all[id] ?? null);
      if (next == null) return false;
      all[id] = next;
      save(room, coll, all);
      return true;
    },
  };
}
