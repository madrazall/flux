// ── HelpSystem.jsx ───────────────────────────────────────────────────
// Drop this into src/ and import into App.jsx
// Usage: <HelpSystem firstVisit={isFirstVisit} onDone={() => setIsFirstVisit(false)} />
 
import { useState, useEffect } from "react";
 
const C = {
  bg: "#0e0e0f", surface: "#161618", card: "#1c1c1f", border: "#2a2a2e",
  accent: "#e8365d", accentDim: "#3d1220",
  text: "#f0f0f2", textMid: "#9090a0", textDim: "#50505a",
};
 
const STEPS = [
  {
    title: "Welcome to Flux",
    emoji: "👋",
    content: "Flux is a daily planner and journal that works with how your brain actually runs — not how it's supposed to. Here's a quick tour. Takes about 2 minutes.",
    tip: null,
  },
  {
    title: "Schedule blocks",
    emoji: "⏱",
    content: "Your day is built from blocks — each one has a time, a label, and a tag. Drag them to reorder whenever things shift. Hover a block to edit the note or remove it.",
    tip: "The time is a loose anchor, not a hard deadline. The point is structure, not precision.",
  },
  {
    title: "Tags",
    emoji: "🏷",
    content: "Every block gets a tag — work, personal, surviving, human stuff are built in. Type anything to create your own. Use a custom tag 3+ times across archived days and it earns its own colour and gets tracked in Patterns.",
    tip: "Tags are how Flux learns what your days are actually made of.",
  },
  {
    title: "Tasks",
    emoji: "✓",
    content: "The task drawer lives between your blocks and your journal. Tap ▸ tasks to open it. Add a task, hit enter. Check it off when it's done — it moves to 'done today' with a timestamp. You can also schedule a task for a future date.",
    tip: "When you archive the day, done tasks disappear and undone tasks roll to tomorrow automatically. After 3 days without being done, a quiet * appears — a nudge, not a judgment.",
  },
  {
    title: "Upcoming events",
    emoji: "📅",
    content: "The upcoming drawer shows what's coming. Events live in the Calendar tab — add anything there and it shows up in the drawer on the right day without you having to check. Today's events are highlighted in red.",
    tip: "Add your appointment in July right now and forget about it. Flux will surface it when it matters.",
  },
  {
    title: "Archive your day",
    emoji: "📦",
    content: "At the end of the day, fill in Wins, Hard Stuff, and the Free Note — then hit Archive day →. This locks the snapshot, clears done tasks, rolls undone tasks to tomorrow, and starts tomorrow clean.",
    tip: "Save draft saves without archiving — good if you want to come back later. But archiving is the move that triggers the rollover.",
  },
  {
    title: "Patterns",
    emoji: "📊",
    content: "The Patterns tab unlocks after 3 archived days. It lives in its own tab — never in your face. Inside: energy trends, best days of the week, where your time goes by tag, win themes, and recurring friction words pulled from your journal.",
    tip: "The longer you log, the clearer the signal. Patterns are observations, not verdicts.",
  },
  {
    title: "Print page",
    emoji: "🖨",
    content: "In the Archive tab, each day has a Print button. It generates a half-sheet (5.5×8.5) print page — schedule, tasks with checkmarks, energy level, wins and hard stuff. There's a dot grid margin for doodling. Toggle the free note on or off before printing.",
    tip: "Print and put it in a binder. Physical reference, pattern recognition you can flip through.",
  },
  {
    title: "You're set",
    emoji: "🎉",
    content: "That's everything. The ? button in the top nav is always there if you need a reminder. Your data saves to the cloud — works on any device, any browser.",
    tip: null,
  },
];
 
// ── Walkthrough modal ─────────────────────────────────────────────────
function Walkthrough({ onClose }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
 
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "#000000cc",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
      animation: "fadeIn .2s ease",
    }}>
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 10, maxWidth: 480, width: "100%",
        padding: "32px 32px 24px",
        boxShadow: "0 24px 80px #00000080",
        animation: "slideUp .25s ease",
      }}>
        {/* Progress dots */}
        <div style={{ display: "flex", gap: 5, marginBottom: 28 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              height: 3, flex: 1, borderRadius: 2,
              background: i <= step ? C.accent : C.border,
              transition: "background .2s",
            }} />
          ))}
        </div>
 
        {/* Content */}
        <div style={{ fontSize: 28, marginBottom: 14 }}>{current.emoji}</div>
        <div style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 22, letterSpacing: 2, color: C.text, marginBottom: 14,
        }}>{current.title}</div>
        <div style={{ fontSize: 13, color: C.textMid, lineHeight: 1.7, marginBottom: current.tip ? 16 : 24 }}>
          {current.content}
        </div>
        {current.tip && (
          <div style={{
            background: C.accentDim, border: `1px solid ${C.accent}30`,
            borderRadius: 5, padding: "10px 14px",
            fontSize: 11, color: C.textMid, lineHeight: 1.6,
            marginBottom: 24, fontStyle: "italic",
          }}>
            {current.tip}
          </div>
        )}
 
        {/* Nav */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 10, color: C.textDim }}>{step + 1} / {STEPS.length}</div>
          <div style={{ display: "flex", gap: 10 }}>
            {step > 0 && (
              <button onClick={() => setStep(step - 1)} style={{
                background: "none", border: `1px solid ${C.border}`,
                color: C.textDim, borderRadius: 4, padding: "8px 16px",
                fontSize: 12, cursor: "pointer", fontFamily: "inherit",
              }}>back</button>
            )}
            <button onClick={() => isLast ? onClose() : setStep(step + 1)} style={{
              background: isLast ? "#10b981" : C.accent,
              border: "none", color: "#fff", borderRadius: 4,
              padding: "8px 20px", fontSize: 12, cursor: "pointer",
              fontFamily: "inherit", fontWeight: 600,
            }}>
              {isLast ? "let's go →" : "next"}
            </button>
          </div>
        </div>
 
        {/* Skip */}
        {!isLast && (
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button onClick={onClose} style={{
              background: "none", border: "none", color: C.textDim,
              fontSize: 10, cursor: "pointer", fontFamily: "inherit",
              letterSpacing: .5,
            }}>skip tour</button>
          </div>
        )}
      </div>
    </div>
  );
}
 
