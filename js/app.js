import { PRESETS, CARD_VALUES } from "./presets.js";
import * as G from "./game.js";
import { MODES, cloudReady, createStore } from "./sync/index.js";

/* ---------- helpers ---------- */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const COLORS = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6"];
const color = (i) => `var(${COLORS[i % COLORS.length]})`;
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function newCode() {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => CODE_CHARS[b % CODE_CHARS.length]).join("");
}
async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}
const pinHash = (code, pin) => sha256(`phase10:${code}:${pin}`);

const PREF_KEY = "p10prefs";
function prefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; }
}
function setPrefs(patch) {
  const p = { ...prefs(), ...patch };
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch {}
  return p;
}
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.h);
  toast.h = setTimeout(() => (t.hidden = true), 2800);
}

/* ---------- state ---------- */
const S = {
  screen: "home",
  store: null,
  mode: null,
  room: null,
  meta: null,
  players: {},
  games: {},
  entries: {},
  gameId: null,
  keeper: false,
  me: null,
  home: { tab: "join", mode: cloudReady() ? "cloud" : "test", name: "", pin: "", code: "" },
  pinOpen: false,
  pinInput: "",
  draft: null,
  edit: null,
  setup: null,
  confirm: null,
  busy: false,
};
let unsubs = [];
const pname = (pid) => S.players[pid]?.name || "Player";

/* ---------- connecting ---------- */
async function connect(mode, code) {
  const store = await createStore(mode);
  await store.open(code);
  return store;
}

async function startTable() {
  const { name, pin, mode } = S.home;
  if (!name.trim()) return toast("Give the table a name, like Kelch Family.");
  if (!/^\d{4,8}$/.test(pin)) return toast("The scorekeeper PIN needs 4 to 8 digits.");
  S.busy = true; render();
  try {
    const code = newCode();
    const store = await connect(mode, code);
    await store.set("meta", "room", { name: name.trim(), pinHash: await pinHash(code, pin), createdAt: Date.now() });
    const kp = { ...(prefs().keeper || {}), [code]: true };
    setPrefs({ mode, room: code, keeper: kp });
    await enterRoom(store, mode, code);
    toast(`Table ready. Share code ${code}.`);
  } catch (e) {
    console.error(e);
    toast(e.message || "Couldn't create the table. Check the connection.");
  } finally { S.busy = false; render(); }
}

async function joinTable(codeIn, modeIn, quiet) {
  const code = (codeIn || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 6) { if (!quiet) toast("Table codes are 6 letters and numbers."); return; }
  S.busy = true; render();
  try {
    const store = await connect(modeIn, code);
    const meta = await store.get("meta", "room");
    if (!meta) {
      if (!quiet) toast(`No table ${code} in ${modeIn === "cloud" ? "Cloud" : "Test mode"}. Check the code and mode.`);
      return;
    }
    setPrefs({ mode: modeIn, room: code });
    await enterRoom(store, modeIn, code);
  } catch (e) {
    console.error(e);
    if (!quiet) toast(e.message || "Couldn't reach the table. Check the connection.");
  } finally { S.busy = false; render(); }
}

async function enterRoom(store, mode, code) {
  unsubs.forEach((u) => u());
  Object.assign(S, { store, mode, room: code, players: {}, games: {}, entries: {}, draft: null, edit: null, confirm: null });
  const p = prefs();
  S.keeper = !!p.keeper?.[code];
  S.me = p.me?.[code] || null;
  S.screen = "games";
  unsubs = [
    store.watch("meta", (all) => { S.meta = all.room || S.meta; render(); }),
    store.watch("players", (all) => { S.players = all; render(); }),
    store.watch("games", (all) => { S.games = all; render(); autoPost(); }),
    store.watch("entries", (all) => { S.entries = all; render(); autoPost(); }),
  ];
  if (p.lastGame?.[code]) { S.gameId = p.lastGame[code]; S.screen = "game"; }
}

function leaveTable() {
  unsubs.forEach((u) => u());
  unsubs = [];
  setPrefs({ room: null });
  Object.assign(S, { screen: "home", store: null, room: null, meta: null, gameId: null, keeper: false, me: null });
  render();
}

