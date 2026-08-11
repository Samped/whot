"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { formatEther } from "viem";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { parseTableCode, tableCode, useWhot } from "@/hooks/useWhot";
import { TableFelt } from "@/components/TableFelt";
import { MatchResult } from "@/components/MatchResult";
import { CardSlot, ShapeGlyph, WhotBack, WhotFace } from "@/components/WhotCard";
import { decodeCard, isLegal, pack } from "@/lib/whot";
import { useGameAccount } from "@/hooks/useGameAccount";
import { isOpen } from "@/lib/table-view";

const SHOW = [
  pack(1, 2),
  pack(2, 5),
  pack(3, 14),
  pack(6, 20),
  pack(4, 1),
  pack(5, 8),
];

export function WhotGame() {
  const router = useRouter();
  const params = useSearchParams();
  const tableId = parseTableCode(params.get("t") || "");
  const view =
    tableId > 0
      ? "pvp"
      : params.get("how") === "1"
        ? "how"
        : params.get("board") === "1"
          ? "board"
          : params.get("play") === "solo"
            ? "solo"
            : "home";

  return (
    <div className="app-shell">
      {view === "home" && <Home onBoard={() => router.push("/?board=1")} />}
      {view === "how" && <HowScreen onHome={() => router.push("/")} />}
      {view === "solo" && <SoloGate />}
      {view === "pvp" && <PvpScreen tableId={tableId} />}
      {view === "board" && <BoardScreen onHome={() => router.push("/")} />}
    </div>
  );
}

function Home({ onBoard }: { onBoard: () => void }) {
  const router = useRouter();
  const game = useWhot(0);
  const board = useLeaderboard();
  const { signedIn, requestLogin } = useGameAccount();
  const [code, setCode] = useState("");
  const [hosting, setHosting] = useState(false);
  const [startingSolo, setStartingSolo] = useState(false);

  useEffect(() => {
    if (game.error) toast.error(game.error);
  }, [game.error]);

  function needLogin() {
    if (signedIn) return false;
    requestLogin();
    toast.error("Sign in with email or a wallet first.");
    return true;
  }

  async function host() {
    if (needLogin()) return;
    setHosting(true);
    const id = await game.openTable();
    setHosting(false);
    if (id > 0) router.push(`/?t=${id}`);
  }

  async function playComputer() {
    if (needLogin()) return;
    setStartingSolo(true);
    const id = await game.openSolo();
    setStartingSolo(false);
    if (id > 0) router.push(`/?t=${id}`);
  }

  function join() {
    if (needLogin()) return;
    const id = parseTableCode(code);
    if (!id) {
      toast.error("Enter a table number");
      return;
    }
    router.push(`/?t=${id}`);
  }

  return (
    <div className="home">
      <div className="haze" aria-hidden>
        <div className="haze-pack">
          {SHOW.map((id, i) => (
            <WhotFace key={id} card={decodeCard(id)} size="xl" />
          ))}
          <WhotBack size="xl" />
          <WhotBack size="xl" />
        </div>
      </div>

      <section className="pack-stage">
        <div className="pack-fan">
          {SHOW.map((id, i) => {
            const n = SHOW.length;
            const t = (i - (n - 1) / 2) * 11;
            const lift = Math.abs(i - (n - 1) / 2) * 18;
            return (
              <CardSlot key={id} tilt={t} lift={lift} overlap={i === 0 ? 0 : -72} z={i}>
                <WhotFace card={decodeCard(id)} size="xl" />
              </CardSlot>
            );
          })}
        </div>
      </section>

      <section className="lobby">
        <div className="lobby-copy">
          <p className="eyebrow">Nigerian cards · 54 in the pack</p>
          <h1>Sit down.</h1>
          <p className="lede">
            Sign in with email. Base posts a code to that address, then we
            open a table session that dumps and decrypts for you — no
            signature on every card. Hands stay sealed on-chain until a card
            hits the pile.
          </p>
          <div className="actions">
            <button
              className="btn primary"
              disabled={startingSolo || hosting || game.busy}
              onClick={() => void playComputer()}
            >
              {startingSolo || game.busy ? game.status || "Shuffling…" : "Play the computer"}
            </button>
          </div>
          <div className="suit-row" aria-hidden>
            {[1, 2, 3, 4, 5].map((s) => (
              <span key={s}>
                <ShapeGlyph shape={s} />
                {["", "circle", "triangle", "cross", "square", "star"][s]}
              </span>
            ))}
          </div>
        </div>

        <aside className="ticket">
          <h2>Play a friend</h2>
          <p>
            Host a table, send the number. Both hands stay sealed on-chain until
            a card is dumped.
          </p>
          <button className="btn primary" onClick={host} disabled={hosting || startingSolo || game.busy}>
            {hosting ? game.status || "Opening table…" : "Host a table"}
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              join();
            }}
          >
            <label htmlFor="table-code">
              Or enter a number
              <input
                id="table-code"
                inputMode="numeric"
                placeholder="0007"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={6}
              />
            </label>
            <button type="submit" className="btn ghost">
              Sit at that table
            </button>
          </form>
        </aside>
      </section>

      <HowSection compact />

      <section className="home-board">
        <header>
          <h2>Ranked</h2>
          <button className="btn ghost" onClick={onBoard}>
            Full list
          </button>
        </header>
        {board.address && (
          <p className="you-line">
            You · {board.mine.wins}W {board.mine.losses}L
            {board.rank ? ` · #${board.rank}` : " · unranked"}
          </p>
        )}
        <ol className="ladder">
          {board.rows.slice(0, 5).map((row, i) => (
            <li key={row.address}>
              <span className="pos">{i + 1}</span>
              <span className="who">{short(row.address)}</span>
              <span className="wl">
                {row.wins}W · {row.losses}L
              </span>
            </li>
          ))}
          {board.rows.length === 0 && <li className="empty">No friend matches yet.</li>}
        </ol>
      </section>
    </div>
  );
}

function HowScreen({ onHome }: { onHome: () => void }) {
  const router = useRouter();
  return (
    <div className="how-screen">
      <div className="play-top">
        <button className="btn ghost" onClick={onHome}>
          ← lobby
        </button>
        <h2>How</h2>
        <button className="btn ghost" onClick={() => router.push("/?play=solo")}>
          Deal a pack
        </button>
      </div>
      <HowSection />
    </div>
  );
}

function HowSection({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`how ${compact ? "compact" : ""}`} id="how">
      <header className="how-head">
        <p className="eyebrow">The table and the seal</p>
        <h2>How this pack plays.</h2>
        <p className="lede slim">
          Same Nigerian WHOT you already know. The only change is the hand:
          sealed on-chain, opened only to you, public the moment it hits the
          pile.
        </p>
      </header>

      <div className="how-grid">
        <article className="how-col">
          <h3>The game</h3>
          <p>
            Fifty-four cards. Five shapes — circle, triangle, cross, square,
            star — plus five WHOT 20s. You and the other seat each get five.
            One card is turned face-up. Match the open pile by shape or by
            number. First to empty the hand checks up.
          </p>
          <p>
            Nothing follows? Go market and draw. A pending pick two or pick
            three must be paid, or answered with the same kind, before you
            can dump anything else.
          </p>
          <dl className="how-calls">
            <div>
              <dt>1</dt>
              <dd>Hold on — you play again.</dd>
            </div>
            <div>
              <dt>2</dt>
              <dd>Pick two — the other seat draws two, unless they dump a 2.</dd>
            </div>
            <div>
              <dt>5</dt>
              <dd>Pick three — same idea, with fives.</dd>
            </div>
            <div>
              <dt>8</dt>
              <dd>Suspension — skip them. You keep the turn.</dd>
            </div>
            <div>
              <dt>14</dt>
              <dd>General market — they draw one.</dd>
            </div>
            <div>
              <dt>20</dt>
              <dd>WHOT — call the shape the table must follow.</dd>
            </div>
          </dl>
        </article>

        <article className="how-col seal">
          <h3>The seal</h3>
          <p>
            This is not a private server pretending to shuffle. The pack is
            shuffled on Base, on{" "}
            <a href="https://docs.inco.org" target="_blank" rel="noreferrer">
              Inco Lightning
            </a>
            . Inco is a TEE — a sealed machine that can see a card long
            enough to deal it, then hand you an encrypted handle. It is not a
            zk proof and not FHE. “Encrypted” here means: decrypt inside that
            enclave, then only to the seat that is allowed to see it.
          </p>
          <ol className="how-seal">
            <li>
              <strong>Shuffle</strong>
              The contract asks Inco for a shuffled 54-card list. Nobody —
              not you, not the computer, not the house — can read the order.
            </li>
            <li>
              <strong>Deal</strong>
              Each card is allowed only to its owner. Your five handles
              decrypt for your table session. The other five stay dark.
            </li>
            <li>
              <strong>Opener</strong>
              One card is marked public. The house turns it face-up. That is
              the open pile. Everything else stays sealed.
            </li>
            <li>
              <strong>Peek</strong>
              Sign in with email once. Base emails the code. After that a
              table session signs the decrypts. Not a popup on every card.
            </li>
            <li>
              <strong>Dump</strong>
              When you play, that one handle is attested and the card
              becomes the new open pile. The rest of the hand never leaves
              the seal.
            </li>
          </ol>
          <p className="how-note">
            The computer’s hand is allowed only to the contract. It picks
            with encrypted compares — no plaintext branch on-chain — then
            reveals the one card it dumps. Same rule as you.
          </p>
        </article>
      </div>
    </section>
  );
}

