import { useState, useEffect, useRef, useCallback } from "react";
import HelpSystem from './HelpSystem.jsx';
import { createClient } from "@supabase/supabase-js";
import {
  localDateKey,
  dateFromLocalKey,
  shouldShowLateNightPrompt,
  computeStaleEventRowIds,
  resolveSavedEvents,
  sortJournalEntries,
} from "./utils/appLogic";

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

const C = {
  bg: "#0e0e0f", surface: "#161618", card: "#1c1c1f", border: "#2a2a2e",
  accent: "#e8365d", accentDim: "#3d1220",
  text: "#f0f0f2", textMid: "#9090a0", textDim: "#50505a",
};

const TAG_PALETTE = [
  { color: "#e8365d", bg: "#3d1220" }, { color: "#6c63ff", bg: "#1e1b3d" },
  { color: "#10b981", bg: "#0d2e22" }, { color: "#f59e0b", bg: "#2d2010" },
  { color: "#38bdf8", bg: "#0c2233" }, { color: "#f472b6", bg: "#2d1020" },
  { color: "#a78bfa", bg: "#1e1533" }, { color: "#fb923c", bg: "#2d1808" },
  { color: "#34d399", bg: "#0a2318" }, { color: "#e879f9", bg: "#2a0e2e" },
];

const SEED_TAGS = [
  { id: "work",        label: "work",        ...TAG_PALETTE[0], pinned: true },
  { id: "personal",    label: "personal",    ...TAG_PALETTE[1], pinned: true },
  { id: "surviving",   label: "surviving",   ...TAG_PALETTE[2], pinned: true },
  { id: "human stuff", label: "human stuff", ...TAG_PALETTE[3], pinned: true },
];

const PROMOTE_THRESHOLD = 3;
const SNAP_MINUTES = 5;
const DEFAULT_DURATION = 30;
const PIXELS_PER_MINUTE = 1.2; // timeline density
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 23;
const TOTAL_MINUTES = (DAY_END_HOUR - DAY_START_HOUR) * 60;

const MOODS = ["🌑 crashed", "🌘 low", "🌗 okay", "🌕 good", "⭐ lit"];

const JOURNAL_TYPES = ["note", "done", "stuck", "follow_up"];
const JOURNAL_TYPE_LABELS = {
  note: "note",
  done: "done",
  stuck: "stuck",
  follow_up: "follow up",
};
const JOURNAL_PROMPTS_DAY = [
  "what happened that's worth remembering?",
  "what got stuck?",
  "what needs follow-up?",
  "what helped?",
  "what got finished?",
];
const JOURNAL_PROMPTS_EOD = [
  "what should tomorrow start with?",
  "what is still open?",
  "anything worth carrying forward?",
  "what mattered today?",
];

function genId() { return Math.random().toString(36).slice(2, 9); }
function today() { return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }); }
function todayKey() { return localDateKey(); }
function nowStamp() {
  const d = new Date();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}