/* ---------- auto-post: any device saves the hand once everyone is in ---------- */
let posting = false;
async function autoPost() {
  if (posting || !S.store) return;
  posting = true;
  try {
    for (const g of Object.values(S.games)) {
      if (g.status !== "playing") continue;
      const n = g.hands.length + 1;
      const ents = Object.values(S.entries).filter((e) => e.gameId === g.id && e.hand === n);
      if (ents.length < g.playerIds.length || !G.handFromEntries(g, ents)) continue;
      const saved = await S.store.update("games", g.id, (cur) => {
        if (!cur) return null;
        const h = G.handFromEntries(cur, ents);
        return h ? G.appendHand(cur, h) : null;
      });
      if (saved) toast(`Hand ${n} saved`);
      if (S.draft && S.gameId === g.id) S.draft = null;
      await Promise.all(ents.map((e) => S.store.del("entries", G.entryId(e.gameId, e.hand, e.pid)).catch(() => {})));
    }
    // Clear leftovers from hands that are already saved.
    for (const [id, e] of Object.entries(S.entries)) {
      const g = S.games[e.gameId];
      if (!g || e.hand <= g.hands.length) S.store.del("entries", id).catch(() => {});
    }
  } catch (e) {
    console.error(e);
  } finally { posting = false; }
}

/* ---------- actions ---------- */
async function sendMine() {
  const g = S.games[S.gameId];
  const d = S.draft;
  if (!g || !d || d.done == null || !S.me) return;
  const pts = draftTotal(d);
  const n = g.hands.length + 1;
  await S.store.set("entries", G.entryId(g.id, n, S.me), { gameId: g.id, hand: n, pid: S.me, pts, done: d.done, by: "player", at: Date.now() });
  S.draft = null;
  toast("Score sent");
  render();
}
function draftTotal(d) {
  if (d.out) return 0;
  if (d.typed !== "" && d.typed != null) return Math.max(0, parseInt(d.typed, 10) || 0);
  return G.cardTotal(d.counts);
}

async function saveEdit() {
  const g = S.games[S.gameId];
  const e = S.edit;
  if (!g || !e || e.done == null) return toast("Mark made or missed first.");
  const pts = Math.max(0, parseInt(e.pts, 10) || 0);
  if (e.kind === "pending") {
    const n = g.hands.length + 1;
    await S.store.set("entries", G.entryId(g.id, n, e.pid), { gameId: g.id, hand: n, pid: e.pid, pts, done: e.done, by: "keeper", at: Date.now() });
  } else {
    await S.store.update("games", g.id, (cur) => (cur ? G.correctEntry(cur, e.hand, e.pid, { pts, done: e.done }) : null));
    toast("Correction saved");
  }
  S.edit = null;
  render();
}

async function undoHand() {
  await S.store.update("games", S.gameId, (cur) => (cur ? G.undoLastHand(cur) : null));
  S.confirm = null;
  toast("Last hand removed");
  render();
}
async function deleteGame() {
  const id = S.gameId;
  await S.store.del("games", id);
  Object.entries(S.entries).forEach(([k, e]) => e.gameId === id && S.store.del("entries", k));
  S.confirm = null;
  openGames();
  toast("Game deleted");
}

async function unlockKeeper() {
  if (!S.meta) return;
  if ((await pinHash(S.room, S.pinInput)) !== S.meta.pinHash) { S.pinInput = ""; render(); return toast("That PIN doesn't match."); }
  S.keeper = true;
  S.pinOpen = false;
  S.pinInput = "";
  setPrefs({ keeper: { ...(prefs().keeper || {}), [S.room]: true } });
  toast("Scorekeeper tools on");
  render();
}
function lockKeeper() {
  S.keeper = false;
  S.edit = null;
  const kp = { ...(prefs().keeper || {}) };
  delete kp[S.room];
  setPrefs({ keeper: kp });
  render();
}

function openGame(id) {
  Object.assign(S, { gameId: id, screen: "game", draft: null, edit: null, confirm: null });
  setPrefs({ lastGame: { ...(prefs().lastGame || {}), [S.room]: id } });
  render();
  scrollTo(0, 0);
}
function openGames() {
  Object.assign(S, { gameId: null, screen: "games", draft: null, edit: null, confirm: null });
  const lg = { ...(prefs().lastGame || {}) };
  delete lg[S.room];
  setPrefs({ lastGame: lg });
  render();
}
function setMe(pid) {
  S.me = pid;
  setPrefs({ me: { ...(prefs().me || {}), [S.room]: pid } });
  S.draft = null;
  render();
}

