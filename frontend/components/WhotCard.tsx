"use client";

import type { CSSProperties, ReactNode } from "react";
import { specialCall, type WhotCard } from "@/lib/whot";

type Size = "logo" | "xs" | "sm" | "md" | "lg" | "xl";

const SHAPE_CLASS = ["", "circle", "triangle", "cross", "square", "star", "whot"] as const;

export function ShapeGlyph({
  shape,
  className = "",
}: {
  shape: number;
  className?: string;
}) {
  return (
    <svg className={`glyph ${className}`} viewBox="0 0 80 80" aria-hidden>
      {shape === 1 && (
        <>
          <circle cx="40" cy="40" r="30" fill="none" stroke="currentColor" strokeWidth="3.5" />
          <circle cx="40" cy="40" r="20" fill="currentColor" />
          <circle cx="32" cy="32" r="6" fill="white" opacity="0.28" />
        </>
      )}
      {shape === 2 && (
        <>
          <path
            d="M40 10 L70 66 H10 Z"
            fill="currentColor"
            stroke="currentColor"
            strokeLinejoin="round"
          />
          <path d="M40 26 L56 58 H24 Z" fill="white" opacity="0.18" />
        </>
      )}
      {shape === 3 && (
        <>
          <path
            d="M32 12h16v20h20v16H48v20H32V48H12V32h20z"
            fill="currentColor"
            rx="4"
          />
          <rect x="35" y="16" width="10" height="48" rx="3" fill="white" opacity="0.16" />
        </>
      )}
      {shape === 4 && (
        <>
          <rect x="14" y="14" width="52" height="52" rx="6" fill="none" stroke="currentColor" strokeWidth="3.5" />
          <rect x="22" y="22" width="36" height="36" rx="4" fill="currentColor" />
          <rect x="28" y="28" width="12" height="12" rx="2" fill="white" opacity="0.22" />
        </>
      )}
      {shape === 5 && (
        <path
          d="M40 8 L48.5 31.5 H73 L53.5 46.5 L61 71 L40 56 L19 71 L26.5 46.5 L7 31.5 H31.5 Z"
          fill="currentColor"
        />
      )}
      {shape === 6 && (
        <>
          <circle cx="40" cy="40" r="28" fill="none" stroke="currentColor" strokeWidth="2.4" />
          <path
            d="M22 54 L32 22 H40 L48 42 L56 22 H64 L54 58 H46 L40 38 L34 58 H26 Z"
            fill="currentColor"
          />
        </>
      )}
    </svg>
  );
}

function specialLabel(rank: number) {
  if (rank === 1) return "HOLD ON";
  if (rank === 2) return "PICK TWO";
  if (rank === 5) return "PICK THREE";
  if (rank === 8) return "SUSPEND";
  if (rank === 14) return "MARKET";
  if (rank === 20) return "WHOT";
  return "";
}

export function WhotFace({
  card,
  playable,
  dim,
  size = "md",
  style,
  onClick,
}: {
  card: WhotCard;
  playable?: boolean;
  dim?: boolean;
  size?: Size;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  const name = SHAPE_CLASS[card.shape] ?? "whot";
  const Tag = onClick ? "button" : "div";
  const label = specialLabel(card.rank);
  const isWhot = card.rank === 20;
  return (
    <Tag
      type={onClick ? "button" : undefined}
      className={`wc wc-${size} shape-${name} ${playable ? "playable" : ""} ${dim ? "dim" : ""} ${isWhot ? "wild" : ""} ${label ? "special" : ""}`}
      style={style}
      onClick={onClick}
      aria-label={`${name} ${card.rank}${specialCall(card.rank) ? ` ${specialCall(card.rank)}` : ""}`}
    >
      <span className="wc-sheen" />
      <div className="wc-plate">
        <div className="wc-corner top">
          <b>{isWhot ? "W" : card.rank}</b>
          <ShapeGlyph shape={card.shape} className="mini" />
        </div>
        <div className="wc-emblem">
          <span className="wc-ring" />
          <ShapeGlyph shape={card.shape} className="hero" />
          {label ? <span className="wc-ribbon">{label}</span> : null}
        </div>
        <div className="wc-corner bot">
          <b>{isWhot ? "W" : card.rank}</b>
          <ShapeGlyph shape={card.shape} className="mini" />
        </div>
      </div>
    </Tag>
  );
}

export function WhotBack({
  i = 0,
  size = "md",
  style,
  compact = false,
}: {
  i?: number;
  size?: Size;
  style?: CSSProperties;
  compact?: boolean;
}) {
  return (
    <div
      className={`wc wc-${size} back${compact ? " is-compact" : ""}`}
      style={{ ...style, ["--tilt" as string]: `${(i - 2) * 4}deg` }}
    >
      <span className="wc-sheen" />
      <div className="wc-back-plate">
        <div className="wc-back-geo" />
        <div className="wc-seal">
          <span>WHOT</span>
        </div>
      </div>
    </div>
  );
}

export function CardSlot({
  children,
  tilt = 0,
  lift = 0,
  overlap = 0,
  z = 0,
  up = false,
  slotRef,
}: {
  children: ReactNode;
  tilt?: number;
  lift?: number;
  overlap?: number;
  z?: number;
  up?: boolean;
  slotRef?: (node: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={slotRef}
      className={`wc-slot${up ? " is-up" : ""}`}
      style={{
        marginLeft: overlap,
        zIndex: up ? 60 : z,
        ["--tilt" as string]: `${tilt}deg`,
        ["--lift" as string]: `${lift}px`,
      }}
    >
      {children}
    </div>
  );
}
