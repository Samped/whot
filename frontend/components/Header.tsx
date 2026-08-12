"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useGameAccount } from "@/hooks/useGameAccount";
import { LoginSheet } from "@/components/LoginSheet";
import { WhotBack } from "@/components/WhotCard";

function Nav() {
  const params = useSearchParams();
  const onBoard = params.get("board") === "1";
  const onHow = params.get("how") === "1";
  const onPlay = params.get("play") === "solo" || Boolean(params.get("t"));
  return (
    <nav className="nav-links">
      <Link href="/?play=solo" className={onPlay ? "on" : ""}>
        Play
      </Link>
      <Link href="/?how=1" className={onHow ? "on" : ""}>
        How
      </Link>
      <Link href="/?board=1" className={onBoard ? "on" : ""}>
        Ranked
      </Link>
    </nav>
  );
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function AccountChip() {
  const { account, mode, walletAddress, address, signOut, funding, signedIn } = useGameAccount();

  return (
    <div className="account-bar">
      {signedIn && !funding && mode === "email" && account?.email && address && (
        <span className="ghost-btn session-chip" title={`${account.email} · ${address}`}>
          <span className="session-email">{account.email}</span>
          <span className="session-addr">{shortAddr(address)}</span>
        </span>
      )}
      {signedIn && !funding && mode === "wallet" && walletAddress && (
        <span className="ghost-btn session-chip" title={walletAddress}>
          {shortAddr(walletAddress)}
        </span>
      )}
      {signedIn && funding && (
        <span className="ghost-btn session-chip">Funding…</span>
      )}
      {signedIn ? (
        <button className="ghost-btn" type="button" onClick={signOut}>
          Sign out
        </button>
      ) : (
        <LoginSheet />
      )}
    </div>
  );
}

const Header = () => {
  return (
    <header className="site-header">
      <div className="site-header-inner">
        <div className="header-left">
          <Link href="/" className="brand" aria-label="WHOT home" title="WHOT">
            <WhotBack size="logo" i={2} />
          </Link>
          <Suspense fallback={null}>
            <Nav />
          </Suspense>
        </div>
        <AccountChip />
      </div>
    </header>
  );
};

export { Header };