function openSetup() {
  const last = prefs().lastSet || "classic-10";
  const set = PRESETS.find((p) => p.id === last) || PRESETS[0];
  S.setup = { groupName: "", selected: [], newName: "", setId: set.id, start: 1, end: set.phases.length };
  S.screen = "setup";
  render();
}
async function addPlayer() {
  const name = S.setup.newName.trim().slice(0, 20);
  if (!name) return;
  const existing = Object.entries(S.players).find(([, p]) => p.name.toLowerCase() === name.toLowerCase());
  const id = existing ? existing[0] : G.uid("p");
  if (!existing) await S.store.set("players", id, { name, createdAt: Date.now() });
  if (!S.setup.selected.includes(id)) S.setup.selected.push(id);
  S.setup.newName = "";
  render();
  setTimeout(() => $("#new-player")?.focus());
}
async function startGame() {
  const su = S.setup;
  const set = PRESETS.find((p) => p.id === su.setId);
  try {
    const game = G.newGame({ groupName: su.groupName, playerIds: su.selected, phaseSet: set, start: Number(su.start), end: Number(su.end) });
    await S.store.set("games", game.id, game);
    setPrefs({ lastSet: set.id });
    S.setup = null;
    openGame(game.id);
    toast("Game started");
  } catch (e) {
    toast(e.message);
  }
}

/* ---------- views ---------- */
function header() {
  if (!S.room) return `<header class="top"><div><h1 class="brand">Phase <span>10</span> Table</h1><div class="sub">Live scores for every phone and tablet at the table</div></div></header>`;
  return `<header class="top">
    <div><h1 class="brand">Phase <span>10</span> Table</h1>
      <div class="sub"><b>${esc(S.meta?.name || "Table")}</b><span>Code <span class="code">${esc(S.room)}</span></span><span>${esc(S.store?.label)}</span></div></div>
    <div class="tools">
      ${S.screen !== "games" ? `<button class="chipbtn" data-act="games">All games</button>` : ""}
      ${S.keeper ? `<button class="chipbtn on" data-act="lock" aria-pressed="true">Scorekeeper on</button>` : `<button class="chipbtn" data-act="pin">Scorekeeper</button>`}
      <button class="chipbtn" data-act="copy">Share code</button>
      <button class="chipbtn" data-act="leave">Leave</button>
    </div>
  </header>
  ${S.pinOpen ? `<form class="card" data-form="pin"><h2>Scorekeeper PIN</h2>
    <div class="row"><input id="pin-in" class="input big" style="max-width:220px" inputmode="numeric" autocomplete="off" maxlength="8" data-bind="pinInput" value="${esc(S.pinInput)}" aria-label="Scorekeeper PIN">
    <button class="btn">Unlock</button><button type="button" class="btn ghost" data-act="pin-cancel">Cancel</button></div>
    <p class="hint">The PIN turns on score corrections, undo and new games on this device.</p></form>` : ""}`;
}

function homeView() {
  const h = S.home;
  const modes = MODES.map((m) => {
    const dis = m.disabled || (m.id === "cloud" && !cloudReady());
    const note = m.id === "cloud" && !cloudReady() ? "Add the Firebase settings to turn this on." : m.note;
    return `<label class="mode${dis ? " dis" : ""}"><input type="radio" name="mode" value="${m.id}" ${h.mode === m.id ? "checked" : ""} ${dis ? "disabled" : ""} data-bind-radio="mode"><div><b>${esc(m.label)}</b><span>${esc(note)}</span></div></label>`;
  }).join("");
  return `${header()}
  <div class="grid2">
    <form class="card" data-form="join"><h2>Join a table</h2>
      <label class="field">Table code<input id="join-code" class="input big" maxlength="6" autocomplete="off" autocapitalize="characters" data-bind="home.code" value="${esc(h.code)}" placeholder="ABC123"></label>
      <button class="btn" ${S.busy ? "disabled" : ""}>Join</button>
      <p class="hint">Ask whoever started the table for the 6-character code.</p></form>
    <form class="card" data-form="start"><h2>Start a table</h2>
      <label class="field">Table name<input id="start-name" class="input" maxlength="30" data-bind="home.name" value="${esc(h.name)}" placeholder="Kelch Family"></label>
      <label class="field">Scorekeeper PIN<input id="start-pin" class="input" inputmode="numeric" maxlength="8" autocomplete="off" data-bind="home.pin" value="${esc(h.pin)}" placeholder="4 to 8 digits"></label>
      <button class="btn" ${S.busy ? "disabled" : ""}>Start table</button>
      <p class="hint">Do this once. The table keeps all your games, and everyone joins with its code.</p></form>
  </div>
  <section class="card"><h2>Connection</h2><div class="modes">${modes}</div>
    <p class="hint">Use the same connection on every device at the table.</p></section>`;
}

