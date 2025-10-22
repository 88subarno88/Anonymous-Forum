import hre from "hardhat";

async function main() {
  console.log("Deploying ForumV1 contract...");
  
  // This line gets the contract factory and deploys the contract
  const forum = await hre.ethers.deployContract("ForumV1");

  // We wait for the deployment to be confirmed on the blockchain
  await forum.waitForDeployment();

  // We print the address of the newly deployed contract
  console.log(`ForumV1 contract deployed to: ${forum.target}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});