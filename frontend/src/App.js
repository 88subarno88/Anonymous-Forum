import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { IDKitWidget, VerificationLevel } from '@worldcoin/idkit';
import { useDropzone } from 'react-dropzone';
import lighthouse from '@lighthouse-web3/sdk';
import * as LitJsSdk from "@lit-protocol/lit-node-client";
import contractInfo from './contractInfo.json';
import './App.css';

// 1. IMPORTANT: Remember to paste your Lighthouse API key here!
const LIGHTHOUSE_API_KEY = "1abba7a0.8d87bb5286174dd6aa34f34cfcd4fc4b";

// This component handles displaying and decrypting a single post
function PostItem({ post, litNodeClient }) {
  const [metadata, setMetadata] = useState(null);
  const [decryptedImageUrl, setDecryptedImageUrl] = useState(null);
  const [isDecrypting, setIsDecrypting] = useState(false);

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const response = await fetch(`https://gateway.lighthouse.storage/ipfs/${post.ipfsHash}`);
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
        chain: 'sepolia',
        authSig,
      });
      const encryptedImageResponse = await fetch(`https://gateway.lighthouse.storage/ipfs/${metadata.encryptedImageHash}`);
      const encryptedImageBlob = await encryptedImageResponse.blob();
      const decryptedFile = await LitJsSdk.decryptFile({ file: encryptedImageBlob, symmetricKey });
      const imageUrl = URL.createObjectURL(new Blob([decryptedFile], { type: 'image/jpeg' }));
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
      <p><strong>Post #{Number(post.id)}</strong></p>
      <p>{metadata.text}</p>
      {metadata.encryptedImageHash && (
        <div className="proof-section">
          {decryptedImageUrl ? (
            <img src={decryptedImageUrl} alt="Decrypted Proof" style={{ maxWidth: '100%', borderRadius: '8px' }} />
          ) : (
            <button onClick={decryptAndDisplay} disabled={isDecrypting}>
              {isDecrypting ? 'Decrypting...' : 'View Encrypted Proof 🔓'}
            </button>
          )}
        </div>
      )}
      <p className="author-id">Anonymous Author ID: {post.anonymousAuthorId.toString()}</p>
    </div>
  );
}

