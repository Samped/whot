"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useGameAccount } from "@/hooks/useGameAccount";
import { useSocialApi } from "@/hooks/SocialProvider";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { AVATARS } from "@/lib/social";
import { readEmailIdentity } from "@/lib/game-account";
import { tableCode, tableHref } from "@/lib/table-code";
import { ShapeGlyph } from "@/components/WhotCard";

export function ProfileDash({ onHome }: { onHome: () => void }) {
  const { address, signedIn, requestLogin, account, mode } = useGameAccount();
  const social = useSocialApi();
  const board = useLeaderboard();
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState(0);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!social.profile.set) {
      const cached = account?.email ? readEmailIdentity(account.email) : null;
      setNickname(cached?.nickname || account?.email?.split("@")[0] || "");
      setAvatar(Number(cached?.avatar || 0));
      setEmail(account?.email || "");
      return;
    }
    setNickname(social.profile.nickname);
    setAvatar(social.profile.avatar);
    setEmail(social.profile.email || account?.email || "");
  }, [social.profile, account?.email]);

  if (!signedIn) {
    return (
      <div className="center-card">
        <h2>Profile</h2>
        <p>Sign in to set your nickname, avatar, and linked email.</p>
        <button className="btn primary" type="button" onClick={requestLogin}>
          Sign in
        </button>
        <button className="btn ghost" type="button" onClick={onHome}>
          Lobby
        </button>
      </div>
    );
  }

  async function save() {
    setBusy(true);
    try {
      await social.saveProfile({ nickname, avatar, email });
      toast.success("Profile saved on-chain");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="profile-dash">
      <div className="play-top">
        <button className="btn ghost" type="button" onClick={onHome}>
          ← lobby
        </button>
        <h2>Dashboard</h2>
        <span />
      </div>

      <section className="profile-hero">
        <div className={`profile-avatar av-${avatar}`} aria-hidden>
          <ShapeGlyph shape={AVATARS[avatar]?.shape ?? 1} />
        </div>
        <div>
          <p className="eyebrow">Your table seat</p>
          <h3>{social.profile.set ? social.profile.nickname : "Set a nickname"}</h3>
          <p className="profile-meta">
            {mode === "email" && account?.email ? account.email : "Wallet"} ·{" "}
            {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—"}
          </p>
        </div>
      </section>

      <section className="profile-stats">
        <div>
          <b>{board.mine.wins}</b>
          <span>Wins</span>
        </div>
        <div>
          <b>{board.mine.losses}</b>
          <span>Losses</span>
        </div>
        <div>
          <b>{board.rank || "—"}</b>
          <span>Rank</span>
        </div>
        <div>
          <b>{board.mine.played}</b>
          <span>Played</span>
        </div>
      </section>

      {social.openInvites.length > 0 && (
        <section className="invite-panel">
          <header>
            <h3>Invites</h3>
            <p className="lede slim">Sit down or dismiss.</p>
          </header>
          <ol className="invite-list">
            {social.openInvites.map((invite) => (
              <li key={`${invite.index}-${invite.tableId}`}>
                <button
                  className="invite-main"
                  type="button"
                  onClick={() => {
                    window.location.href = tableHref(invite.tableId);
                  }}
                >
                  <span className="invite-from">{invite.fromName}</span>
                  <span className="invite-meta">Table {tableCode(invite.tableId)}</span>
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

      <section className="profile-form">
        <h3>Edit profile</h3>
        <label>
          Nickname
          <input
            value={nickname}
            maxLength={20}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Your table name"
          />
        </label>
        <p className="field-hint">Shown on the ranked board and invites.</p>

        <p className="field-label">Avatar</p>
        <div className="avatar-grid">
          {AVATARS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`avatar-pick ${avatar === a.id ? "on" : ""}`}
              onClick={() => setAvatar(a.id)}
            >
              <ShapeGlyph shape={a.shape} />
              <span>{a.label}</span>
            </button>
          ))}
        </div>

        <label>
          Linked email
          <input
            type="email"
            value={email}
            maxLength={64}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@mail.com"
          />
        </label>
        <p className="field-hint">
          Optional. If set, table invites can also land in this inbox. Stored on-chain with your
          profile.
        </p>

        <button className="btn primary" type="button" disabled={busy || !social.enabled} onClick={() => void save()}>
          {busy ? "Saving…" : "Save profile"}
        </button>
        {!social.enabled && <p className="mail-err">Social contract is not configured yet.</p>}
      </section>
    </div>
  );
}