function gamesView() {
  const list = Object.values(S.games).sort((a, b) => (a.status === b.status ? b.updatedAt - a.updatedAt : a.status === "playing" ? -1 : 1));
  const cards = list.map((g) => {
    const d = G.derive(g);
    const end = g.startPhase + g.phases.length - 1;
    const lead = d.over ? `Winner: ${d.winnerIds.map(pname).join(" & ")}` : `Leading: ${pname(d.ranked[0].id)}, phase ${d.ranked[0].phaseNumber}`;
    return `<button class="gcard" data-act="open" data-id="${esc(g.id)}">
      <span class="pill ${d.over ? "done" : "live"}">${d.over ? "Finished" : `Hand ${d.handNumber}`}</span>
      <h3>${esc(g.groupName)}</h3>
      <span class="meta">${esc(g.phaseSetName)} · phases ${g.startPhase}–${end} · ${g.playerIds.map(pname).map(esc).join(", ")}</span>
      <span class="meta"><b>${esc(lead)}</b> · ${new Date(g.updatedAt).toLocaleDateString()}</span></button>`;
  }).join("");
  return `${header()}
    <div class="row" style="justify-content:space-between"><h2 style="font:900 30px/1 var(--display);text-transform:uppercase">Games</h2>
    ${S.keeper ? `<button class="btn" data-act="new">New game</button>` : ""}</div>
    ${cards ? `<div class="games">${cards}</div>` : `<div class="empty"><h2>No games yet</h2><p>${S.keeper ? "Tap New game to set up players and pick a phase set." : "When the scorekeeper starts a game, it shows up here. Scorekeepers tap Scorekeeper and enter the PIN."}</p></div>`}
    ${!S.keeper && cards ? `<p class="hint">Tap a game to see the board and send your score.</p>` : ""}`;
}

function setupView() {
  const su = S.setup;
  const set = PRESETS.find((p) => p.id === su.setId);
  const known = Object.entries(S.players).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const picks = known.map(([id, p]) => `<button type="button" data-act="pick" data-id="${esc(id)}" aria-pressed="${su.selected.includes(id)}">${esc(p.name)}</button>`).join("");
  const seats = su.selected.map((id, i) => `<div class="seat" style="--c:${color(i)}"><span class="dot"></span><span>${i + 1}. ${esc(pname(id))}${i === 0 ? " · deals first" : ""}</span>
    <button type="button" data-act="seat-up" data-i="${i}" aria-label="Move up" ${i ? "" : "disabled"}>↑</button>
    <button type="button" data-act="seat-x" data-i="${i}" aria-label="Remove">✕</button></div>`).join("");
  const opts = (sel) => set.phases.map((_, i) => `<option value="${i + 1}" ${Number(sel) === i + 1 ? "selected" : ""}>${i + 1}</option>`).join("");
  return `${header()}
  <section class="card"><h2>New game</h2>
    <label class="field">Group name<input id="group-name" class="input" maxlength="30" data-bind="setup.groupName" value="${esc(su.groupName)}" placeholder="Kelch Family, Sunday Crew…"></label>
    <div class="field" style="font-weight:600;font-size:14px">Players
      ${picks ? `<div class="picks">${picks}</div>` : ""}
      <form class="row" data-form="add-player"><input id="new-player" class="input" style="flex:1;min-width:160px" maxlength="20" data-bind="setup.newName" value="${esc(su.newName)}" placeholder="Add a player"><button class="btn small ghost">Add</button></form>
    </div>
    ${seats ? `<div class="seats">${seats}</div><p class="hint">Seating order. The first player deals hand 1, then the deal passes left.</p>` : `<p class="hint">Pick or add 2 to 6 players in seating order.</p>`}
  </section>
  <section class="card"><h2>Phases</h2>
    <label class="field">Phase set<select id="set-id" class="input" data-bind="setup.setId" data-rerender="1">${PRESETS.map((p) => `<option value="${p.id}" ${p.id === su.setId ? "selected" : ""}>${esc(p.name)} (${p.phases.length} phases)</option>`).join("")}</select></label>
    <div class="row"><label class="field">Start at<select id="start-at" class="input" data-bind="setup.start" data-rerender="1">${opts(su.start)}</select></label>
    <label class="field">End at<select id="end-at" class="input" data-bind="setup.end" data-rerender="1">${opts(su.end)}</select></label></div>
    <p class="hint">${Number(su.start) > Number(su.end) ? "The start phase must come before the end phase." : `This game plays ${Number(su.end) - Number(su.start) + 1} phases. First to finish phase ${su.end} wins; ties go to the lowest score.`}</p>
    <ol class="phases">${set.phases.map((p, i) => (i + 1 >= su.start && i + 1 <= su.end ? `<li><b>${i + 1}</b><span>${esc(p)}</span></li>` : "")).join("")}</ol>
  </section>
  <div class="row"><button class="btn" data-act="start-game" ${su.selected.length >= 2 && su.selected.length <= 6 && Number(su.start) <= Number(su.end) ? "" : "disabled"}>Start game</button>
    <button class="btn ghost" data-act="games">Cancel</button></div>`;
}

