import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const WhotModule = buildModule("WhotModule", (m) => {
  const whot = m.contract("Whot");
  return { whot };
});

export default WhotModule;
