"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useGameAccount } from "@/hooks/useGameAccount";
import { EmailSignIn } from "@/components/EmailSignIn";
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

function AccountChip() {
  const { address, account, mode, signOut, funding } = useGameAccount();
  const label = funding
    ? "Funding…"
    : account?.email
      ? account.email
      : address
        ? `Session ${address.slice(0, 6)}…${address.slice(-4)}`
        : "";

  return (
    <div className="account-bar">
      {address && (
        <span className="ghost-btn session-chip" title={address}>
          {label}
        </span>
      )}
      {(mode === "agent" || mode === "wallet") && (
        <button className="ghost-btn" onClick={signOut}>
          Sign out
        </button>
      )}
      {mode !== "wallet" && <EmailSignIn />}
      <ConnectButton.Custom>
        {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
          const ready = mounted;
          const connected = ready && account && chain;
          if (!ready) return null;
          if (!connected) {
            return (
              <button onClick={openConnectModal} className="ghost-btn">
                <span className="label-full">Connect wallet</span>
                <span className="label-short">Wallet</span>
              </button>
            );
          }
          if (chain.unsupported) {
            return (
              <button onClick={openChainModal} className="wallet-btn">
                Wrong network
              </button>
            );
          }
          return (
            <div className="account-bar">
              <button onClick={openChainModal} className="ghost-btn">
                {chain.name}
              </button>
              <button onClick={openAccountModal} className="wallet-btn">
                {account.displayName}
              </button>
            </div>
          );
        }}
      </ConnectButton.Custom>
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
