import hre from "hardhat";

async function main() {
  const [wallet] = await hre.viem.getWalletClients();
  const whot = await hre.viem.deployContract("Whot");
  const social = await hre.viem.deployContract("WhotSocial");
  console.log(`Deployer: ${wallet.account.address}`);
  console.log(`Whot:     ${whot.address}`);
  console.log(`Social:   ${social.address}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
