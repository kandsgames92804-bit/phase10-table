// Pure game rules. Phases, totals, dealer and winner are always recomputed
// from the hand log, so undo, corrections and resume can never drift.

import { CARD_VALUES } from "./presets.js";

export function uid(prefix = "") {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return prefix + Array.from(a, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 12);
}

/** Create a game. `phases` is copied so later edits to a phase set never change a game in progress. */
export function newGame({ groupName, playerIds, phaseSet, start = 1, end }) {
  const last = end ?? phaseSet.phases.length;
  if (playerIds.length < 2 || playerIds.length > 6) throw new Error("Phase 10 needs 2 to 6 players.");
  if (start < 1 || last > phaseSet.phases.length || start > last) throw new Error("Pick a valid phase range.");
  const now = Date.now();
  return {
    id: uid("g"),
    groupName: (groupName || "").trim() || "Game",
    playerIds: [...playerIds],
    phaseSetId: phaseSet.id,
    phaseSetName: phaseSet.name,
    startPhase: start,
    phases: phaseSet.phases.slice(start - 1, last),
    hands: [],
    status: "playing",
    winnerIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Standings and table state derived from the hand log. */
export function derive(game) {
  const st = Object.fromEntries(game.playerIds.map((id) => [id, { id, step: 0, total: 0 }]));
  for (const hand of game.hands) {
    for (const id of game.playerIds) {
      const r = hand.results[id];
      if (!r) continue;
      st[id].total += r.pts;
      if (r.done && st[id].step < game.phases.length) st[id].step += 1;
    }
  }
  const players = game.playerIds.map((id, seat) => {
    const p = st[id];
    const finished = p.step >= game.phases.length;
    return {
      ...p,
      seat,
      finished,
      phaseNumber: finished ? null : game.startPhase + p.step,
      phaseText: finished ? "All phases done" : game.phases[p.step],
    };
  });
  const finishers = players.filter((p) => p.finished);
  let winnerIds = [];
  if (finishers.length) {
    const low = Math.min(...finishers.map((p) => p.total));
    winnerIds = finishers.filter((p) => p.total === low).map((p) => p.id);
  }
  const ranked = [...players].sort((a, b) => b.step - a.step || a.total - b.total);
  return {
    players,
    ranked,
    winnerIds,
    over: winnerIds.length > 0,
    handNumber: game.hands.length + 1,
    dealerId: game.playerIds[game.hands.length % game.playerIds.length],
  };
}

/** Keep the stored summary fields (for the games list) in step with the log. */
function settle(game) {
  const d = derive(game);
  return { ...game, status: d.over ? "finished" : "playing", winnerIds: d.winnerIds, updatedAt: Date.now() };
}

export function cleanEntry(e, by) {
  const pts = Math.max(0, Math.min(999, Math.round(Number(e.pts) || 0)));
  return { pts, done: !!e.done, by: by || e.by || "keeper" };
}

/** Build the next hand from submitted entries, or null while anyone is missing. */
export function handFromEntries(game, entries) {
  const n = game.hands.length + 1;
  const results = {};
  for (const id of game.playerIds) {
    const e = entries.find((x) => x.pid === id && x.hand === n && x.gameId === game.id);
    if (!e) return null;
    results[id] = cleanEntry(e, e.by);
  }
  return { n, results, at: Date.now() };
}

/** Append a hand only if it is still the next one (safe against double saves). */
export function appendHand(game, hand) {
  if (game.status === "finished") return null;
  if (hand.n !== game.hands.length + 1) return null;
  return settle({ ...game, hands: [...game.hands, hand] });
}

export function undoLastHand(game) {
  if (!game.hands.length) return game;
  return settle({ ...game, hands: game.hands.slice(0, -1) });
}

/** Scorekeeper correction to a saved hand. */
export function correctEntry(game, handIndex, pid, entry) {
  const hands = game.hands.map((h, i) =>
    i !== handIndex ? h : { ...h, results: { ...h.results, [pid]: { ...cleanEntry(entry, "keeper"), edited: true } } }
  );
  return settle({ ...game, hands });
}

export function cardTotal(counts) {
  return CARD_VALUES.reduce((sum, c) => sum + (Number(counts[c.key]) || 0) * c.points, 0);
}

export function entryId(gameId, hand, pid) {
  return `${gameId}~${hand}~${pid}`;
}
