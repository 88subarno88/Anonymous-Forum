import { useState, useEffect, useCallback } from "react";
import { ethers, WebSocketProvider, BrowserProvider } from "ethers";
import { IDKitWidget, VerificationLevel } from "@worldcoin/idkit";
import { useDropzone } from "react-dropzone";
import lighthouse from "@lighthouse-web3/sdk";
import * as LitJsSdk from "@lit-protocol/lit-node-client";
import "./App.css";

// NOTE: NOT importing contractInfo.json - using hardcoded values instead

// Lighthouse API key
const LIGHTHOUSE_API_KEY = "1abba7a0.8d87bb5286174dd6aa34f34cfcd4fc4b";

// World ID Configuration - Must match your contract deployment
const WORLD_ID_APP_ID = "app_staging_f52183479ff75fe3a2cc7b837728d931";
const WORLD_ID_ACTION = "anonymous-news-forum15"; // ✅ Matches World ID portal identifier

// Contract Configuration - Updated with your newly deployed contract (with groupId fix!)
const CONTRACT_ADDRESS = "0x14ab6A6685477121d2B091e567bB5E2C092a6ffd";
const CONTRACT_ABI = [
  "function publishPost(string memory ipfsHash, address userAddress, uint256 root, uint256 nullifierHash, uint256[8] calldata proof) external",
  "function posts(uint256) external view returns (uint256 id, string memory ipfsHash, uint256 anonymousAuthorId)",
  "function postCount() external view returns (uint256)",
  "function usedNullifiers(uint256) external view returns (bool)",
  "function isNullifierUsed(uint256 nullifierHash) external view returns (bool)",
  "function getAppId() external view returns (uint256)",
  "function getActionId() external view returns (uint256)",
  "event PostPublished(uint256 id, string ipfsHash, uint256 anonymousAuthorId)"
];

// Component that displays a single post
function PostItem({ post, litNodeClient }) {
  const [metadata, setMetadata] = useState(null);
  const [decryptedImageUrl, setDecryptedImageUrl] = useState(null);
  const [isDecrypting, setIsDecrypting] = useState(false);

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const response = await fetch(
          `https://gateway.lighthouse.storage/ipfs/${post.ipfsHash}`
        );
        const data = await response.json();
        setMetadata(data);
      } catch (error) {
        console.error("Failed to fetch post metadata:", error);
      }
    };
    fetchMetadata();
  }, [post.ipfsHash]);

  const decryptAndDisplay = async () => {
    if (!metadata?.encryptedImageHash || !litNodeClient) return;
    setIsDecrypting(true);
    try {
      const authSig = await LitJsSdk.checkAndSignAuthMessage({ chain: "sepolia" });
      const symmetricKey = await litNodeClient.getEncryptionKey({
        accessControlConditions: metadata.accessControlConditions,
        toDecrypt: metadata.encryptedSymmetricKey,
        chain: "sepolia",
        authSig,
      });
      const encryptedImageResponse = await fetch(
        `https://gateway.lighthouse.storage/ipfs/${metadata.encryptedImageHash}`
      );
      const encryptedImageBlob = await encryptedImageResponse.blob();
      const decryptedFile = await LitJsSdk.decryptFile({
        file: encryptedImageBlob,
        symmetricKey,
      });
      const imageUrl = URL.createObjectURL(
        new Blob([decryptedFile], { type: "image/jpeg" })
      );
      setDecryptedImageUrl(imageUrl);
    } catch (error) {
      console.error("Failed to decrypt:", error);
      alert("Decryption failed. You may not meet the access requirements.");
    } finally {
      setIsDecrypting(false);
    }
  };

  if (!metadata) return <div className="post">Loading post...</div>;

  return (
    <div className="post">
      <p>
        <strong>Post #{Number(post.id)}</strong>
      </p>
      <p>{metadata.text}</p>
      {metadata.encryptedImageHash && (
        <div className="proof-section">
          {decryptedImageUrl ? (
            <img
              src={decryptedImageUrl}
              alt="Decrypted Proof"
              style={{ maxWidth: "100%", borderRadius: "8px" }}
            />
          ) : (
            <button onClick={decryptAndDisplay} disabled={isDecrypting}>
              {isDecrypting ? "Decrypting..." : "View Encrypted Proof 🔓"}
            </button>
          )}
        </div>
      )}
      <p className="author-id">
        Anonymous Author ID: {post.anonymousAuthorId.toString()}
      </p>
    </div>
  );
}

