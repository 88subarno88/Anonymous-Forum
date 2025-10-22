import { ethers } from "ethers";

(async () => {
  const provider = new ethers.JsonRpcProvider("https://eth-sepolia.g.alchemy.com/v2/NNRU8VAYmOjh1juq46Gse");
  const code = await provider.getCode("0x3259351006d4e83a5a323429323b53a073570081");
  console.log("Contract code length:", code.length);
  console.log("Contract code:", code);
})();