function gameView() {
  const g = S.games[S.gameId];
  if (!g) return `${header()}<div class="empty"><h2>Loading game…</h2><p>If this doesn't load, the game may have been deleted.</p><button class="btn ghost" data-act="games">All games</button></div>`;
  const d = G.derive(g);
  const seat = (pid) => g.playerIds.indexOf(pid);
  const last = g.hands.at(-1);
  const status = d.over
    ? `Game over after <b>${g.hands.length}</b> hands`
    : `<b>${esc(g.groupName)}</b> · Hand <b>${d.handNumber}</b> · Dealer: <b>${esc(pname(d.dealerId))}</b>`;
  const tiles = d.ranked.map((p, rank) => {
    const r = last?.results?.[p.id];
    const won = d.winnerIds.includes(p.id);
    return `<article class="tile${rank === 0 ? " lead" : ""}" style="--c:${color(seat(p.id))}">
      <div class="num"><small>Phase</small>${p.finished ? "✓" : p.phaseNumber}</div>
      <div class="name">${esc(pname(p.id))}</div>
      <div class="goal">${esc(p.phaseText)}</div>
      <div class="meta"><span>Score <b>${p.total}</b></span>
        ${won ? `<span class="pill win">Winner</span>` : ""}
        ${r && !won ? (r.done ? `<span class="pill ok">Made it last hand</span>` : `<span class="pill miss">Repeat phase</span>`) : ""}
        ${!d.over && p.id === d.dealerId ? `<span class="pill deal">Dealer</span>` : ""}</div></article>`;
  }).join("");
  const end = g.startPhase + g.phases.length - 1;
  return `${header()}
    <div class="status">${status}</div>
    ${d.over ? `<div class="banner"><h2>${esc(d.winnerIds.map(pname).join(" & "))} wins!</h2><p class="hint">${esc(g.phaseSetName)}, phases ${g.startPhase}–${end}.</p></div>` : ""}
    <section class="board" aria-label="Players">${tiles}</section>
    ${d.over ? "" : handPanel(g, d)}
    ${g.hands.length ? logView(g) : ""}
    <details class="ref"><summary>Phases in this game</summary><ol class="phases">${g.phases.map((p, i) => `<li><b>${g.startPhase + i}</b><span>${esc(p)}</span></li>`).join("")}</ol>
      <p class="hint" style="margin:0 0 14px">Points left in hand: cards 1–9 are 5, 10–12 are 10, Skip is 15, Wild is 25. Going out scores 0.</p></details>
    ${S.keeper ? keeperTools(g) : ""}`;
}

