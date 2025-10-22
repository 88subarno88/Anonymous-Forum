// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.23;

import {IWorldID} from "@worldcoin/world-id-contracts/src/interfaces/IWorldID.sol";

contract ForumWorldID {
    IWorldID private immutable _worldId;
    // Store as hashed uint256 values (immutable compatible)
    uint256 private immutable _appId;
    uint256 private immutable _actionId;

    // Public so frontend can check if a nullifier was already used
    mapping(uint256 => bool) public usedNullifiers;

    struct Post {
        uint id;
        string ipfsHash;
        uint256 anonymousAuthorId;
    }

    uint public postCount;
    mapping(uint => Post) public posts;
    
    event PostPublished(uint id, string ipfsHash, uint256 anonymousAuthorId);

    // Custom errors for better debugging
    error NullifierAlreadyUsed(uint256 nullifierHash);
    error InvalidWorldIDProof();
    error EmptyIPFSHash();

    constructor(
        IWorldID worldId,
        string memory appId,
        string memory actionId
    ) {
        _worldId = worldId;
        // Hash the strings and store as uint256
        _appId = uint256(keccak256(abi.encodePacked(appId)));
        _actionId = uint256(keccak256(abi.encodePacked(actionId)));
    }

    function publishPost(
        string memory ipfsHash,
        address userAddress,
        uint256 root,
        uint256 nullifierHash,
        uint256[8] calldata proof
    ) external {
        // Validate inputs
        if (bytes(ipfsHash).length == 0) {
            revert EmptyIPFSHash();
        }

        // Check if nullifier was already used
        if (usedNullifiers[nullifierHash]) {
            revert NullifierAlreadyUsed(nullifierHash);
        }

        // Verify the World ID proof using the hashed values
        try _worldId.verifyProof(
            root,
            _appId,
            _actionId,
            0, // signal (0 is default when no signal is used)
            nullifierHash,
            proof
        ) {
            // Mark nullifier as used
            usedNullifiers[nullifierHash] = true;
            
            // Create the post
            postCount++;
            posts[postCount] = Post(postCount, ipfsHash, nullifierHash);
            emit PostPublished(postCount, ipfsHash, nullifierHash);
        } catch {
            // If World ID verification fails, revert with clear error
            revert InvalidWorldIDProof();
        }
    }

    // Helper functions for frontend
    function isNullifierUsed(uint256 nullifierHash) external view returns (bool) {
        return usedNullifiers[nullifierHash];
    }

    // Return the hashed app ID (for verification purposes)
    function getAppId() external view returns (uint256) {
        return _appId;
    }

    // Return the hashed action ID (for verification purposes)
    function getActionId() external view returns (uint256) {
        return _actionId;
    }
}