function pickPrompt(pool, key, entryCount, offset) {
  if (!pool.length) return "";
  const base = hashString(`${key}:${entryCount}`);
  return pool[(base + offset) % pool.length];
}
function formatEntryTime(isoStamp) {
  if (!isoStamp) return "";
  const dt = new Date(isoStamp);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function formatEventDate(dateStr) {
  const d = dateFromLocalKey(dateStr);
  const t = new Date(); t.setHours(0,0,0,0);
  const diff = Math.round((d - t) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (diff > 0 && diff < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function isToday(dateStr) { return dateStr === todayKey(); }
function isFuture(dateStr) { return dateStr >= todayKey(); }
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeHtmlWithBreaks(value) {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

// ── Time math ─────────────────────────────────────────────────────────
function timeToMinutes(timeStr) {
  if (!timeStr) return DAY_START_HOUR * 60;
  const match = timeStr.match(/(\d+):(\d+)(am|pm)/i);
  if (!match) return DAY_START_HOUR * 60;
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const ampm = match[3].toLowerCase();
  if (ampm === 'pm' && h !== 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  return h * 60 + m;
}

function minutesToTimeStr(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const ampm = h < 12 ? "am" : "pm";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m.toString().padStart(2, "0")}${ampm}`;
}

function snapToGrid(minutes) {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
}

function minutesToPx(minutes) {
  return minutes * PIXELS_PER_MINUTE;
}

function pxToMinutes(px) {
  return px / PIXELS_PER_MINUTE;
}


// ── Column layout for overlapping blocks ──────────────────────────────
function computeColumns(blocks) {
  const sorted = [...blocks].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  const columns = [];
  const blockCols = {};

  for (const block of sorted) {
    const start = timeToMinutes(block.time);
    const end = start + (block.duration || DEFAULT_DURATION);
    let placed = false;
    for (let col = 0; col < columns.length; col++) {
      const lastEnd = columns[col];
      if (start >= lastEnd) {
        columns[col] = end;
        blockCols[block.id] = col;
        placed = true;
        break;
      }
    }
    if (!placed) {
      blockCols[block.id] = columns.length;
      columns.push(end);
    }
  }

  // figure out how many columns each block spans
  const blockWidths = {};
  for (const block of sorted) {
    const start = timeToMinutes(block.time);
    const end = start + (block.duration || DEFAULT_DURATION);
    const col = blockCols[block.id];
    let maxCol = col;
    // check what other blocks overlap with this one
    for (const other of sorted) {
      if (other.id === block.id) continue;
      const oStart = timeToMinutes(other.time);
      const oEnd = oStart + (other.duration || DEFAULT_DURATION);
      if (oStart < end && oEnd > start) {
        maxCol = Math.max(maxCol, blockCols[other.id]);
      }
    }
    blockWidths[block.id] = { col, totalCols: maxCol + 1 };
  }

  return blockWidths;
}

// ── Tag helpers ───────────────────────────────────────────────────────
function resolveTag(tagId, tags) {
  return tags.find(t => t.id === tagId) || { label: tagId, color: C.textDim, bg: C.surface };
}
function getOrCreateTag(label, tags) {
  const norm = label.trim().toLowerCase();
  const existing = tags.find(t => t.id === norm);
  if (existing) return { tag: existing, tags };
  const usedPalette = tags.filter(t => t.color && !t.uncolored).length;
  const p = TAG_PALETTE[usedPalette % TAG_PALETTE.length];
  const newTag = { id: norm, label: norm, color: p.color, bg: p.bg, uses: 1, uncolored: false };
  return { tag: newTag, tags: [...tags, newTag] };
}
function bumpTagUse(tagId, tags) {
  return tags.map(t => t.id !== tagId ? t : { ...t, uses: (t.uses || 0) + 1 });
}
function makeDefaults() {
  return [
    { id: genId(), tag: "work",        label: "morning check-in", time: "8:00am",  duration: 30,  note: "" },
    { id: genId(), tag: "personal",    label: "slow start",       time: "8:30am",  duration: 60,  note: "" },
    { id: genId(), tag: "work",        label: "deep work",        time: "10:00am", duration: 90,  note: "" },
    { id: genId(), tag: "personal",    label: "reset",            time: "12:00pm", duration: 30,  note: "" },
    { id: genId(), tag: "surviving",   label: "admin catch-up",   time: "2:00pm",  duration: 60,  note: "" },
  ];
}

// ── Pattern helpers ───────────────────────────────────────────────────
const STOP = new Set(["the","a","an","and","or","but","i","my","to","was","it","in","of","that","so","just","is","on","at","for","with","had","not","no","be","have","did","got","this","what","when","went","felt","really","very","like","time","day","today","some","more","too","been","then","also","into"]);
function topWords(text, n = 6) {
  const freq = {};
  text.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(w => w.length > 3 && !STOP.has(w)).forEach(w => { freq[w] = (freq[w] || 0) + 1; });
  return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, n);
}
function computePatterns(archive, tags) {
  const days = Object.values(archive);
  if (!days.length) return null;
  const moodData = days.slice(-14).map(d => ({ date: d.date, mood: d.mood ?? 2 }));
  const avgMood = +(moodData.reduce((s, d) => s + d.mood, 0) / moodData.length).toFixed(1);
  const byDow = {};
  days.forEach(d => {
    if (!d.key) return;
    const dow = dateFromLocalKey(d.key).toLocaleDateString("en-US", { weekday: "short" });
    if (!byDow[dow]) byDow[dow] = [];
    byDow[dow].push(d.mood ?? 2);
  });
  const dowAvg = Object.entries(byDow).map(([dow, ms]) => ({ dow, avg: ms.reduce((s, m) => s + m, 0) / ms.length })).sort((a, b) => b.avg - a.avg);
  const tagCount = {};
  days.forEach(d => (d.blocks || []).forEach(b => { if (b.tag) tagCount[b.tag] = (tagCount[b.tag] || 0) + 1; }));
  const tagDist = Object.entries(tagCount).sort((a, b) => b[1] - a[1]);
  const totalBlocks = tagDist.reduce((s, [, n]) => s + n, 0) || 1;
  let streak = 0, checkDate = new Date();
  for (let i = 0; i < 60; i++) {
    const k = localDateKey(checkDate);
    if (archive[k]) { streak++; checkDate.setDate(checkDate.getDate() - 1); }
    else if (i === 0) { checkDate.setDate(checkDate.getDate() - 1); }
    else break;
  }
  const taskDays = days.filter(d => d.tasks && d.tasks.length > 0);
  const taskCompletionRate = taskDays.length > 0
    ? Math.round(taskDays.reduce((s, d) => { const done = d.tasks.filter(t => t.done).length; return s + (done / d.tasks.length); }, 0) / taskDays.length * 100)
    : null;
  return {
    moodData, avgMood, dowAvg, tagDist, totalBlocks, streak,
    totalDays: days.length, taskCompletionRate,
    winWords: topWords(days.map(d => d.wins || "").join(" ")),
    derailWords: topWords(days.map(d => d.hard || "").join(" ")),
  };
}

// ── Print ─────────────────────────────────────────────────────────────
function printDay(day, tags) {
  const resolveT = (tagId) => tags.find(t => t.id === tagId) || { label: tagId, color: "#50505a", bg: "#161618" };
  const MOODS_PRINT = ["🌑 crashed", "🌘 low", "🌗 okay", "🌕 good", "⭐ lit"];
  const doneTasks = (day.tasks || []).filter(t => t.done);
  const pendingTasks = (day.tasks || []).filter(t => !t.done);
  const ROLLOVER_THRESHOLD = 3;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Flux - ${day.date || day.key}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=Bebas+Neue&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 5.5in; height: 8.5in; background: #fff; }
body { display: flex; flex-direction: row; font-family: 'DM Sans', sans-serif; color: #1a1a1a; overflow: hidden; }
.content { flex: 1; padding: 28px 22px 24px 26px; display: flex; flex-direction: column; }
.doodle { width: 108px; flex-shrink: 0; background: #fafafa; border-left: 1px solid #e0e0e0; position: relative; overflow: hidden; }
.doodle::before { content: ''; position: absolute; inset: 0; background-image: radial-gradient(circle, #c8c8c8 0.8px, transparent 0.8px); background-size: 10px 10px; background-position: 5px 5px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 10px; border-bottom: 2.5px solid #e8365d; margin-bottom: 14px; }
.flux-word { font-family: 'Bebas Neue', sans-serif; font-size: 20px; letter-spacing: 3px; color: #e8365d; line-height: 1; }
.sub { font-size: 7px; letter-spacing: 2px; color: #bbb; text-transform: uppercase; font-family: 'DM Mono', monospace; margin-top: 1px; }
.dow { font-family: 'Bebas Neue', sans-serif; font-size: 15px; letter-spacing: 2px; color: #1a1a1a; line-height: 1; text-align: right; }
.date-str { font-size: 9px; color: #999; margin-top: 1px; font-family: 'DM Mono', monospace; text-align: right; }
.energy-row { display: flex; align-items: center; gap: 8px; margin-bottom: 13px; }
.energy-lbl { font-size: 7px; letter-spacing: 2px; color: #aaa; text-transform: uppercase; font-family: 'DM Mono', monospace; min-width: 44px; }
.dots { display: flex; gap: 4px; }
.dot { width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid #ddd; }
.dot.on { background: #e8365d; border-color: #e8365d; }
.energy-val { font-size: 9px; color: #999; font-style: italic; }
.sec-label { font-size: 7px; letter-spacing: 2.5px; text-transform: uppercase; color: #e8365d; font-family: 'DM Mono', monospace; font-weight: 500; margin-bottom: 5px; padding-bottom: 3px; border-bottom: 1px solid #f2f2f2; }
.schedule { margin-bottom: 13px; }
.block-row { display: flex; align-items: flex-start; gap: 7px; padding: 3px 0; border-bottom: 1px solid #f8f8f8; }
.b-time { font-size: 8.5px; color: #e8365d; min-width: 42px; font-family: 'DM Mono', monospace; padding-top: 2px; flex-shrink: 0; }
.b-dur { font-size: 8px; color: #bbb; font-family: 'DM Mono', monospace; min-width: 32px; }
.b-dot { width: 6px; height: 6px; border-radius: 50%; margin-top: 4px; flex-shrink: 0; }
.b-label { font-size: 11px; color: #1a1a1a; line-height: 1.3; }
.b-tag { font-size: 8px; color: #bbb; font-family: 'DM Mono', monospace; }
.b-note { font-size: 8px; color: #aaa; font-style: italic; }
.tasks { margin-bottom: 13px; }
.task-row { display: flex; align-items: center; gap: 7px; padding: 3.5px 0; border-bottom: 1px solid #f8f8f8; }
.cb { width: 11px; height: 11px; border-radius: 2px; border: 1.5px solid #ccc; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 7px; }
.cb.done { background: #10b981; border-color: #10b981; color: #fff; }
.t-label { flex: 1; font-size: 11px; color: #1a1a1a; line-height: 1.3; }
.t-label.crossed { text-decoration: line-through; color: #bbb; }
.t-done-time { font-size: 8px; color: #ccc; font-family: 'DM Mono', monospace; flex-shrink: 0; }
.rolled { color: #e8365d; font-size: 9px; margin-left: 2px; }
.journal { margin-bottom: 10px; }
.j-content { font-size: 10.5px; color: #333; line-height: 1.6; margin-bottom: 4px; font-style: italic; }
.wline { border-bottom: 1px solid #ebebeb; height: 18px; }
.page-footer { margin-top: auto; padding-top: 10px; border-top: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
.f-flux { font-family: 'Bebas Neue', sans-serif; letter-spacing: 2px; color: #ddd; font-size: 11px; }
.f-id { font-size: 8px; color: #ccc; font-family: 'DM Mono', monospace; }
.f-note { font-size: 8px; color: #ccc; font-family: 'DM Mono', monospace; }
.corner-geo { position: absolute; bottom: 0; right: 0; width: 90px; height: 90px; }
@media print { html, body { width: 5.5in; height: 8.5in; } @page { size: 5.5in 8.5in; margin: 0; } }
</style>
</head>
<body>
<div class="content">
  <div class="page-header">
    <div><div class="flux-word">FLUX</div><div class="sub">daily log</div></div>
    <div>
      <div class="dow">${dateFromLocalKey(day.key || todayKey()).toLocaleDateString("en-US", { weekday: "long" })}</div>
      <div class="date-str">${escapeHtml(day.date || day.key)}</div>
    </div>
  </div>
  <div class="energy-row">
    <div class="energy-lbl">Energy</div>
    <div class="dots">${[0,1,2,3,4].map(i => `<div class="dot${i <= (day.mood ?? 2) ? " on" : ""}"></div>`).join("")}</div>
    <div class="energy-val">${MOODS_PRINT[day.mood ?? 2]}</div>
  </div>
  <div class="schedule">
    <div class="sec-label">Schedule</div>
    ${(day.blocks || []).sort((a,b) => timeToMinutes(a.time) - timeToMinutes(b.time)).map(b => {
      const t = resolveT(b.tag);
      const dur = b.duration || DEFAULT_DURATION;
      const durStr = dur >= 60 ? `${Math.floor(dur/60)}h${dur%60 ? dur%60+"m" : ""}` : `${dur}m`;
      return `<div class="block-row">
        <div class="b-time">${escapeHtml(b.time)}</div>
        <div class="b-dur">${escapeHtml(durStr)}</div>
        <div class="b-dot" style="background:${t.color}"></div>
        <div>
          <div class="b-label">${escapeHtml(b.label)}</div>
          <div class="b-tag">${escapeHtml(t.label)}</div>
          ${b.note ? `<div class="b-note">${escapeHtmlWithBreaks(b.note)}</div>` : ""}
        </div>
      </div>`;
    }).join("")}
  </div>
  ${(day.tasks || []).length > 0 ? `
  <div class="tasks">
    <div class="sec-label">Tasks</div>
    ${doneTasks.map(t => `<div class="task-row"><div class="cb done">✓</div><div class="t-label crossed">${escapeHtml(t.label)}</div><div class="t-done-time">${escapeHtml(t.doneAt || "")}</div></div>`).join("")}
    ${pendingTasks.map(t => {
      const rolledCount = (t.addedAt || "").split("(rolled)").length - 1;
      return `<div class="task-row"><div class="cb"></div><div class="t-label">${escapeHtml(t.label)}${rolledCount >= ROLLOVER_THRESHOLD ? '<span class="rolled">*</span>' : ""}</div></div>`;
    }).join("")}
  </div>` : ""}
  ${day.wins ? `<div class="journal"><div class="sec-label">Wins</div><div class="j-content">${escapeHtmlWithBreaks(day.wins)}</div><div class="wline"></div><div class="wline"></div></div>` : `<div class="journal"><div class="sec-label">Wins</div><div class="wline"></div><div class="wline"></div><div class="wline"></div></div>`}
  ${day.hard ? `<div class="journal"><div class="sec-label">Hard stuff</div><div class="j-content">${escapeHtmlWithBreaks(day.hard)}</div><div class="wline"></div><div class="wline"></div></div>` : `<div class="journal"><div class="sec-label">Hard stuff</div><div class="wline"></div><div class="wline"></div><div class="wline"></div></div>`}
  <div class="page-footer">
    <div class="f-flux">FLUX</div>
    <div class="f-note">* rolled 3+ days</div>
    <div class="f-id">${escapeHtml(day.key || "")}</div>
  </div>
</div>
<div class="doodle">
  <svg class="corner-geo" viewBox="0 0 90 90" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="58" cy="62" r="18" stroke="#e8365d" stroke-width="1.2" opacity="0.35"/>
    <polygon points="30,82 52,82 41,62" stroke="#e8365d" stroke-width="1.2" fill="none" opacity="0.3"/>
    <rect x="60" y="40" width="16" height="16" stroke="#e8365d" stroke-width="1.2" fill="none" opacity="0.25"/>
    <circle cx="32" cy="58" r="4" stroke="#e8365d" stroke-width="1.2" fill="none" opacity="0.3"/>
    <line x1="20" y1="88" x2="88" y2="88" stroke="#e8365d" stroke-width="1" opacity="0.2"/>
    <line x1="88" y1="20" x2="88" y2="88" stroke="#e8365d" stroke-width="1" opacity="0.2"/>
  </svg>
</div>
<script>window.onload = () => window.print();</script>
</body>
</html>`;
  const w = window.open("", "_blank");
  w.document.write(html);
  w.document.close();
}

// ── Mini components ───────────────────────────────────────────────────
function MiniBar({ label, value, max, color, sub }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: C.text }}>{label}</span>
        <span style={{ fontSize: 11, color: C.textDim }}>{sub}</span>
      </div>
      <div style={{ height: 3, background: C.border, borderRadius: 2 }}>
        <div style={{ height: 3, width: `${pct}%`, background: color, borderRadius: 2, transition: "width .6s ease" }} />
      </div>
    </div>
  );
}
function Sparkline({ data }) {
  if (!data || data.length < 2) return null;
  const W = 280, H = 44, P = 4;
  const pts = data.map((d, i) => {
    const x = P + (i / (data.length - 1)) * (W - P * 2);
    const y = H - P - ((d.mood / 4) * (H - P * 2));
    return `${x},${y}`;
  }).join(" ");
  const last = data[data.length - 1];
  const lx = W - P, ly = H - P - ((last.mood / 4) * (H - P * 2));
  return (
    <svg width={W} height={H} style={{ overflow: "visible" }}>
      <polyline points={pts} fill="none" stroke={C.accent} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="3" fill={C.accent} />
    </svg>
  );
}
function TagPill({ tag, small, onClick }) {
  return (
    <span onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: small ? "2px 7px" : "3px 9px", borderRadius: 3, fontSize: small ? 10 : 11, background: tag.bg || C.surface, border: `1px solid ${tag.color || C.border}40`, color: tag.color || C.textDim, cursor: onClick ? "pointer" : "default", userSelect: "none", whiteSpace: "nowrap" }}>{tag.label}</span>
  );
}
function TagSelector({ tags, value, onChange, onCreateTag }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const ref = useRef();
  const current = tags.find(t => t.id === value);
  const filtered = input.trim() ? tags.filter(t => t.label.includes(input.toLowerCase())) : tags;
  const canCreate = input.trim() && !tags.find(t => t.id === input.trim().toLowerCase());
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  function select(tag) { onChange(tag.id); setOpen(false); setInput(""); }
  function create() {
    if (!input.trim()) return;
    const { tag, tags: newTags } = getOrCreateTag(input, tags);
    onCreateTag(newTags); onChange(tag.id); setOpen(false); setInput("");
  }
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <div onClick={() => setOpen(!open)} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
        {current ? <TagPill tag={current} small /> : <span style={{ fontSize: 11, color: C.textDim, padding: "2px 8px", border: `1px dashed ${C.border}`, borderRadius: 3 }}>tag</span>}
        <span style={{ fontSize: 9, color: C.textDim }}>▾</span>
      </div>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, minWidth: 170, boxShadow: "0 8px 24px #00000060", padding: "8px 0" }}>
          <input autoFocus placeholder="search or create..." value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") canCreate ? create() : filtered[0] && select(filtered[0]); if (e.key === "Escape") setOpen(false); }}
            style={{ width: "100%", background: C.surface, border: "none", borderBottom: `1px solid ${C.border}`, color: C.text, fontSize: 12, padding: "7px 12px", outline: "none" }} />
          <div style={{ maxHeight: 160, overflowY: "auto", padding: "4px 0" }}>
            {filtered.map(t => (
              <div key={t.id} onClick={() => select(t)} style={{ padding: "7px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, background: value === t.id ? C.surface : "none" }}
                onMouseEnter={e => e.currentTarget.style.background = C.surface}
                onMouseLeave={e => e.currentTarget.style.background = value === t.id ? C.surface : "none"}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: C.text }}>{t.label}</span>
                {t.uses >= PROMOTE_THRESHOLD && <span style={{ fontSize: 9, color: C.textDim, marginLeft: "auto" }}>★</span>}
              </div>
            ))}
            {canCreate && (
              <div onClick={create} style={{ padding: "7px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, borderTop: `1px solid ${C.border}` }}
                onMouseEnter={e => e.currentTarget.style.background = C.surface}
                onMouseLeave={e => e.currentTarget.style.background = "none"}>
                <span style={{ fontSize: 11, color: C.accent }}>+ create</span>
                <span style={{ fontSize: 12, color: C.textMid }}>"{input.trim()}"</span>
              </div>
            )}
            {filtered.length === 0 && !canCreate && <div style={{ padding: "10px 12px", fontSize: 12, color: C.textDim }}>no matches</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Visual Timeline ───────────────────────────────────────────────────
function VisualTimeline({ blocks, onBlocksChange, tags, onPersistTags }) {
  const timelineRef = useRef(null);
  const [draggingId, setDraggingId] = useState(null);
  const [resizingId, setResizingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [addingAt, setAddingAt] = useState(null); // minutes offset where user clicked
  const [newLabel, setNewLabel] = useState("");
  const [newTag, setNewTag] = useState("work");
  const dragStartY = useRef(0);
  const dragStartMinutes = useRef(0);
  const resizeStartY = useRef(0);
  const resizeStartDuration = useRef(0);

  const timelineHeight = minutesToPx(TOTAL_MINUTES);
  const colLayout = computeColumns(blocks);

  // hour markers
  const hourMarkers = [];
  for (let h = DAY_START_HOUR; h <= DAY_END_HOUR; h++) {
    const mins = (h - DAY_START_HOUR) * 60;
    hourMarkers.push({ mins, label: minutesToTimeStr(h * 60) });
  }

  function getRelativeY(e) {
    const rect = timelineRef.current.getBoundingClientRect();
    return (e.clientY || e.touches?.[0]?.clientY || 0) - rect.top;
  }

  // ── Drag block to move ──
  function onBlockMouseDown(e, blockId) {
    if (e.target.dataset.resize || e.target.dataset.edit) return;
    e.preventDefault();
    const block = blocks.find(b => b.id === blockId);
    dragStartY.current = e.clientY;
    dragStartMinutes.current = timeToMinutes(block.time);
    setDraggingId(blockId);

    function onMove(ev) {
      const dy = ev.clientY - dragStartY.current;
      const deltaMinutes = pxToMinutes(dy);
      let newStart = snapToGrid(dragStartMinutes.current + deltaMinutes);
      newStart = Math.max(DAY_START_HOUR * 60, Math.min((DAY_END_HOUR * 60) - (block.duration || DEFAULT_DURATION), newStart));
      onBlocksChange(blocks.map(b => b.id === blockId ? { ...b, time: minutesToTimeStr(newStart) } : b));
    }
    function onUp() {
      setDraggingId(null);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ── Drag bottom edge to resize ──
  function onResizeMouseDown(e, blockId) {
    e.preventDefault();
    e.stopPropagation();
    const block = blocks.find(b => b.id === blockId);
    resizeStartY.current = e.clientY;
    resizeStartDuration.current = block.duration || DEFAULT_DURATION;
    setResizingId(blockId);

    function onMove(ev) {
      const dy = ev.clientY - resizeStartY.current;
      const deltaMins = pxToMinutes(dy);
      const newDur = Math.max(SNAP_MINUTES, snapToGrid(resizeStartDuration.current + deltaMins));
      onBlocksChange(blocks.map(b => b.id === blockId ? { ...b, duration: newDur } : b));
    }
    function onUp() {
      setResizingId(null);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ── Click empty space to add ──
  function onTimelineClick(e) {
    if (draggingId || resizingId) return;
    if (e.target !== timelineRef.current && !e.target.classList.contains("tl-bg")) return;
    const y = getRelativeY(e);
    const mins = snapToGrid(DAY_START_HOUR * 60 + pxToMinutes(y));
    setAddingAt(mins);
    setNewLabel("");
    setNewTag("work");
  }

  function addBlock() {
    if (!newLabel.trim()) return;
    const newBlock = {
      id: genId(), tag: newTag, label: newLabel.trim(),
      time: minutesToTimeStr(addingAt), duration: DEFAULT_DURATION, note: ""
    };
    onBlocksChange([...blocks, newBlock]);
    setAddingAt(null); setNewLabel("");
  }

  // ── Edit ──
  function startEdit(block) {
    setEditingId(block.id);
    setEditValues({ label: block.label, tag: block.tag, duration: block.duration || DEFAULT_DURATION, note: block.note || "" });
  }
  function saveEdit(blockId) {
    onBlocksChange(blocks.map(b => b.id === blockId ? { ...b, ...editValues } : b));
    setEditingId(null);
  }

  function formatDuration(mins) {
    if (mins < 60) return `${mins}m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", fontSize: 11, color: C.textDim, marginBottom: 8, gap: 16 }}>
        <span>click empty space to add a block</span>
        <span>drag to move · drag bottom edge to resize</span>
      </div>

      <div style={{ display: "flex", gap: 0 }}>
        {/* Hour labels column */}
        <div style={{ width: 52, flexShrink: 0, position: "relative", height: timelineHeight }}>
          {hourMarkers.map(({ mins, label }) => (
            <div key={mins} style={{ position: "absolute", top: minutesToPx(mins), right: 8, fontSize: 9, color: C.textDim, lineHeight: 1, transform: "translateY(-50%)", whiteSpace: "nowrap" }}>
              {label}
            </div>
          ))}
        </div>

        {/* Timeline body */}
        <div style={{ flex: 1, position: "relative", borderLeft: `1px solid ${C.border}` }}>
          {/* Background grid */}
          <div
            ref={timelineRef}
            className="tl-bg"
            onClick={onTimelineClick}
            style={{ position: "absolute", inset: 0, height: timelineHeight, cursor: "crosshair" }}
          >
            {hourMarkers.map(({ mins }) => (
              <div key={mins} style={{ position: "absolute", top: minutesToPx(mins), left: 0, right: 0, borderTop: `1px solid ${C.border}30`, pointerEvents: "none" }} />
            ))}
            {/* Half-hour lines */}
            {hourMarkers.slice(0, -1).map(({ mins }) => (
              <div key={`h${mins}`} style={{ position: "absolute", top: minutesToPx(mins + 30), left: 0, right: 0, borderTop: `1px dashed ${C.border}20`, pointerEvents: "none" }} />
            ))}
          </div>

          {/* Blocks */}
          <div style={{ position: "relative", height: timelineHeight, pointerEvents: "none" }}>
            {blocks.map(block => {
              const tag = resolveTag(block.tag, tags);
              const startMins = timeToMinutes(block.time);
              const duration = block.duration || DEFAULT_DURATION;
              const top = minutesToPx(startMins - DAY_START_HOUR * 60);
              const height = Math.max(minutesToPx(duration), 24);
              const layout = colLayout[block.id] || { col: 0, totalCols: 1 };
              const colWidth = 100 / layout.totalCols;
              const left = `${layout.col * colWidth}%`;
              const width = `${colWidth - 1}%`;
              const isDragging = draggingId === block.id;
              const isResizing = resizingId === block.id;
              const isEditing = editingId === block.id;

              return (
                <div key={block.id} style={{ pointerEvents: "auto" }}>
                  <div
                    onMouseDown={e => onBlockMouseDown(e, block.id)}
                    style={{
                      position: "absolute", top, left, width, height,
                      background: isDragging || isResizing ? tag.bg : C.card,
                      border: `1px solid ${isDragging || isResizing ? tag.color : C.border}`,
                      borderLeft: `3px solid ${tag.color}`,
                      borderRadius: 4,
                      cursor: isDragging ? "grabbing" : "grab",
                      opacity: isDragging ? 0.85 : 1,
                      zIndex: isDragging || isResizing ? 20 : 1,
                      boxShadow: isDragging ? `0 4px 16px ${tag.color}40` : "none",
                      transition: isDragging || isResizing ? "none" : "box-shadow .15s",
                      overflow: "visible",
                      userSelect: "none",
                    }}
                  >
                    {/* Block content */}
                    <div style={{ padding: "4px 6px 4px 7px", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 4, flex: 1, overflow: "hidden" }}>
                        <div style={{ flex: 1, overflow: "hidden" }}>
                          <div style={{ fontSize: 11, color: C.text, fontWeight: 500, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: height < 40 ? "nowrap" : "normal" }}>{block.label}</div>
                          {height > 36 && <div style={{ fontSize: 9, color: tag.color, opacity: .8, marginTop: 1 }}>{tag.label} · {formatDuration(duration)}</div>}
                          {block.note && height > 52 && <div style={{ fontSize: 9, color: C.textDim, fontStyle: "italic", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{block.note}</div>}
                        </div>
                        {/* Edit button */}
                        <button
                          data-edit="true"
                          onClick={e => { e.stopPropagation(); startEdit(block); }}
                          style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 3, cursor: "pointer", color: C.textDim, fontSize: 9, padding: "1px 4px", flexShrink: 0, lineHeight: 1.4, pointerEvents: "auto" }}
                          title="edit"
                        >✎</button>
                        {/* Delete button */}
                        <button
                          data-edit="true"
                          onClick={e => { e.stopPropagation(); onBlocksChange(blocks.filter(b => b.id !== block.id)); }}
                          style={{ background: "none", border: "none", borderRadius: 3, cursor: "pointer", color: C.textDim, fontSize: 10, padding: "1px 3px", flexShrink: 0, lineHeight: 1.4, pointerEvents: "auto" }}
                          title="remove"
                        >✕</button>
                      </div>
                      {/* Time label at bottom if tall enough */}
                      {height > 48 && (
                        <div style={{ fontSize: 8, color: C.textDim, fontFamily: "monospace", marginTop: "auto" }}>
                          {block.time} – {minutesToTimeStr(startMins + duration)}
                        </div>
                      )}
                    </div>

                    {/* Resize handle */}
                    <div
                      data-resize="true"
                      onMouseDown={e => onResizeMouseDown(e, block.id)}
                      style={{
                        position: "absolute", bottom: 0, left: 0, right: 0, height: 8,
                        cursor: "ns-resize", display: "flex", alignItems: "center", justifyContent: "center",
                        background: "transparent", borderRadius: "0 0 4px 4px",
                        pointerEvents: "auto",
                      }}
                    >
                      <div style={{ width: 24, height: 2, background: tag.color, opacity: .4, borderRadius: 1 }} />
                    </div>
                  </div>

                  {/* Edit panel */}
                  {isEditing && (
                    <div style={{
                      position: "absolute", top, left: "calc(100% + 8px)",
                      width: 240, zIndex: 100,
                      background: C.card, border: `1px solid ${C.accent}40`,
                      borderRadius: 6, padding: 12,
                      boxShadow: "0 8px 24px #00000080",
                      pointerEvents: "auto",
                    }}>
                      <div style={{ fontSize: 9, color: C.accent, letterSpacing: 1, marginBottom: 10 }}>EDIT BLOCK</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <input autoFocus value={editValues.label} onChange={e => setEditValues({ ...editValues, label: e.target.value })}
                          onKeyDown={e => e.key === "Enter" && saveEdit(block.id)}
                          placeholder="label..." style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: "6px 8px", fontSize: 12, outline: "none", width: "100%" }} />
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 10, color: C.textDim }}>tag:</span>
                          <TagSelector tags={tags} value={editValues.tag} onChange={v => setEditValues({ ...editValues, tag: v })} onCreateTag={onPersistTags} />
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 10, color: C.textDim }}>duration:</span>
                          <input type="number" value={editValues.duration} min={SNAP_MINUTES} step={SNAP_MINUTES}
                            onChange={e => setEditValues({ ...editValues, duration: Math.max(SNAP_MINUTES, parseInt(e.target.value) || DEFAULT_DURATION) })}
                            style={{ width: 64, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: "5px 7px", fontSize: 12, outline: "none" }} />
                          <span style={{ fontSize: 10, color: C.textDim }}>min</span>
                        </div>
                        <textarea value={editValues.note} onChange={e => setEditValues({ ...editValues, note: e.target.value })}
                          placeholder="note (optional)..." rows={2}
                          style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: "6px 8px", fontSize: 11, outline: "none", resize: "none", lineHeight: 1.5 }} />
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => saveEdit(block.id)} style={{ flex: 1, background: C.accent, border: "none", color: "#fff", borderRadius: 4, padding: "7px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Save</button>
                          <button onClick={() => setEditingId(null)} style={{ flex: 1, background: "none", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 4, padding: "7px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add block form */}
          {addingAt !== null && (
            <div style={{
              position: "absolute",
              top: minutesToPx(addingAt - DAY_START_HOUR * 60),
              left: 8, right: 8, zIndex: 50,
              background: C.card, border: `1px solid ${C.accent}50`,
              borderRadius: 6, padding: 12,
              boxShadow: "0 8px 24px #00000080",
            }}>
              <div style={{ fontSize: 9, color: C.accent, letterSpacing: 1, marginBottom: 8 }}>NEW BLOCK AT {minutesToTimeStr(addingAt)}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input autoFocus value={newLabel} onChange={e => setNewLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addBlock(); if (e.key === "Escape") setAddingAt(null); }}
                  placeholder="what is it..."
                  style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: "7px 10px", fontSize: 13, outline: "none", minWidth: 120 }} />
                <TagSelector tags={tags} value={newTag} onChange={setNewTag} onCreateTag={onPersistTags} />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={addBlock} style={{ background: C.accent, border: "none", color: "#fff", borderRadius: 4, padding: "7px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Add</button>
                <button onClick={() => setAddingAt(null)} style={{ background: "none", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 4, padding: "7px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Timeline height spacer */}
      <div style={{ height: timelineHeight + 8 }} />
    </div>
  );
}

// ── Early Access Banner ───────────────────────────────────────────────
function EarlyAccessBanner() {
  const [visible, setVisible] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (localStorage.getItem("flux_banner_dismissed")) { setVisible(false); setDismissed(true); }
  }, []);
  function dismiss() {
    setVisible(false);
    localStorage.setItem("flux_banner_dismissed", "true");
    setTimeout(() => setDismissed(true), 400);
  }
  if (dismissed) return null;
  return (
    <div style={{ position: "fixed", bottom: 24, left: 24, zIndex: 999, maxWidth: 300, opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(12px)", transition: "opacity .35s ease, transform .35s ease", pointerEvents: visible ? "auto" : "none" }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.accent}`, borderRadius: 6, padding: "12px 14px", boxShadow: "0 4px 20px #00000050" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: C.accent, letterSpacing: 1, marginBottom: 5 }}>🚧 EARLY ACCESS</div>
            <div style={{ fontSize: 11, color: C.textMid, lineHeight: 1.6 }}>Flux is still being built. Things may shift, break, or get better without warning.</div>
            <a href="mailto:fluxteam@proton.me" style={{ fontSize: 10, color: C.textDim, marginTop: 6, display: "block", textDecoration: "none" }}>fluxteam@proton.me</a>
          </div>
          <button onClick={dismiss} style={{ background: "none", border: "none", cursor: "pointer", color: C.textDim, fontSize: 14, padding: "0 2px", flexShrink: 0 }}>✕</button>
        </div>
      </div>
    </div>
  );
}

// ── Late Night Prompt ─────────────────────────────────────────────────
function LateNightPrompt({ onChoose }) {
  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const todayLabel = now.toLocaleDateString("en-US", { weekday: "long", month: "numeric", day: "numeric" });
  const yesterdayLabel = yesterday.toLocaleDateString("en-US", { weekday: "long", month: "numeric", day: "numeric" });
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "#000000bb", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, maxWidth: 380, width: "100%", padding: "32px 28px", boxShadow: "0 24px 80px #00000080" }}>
        <div style={{ fontSize: 11, color: C.textDim, letterSpacing: 2, marginBottom: 12 }}>🌙 IT'S PAST MIDNIGHT</div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 2, color: C.text, marginBottom: 8 }}>Which day is this for?</div>
        <div style={{ fontSize: 12, color: C.textMid, lineHeight: 1.7, marginBottom: 28 }}>Your day doesn't end at midnight — archive whenever you're actually done.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={() => onChoose("yesterday")} style={{ background: C.accentDim, border: `1px solid ${C.accent}50`, color: C.text, borderRadius: 6, padding: "14px 18px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left", lineHeight: 1.5 }}>
            <div style={{ fontWeight: 600, marginBottom: 3 }}>{yesterdayLabel} — still finishing up</div>
            <div style={{ fontSize: 11, color: C.textDim }}>keep today's date, archive when you're done</div>
          </button>
          <button onClick={() => onChoose("today")} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "14px 18px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left", lineHeight: 1.5 }}>
            <div style={{ fontWeight: 600, marginBottom: 3 }}>{todayLabel} — starting fresh</div>
            <div style={{ fontSize: 11, color: C.textDim }}>roll any undone tasks and begin a new day</div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Task Drawer ───────────────────────────────────────────────────────
function TaskDrawer({ tasks, onTasksChange }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [schedDate, setSchedDate] = useState("");
  const inputRef = useRef();
  const remaining = tasks.filter(t => !t.done && (!t.scheduledFor || t.scheduledFor <= todayKey())).length;
  const doneToday = tasks.filter(t => t.done).length;
  const pending = tasks.filter(t => !t.done && (!t.scheduledFor || t.scheduledFor <= todayKey()));
  const scheduled = tasks.filter(t => !t.done && t.scheduledFor && t.scheduledFor > todayKey()).sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  const done = tasks.filter(t => t.done);
  function addTask() {
    const label = input.trim(); if (!label) return;
    onTasksChange([...tasks, { id: genId(), label, done: false, addedAt: nowStamp(), scheduledFor: schedDate || null }]);
    setInput(""); setSchedDate(""); inputRef.current?.focus();
  }
  function toggleTask(id) { onTasksChange(tasks.map(t => t.id !== id ? t : { ...t, done: !t.done, doneAt: !t.done ? nowStamp() : undefined })); }
  function deleteTask(id) { onTasksChange(tasks.filter(t => t.id !== id)); }
  return (
    <div style={{ marginBottom: 20 }}>
      <div onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: open ? "6px 6px 0 0" : "6px", cursor: "pointer", userSelect: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: C.textMid, letterSpacing: .5 }}>▸ tasks</span>
          <span style={{ fontSize: 11, color: C.textDim }}>
            {remaining > 0 ? <><span style={{ color: C.text }}>{remaining}</span> remaining</> : <span style={{ color: "#10b981" }}>all clear</span>}
            {doneToday > 0 && <span style={{ marginLeft: 8, color: "#10b981" }}>· {doneToday} done today</span>}
            {scheduled.length > 0 && <span style={{ marginLeft: 8, color: C.textDim }}>· {scheduled.length} scheduled</span>}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span onClick={e => { e.stopPropagation(); setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }} style={{ fontSize: 16, color: C.textDim, padding: "0 4px", lineHeight: 1 }}>+</span>
          <span style={{ fontSize: 10, color: C.textDim, display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .2s" }}>▶</span>
        </div>
      </div>
      {open && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 6px 6px", padding: "12px 14px" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addTask()} placeholder="add a task, hit enter..."
              style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: "7px 10px", fontSize: 13, outline: "none", minWidth: 160 }} />
            <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)}
              style={{ background: C.card, border: `1px solid ${C.border}`, color: schedDate ? C.text : C.textDim, borderRadius: 4, padding: "7px 8px", fontSize: 12, outline: "none", fontFamily: "inherit" }} />
            <button onClick={addTask} style={{ background: C.accentDim, border: `1px solid ${C.accent}40`, color: C.accent, borderRadius: 4, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>add</button>
          </div>
          {pending.length === 0 && done.length === 0 && scheduled.length === 0 && <div style={{ fontSize: 12, color: C.textDim, padding: "8px 0", textAlign: "center" }}>nothing here yet</div>}
          {pending.length === 0 && done.length > 0 && <div style={{ fontSize: 12, color: "#10b981", padding: "6px 0", textAlign: "center" }}>everything done 🎉</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {pending.map(task => (
              <div key={task.id} className="task-row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 8px", borderRadius: 4, background: C.card, border: `1px solid ${C.border}` }}>
                <div onClick={() => toggleTask(task.id)} style={{ width: 16, height: 16, borderRadius: 3, border: `1.5px solid ${C.border}`, cursor: "pointer", flexShrink: 0 }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "#10b981"} onMouseLeave={e => e.currentTarget.style.borderColor = C.border} />
                <span style={{ flex: 1, fontSize: 13, color: C.text }}>{task.label}</span>
                {task.addedAt && <span style={{ fontSize: 10, color: C.textDim }}>{task.addedAt}</span>}
                <button onClick={() => deleteTask(task.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.textDim, fontSize: 11, padding: "1px 3px", opacity: 0, transition: "opacity .15s" }} className="task-del">✕</button>
              </div>
            ))}
          </div>
          {scheduled.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, marginBottom: 6 }}>SCHEDULED</div>
              {scheduled.map(task => (
                <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 4, marginBottom: 3, background: C.card, border: `1px solid ${C.border}`, opacity: .6 }}>
                  <span style={{ fontSize: 10, color: "#38bdf8", minWidth: 60 }}>{formatEventDate(task.scheduledFor)}</span>
                  <span style={{ flex: 1, fontSize: 12, color: C.textMid }}>{task.label}</span>
                  <button onClick={() => deleteTask(task.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.textDim, fontSize: 11 }}>✕</button>
                </div>
              ))}
            </div>
          )}
          {done.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, marginBottom: 6 }}>DONE TODAY</div>
              {done.map(task => (
                <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 4, opacity: .45 }}>
                  <div onClick={() => toggleTask(task.id)} style={{ width: 16, height: 16, borderRadius: 3, border: "1.5px solid #10b981", background: "#10b98120", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 10, color: "#10b981" }}>✓</span>
                  </div>
                  <span style={{ flex: 1, fontSize: 12, color: C.textDim, textDecoration: "line-through" }}>{task.label}</span>
                  <span style={{ fontSize: 10, color: C.textDim }}>{task.doneAt}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.textDim, lineHeight: 1.6 }}>archive day → snapshot saved · done cleared · undone rolls to tomorrow</div>
        </div>
      )}
    </div>
  );
}

