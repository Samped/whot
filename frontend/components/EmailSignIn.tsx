"use client";

import { useState } from "react";
import { useSignInWithEmail, useVerifyEmailOTP } from "@coinbase/cdp-hooks";
import { CDP_PROJECT_ID } from "@/lib/cdp";
import { useGameAccount } from "@/hooks/useGameAccount";

function cdpMessage(err: unknown) {
  const msg = err instanceof Error ? err.message : "Could not reach Base.";
  if (/cors|origin|allowlist|allowed domain|not allowed/i.test(msg)) {
    return "Add this origin in CDP Portal → Embedded Wallet → Allowed domains (http://localhost:3000).";
  }
  if (/project/i.test(msg)) {
    return "Check NEXT_PUBLIC_CDP_PROJECT_ID. Copy it from portal.cdp.coinbase.com.";
  }
  return msg;
}

function CdpSetupHint() {
  const { signedIn, loginOpen, closeLogin } = useGameAccount();
  const [localOpen, setLocalOpen] = useState(false);
  const open = localOpen || loginOpen;

  function close() {
    setLocalOpen(false);
    closeLogin();
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
            <p className="sheet-kicker">Base email</p>
            <h3 id="email-sign-title">One key, then codes land in mail</h3>
            <div className="mail-form">
              <p>
                Base sends the sign-in code. This app needs a CDP Project ID so
                Coinbase will post that letter.
              </p>
              <ol className="how-seal">
                <li>
                  <strong>Project</strong>
                  Open{" "}
                  <a href="https://portal.cdp.coinbase.com" target="_blank" rel="noreferrer">
                    portal.cdp.coinbase.com
                  </a>
                  , copy the Project ID, put it in{" "}
                  <code>frontend/.env</code> as{" "}
                  <code>NEXT_PUBLIC_CDP_PROJECT_ID</code>.
                </li>
                <li>
                  <strong>Origin</strong>
                  Under Wallets → Embedded Wallet, allow{" "}
                  <code>http://localhost:3000</code>.
                </li>
                <li>
                  <strong>Restart</strong>
                  Restart the app. Then this sheet will mail a code and log you
                  in.
                </li>
              </ol>
              <button className="btn ghost" type="button" onClick={close}>
                close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function CdpEmailSignIn() {
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
            <p className="sheet-kicker">Base email</p>
            <h3 id="email-sign-title">{step === "mail" ? "Sign in" : "Enter the code"}</h3>
            {step === "mail" ? (
              <form className="mail-form" onSubmit={(e) => void requestCode(e)}>
                <p>
                  Log in with email or connect a wallet before a table opens.
                  Base emails a six-digit code. After you enter it, this
                  browser opens a table session that decrypts and dumps for you.
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
                  Code went to <strong>{email}</strong>. Check that inbox — it
                  is not shown here.
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
                  {busy ? "Opening session…" : "Sit down"}
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

export function EmailSignIn() {
  return CDP_PROJECT_ID ? <CdpEmailSignIn /> : <CdpSetupHint />;
}