function SoloGate() {
  const router = useRouter();
  const game = useWhot(0);
  const { signedIn, requestLogin } = useGameAccount();
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (game.error) toast.error(game.error);
  }, [game.error]);

  async function start() {
    if (!signedIn) {
      requestLogin();
      toast.error("Sign in with email or a wallet first.");
      return;
    }
    setStarting(true);
    const id = await game.openSolo();
    setStarting(false);
    if (id > 0) router.replace(`/?t=${id}`);
  }

  return (
    <div className="center-card">
      <h2>Computer</h2>
      <p>
        One tap deals a sealed pack. Your five cards stay allowed only to your
        table session. The computer’s five stay sealed until it dumps one.
        After you sit, decrypts and dumps sign themselves.
      </p>
      <button className="btn primary" disabled={starting || game.busy} onClick={start}>
        {starting || game.busy ? game.status || "Shuffling on-chain…" : `Deal sealed hands · ${formatEther(game.dealFee)} ETH`}
      </button>
      <button className="btn ghost" onClick={() => router.push("/")}>
        Lobby
      </button>
    </div>
  );
}

function PvpScreen({ tableId }: { tableId: number }) {
  const router = useRouter();
  const game = useWhot(tableId);
  const phase = game.table?.phase_ ?? 0;
  const top = game.table?.top ? decodeCard(game.table.top) : null;
  const link = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/?t=${tableId}`;
  }, [tableId]);

  useEffect(() => {
    if (game.error) toast.error(game.error);
  }, [game.error]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  }

  if (game.loading) {
    return (
      <div className="center-card">
        <p className="pulse-wait">Finding table {tableCode(tableId)}…</p>
      </div>
    );
  }

  if (game.missing) {
    return (
      <div className="center-card">
        <h2>No table {tableCode(tableId)}</h2>
        <p>That room is empty or already closed.</p>
        <button className="btn primary" onClick={() => router.push("/")}>
          Back to lobby
        </button>
      </div>
    );
  }

  if (phase <= 1) {
    const host = game.seat === 0;
    const canJoin = game.seat < 0 && phase === 1;
    return (
      <div className="center-card ticket">
        <p className="kicker">Private table</p>
        <h2>{tableCode(tableId)}</h2>
        <p>Send this number or the link. Hands encrypt when the second account sits.</p>
        <div className="copy-row">
          <button className="btn primary" onClick={() => copy(tableCode(tableId))}>
            Copy number
          </button>
          <button className="btn ghost" onClick={() => copy(link)}>
            Copy link
          </button>
        </div>
        {host && <p className="pulse-wait">Waiting on your friend…</p>}
        {canJoin && (
          <button className="btn primary" disabled={game.busy} onClick={() => void game.joinAndDeal()}>
            {game.busy ? "Shuffling the pack…" : `Sit & deal · ${formatEther(game.dealFee)} ETH`}
          </button>
        )}
        <div className="copy-row">
          {host && (
            <button
              className="btn ghost"
              disabled={game.busy}
              onClick={async () => {
                await game.cancelTable();
                router.push("/");
              }}
            >
              Cancel table
            </button>
          )}
          <button className="btn ghost" onClick={() => router.push("/")}>
            Lobby
          </button>
          <button className="btn ghost" onClick={() => router.push("/?play=solo")}>
            Play computer instead
          </button>
        </div>
      </div>
    );
  }

  const live = phase === 3;
  const called = game.table?.shape ?? 0;
  const legalHint =
    game.myTurn &&
    live &&
    game.myCards.some((c) => isLegal(c, top, called, game.table?.pickKind ?? 0));

  return (
    <div className="play-screen">
      <div className="play-top">
        <button className="btn ghost" onClick={() => router.push("/")}>
          ← lobby
        </button>
        <button className="table-pill" onClick={() => copy(link)}>
          Table {tableCode(tableId)}
        </button>
      </div>
      <TableFelt
        opponentName={game.table?.solo ? "Computer" : "Friend"}
        opponentCount={game.opponentCount}
        myCards={game.myCards}
        myTurn={game.myTurn}
        live={live}
        top={top}
        calledShape={called}
        pendingPick={game.table?.pick ?? 0}
        pendingKind={game.table?.pickKind ?? 0}
        marketLeft={game.table?.marketLeft ?? 0}
        lastCall={game.lastCall}
        lastPlayed={game.lastPlayed}
        banner={
          phase === 4
            ? game.table?.solo && game.table.winner_?.toLowerCase() === game.table.p1?.toLowerCase()
              ? "Computer check up."
              : `Check up! ${short(game.table?.winner_)}`
            : phase === 2
              ? game.status || "Locking the opener…"
              : game.status
                ? game.status
                : game.myTurn
                  ? legalHint
                    ? "Your turn — dump a card."
                    : "Nothing follows. Go market."
                  : game.table?.solo
                    ? game.seat < 0
                      ? "Watching this table."
                      : "Computer is on the move…"
                    : "Friend dey think…"
        }
        busy={game.busy}
        peeking={game.peeking}
        onPlay={game.playCard}
        onMarket={game.goMarket}
        footer={
          <>
            <button
              className={game.myCards.length === 0 ? "btn primary" : "btn ghost"}
              disabled={game.busy || game.peeking}
              onClick={() => void game.peekHand(true)}
            >
              {game.peeking ? "Opening hand…" : game.myCards.length === 0 ? "Open sealed hand" : "Refresh hand"}
            </button>
            {live &&
              game.table?.solo &&
              game.seat >= 0 &&
              !game.myTurn &&
              phase === 3 &&
              Boolean(game.error) && (
              <button className="btn primary" disabled={game.busy} onClick={() => void game.nudgeComputer()}>
                {game.busy ? game.status || "Computer moving…" : "Nudge the computer"}
              </button>
            )}
            {game.table?.solo && game.seat < 0 && (
              <button
                className="btn primary"
                disabled={game.busy}
                onClick={() => router.push("/?play=solo")}
              >
                Deal your own pack
              </button>
            )}
          </>
        }
      />
      {phase === 4 && game.seat >= 0 && !isOpen(game.table?.winner_) && (
        <MatchResult
          won={game.address != null && game.table?.winner_?.toLowerCase() === game.address.toLowerCase()}
          solo={Boolean(game.table?.solo)}
          onAgain={() => {
            if (game.table?.solo) {
              void (async () => {
                const id = await game.openSolo();
                if (id > 0) router.replace(`/?t=${id}`);
              })();
              return;
            }
            router.push("/");
          }}
          onLobby={() => router.push("/")}
        />
      )}
    </div>
  );
}

function BoardScreen({ onHome }: { onHome: () => void }) {
  const board = useLeaderboard();
  return (
    <div className="board-screen">
      <div className="play-top">
        <button className="btn ghost" onClick={onHome}>
          ← lobby
        </button>
        <h2>Ranked</h2>
        <span />
      </div>
      <p className="lede slim">
        Wins from friend matches. Computer games stay on your device.
      </p>
      {board.address && (
        <div className="you-card">
          <span>Your grade</span>
          <strong>
            {board.rank ? `#${board.rank}` : "—"} · {board.mine.wins}W {board.mine.losses}L
          </strong>
        </div>
      )}
      <ol className="ladder">
        {board.rows.map((row, i) => (
          <li key={row.address} className={i < 3 ? "podium" : ""}>
            <span className="pos">{i + 1}</span>
            <span className="who">{short(row.address)}</span>
            <span className="bar">
              <i style={{ width: `${Math.max(8, row.rate * 100)}%` }} />
            </span>
            <span className="wl">
              {row.wins}W · {row.losses}L
            </span>
          </li>
        ))}
        {board.rows.length === 0 && <li className="empty">Nobody don check up yet.</li>}
      </ol>
    </div>
  );
}

function short(a?: string) {
  if (!a || a.startsWith("0x0000")) return "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
