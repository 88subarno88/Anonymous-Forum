// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

contract ForumV1 {
    struct Post {
        uint id;
        address author;
        string ipfsHash;
        uint likes;
    }

    uint public postCount;
    mapping(uint => Post) public posts;
    mapping(uint => mapping(address => bool)) public hasLiked;

    event PostPublished(uint id, address author, string ipfsHash);
    event PostLiked(uint id, address liker);

    function publishPost(string memory _ipfsHash) public {
        postCount++;
        posts[postCount] = Post(postCount, msg.sender, _ipfsHash, 0);
        emit PostPublished(postCount, msg.sender, _ipfsHash);
    }

    function likePost(uint _postId) public {
        require(_postId > 0 && _postId <= postCount, "Post does not exist");
        require(!hasLiked[_postId][msg.sender], "You have already liked this post");

        hasLiked[_postId][msg.sender] = true;
        posts[_postId].likes++;
        emit PostLiked(_postId, msg.sender);
    }
}