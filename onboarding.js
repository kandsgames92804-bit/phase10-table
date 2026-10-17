// Welcome (install steps), Invite (table QR) and the How it works tutorial.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function isStandalone() {
  return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

export function platform() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) return { os: "ios", safari: !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua), ipad: /iPad/.test(ua) || /Macintosh/.test(ua) };
  if (/Android/.test(ua)) return { os: "android", samsung: /SamsungBrowser/.test(ua) };
  return { os: "other" };
}

/* Android/Chrome offers its own install prompt; keep it for the Install button. */
let installPrompt = null;
export function canPromptInstall() {
  return !!installPrompt;
}
export function listenForInstall(onChange) {
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e;
    onChange();
  });
  addEventListener("appinstalled", () => {
    installPrompt = null;
    onChange();
  });
}
export async function promptInstall() {
  if (!installPrompt) return false;
  installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice;
  installPrompt = null;
  return outcome === "accepted";
}

export function appUrl() {
  return location.origin + location.pathname;
}
export function inviteUrl(code, pid) {
  return `${appUrl()}?join=${encodeURIComponent(code)}${pid ? `&me=${encodeURIComponent(pid)}` : ""}`;
}

function steps(list) {
  return `<ol class="steps">${list.map((s) => `<li>${s}</li>`).join("")}</ol>`;
}

function iosSteps(p) {
  if (!p.safari) {
    return `<p><b>Open this page in Safari to install it.</b> Other browsers on iPhone and iPad can't add it to the home screen.</p>
      <div class="row"><code class="link">${esc(appUrl())}</code><button class="btn small ghost" data-act="copy-link">Copy link</button></div>`;
  }
  return steps([
    `Tap the <b>Share</b> button ${p.ipad ? "at the top right" : "at the bottom of the screen"}. It's the square with an arrow pointing up.`,
    `Scroll down and tap <b>Add to Home Screen</b>.`,
    `Tap <b>Add</b>. A <b>Phase 10</b> icon appears on your home screen.`,
    `Open the app from that icon from now on. It runs full screen, like any other app.`,
  ]);
}

function androidSteps(p) {
  const chrome = steps([
    `Tap <b>⋮</b> at the top right of Chrome.`,
    `Tap <b>Install app</b> (or <b>Install</b>), then <b>Install</b> again. Skip "Create shortcut".`,
    `Open <b>Phase 10</b> from your home screen or app drawer.`,
  ]);
  const samsung = steps([
    `Tap <b>≡</b> at the bottom right.`,
    `Tap <b>Add page to</b>, then <b>Home screen</b>.`,
    `Open <b>Phase 10</b> from your home screen.`,
  ]);
  return `${canPromptInstall() ? `<button class="btn" data-act="install">Install app</button><p class="hint">Or do it from the browser menu:</p>` : ""}
    ${p.samsung ? `<h3 class="mini">Samsung Internet</h3>${samsung}<h3 class="mini">Chrome</h3>${chrome}` : `<h3 class="mini">Chrome</h3>${chrome}<h3 class="mini">Samsung Internet</h3>${samsung}`}`;
}

