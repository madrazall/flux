import { useState, useEffect, useRef } from "react";
import HelpSystem from './HelpSystem.jsx'
import { createClient } from "@supabase/supabase-js";

// ── Supabase ─────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);

// ── Palette ──────────────────────────────────────────────────────────
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
const TIMES = Array.from({ length: 34 }, (_, i) => {
  const totalMins = 6 * 60 + i * 30;
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  const ampm = h < 12 ? "am" : "pm";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m === 0 ? "00" : "30"}${ampm}`;
});
const MOODS = ["🌑 crashed", "🌘 low", "🌗 okay", "🌕 good", "⭐ lit"];

// ── Helpers ───────────────────────────────────────────────────────────
function genId() { return Math.random().toString(36).slice(2, 9); }
function today() { return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }); }
function todayKey() { return new Date().toISOString().slice(0, 10); }
function nowStamp() {
  const d = new Date();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function formatEventDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (diff > 0 && diff < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function isToday(dateStr) { return dateStr === todayKey(); }
function isFuture(dateStr) { return dateStr >= todayKey(); }

// ── Timeline helpers ──────────────────────────────────────────────────
function timeToMinutes(timeStr) {
  const [time, ampm] = timeStr.split(/(am|pm)/);
  let [hours, minutes] = time.split(':').map(Number);
  if (ampm === 'pm' && hours !== 12) hours += 12;
  if (ampm === 'am' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const ampm = h < 12 ? "am" : "pm";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m === 0 ? "00" : "30"}${ampm}`;
}

function getTimeSlotIndex(timeStr) {
  const minutes = timeToMinutes(timeStr);
  const startMinutes = timeToMinutes(TIMES[0]);
  return Math.round((minutes - startMinutes) / 30);
}

function getTimeFromPosition(y, timelineHeight) {
  const slotHeight = timelineHeight / TIMES.length;
  const slotIndex = Math.floor(y / slotHeight);
  const clampedIndex = Math.max(0, Math.min(TIMES.length - 1, slotIndex));
  return TIMES[clampedIndex];
}

// ── NEW: Duration & time helpers ──────────────────────────────────────
function getMinutesDuration(startTime, endTime) {
  const startMins = timeToMinutes(startTime);
  const endMins = timeToMinutes(endTime);
  return Math.max(5, endMins - startMins);
}

function addMinutesToTime(timeStr, mins) {
  let totalMins = timeToMinutes(timeStr) + mins;
  // Handle day wraparound
  if (totalMins < 0) totalMins += 24 * 60;
  if (totalMins >= 24 * 60) totalMins -= 24 * 60;
  return minutesToTime(totalMins);
}

function roundToFiveMinutes(timeStr) {
  const mins = timeToMinutes(timeStr);
  const rounded = Math.round(mins / 5) * 5;
  return minutesToTime(rounded);
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
    { id: genId(), tag: "work",        label: "morning check-in", time: "8:00am", endTime: "8:30am", note: "" },
    { id: genId(), tag: "personal",    label: "slow start",       time: "8:30am", endTime: "9:00am", note: "" },
    { id: genId(), tag: "work",        label: "deep work",        time: "10:00am", endTime: "11:00am", note: "" },
    { id: genId(), tag: "personal",    label: "reset",            time: "12:00pm", endTime: "12:30pm", note: "" },
    { id: genId(), tag: "surviving",   label: "admin catch-up",   time: "2:00pm", endTime: "2:30pm", note: "" },
  ];
}