function handPanel(g, d) {
  const n = d.handNumber;
  const ents = Object.fromEntries(Object.values(S.entries).filter((e) => e.gameId === g.id && e.hand === n).map((e) => [e.pid, e]));
  const count = Object.keys(ents).length;
  const rows = g.playerIds.map((pid, i) => {
    const e = ents[pid];
    const editing = S.edit?.kind === "pending" && S.edit.pid === pid;
    const st = e ? `<b>${e.pts}</b> pts · ${e.done ? "made phase" : "missed"} · ${e.by === "player" ? "sent" : "entered by scorekeeper"}` : "Waiting…";
    return `<div class="prow" style="--c:${color(i)}"><div><strong>${esc(pname(pid))}</strong><div class="st">${st}</div></div>
      ${S.keeper && !editing ? `<button class="btn small ghost" data-act="edit-pending" data-pid="${esc(pid)}">${e ? "Correct" : "Enter"}</button>` : ""}
      ${editing ? editor() : ""}</div>`;
  }).join("");
  return `<section class="card panel"><h2>Hand ${n}</h2>
    ${myScore(g, n, ents)}
    <p class="hint">${count} of ${g.playerIds.length} scores in. The hand saves automatically when everyone has sent.</p>
    <div class="plist">${rows}</div></section>`;
}

function myScore(g, n, ents) {
  if (!S.me || !g.playerIds.includes(S.me)) {
    return `<div class="field" style="font-weight:600">Which player are you? <span class="hint">Pick once on this device to send your own score.</span>
      <div class="who">${g.playerIds.map((pid, i) => `<button style="--c:${color(i)}" data-act="me" data-pid="${esc(pid)}">${esc(pname(pid))}</button>`).join("")}</div></div>`;
  }
  const mine = ents[S.me];
  if (mine && !S.draft) {
    return `<div class="row"><span>You sent <b>${mine.pts}</b> points, ${mine.done ? "made phase" : "missed"}.</span>
      <button class="btn small ghost" data-act="change-mine">Change</button>
      <button class="btn small ghost" data-act="not-me">Not ${esc(pname(S.me))}?</button></div>`;
  }
  const dft = (S.draft ||= { counts: {}, typed: "", done: mine ? mine.done : null, out: false });
  const total = draftTotal(dft);
  const counter = CARD_VALUES.map((c) => `<div class="cnt"><div class="lbl">${esc(c.label)}<small>${c.points} pts each</small></div>
    <div class="row" style="gap:6px;flex-wrap:nowrap"><button data-act="cnt" data-k="${c.key}" data-d="-1" aria-label="One less ${esc(c.label)}">−</button>
    <output>${dft.counts[c.key] || 0}</output><button data-act="cnt" data-k="${c.key}" data-d="1" aria-label="One more ${esc(c.label)}">+</button></div></div>`).join("");
  return `<div class="card" style="background:var(--bg);padding:14px">
    <div class="row" style="justify-content:space-between"><strong>Your score, ${esc(pname(S.me))}</strong><button class="btn small ghost" data-act="not-me">Not you?</button></div>
    <div class="toggle"><button class="yes" data-act="done" data-v="1" aria-pressed="${dft.done === true && !dft.out}">Made my phase</button>
      <button class="no" data-act="done" data-v="0" aria-pressed="${dft.done === false}">Missed</button>
      <button class="out" data-act="out" aria-pressed="${dft.out}">Went out (0)</button></div>
    ${dft.out ? "" : `<p class="hint">Tap the cards left in your hand, or type the total.</p><div class="counter">${counter}</div>
      <label class="row" style="font-weight:600">Or type a total <input id="typed" class="input typed" inputmode="numeric" maxlength="3" data-bind="draft.typed" data-live="total" value="${esc(dft.typed)}" placeholder="pts"></label>`}
    <div class="row" style="justify-content:space-between"><div class="total" id="total">${total}<small>points</small></div>
      <button class="btn" data-act="send" ${dft.done == null ? "disabled" : ""}>Send score</button></div></div>`;
}

function editor() {
  const e = S.edit;
  return `<form class="editor" data-form="edit">
    <input id="edit-pts" class="input typed" inputmode="numeric" maxlength="3" data-bind="edit.pts" value="${esc(e.pts)}" aria-label="Points">
    ${CARD_VALUES.map((c) => `<button type="button" class="chipbtn" data-act="edit-add" data-n="${c.points}">+${c.points}</button>`).join("")}
    <div class="toggle"><button type="button" class="yes" data-act="edit-done" data-v="1" aria-pressed="${e.done === true}">Made</button>
    <button type="button" class="no" data-act="edit-done" data-v="0" aria-pressed="${e.done === false}">Missed</button></div>
    <button class="btn small">Save</button><button type="button" class="btn small ghost" data-act="edit-cancel">Cancel</button></form>`;
}

