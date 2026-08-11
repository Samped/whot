import hre from "hardhat";

async function main() {
  const [wallet] = await hre.viem.getWalletClients();
  const whot = await hre.viem.deployContract("Whot");
  console.log(`Deployer: ${wallet.account.address}`);
  console.log(`Whot:     ${whot.address}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
