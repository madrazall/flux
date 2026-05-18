// ── Natal chart — your placements, never changes ──────────────────────
export const NATAL_CHART = {
  sun:       { sign: "Leo",         degree: 12.70,  house: 5 },
  moon:      { sign: "Leo",         degree: 29.85,  house: 5 },
  mercury:   { sign: "Leo",         degree: 29.23,  house: 5 },
  venus:     { sign: "Leo",         degree: 16.58,  house: 5 },
  mars:      { sign: "Cancer",      degree: 28.05,  house: 4 },
  jupiter:   { sign: "Aquarius",    degree: 12.78,  house: 11 },
  saturn:    { sign: "Scorpio",     degree: 21.85,  house: 8 },
  uranus:    { sign: "Sagittarius", degree: 14.22,  house: 9 },
  neptune:   { sign: "Capricorn",   degree: 1.37,   house: 9 },
  pluto:     { sign: "Scorpio",     degree: 1.97,   house: 8 },
  ascendant: { sign: "Taurus",      degree: 18.20,  house: 1 },
  midheaven: { sign: "Aquarius",    degree: 28.78,  house: 10 },
};

// ── Sign → absolute degree (0–360) ───────────────────────────────────
const SIGN_OFFSETS = {
  Aries: 0, Taurus: 30, Gemini: 60, Cancer: 90,
  Leo: 120, Virgo: 150, Libra: 180, Scorpio: 210,
  Sagittarius: 240, Capricorn: 270, Aquarius: 300, Pisces: 330,
};

export function signToDegree(sign, degree) {
  return (SIGN_OFFSETS[sign] ?? 0) + degree;
}

// ── Pattern rules ─────────────────────────────────────────────────────
// Each rule fires when sky conditions match; returns a message string.
export const PATTERN_RULES = [
  {
    id: "moon-conjunct-natal-mars",
    condition: (sky) => {
      const moonDeg = signToDegree(sky.moonSign, sky.moonDegree);
      const marsDeg = signToDegree("Cancer", 28.05);
      return Math.abs(moonDeg - marsDeg) <= 8;
    },
    message: "Moon conjunct your Mars: emotional drive spikes. Good for physical work, advocating for yourself, one difficult conversation. Bad for conflict with loved ones. Channel to action, not reaction.",
  },
  {
    id: "sun-approach-29-leo",
    condition: (sky) => sky.sunSign === "Leo" && sky.sunDegree >= 25,
    message: "Sun approaching your Moon/Mercury at 29° Leo: annual pressure cooker. Your mind wants resolution, your emotions want release. Don't force decisions. Let the breakthrough happen, don't manufacture it.",
  },
  {
    id: "pluto-opposite-sun-building",
    condition: (sky) => {
      const plutoDeg = signToDegree("Aquarius", sky.plutoDegree ?? 2);
      const sunDeg   = signToDegree("Leo", 12.7);
      const diff = Math.abs(plutoDeg - sunDeg);
      return diff >= 172 && diff <= 188;
    },
    message: "Pluto opposite your Sun: power structures being destroyed and rebuilt. Who are you performing for vs. who you actually are? The real you survives any job loss. The fake identity cracks.",
  },
  {
    id: "uranus-sextile-ascendant",
    condition: (sky) => {
      const uranusDeg = signToDegree("Gemini", sky.uranusDegree ?? 3);
      const ascDeg    = signToDegree("Taurus", 18.2);
      const diff = Math.abs(uranusDeg - ascDeg);
      return diff >= 52 && diff <= 68;
    },
    message: "Uranus sextile your Ascendant: unexpected income, sudden pivots, tech breakthroughs. Your personal brand shifts. Lean into weird — weird income is still income.",
  },
  {
    id: "saturn-sextile-sun",
    condition: (sky) => {
      const saturnDeg = signToDegree("Aries", sky.saturnDegree ?? 1);
      const sunDeg    = signToDegree("Leo", 12.7);
      const diff = Math.abs(saturnDeg - sunDeg);
      return diff >= 52 && diff <= 68;
    },
    message: "Saturn sextile your Sun: discipline supports creativity. Structure your self-expression. The grind pays off now. Build systems, don't wing it.",
  },
];

export function evaluateRules(sky) {
  return PATTERN_RULES.filter(r => {
    try { return r.condition(sky); }
    catch { return false; }
  });
}

// ── Sky data — append a new entry each week ───────────────────────────
// Transiting positions for outer planets are needed by pattern rules.
// plutoDegree, uranusDegree, saturnDegree = degree within their current sign.
export const SKY_DATA = [
  {
    date: "2026-05-18",
    moonSign: "Sagittarius",
    moonDegree: 22,
    moonPhase: "waningGibbous",
    sunSign: "Taurus",
    sunDegree: 26,
    plutoDegree: 2,     // Pluto in Aquarius
    uranusDegree: 3,    // Uranus in Gemini
    saturnDegree: 1,    // Saturn in Aries
    majorAspects: [
      { planet: "Moon", aspect: "trine", target: "Sun", orb: 4 },
    ],
    toNatal: {
      moonToSun:      "trine",
      moonToMars:     "conjunction",
      sunToAscendant: "conjunction",
    },
  },
];

export function getSkyForDate(dateKey) {
  const exact = SKY_DATA.find(d => d.date === dateKey);
  if (exact) return exact;
  // Fall back to most recent past entry
  const past = SKY_DATA.filter(d => d.date <= dateKey).sort((a, b) => b.date.localeCompare(a.date));
  return past[0] || null;
}

// ── Phase display helpers ─────────────────────────────────────────────
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

export function formatPhase(phase) { return PHASE_LABELS[phase] || phase; }
export function phaseSymbol(phase) { return PHASE_SYMBOLS[phase] || "🌙"; }
