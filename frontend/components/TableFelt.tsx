"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CardSlot, ShapeGlyph, WhotBack, WhotFace } from "@/components/WhotCard";
import { isLegal, SHAPE_NAME, type WhotCard } from "@/lib/whot";
import type { LastPlay } from "@/hooks/useWhot";

const SHAPES = [1, 2, 3, 4, 5] as const;
const FLY_MS = 420;

type Box = { x: number; y: number; w: number; h: number };
type Flyer = { key: number; who: "me" | "opp"; card: WhotCard; from: Box; to: Box };

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function boxOf(el: Element | null): Box | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function fallbackBox(who: "me" | "opp", to: Box): Box {
  const phone = typeof window !== "undefined" && window.innerWidth < 720;
  const w = phone ? 78 : 118;
  const h = phone ? 112 : 168;
  return {
    x: to.x + (to.w - w) / 2,
    y: who === "me" ? to.y + (phone ? 140 : 220) : to.y - (phone ? 120 : 200),
    w,
    h,
  };
}

function fanSpread(width: number, cardW: number, count: number) {
  if (count <= 1) return 0;
  if (width <= 0 || cardW <= 0) return -40;
  const peek = Math.min(48, Math.max(34, Math.round(cardW * 0.4)));
  const margin = (width - count * cardW) / (count - 1);
  return Math.max(-(cardW - peek), Math.min(8, margin));
}

