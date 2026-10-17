// One sync layer, several places the data can live. Every store exposes:
//   open(roomCode), watch(collection, cb) -> unsubscribe, get, set, del,
//   update(collection, id, fn)  (read-modify-write, safe against double saves)
// The Android table host and the home server will add a WebSocket store
// with this same interface.

import { FIREBASE_CONFIG } from "../config.js";
import { createLocalStore } from "./local.js";

export const MODES = [
  { id: "cloud", label: "Cloud", note: "Syncs every device over the internet, hotspots included." },
  { id: "test", label: "Test mode", note: "This device only. Open a second tab to see live updates." },
  { id: "host", label: "Table host", note: "Off-grid play from an Android host. Coming in a later build.", disabled: true },
  { id: "home", label: "Home server", note: "Your Python box at home. Coming in a later build.", disabled: true },
];

export function cloudReady() {
  return !!(FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);
}

export async function createStore(mode) {
  if (mode === "cloud") {
    if (!cloudReady()) throw new Error("Cloud mode needs the Firebase settings in js/config.js.");
    const { createFirebaseStore } = await import("./firebase.js");
    return createFirebaseStore(FIREBASE_CONFIG);
  }
  return createLocalStore();
}
