"use client";

import { ReactNode, useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { baseAccount, injected } from "wagmi/connectors";
import {
  connectorsForWallets,
  RainbowKitProvider,
  darkTheme,
  lightTheme,
} from "@rainbow-me/rainbowkit";
import {
  base as baseWallet,
  injectedWallet,
  metaMaskWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { CDPHooksProvider } from "@coinbase/cdp-hooks";
import { createCDPEmbeddedWalletConnector } from "@coinbase/cdp-wagmi";
import { ThemeProvider, useTheme } from "next-themes";
import { activeChain } from "@/lib/network";
import { CDP_PROJECT_ID, cdpConfig } from "@/lib/cdp";
import { GameAccountProvider } from "@/hooks/useGameAccount";

const queryClient = new QueryClient();

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

const transport = http("/api/rpc", { timeout: 20_000, retryCount: 1 });

const walletConnectors = wcProjectId
  ? connectorsForWallets(
      [
        {
          groupName: "Base",
          wallets: [baseWallet],
        },
        {
          groupName: "Other",
          wallets: [injectedWallet, metaMaskWallet, walletConnectWallet],
        },
      ],
      { appName: "WHOT", projectId: wcProjectId },
    )
  : [baseAccount({ appName: "WHOT" }), injected({ shimDisconnect: true })];

const cdpConnector = CDP_PROJECT_ID
  ? createCDPEmbeddedWalletConnector({
      cdpConfig,
      providerConfig: {
        chains: [activeChain],
        transports: {
          [activeChain.id]: transport,
        },
      },
    })
  : null;

const config = createConfig({
  chains: [activeChain],
  connectors: cdpConnector ? [cdpConnector, ...walletConnectors] : walletConnectors,
  transports: {
    [activeChain.id]: transport,
  },
  pollingInterval: 8_000,
  ssr: true,
});

const RainbowKitWithTheme = ({ children }: { children: ReactNode }) => {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const rainbowTheme =
    mounted && resolvedTheme === "light"
      ? lightTheme({ accentColor: "#a61c14", accentColorForeground: "#efe6d4", borderRadius: "none" })
      : darkTheme({ accentColor: "#efe6d4", accentColorForeground: "#1c1712", borderRadius: "none" });

  return (
    <RainbowKitProvider theme={rainbowTheme}>{children}</RainbowKitProvider>
  );
};

function AppTree({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitWithTheme>
          <GameAccountProvider>{children}</GameAccountProvider>
        </RainbowKitWithTheme>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

const Providers = ({ children }: { children: ReactNode }) => {
  const tree = <AppTree>{children}</AppTree>;
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark">
      {CDP_PROJECT_ID ? <CDPHooksProvider config={cdpConfig}>{tree}</CDPHooksProvider> : tree}
    </ThemeProvider>
  );
};

export { Providers };
