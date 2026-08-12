"use client";

import { createContext, createElement, useContext, type ReactNode } from "react";
import { useSocial, type SocialApi } from "@/hooks/useSocial";

const SocialContext = createContext<SocialApi | null>(null);

export function SocialProvider({ children }: { children: ReactNode }) {
  const value = useSocial();
  return createElement(SocialContext.Provider, { value }, children);
}

export function useSocialApi() {
  const ctx = useContext(SocialContext);
  if (!ctx) throw new Error("useSocialApi must be used inside SocialProvider");
  return ctx;
}