// ── Upcoming Events Drawer ────────────────────────────────────────────
function UpcomingDrawer({ events }) {
  const [open, setOpen] = useState(false);
  const upcoming = events.filter(e => isFuture(e.date)).sort((a, b) => a.date.localeCompare(b.date));
  const todayEvents = upcoming.filter(e => isToday(e.date));
  const futureEvents = upcoming.filter(e => !isToday(e.date)).slice(0, 5);
  const next = upcoming.find(e => !isToday(e.date));
  const thisWeek = upcoming.filter(e => { const diff = Math.round((dateFromLocalKey(e.date) - new Date()) / 86400000); return diff > 0 && diff <= 7; }).length;
  return (
    <div style={{ marginBottom: 20 }}>
      <div onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: open ? "6px 6px 0 0" : "6px", cursor: "pointer", userSelect: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: C.textMid, letterSpacing: .5 }}>▸ upcoming</span>
          <span style={{ fontSize: 11, color: C.textDim }}>
            {todayEvents.length > 0 && <span style={{ color: C.accent }}>{todayEvents.length} today</span>}
            {todayEvents.length > 0 && thisWeek > 0 && <span> · </span>}
            {thisWeek > 0 && <span>{thisWeek} this week</span>}
            {todayEvents.length === 0 && thisWeek === 0 && next && <span>next: <span style={{ color: C.text }}>{next.title}</span> {formatEventDate(next.date)}{next.time ? ` ${next.time}` : ""}</span>}
            {upcoming.length === 0 && <span style={{ color: C.textDim }}>nothing scheduled</span>}
          </span>
        </div>
        <span style={{ fontSize: 10, color: C.textDim, display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .2s" }}>▶</span>
      </div>
      {open && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 6px 6px", padding: "12px 14px" }}>
          {todayEvents.length > 0 && <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: C.accent, letterSpacing: 1, marginBottom: 7 }}>TODAY</div>
            {todayEvents.map(e => <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "6px 8px", background: C.accentDim, border: `1px solid ${C.accent}30`, borderRadius: 4, marginBottom: 4 }}>
              {e.time && <span style={{ fontSize: 11, color: C.accent, minWidth: 50 }}>{e.time}</span>}
              <span style={{ fontSize: 13, color: C.text }}>{e.title}</span>
              {e.note && <span style={{ fontSize: 11, color: C.textDim, fontStyle: "italic" }}>— {e.note}</span>}
            </div>)}
          </div>}
          {futureEvents.length > 0 && <div>
            <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, marginBottom: 7 }}>COMING UP</div>
            {futureEvents.map(e => <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "5px 8px", marginBottom: 3 }}>
              <span style={{ fontSize: 11, color: "#38bdf8", minWidth: 70 }}>{formatEventDate(e.date)}{e.time ? ` ${e.time}` : ""}</span>
              <span style={{ fontSize: 12, color: C.text }}>{e.title}</span>
              {e.note && <span style={{ fontSize: 11, color: C.textDim, fontStyle: "italic" }}>— {e.note}</span>}
            </div>)}
          </div>}
          {upcoming.length === 0 && <div style={{ fontSize: 12, color: C.textDim, textAlign: "center", padding: "8px 0" }}>nothing scheduled — add events in the Calendar tab</div>}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.textDim }}>manage events in the Calendar tab</div>
        </div>
      )}
    </div>
  );
}

