import { useState } from "react";
import { useWallet } from "../hooks/useWallet";
import { castVoteOnChain } from "../lib/sentinelSDK";

export default function VoteButton({ caseId, onVoteComplete }) {
  const { signer, isConnected } = useWallet();
  const [isVoting, setIsVoting] = useState(false);
  const [voted, setVoted] = useState(null);
  const [txHash, setTxHash] = useState(null);

  const handleVote = async (decision) => {
    if (!isConnected || !signer) {
      alert("Connect your wallet first!");
      return;
    }

    setIsVoting(true);
    try {
      const result = await castVoteOnChain(signer, caseId, decision);
      setTxHash(result.txHash);
      setVoted(decision === 1 ? "punish" : "dismiss");

      if (onVoteComplete) {
        onVoteComplete({
          caseId,
          decision: decision === 1 ? "punish" : "dismiss",
          txHash: result.txHash,
        });
      }
    } catch (error) {
      console.error("Vote failed:", error);
      if (error.message.includes("Already voted")) {
        alert("You already voted on this case!");
      } else if (error.message.includes("Not a moderator")) {
        alert("You are not a moderator for this case!");
      } else if (error.message.includes("Case already resolved")) {
        alert("This case is already resolved!");
      } else {
        alert("Vote failed. Check console for details.");
      }
    }
    setIsVoting(false);
  };

  if (voted) {
    return (
      <div className="p-3 bg-gray-800 rounded-lg text-center">
        <p className="text-gray-300 mb-2">
          You voted:{" "}
          <strong className={voted === "punish" ? "text-red-500" : "text-green-500"}>
            {voted.toUpperCase()}
          </strong>
        </p>
        {txHash && (
          <a
            href={`https://sepolia.etherscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 text-xs hover:underline"
          >
            View on Etherscan ↗
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <button
        onClick={() => handleVote(1)}
        disabled={isVoting}
        className="flex-1 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
      >
        {isVoting ? "Signing..." : "👎 Punish"}
      </button>
      <button
        onClick={() => handleVote(2)}
        disabled={isVoting}
        className="flex-1 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed"
      >
        {isVoting ? "Signing..." : "👍 Dismiss"}
      </button>
    </div>
  );
}