function logView(g) {
  const ps = g.playerIds;
  const totals = Object.fromEntries(G.derive(g).players.map((p) => [p.id, p.total]));
  const rows = g.hands.map((h, k) => {
    const cells = ps.map((pid) => {
      const r = h.results[pid];
      if (!r) return "<td>–</td>";
      const txt = `${r.pts}${r.done ? " ✓" : ""}${r.edited ? `<span class="edited" title="Corrected by scorekeeper">*</span>` : ""}`;
      return `<td class="${r.done ? "ok" : ""}">${S.keeper ? `<button data-act="fix" data-h="${k}" data-pid="${esc(pid)}" aria-label="Correct hand ${k + 1} for ${esc(pname(pid))}">${txt}</button>` : txt}</td>`;
    }).join("");
    return `<tr><td>Hand ${k + 1}</td>${cells}</tr>`;
  }).reverse().join("");
  const fixing = S.edit?.kind === "saved"
    ? `<div class="prow" style="--c:${color(ps.indexOf(S.edit.pid))};margin-bottom:12px"><div><strong>${esc(pname(S.edit.pid))}</strong><div class="st">Correcting hand ${S.edit.hand + 1}</div></div>${editor()}</div>`
    : "";
  return `<details class="ref" ${S.edit?.kind === "saved" ? "open" : ""}><summary>Hand-by-hand scores</summary>${fixing}
    <div class="logwrap"><table class="log"><thead><tr><th>Hand</th>${ps.map((pid) => `<th>${esc(pname(pid))}</th>`).join("")}</tr></thead>
    <tbody>${rows}<tr><td><b>Total</b></td>${ps.map((pid) => `<td><b>${totals[pid]}</b></td>`).join("")}</tr></tbody></table></div>
    <p class="hint" style="margin:0 0 12px">✓ made the phase that hand · * corrected by the scorekeeper${S.keeper ? " · tap a score to correct it" : ""}</p></details>`;
}

function keeperTools(g) {
  const c = S.confirm;
  return `<section class="card"><h2>Scorekeeper</h2>
    ${c ? `<div class="confirm"><span>${esc(c.msg)}</span><button class="btn danger small" data-act="confirm">${esc(c.label)}</button><button class="btn ghost small" data-act="cancel">Cancel</button></div>` : ""}
    <div class="row">${g.hands.length ? `<button class="btn ghost small" data-act="undo">Undo last hand</button>` : ""}
      <button class="btn ghost small" data-act="new">New game</button>
      <button class="btn danger small" data-act="delete">Delete this game</button></div></section>`;
}

/* ---------- render with focus kept ---------- */
function render() {
  const app = $("#app");
  const active = document.activeElement;
  const focusId = active && app.contains(active) && active.id ? active.id : null;
  const sel = focusId && "selectionStart" in active ? [active.selectionStart, active.selectionEnd] : null;
  const html = S.screen === "home" ? homeView() : S.screen === "setup" ? setupView() : S.screen === "game" ? gameView() : gamesView();
  app.innerHTML = html;
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus({ preventScroll: true });
      if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch {}
    }
  }
  wake(S.screen === "game");
}

let lock = null;
async function wake(on) {
  try {
    if (on && !lock && document.visibilityState === "visible") lock = await navigator.wakeLock?.request("screen");
    if (!on && lock) { await lock.release(); lock = null; }
  } catch {}
}
document.addEventListener("visibilitychange", () => { lock = null; wake(S.screen === "game"); });

/* ---------- events ---------- */
function setPath(path, value) {
  const keys = path.split(".");
  let o = S;
  while (keys.length > 1) o = o[keys.shift()];
  o[keys[0]] = value;
}

document.addEventListener("input", (ev) => {
  const t = ev.target;
  if (t.dataset.bind) {
    let v = t.value;
    if (t.inputMode === "numeric") { v = v.replace(/\D/g, ""); if (v !== t.value) t.value = v; }
    setPath(t.dataset.bind, v);
    if (t.dataset.live === "total") { const el = $("#total"); if (el) el.innerHTML = `${draftTotal(S.draft)}<small>points</small>`; }
    if (t.dataset.rerender) {
      if (t.id === "set-id") { const set = PRESETS.find((p) => p.id === v); S.setup.start = 1; S.setup.end = set.phases.length; }
      render();
    }
  }
  if (t.dataset.bindRadio) { S.home[t.dataset.bindRadio] = t.value; render(); }
});

