"use client";

import { useState } from "react";
import { useSignInWithEmail, useVerifyEmailOTP } from "@coinbase/cdp-hooks";
import { useGameAccount } from "@/hooks/useGameAccount";

function cdpMessage(err: unknown) {
  const msg = err instanceof Error ? err.message : "Could not reach Base.";
  if (/cors|origin|allowlist|allowed domain|not allowed/i.test(msg)) {
    return "Base has not opened this site for email yet. Try a wallet, or come back in a bit.";
  }
  if (/project/i.test(msg)) {
    return "Base would not take that address just now. Try again in a minute.";
  }
  return msg;
}

export function EmailSignIn() {
  const { signInWithEmail: sendCode } = useSignInWithEmail();
  const { verifyEmailOTP } = useVerifyEmailOTP();
  const { signInWithEmail, signedIn, loginOpen, closeLogin } = useGameAccount();
  const [localOpen, setLocalOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [flowId, setFlowId] = useState("");
  const [step, setStep] = useState<"mail" | "code">("mail");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const open = localOpen || loginOpen;

  function close() {
    if (busy) return;
    setLocalOpen(false);
    closeLogin();
    setStep("mail");
    setCode("");
    setFlowId("");
    setError("");
  }

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await sendCode({ email: email.trim().toLowerCase() });
      setFlowId(result.flowId);
      setStep("code");
    } catch (err) {
      setError(cdpMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!flowId) {
      setError("Ask for a new code.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { user } = await verifyEmailOTP({ flowId, otp: code });
      const owner =
        user.evmAccountObjects?.[0]?.address || user.evmAccounts?.[0];
      signInWithEmail(email, owner);
      close();
    } catch (err) {
      setError(cdpMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!signedIn && (
        <button className="wallet-btn" type="button" onClick={() => setLocalOpen(true)}>
          <span className="label-full">Email sign in</span>
          <span className="label-short">Email</span>
        </button>
      )}
      {open && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="email-sign-title">
          <div className="sheet">
            <p className="sheet-kicker">Take a seat</p>
            <h3 id="email-sign-title">{step === "mail" ? "Leave an address" : "Check your mail"}</h3>
            {step === "mail" ? (
              <form className="mail-form" onSubmit={(e) => void requestCode(e)}>
                <p>
                  Base knocks with a six-digit code. After that this table
                  opens your sealed hand for you — no popup every time you
                  dump a card.
                </p>
                <label htmlFor="whot-email">
                  Email
                  <input
                    id="whot-email"
                    type="email"
                    autoComplete="email"
                    required
                    placeholder="you@mail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                {error ? <p className="mail-err">{error}</p> : null}
                <button className="btn primary" type="submit" disabled={busy}>
                  {busy ? "Sending…" : "Send a code"}
                </button>
                <button className="btn ghost" type="button" onClick={close}>
                  cancel
                </button>
              </form>
            ) : (
              <form className="mail-form" onSubmit={(e) => void verify(e)}>
                <p>
                  Six digits went to <strong>{email}</strong>. That code
                  never shows on this page — only in the letter.
                </p>
                <label htmlFor="whot-code">
                  Six digits
                  <input
                    id="whot-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    maxLength={6}
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  />
                </label>
                {error ? <p className="mail-err">{error}</p> : null}
                <button className="btn primary" type="submit" disabled={busy || code.length !== 6}>
                  {busy ? "Opening the table…" : "Sit down"}
                </button>
                <button
                  className="btn ghost"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setStep("mail");
                    setCode("");
                    setFlowId("");
                    setError("");
                  }}
                >
                  use a different email
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
