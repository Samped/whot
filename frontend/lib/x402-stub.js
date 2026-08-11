/** RainbowKit → Base Account pulls optional x402 payment deps we do not use. */
function unavailable() {
  throw new Error("x402 is not bundled in Loop Run");
}

export class x402Client {
  constructor() {
    unavailable();
  }
}

export class ExactSvmScheme {
  constructor() {
    unavailable();
  }
}

export function registerExactSvmScheme() {
  unavailable();
}

export function registerExactEvmScheme() {
  unavailable();
}

export default {};
