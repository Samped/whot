"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useGameAccount } from "@/hooks/useGameAccount";
import { useSocialApi } from "@/hooks/SocialProvider";
import { LoginSheet } from "@/components/LoginSheet";
import { WhotBack, ShapeGlyph } from "@/components/WhotCard";
import { AVATARS } from "@/lib/social";
import { readEmailIdentity } from "@/lib/game-account";
import { discoverProfileForEmail } from "@/lib/email-profile";

function Nav() {
  const params = useSearchParams();
  const onBoard = params.get("board") === "1";
  const onHow = params.get("how") === "1";
  const onMe = params.get("me") === "1";
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
      <Link href="/?me=1" className={onMe ? "on" : ""}>
        Me
      </Link>
    </nav>
  );
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function AccountChip() {
  const router = useRouter();
  const { account, mode, walletAddress, address, signOut, funding, signedIn } = useGameAccount();
  const social = useSocialApi();
  const [foundNick, setFoundNick] = useState("");
  const [foundAvatar, setFoundAvatar] = useState(0);

  useEffect(() => {
    if (mode !== "email" || !account?.email) {
      setFoundNick("");
      setFoundAvatar(0);
      return;
    }
    if (social.profile.nickname) {
      setFoundNick(social.profile.nickname);
      setFoundAvatar(social.profile.avatar);
      return;
    }
    const cached = readEmailIdentity(account.email);
    if (cached?.nickname) {
      setFoundNick(cached.nickname);
      setFoundAvatar(Number(cached.avatar || 0));
    }
    let stop = false;
    void discoverProfileForEmail(account.email).then((p) => {
      if (stop || !p?.nickname) return;
      setFoundNick(p.nickname);
      setFoundAvatar(p.avatar);
    });
    return () => {
      stop = true;
    };
  }, [mode, account?.email, social.profile.nickname, social.profile.avatar]);

  const avatar = social.profile.nickname ? social.profile.avatar : foundAvatar;
  const label =
    social.profile.nickname ||
    foundNick ||
    (mode === "email" && account?.email ? account.email : "") ||
    (walletAddress ? shortAddr(walletAddress) : "");

  return (
    <div className="account-bar">
      {signedIn && social.inviteCount > 0 && (
        <button
          className="ghost-btn invite-bell"
          type="button"
          title={`${social.inviteCount} invite${social.inviteCount === 1 ? "" : "s"}`}
          onClick={() => router.push("/?me=1")}
        >
          <span className="invite-dot">{social.inviteCount}</span>
          In
        </button>
      )}
      {signedIn && !funding && (
        <button
          className="ghost-btn session-chip session-link"
          type="button"
          title="Open dashboard"
          onClick={() => router.push("/?me=1")}
        >
          <span className={`session-avatar av-${avatar}`} aria-hidden>
            <ShapeGlyph shape={AVATARS[avatar]?.shape ?? 1} />
          </span>
          <span className="session-id">
            <span className="session-email">{label}</span>
            {mode === "email" && address ? (
              <span className="session-addr">{shortAddr(address)}</span>
            ) : mode === "wallet" && walletAddress ? (
              <span className="session-addr">{shortAddr(walletAddress)}</span>
            ) : null}
          </span>
        </button>
      )}
      {signedIn && funding && (
        <span className="ghost-btn session-chip">Funding…</span>
      )}
      {signedIn ? (
        <button className="ghost-btn sign-out-btn" type="button" onClick={signOut}>
          <span className="sign-out-full">Sign out</span>
          <span className="sign-out-short">Out</span>
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
