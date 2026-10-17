// Built-in phase sets. Each phase is display text; the custom phase builder
// (next build stage) will add structured parts alongside the text.

const CLASSIC = [
  "2 sets of 3",
  "1 set of 3 + 1 run of 4",
  "1 set of 4 + 1 run of 4",
  "1 run of 7",
  "1 run of 8",
  "1 run of 9",
  "2 sets of 4",
  "7 cards of 1 color",
  "1 set of 5 + 1 set of 2",
  "1 set of 5 + 1 set of 3",
];

const PLUS_10 = [
  "4 sets of 2",
  "1 set of 4 + 1 run of 5",
  "1 set of 5 + 1 run of 5",
  "1 run of 4 + 4 cards of 1 color",
  "1 run of 5 + 4 cards of 1 color",
  "1 run of 10",
  "1 set of 4 + 1 set of 5",
  "9 cards of 1 color",
  "1 set of 6 + 1 set of 2",
  "1 set of 6 + 1 set of 3",
];

// Phases 21-30: Crazy Twenties (Pagat) reordered, with two new phases (23, 26).
const PLUS_20 = [
  "3 sets of 3",
  "1 set of 7 + 1 set of 2",
  "1 set of 3 + 1 run of 7",
  "2 runs of 4, no wilds",
  "4 sets of 2, no wilds",
  "2 sets of 5",
  "8 cards of 1 color, no wilds",
  "3 sets of 3, only 3 colors you choose",
  "5 sets of 2, all one color",
  "1 run of 9, alternating two colors",
];

export const PRESETS = [
  { id: "classic-10", name: "Classic 10", builtin: true, phases: [...CLASSIC] },
  { id: "plus-10", name: "Phase 10 +10", builtin: true, phases: [...CLASSIC, ...PLUS_10] },
  { id: "plus-20", name: "Phase 10 +20", builtin: true, phases: [...CLASSIC, ...PLUS_10, ...PLUS_20] },
];

export const CARD_VALUES = [
  { key: "low", label: "1–9", points: 5 },
  { key: "high", label: "10–12", points: 10 },
  { key: "skip", label: "Skip", points: 15 },
  { key: "wild", label: "Wild", points: 25 },
];
