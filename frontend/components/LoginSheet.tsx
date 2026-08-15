"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useGameAccount } from "@/hooks/useGameAccount";

function readField(form: HTMLFormElement, name: string) {
  return String(new FormData(form).get(name) || "").trim();
}

export function LoginSheet() {
  const { openConnectModal } = useConnectModal();
  const { signInWithEmail, signedIn, loginOpen, closeLogin } = useGameAccount();
  const [localOpen, setLocalOpen] = useState(false);
  const [tab, setTab] = useState<"email" | "wallet">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [flowId, setFlowId] = useState("");
  const [verifyUrl, setVerifyUrl] = useState("");
  const [step, setStep] = useState<"mail" | "code">("mail");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const open = localOpen || loginOpen;

  function close() {
    if (busy) return;
    setLocalOpen(false);
    closeLogin();
    setTab("email");
    setStep("mail");
    setCode("");
    setFlowId("");
    setVerifyUrl("");
    setError("");
  }

  async function requestCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    const address = readField(e.currentTarget, "email").toLowerCase();
    if (!address.includes("@")) {
      setError("Type the full email address.");
      return;
    }
    setEmail(address);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send", email: address }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        flowId?: string;
        verifyUrl?: string;
      };
      if (!res.ok) throw new Error(body.error || "Could not send the code.");
      if (!body.flowId) throw new Error("Base did not start the code. Try again.");
      setFlowId(body.flowId);
      setVerifyUrl(body.verifyUrl || "");
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the code.");
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
      setError("Enter the six-digit code from your email.");
      return;
    }
    setCode(otp);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "verify", flowId, otp, verifyUrl: verifyUrl || undefined }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        evmAddress?: string;
      };
      if (!res.ok) throw new Error(body.error || "That code did not work.");
      await signInWithEmail(email, body.evmAddress);
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code did not work.");
    } finally {
      setBusy(false);
    }
  }

  function connectWallet() {
    close();
    openConnectModal?.();
  }

  const sheet = open ? (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="login-title">
      <div className="sheet login-sheet">
        <p className="sheet-kicker">Sit down</p>
        <h3 id="login-title">Sign in to play</h3>
        <p className="login-lede">Email or a wallet — pick one. No guest tables.</p>

        <div className="login-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "email"}
            className={tab === "email" ? "on" : ""}
            onClick={() => {
              setTab("email");
              setError("");
            }}
          >
            Email
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "wallet"}
            className={tab === "wallet" ? "on" : ""}
            onClick={() => {
              setTab("wallet");
              setError("");
            }}
          >
            Wallet
          </button>
        </div>

        {tab === "email" ? (
          step === "mail" ? (
            <form className="mail-form" action="#" onSubmit={(e) => void requestCode(e)}>
              <p>Base emails a six-digit code. After that, this table opens your sealed hand for you.</p>
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
            </form>
          ) : (
            <form className="mail-form" action="#" onSubmit={(e) => void verify(e)}>
              <p>
                Six digits went to <strong>{email}</strong>. Check that inbox.
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
                  setVerifyUrl("");
                  setError("");
                }}
              >
                use a different email
              </button>
            </form>
          )
        ) : (
          <div className="mail-form">
            <p>Connect MetaMask, Coinbase Wallet, or another wallet on Base Sepolia.</p>
            <button className="btn primary" type="button" onClick={connectWallet}>
              Connect wallet
            </button>
          </div>
        )}

        <button className="btn ghost" type="button" onClick={close} disabled={busy}>
          cancel
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      {!signedIn && (
        <button className="wallet-btn" type="button" onClick={() => setLocalOpen(true)}>
          Sign in
        </button>
      )}
      {typeof document !== "undefined" && sheet ? createPortal(sheet, document.body) : null}
    </>
  );
}