// ── Pattern helpers ───────────────────────────────────────────────────
const STOP = new Set(["the","a","an","and","or","but","i","my","to","was","it","in","of","that","so","just","is","on","at","for","with","had","not","no","be","have","did","got","this","what","when","w"]);
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
    const dow = new Date(d.key).toLocaleDateString("en-US", { weekday: "short" });
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
    const k = checkDate.toISOString().slice(0, 10);
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
    <span onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: small ? "2px 7px" : "3px 9px", borderRadius: 3, fontSize: small ? 10 : 11, background: tag.bg || C.surface, color: tag.color || C.text, border: `1px solid ${tag.color || C.border}`, cursor: "pointer" }}>
      {tag.label}
    </span>
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
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50, background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, minWidth: 170, boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
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
    const label = input.trim();
    if (!label) return;
    onTasksChange([...tasks, { id: genId(), label, done: false, addedAt: nowStamp(), scheduledFor: schedDate || null }]);
    setInput(""); setSchedDate(""); inputRef.current?.focus();
  }
  function toggleTask(id) {
    onTasksChange(tasks.map(t => t.id !== id ? t : { ...t, done: !t.done, doneAt: !t.done ? nowStamp() : undefined }));
  }
  function deleteTask(id) { onTasksChange(tasks.filter(t => t.id !== id)); }

  return (
    <div style={{ marginBottom: 20 }}>
      <div onClick={() => setOpen(!open)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: open ? "6px 6px 0 0" : "6px", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: C.textMid, letterSpacing: .5 }}>▸ tasks</span>
          <span style={{ fontSize: 11, color: C.textDim }}>
            {remaining > 0 ? <><span style={{ color: C.text }}>{remaining}</span> remaining</> : <span style={{ color: "#10b981" }}>all clear</span>}
            {doneToday > 0 && <span style={{ marginLeft: 8, color: "#10b981" }}>· {doneToday} done today</span>}
            {scheduled.length > 0 && <span style={{ marginLeft: 8, color: C.textDim }}>· {scheduled.length} scheduled</span>}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span onClick={e => { e.stopPropagation(); setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
            style={{ fontSize: 16, color: C.textDim, padding: "0 4px", lineHeight: 1, cursor: "pointer" }} title="add task">+</span>
          <span style={{ fontSize: 10, color: C.textDim, display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .2s" }}>▶</span>
        </div>
      </div>
      {open && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 6px 6px", padding: "12px 14px" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addTask()}
              placeholder="add a task, hit enter..."
              style={{ flex: 1, background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: "7px 10px", fontSize: 13, outline: "none", minWidth: 160 }} />
            <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)}
              title="schedule for a future date"
              style={{ background: C.card, border: `1px solid ${C.border}`, color: schedDate ? C.text : C.textDim, borderRadius: 4, padding: "7px 8px", fontSize: 12, outline: "none", fontFamily: "inherit" }} />
            <button onClick={addTask}
              style={{ background: C.accentDim, border: `1px solid ${C.accent}40`, color: C.accent, borderRadius: 4, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>add</button>
          </div>

          {pending.length === 0 && done.length === 0 && scheduled.length === 0 && (
            <div style={{ fontSize: 12, color: C.textDim, padding: "8px 0", textAlign: "center" }}>nothing here yet</div>
          )}
          {pending.length === 0 && done.length > 0 && (
            <div style={{ fontSize: 12, color: "#10b981", padding: "6px 0", textAlign: "center" }}>everything done 🎉</div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {pending.map(task => (
              <div key={task.id} className="task-row"
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 8px", borderRadius: 4, background: C.card, border: `1px solid ${C.border}` }}>
                <div onClick={() => toggleTask(task.id)}
                  style={{ width: 16, height: 16, borderRadius: 3, border: `1.5px solid ${C.border}`, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "#10b981"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = C.border} />
                <span style={{ flex: 1, fontSize: 13, color: C.text }}>{task.label}</span>
                {task.addedAt && <span style={{ fontSize: 10, color: C.textDim }}>{task.addedAt}</span>}
                <button onClick={() => deleteTask(task.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: C.textDim, fontSize: 11, padding: "1px 3px", opacity: 0, transition: "opacity .15s" }}
                  className="task-del">✕</button>
              </div>
            ))}
          </div>

          {scheduled.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, marginBottom: 6 }}>SCHEDULED</div>
              {scheduled.map(task => (
                <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 4, marginBottom: 3, background: C.card, border: `1px solid ${C.border}`, opacity: .7 }}>
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
                  <div onClick={() => toggleTask(task.id)}
                    style={{ width: 16, height: 16, borderRadius: 3, border: "1.5px solid #10b981", background: "#10b98120", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 10, color: "#10b981" }}>✓</span>
                  </div>
                  <span style={{ flex: 1, fontSize: 12, color: C.textDim, textDecoration: "line-through" }}>{task.label}</span>
                  <span style={{ fontSize: 10, color: C.textDim }}>{task.doneAt}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.textDim, lineHeight: 1.6 }}>
            archive day → snapshot saved · done cleared · undone rolls to tomorrow
          </div>
        </div>
      )}
    </div>
  );
}

// ── Upcoming Events Drawer ────────────────────────────────────────────
function UpcomingDrawer({ events }) {
  const [open, setOpen] = useState(false);
  const upcoming = events
    .filter(e => isFuture(e.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const todayEvents = upcoming.filter(e => isToday(e.date));
  const futureEvents = upcoming.filter(e => !isToday(e.date)).slice(0, 5);
  const next = upcoming.find(e => !isToday(e.date));
  const thisWeek = upcoming.filter(e => {
    const diff = Math.round((new Date(e.date + "T00:00:00") - new Date()) / 86400000);
    return diff > 0 && diff <= 7;
  }).length;

  return (
    <div style={{ marginBottom: 20 }}>
      <div onClick={() => setOpen(!open)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: open ? "6px 6px 0 0" : "6px", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: C.textMid, letterSpacing: .5 }}>▸ upcoming</span>
          <span style={{ fontSize: 11, color: C.textDim }}>
            {todayEvents.length > 0 && <span style={{ color: C.accent }}>{todayEvents.length} today</span>}
            {todayEvents.length > 0 && thisWeek > 0 && <span style={{ color: C.textDim }}> · </span>}
            {thisWeek > 0 && <span>{thisWeek} this week</span>}
            {todayEvents.length === 0 && thisWeek === 0 && next && <span>next: <span style={{ color: C.text }}>{next.title}</span> {formatEventDate(next.date)}{next.time ? ` ${next.time}` : ""}</span>}
            {upcoming.length === 0 && <span style={{ color: C.textDim }}>nothing scheduled</span>}
          </span>
        </div>
        <span style={{ fontSize: 10, color: C.textDim, display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .2s" }}>▶</span>
      </div>
      {open && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderTop: "none", borderRadius: "0 0 6px 6px", padding: "12px 14px" }}>
          {todayEvents.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: C.accent, letterSpacing: 1, marginBottom: 7 }}>TODAY</div>
              {todayEvents.map(e => (
                <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "6px 8px", background: C.accentDim, border: `1px solid ${C.accent}30`, borderRadius: 4, marginBottom: 4 }}>
                  {e.time && <span style={{ fontSize: 11, color: C.accent, minWidth: 50 }}>{e.time}</span>}
                  <span style={{ fontSize: 13, color: C.text }}>{e.title}</span>
                  {e.note && <span style={{ fontSize: 11, color: C.textDim, fontStyle: "italic" }}>— {e.note}</span>}
                </div>
              ))}
            </div>
          )}
          {futureEvents.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, marginBottom: 7 }}>COMING UP</div>
              {futureEvents.map(e => (
                <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "5px 8px", marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: "#38bdf8", minWidth: 70 }}>{formatEventDate(e.date)}{e.time ? ` ${e.time}` : ""}</span>
                  <span style={{ fontSize: 12, color: C.text }}>{e.title}</span>
                  {e.note && <span style={{ fontSize: 11, color: C.textDim, fontStyle: "italic" }}>— {e.note}</span>}
                </div>
              ))}
            </div>
          )}
          {upcoming.length === 0 && <div style={{ fontSize: 12, color: C.textDim, textAlign: "center", padding: "8px 0" }}>nothing scheduled — add events in the Calendar tab</div>}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.textDim }}>
            manage events in the Calendar tab
          </div>
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
    setNewEvent({ title: "", date: "", time: "", note: "" });
    setAdding(false);
  }
  function deleteEvent(id) { onEventsChange(events.filter(e => e.id !== id)); }

  const grouped = present.reduce((acc, e) => {
    const month = new Date(e.date + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
    if (!acc[month]) acc[month] = [];
    acc[month].push(e);
    return acc;
  }, {});

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, letterSpacing: 3, color: C.textMid }}>CALENDAR</div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{present.length} upcoming · {past.length} past</div>
        </div>
        <button onClick={() => setAdding(!adding)}
          style={{ background: adding ? "none" : C.accent, border: adding ? `1px solid ${C.border}` : "none", color: adding ? C.textDim : "#fff", borderRadius: 4, padding: "8px 18px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          {adding ? "cancel" : "+ add event"}
        </button>
      </div>

      {adding && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, marginBottom: 12 }}>NEW EVENT</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input autoFocus placeholder="what is it..." value={newEvent.title} onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
              onKeyDown={e => e.key === "Enter" && addEvent()}
              style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: "8px 10px", fontSize: 13, outline: "none" }} />
            <div style={{ display: "flex", gap: 10 }}>
              <input type="date" value={newEvent.date} onChange={e => setNewEvent({ ...newEvent, date: e.target.value })}
                style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: "8px 10px", fontSize: 12, outline: "none", fontFamily: "inherit" }} />
              <input type="time" value={newEvent.time} onChange={e => setNewEvent({ ...newEvent, time: e.target.value })}
                placeholder="time (optional)"
                style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: "8px 10px", fontSize: 12, outline: "none", fontFamily: "inherit" }} />
            </div>
            <input placeholder="note (optional)" value={newEvent.note} onChange={e => setNewEvent({ ...newEvent, note: e.target.value })}
              style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: "8px 10px", fontSize: 12, outline: "none" }} />
            <button onClick={addEvent}
              style={{ background: C.accent, border: "none", color: "#fff", borderRadius: 4, padding: "8px 20px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", alignSelf: "flex-start" }}>
              Add Event
            </button>
          </div>
        </div>
      )}

      {present.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: C.textDim, fontSize: 13 }}>nothing scheduled yet</div>
      )}

      {Object.entries(grouped).map(([month, evs]) => (
        <div key={month} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 2, marginBottom: 10, textTransform: "uppercase" }}>{month}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {evs.map(e => {
              const d = new Date(e.date + "T00:00:00");
              const isItToday = isToday(e.date);
              return (
                <div key={e.id} style={{ display: "flex", gap: 14, alignItems: "center", padding: "10px 14px", background: isItToday ? C.accentDim : C.card, border: `1px solid ${isItToday ? C.accent + "40" : C.border}`, borderRadius: 6 }}>
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
                  <button onClick={() => deleteEvent(e.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: C.textDim, fontSize: 12, padding: "2px 4px" }}>✕</button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {past.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ fontSize: 11, color: C.textDim, cursor: "pointer", letterSpacing: 1, listStyle: "none", marginBottom: 10 }}>
            ▸ {past.length} past event{past.length !== 1 ? "s" : ""}
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, opacity: .4 }}>
            {past.reverse().map(e => (
              <div key={e.id} style={{ display: "flex", gap: 10, padding: "6px 10px", borderRadius: 4 }}>
                <span style={{ fontSize: 11, color: C.textDim, minWidth: 80 }}>{new Date(e.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                <span style={{ fontSize: 12, color: C.textDim, textDecoration: "line-through" }}>{e.title}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// ── Email/Password Auth ──────────────────────────────────────────────
function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("signin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  async function handleAuth() {
    setError("");
    setSuccessMsg("");
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) {
          setError(signUpError.message);
        } else {
          setSuccessMsg("Account created! Check your email to confirm.");
          setTimeout(() => {
            setMode("signin");
            setPassword("");
            setEmail("");
          }, 2000);
        }
      } else if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setError(signInError.message);
        }
      } else if (mode === "forgot") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email);
        if (resetError) {
          setError(resetError.message);
        } else {
          setSuccessMsg("Reset link sent to your email");
          setEmail("");
        }
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'DM Mono','Fira Code','Courier New',monospace", position: "relative", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Bebas+Neue&family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        
        .glow {
          position: fixed; top: -200px; left: 50%; transform: translateX(-50%);
          width: 800px; height: 600px;
          background: radial-gradient(ellipse at center, ${C.accent}18 0%, transparent 70%);
          pointer-events: none; z-index: 0;
        }
        
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .feature-card {
          background: ${C.card}; border: 1px solid ${C.border};
          padding: 28px 24px; position: relative; overflow: hidden; transition: border-color .2s;
        }
        .feature-card:hover { border-color: ${C.accent}30; }
        .feature-card::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
          background: ${C.accent}; transform: scaleX(0); transform-origin: left; transition: transform .3s ease;
        }
        .feature-card:hover::before { transform: scaleX(1); }
      `}</style>

      <div className="glow" />

      {/* Nav */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, padding: "20px 48px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 4, color: C.accent }}>FLUX</div>
      </div>

      {/* Hero Section */}
      <section style={{ position: "relative", zIndex: 1, minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start", padding: "120px 48px 80px", maxWidth: 960 }}>
        <div style={{ fontSize: 10, letterSpacing: 4, color: C.accent, textTransform: "uppercase", marginBottom: 24, opacity: 0, animation: "fadeUp .6s ease .2s forwards" }}>
          A different kind of daily
        </div>

        <h1 style={{ fontFamily: "'Playfair Display',serif", fontSize: "clamp(52px, 8vw, 96px)", lineHeight: .95, letterSpacing: -2, color: C.text, marginBottom: 8, opacity: 0, animation: "fadeUp .7s ease .3s forwards" }}>
          Built for brains<br />
          <em style={{ fontStyle: "italic", color: C.accent }}>in</em><br />
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: "clamp(56px, 9vw, 108px)", letterSpacing: 6, display: "block" }}>FLUX</span>
        </h1>

        <p style={{ fontSize: 13, color: C.textMid, lineHeight: 1.8, maxWidth: 440, marginTop: 28, marginBottom: 24, opacity: 0, animation: "fadeUp .7s ease .5s forwards" }}>
          A daily planner that bends instead of breaks. Structure without the rigidity. Flexible blocks, real data about how your days actually go, and a rhythm that works <em>with</em> you.
        </p>

        <p style={{ fontSize: 13, color: C.textMid, lineHeight: 1.8, maxWidth: 440, marginBottom: 52, opacity: 0, animation: "fadeUp .7s ease .5s forwards" }}>
          Built for clarity. Built to last.
        </p>

        {/* Auth Form */}
        <div style={{ opacity: 0, animation: "fadeUp .7s ease .65s forwards", width: "100%", maxWidth: 360 }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: C.textDim, textTransform: "uppercase", marginBottom: 10 }}>
              {mode === "signin" ? "Sign In" : mode === "signup" ? "Create Account" : "Reset Password"}
            </div>
          </div>

          {mode === "forgot" ? (
            <div style={{ marginBottom: 16 }}>
              <input
                type="email"
                placeholder="your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAuth()}
                disabled={loading}
                style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: "12px 14px", fontSize: 13, outline: "none", fontFamily: "inherit" }}
              />
              <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.5 }}>
                we'll send you a link to reset your password
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              <input
                type="email"
                placeholder="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAuth()}
                disabled={loading}
                style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: "12px 14px", fontSize: 13, outline: "none", fontFamily: "inherit" }}
              />
              <input
                type="password"
                placeholder="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAuth()}
                disabled={loading}
                style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: "12px 14px", fontSize: 13, outline: "none", fontFamily: "inherit" }}
              />
            </div>
          )}

          {error && (
            <div style={{ fontSize: 12, color: "#ef4444", marginBottom: 16, padding: "10px", background: "#1f0000", borderRadius: 4, textAlign: "center" }}>
              {error}
            </div>
          )}

          {successMsg && (
            <div style={{ fontSize: 12, color: "#10b981", marginBottom: 16, padding: "10px", background: "#001f00", borderRadius: 4, textAlign: "center" }}>
              {successMsg}
            </div>
          )}

          <button
            onClick={handleAuth}
            disabled={loading || !email || (mode !== "forgot" && !password)}
            style={{ width: "100%", background: C.accent, border: "none", color: "#fff", borderRadius: 4, padding: "12px 16px", fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", cursor: loading || !email || (mode !== "forgot" && !password) ? "default" : "pointer", fontFamily: "inherit", opacity: loading || !email || (mode !== "forgot" && !password) ? 0.6 : 1 }}
          >
            {loading ? "loading..." : mode === "signin" ? "Sign In" : mode === "signup" ? "Create Account" : "Send Reset Link"}
          </button>

          {mode !== "forgot" && (
            <button
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setSuccessMsg(""); }}
              disabled={loading}
              style={{ width: "100%", background: "none", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 4, padding: "12px 16px", fontSize: 12, cursor: loading ? "default" : "pointer", fontFamily: "inherit", marginTop: 8 }}
            >
              {mode === "signin" ? "Create Account" : "Back to Sign In"}
            </button>
          )}

          {mode === "signin" && (
            <button
              onClick={() => { setMode("forgot"); setError(""); setSuccessMsg(""); }}
              disabled={loading}
              style={{ width: "100%", background: "none", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 4, padding: "12px 16px", fontSize: 12, cursor: loading ? "default" : "pointer", fontFamily: "inherit", marginTop: 8 }}
            >
              Forgot password?
            </button>
          )}

          {mode === "forgot" && (
            <button
              onClick={() => { setMode("signin"); setError(""); setSuccessMsg(""); setEmail(""); }}
              disabled={loading}
              style={{ width: "100%", background: "none", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 4, padding: "12px 16px", fontSize: 12, cursor: loading ? "default" : "pointer", fontFamily: "inherit", marginTop: 8 }}
            >
              Back to Sign In
            </button>
          )}

          <div style={{ fontSize: 10, color: C.textDim, marginTop: 12, lineHeight: 1.5 }}>
            your data is yours · private by design
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ position: "relative", zIndex: 1, maxWidth: 960, margin: "0 auto", padding: "80px 48px" }}>
        <div style={{ fontSize: 9, letterSpacing: 4, color: C.textDim, textTransform: "uppercase", marginBottom: 48 }}>What's inside</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 2 }}>
          {[
            { num: "01", title: "A schedule that moves with you", desc: "Drag blocks to reorder when things shift. Resize blocks precisely. Time is flexible, structure is the point." },
            { num: "02", title: "Tasks that carry forward", desc: "Undone tasks roll to tomorrow when you archive. A quiet nudge, not a panic button." },
            { num: "03", title: "Tags that earn their place", desc: "Start with four defaults. Create any tag—use it enough and it becomes a tracked category." },
            { num: "04", title: "End of day debrief", desc: "Wins, hard stuff, brain dump. Three fields. Archive the day and start fresh tomorrow." },
            { num: "05", title: "A calendar that finds you", desc: "Add an appointment months out. It shows up in your day when it matters." },
            { num: "06", title: "Patterns on your terms", desc: "After a few days, see energy trends, recurring friction, where your time actually goes." }
          ].map(feature => (
            <div key={feature.num} className="feature-card">
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 11, letterSpacing: 3, color: C.accent, opacity: .5, marginBottom: 14 }}>{feature.num}</div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 10, lineHeight: 1.2 }}>{feature.title}</div>
              <div style={{ fontSize: 11, color: C.textMid, lineHeight: 1.8 }}>{feature.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Manifesto */}
      <div style={{ position: "relative", zIndex: 1, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "60px 48px", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${C.accent}08 0%, transparent 60%)`, pointerEvents: "none" }} />
        <div style={{ maxWidth: 960, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 2fr", gap: 48, alignItems: "center", position: "relative", zIndex: 1 }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 48, letterSpacing: 3, color: C.accent, lineHeight: .9, opacity: .15 }}>FLUX</div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: "clamp(18px, 2.5vw, 26px)", lineHeight: 1.5, color: C.textMid, fontStyle: "italic" }}>
            This isn't productivity theater. It's about understanding <strong style={{ color: C.text, fontStyle: "normal" }}>your</strong> rhythm. By tracking what you actually do and how you feel, you get real signal. Not judgment.
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer style={{ position: "relative", zIndex: 1, maxWidth: 960, margin: "0 auto", padding: "32px 48px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, letterSpacing: 3, color: C.textDim }}>FLUX</div>
        <div style={{ fontSize: 10, color: C.textDim, letterSpacing: .5 }}>
          built with care · <a href="https://ko-fi.com/fluxteam" target="_blank" rel="noopener noreferrer" style={{ color: C.accent, textDecoration: "none" }}>support us</a>
        </div>
      </footer>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════
export default function App() {
  const [session, setSession]         = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetPassword, setResetPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);
  const [view, setView]               = useState("today");
  const [blocks, setBlocks]           = useState(makeDefaults());
  const [tasks, setTasks]             = useState([]);
  const [events, setEvents]           = useState([]);
  const [tags, setTags]               = useState(SEED_TAGS);
  const [dragging, setDragging]       = useState(null);
  const [resizing, setResizing]       = useState(null);
  const [mood, setMood]               = useState(2);
  const [dayNote, setDayNote]         = useState("");
  const [wins, setWins]               = useState("");
  const [hard, setHard]               = useState("");
  const [archive, setArchive]         = useState({});
  const [addingBlock, setAddingBlock] = useState