// Main App Component
function App() {
  const [contract, setContract] = useState(null);
  const [signer, setSigner] = useState(null);
  const [message, setMessage] = useState('');
  const [posts, setPosts] = useState([]);
  const [postText, setPostText] = useState('');
  const [postImage, setPostImage] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [litNodeClient, setLitNodeClient] = useState(null);

  useEffect(() => {
    const init = async () => {
      // 2. THE DEFINITIVE FIX: Use the correct Lit Protocol testnet name
      const client = new LitJsSdk.LitNodeClient({ litNetwork: "datil-dev" });
      await client.connect();
      setLitNodeClient(client);

      if (window.ethereum) {
        try {
          const provider = new ethers.BrowserProvider(window.ethereum);
          await provider.send("eth_requestAccounts", []);
          const currentSigner = await provider.getSigner();
          setSigner(currentSigner);
          const forumContract = new ethers.Contract(contractInfo.address, contractInfo.abi, currentSigner);
          setContract(forumContract);
          fetchPosts(forumContract);
          forumContract.on("PostPublished", (id, ipfsHash, anonymousAuthorId) => {
            const newPost = { id, ipfsHash, anonymousAuthorId };
            setPosts(prevPosts => [newPost, ...prevPosts]);
          });
        } catch (error) {
          setMessage("Please connect your MetaMask wallet.");
        }
      }
    };
    init();
    return () => {
      if (contract) contract.removeAllListeners("PostPublished");
    };
  }, []);

  // Helper function to switch network
  const switchToSepolia = async () => {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0xaa36a7' }], // Chain ID for Ethereum Sepolia
      });
      const provider = new ethers.BrowserProvider(window.ethereum);
      const newSigner = await provider.getSigner();
      setSigner(newSigner);
      return new ethers.Contract(contractInfo.address, contractInfo.abi, newSigner);
    } catch (switchError) {
      if (switchError.code === 4902) setMessage("Ethereum Sepolia network not found in MetaMask.");
      throw switchError;
    }
  };

  const handleWorldIdSuccess = async (proofResult) => {
    if (!postText && !postImage) {
      setMessage("Cannot publish an empty post.");
      return;
    }
    try {
      setMessage("Proof received. Please switch network to Ethereum Sepolia to publish.");
      const activeContract = await switchToSepolia();
      setMessage("Network switched. Encrypting & uploading content...");
      setIsUploading(true);

      let imageMetadata = {};
      const accessControlConditions = [{ contractAddress: '', standardContractType: '', chain: 'sepolia', method: 'eth_getBalance', parameters: [':userAddress', 'latest'], returnValueTest: { comparator: '>=', value: '100000000000000' } }];

      if (postImage) {
        const authSig = await LitJsSdk.checkAndSignAuthMessage({ chain: "sepolia" });
        const { encryptedFile, symmetricKey } = await LitJsSdk.encryptFile({ file: postImage });
        const encryptedSymmetricKey = await litNodeClient.saveEncryptionKey({ accessControlConditions, symmetricKey, authSig, chain: 'sepolia' });
        const imageUploadResponse = await lighthouse.upload(encryptedFile, LIGHTHOUSE_API_KEY);
        imageMetadata = { encryptedImageHash: imageUploadResponse.data.Hash, encryptedSymmetricKey: LitJsSdk.uint8arrayToString(encryptedSymmetricKey, "base16"), accessControlConditions };
      }

      const finalPostMetadata = { text: postText, ...imageMetadata };
      const metadataUploadResponse = await lighthouse.uploadText(JSON.stringify(finalPostMetadata), LIGHTHOUSE_API_KEY, "Post Metadata");
      const metadataHash = metadataUploadResponse.data.Hash;

      setMessage("Content uploaded. Please approve the final transaction.");
      const userAddress = await signer.getAddress();
      const unpackedProof = ethers.AbiCoder.defaultAbiCoder().decode(['uint25_6[8]'], proofResult.proof)[0];
      const mutableProof = [...unpackedProof];

      const tx = await activeContract.publishPost(metadataHash, userAddress, proofResult.merkle_root, proofResult.nullifier_hash, mutableProof);
      await tx.wait();
      setMessage("Post published with encrypted proof! 🎉");
      setPostText('');
      setPostImage(null);
    } catch (error) {
      console.error("Error during publishing process:", error);
      setMessage("An error occurred during publishing. See console for details.");
    } finally {
      setIsUploading(false);
    }
  };

  const fetchPosts = async (currentContract) => {
    if (!currentContract) return;
    try {
      const postCount = await currentContract.postCount();
      let fetchedPosts = [];
      for (let i = Number(postCount); i >= 1; i--) {
        const post = await currentContract.posts(i);
        fetchedPosts.push(post);
      }
      setPosts(fetchedPosts);
    } catch (error) {
      console.error("Error fetching posts", error);
    }
  };

  const onDrop = useCallback(acceptedFiles => setPostImage(acceptedFiles[0]), []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: {'image/*': []} });

  return (
    <div className="App">
      <header className="App-header">
        <h1>Anonymous News Forum</h1>
        <div className="post-form">
          <textarea value={postText} onChange={(e) => setPostText(e.target.value)} placeholder="What's happening?" />
          <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
            <input {...getInputProps()} />
            { postImage ? <p>Selected: {postImage.name}</p> : <p>Drag 'n' drop an image here, or click to select</p> }
          </div>
          <IDKitWidget
            app_id="app_staging_788b05d77c23e036738f41dc5727e8eb" // Your App ID
            action="anonymous-news-forum" // Your Action ID
            onSuccess={handleWorldIdSuccess}
            verification_level={VerificationLevel.Orb} 
          >
            {({ open }) => <button onClick={open} disabled={isUploading}>{isUploading ? 'Uploading...' : 'Publish with World ID'}</button>}
          </IDKitWidget>
        </div>
        {message && <p className="message">{message}</p>}
        <div className="posts-feed">
          <h2>Feed</h2>
          {posts.map((post) => (<PostItem key={Number(post.id)} post={post} litNodeClient={litNodeClient} />))}
        </div>
      </header>
    </div>
  );
}

export default App;