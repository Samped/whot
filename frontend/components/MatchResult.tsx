"use client";

import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";

const WIN_COLORS = ["#c4a15a", "#e8d5a3", "#b42318", "#2f6b4f", "#f4efe4", "#1c1408"];
const LOSE_COLORS = ["#8a7a62", "#c4a15a", "#5c4033", "#2f6b4f", "#e8d5a3", "#b42318"];

const BALLOONS = [
  { left: "6%", delay: "0s", dur: "7.2s", color: "#b42318", size: 46 },
  { left: "14%", delay: "0.4s", dur: "8.1s", color: "#c4a15a", size: 38 },
  { left: "22%", delay: "1.1s", dur: "6.6s", color: "#2f6b4f", size: 52 },
  { left: "31%", delay: "0.2s", dur: "7.8s", color: "#e8d5a3", size: 34 },
  { left: "41%", delay: "0.8s", dur: "6.9s", color: "#b42318", size: 44 },
  { left: "52%", delay: "0.15s", dur: "8.4s", color: "#1c1408", size: 40 },
  { left: "61%", delay: "1.3s", dur: "7s", color: "#c4a15a", size: 50 },
  { left: "70%", delay: "0.55s", dur: "6.4s", color: "#2f6b4f", size: 36 },
  { left: "78%", delay: "0.9s", dur: "7.6s", color: "#b42318", size: 48 },
  { left: "86%", delay: "0.3s", dur: "8s", color: "#e8d5a3", size: 42 },
  { left: "93%", delay: "1.05s", dur: "6.8s", color: "#c4a15a", size: 33 },
  { left: "3%", delay: "1.6s", dur: "7.4s", color: "#2f6b4f", size: 30 },
];

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function MatchResult({
  won,
  tie = false,
  marketEnd = false,
  myCount,
  oppCount,
  solo,
  onAgain,
  onLobby,
}: {
  won: boolean;
  tie?: boolean;
  marketEnd?: boolean;
  myCount?: number;
  oppCount?: number;
  solo: boolean;
  onAgain: () => void | Promise<void>;
  onLobby: () => void;
}) {
  const fired = useRef(false);
  const [loading, setLoading] = useState<"again" | "lobby" | null>(null);
  const celebrate = won && !tie;

  async function handleAgain() {
    if (loading) return;
    setLoading("again");
    try {
      await onAgain();
    } finally {
      setLoading(null);
    }
  }

  function handleLobby() {
    if (loading) return;
    setLoading("lobby");
    onLobby();
  }

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (reducedMotion() || !celebrate) return;

    const colors = celebrate ? WIN_COLORS : LOSE_COLORS;
    const end = Date.now() + 3200;

    void confetti({
      particleCount: 140,
      spread: 100,
      origin: { y: 0.58 },
      colors,
      scalar: 1.35,
      startVelocity: 48,
      ticks: 320,
    });

    const frame = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 62,
        origin: { x: 0, y: 0.72 },
        colors,
        scalar: 1.2,
        ticks: 260,
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 62,
        origin: { x: 1, y: 0.72 },
        colors,
        scalar: 1.2,
        ticks: 260,
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();

    return () => {
      confetti.reset();
    };
  }, [celebrate]);

  const kicker = tie ? "Market finished" : won ? "You win" : "Hand empty";
  const title = tie ? "Dead heat" : won ? "Congratulations" : "Better luck next time";
  const body = tie
    ? `The market ran dry. Rank sums tied at ${myCount ?? "?"}.`
    : marketEnd
      ? won
        ? `Market finished. Your ranks added up to ${myCount ?? "?"} — lower than the ${solo ? "computer" : "friend"}'s ${oppCount ?? "?"}.`
        : solo
          ? `Market finished. The computer's ranks summed to ${oppCount ?? "?"} against your ${myCount ?? "?"}.`
          : `Market finished. Their ranks summed to ${oppCount ?? "?"} against your ${myCount ?? "?"}.`
      : won
        ? "You emptied the hand. The hand is yours."
        : solo
          ? "The computer emptied first. Sit again when you are ready."
          : "They emptied first. Rematch when you want it.";

  return (
    <div
      className={`result-splash ${tie ? "is-tie" : won ? "is-win" : "is-lose"}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="result-title"
    >
      <div className="result-sky" aria-hidden>
        {BALLOONS.map((b, i) => (
          <span
            key={i}
            className="result-balloon"
            style={{
              left: b.left,
              animationDelay: b.delay,
              animationDuration: b.dur,
              ["--balloon" as string]: b.color,
              width: b.size,
              height: Math.round(b.size * 1.28),
            }}
          />
        ))}
      </div>
      <div className="result-card">
        <p className="result-kicker">{kicker}</p>
        <h2 id="result-title">{title}</h2>
        <p>{body}</p>
        <div className="result-actions">
          <button
            className="btn primary"
            type="button"
            disabled={loading !== null}
            onClick={() => void handleAgain()}
          >
            {loading === "again" ? "Dealing…" : "Play again"}
          </button>
          <button
            className="btn ghost result-lobby"
            type="button"
            disabled={loading !== null}
            onClick={handleLobby}
          >
            {loading === "lobby" ? "Leaving…" : "Lobby"}
          </button>
        </div>
      </div>
    </div>
  );
}
