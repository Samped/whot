import type { Address } from "viem";

/** Live social hub on Base Sepolia. */
const LIVE_SOCIAL = "0xbacfe803959f5739e2ca2cb00a24b7485cceeba0" as Address;
const fromEnv = (process.env.NEXT_PUBLIC_SOCIAL_ADDRESS || "") as Address;
export const SOCIAL_ADDRESS = (fromEnv || LIVE_SOCIAL) as Address;

export const AVATARS = [
  { id: 0, label: "Circle", shape: 1 },
  { id: 1, label: "Triangle", shape: 2 },
  { id: 2, label: "Cross", shape: 3 },
  { id: 3, label: "Square", shape: 4 },
  { id: 4, label: "Star", shape: 5 },
  { id: 5, label: "WHOT", shape: 6 },
] as const;

export type PlayerProfile = {
  nickname: string;
  avatar: number;
  email: string;
  set: boolean;
};

export function emptyProfile(): PlayerProfile {
  return { nickname: "", avatar: 0, email: "", set: false };
}

export function parseProfile(raw: unknown): PlayerProfile {
  if (!raw) return emptyProfile();
  const row = Array.isArray(raw) ? raw : (raw as Record<string, unknown>);
  const get = (i: number, key: string) => (Array.isArray(row) ? row[i] : row[key]);
  return {
    nickname: String(get(0, "nickname") || ""),
    avatar: Number(get(1, "avatar") || 0),
    email: String(get(2, "email") || ""),
    set: Boolean(get(3, "set")),
  };
}

export function displayName(profile: PlayerProfile | undefined, address?: string) {
  if (profile?.set && profile.nickname) return profile.nickname;
  if (!address) return "Player";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
