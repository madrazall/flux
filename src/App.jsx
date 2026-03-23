import { useState, useEffect, useRef } from "react";
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
    { id: genId(), tag: "work",        label: "morning check-in", time: "8:00am",  note: "" },
    { id: genId(), tag: "personal",    label: "slow start",       time: "8:30am",  note: "" },
    { id: genId(), tag: "work",        label: "deep work",        time: "10:00am", note: "" },
    { id: genId(), tag: "personal",    label: "reset",            time: "12:00pm", note: "" },
    { id: genId(), tag: "surviving",   label: "admin catch-up",   time: "2:00pm",  note: "" },
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
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: open ? "6px 6px 0 0" : "6px", cursor: "pointer", userSelect: "none" }}>
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
            style={{ fontSize: 16, color: C.textDim, padding: "0 4px", lineHeight: 1 }} title="add task">+</span>
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
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: open ? "6px 6px 0 0" : "6px", cursor: "pointer", userSelect: "none" }}>
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
                <div key={e.id} style={{ display: "flex", gap: 14, alignItems: "center", padding: "10px 14px", background: isItToday ? C.accentDim : C.card, border: `1px solid ${isItToday ? C.accent + "50" : C.border}`, borderLeft: `3px solid ${isItToday ? C.accent : "#38bdf8"}`, borderRadius: 6 }}>
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

