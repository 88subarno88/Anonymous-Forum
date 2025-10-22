import { expect } from "chai";
import hre from "hardhat";

describe("ForumV1", function () {
  let forum;
  let owner, addr1;

  beforeEach(async function () {
    [owner, addr1] = await hre.ethers.getSigners();
    const ForumV1 = await hre.ethers.getContractFactory("ForumV1");
    forum = await ForumV1.deploy();
  });

  it("Should allow a user to publish a post", async function () {
    const ipfsHash = "Qm...";
    await expect(forum.publishPost(ipfsHash))
      .to.emit(forum, "PostPublished")
      .withArgs(1, owner.address, ipfsHash);
    const post = await forum.posts(1);
    expect(post.id).to.equal(1);
  });

  it("Should allow a user to like a post", async function () {
    await forum.publishPost("Qm...");
    await expect(forum.connect(addr1).likePost(1))
      .to.emit(forum, "PostLiked")
      .withArgs(1, addr1.address);
    const post = await forum.posts(1);
    expect(post.likes).to.equal(1);
  });

  it("Should prevent a user from liking the same post twice", async function () {
    await forum.publishPost("Qm...");
    await forum.connect(addr1).likePost(1);
    await expect(
      forum.connect(addr1).likePost(1)
    ).to.be.revertedWith("You have already liked this post");
  });
});