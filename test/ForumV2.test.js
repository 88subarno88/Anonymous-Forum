import { expect } from "chai";
import hre from "hardhat";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";

describe("ForumV2", function () {
  let forum;
  let group;
  const groupId = 42;
  const members = [];

  beforeEach(async function () {
    const ForumV2 = await hre.ethers.getContractFactory("ForumV2");
    forum = await ForumV2.deploy();

    group = new Group(20);
  });

  it("Should allow a member to publish a post anonymously", async function () {
    const user = new Identity();
    group.addMember(user.commitment);
    await forum.joinGroup(user.commitment);

    const ipfsHash = "Qm...NewPost";
    const signal = hre.ethers.encodeBytes32String("hello world");

    const proof = await generateProof(user, group, signal);

    const tx = await forum.publishPost(ipfsHash, proof);

    await expect(tx)
      .to.emit(forum, "PostPublished")
      .withArgs(1, ipfsHash);
  });
});