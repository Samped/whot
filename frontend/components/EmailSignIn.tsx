"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useSignInWithEmail, useVerifyEmailOTP } from "@coinbase/cdp-hooks";
import { useGameAccount } from "@/hooks/useGameAccount";

function errText(err: unknown) {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object") {
    const o = err as { message?: unknown; error?: unknown; cause?: unknown };
    if (typeof o.message === "string" && o.message) return o.message;
    if (typeof o.error === "string" && o.error) return o.error;
    if (o.cause) return errText(o.cause);
  }
  return typeof err === "string" ? err : "";
}

function cdpMessage(err: unknown) {
  const msg = errText(err) || "Could not reach Base.";
  if (/cors|origin|allowlist|allowed domain|not allowed|forbidden/i.test(msg)) {
    return "Base has not opened this site for email yet. Add this exact URL in CDP Portal → Embedded Wallet → Allowed domains.";
  }
  if (/project/i.test(msg)) {
    return "Base would not take that address just now. Try again in a minute.";
  }
  return msg;
}

function readField(form: HTMLFormElement, name: string) {
  const raw = new FormData(form).get(name);
  return String(raw || "").trim();
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

  async function requestCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    const address = readField(e.currentTarget, "email").toLowerCase();
    if (!address || !address.includes("@")) {
      setError("Type the full email address.");
      return;
    }
    setEmail(address);
    setBusy(true);
    setError("");
    try {
      const result = await sendCode({ email: address });
      const id = result?.flowId;
      if (!id) throw new Error("Base did not start the code. Try again.");
      setFlowId(id);
      setStep("code");
    } catch (err) {
      setError(cdpMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    const otp = readField(e.currentTarget, "otp").replace(/\D/g, "").slice(0, 6);
    if (!flowId) {
      setError("Ask for a new code.");
      return;
    }
    if (otp.length !== 6) {
      setError("Enter the six digits from the letter.");
      return;
    }
    setCode(otp);
    setBusy(true);
    setError("");
    try {
      const { user } = await verifyEmailOTP({ flowId, otp });
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

  const sheet = open ? (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="email-sign-title">
      <div className="sheet">
        <p className="sheet-kicker">Take a seat</p>
        <h3 id="email-sign-title">{step === "mail" ? "Leave an address" : "Check your mail"}</h3>
        {step === "mail" ? (
          <form className="mail-form" action="#" onSubmit={(e) => void requestCode(e)}>
            <p>
              Base knocks with a six-digit code. After that this table
              opens your sealed hand for you — no popup every time you
              dump a card.
            </p>
            <label htmlFor="whot-email">
              Email
              <input
                id="whot-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                enterKeyHint="send"
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
          <form className="mail-form" action="#" onSubmit={(e) => void verify(e)}>
            <p>
              Six digits went to <strong>{email}</strong>. That code
              never shows on this page — only in the letter.
            </p>
            <label htmlFor="whot-code">
              Six digits
              <input
                id="whot-code"
                name="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                maxLength={6}
                pattern="[0-9]*"
                enterKeyHint="done"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </label>
            {error ? <p className="mail-err">{error}</p> : null}
            <button className="btn primary" type="submit" disabled={busy}>
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
  ) : null;

  return (
    <>
      {!signedIn && (
        <button className="wallet-btn" type="button" onClick={() => setLocalOpen(true)}>
          <span className="label-full">Email sign in</span>
          <span className="label-short">Email</span>
        </button>
      )}
      {typeof document !== "undefined" && sheet ? createPortal(sheet, document.body) : null}
    </>
  );
}
