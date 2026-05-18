// Your natal chart — hardcoded, never changes
export const NATAL_CHART = {
  sun:       { sign: "PLACEHOLDER", degree: 0 },
  moon:      { sign: "PLACEHOLDER", degree: 0 },
  mars:      { sign: "PLACEHOLDER", degree: 0 },
  ascendant: { sign: "PLACEHOLDER", degree: 0 },
};

// Sky data — append a new entry each week (or run a script)
// Shape matches the agreed data model exactly
export const SKY_DATA = [
  {
    date: "2026-05-18",
    moonSign: "Sagittarius",
    moonDegree: 22,
    moonPhase: "waningGibbous",
    sunSign: "Taurus",
    sunDegree: 26,
    majorAspects: [
      { planet: "Moon", aspect: "trine", target: "Sun", orb: 4 },
    ],
    toNatal: {
      moonToSun:       "trine",
      moonToMars:      "conjunction",
      sunToAscendant:  "conjunction",
    },
  },
];

export function getSkyForDate(dateKey) {
  return SKY_DATA.find(d => d.date === dateKey) || null;
}

const PHASE_LABELS = {
  new:            "new moon",
  waxingCrescent: "waxing crescent",
  firstQuarter:   "first quarter",
  waxingGibbous:  "waxing gibbous",
  full:           "full moon",
  waningGibbous:  "waning gibbous",
  lastQuarter:    "last quarter",
  waningCrescent: "waning crescent",
};

const PHASE_SYMBOLS = {
  new:            "🌑",
  waxingCrescent: "🌒",
  firstQuarter:   "🌓",
  waxingGibbous:  "🌔",
  full:           "🌕",
  waningGibbous:  "🌖",
  lastQuarter:    "🌗",
  waningCrescent: "🌘",
};

export function formatPhase(phase) {
  return PHASE_LABELS[phase] || phase;
}

export function phaseSymbol(phase) {
  return PHASE_SYMBOLS[phase] || "🌙";
}