// ── Magic Link Auth ───────────────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function sendLink() {
    if (!email.trim()) return;
    setLoading(true); setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin }
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono','Fira Code','Courier New',monospace" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Bebas+Neue&display=swap');*{box-sizing:border-box;margin:0;padding:0}input{font-family:inherit}`}</style>
      <div style={{ width: "100%", maxWidth: 380, padding: 32 }}>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 42, letterSpacing: 4, color: C.accent, marginBottom: 4 }}>FLUX</div>
        <div style={{ fontSize: 11, color: C.textDim, letterSpacing: 2, marginBottom: 40 }}>DAILY SCHEDULE + JOURNAL</div>
        {!sent ? (
          <>
            <div style={{ fontSize: 12, color: C.textMid, marginBottom: 16, lineHeight: 1.6 }}>enter your email and we'll send you a link — no password needed</div>
            <input autoFocus type="email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendLink()}
              placeholder="your@email.com"
              style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: "12px 14px", fontSize: 14, outline: "none", marginBottom: 12 }} />
            {error && <div style={{ fontSize: 11, color: C.accent, marginBottom: 10 }}>{error}</div>}
            <button onClick={sendLink} disabled={loading}
              style={{ width: "100%", background: C.accent, border: "none", color: "#fff", borderRadius: 4, padding: "12px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", opacity: loading ? .6 : 1 }}>
              {loading ? "sending..." : "send magic link →"}
            </button>
          </>
        ) : (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>📬</div>
            <div style={{ fontSize: 14, color: C.text, marginBottom: 8 }}>check your email</div>
            <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.7 }}>we sent a link to <span style={{ color: C.textMid }}>{email}</span><br />click it to get in — it expires in 1 hour</div>
            <button onClick={() => setSent(false)} style={{ marginTop: 24, background: "none", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 4, padding: "8px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>use a different email</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
export default function App() {
  const [session, setSession]         = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView]               = useState("today");
  const [blocks, setBlocks]           = useState(makeDefaults());
  const [tasks, setTasks]             = useState([]);
  const [events, setEvents]           = useState([]);
  const [tags, setTags]               = useState(SEED_TAGS);
  const [dragging, setDragging]       = useState(null);
  const [dragOver, setDragOver]       = useState(null);
  const [mood, setMood]               = useState(2);
  const [dayNote, setDayNote]         = useState("");
  const [wins, setWins]               = useState("");
  const [hard, setHard]               = useState("");
  const [archive, setArchive]         = useState({});
  const [addingBlock, setAddingBlock] = useState(false);
  const [newBlock, setNewBlock]       = useState({ tag: "work", label: "", time: "9:00am" });
  const [expandedArchive, setExpandedArchive] = useState(null);
  const [editingNote, setEditingNote] = useState(null);
  const [flash, setFlash]             = useState(null);
  const [dbLoading, setDbLoading]     = useState(false);
  const dragItem = useRef(null);

  // ── Auth ─────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Load data from Supabase ──────────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    loadData();
  }, [session]);

  async function loadData() {
    setDbLoading(true);
    const uid = session.user.id;
    try {
      const [{ data: userData }, { data: archiveData }, { data: eventsData }] = await Promise.all([
        supabase.from("user_data").select("*").eq("user_id", uid).single(),
        supabase.from("archive").select("*").eq("user_id", uid),
        supabase.from("events").select("*").eq("user_id", uid),
      ]);
      if (userData) {
        if (userData.tags) setTags(userData.tags);
        if (userData.today_key === todayKey()) {
          if (userData.blocks) setBlocks(userData.blocks);
          if (userData.tasks) setTasks(userData.tasks);
          if (userData.mood !== undefined) setMood(userData.mood);
          if (userData.day_note) setDayNote(userData.day_note);
          if (userData.wins) setWins(userData.wins);
          if (userData.hard) setHard(userData.hard);
        } else {
          // new day — roll over undone tasks
          const undone = (userData.tasks || []).filter(t => !t.done && (!t.scheduledFor || t.scheduledFor <= todayKey()));
          const scheduled = (userData.tasks || []).filter(t => !t.done && t.scheduledFor && t.scheduledFor > todayKey());
          setTasks([...undone.map(t => ({ ...t, addedAt: t.addedAt + " (rolled)" })), ...scheduled]);
          setBlocks(makeDefaults());
          setMood(2); setDayNote(""); setWins(""); setHard("");
        }
      }
      if (archiveData) {
        const archiveObj = {};
        archiveData.forEach(row => { archiveObj[row.day_key] = row.data; });
        setArchive(archiveObj);
      }
      if (eventsData) setEvents(eventsData.map(e => e.data));
    } catch (e) { console.error("load error", e); }
    setDbLoading(false);
  }

  async function saveToday(quiet = false) {
    if (!session) return;
    const uid = session.user.id;
    const payload = { user_id: uid, today_key: todayKey(), blocks, tasks, mood, day_note: dayNote, wins, hard, tags };
    await supabase.from("user_data").upsert(payload, { onConflict: "user_id" });
    if (!quiet) { setFlash("saved"); setTimeout(() => setFlash(null), 1600); }
  }

  async function archiveDay() {
    if (!session) return;
    const uid = session.user.id;
    let updatedTags = [...tags];
    blocks.forEach(b => { if (b.tag) updatedTags = bumpTagUse(b.tag, updatedTags); });
    setTags(updatedTags);
    const dayData = { blocks, mood, day_note: dayNote, wins, hard, tasks, date: today(), key: todayKey() };
    await Promise.all([
      supabase.from("archive").upsert({ user_id: uid, day_key: todayKey(), data: dayData }, { onConflict: "user_id,day_key" }),
      supabase.from("user_data").upsert({ user_id: uid, today_key: todayKey(), blocks, tags: updatedTags, mood, day_note: dayNote, wins, hard, tasks }, { onConflict: "user_id" }),
    ]);
    const updatedArchive = { ...archive, [todayKey()]: dayData };
    setArchive(updatedArchive);
    const undone = tasks.filter(t => !t.done);
    setTasks(undone);
    setFlash("archived"); setTimeout(() => setFlash(null), 2000);
  }

  async function saveEvents(newEvents) {
    setEvents(newEvents);
    if (!session) return;
    const uid = session.user.id;
    await supabase.from("events").delete().eq("user_id", uid);
    if (newEvents.length > 0) {
      await supabase.from("events").insert(newEvents.map(e => ({ user_id: uid, event_id: e.id, data: e })));
    }
  }

  async function persistTags(t) {
    setTags(t);
    if (!session) return;
    const uid = session.user.id;
    await supabase.from("user_data").upsert({ user_id: uid, today_key: todayKey(), tags: t }, { onConflict: "user_id" });
  }

  function handleDragStart(id) { dragItem.current = id; setDragging(id); }
  function handleDragOver(e, id) { e.preventDefault(); setDragOver(id); }
  function handleDrop(targetId) {
    if (!dragItem.current || dragItem.current === targetId) { setDragging(null); setDragOver(null); return; }
    const from = blocks.findIndex(b => b.id === dragItem.current), to = blocks.findIndex(b => b.id === targetId);
    const next = [...blocks]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved);
    setBlocks(next); setDragging(null); setDragOver(null); dragItem.current = null;
  }
  function updateBlock(id, patch) { setBlocks(blocks.map(b => b.id === id ? { ...b, ...patch } : b)); }
  function deleteBlock(id) { setBlocks(blocks.filter(b => b.id !== id)); }
  function addBlock() {
    if (!newBlock.label.trim()) return;
    setBlocks([...blocks, { ...newBlock, id: genId(), note: "" }]);
    setNewBlock({ tag: "work", label: "", time: "9:00am" }); setAddingBlock(false);
  }

  const archiveCount = Object.keys(archive).length;
  const patterns = computePatterns(archive, tags);
  const promotedTags = tags.filter(t => t.pinned || (t.uses || 0) >= PROMOTE_THRESHOLD);

  if (authLoading) return <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", color: C.textDim, fontFamily: "monospace" }}>loading...</div>;
  if (!session) return <AuthScreen />;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'DM Mono','Fira Code','Courier New',monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Bebas+Neue&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:${C.bg}}::-webkit-scrollbar-thumb{background:${C.border};border-radius:2px}
        textarea,input{font-family:inherit}
        .br:hover .ba{opacity:1!important}
        .task-row:hover .task-del{opacity:1!important}
        .drag-over{border-top:2px solid ${C.accent}!important}
        .nav{background:none;border:none;border-bottom:2px solid transparent;cursor:pointer;padding:6px 14px;font-family:inherit;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;transition:all .15s}
        .nav.on{color:${C.accent};border-bottom-color:${C.accent}}
        .nav:not(.on){color:${C.textDim}}
        .nav:hover:not(.on){color:${C.textMid}}
        .ac{cursor:pointer;transition:background .15s}
        .ac:hover{background:#222226!important}
        .fl{animation:fi .25s ease}
        @keyframes fi{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}
        .tag-chip{display:inline-block;padding:3px 8px;border-radius:3px;font-size:11px;margin:3px 3px 0 0;border:1px solid}
        .addbtn{width:100%;background:none;border:1px dashed ${C.border};color:${C.textDim};border-radius:6px;padding:9px;font-size:12px;cursor:pointer;letter-spacing:1px;transition:all .15s;font-family:inherit}
        .addbtn:hover{border-color:${C.accent};color:${C.accent}}
        details summary::-webkit-details-marker{display:none}
      `}</style>

      {/* Nav */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: "0 24px", position: "sticky", top: 0, background: C.bg, zIndex: 20 }}>
        <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, letterSpacing: 3, color: C.accent }}>FLUX</div>
            {flash && <span className="fl" style={{ fontSize: 11, color: flash === "archived" ? "#10b981" : C.textMid }}>{flash === "archived" ? "archived ✓" : "saved"}</span>}
            {dbLoading && <span style={{ fontSize: 11, color: C.textDim }}>syncing...</span>}
          </div>
          <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
            <button className={`nav${view === "today" ? " on" : ""}`} onClick={() => setView("today")}>Today</button>
            <button className={`nav${view === "calendar" ? " on" : ""}`} onClick={() => setView("calendar")}>Calendar</button>
            <button className={`nav${view === "archive" ? " on" : ""}`} onClick={() => setView("archive")}>Archive{archiveCount > 0 ? ` · ${archiveCount}` : ""}</button>
            <button className={`nav${view === "patterns" ? " on" : ""}`} onClick={() => setView("patterns")} style={{ opacity: archiveCount < 3 ? .3 : 1 }}>Patterns</button>
            <button onClick={() => supabase.auth.signOut()} style={{ background: "none", border: "none", cursor: "pointer", color: C.textDim, fontSize: 10, padding: "6px 8px", fontFamily: "inherit", letterSpacing: 1 }} title="sign out">out</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "22px 24px 80px" }}>

        {/* ══ TODAY ══ */}
        {view === "today" && <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 13, color: C.textMid }}>{today()}</div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 3 }}>drag to reorder · hover for options</div>
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
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 10, color: C.textDim, letterSpacing: .5 }}>tags:</span>
              {promotedTags.map(t => <TagPill key={t.id} tag={t} small />)}
            </div>
          )}

          {/* Blocks */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 }}>
            {blocks.map(block => {
              const tag = resolveTag(block.tag, tags);
              return (
                <div key={block.id} className={`br${dragOver === block.id ? " drag-over" : ""}`}
                  draggable onDragStart={() => handleDragStart(block.id)}
                  onDragOver={e => handleDragOver(e, block.id)} onDrop={() => handleDrop(block.id)}
                  onDragEnd={() => { setDragging(null); setDragOver(null); }}
                  style={{ background: dragging === block.id ? "#1e1e21" : C.card, border: `1px solid ${dragging === block.id ? tag.color : C.border}`, borderLeft: `3px solid ${tag.color || C.border}`, borderRadius: 6, padding: "10px 14px", cursor: "grab", opacity: dragging === block.id ? .5 : 1, transition: "border-color .15s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ color: C.textDim, fontSize: 13, userSelect: "none" }}>⠿</span>
                    <select value={block.time} onChange={e => updateBlock(block.id, { time: e.target.value })} onClick={e => e.stopPropagation()}
                      style={{ background: tag.bg || C.surface, border: `1px solid ${tag.color || C.border}30`, color: tag.color || C.textDim, borderRadius: 3, fontSize: 11, padding: "2px 5px", cursor: "pointer", minWidth: 72, fontFamily: "inherit" }}>
                      {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <span style={{ flex: 1, fontSize: 13, color: C.text }}>{block.label}</span>
                    <div onClick={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}>
                      <TagSelector tags={tags} value={block.tag} onChange={tagId => updateBlock(block.id, { tag: tagId })} onCreateTag={persistTags} />
                    </div>
                    <div className="ba" style={{ display: "flex", gap: 4, opacity: 0, transition: "opacity .15s" }}>
                      <button onClick={e => { e.stopPropagation(); setEditingNote(editingNote === block.id ? null : block.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.textDim, fontSize: 13, padding: "2px 4px" }} title="note">📝</button>
                      <button onClick={e => { e.stopPropagation(); deleteBlock(block.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.textDim, fontSize: 12, padding: "2px 4px" }} title="remove">✕</button>
                    </div>
                  </div>
                  {editingNote === block.id && (
                    <textarea autoFocus placeholder="note this block..." value={block.note}
                      onChange={e => updateBlock(block.id, { note: e.target.value })}
                      onClick={e => e.stopPropagation()} onDragStart={e => e.stopPropagation()}
                      style={{ width: "100%", marginTop: 10, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontSize: 12, padding: "8px 10px", resize: "none", minHeight: 54, lineHeight: 1.5, outline: "none" }} />
                  )}
                  {block.note && editingNote !== block.id && (
                    <div style={{ marginTop: 5, fontSize: 11, color: C.textMid, paddingLeft: 24, fontStyle: "italic" }}>{block.note}</div>
                  )}
                </div>
              );
            })}
          </div>

          {addingBlock ? (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 6, padding: 14, marginBottom: 22 }}>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 10, letterSpacing: 1 }}>NEW BLOCK</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input autoFocus placeholder="what is it..." value={newBlock.label} onChange={e => setNewBlock({ ...newBlock, label: e.target.value })}
                  onKeyDown={e => e.key === "Enter" && addBlock()}
                  style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: "7px 10px", fontSize: 13, outline: "none", minWidth: 130 }} />
                <div style={{ fontSize: 11, color: C.textDim }}>tag:</div>
                <TagSelector tags={tags} value={newBlock.tag} onChange={tagId => setNewBlock({ ...newBlock, tag: tagId })} onCreateTag={persistTags} />
                <select value={newBlock.time} onChange={e => setNewBlock({ ...newBlock, time: e.target.value })}
                  style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 4, padding: "7px 10px", fontSize: 12, fontFamily: "inherit" }}>
                  {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={addBlock} style={{ background: C.accent, border: "none", color: "#fff", borderRadius: 4, padding: "7px 18px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Add</button>
                <button onClick={() => setAddingBlock(false)} style={{ background: "none", border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 4, padding: "7px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="addbtn" onClick={() => setAddingBlock(true)} style={{ marginBottom: 22 }}>+ add block</button>
          )}

          {/* Drawers */}
          <TaskDrawer tasks={tasks} onTasksChange={setTasks} />
          <UpcomingDrawer events={events} />

          {/* Journal */}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 20 }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 17, letterSpacing: 2, color: C.textMid, marginBottom: 15 }}>END OF DAY DEBRIEF</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { label: "WINS — what actually worked", val: wins, set: setWins, ph: "even tiny ones count..." },
                { label: "HARD STUFF — what derailed you", val: hard, set: setHard, ph: "no judgment, just data..." },
                { label: "FREE NOTE — brain dump", val: dayNote, set: setDayNote, ph: "whatever's still bouncing around...", tall: true },
              ].map(f => (
                <div key={f.label}>
                  <label style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, display: "block", marginBottom: 5 }}>{f.label}</label>
                  <textarea value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph}
                    style={{ width: "100%", background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontSize: 13, padding: "10px 12px", resize: "none", minHeight: f.tall ? 84 : 64, outline: "none", lineHeight: 1.6 }} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 15 }}>
              <button onClick={() => saveToday()} style={{ background: "none", border: `1px solid ${C.border}`, color: C.textMid, borderRadius: 4, padding: "9px 20px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Save draft</button>
              <button onClick={archiveDay} style={{ background: C.accent, border: "none", color: "#fff", borderRadius: 4, padding: "9px 24px", fontSize: 12, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" }}>Archive day →</button>
            </div>
          </div>
        </>}

        {/* ══ CALENDAR ══ */}
        {view === "calendar" && <CalendarView events={events} onEventsChange={saveEvents} />}

        {/* ══ ARCHIVE ══ */}
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
                    <div style={{ color: C.textDim, fontSize: 11 }}>{isOpen ? "▲" : "▼"}</div>
                  </div>
                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${C.border}`, padding: "13px 16px" }} onClick={e => e.stopPropagation()}>
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, marginBottom: 7 }}>SCHEDULE</div>
                        {(day.blocks || []).map(b => {
                          const t = resolveTag(b.tag, tags);
                          return (
                            <div key={b.id} style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 5 }}>
                              <span style={{ fontSize: 10, color: t.color, minWidth: 62 }}>{b.time}</span>
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
                          {doneTasks.map(t => (
                            <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 4 }}>
                              <span style={{ fontSize: 11, color: "#10b981" }}>✓</span>
                              <span style={{ fontSize: 12, color: C.textDim, textDecoration: "line-through" }}>{t.label}</span>
                              {t.doneAt && <span style={{ fontSize: 10, color: C.textDim }}>{t.doneAt}</span>}
                            </div>
                          ))}
                          {pendingTasks.map(t => (
                            <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 4 }}>
                              <span style={{ fontSize: 11, color: C.textDim }}>○</span>
                              <span style={{ fontSize: 12, color: C.textDim }}>{t.label}</span>
                              <span style={{ fontSize: 10, color: C.accent, opacity: .6 }}>rolled over</span>
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

        {/* ══ PATTERNS ══ */}
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
                {patterns.dowAvg.slice(0, 5).map(d => (
                  <MiniBar key={d.dow} label={d.dow} value={d.avg} max={4}
                    color={d.avg >= 3 ? "#10b981" : d.avg >= 2 ? "#6c63ff" : C.accent}
                    sub={MOODS[Math.round(d.avg)]?.split(" ")[0]} />
                ))}
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
