"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { formatEther } from "viem";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { useRecentTables } from "@/hooks/useRecentTables";
import { tableCode, tableHref, parseTableCode, useWhot } from "@/hooks/useWhot";
import { rememberTable } from "@/lib/recent-tables";
import { TableFelt } from "@/components/TableFelt";
import { MatchResult } from "@/components/MatchResult";
import { CardSlot, ShapeGlyph, WhotBack, WhotFace } from "@/components/WhotCard";
import { decodeCard, isLegal, pack, resolvePickChallenge } from "@/lib/whot";
import { useGameAccount } from "@/hooks/useGameAccount";
import { useSocialApi } from "@/hooks/SocialProvider";
import { isOpen } from "@/lib/table-view";
import { ProfileDash } from "@/components/ProfileDash";
import { TableMusicButton } from "@/components/TableMusicButton";
import { displayName, type PlayerProfile } from "@/lib/social";
import type { Address } from "viem";

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
          : params.get("me") === "1"
            ? "me"
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
      {view === "me" && <ProfileDash onHome={() => router.push("/")} />}
    </div>
  );
}

function Home({ onBoard }: { onBoard: () => void }) {
  const router = useRouter();
  const game = useWhot(0);
  const board = useLeaderboard();
  const recent = useRecentTables();
  const social = useSocialApi();
  const { signedIn, requestLogin, address } = useGameAccount();
  const [code, setCode] = useState("");
  const [hosting, setHosting] = useState(false);
  const [startingSolo, setStartingSolo] = useState(false);
  const [names, setNames] = useState<Record<string, PlayerProfile>>({});

  useEffect(() => {
    if (game.error) toast.error(game.error);
  }, [game.error]);

  useEffect(() => {
    const addrs = board.rows.slice(0, 5).map((r) => r.address);
    if (!addrs.length) return;
    void social.loadProfiles(addrs).then(setNames);
  }, [board.rows, social]);

  function needLogin() {
    if (signedIn) return false;
    requestLogin();
    toast.error("Sign in with email or a wallet first.");
    return true;
  }

  function remember(id: number, solo: boolean, seat = -1) {
    if (!address || id <= 0) return;
    rememberTable(address, { id, solo, seat });
    void recent.refresh();
  }

  async function host() {
    if (needLogin()) return;
    setHosting(true);
    const id = await game.openTable();
    setHosting(false);
    if (id > 0) {
      remember(id, false, 0);
      router.push(tableHref(id));
    }
  }

  async function playComputer() {
    if (needLogin()) return;
    setStartingSolo(true);
    const id = await game.openSolo();
    setStartingSolo(false);
    if (id > 0) {
      remember(id, true, 0);
      router.push(tableHref(id));
    }
  }

  function join() {
    if (needLogin()) return;
    const id = parseTableCode(code);
    if (!id) {
      toast.error("Enter a table code");
      return;
    }
    remember(id, false);
    router.push(tableHref(id));
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
          <p className="eyebrow">WHOT cards · 54 in the pack</p>
          <h1>Sit down.</h1>
          <p className="lede">
            Hold on. Pick two. General market. Same WHOT — match the pile by
            shape or number. First to empty their hand wins. Your cards sit
            encrypted on-chain, hidden from the room. They only decrypt when you
            play one onto the table.
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
            Host a table, send the code. Both hands stay sealed on-chain until
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
              Or enter a code
              <input
                id="table-code"
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Z7AE0K"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={8}
              />
            </label>
            <button type="submit" className="btn ghost">
              Sit at that table
            </button>
          </form>
        </aside>
      </section>

      {signedIn && social.openInvites.length > 0 && (
        <section className="invite-panel home-invites">
          <header>
            <h2>Invites</h2>
            <button className="btn ghost" type="button" onClick={() => router.push("/?me=1")}>
              Dashboard
            </button>
          </header>
          <ol className="invite-list">
            {social.openInvites.map((invite) => (
              <li key={`${invite.index}-${invite.tableId}`}>
                <button
                  className="invite-main"
                  type="button"
                  onClick={() => router.push(tableHref(invite.tableId))}
                >
                  <span className="invite-from">{invite.fromName}</span>
                  <span className="invite-meta">Table {tableCode(invite.tableId)} · sit now</span>
                </button>
                <button
                  className="invite-dismiss"
                  type="button"
                  onClick={() => void social.dismissInvite(invite.index)}
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {signedIn && recent.rows.length > 0 && (
        <section className="recent-tables">
          <header>
            <h2>Your tables</h2>
            <p className="lede slim">Jump back into a table you left.</p>
          </header>
          <ol className="recent-list">
            {recent.rows.map((row) => (
              <li key={row.id} className={row.alive ? "live" : "done"}>
                <button
                  className="recent-main"
                  type="button"
                  onClick={() => router.push(tableHref(row.id))}
                >
                  <span className="recent-code">{tableCode(row.id)}</span>
                  <span className="recent-meta">
                    {row.solo ? "Computer" : "Friend"} · {row.status}
                  </span>
                </button>
                <button
                  className="recent-dismiss"
                  type="button"
                  aria-label={`Remove table ${tableCode(row.id)}`}
                  onClick={() => recent.dismiss(row.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

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
              <span className="who">
                {displayName(names[row.address.toLowerCase()], row.address)}
              </span>
              <span className="wl">
                {row.wins}W · {row.losses}L
              </span>
            </li>
          ))}
          {board.rows.length === 0 && <li className="empty">No winners yet.</li>}
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
          Same African WHOT you already know. The only change is the hand:
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
            number. First to empty the hand wins.
          </p>
          <p>
            Nothing follows? Go market and draw. A pending pick two or pick
            three must be paid, or answered with the same kind, before you
            can dump anything else.
          </p>
          <p className="how-calls-label">Specials by card number</p>
          <ul className="how-calls">
            {[
              {
                card: pack(1, 1),
                n: "1",
                text: "Hold on — you play again.",
              },
              {
                card: pack(2, 2),
                n: "2",
                text: "Pick two — the other seat draws two, unless they dump a 2 (stacks +2).",
              },
              {
                card: pack(3, 5),
                n: "5",
                text: "Pick three — the other seat draws three, unless they dump a 5 (stacks +3).",
              },
              {
                card: pack(5, 8),
                n: "8",
                text: "Suspension — skip them. You keep the turn.",
              },
              {
                card: pack(1, 14),
                n: "14",
                text: "General market — they draw one.",
              },
              {
                card: pack(6, 20),
                n: "20",
                text: "WHOT — call the shape the table must follow.",
              },
            ].map((row) => (
              <li key={row.n} className="how-call">
                <span className="how-call-card">
                  <WhotFace card={decodeCard(row.card)} size="lg" />
                </span>
                <div className="how-call-copy">
                  <p className="how-call-n">
                    <span className="how-call-k">Card no.</span>
                    <span>{row.n}</span>
                  </p>
                  <p className="how-call-text">{row.text}</p>
                </div>
              </li>
            ))}
          </ul>
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
  const { signedIn, requestLogin, address } = useGameAccount();
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
    if (id > 0) {
      if (address) rememberTable(address, { id, solo: true, seat: 0 });
      router.replace(tableHref(id));
    }
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
  const { address } = useGameAccount();
  const phase = game.table?.phase_ ?? 0;
  const top = game.table?.top ? decodeCard(game.table.top) : null;
  const link = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}${tableHref(tableId)}`;
  }, [tableId]);

  useEffect(() => {
    if (game.error) toast.error(game.error);
  }, [game.error]);

  useEffect(() => {
    if (!address || tableId <= 0 || !game.table || game.table.phase_ === 0) return;
    rememberTable(address, {
      id: tableId,
      solo: Boolean(game.table.solo),
      seat: game.seat,
    });
  }, [address, tableId, game.table, game.seat]);

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
        <p>Send this code or the link. Hands encrypt when the second account sits.</p>
        <div className="copy-row">
          <button className="btn primary" onClick={() => copy(tableCode(tableId))}>
            Copy code
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
  const myHandCount = game.seat === 0 ? (game.table?.hand0 ?? 0) : (game.table?.hand1 ?? 0);
  const myScore = game.seat === 0 ? (game.table?.score0_ ?? 0) : (game.table?.score1_ ?? 0);
  const oppScore = game.seat === 0 ? (game.table?.score1_ ?? 0) : (game.table?.score0_ ?? 0);
  const tieGame = phase === 4 && isOpen(game.table?.winner_);
  const countingRanks = Boolean(game.table?.marketEnd_) && phase === 3;
  const pickChallenge = resolvePickChallenge({
    pendingKind: game.table?.pickKind ?? 0,
    pendingPick: game.table?.pick ?? 0,
    top,
    lastCall: game.lastCall,
    lastPlayed: game.lastPlayed,
  });
  const legalHint =
    game.myTurn &&
    live &&
    !countingRanks &&
    game.myCards.some((c) => isLegal(c, top, called, pickChallenge.kind));

  return (
    <div className="play-screen">
      <div className="play-top">
        <button className="btn ghost" onClick={() => router.push("/")}>
          ← lobby
        </button>
        <div className="play-top-actions">
          <TableMusicButton />
          <button className="table-pill" onClick={() => copy(link)}>
            Table {tableCode(tableId)}
          </button>
        </div>
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
            ? game.table?.marketEnd_
              ? tieGame
                ? `Market finished — ranks tied at ${myScore}.`
                : game.address != null &&
                    game.table?.winner_?.toLowerCase() === game.address.toLowerCase()
                  ? `Market finished — you win with ${myScore} points.`
                  : game.table?.solo &&
                      game.table.winner_?.toLowerCase() === game.table.p1?.toLowerCase()
                    ? `Market finished — computer wins with ${oppScore} points.`
                    : `Market finished — ${short(game.table?.winner_)} wins with ${oppScore} points.`
              : game.table?.solo &&
                  game.table.winner_?.toLowerCase() === game.table.p1?.toLowerCase()
                ? "The computer wins."
                : `${short(game.table?.winner_)} wins!`
            : countingRanks
              ? game.status ||
                (game.settleStuck
                  ? "Still opening sealed ranks… tap Count ranks again if this hangs."
                  : "Counting the ranks in each hand…")
              : phase === 2
              ? game.status || "Locking the opener…"
              : game.sealedPending > 0
                ? game.sealedPending > 1
                  ? `Those ${game.sealedPending} are landing in your hand…`
                  : "That card is landing in your hand…"
                : game.status
                  ? game.status
                  : game.myTurn
                    ? legalHint
                      ? pickChallenge.kind
                        ? pickChallenge.kind === 2
                          ? "Dump a 2 to stack, or go market."
                          : "Dump a 5 to stack, or go market."
                        : "Your turn — dump a card."
                      : pickChallenge.kind
                        ? pickChallenge.kind === 2
                          ? "No 2 to stack. Go market."
                          : "No 5 to stack. Go market."
                        : game.table?.marketLeft === 0
                          ? "Market is dry — go market to count ranks."
                          : "Nothing follows. Go market."
                    : game.table?.solo
                      ? game.seat < 0
                        ? "Watching this table."
                        : "Computer is on the move…"
                      : "Your friend is thinking…"
        }
        busy={game.busy || game.sealedPending > 0 || countingRanks}
        peeking={game.peeking}
        sealedPending={game.sealedPending}
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
            {countingRanks && game.seat >= 0 && (
              <button
                className="btn primary"
                disabled={game.busy}
                onClick={() => void game.nudgeSettle()}
              >
                {game.busy || game.status ? game.status || "Counting ranks…" : "Count ranks again"}
              </button>
            )}
            {live &&
              game.table?.solo &&
              game.seat >= 0 &&
              !game.myTurn &&
              phase === 3 &&
              !countingRanks &&
              Boolean(game.error || game.computerStuck) && (
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
      {phase === 4 && game.seat >= 0 && (
        <MatchResult
          won={
            !tieGame &&
            game.address != null &&
            game.table?.winner_?.toLowerCase() === game.address.toLowerCase()
          }
          tie={tieGame}
          marketEnd={Boolean(game.table?.marketEnd_)}
          myCount={game.table?.marketEnd_ ? myScore : myHandCount}
          oppCount={game.table?.marketEnd_ ? oppScore : game.opponentCount}
          solo={Boolean(game.table?.solo)}
          onAgain={async () => {
            if (game.table?.solo) {
              const id = await game.openSolo(true);
              if (id > 0) {
                if (address) rememberTable(address, { id, solo: true, seat: 0 });
                router.replace(tableHref(id));
                return;
              }
              toast.error("Could not deal a new table. Try again.");
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
  const router = useRouter();
  const board = useLeaderboard();
  const social = useSocialApi();
  const game = useWhot(0);
  const { address, signedIn, requestLogin } = useGameAccount();
  const [names, setNames] = useState<Record<string, PlayerProfile>>({});
  const [inviting, setInviting] = useState<string | null>(null);

  useEffect(() => {
    if (!board.rows.length) return;
    void social.loadProfiles(board.rows.map((r) => r.address)).then(setNames);
  }, [board.rows, social]);

  async function invitePlayer(target: Address) {
    if (!signedIn) {
      requestLogin();
      toast.error("Sign in first.");
      return;
    }
    if (address && target.toLowerCase() === address.toLowerCase()) {
      toast.error("That is your own seat.");
      return;
    }
    setInviting(target.toLowerCase());
    try {
      const id = await game.openTable();
      if (!id) throw new Error("Could not open a table.");
      if (address) rememberTable(address, { id, solo: false, seat: 0 });
      const profile = names[target.toLowerCase()];
      await social.sendInvite(
        target,
        id,
        profile?.email || undefined,
        social.profile.nickname || undefined,
      );
      toast.success(`Invite sent · table ${tableCode(id)}`);
      router.push(tableHref(id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setInviting(null);
    }
  }

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
        Every player who wins a match lands here — friend matches and computer games. Invite anyone
        straight to a table.
      </p>
      {board.address && (
        <div className="you-card">
          <span>Your grade</span>
          <strong>
            {board.rank ? `#${board.rank}` : "—"} · {board.mine.wins}W {board.mine.losses}L
          </strong>
        </div>
      )}
      <ol className="ladder ladder-invite">
        {board.rows.map((row, i) => {
          const profile = names[row.address.toLowerCase()];
          const mine = address && row.address.toLowerCase() === address.toLowerCase();
          return (
            <li key={row.address} className={i < 3 ? "podium" : ""}>
              <span className="pos">{i + 1}</span>
              <span className="who">
                <span className="who-name">{displayName(profile, row.address)}</span>
                {profile?.set ? (
                  <span className="who-sub">{short(row.address)}</span>
                ) : null}
              </span>
              <span className="bar">
                <i style={{ width: `${Math.max(8, row.rate * 100)}%` }} />
              </span>
              <span className="wl">
                {row.wins}W · {row.losses}L
              </span>
              {!mine && (
                <button
                  className="btn ghost invite-btn"
                  type="button"
                  disabled={Boolean(inviting) || game.busy || !social.enabled}
                  onClick={() => void invitePlayer(row.address)}
                >
                  {inviting === row.address.toLowerCase() ? "…" : "Invite"}
                </button>
              )}
            </li>
          );
        })}
        {board.rows.length === 0 && <li className="empty">No winners yet.</li>}
      </ol>
    </div>
  );
}

function short(a?: string) {
  if (!a || a.startsWith("0x0000")) return "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
