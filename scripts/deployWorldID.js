import hre from "hardhat";

async function main() {
  console.log("🚀 Starting ForumWorldID deployment...\n");

  // ============================================
  // CONFIGURATION - Update these if needed
  // ============================================
  
  // World ID Router address on Sepolia testnet
  const WORLD_ID_ROUTER_SEPOLIA = "0x469449f251692e0779667583026b5a1e99512157";
  
  // Your World ID App configuration (must match frontend exactly!)
  const APP_ID = "app_staging_f5218347f9ff75fe3a2cc7b837728d931";
  const ACTION_ID = "Anonymous News Forum15"; // ✅ Matches your World ID app name

  // ============================================
  // DEPLOYMENT
  // ============================================

  console.log("📋 Deployment Configuration:");
  console.log("----------------------------");
  console.log("Network:", hre.network.name);
  console.log("World ID Router:", WORLD_ID_ROUTER_SEPOLIA);
  console.log("App ID:", APP_ID);
  console.log("Action ID:", ACTION_ID);
  console.log("----------------------------\n");

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("👤 Deploying with account:", deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("💰 Account balance:", hre.ethers.formatEther(balance), "ETH\n");

  // Deploy the contract
  console.log("⏳ Deploying ForumWorldID contract...");
  const ForumWorldID = await hre.ethers.getContractFactory("ForumWorldID");
  
  const forum = await ForumWorldID.deploy(
    WORLD_ID_ROUTER_SEPOLIA,
    APP_ID,
    ACTION_ID
  );

  await forum.waitForDeployment();
  const contractAddress = await forum.getAddress();

  console.log("✅ ForumWorldID deployed successfully!");
  console.log("📍 Contract Address:", contractAddress);
  console.log("");

  // ============================================
  // VERIFICATION INFO
  // ============================================

  console.log("🔍 Verify contract on Etherscan:");
  console.log("----------------------------");
  console.log(`npx hardhat verify --network sepolia ${contractAddress} "${WORLD_ID_ROUTER_SEPOLIA}" "${APP_ID}" "${ACTION_ID}"`);
  console.log("");

  // ============================================
  // CONTRACT INFO FOR FRONTEND
  // ============================================

  console.log("📝 Update your contractInfo.json:");
  console.log("----------------------------");
  const contractInfo = {
    address: contractAddress,
    network: "sepolia",
    abi: [
      "function publishPost(string memory ipfsHash, address userAddress, uint256 root, uint256 nullifierHash, uint256[8] calldata proof) external",
      "function posts(uint256) external view returns (uint256 id, string memory ipfsHash, uint256 anonymousAuthorId)",
      "function postCount() external view returns (uint256)",
      "function usedNullifiers(uint256) external view returns (bool)",
      "function isNullifierUsed(uint256 nullifierHash) external view returns (bool)",
      "function getAppId() external view returns (uint256)",
      "function getActionId() external view returns (uint256)",
      "event PostPublished(uint256 id, string ipfsHash, uint256 anonymousAuthorId)"
    ]
  };
  
  console.log(JSON.stringify(contractInfo, null, 2));
  console.log("");

  // ============================================
  // NEXT STEPS
  // ============================================

  console.log("✨ Next Steps:");
  console.log("----------------------------");
  console.log("1. Copy the contract address above");
  console.log("2. Update your contractInfo.json file");
  console.log("3. Verify the contract on Etherscan (command above)");
  console.log("4. Make sure your frontend uses:");
  console.log(`   - app_id: "${APP_ID}"`);
  console.log(`   - action: "${ACTION_ID}"`);
  console.log("5. Your frontend App.jsx is already configured correctly!");
  console.log("6. Test publishing a post!");
  console.log("");

  console.log("🎉 Deployment complete!");
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });