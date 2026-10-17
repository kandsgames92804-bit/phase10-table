# Phase 10 Table

A live Phase 10 scoreboard. One table holds all of a family's games. Everyone joins with the table's 6-character code; nobody signs in. Players send their own scores (card counter or typed total), each hand saves automatically once everyone has sent, and the scorekeeper can correct any score with a PIN.

Works on iPhone, iPad and Android in the browser, and installs to the home screen like an app.

## What's in this build

- Start or join a table by code; scorekeeper PIN for corrections, undo and new games
- New game: group name, players in seating order, phase set (Classic 10, Phase 10 +10, Phase 10 +20) and phase range
- Live board: phase number and requirement, score, dealer, who made their phase last hand
- Player score sending with automatic save; scorekeeper corrections before or after a hand saves
- Every game saves after each hand; any number of games in progress; resume from the Games list
- Connection modes: **Cloud** (Firebase) and **Test mode** (this device only). Table host and Home server come later.

Coming next: custom phase builder, group rosters and stats, Android table host, home server.

## Try it on one device (Test mode)

Serve the folder with any static web server, for example `python3 -m http.server 8000`, and open `http://localhost:8000`. Choose **Test mode**, start a table, then open a second tab to see live updates. Test mode data stays in that browser.

## Turn on Cloud mode

1. In the [Firebase console](https://console.firebase.google.com), create a project, enable **Firestore Database** (production mode) and **Authentication → Anonymous**.
2. Add a **Web app** and copy its `firebaseConfig` values into `js/config.js`.
3. In **Firestore → Rules**, paste the contents of `firestore.rules` and publish.
4. In **Authentication → Settings → Authorized domains**, add your site's domain (for GitHub Pages, `yourname.github.io`).

## Publish with GitHub Pages

1. Push this folder to a public GitHub repository.
2. In the repository, open **Settings → Pages**, set the source to **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. The app goes live at `https://yourname.github.io/<repo>/`. Open that link on each device and use **Add to Home Screen** (Safari: Share menu; Chrome on Android: the ⋮ menu).

## How the pieces fit

| File | What it does |
| --- | --- |
| `js/game.js` | Game rules: phases, totals, dealer and winner, always recomputed from the hand log |
| `js/presets.js` | Built-in phase sets and card point values |
| `js/sync/` | The sync layer. Every connection mode has the same five calls: `watch`, `get`, `set`, `del`, `update` |
| `js/app.js` | Screens and actions |
| `sw.js` | Offline app shell |
| `firestore.rules` | Cloud security rules |

## Good to know

- The **table code** is what keeps other people out, so share it only with your group.
- The **PIN** keeps kids from changing scores by accident. It's a lock on the scorekeeper buttons, not bank-grade security.
- Phases, totals and the winner are recalculated from the saved hands every time, so undo and corrections can't leave the board out of sync.