export function welcomeView({ code, view, personal }) {
  const p = platform();
  const shown = view || (p.os === "other" ? "other" : p.os);
  const tabs = [
    ["ios", "iPhone / iPad"],
    ["android", "Android / Samsung"],
    ["other", "Computer"],
  ].map(([k, l]) => `<button data-act="welcome-tab" data-k="${k}" aria-pressed="${shown === k}">${l}</button>`).join("");
  const body =
    shown === "ios" ? iosSteps(p.os === "ios" ? p : { safari: true, ipad: false })
    : shown === "android" ? androidSteps(p.os === "android" ? p : { samsung: false })
    : `<p>On a computer, just use it right here in the browser. Nothing to install.</p>`;
  return `<header class="top"><div><h1 class="brand">Phase <span>10</span> Table</h1><div class="sub">Live scores for every phone and tablet at the table</div></div>
      <div class="tools"><button class="chipbtn" data-act="help">How it works</button></div></header>
    <section class="card">
      <h2>Welcome to the table</h2>
      <p>This app shows everyone's phase and score live and lets you send your own score each hand. It takes about a minute to set up.</p>
      ${code ? `<div class="codebox"><span>Your table code</span><b class="code">${esc(code)}</b><span class="hint">You'll enter this once after installing.</span></div>` : `<p class="hint">Ask whoever runs the game for the 6-character table code.</p>`}
    </section>
    <section class="card">
      <h2>1. Add it to your home screen</h2>
      <div class="picks">${tabs}</div>
      ${body}
    </section>
    <section class="card">
      <h2>2. Join the table</h2>
      ${steps([
        `Open the app and leave <b>Cloud</b> selected.`,
        `Under <b>Join a table</b>, enter the table code${code ? ` <b class="code">${esc(code)}</b>` : ""} and tap <b>Join</b>.`,
        personal ? `Tap your game. Your personal invite already tells the app which player you are.` : `Tap your name when it asks who you are. You only do this once.`,
      ])}
      <div class="row"><button class="btn" data-act="welcome-done">${code ? "Join now in this browser" : "Continue"}</button><button class="btn ghost" data-act="help">How it works</button></div>
    </section>`;
}

const TUTORIAL = [
  ["Join the table", "Everyone at the table uses the same 6-character table code. Enter it once under <b>Join a table</b> with <b>Cloud</b> selected, and the app remembers it."],
  ["Find your game", "The <b>Games</b> list shows every game in progress and finished. Tap one to see the board: each player's phase number, what that phase needs, their score, and who deals."],
  ["Tell it who you are", "The first time you open a game, tap your name under <b>Which player are you?</b>. The app remembers it on this device. Tap <b>Not you?</b> to switch."],
  ["Send your score each hand", "When a hand ends, tap <b>Made my phase</b> or <b>Missed</b>. Then tap + for each card left in your hand (1–9 are 5 points, 10–12 are 10, Skip 15, Wild 25), or type the total. Went out? Tap <b>Went out (0)</b>. Then tap <b>Send score</b>."],
  ["The hand saves itself", "Once everyone has sent a score, the hand saves automatically: phases move up, totals update, and the deal passes left. You can tap <b>Change</b> to fix your score until the hand saves."],
  ["For the scorekeeper", "Tap <b>Scorekeeper</b> and enter the PIN to correct any score (even in past hands), enter scores for someone, undo the last hand, start new games, fix player names, and invite new players with a QR code."],
];

export function helpView(step) {
  const i = Math.max(0, Math.min(TUTORIAL.length - 1, step));
  const [title, text] = TUTORIAL[i];
  const dots = TUTORIAL.map((_, k) => `<span class="dot${k === i ? " on" : ""}"></span>`).join("");
  return `<header class="top"><div><h1 class="brand">Phase <span>10</span> Table</h1><div class="sub">How it works</div></div>
      <div class="tools"><button class="chipbtn" data-act="help-close">Close</button></div></header>
    <section class="card tut">
      <span class="stepno">Step ${i + 1} of ${TUTORIAL.length}</span>
      <h2>${title}</h2>
      <p>${text}</p>
      <div class="dots" aria-hidden="true">${dots}</div>
      <div class="row">
        <button class="btn ghost" data-act="help-step" data-d="-1" ${i === 0 ? "disabled" : ""}>Back</button>
        ${i < TUTORIAL.length - 1 ? `<button class="btn" data-act="help-step" data-d="1">Next</button>` : `<button class="btn" data-act="help-close">Got it</button>`}
      </div>
    </section>`;
}

let qrLib = null;
function loadQr() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  return (qrLib ||= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = new URL("./vendor/qrcode.js", import.meta.url).href; // qrcode-generator 1.4.4, MIT
    s.onload = () => resolve(window.qrcode);
    s.onerror = reject;
    document.head.appendChild(s);
  }));
}
export async function qrSvg(text) {
  const qrcode = await loadQr();
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
}

export function inviteView({ code, name, players, pid }) {
  const who = players.find(([id]) => id === pid);
  const chips = [`<button data-act="invite-for" data-pid="" aria-pressed="${!who}">Anyone</button>`]
    .concat(players.map(([id, p]) => `<button data-act="invite-for" data-pid="${esc(id)}" aria-pressed="${id === pid}">${esc(p.name)}</button>`)).join("");
  return `<section class="card invite">
      <h2>Invite players</h2>
      <p>Have the player scan this with their phone camera. It opens setup steps for their device with your table code filled in.</p>
      <div class="field" style="font-weight:600;font-size:14px">QR code for<div class="picks">${chips}</div></div>
      <p class="hint">${who ? `This code also sets the device up as <b>${esc(who[1].name)}</b>, so they won't be asked who they are.` : "Anyone who scans this picks their name once after joining. Pick a player above to make a personal code that skips that step."}</p>
      <div class="qr" id="invite-qr" aria-label="QR code to join ${esc(name)}">Loading QR code…</div>
      <div class="codebox"><span>Table code</span><b class="code">${esc(code)}</b></div>
      <div class="row"><code class="link">${esc(inviteUrl(code, who ? pid : ""))}</code></div>
      <div class="row"><button class="btn small ghost" data-act="copy-invite">Copy invite link</button><button class="btn small ghost" data-act="copy">Copy code</button></div>
    </section>`;
}