// ── Help drawer (? button) ────────────────────────────────────────────
function HelpDrawer({ onClose }) {
  const [activeStep, setActiveStep] = useState(null);
 
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "#000000aa",
      display: "flex", justifyContent: "flex-end",
      animation: "fadeIn .15s ease",
    }} onClick={onClose}>
      <div style={{
        background: C.bg, border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${C.accent}`,
        width: "100%", maxWidth: 380,
        height: "100%", overflowY: "auto",
        padding: "28px 24px",
        animation: "slideRight .2s ease",
      }} onClick={e => e.stopPropagation()}>
 
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 2, color: C.accent }}>HOW FLUX WORKS</div>
            <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>tap any topic to expand</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.textDim, fontSize: 18, cursor: "pointer" }}>✕</button>
        </div>
 
        {/* Topics */}
        {STEPS.filter(s => s.title !== "Welcome to Flux" && s.title !== "You're set").map((s, i) => (
          <div key={i} style={{ marginBottom: 6 }}>
            <div onClick={() => setActiveStep(activeStep === i ? null : i)}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "11px 14px",
                background: activeStep === i ? C.accentDim : C.card,
                border: `1px solid ${activeStep === i ? C.accent + "40" : C.border}`,
                borderRadius: activeStep === i ? "6px 6px 0 0" : 6,
                cursor: "pointer", transition: "all .15s",
              }}>
              <span style={{ fontSize: 16 }}>{s.emoji}</span>
              <span style={{ flex: 1, fontSize: 12, color: activeStep === i ? C.accent : C.text }}>{s.title}</span>
              <span style={{ fontSize: 10, color: C.textDim, transform: activeStep === i ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▶</span>
            </div>
            {activeStep === i && (
              <div style={{
                background: C.surface, border: `1px solid ${C.accent}20`,
                borderTop: "none", borderRadius: "0 0 6px 6px",
                padding: "14px 16px",
              }}>
                <div style={{ fontSize: 12, color: C.textMid, lineHeight: 1.7, marginBottom: s.tip ? 12 : 0 }}>{s.content}</div>
                {s.tip && (
                  <div style={{
                    background: C.accentDim, borderRadius: 4,
                    padding: "8px 12px", fontSize: 11, color: C.textMid,
                    lineHeight: 1.6, fontStyle: "italic",
                  }}>{s.tip}</div>
                )}
              </div>
            )}
          </div>
        ))}
 
        {/* Ko-fi Link */}
        <div style={{ marginTop: 20, marginBottom: 20 }}>
          <a 
            href="https://ko-fi.com/fluxteam" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "12px 14px",
              background: C.accentDim,
              border: `1px solid ${C.accent}40`,
              borderRadius: 6,
              color: C.accent,
              textDecoration: "none",
              fontSize: 12,
              cursor: "pointer",
              transition: "all .15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent + "80"; e.currentTarget.style.background = C.accent + "15"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.accent + "40"; e.currentTarget.style.background = C.accentDim; }}
          >
            <span style={{ fontSize: 14 }}>☕</span>
            <span>Support on Ko-fi</span>
          </a>
        </div>
 
        <div style={{ marginTop: 24, padding: "16px 0", borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.textDim, lineHeight: 1.8, textAlign: "center" }}>
          flux · your data, your patterns, your pace
        </div>
      </div>
    </div>
  );
}
 
// ── Main export ───────────────────────────────────────────────────────
export default function HelpSystem() {
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
 
  useEffect(() => {
    const seen = localStorage.getItem("flux_help_seen");
    if (!seen) {
      setTimeout(() => setShowWalkthrough(true), 800);
    }
  }, []);
 
  function closeWalkthrough() {
    setShowWalkthrough(false);
    localStorage.setItem("flux_help_seen", "true");
  }
 
  return (
    <>
      {/* ? button — always visible */}
      <button
        onClick={() => setShowDrawer(true)}
        title="How Flux works"
        style={{
          background: "none",
          border: `1px solid ${C.border}`,
          color: C.textDim,
          borderRadius: "50%",
          width: 28, height: 28,
          fontSize: 12, cursor: "pointer",
          fontFamily: "inherit",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all .15s",
          flexShrink: 0,
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = C.accent; e.currentTarget.style.color = C.accent; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textDim; }}
      >?</button>
 
      {showWalkthrough && <Walkthrough onClose={closeWalkthrough} />}
      {showDrawer && <HelpDrawer onClose={() => setShowDrawer(false)} />}
 
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideRight { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
    </>
  );
}
 