function FlyCard({ flyer, onDone }: { flyer: Flyer; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { from, to } = flyer;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const sx = to.w / from.w;
    const sy = to.h / from.h;
    el.style.transform = "translate3d(0,0,0) scale(1)";
    el.style.transition = "none";
    const start = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = `transform ${FLY_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`;
        el.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})`;
      });
    });
    const done = window.setTimeout(onDone, FLY_MS + 20);
    return () => {
      cancelAnimationFrame(start);
      window.clearTimeout(done);
    };
  }, [flyer.key]);

  return (
    <div
      ref={ref}
      className="fly-card"
      style={{ left: flyer.from.x, top: flyer.from.y, width: flyer.from.w, height: flyer.from.h }}
      aria-hidden
    >
      <WhotFace card={flyer.card} size="lg" />
    </div>
  );
}

export function TableFelt({
  opponentName,
  opponentCount,
  myCards,
  myTurn,
  live,
  top,
  calledShape,
  pendingPick,
  pendingKind,
  marketLeft,
  lastCall,
  lastPlayed,
  banner,
  busy,
  peeking,
  sealedPending = 0,
  onPlay,
  onMarket,
  footer,
}: {
  opponentName: string;
  opponentCount: number;
  myCards: WhotCard[];
  myTurn: boolean;
  live: boolean;
  top: WhotCard | null;
  calledShape: number;
  pendingPick: number;
  pendingKind: number;
  marketLeft: number;
  lastCall?: string;
  lastPlayed?: LastPlay | null;
  banner: string;
  busy?: boolean;
  peeking?: boolean;
  sealedPending?: number;
  onPlay: (index: number, nextShape: number) => void;
  onMarket: () => void;
  footer?: ReactNode;
}) {
  const pileRef = useRef<HTMLDivElement>(null);
  const oppRef = useRef<HTMLDivElement>(null);
  const fanRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const queue = useRef<Flyer[]>([]);

  const [pickShapeFor, setPickShapeFor] = useState<number | null>(null);
  const [heldTop, setHeldTop] = useState<WhotCard | null>(top);
  const [hideMine, setHideMine] = useState<number | null>(null);
  const [flyer, setFlyer] = useState<Flyer | null>(null);
  const [seatTick, setSeatTick] = useState(0);
  const [lifted, setLifted] = useState<number | null>(null);
  const [coarse, setCoarse] = useState(false);
  const [fanBox, setFanBox] = useState({ width: 0, cardW: 118 });

  useEffect(() => {
    if (!top) return;
    setHeldTop((cur) => {
      if (flyer) return cur;
      if (cur && lastPlayed?.card && cur.id === lastPlayed.card.id && top.id !== cur.id) return cur;
      return top;
    });
  }, [top?.id, lastPlayed?.card?.id, flyer]);

  function pileBox() {
    return boxOf(pileRef.current?.querySelector(".wc") ?? pileRef.current);
  }

  function enqueue(next: Flyer) {
    if (flyer) {
      queue.current.push(next);
      return;
    }
    setFlyer(next);
  }

  function launch(who: "me" | "opp", card: WhotCard, fromEl: Element | null) {
    if (reducedMotion()) {
      setHeldTop(card);
      setHideMine(null);
      return;
    }
    const to = pileBox();
    if (!to) {
      setHeldTop(card);
      setHideMine(null);
      return;
    }
    enqueue({
      key: Date.now() + Math.random(),
      who,
      card,
      from: boxOf(fromEl) ?? fallbackBox(who, to),
      to,
    });
  }

  function finishFly() {
    if (flyer) setHeldTop(flyer.card);
    setSeatTick((n) => n + 1);
    const next = queue.current.shift() ?? null;
    setFlyer(next);
    if (!next) setHideMine(null);
  }

  useEffect(() => {
    if (!lastPlayed || lastPlayed.who !== "opp" || !lastPlayed.card) return;
    if (heldTop?.id === lastPlayed.card.id) return;
    launch("opp", lastPlayed.card, oppRef.current?.querySelector(".wc") ?? oppRef.current);
  }, [lastPlayed?.key]);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const sync = () => setCoarse(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const el = fanRef.current;
    if (!el) return;
    const measure = () => {
      const card = el.querySelector(".wc") as HTMLElement | null;
      setFanBox({ width: el.clientWidth, cardW: card?.offsetWidth || 118 });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [myCards.length]);

  useEffect(() => {
    setLifted(null);
  }, [myCards.length, myTurn]);

  function runMine(index: number, nextShape: number, card: WhotCard) {
    setLifted(null);
    setHideMine(index);
    launch("me", card, slotRefs.current[index]?.querySelector(".wc") ?? slotRefs.current[index]);
    onPlay(index, nextShape);
  }

  function clickCard(index: number) {
    const card = myCards[index];
    if (!card || !myTurn || !live || busy || sealedPending > 0 || hideMine !== null || flyer) return;
    if (!isLegal(card, heldTop ?? top, calledShape, pendingKind)) return;
    const stacked = fanSpread(fanBox.width, fanBox.cardW, myCards.length) < -28;
    if (coarse && stacked && lifted !== index) {
      setLifted(index);
      return;
    }
    if (card.rank === 20) {
      setPickShapeFor(index);
      return;
    }
    runMine(index, 0, card);
  }

  const shownMine = myCards.length + sealedPending;
  const mid = (shownMine - 1) / 2;
  const shownBacks = Math.min(opponentCount, 12);
  const mineSpread = fanSpread(fanBox.width, fanBox.cardW, shownMine);
  const tight = fanBox.width > 0 ? fanBox.width < 720 : typeof window !== "undefined" && window.innerWidth < 720;
  const tiltStep = tight ? 2.1 : 5.5;
  const liftStep = tight ? 2 : 6;
  const shapeName = SHAPE_NAME[calledShape] || "any";
  const pile = heldTop ?? top;

  return (
    <div className="felt-wrap">
      <div className="seat-rail opp">
        <div className="seat-chip opp">
          <span className="avatar opp" aria-hidden />
          <div className="seat-meta">
            <strong>{opponentName}</strong>
            <em>{opponentCount} sealed</em>
          </div>
        </div>
        <div className="fan opp-fan" ref={oppRef}>
          {Array.from({ length: shownBacks }, (_, i) => (
            <CardSlot key={i} overlap={i === 0 ? 0 : -38} z={i} tilt={(i - (shownBacks - 1) / 2) * 5}>
              <WhotBack i={i} size="sm" />
            </CardSlot>
          ))}
        </div>
      </div>

      <div className="table-stage">
        <div className="table-rail" aria-hidden />
        <div className={`felt ${myTurn ? "is-mine" : ""}`}>
          <div className="felt-vignette" aria-hidden />
          <div className="felt-grain" aria-hidden />
          <div className="felt-shine" aria-hidden />

          <div className="felt-center">
            <div className="pile-spotlight" aria-hidden />
            <div className="pile market-stack">
              <div className="stack">
                <WhotBack size="md" style={{ transform: "rotate(-10deg) translate(-8px, 6px)" }} />
                <WhotBack size="md" style={{ transform: "rotate(-4deg) translate(-2px, 2px)" }} />
                <WhotBack size="md" />
              </div>
              <span className="pile-tag">Market · {marketLeft}</span>
            </div>
            <div className="pile discard open-pile" ref={pileRef}>
              <div key={seatTick} className={seatTick ? "pile-face is-seat" : "pile-face"}>
                {pile ? <WhotFace card={pile} size="xl" /> : <WhotBack size="xl" />}
              </div>
              <span className="open-label">
                {pile
                  ? `Open · ${pile.rank === 20 ? "WHOT" : pile.rank} ${SHAPE_NAME[pile.shape] || ""}`
                  : "Opening the pile…"}
              </span>
              {lastCall ? <span className="call-chip">{lastCall}</span> : null}
            </div>
            <div className={`follow-chip s-${shapeName}`}>
              <ShapeGlyph shape={calledShape || 1} />
              <div>
                <b>Follow {shapeName}</b>
                {pendingKind ? <em>pick {pendingPick}</em> : <em>shape or #</em>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className={`turn-line ${myTurn ? "mine" : ""}`}>{banner}</p>

      <div className="seat-rail me">
        {(peeking || sealedPending > 0) && (
          <p className="hint center">
            {sealedPending > 1
              ? `Opening the ${sealedPending} you just picked…`
              : sealedPending === 1
                ? "Opening the card you just picked…"
                : "Opening your sealed hand…"}
          </p>
        )}
        <div className="fan my-fan" ref={fanRef}>
          {myCards.map((card, i) => {
            if (hideMine === i) return <span key={`gone-${i}`} className="wc-ghost" />;
            const ok =
              myTurn &&
              live &&
              !busy &&
              sealedPending === 0 &&
              hideMine === null &&
              !flyer &&
              isLegal(card, heldTop ?? top, calledShape, pendingKind);
            return (
              <CardSlot
                key={`${card.id}-${i}`}
                overlap={i === 0 ? 0 : mineSpread}
                z={i}
                tilt={(i - mid) * tiltStep}
                lift={Math.abs(i - mid) * liftStep}
                up={lifted === i}
                slotRef={(node) => {
                  slotRefs.current[i] = node;
                }}
              >
                <WhotFace card={card} size="lg" playable={ok} dim={!ok} onClick={() => clickCard(i)} />
              </CardSlot>
            );
          })}
          {Array.from({ length: sealedPending }, (_, i) => (
            <CardSlot
              key={`sealed-${i}`}
              overlap={myCards.length === 0 && i === 0 ? 0 : mineSpread}
              z={myCards.length + i}
              tilt={(myCards.length + i - mid) * tiltStep}
              lift={Math.abs(myCards.length + i - mid) * liftStep}
            >
              <WhotBack i={i} size="lg" />
            </CardSlot>
          ))}
        </div>
        <div className="hand-bar">
          <button
            className="btn market"
            disabled={!myTurn || busy || sealedPending > 0 || !live || hideMine !== null || Boolean(flyer)}
            onClick={onMarket}
          >
            {pendingPick ? `Pay pick ${pendingPick}` : "Go market"}
          </button>
          {footer}
        </div>
      </div>

      {flyer ? <FlyCard flyer={flyer} onDone={finishFly} /> : null}

      {pickShapeFor !== null && (
        <div className="modal">
          <div className="sheet">
            <p className="sheet-kicker">WHOT</p>
            <h3>Call a shape</h3>
            <div className="shape-grid">
              {SHAPES.map((s) => (
                <button
                  key={s}
                  className={`shape-pick s-${SHAPE_NAME[s]}`}
                  onClick={() => {
                    const idx = pickShapeFor;
                    const card = myCards[idx];
                    setPickShapeFor(null);
                    if (card) runMine(idx, s, card);
                  }}
                >
                  <ShapeGlyph shape={s} />
                  {SHAPE_NAME[s]}
                </button>
              ))}
            </div>
            <button className="btn ghost" onClick={() => setPickShapeFor(null)}>
              cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