// ── Calendar View ─────────────────────────────────────────────────────
function CalendarView({ events, onEventsChange }) {
  const [newEvent, setNewEvent] = useState({ title: "", date: "", time: "", note: "" });
  const [adding, setAdding] = useState(false);
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  const past = sorted.filter(e => e.date < todayKey());
  const present = sorted.filter(e => isFuture(e.date));
  function addEvent() {
    if (!newEvent.title.trim() || !newEvent.date) return;
    onEventsChange([...events, { ...newEvent, id: genId() }]);
    setNewEvent({ title: "", date: "", time: "", note: "" }); setAdding(false);
  }
  function deleteEvent(id) { onEventsChange(events.filter(e => e.id !== id)); }
  const grouped = present.reduce((acc, e) => {
    const month = dateFromLocalKey(e.date).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (!acc[month]) acc[month] = []; acc[month].push(e); return acc;
  }, {});
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 3, color: C.textMid }}>CALENDAR</div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{present.length} upcoming · {past.length} past</div>
        </div>
        <button onClick={() => setAdding(!adding)} style={{ background: adding ? "none" : C.accent, border: adding ? `1px solid ${C.border}` : "none", color: adding ? C.textDim : "#fff", borderRadius: 4, padding: "8px 18px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          {adding ? "cancel" : "+ add event"}
        </button>
      </div>
      {adding && <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 16, marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, marginBottom: 12 }}>NEW EVENT</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input autoFocus placeholder="what is it..." value={newEvent.title} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })} onKeyDown={e => e.key === "Enter" && addEvent()}
            style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: "8px 10px", fontSize: 13, outline: "none" }} />
          <div style={{ display: "flex", gap: 10 }}>
            <input type="date" value={newEvent.date} onChange={e => setNewEvent({ ...newEvent, date: e.target.value })} style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: "8px 10px", fontSize: 12, outline: "none", fontFamily: "inherit" }} />
            <input type="time" value={newEvent.time} onChange={e => setNewEvent({ ...newEvent, time: e.target.value })} style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: "8px 10px", fontSize: 12, outline: "none", fontFamily: "inherit" }} />
          </div>
          <input placeholder="note (optional)" value={newEvent.note} onChange={e => setNewEvent({ ...newEvent, note: e.target.value })} style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: "8px 10px", fontSize: 12, outline: "none" }} />
          <button onClick={addEvent} style={{ background: C.accent, border: "none", color: "#fff", borderRadius: 4, padding: "8px 20px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", alignSelf: "flex-start" }}>Add Event</button>
        </div>
      </div>}
      {present.length === 0 && <div style={{ textAlign: "center", padding: "40px 0", color: C.textDim, fontSize: 13 }}>nothing scheduled yet</div>}
      {Object.entries(grouped).map(([month, evs]) => (
        <div key={month} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 2, marginBottom: 10, textTransform: "uppercase" }}>{month}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {evs.map(e => {
              const d = dateFromLocalKey(e.date); const isItToday = isToday(e.date);
              return <div key={e.id} style={{ display: "flex", gap: 14, alignItems: "center", padding: "10px 14px", background: isItToday ? C.accentDim : C.card, border: `1px solid ${isItToday ? C.accent + "50" : C.border}`, borderLeft: `3px solid ${isItToday ? C.accent : "#38bdf8"}`, borderRadius: 6 }}>
                <div style={{ textAlign: "center", minWidth: 32 }}>
                  <div style={{ fontSize: 18, fontFamily: "'Bebas Neue',sans-serif", color: isItToday ? C.accent : C.text, lineHeight: 1 }}>{d.getDate()}</div>
                  <div style={{ fontSize: 9, color: C.textDim, textTransform: "uppercase" }}>{d.toLocaleDateString("en-US", { weekday: "short" })}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: C.text }}>{e.title}</div>
                  <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
                    {e.time && <span style={{ color: "#38bdf8", marginRight: 8 }}>{e.time}</span>}
                    {e.note && <span style={{ fontStyle: "italic" }}>{e.note}</span>}
                  </div>
                </div>
                <button onClick={() => deleteEvent(e.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.textDim, fontSize: 12, padding: "2px 4px" }}>✕</button>
              </div>;
            })}
          </div>
        </div>
      ))}
      {past.length > 0 && <details style={{ marginTop: 10 }}>
        <summary style={{ fontSize: 11, color: C.textDim, cursor: "pointer", letterSpacing: 1, listStyle: "none", marginBottom: 10 }}>▸ {past.length} past event{past.length !== 1 ? "s" : ""}</summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, opacity: .4 }}>
          {past.reverse().map(e => <div key={e.id} style={{ display: "flex", gap: 10, padding: "6px 10px", borderRadius: 4 }}>
            <span style={{ fontSize: 11, color: C.textDim, minWidth: 80 }}>{dateFromLocalKey(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            <span style={{ fontSize: 12, color: C.textDim, textDecoration: "line-through" }}>{e.title}</span>
          </div>)}
        </div>
      </details>}
    </div>
  );
}