// ==================== MAIN APP ====================
function App() {
  const [readOnlyContract, setReadOnlyContract] = useState(null);
  const [message, setMessage] = useState("");
  const [posts, setPosts] = useState([]);
  const [postText, setPostText] = useState("");
  const [postImage, setPostImage] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [litNodeClient, setLitNodeClient] = useState(null);

  // ---------- Initialize connections ----------
  useEffect(() => {
    const init = async () => {
      try {
        const client = new LitJsSdk.LitNodeClient({ litNetwork: "jalapeno" });
        await client.connect();
        setLitNodeClient(client);

        const provider = new WebSocketProvider(
          "wss://eth-sepolia.g.alchemy.com/v2/NNRU8VAYmOjh1juq46Gse"
        );
        const contract = new ethers.Contract(
          CONTRACT_ADDRESS,
          CONTRACT_ABI,
          provider
        );
        setReadOnlyContract(contract);

        // DIAGNOSTIC: Check what's in the contract
        try {
          const contractAppId = await contract.getAppId();
          const contractActionId = await contract.getActionId();
          
          const expectedAppId = ethers.keccak256(ethers.toUtf8Bytes(WORLD_ID_APP_ID));
          const expectedActionId = ethers.keccak256(ethers.toUtf8Bytes(WORLD_ID_ACTION));
          
          console.log("=== CONTRACT VERIFICATION ===");
          console.log("Contract Address:", CONTRACT_ADDRESS);
          console.log("Contract App ID (hashed):", contractAppId.toString());
          console.log("Expected App ID (hashed):", BigInt(expectedAppId).toString());
          console.log("App ID Match:", contractAppId.toString() === BigInt(expectedAppId).toString() ? "✅ YES" : "❌ NO");
          console.log("");
          console.log("Contract Action ID (hashed):", contractActionId.toString());
          console.log("Expected Action ID (hashed):", BigInt(expectedActionId).toString());
          console.log("Action ID Match:", contractActionId.toString() === BigInt(expectedActionId).toString() ? "✅ YES" : "❌ NO");
          console.log("============================");
          
          if (contractAppId.toString() !== BigInt(expectedAppId).toString() || 
              contractActionId.toString() !== BigInt(expectedActionId).toString()) {
            setMessage("⚠️ Warning: Contract App ID or Action ID doesn't match frontend configuration. Check console for details.");
          }
        } catch (diagError) {
          console.error("Could not verify contract IDs:", diagError);
        }

        await fetchPosts(contract);

        contract.on("PostPublished", (id, ipfsHash, anonymousAuthorId) => {
          const newPost = {
            id: Number(id),
            ipfsHash,
            anonymousAuthorId: BigInt(anonymousAuthorId),
          };
          setPosts((prev) => [newPost, ...prev]);
        });

        return () => contract.removeAllListeners("PostPublished");
      } catch (error) {
        console.error("Initialization failed:", error);
        setMessage("App failed to load. Check ad blockers or your RPC URL.");
      }
    };
    
    if (document.readyState === "complete") {
      init();
    } else {
      window.addEventListener("load", init);
      return () => window.removeEventListener("load", init);
    }
  }, []);

  // ---------- Fetch all posts ----------
  const fetchPosts = async (currentContract) => {
    if (!currentContract) return;
    try {
      const postCount = await currentContract.postCount();
      const fetchedPosts = [];
      for (let i = Number(postCount); i >= 1; i--) {
        const post = await currentContract.posts(i);
        fetchedPosts.push({
          id: Number(post.id),
          ipfsHash: post.ipfsHash,
          anonymousAuthorId: BigInt(post.anonymousAuthorId),
        });
      }
      setPosts(fetchedPosts);
    } catch (error) {
      console.error("Error fetching posts:", error);
    }
  };

  // ---------- World ID proof + publish logic ----------
  const handleWorldIdSuccess = async (proofResult) => {
    console.log("=== World ID Verification Success ===");
    console.log("Proof result:", JSON.stringify(proofResult, null, 2));
    console.log("====================================");
    
    if (!postText && !postImage) {
      setMessage("Cannot publish an empty post.");
      return;
    }

    let provider;
    let signer;

    try {
      setMessage("Proof received. Please connect wallet to publish.");

      provider = new BrowserProvider(window.ethereum);
      await provider.send("eth_requestAccounts", []);
      signer = await provider.getSigner();
      const userAddress = await signer.getAddress();

      const writeableContract = new ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        signer
      );

      setMessage("Wallet connected. Encrypting & uploading content...");
      setIsUploading(true);

      let imageMetadata = {};
      const accessControlConditions = [
        {
          contractAddress: "",
          standardContractType: "",
          chain: "sepolia",
          method: "eth_getBalance",
          parameters: [":userAddress", "latest"],
          returnValueTest: { comparator: ">=", value: "100000000000000" },
        },
      ];

      if (postImage) {
        const authSig = await LitJsSdk.checkAndSignAuthMessage({ chain: "sepolia" });
        const { encryptedFile, symmetricKey } = await LitJsSdk.encryptFile({
          file: postImage,
        });
        const encryptedSymmetricKey = await litNodeClient.saveEncryptionKey({
          accessControlConditions,
          symmetricKey,
          authSig,
          chain: "sepolia",
        });

        const imageUploadResponse = await lighthouse.upload([encryptedFile], LIGHTHOUSE_API_KEY);
        
        imageMetadata = {
          encryptedImageHash: imageUploadResponse.data.Hash,
          encryptedSymmetricKey: LitJsSdk.uint8arrayToString(
            encryptedSymmetricKey,
            "base16"
          ),
          accessControlConditions,
        };
      }

      const finalPostMetadata = { text: postText, ...imageMetadata };
      const metadataUploadResponse = await lighthouse.uploadText(
        JSON.stringify(finalPostMetadata),
        LIGHTHOUSE_API_KEY,
        "Post Metadata"
      );
      const metadataHash = metadataUploadResponse.data.Hash;

      console.log("=== World ID Proof Verification ===");
      console.log("Raw proof from IDKit:", proofResult);
      
      const merkleRoot = proofResult.merkle_root;
      const nullifierHash = proofResult.nullifier_hash;
      
      // Decode the proof array - handle World ID's proof format
      let proofArray;
      try {
        const proofData = proofResult.proof.startsWith('0x') 
          ? proofResult.proof 
          : `0x${proofResult.proof}`;
        
        // World ID returns proof as uint256[8], decode it
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
          ["uint256[8]"],
          proofData
        );
        
        // Create a completely new mutable array by mapping each element
        // This ensures ethers.js can work with it without read-only issues
        proofArray = decoded[0].map(p => BigInt(p.toString()));
        
        // Ensure it's an array of 8 BigInt values
        if (!Array.isArray(proofArray) || proofArray.length !== 8) {
          throw new Error(`Invalid proof format: expected array of 8, got ${proofArray?.length || 0}`);
        }
        
        console.log("Decoded proof (8 elements):", proofArray.map(p => p.toString()));
      } catch (decodeError) {
        console.error("Proof decoding error:", decodeError);
        setMessage("Failed to decode World ID proof. Please try again.");
        return;
      }

      console.log("=== Sending to Contract ===");
      console.log("Contract Address:", CONTRACT_ADDRESS);
      console.log("IPFS Hash:", metadataHash);
      console.log("User Address:", userAddress);
      console.log("Merkle Root:", merkleRoot);
      console.log("Nullifier Hash:", nullifierHash);
      console.log("Proof Array Length:", proofArray.length);
      console.log("Proof Array Type:", Array.isArray(proofArray) ? "Array" : typeof proofArray);
      console.log("Proof Array Values:", proofArray.map((p, i) => `[${i}]: ${p.toString()}`));
      console.log("===========================");

      // Check if nullifier has been used
      try {
        const isUsed = await readOnlyContract.isNullifierUsed(nullifierHash);
        if (isUsed) {
          setMessage("❌ This World ID proof has already been used. Please verify again to get a new proof.");
          return;
        }
        console.log("✓ Nullifier is unused, proceeding...");
      } catch (checkError) {
        console.warn("Could not check nullifier status:", checkError);
      }

      // Simulate the transaction first to catch errors early
      setMessage("Validating transaction with smart contract...");
      try {
        await writeableContract.publishPost.staticCall(
          metadataHash,
          userAddress,
          merkleRoot,
          nullifierHash,
          proofArray
        );
        console.log("✓ Transaction simulation successful - contract will accept this");
      } catch (simError) {
        console.error("❌ Transaction simulation failed:", simError);
        
        let simErrorMsg = "❌ Smart contract rejected the transaction:\n\n";
        
        if (simError.message?.includes("NullifierAlreadyUsed")) {
          simErrorMsg += "This World ID proof was already used. Verify again for a fresh proof.";
        } else if (simError.message?.includes("InvalidWorldIDProof")) {
          simErrorMsg += "World ID proof verification FAILED in contract.\n\nThis usually means:\n• App ID mismatch between contract and World ID portal\n• Action ID mismatch\n• Invalid proof format\n\nContract expects:\nApp: app_staging_f52183479ff75fe3a2cc7b837728d931\nAction: anonymous-news-forum15";
        } else {
          simErrorMsg += simError.reason || simError.message || "Unknown contract error";
        }
        
        setMessage(simErrorMsg);
        return;
      }
      
      setMessage("Submitting transaction to blockchain...");
      
      const tx = await writeableContract.publishPost(
        metadataHash,
        userAddress,
        merkleRoot,
        nullifierHash,
        proofArray,
        {
          gasLimit: 20000000
        }
      );
      
      console.log("✅ Transaction sent:", tx.hash);
      setMessage(`Transaction sent! Hash: ${tx.hash.slice(0, 10)}... Waiting for confirmation...`);
      
      const receipt = await tx.wait();
      console.log("✅ Transaction confirmed in block:", receipt.blockNumber);

      setMessage("✅ Post published successfully! 🎉");
      setPostText("");
      setPostImage(null);

      if (readOnlyContract) await fetchPosts(readOnlyContract);
      
    } catch (error) {
      console.error("=== ERROR DETAILS ===");
      console.error("Full error:", error);
      console.error("Error code:", error.code);
      console.error("Error reason:", error.reason);
      console.error("Error message:", error.message);
      
      if (error.data) {
        console.error("Error data:", error.data);
      }
      console.error("====================");

      // User-friendly error messages
      let errorMsg = "❌ Publishing failed: ";
      
      if (error.code === "ACTION_REJECTED") {
        errorMsg = "❌ You rejected the transaction in MetaMask.";
      } else if (error.code === "INSUFFICIENT_FUNDS") {
        errorMsg = "❌ Insufficient Sepolia ETH for gas fees. Get free testnet ETH from a Sepolia faucet.";
      } else if (error.message?.includes("NullifierAlreadyUsed")) {
        errorMsg = "❌ This World ID proof has already been used. Please verify with World ID again to get a fresh proof.";
      } else if (error.message?.includes("InvalidWorldIDProof")) {
        errorMsg = "❌ World ID verification FAILED in smart contract.\n\nThis means:\n- App ID in contract doesn't match World ID portal\n- Action ID in contract doesn't match World ID portal\n- Or the proof itself is invalid\n\nContract deployed with:\nApp: app_staging_f52183479ff75fe3a2cc7b837728d931\nAction: anonymous-news-forum15";
      } else if (error.shortMessage) {
        errorMsg += error.shortMessage;
      } else if (error.reason) {
        errorMsg += error.reason;
      } else if (error.message) {
        errorMsg += error.message;
      } else {
        errorMsg += "Unknown error. Check console.";
      }
      
      setMessage(errorMsg);
    } finally {
      setIsUploading(false);
    }
  };

  const onDrop = useCallback((acceptedFiles) => setPostImage(acceptedFiles[0]), []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
  });

  return (
    <div className="App">
      <header className="App-header">
        <h1>Anonymous News Forum</h1>
        <div className="post-form">
          <textarea
            value={postText}
            onChange={(e) => setPostText(e.target.value)}
            placeholder="What's happening?"
          />
          <div
            {...getRootProps()}
            className={`dropzone ${isDragActive ? "active" : ""}`}
          >
            <input {...getInputProps()} />
            {postImage ? (
              <p>Selected: {postImage.name}</p>
            ) : (
              <p>Drag 'n' drop an image here, or click to select</p>
            )}
          </div>

          <IDKitWidget
            app_id={WORLD_ID_APP_ID}
            action={WORLD_ID_ACTION}
            onSuccess={handleWorldIdSuccess}
            onError={(error) => {
              console.error("World ID Error:", error);
              setMessage(`World ID verification failed: ${error.message || JSON.stringify(error)}`);
            }}
            verification_level={VerificationLevel.Device}
            enableTelemetry
            bridge_url="https://bridge.worldcoin.org"
          >
            {({ open }) => (
              <button onClick={open} disabled={isUploading}>
                {isUploading ? "Uploading..." : "Publish with World ID"}
              </button>
            )}
          </IDKitWidget>
        </div>

        {message && <p className="message" style={{ whiteSpace: 'pre-wrap' }}>{message}</p>}

        <div className="posts-feed">
          <h2>Feed</h2>
          {posts.map((post) => (
            <PostItem
              key={Number(post.id)}
              post={post}
              litNodeClient={litNodeClient}
            />
          ))}
        </div>
      </header>
    </div>
  );
}

export default App;