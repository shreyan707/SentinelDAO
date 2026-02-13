import { ethers } from "ethers";
import { SENTINEL_DAO_ADDRESS, SENTINEL_DAO_ABI } from "./contract";

// === WRITE FUNCTIONS (need MetaMask signer) ===

export async function castVoteOnChain(signer, caseId, decision) {
  const contract = new ethers.Contract(
    SENTINEL_DAO_ADDRESS,
    SENTINEL_DAO_ABI,
    signer
  );

  const tx = await contract.castVote(caseId, decision);
  const receipt = await tx.wait();

  return {
    txHash: receipt.hash,
    success: true,
  };
}

// === READ FUNCTIONS (no signer needed) ===

function getReadContract() {
  const provider = new ethers.BrowserProvider(window.ethereum);
  return new ethers.Contract(
    SENTINEL_DAO_ADDRESS,
    SENTINEL_DAO_ABI,
    provider
  );
}

export async function getCaseFromChain(caseId) {
  const contract = getReadContract();
  const result = await contract.getCase(caseId);

  return {
    messageHash: result[0],
    offender: result[1],
    moderators: result[2],
    voteCount: Number(result[3]),
    resolved: result[4],
    decision: Number(result[5]),
    createdAt: Number(result[6]),
  };
}

export async function getVoteFromChain(caseId, moderatorAddress) {
  const contract = getReadContract();
  const vote = await contract.getVote(caseId, moderatorAddress);
  return Number(vote);
}

export async function getCaseCount() {
  const contract = getReadContract();
  const count = await contract.caseCount();
  return Number(count);
}

export async function getContractOwner() {
  const contract = getReadContract();
  return await contract.owner();
}