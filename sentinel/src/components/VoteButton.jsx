import { useState } from "react";
import { useWallet } from "../hooks/useWallet";
import { castVoteOnChain } from "../lib/sentinelSDK";
import { assignPunishment } from "../lib/punishmentService";
import { supabase } from "../lib/supabase";

export default function VoteButton({ caseId, caseData, onVoteComplete }) {
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

      // If decision is "punish", assign punishment after vote
      if (decision === 1 && caseData) {
        try {
          // Get offender's user_id from wallet_address
          const { data: offenderProfile } = await supabase
            .from('profiles')
            .select('id, wallet_address')
            .eq('wallet_address', caseData.offender?.wallet_address || caseData.offender_wallet)
            .single();

          if (offenderProfile) {
            const punishmentResult = await assignPunishment(
              offenderProfile.id,
              offenderProfile.wallet_address,
              caseData.id,
              caseData.reason || 'Toxic behavior detected',
              caseData.severe_score || 0
            );

            if (punishmentResult.success) {
              console.log('Punishment assigned:', punishmentResult);
            } else {
              console.error('Failed to assign punishment:', punishmentResult.error);
            }
          }
        } catch (punishmentError) {
          console.error('Error assigning punishment:', punishmentError);
          // Don't fail the vote if punishment assignment fails
        }
      }

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