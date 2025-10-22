import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
export default {
  solidity: "0.8.23",
  networks: {
    sepolia: {
      // Use the RPC URL from .env or fallback to empty string (will fail if not set)
      url: process.env.SEPOLIA_RPC_URL || "https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY",
      accounts: process.env.SEPOLIA_PRIVATE_KEY
        ? [process.env.SEPOLIA_PRIVATE_KEY]
        : [], // No account if private key not provided
    },
  },
  etherscan: {
    // Optional: If you plan to verify contracts on Sepolia
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  mocha: {
    timeout: 20000, // 20 seconds
  },
};
