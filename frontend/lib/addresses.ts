import type { Address } from "viem";

/** Live table on Base Sepolia. */
const LIVE = "0xb9eea0eb5e0687ac7b2ccc903c6619e13e6e0b02" as Address;
const RETIRED = [
  "0x2de24c6c942756dc2e0a71fbe5d869ed0bff057e",
  "0x3f1d79bfbb2737e5dff849c0948d576efa5579ca",
  "0x9a603f5f63cdb743f655969c2d6463c65a938fba",
  "0x82bdd676fc74220e6e7ca2e4dd155225c4e2f7ac",
  "0xb2ecc99fdb59b539f8174f28ee6095965071eaa6",
];

const fromEnv = (process.env.NEXT_PUBLIC_WHOT_ADDRESS || "") as Address;
export const WHOT_ADDRESS = (
  fromEnv && !RETIRED.includes(fromEnv.toLowerCase()) ? fromEnv : LIVE
) as Address;
