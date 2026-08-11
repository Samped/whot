const path = require("path");

const x402Stub = path.resolve(__dirname, "lib/x402-stub.js");

const x402Aliases = {
  "@x402/core/client": x402Stub,
  "@x402/evm/exact/client": x402Stub,
  "@x402/evm/upto/client": x402Stub,
  "@x402/svm/exact/client": x402Stub,
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    resolveAlias: {
      "@x402/core/client": "./lib/x402-stub.js",
      "@x402/evm/exact/client": "./lib/x402-stub.js",
      "@x402/evm/upto/client": "./lib/x402-stub.js",
      "@x402/svm/exact/client": "./lib/x402-stub.js",
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      ...x402Aliases,
    };
    return config;
  },
  transpilePackages: [
    "@coinbase/cdp-core",
    "@coinbase/cdp-hooks",
    "@coinbase/cdp-wagmi",
  ],
  serverExternalPackages: [
    "pino-pretty",
    "lokijs",
    "encoding",
    "@coinbase/cdp-sdk",
  ],
};

module.exports = nextConfig;
