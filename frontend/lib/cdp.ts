import type { Config } from "@coinbase/cdp-core";

export const CDP_PROJECT_ID =
  process.env.NEXT_PUBLIC_CDP_PROJECT_ID || "83fabf53-c18c-4b31-bb24-d7aeeec397bc";

export const cdpConfig: Config = {
  projectId: CDP_PROJECT_ID,
  ethereum: {
    createOnLogin: "eoa",
  },
  disableAnalytics: true,
};