document.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const f = ev.target.dataset.form;
  if (f === "join") joinTable(S.home.code, S.home.mode);
  else if (f === "start") startTable();
  else if (f === "pin") unlockKeeper();
  else if (f === "add-player") addPlayer();
  else if (f === "edit") saveEdit();
});

document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-act]");
  if (!b || b.disabled) return;
  const { act, id, pid } = b.dataset;
  const g = S.games[S.gameId];
  switch (act) {
    case "games": S.setup = null; openGames(); break;
    case "open": openGame(id); break;
    case "new": openSetup(); break;
    case "leave": leaveTable(); break;
    case "copy":
      try { await navigator.clipboard.writeText(S.room); toast(`Copied code ${S.room}`); } catch { toast(`Table code: ${S.room}`); }
      break;
    case "pin": S.pinOpen = true; render(); setTimeout(() => $("#pin-in")?.focus()); break;
    case "pin-cancel": S.pinOpen = false; S.pinInput = ""; render(); break;
    case "lock": lockKeeper(); break;
    case "me": setMe(pid); break;
    case "not-me": S.me = null; S.draft = null; render(); break;
    case "change-mine": {
      const n = g.hands.length + 1;
      const mine = S.entries[G.entryId(g.id, n, S.me)];
      S.draft = { counts: {}, typed: mine ? String(mine.pts) : "", done: mine ? mine.done : null, out: false };
      render();
      break;
    }
    case "cnt": {
      const d = S.draft;
      d.counts[b.dataset.k] = Math.max(0, (d.counts[b.dataset.k] || 0) + Number(b.dataset.d));
      d.typed = "";
      render();
      break;
    }
    case "done": S.draft.done = b.dataset.v === "1"; S.draft.out = false; render(); break;
    case "out": S.draft.out = !S.draft.out; if (S.draft.out) S.draft.done = true; render(); break;
    case "send": sendMine(); break;
    case "edit-pending": {
      const e = S.entries[G.entryId(g.id, g.hands.length + 1, pid)];
      S.edit = { kind: "pending", pid, pts: e ? String(e.pts) : "", done: e ? e.done : null };
      render();
      setTimeout(() => $("#edit-pts")?.focus());
      break;
    }
    case "fix": {
      const k = Number(b.dataset.h);
      const r = g.hands[k].results[pid];
      S.edit = { kind: "saved", hand: k, pid, pts: String(r.pts), done: r.done };
      render();
      setTimeout(() => $("#edit-pts")?.focus());
      break;
    }
    case "edit-add": S.edit.pts = String((parseInt(S.edit.pts, 10) || 0) + Number(b.dataset.n)); render(); break;
    case "edit-done": S.edit.done = b.dataset.v === "1"; render(); break;
    case "edit-cancel": S.edit = null; render(); break;
    case "pick": {
      const sel = S.setup.selected;
      const i = sel.indexOf(id);
      if (i >= 0) sel.splice(i, 1); else if (sel.length < 6) sel.push(id); else toast("Phase 10 takes up to 6 players.");
      render();
      break;
    }
    case "seat-up": { const i = Number(b.dataset.i); const s = S.setup.selected; [s[i - 1], s[i]] = [s[i], s[i - 1]]; render(); break; }
    case "seat-x": S.setup.selected.splice(Number(b.dataset.i), 1); render(); break;
    case "start-game": startGame(); break;
    case "undo": S.confirm = { msg: `Remove hand ${g.hands.length} and its scores?`, label: "Remove hand", run: undoHand }; render(); break;
    case "delete": S.confirm = { msg: `Delete ${g.groupName} for good? This can't be undone.`, label: "Delete game", run: deleteGame }; render(); break;
    case "confirm": { const c = S.confirm; S.confirm = null; c?.run(); break; }
    case "cancel": S.confirm = null; render(); break;
  }
});

/* ---------- boot ---------- */
render();
const p = prefs();
if (p.room && p.mode && (p.mode !== "cloud" || cloudReady())) joinTable(p.room, p.mode, true);
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