// ── Auth Screen ───────────────────────────────────────────────────────
function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("signin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  async function handleAuth() {
    setError(""); setSuccessMsg(""); setLoading(true);
    try {
      if (mode === "signup") {
        const { error: e } = await supabase.auth.signUp({ email, password });
        if (e) setError(e.message);
        else { setSuccessMsg("Account created. You can sign in now with your email and password."); setTimeout(() => { setMode("signin"); setPassword(""); }, 2000); }
      } else if (mode === "signin") {
        const { error: e } = await supabase.auth.signInWithPassword({ email, password });
        if (e) setError(e.message);
      } else if (mode === "forgot") {
        const { error: e } = await supabase.auth.resetPasswordForEmail(email);
        if (e) setError(e.message);
        else { setSuccessMsg("Password reset link sent to your email."); setEmail(""); }
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  }
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'DM Mono','Fira Code','Courier New',monospace", position: "relative", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Bebas+Neue&family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        .glow{position:fixed;top:-200px;left:50%;transform:translateX(-50%);width:800px;height:600px;background:radial-gradient(ellipse at center,${C.accent}18 0%,transparent 70%);pointer-events:none;z-index:0}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .feature-card{background:${C.card};border:1px solid ${C.border};padding:28px 24px;position:relative;overflow:hidden;transition:border-color .2s}
        .feature-card:hover{border-color:${C.accent}30}
        .feature-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:${C.accent};transform:scaleX(0);transform-origin:left;transition:transform .3s ease}
        .feature-card:hover::before{transform:scaleX(1)}
      `}</style>
      <div className="glow" />
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, padding: "20px 48px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}40`, backdropFilter: "blur(12px)", background: C.bg + "90" }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 4, color: C.accent }}>FLUX</div>
      </div>
      <section style={{ position: "relative", zIndex: 1, minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start", padding: "120px 48px 80px", maxWidth: 960, margin: "0 auto" }}>
        <div style={{ fontSize: 10, letterSpacing: 4, color: C.accent, textTransform: "uppercase", marginBottom: 24, opacity: 0, animation: "fadeUp .6s ease .2s forwards" }}>A different kind of daily</div>
        <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: "clamp(52px, 8vw, 96px)", lineHeight: .95, letterSpacing: -2, color: C.text, marginBottom: 8, opacity: 0, animation: "fadeUp .7s ease .35s forwards" }}>
          Built for brains<br /><em style={{ fontStyle: "italic", color: C.accent }}>in</em><br />
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(56px, 9vw, 108px)", letterSpacing: 6, display: "block" }}>FLUX</span>
        </h1>
        <p style={{ fontSize: 13, color: C.textMid, lineHeight: 1.8, maxWidth: 440, marginTop: 28, marginBottom: 52, opacity: 0, animation: "fadeUp .7s ease .5s forwards" }}>
          A daily planner that bends instead of breaks. Structure without the rigidity. Flexible blocks, real data about how your days actually go, and a rhythm that works <em>with</em> you.
        </p>
        <div style={{ opacity: 0, animation: "fadeUp .7s ease .65s forwards", width: "100%", maxWidth: 360 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: C.textDim, textTransform: "uppercase", marginBottom: 16 }}>
            {mode === "signin" ? "Sign In" : mode === "signup" ? "Create Account" : "Reset Password"}
          </div>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 10 }}>
            {mode === "forgot" ? "Enter your account email to reset your password." : "Use your email and password. No magic link required."}
          </div>
          {mode === "forgot" ? (
            <div style={{ marginBottom: 16 }}>
              <input type="email" placeholder="your email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAuth()} disabled={loading}
                style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: "12px 14px", fontSize: 13, outline: "none", fontFamily: "inherit", opacity: loading ? 0.6 : 1, marginBottom: 8 }} />
              <div style={{ fontSize: 11, color: C.textDim }}>we'll send you a link to reset your password</div>
            </div>
          ) : (
            <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <input type="email" placeholder="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAuth()} disabled={loading}
                style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: "12px 14px", fontSize: 13, outline: "none", fontFamily: "inherit", opacity: loading ? 0.6 : 1 }} />
              <input type="password" placeholder="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAuth()} disabled={loading}
                style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: "12px 14px", fontSize: 13, outline: "none", fontFamily: "inherit", opacity: loading ? 0.6 : 1 }} />
            </div>
          )}
          {error && <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 12, padding: 10, background: "#1f0000", borderRadius: 4, textAlign: "center" }}>{error}</div>}
          {successMsg && <div style={{ fontSize: 12, color: "#10b981", marginBottom: 12, padding: 10, background: "#001f00", borderRadius: 4, textAlign: "center" }}>{successMsg}</div>}
          <button onClick={handleAuth} disabled={loading || !email || (mode !== "forgot" && !password)}
            style={{ width: "100%", background: C.accent, border: "none", color: "#fff", borderRadius: 4, padding: "12px 16px", fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit", opacity: loading || !email || (mode !== "forgot" && !password) ? 0.6 : 1, marginBottom: 8 }}>
            {loading ? "loading..." : mode === "signin" ? "Sign In With Password" : mode === "signup" ? "Create Account" : "Send Reset Link"}
          </button>
          {mode !== "forgot" && <button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setSuccessMsg(""); }} disabled={loading}
            style={{ width: "100%", background: "none", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 4, padding: "12px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", marginBottom: 8 }}>
            {mode === "signin" ? "First time? Create Account" : "Back to Sign In"}
          </button>}
          {mode === "signin" && <button onClick={() => { setMode("forgot"); setError(""); setSuccessMsg(""); }} disabled={loading}
            style={{ width: "100%", background: "none", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 4, padding: "12px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            Forgot password?
          </button>}
          {mode === "forgot" && <button onClick={() => { setMode("signin"); setError(""); setSuccessMsg(""); setEmail(""); }} disabled={loading}
            style={{ width: "100%", background: "none", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 4, padding: "12px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            Back to Sign In
          </button>}
          <div style={{ fontSize: 10, color: C.textDim, marginTop: 12 }}>your data is yours · private by design</div>
        </div>
      </section>
      <div style={{ position: "relative", zIndex: 1, maxWidth: 960, margin: "0 auto", padding: "0 48px" }}>
        <hr style={{ border: "none", borderTop: `1px solid ${C.border}` }} />
      </div>
      <section style={{ position: "relative", zIndex: 1, maxWidth: 960, margin: "0 auto", padding: "80px 48px" }}>
        <div style={{ fontSize: 9, letterSpacing: 4, color: C.textDim, textTransform: "uppercase", marginBottom: 48 }}>What's inside</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 2 }}>
          {[
            { num: "01", title: "A schedule that moves with you", desc: "Visual time blocks sized by duration. Drag to move, drag the edge to resize. See your day at a glance." },
            { num: "02", title: "Tasks that carry forward", desc: "Undone tasks roll to tomorrow when you archive. A quiet nudge, not a panic button." },
            { num: "03", title: "Tags that earn their place", desc: "Start with four defaults. Create any tag — use it enough and it becomes a tracked category." },
            { num: "04", title: "End of day debrief", desc: "A compact day summary and one calm prompt for tomorrow. Extra reflection stays optional." },
            { num: "05", title: "A calendar that finds you", desc: "Add an appointment months out. It shows up in your day when it matters." },
            { num: "06", title: "Patterns on your terms", desc: "After a few days, see energy trends, recurring friction, where your time actually goes." }
          ].map(f => (
            <div key={f.num} className="feature-card">
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 11, letterSpacing: 3, color: C.accent, opacity: .5, marginBottom: 14 }}>{f.num}</div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 10, lineHeight: 1.2 }}>{f.title}</div>
              <div style={{ fontSize: 11, color: C.textMid, lineHeight: 1.8 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>
      <div style={{ position: "relative", zIndex: 1, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "60px 48px", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${C.accent}08 0%, transparent 60%)`, pointerEvents: "none" }} />
        <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 2fr", gap: 48, alignItems: "center", position: "relative", zIndex: 1 }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 48, letterSpacing: 3, color: C.accent, lineHeight: .9, opacity: .15 }}>FLUX</div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: "clamp(18px, 2.5vw, 26px)", lineHeight: 1.5, color: C.textMid, fontStyle: "italic" }}>
            This isn't productivity theater. It's about understanding <strong style={{ color: C.text, fontStyle: "normal" }}>your</strong> rhythm. By tracking what you actually do and how you feel, you build <strong style={{ color: C.text, fontStyle: "normal" }}>your</strong> operating system.
          </div>
        </div>
      </div>
      <footer style={{ position: "relative", zIndex: 1, maxWidth: 960, margin: "0 auto", padding: "32px 48px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, letterSpacing: 3, color: C.textDim }}>FLUX</div>
        <div style={{ fontSize: 10, color: C.textDim }}>built with care · <a href="https://ko-fi.com/fluxteam" target="_blank" rel="noopener noreferrer" style={{ color: C.accent, textDecoration: "none" }}>support us</a></div>
      </footer>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
export default function App() {
  const [session, setSession]               = useState(null);
  const [authLoading, setAuthLoading]       = useState(true);
  const [showResetForm, setShowResetForm]   = useState(false);
  const [resetPassword, setResetPassword]   = useState("");
  const [resetLoading, setResetLoading]     = useState(false);
  const [resetError, setResetError]         = useState("");
  const [resetSuccess, setResetSuccess]     = useState(false);
  const [showLateNightPrompt, setShowLateNightPrompt] = useState(false);
  const [lateNightKey, setLateNightKey]     = useState(null);
  const [view, setView]                     = useState("today");
  const [blocks, setBlocks]                 = useState(makeDefaults());
  const [tasks, setTasks]                   = useState([]);
  const [events, setEvents]                 = useState([]);
  const [tags, setTags]                     = useState(SEED_TAGS);
  const [mood, setMood]                     = useState(2);
  const [dayNote, setDayNote]               = useState("");
  const [wins, setWins]                     = useState("");
  const [hard, setHard]                     = useState("");
  const [journalEntries, setJournalEntries] = useState([]);
  const [journalInput, setJournalInput]     = useState("");
  const [journalPromptOffset, setJournalPromptOffset] = useState(0);
  const [journalSaving, setJournalSaving]   = useState(false);
  const [journalFeedback, setJournalFeedback] = useState(null);
  const [archive, setArchive]               = useState({});
  const [expandedArchive, setExpandedArchive] = useState(null);
  const [flash, setFlash]                   = useState(null);
  const [dbLoading, setDbLoading]           = useState(false);
  const currentDayKey = todayKey();
  const [hasSeenDemo, setHasSeenDemo] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setAuthLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { setSession(session); });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (window.location.hash.includes("type=recovery")) setShowResetForm(true);
  }, []);

  useEffect(() => {
    if (!session) return;
    const hour = new Date().getHours();
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const yk = localDateKey(yesterday);
    const hasPromptedForYesterday = Boolean(localStorage.getItem("flux_latenight_" + yk));
    if (shouldShowLateNightPrompt({ session, hour, blocks, tasks, wins, hard, dayNote, hasPromptedForYesterday })) {
      setLateNightKey(yk);
      setShowLateNightPrompt(true);
    }
  }, [session, blocks, tasks, wins, hard, dayNote]);

  useEffect(() => {
    setJournalPromptOffset(0);
  }, [currentDayKey]);

  useEffect(() => {
    if (!journalFeedback) return undefined;
    const timer = setTimeout(() => setJournalFeedback(null), 1800);
    return () => clearTimeout(timer);
  }, [journalFeedback]);

  function handleLateNightChoice(choice) {
    setShowLateNightPrompt(false);
    localStorage.setItem("flux_latenight_" + lateNightKey, "true");
    if (choice === "today") {
      const undone = tasks.filter(t => !t.done);
      setTasks(undone.map(t => ({ ...t, addedAt: (t.addedAt || "") + " (rolled)" })));
      setBlocks(makeDefaults()); setMood(2); setDayNote(""); setWins(""); setHard("");
    }
  }

  const loadData = useCallback(async () => {
    if (!session) return;
    setDbLoading(true);
    const uid = session.user.id;
    try {
      const [{ data: userData }, { data: archiveData }, { data: eventsData }, { data: journalData }] = await Promise.all([
        supabase.from("user_data").select("*").eq("user_id", uid).single(),
        supabase.from("archive").select("*").eq("user_id", uid),
        supabase.from("events").select("*").eq("user_id", uid),
        supabase.from("journal_entries").select("*").eq("user_id", uid).eq("day_key", todayKey()).is("deleted_at", null),
      ]);
      if (userData) {
        if (userData.tags) setTags(userData.tags);
        if (userData.today_key === todayKey()) {
          if (userData.blocks) setBlocks(userData.blocks.map(b => ({ ...b, duration: b.duration || DEFAULT_DURATION })));
          if (userData.tasks) setTasks(userData.tasks);
          if (userData.mood !== undefined) setMood(userData.mood);
          if (userData.day_note) setDayNote(userData.day_note);
          if (userData.wins) setWins(userData.wins);
          if (userData.hard) setHard(userData.hard);
          if (userData.has_seen_demo !== undefined) setHasSeenDemo(userData.has_seen_demo);
        } else {
          const undone = (userData.tasks || []).filter(t => !t.done && (!t.scheduledFor || t.scheduledFor <= todayKey()));
          const scheduled = (userData.tasks || []).filter(t => !t.done && t.scheduledFor && t.scheduledFor > todayKey());
          setTasks([...undone.map(t => ({ ...t, addedAt: (t.addedAt || "") + " (rolled)" })), ...scheduled]);
          if (!userData.has_seen_demo) {
  setBlocks(makeDefaults());
} else {
  setBlocks([]);
}
setMood(2); setDayNote(""); setWins(""); setHard("");
        }
      }
      if (archiveData) {
        const archiveObj = {};
        archiveData.forEach(row => { archiveObj[row.day_key] = row.data; });
        setArchive(archiveObj);
      }
      if (eventsData) setEvents(eventsData.map(e => e.data));
      if (journalData) setJournalEntries(sortJournalEntries(journalData));
    } catch (e) { console.error("load error", e); }
    setDbLoading(false);
  }, [session]);

  const saveToday = useCallback(async (quiet = false) => {
    if (!session) return;
    const uid = session.user.id;
    await supabase.from("user_data").upsert({ user_id: uid, today_key: todayKey(), blocks, tasks, mood, day_note: dayNote, wins, hard, tags }, { onConflict: "user_id" });
    if (!quiet) { setFlash("saved"); setTimeout(() => setFlash(null), 1600); }
  }, [session, blocks, tasks, mood, dayNote, wins, hard, tags]);

  useEffect(() => { if (!session) return; loadData(); }, [session, loadData]);

  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(() => { saveToday(false); }, 1000);
    return () => clearTimeout(timer);
  }, [session, saveToday]);

  async function archiveDay() {
    if (!session) return;
    const uid = session.user.id;
    let updatedTags = [...tags];
    blocks.forEach(b => { if (b.tag) updatedTags = bumpTagUse(b.tag, updatedTags); });
    setTags(updatedTags);
    const activeJournalEntries = sortJournalEntries(journalEntries.filter(e => !e.deleted_at));
    const dayData = { blocks, mood, day_note: dayNote, wins, hard, tasks, journal_entries: activeJournalEntries, date: today(), key: todayKey() };
    await Promise.all([
      supabase.from("archive").upsert({ user_id: uid, day_key: todayKey(), data: dayData }, { onConflict: "user_id,day_key" }),
      supabase.from("user_data").upsert({ user_id: uid, today_key: todayKey(), blocks, tags: updatedTags, mood, day_note: dayNote, wins, hard, tasks }, { onConflict: "user_id" }),
    ]);
    setArchive({ ...archive, [todayKey()]: dayData });
    setTasks(tasks.filter(t => !t.done));
    setFlash("archived"); setTimeout(() => setFlash(null), 2000);
  }

  async function deleteArchiveDay(dayKey) {
    if (!session) return;
    const uid = session.user.id;
    await supabase.from("archive").delete().eq("user_id", uid).eq("day_key", dayKey);
    const updated = { ...archive }; delete updated[dayKey]; setArchive(updated);
  }

  async function saveEvents(newEvents) {
    if (!session) return;
    const uid = session.user.id;
    const previousEvents = events;
    setEvents(newEvents);
    try {
      const { data: existingRows, error: selectError } = await supabase
        .from("events")
        .select("id,event_id")
        .eq("user_id", uid);
      if (selectError) throw selectError;

      const existingByEventId = new Map((existingRows || []).map(row => [row.event_id, row]));
      for (const eventItem of newEvents) {
        const existing = existingByEventId.get(eventItem.id);
        if (existing) {
          const { error: updateError } = await supabase
            .from("events")
            .update({ data: eventItem })
            .eq("id", existing.id)
            .eq("user_id", uid);
          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabase
            .from("events")
            .insert({ user_id: uid, event_id: eventItem.id, data: eventItem });
          if (insertError) throw insertError;
        }
      }

      const staleRowIds = computeStaleEventRowIds(existingRows || [], newEvents);

      if (staleRowIds.length > 0) {
        const { error: deleteError } = await supabase
          .from("events")
          .delete()
          .eq("user_id", uid)
          .in("id", staleRowIds);
        if (deleteError) throw deleteError;
      }
    } catch (error) {
      setEvents(resolveSavedEvents(previousEvents, newEvents, true));
      console.error("save events error", error);
    }
  }

  async function addJournalEntry() {
    const text = journalInput.trim();
    if (!session || !text || journalSaving) return;
    setJournalSaving(true);
    setJournalFeedback(null);
    const payload = {
      user_id: session.user.id,
      day_key: todayKey(),
      type: "note",
      text,
      pinned: false,
      archived: false,
      source: "manual",
    };
    const { data, error } = await supabase.from("journal_entries").insert(payload).select("*").single();
    if (!error && data) {
      setJournalEntries(sortJournalEntries([...journalEntries, data]));
      setJournalInput("");
      setJournalPromptOffset(0);
      setJournalFeedback({ type: "ok", message: "journal saved" });
    } else {
      setJournalFeedback({ type: "err", message: "couldn't save journal entry" });
      console.error("journal save error", error);
    }
    setJournalSaving(false);
  }

  async function toggleJournalPinned(entryId, nextPinned) {
    if (!session) return;
    const { data, error } = await supabase
      .from("journal_entries")
      .update({ pinned: nextPinned, updated_at: new Date().toISOString() })
      .eq("id", entryId)
      .eq("user_id", session.user.id)
      .select("*")
      .single();
    if (!error && data) {
      setJournalEntries(sortJournalEntries(journalEntries.map(e => e.id === entryId ? data : e)));
    }
  }

  async function setJournalEntryType(entryId, nextType) {
    if (!session) return;
    const { data, error } = await supabase
      .from("journal_entries")
      .update({ type: nextType, updated_at: new Date().toISOString() })
      .eq("id", entryId)
      .eq("user_id", session.user.id)
      .select("*")
      .single();
    if (!error && data) {
      setJournalEntries(sortJournalEntries(journalEntries.map(e => e.id === entryId ? data : e)));
    }
  }

  async function softDeleteJournalEntry(entryId) {
    if (!session) return;
    const { error } = await supabase
      .from("journal_entries")
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", entryId)
      .eq("user_id", session.user.id);
    if (!error) {
      setJournalEntries(journalEntries.filter(e => e.id !== entryId));
    }
  }

  async function persistTags(t) {
    setTags(t);
    if (!session) return;
    await supabase.from("user_data").upsert({ user_id: session.user.id, today_key: todayKey(), tags: t }, { onConflict: "user_id" });
  }

  async function handlePasswordReset() {
    setResetError("");
    if (resetPassword.length < 6) { setResetError("Password must be at least 6 characters"); return; }
    setResetLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: resetPassword });
      if (error) setResetError(error.message);
      else { setResetSuccess(true); setTimeout(() => { setShowResetForm(false); setResetPassword(""); window.location.hash = ""; setResetSuccess(false); }, 2000); }
    } catch (e) { setResetError(e.message); }
    setResetLoading(false);
  }

  const archiveCount = Object.keys(archive).length;
  const patterns = computePatterns(archive, tags);
  const promotedTags = tags.filter(t => t.pinned || (t.uses || 0) >= PROMOTE_THRESHOLD);
  const todayJournalEntries = sortJournalEntries(journalEntries.filter(e => !e.deleted_at));
  const isEndOfDay = new Date().getHours() >= 17;
  const journalPromptPool = isEndOfDay ? JOURNAL_PROMPTS_EOD : JOURNAL_PROMPTS_DAY;
  const journalPrompt = pickPrompt(journalPromptPool, todayKey(), todayJournalEntries.length, journalPromptOffset);
  const completedTasksCount = tasks.filter(t => t.done).length;
  const carryoversCount = tasks.filter(t => !t.done).length;
  const followUpOrStuckCount = todayJournalEntries.filter(e => e.type === "follow_up" || e.type === "stuck").length;

  if (showResetForm) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ width: "100%", maxWidth: 320 }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, letterSpacing: 3, color: C.accent, marginBottom: 8 }}>FLUX</div>
            <div style={{ fontSize: 12, color: C.textDim }}>reset your password</div>
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 24 }}>
            <input type="password" placeholder="new password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handlePasswordReset()} disabled={resetLoading}
              style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: "10px 12px", fontSize: 13, outline: "none", marginBottom: 8, opacity: resetLoading ? 0.6 : 1 }} />
            <div style={{ fontSize: 11, color: C.textDim, marginBottom: 16 }}>min 6 characters</div>
            {resetError && <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 12, padding: 10, background: "#1f0000", borderRadius: 4, textAlign: "center" }}>{resetError}</div>}
            {resetSuccess && <div style={{ fontSize: 12, color: "#10b981", marginBottom: 12, padding: 10, background: "#001f00", borderRadius: 4, textAlign: "center" }}>Password updated! Redirecting...</div>}
            <button onClick={handlePasswordReset} disabled={resetLoading || !resetPassword}
              style={{ width: "100%", background: C.accent, border: "none", color: "#fff", borderRadius: 4, padding: "10px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", opacity: resetLoading || !resetPassword ? 0.6 : 1 }}>
              {resetLoading ? "updating..." : "Set New Password"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (authLoading) return <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", color: C.textDim, fontFamily: "monospace" }}>loading...</div>;
  if (!session) return <AuthScreen />;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'DM Mono','Fira Code','Courier New',monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Bebas+Neue&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:${C.bg}}::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
        textarea,input{font-family:inherit}
        .task-row:hover .task-del{opacity:1!important}
        .nav{background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;padding:6px 14px;font-family:inherit;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;transition:all .15s}
        .nav.on{color:${C.accent};border-bottom-color:${C.accent}}
        .nav:not(.on){color:${C.textDim}}
        .nav:hover:not(.on){color:${C.textMid}}
        .ac{cursor:pointer;transition:background .15s}
        .ac:hover{background:#222226!important}
        .tag-chip{display:inline-block;padding:3px 8px;border-radius:3px;font-size:11px;margin:3px 3px 0 0;border:1px solid}
        details summary::-webkit-details-marker{display:none}
        @keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      `}</style>

      <EarlyAccessBanner />
      {showLateNightPrompt && <LateNightPrompt onChoose={handleLateNightChoice} />}

      {flash && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: flash === "archived" ? "#10b98120" : C.card, border: `1px solid ${flash === "archived" ? "#10b98150" : C.border}`, borderLeft: `3px solid ${flash === "archived" ? "#10b981" : C.accent}`, borderRadius: 6, padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, zIndex: 1000, boxShadow: "0 4px 12px rgba(0,0,0,0.3)", animation: "slideUp .35s ease" }}>
          <span style={{ fontSize: 16 }}>{flash === "archived" ? "✓" : "💾"}</span>
          <span style={{ fontSize: 12, color: C.text }}>{flash === "archived" ? "Day archived" : "Changes saved"}</span>
        </div>
      )}

      {/* Nav */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "0 24px", position: "sticky", top: 0, background: C.bg, zIndex: 20 }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, letterSpacing: 3, color: C.accent }}>FLUX</div>
            {dbLoading && <span style={{ fontSize: 11, color: C.textDim }}>syncing...</span>}
          </div>
          <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
            <button className={`nav${view === "today" ? " on" : ""}`} onClick={() => setView("today")}>Today</button>
            <button className={`nav${view === "calendar" ? " on" : ""}`} onClick={() => setView("calendar")}>Calendar</button>
            <button className={`nav${view === "archive" ? " on" : ""}`} onClick={() => setView("archive")}>Archive{archiveCount > 0 ? ` · ${archiveCount}` : ""}</button>
            <button className={`nav${view === "patterns" ? " on" : ""}`} onClick={() => setView("patterns")} style={{ opacity: archiveCount < 3 ? .3 : 1 }}>Patterns</button>
            <HelpSystem />
            <a href="https://ko-fi.com/fluxteam" target="_blank" rel="noopener noreferrer" style={{ color: C.textDim, fontSize: 10, padding: "6px 8px", textDecoration: "none" }} title="support us ☕">☕</a>
            <button onClick={() => supabase.auth.signOut()} style={{ background: "none", border: "none", cursor: "pointer", color: C.textDim, fontSize: 10, padding: "6px 8px", fontFamily: "inherit", letterSpacing: 1 }}>out</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "22px 24px 80px" }}>

        {/* TODAY */}
        {view === "today" && <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 13, color: C.textMid }}>{today()}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 6, letterSpacing: 1 }}>ENERGY</div>
              <div style={{ display: "flex", gap: 4 }}>
                {MOODS.map((m, i) => (
                  <button key={i} onClick={() => setMood(i)} style={{ background: mood === i ? C.accentDim : "none", border: mood === i ? `1px solid ${C.accent}` : `1px solid ${C.border}`, borderRadius: 4, padding: "3px 6px", cursor: "pointer", fontSize: 10, color: mood === i ? C.accent : C.textDim, transition: "all .15s", fontFamily: "inherit" }}>{m}</button>
                ))}
              </div>
            </div>
          </div>

          {promotedTags.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 10, color: C.textDim, letterSpacing: .5 }}>tags:</span>
              {promotedTags.map(t => <TagPill key={t.id} tag={t} small />)}
            </div>
          )}

          {/* Visual Timeline */}
          <VisualTimeline
            blocks={blocks}
         onBlocksChange={(newBlocksOrUpdater) => {
  // Dismiss demo on ANY block interaction (add, edit, delete) if not already dismissed
  const shouldDismissDemo = !hasSeenDemo;
  
  setBlocks(newBlocksOrUpdater);
  
  if (shouldDismissDemo) {
    const uid = session?.user?.id;
    if (uid) {
      supabase.from('user_data').update({ has_seen_demo: true }).eq('user_id', uid);
      setHasSeenDemo(true);
    }
  }
}}
            tags={tags}
            onPersistTags={persistTags}
          />

          <TaskDrawer tasks={tasks} onTasksChange={setTasks} />
          <UpcomingDrawer events={events} />

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20, marginTop: 14, marginBottom: 20 }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 17, letterSpacing: 2, color: C.textMid, marginBottom: 12 }}>JOURNAL</div>
            <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8 }}>
              {journalPrompt}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                value={journalInput}
                onChange={e => setJournalInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addJournalEntry()}
                placeholder={journalPrompt}
                style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: "8px 10px", fontSize: 12, outline: "none", fontFamily: "inherit" }}
              />
              <button
                onClick={() => setJournalPromptOffset(n => n + 1)}
                style={{ background: "none", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 4, padding: "8px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
              >
                prompt
              </button>
              <button
                onClick={addJournalEntry}
                disabled={journalSaving || !journalInput.trim()}
                style={{ background: C.accentDim, border: `1px solid ${C.accent}40`, color: C.accent, borderRadius: 4, padding: "8px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", opacity: journalSaving || !journalInput.trim() ? 0.55 : 1 }}
              >
                {journalSaving ? "saving..." : "add"}
              </button>
            </div>
            {journalFeedback && (
              <div style={{ fontSize: 11, marginBottom: 8, color: journalFeedback.type === "ok" ? "#10b981" : "#ef4444" }}>
                {journalFeedback.message}
              </div>
            )}
            {todayJournalEntries.length === 0 && <div style={{ fontSize: 12, color: C.textDim, padding: "6px 0" }}>no journal entries yet</div>}
            {todayJournalEntries.map(entry => (
              <div key={entry.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: "8px 9px", marginBottom: 6 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 10, color: C.textDim, minWidth: 52, marginTop: 1 }}>{formatEntryTime(entry.created_at)}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5, marginBottom: 6 }}>{entry.text}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {JOURNAL_TYPES.map(type => (
                        <button
                          key={type}
                          onClick={() => setJournalEntryType(entry.id, type)}
                          style={{
                            background: entry.type === type ? C.accentDim : "none",
                            border: entry.type === type ? `1px solid ${C.accent}` : `1px solid ${C.border}`,
                            color: entry.type === type ? C.accent : C.textDim,
                            borderRadius: 999,
                            padding: "2px 7px",
                            fontSize: 10,
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          {JOURNAL_TYPE_LABELS[type]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 1 }}>
                    <button
                      onClick={() => toggleJournalPinned(entry.id, !entry.pinned)}
                      style={{ background: "none", border: "none", color: entry.pinned ? C.accent : C.textDim, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}
                    >
                      {entry.pinned ? "pinned" : "pin"}
                    </button>
                    <button
                      onClick={() => softDeleteJournalEntry(entry.id)}
                      style={{ background: "none", border: "none", color: C.textDim, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}
                    >
                      remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20 }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 17, letterSpacing: 2, color: C.textMid, marginBottom: 12 }}>DEBRIEF</div>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, padding: "9px 10px", marginBottom: 12, fontSize: 11, color: C.textMid, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span>{completedTasksCount} completed</span>
              <span>{carryoversCount} open</span>
              <span>{followUpOrStuckCount} follow-up/stuck</span>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, display: "block", marginBottom: 5 }}>WHAT SHOULD TOMORROW START WITH?</label>
              <textarea
                value={dayNote}
                onChange={e => setDayNote(e.target.value)}
                placeholder="one clear starting point is enough..."
                style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontSize: 13, padding: "10px 12px", resize: "none", minHeight: 70, outline: "none", lineHeight: 1.6 }}
              />
            </div>
            <details style={{ marginBottom: 4 }}>
              <summary style={{ fontSize: 11, color: C.textDim, cursor: "pointer", marginBottom: 8 }}>more reflection (optional)</summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                <div>
                  <label style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, display: "block", marginBottom: 5 }}>WINS</label>
                  <textarea
                    value={wins}
                    onChange={e => setWins(e.target.value)}
                    placeholder="even tiny ones count..."
                    style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontSize: 12, padding: "9px 11px", resize: "none", minHeight: 58, outline: "none", lineHeight: 1.6 }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, display: "block", marginBottom: 5 }}>STUCK POINTS</label>
                  <textarea
                    value={hard}
                    onChange={e => setHard(e.target.value)}
                    placeholder="what got in the way?"
                    style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontSize: 12, padding: "9px 11px", resize: "none", minHeight: 58, outline: "none", lineHeight: 1.6 }}
                  />
                </div>
              </div>
            </details>
            <div style={{ display: "flex", gap: 10, marginTop: 15 }}>
              <button onClick={() => saveToday()} style={{ background: "none", border: `1px solid ${C.border}`, color: C.textMid, borderRadius: 4, padding: "9px 20px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Save debrief</button>
              <button onClick={archiveDay} style={{ background: C.accent, border: "none", color: "#fff", borderRadius: 4, padding: "9px 24px", fontSize: 12, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>Archive day →</button>
            </div>
          </div>
        </>}

        {/* CALENDAR */}
        {view === "calendar" && <CalendarView events={events} onEventsChange={saveEvents} />}

        {/* ARCHIVE */}
        {view === "archive" && <>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 3, color: C.textMid }}>ARCHIVE</div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{archiveCount} days logged · click to expand</div>
          </div>
          {archiveCount === 0 && <div style={{ color: C.textDim, fontSize: 13, padding: "40px 0", textAlign: "center" }}>no archived days yet</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {Object.entries(archive).sort((a, b) => b[0].localeCompare(a[0])).map(([key, day]) => {
              const isOpen = expandedArchive === key;
              const doneTasks = (day.tasks || []).filter(t => t.done);
              const pendingTasks = (day.tasks || []).filter(t => !t.done);
              return (
                <div key={key} className="ac" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden" }}
                  onClick={() => setExpandedArchive(isOpen ? null : key)}>
                  <div style={{ padding: "11px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 13 }}>{day.date || key}</div>
                      <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
                        {day.blocks?.length || 0} blocks · {MOODS[day.mood ?? 2]}
                        {day.tasks?.length > 0 && <span style={{ marginLeft: 8 }}>{doneTasks.length}/{day.tasks.length} tasks done</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button onClick={e => { e.stopPropagation(); printDay(day, tags); }}
                        style={{ background: "transparent", color: C.textDim, border: `1px solid ${C.border}`, padding: "2px 8px", borderRadius: 4, fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>print</button>
                      <button onClick={e => { e.stopPropagation(); if (window.confirm(`Delete ${day.date || key}? This cannot be undone.`)) deleteArchiveDay(key); }}
                        style={{ background: "transparent", color: "#ff4d4d", border: "1px solid #ff4d4d", padding: "2px 6px", borderRadius: 4, fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>delete</button>
                      <div style={{ color: C.textDim, fontSize: 11 }}>{isOpen ? "▲" : "▼"}</div>
                    </div>
                  </div>
                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${C.border}`, padding: "13px 16px" }} onClick={e => e.stopPropagation()}>
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, marginBottom: 7 }}>SCHEDULE</div>
                        {(day.blocks || []).sort((a,b) => timeToMinutes(a.time) - timeToMinutes(b.time)).map(b => {
                          const t = resolveTag(b.tag, tags);
                          const dur = b.duration || DEFAULT_DURATION;
                          const durStr = dur >= 60 ? `${Math.floor(dur/60)}h${dur%60 ? dur%60+"m" : ""}` : `${dur}m`;
                          return (
                            <div key={b.id} style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 5 }}>
                              <span style={{ fontSize: 10, color: t.color, minWidth: 62 }}>{b.time}</span>
                              <span style={{ fontSize: 10, color: C.textDim, minWidth: 28 }}>{durStr}</span>
                              <span style={{ fontSize: 12, color: C.text }}>{b.label}</span>
                              <span style={{ fontSize: 10, color: t.color, opacity: .7 }}>{t.label}</span>
                              {b.note && <span style={{ fontSize: 11, color: C.textDim, fontStyle: "italic" }}>— {b.note}</span>}
                            </div>
                          );
                        })}
                      </div>
                      {day.tasks?.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, marginBottom: 7 }}>TASKS</div>
                          {doneTasks.map(t => <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 4 }}>
                            <span style={{ fontSize: 11, color: "#10b981" }}>✓</span>
                            <span style={{ fontSize: 12, color: C.textDim, textDecoration: "line-through" }}>{t.label}</span>
                            {t.doneAt && <span style={{ fontSize: 10, color: C.textDim }}>{t.doneAt}</span>}
                          </div>)}
                          {pendingTasks.map(t => <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 4 }}>
                            <span style={{ fontSize: 11, color: C.textDim }}>○</span>
                            <span style={{ fontSize: 12, color: C.textDim }}>{t.label}</span>
                            <span style={{ fontSize: 10, color: C.accent, opacity: .6 }}>rolled over</span>
                          </div>)}
                        </div>
                      )}
                      {day.journal_entries?.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, marginBottom: 7 }}>JOURNAL</div>
                          {sortJournalEntries(day.journal_entries).map(j => (
                            <div key={j.id} style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 4 }}>
                              <span style={{ fontSize: 10, color: C.textDim, minWidth: 60 }}>{JOURNAL_TYPE_LABELS[j.type] || j.type}</span>
                              <span style={{ fontSize: 12, color: C.text }}>{j.text}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {day.wins && <div style={{ marginBottom: 10 }}><div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, marginBottom: 3 }}>WINS</div><div style={{ fontSize: 12, lineHeight: 1.6 }}>{day.wins}</div></div>}
                      {day.hard && <div style={{ marginBottom: 10 }}><div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, marginBottom: 3 }}>HARD STUFF</div><div style={{ fontSize: 12, lineHeight: 1.6 }}>{day.hard}</div></div>}
                      {day.day_note && <div><div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, marginBottom: 3 }}>NOTES</div><div style={{ fontSize: 12, lineHeight: 1.6 }}>{day.day_note}</div></div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>}

        {/* PATTERNS */}
        {view === "patterns" && <>
          {archiveCount < 3 ? (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
              <div style={{ color: C.textMid, fontSize: 14, marginBottom: 6 }}>not enough data yet</div>
              <div style={{ color: C.textDim, fontSize: 12 }}>archive {3 - archiveCount} more day{3 - archiveCount !== 1 ? "s" : ""} to unlock</div>
            </div>
          ) : <>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 3, color: C.textMid }}>PATTERNS</div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{patterns.totalDays} days · no judgment, just signal</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
              {[
                { label: "streak", value: `${patterns.streak}d`, sub: "in a row" },
                { label: "avg energy", value: MOODS[Math.round(patterns.avgMood)]?.split(" ")[0], sub: `${patterns.avgMood} / 4` },
                { label: "task rate", value: patterns.taskCompletionRate != null ? `${patterns.taskCompletionRate}%` : "—", sub: "completed" },
              ].map(s => (
                <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "13px 14px", textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontFamily: "'Bebas Neue',sans-serif", color: C.accent, letterSpacing: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 10, color: C.textDim, marginTop: 2, letterSpacing: .5 }}>{s.label}</div>
                  <div style={{ fontSize: 10, color: C.textDim }}>{s.sub}</div>
                </div>
              ))}
            </div>
            {patterns.moodData.length >= 3 && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "15px 18px", marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, marginBottom: 12 }}>ENERGY — last {patterns.moodData.length} days</div>
                <Sparkline data={patterns.moodData} />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                  <span style={{ fontSize: 10, color: C.textDim }}>{patterns.moodData[0]?.date?.split(",")[0]}</span>
                  <span style={{ fontSize: 10, color: C.textDim }}>today</span>
                </div>
              </div>
            )}
            {patterns.dowAvg.length > 0 && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "15px 18px", marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, marginBottom: 13 }}>ENERGY BY DAY OF WEEK</div>
                {patterns.dowAvg.slice(0, 5).map(d => <MiniBar key={d.dow} label={d.dow} value={d.avg} max={4} color={d.avg >= 3 ? "#10b981" : d.avg >= 2 ? "#6c63ff" : C.accent} sub={MOODS[Math.round(d.avg)]?.split(" ")[0]} />)}
              </div>
            )}
            {patterns.tagDist.length > 0 && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "15px 18px", marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, marginBottom: 13 }}>WHERE YOUR TIME GOES</div>
                {patterns.tagDist.slice(0, 8).map(([tagId, count]) => {
                  const t = resolveTag(tagId, tags);
                  return <MiniBar key={tagId} label={t.label} value={count} max={patterns.tagDist[0][1]} color={t.color} sub={`${count} blocks · ${Math.round(count / patterns.totalBlocks * 100)}%`} />;
                })}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
              {patterns.winWords.length > 0 && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "13px 15px" }}>
                  <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, marginBottom: 9 }}>WIN THEMES</div>
                  {patterns.winWords.map(([w, n]) => <span key={w} className="tag-chip" style={{ color: "#10b981", borderColor: "#10b98140", background: "#0d2e22" }}>{w} <span style={{ opacity: .5 }}>×{n}</span></span>)}
                </div>
              )}
              {patterns.derailWords.length > 0 && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: "13px 15px" }}>
                  <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, marginBottom: 9 }}>RECURRING FRICTION</div>
                  {patterns.derailWords.map(([w, n]) => <span key={w} className="tag-chip" style={{ color: "#f59e0b", borderColor: "#f59e0b40", background: "#2d2010" }}>{w} <span style={{ opacity: .5 }}>×{n}</span></span>)}
                </div>
              )}
            </div>
            <div style={{ fontSize: 11, color: C.textDim, textAlign: "center", paddingTop: 4, lineHeight: 1.8 }}>
              patterns are observations, not verdicts<br /><span style={{ opacity: .4 }}>signal gets clearer the longer you log</span>
            </div>
          </>}
        </>}
      </div>
    </div>
  );
}

