/**
 * FeedbackButton.jsx
 *
 * Floating feedback / support button. Sits in the bottom-right corner of the app.
 * Opens a small modal with a message form. Sends via /api/send-feedback (Resend).
 *
 * Usage in App.jsx — drop this just before the closing </div> of the main app render:
 *   import FeedbackButton from './FeedbackButton';
 *   <FeedbackButton userEmail={session.user.email} />
 */

import { useState } from "react";

const TYPES = [
  { value: "bug",     label: "Bug report" },
  { value: "feature", label: "Feature request" },
  { value: "account", label: "Account / billing" },
  { value: "other",   label: "Something else" },
];

export default function FeedbackButton({ userEmail = "" }) {
  const [open, setOpen]       = useState(false);
  const [type, setType]       = useState("bug");
  const [message, setMessage] = useState("");
  const [status, setStatus]   = useState("idle"); // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSend() {
    if (!message.trim()) return;
    setStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch("/api/send-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, message: message.trim(), userEmail }),
      });
      if (res.ok) {
        setStatus("sent");
        setTimeout(() => {
          setOpen(false);
          setStatus("idle");
          setMessage("");
          setType("bug");
        }, 2200);
      } else {
        const d = await res.json().catch(() => ({}));
        setErrorMsg(d.error || "Could not send. Try again.");
        setStatus("error");
      }
    } catch {
      setErrorMsg("Connection error. Try again.");
      setStatus("error");
    }
  }

  function handleClose() {
    if (status === "sending") return;
    setOpen(false);
    setStatus("idle");
    setErrorMsg("");
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(true)}
        title="Feedback &amp; support"
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 200,
          width: 44, height: 44, borderRadius: "50%",
          background: "#161619", border: "1px solid #2a2a2e",
          color: "#50505a", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, lineHeight: 1,
          transition: "border-color .15s, color .15s, transform .15s",
          boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
          fontFamily: "inherit",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = "#e8365d";
          e.currentTarget.style.color = "#e8365d";
          e.currentTarget.style.transform = "scale(1.08)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = "#2a2a2e";
          e.currentTarget.style.color = "#50505a";
          e.currentTarget.style.transform = "scale(1)";
        }}
      >
        {/* Chat bubble icon via SVG */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>

      {/* Backdrop */}
      {open && (
        <div
          onClick={handleClose}
          style={{
            position: "fixed", inset: 0, zIndex: 300,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(2px)",
          }}
        />
      )}

      {/* Modal */}
      {open && (
        <div style={{
          position: "fixed", bottom: 80, right: 24, zIndex: 301,
          width: 320, maxWidth: "calc(100vw - 48px)",
          background: "#111113",
          border: "1px solid #1e1e22",
          borderTop: "2px solid #e8365d",
          borderRadius: 6,
          padding: "24px 22px",
          fontFamily: "'Courier New', Courier, monospace",
          boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
        }}>

          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 9, letterSpacing: 3, color: "#e8365d", textTransform: "uppercase", marginBottom: 3 }}>
                Flux Support
              </div>
              <div style={{ fontSize: 13, color: "#f0f0f2", fontFamily: "Georgia, serif" }}>
                Get in touch
              </div>
            </div>
            <button
              onClick={handleClose}
              style={{ background: "none", border: "none", color: "#44444e", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 0 }}
            >
              &times;
            </button>
          </div>

          {status === "sent" ? (
            /* Success state */
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ fontSize: 28, marginBottom: 10, color: "#e8365d" }}>&#10003;</div>
              <div style={{ fontSize: 12, color: "#f0f0f2", marginBottom: 6 }}>Message sent.</div>
              <div style={{ fontSize: 11, color: "#50505a" }}>We'll get back to you at<br />{userEmail}</div>
            </div>
          ) : (
            <>
              {/* Type selector */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 9, letterSpacing: 2, color: "#44444e", textTransform: "uppercase", marginBottom: 6 }}>
                  Type
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {TYPES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setType(t.value)}
                      style={{
                        background: type === t.value ? "#1a0f13" : "#0e0e0f",
                        border: `1px solid ${type === t.value ? "#e8365d60" : "#2a2a2e"}`,
                        color: type === t.value ? "#e8365d" : "#50505a",
                        borderRadius: 3, padding: "5px 10px",
                        fontSize: 10, cursor: "pointer",
                        fontFamily: "inherit",
                        transition: "all .12s",
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 9, letterSpacing: 2, color: "#44444e", textTransform: "uppercase", marginBottom: 6 }}>
                  Message
                </div>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Describe what happened, what you expected, or what you'd like to see..."
                  rows={4}
                  style={{
                    width: "100%", background: "#0e0e0f",
                    border: "1px solid #2a2a2e", color: "#f0f0f2",
                    borderRadius: 4, padding: "10px 12px",
                    fontSize: 12, outline: "none", resize: "vertical",
                    fontFamily: "inherit", lineHeight: 1.7,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Reply-to */}
              {userEmail && (
                <div style={{ fontSize: 10, color: "#2a2a2e", marginBottom: 14 }}>
                  Reply will go to: <span style={{ color: "#44444e" }}>{userEmail}</span>
                </div>
              )}

              {/* Error */}
              {status === "error" && (
                <div style={{ fontSize: 11, color: "#ff6b6b", marginBottom: 12, padding: "8px 10px", background: "#1f0000", borderRadius: 4 }}>
                  {errorMsg}
                </div>
              )}

              {/* Send */}
              <button
                onClick={handleSend}
                disabled={status === "sending" || !message.trim()}
                style={{
                  width: "100%", background: "#e8365d", border: "none",
                  color: "#fff", borderRadius: 4, padding: "11px 16px",
                  fontSize: 10, letterSpacing: 2, textTransform: "uppercase",
                  cursor: status === "sending" || !message.trim() ? "default" : "pointer",
                  fontFamily: "inherit",
                  opacity: status === "sending" || !message.trim() ? 0.5 : 1,
                  transition: "opacity .15s",
                }}
              >
                {status === "sending" ? "Sending..." : "Send Message"}
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
