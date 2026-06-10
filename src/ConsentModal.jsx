/**
 * ConsentModal.jsx
 *
 * TCPA / CAN-SPAM compliant consent popup for SMS and email marketing.
 * Show this after a user's account is created and subscription is active —
 * NOT during signup (that conflates transactional consent with marketing consent).
 *
 * Usage in App.jsx:
 *   import ConsentModal from './ConsentModal';
 *   // After the subscription gate, before rendering the main app:
 *   const [consentGiven, setConsentGiven] = useState(() =>
 *     localStorage.getItem('flux_consent_v1') === 'done'
 *   );
 *   if (!consentGiven) return (
 *     <ConsentModal
 *       userEmail={session.user.email}
 *       onComplete={() => {
 *         localStorage.setItem('flux_consent_v1', 'done');
 *         setConsentGiven(true);
 *       }}
 *     />
 *   );
 *
 * What this covers:
 *   - Email marketing consent (CAN-SPAM / CASL)
 *   - SMS marketing consent (TCPA — prior express written consent required)
 *   - Both are opt-in only, unchecked by default
 *   - Transactional emails (receipts, password reset) do NOT require this consent
 *     and are NOT affected by choices made here
 */

import { useState } from "react";

export default function ConsentModal({ userEmail, onComplete }) {
  const [emailConsent, setEmailConsent] = useState(false);
  const [smsConsent, setSmsConsent] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [saving, setSaving] = useState(false);

  function validatePhone(val) {
    // Basic E.164-ish validation — digits only after stripping formatting
    const digits = val.replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15;
  }

  async function handleSave() {
    if (smsConsent && !validatePhone(phone)) {
      setPhoneError("Please enter a valid phone number to receive SMS.");
      return;
    }
    setPhoneError("");
    setSaving(true);

    // Store consent record — adapt this to your own backend/Supabase call as needed
    const record = {
      email_marketing: emailConsent,
      sms_marketing: smsConsent,
      sms_phone: smsConsent ? phone.replace(/\D/g, "") : null,
      consented_at: new Date().toISOString(),
      ip_collected: true, // flag that IP was logged server-side at time of consent
    };

    // Example: save to Supabase user metadata
    // await supabase.auth.updateUser({ data: { marketing_consent: record } });

    console.log("Consent record:", record);
    setSaving(false);
    onComplete(record);
  }

  function handleDecline() {
    const record = {
      email_marketing: false,
      sms_marketing: false,
      sms_phone: null,
      consented_at: new Date().toISOString(),
      declined: true,
    };
    onComplete(record);
  }

  const inputStyle = {
    width: "100%",
    background: "#0e0e0f",
    border: "1px solid #2a2a2e",
    color: "#f0f0f2",
    borderRadius: 4,
    padding: "11px 14px",
    fontSize: 13,
    outline: "none",
    fontFamily: "'Courier New', Courier, monospace",
    boxSizing: "border-box",
    marginTop: 8,
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.85)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "16px",
      backdropFilter: "blur(4px)",
      fontFamily: "'Courier New', Courier, monospace",
    }}>
      <div style={{
        background: "#111113",
        border: "1px solid #1e1e22",
        borderTop: "2px solid #e8365d",
        borderRadius: 6,
        padding: "36px 32px",
        maxWidth: 480,
        width: "100%",
        position: "relative",
      }}>

        {/* Logo */}
        <div style={{
          fontFamily: "Impact, 'Arial Black', Arial, sans-serif",
          fontSize: 20, letterSpacing: 4, color: "#e8365d", marginBottom: 20,
        }}>
          FLUX
        </div>

        {/* Heading */}
        <div style={{ fontSize: 18, color: "#f0f0f2", marginBottom: 8, lineHeight: 1.3, fontFamily: "Georgia, serif" }}>
          Stay in the loop?
        </div>
        <div style={{ fontSize: 11, color: "#888896", marginBottom: 28, lineHeight: 1.8 }}>
          Occasionally we send tips, updates, and things we think you'll find useful.
          These are completely optional &mdash; your account and transactional emails
          (receipts, password resets) are unaffected by your choice here.
        </div>

        {/* Email consent */}
        <label style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 20, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={emailConsent}
            onChange={e => setEmailConsent(e.target.checked)}
            style={{ marginTop: 2, accentColor: "#e8365d", width: 16, height: 16, flexShrink: 0 }}
          />
          <div>
            <div style={{ fontSize: 12, color: "#f0f0f2", marginBottom: 4 }}>
              Email updates
            </div>
            <div style={{ fontSize: 10, color: "#50505a", lineHeight: 1.7 }}>
              Occasional product news, tips, and offers sent to <strong style={{ color: "#888896" }}>{userEmail}</strong>.
              You can unsubscribe at any time by clicking the link in any email.
            </div>
          </div>
        </label>

        {/* SMS consent */}
        <label style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: smsConsent ? 12 : 28, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={smsConsent}
            onChange={e => { setSmsConsent(e.target.checked); setPhoneError(""); }}
            style={{ marginTop: 2, accentColor: "#e8365d", width: 16, height: 16, flexShrink: 0 }}
          />
          <div style={{ width: "100%" }}>
            <div style={{ fontSize: 12, color: "#f0f0f2", marginBottom: 4 }}>
              SMS updates
            </div>
            <div style={{ fontSize: 10, color: "#50505a", lineHeight: 1.7 }}>
              Recurring marketing messages from Flux (madrazallbuilt.com).
              Message frequency varies. Message &amp; data rates may apply.
              Reply <strong style={{ color: "#888896" }}>STOP</strong> to cancel,{" "}
              <strong style={{ color: "#888896" }}>HELP</strong> for help.
            </div>
          </div>
        </label>

        {/* Phone number field — only shown when SMS is checked */}
        {smsConsent && (
          <div style={{ marginBottom: 28, paddingLeft: 28 }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: "#44444e", textTransform: "uppercase", marginBottom: 4 }}>
              Mobile number
            </div>
            <input
              type="tel"
              placeholder="+1 (555) 000-0000"
              value={phone}
              onChange={e => { setPhone(e.target.value); setPhoneError(""); }}
              style={inputStyle}
            />
            {phoneError && (
              <div style={{ fontSize: 10, color: "#ff6b6b", marginTop: 6 }}>{phoneError}</div>
            )}
          </div>
        )}

        {/* Legal disclosure */}
        <div style={{
          fontSize: 9, color: "#2a2a2e", lineHeight: 1.7, marginBottom: 24,
          borderTop: "1px solid #1e1e22", paddingTop: 16,
        }}>
          By checking the SMS box and submitting, you provide prior express written consent to receive
          recurring automated marketing text messages from Flux at the number provided. Consent is not
          a condition of any purchase. View our{" "}
          <a href="https://madrazallbuilt.com/privacy" style={{ color: "#44444e" }}>Privacy Policy</a>
          {" "}and{" "}
          <a href="https://madrazallbuilt.com/terms" style={{ color: "#44444e" }}>Terms of Service</a>.
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1, background: "#e8365d", border: "none", color: "#fff",
              borderRadius: 4, padding: "12px 16px", fontSize: 11,
              letterSpacing: 1.5, textTransform: "uppercase", cursor: "pointer",
              fontFamily: "inherit", opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "saving..." : (emailConsent || smsConsent) ? "Save preferences" : "Continue"}
          </button>
          <button
            onClick={handleDecline}
            disabled={saving}
            style={{
              background: "none", border: "1px solid #2a2a2e", color: "#50505a",
              borderRadius: 4, padding: "12px 16px", fontSize: 11,
              cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
            }}
          >
            No thanks
          </button>
        </div>

      </div>
    </div>
  );
}
