// components/VoteButton.jsx

import { useState } from "react";
import { useWallet } from "../hooks/useWallet";
import { castVoteOnChain } from "../lib/sentinelSDK";

export default function VoteButton({ caseId, onVoteComplete }) {
  const { signer, isConnected } = useWallet();
  const [isVoting, setIsVoting] = useState(false);
  const [voted, setVoted] = useState(null);
  const [txHash, setTxHash] = useState(null);
  const [error, setError] = useState(null);

  const handleVote = async (decision) => {
    if (!isConnected || !signer) {
      alert("Connect your wallet first!");
      return;
    }

    setIsVoting(true);
    setError(null);

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
    } catch (err) {
      console.error("Vote failed:", err);

      if (err.message?.includes("Already voted")) {
        setError("You already voted on this case!");
      } else if (err.message?.includes("Not a moderator")) {
        setError("You are not a moderator for this case!");
      } else if (err.message?.includes("Case already resolved")) {
        setError("This case is already resolved!");
      } else if (err.message?.includes("user rejected")) {
        setError("Transaction rejected in wallet");
      } else {
        setError("Vote failed. Check console for details.");
      }
    }
    setIsVoting(false);
  };

  // ─── Already Voted State ───
  if (voted) {
    return (
      <div
        style={{
          padding: "14px 16px",
          backgroundColor: "#1e293b",
          borderRadius: "12px",
          textAlign: "center",
        }}
      >
        <p style={{ color: "#e2e8f0", margin: 0, fontSize: "14px" }}>
          Vote submitted:{" "}
          <strong
            style={{
              color: voted === "punish" ? "#ef4444" : "#22c55e",
              fontSize: "15px",
            }}
          >
            {voted === "punish" ? "🚨 PUNISH" : "✅ DISMISS"}
          </strong>
        </p>
        {txHash && (
          <a
            href={`https://sepolia.etherscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "#7c3aed",
              fontSize: "12px",
              marginTop: "8px",
              display: "inline-block",
              textDecoration: "none",
            }}
          >
            View transaction on Etherscan ↗
          </a>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Error message */}
      {error && (
        <div
          style={{
            padding: "10px 14px",
            backgroundColor: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: "8px",
            marginBottom: "12px",
            color: "#fca5a5",
            fontSize: "13px",
            textAlign: "center",
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* Vote buttons */}
      <div style={{ display: "flex", gap: "12px" }}>
        <button
          onClick={() => handleVote(1)}
          disabled={isVoting}
          style={{
            flex: 1,
            padding: "14px 16px",
            backgroundColor: isVoting ? "#374151" : "#dc2626",
            color: "white",
            border: "none",
            borderRadius: "12px",
            fontSize: "14px",
            fontWeight: "700",
            cursor: isVoting ? "not-allowed" : "pointer",
            opacity: isVoting ? 0.6 : 1,
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
          onMouseEnter={(e) => {
            if (!isVoting) {
              e.target.style.backgroundColor = "#b91c1c";
              e.target.style.transform = "translateY(-1px)";
            }
          }}
          onMouseLeave={(e) => {
            if (!isVoting) {
              e.target.style.backgroundColor = "#dc2626";
              e.target.style.transform = "translateY(0)";
            }
          }}
        >
          {isVoting ? (
            <>
              <span
                style={{
                  display: "inline-block",
                  animation: "spin 1s linear infinite",
                }}
              >
                ⏳
              </span>
              Signing...
            </>
          ) : (
            <>🚨 Punish</>
          )}
        </button>

        <button
          onClick={() => handleVote(2)}
          disabled={isVoting}
          style={{
            flex: 1,
            padding: "14px 16px",
            backgroundColor: isVoting ? "#374151" : "#16a34a",
            color: "white",
            border: "none",
            borderRadius: "12px",
            fontSize: "14px",
            fontWeight: "700",
            cursor: isVoting ? "not-allowed" : "pointer",
            opacity: isVoting ? 0.6 : 1,
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
          }}
          onMouseEnter={(e) => {
            if (!isVoting) {
              e.target.style.backgroundColor = "#15803d";
              e.target.style.transform = "translateY(-1px)";
            }
          }}
          onMouseLeave={(e) => {
            if (!isVoting) {
              e.target.style.backgroundColor = "#16a34a";
              e.target.style.transform = "translateY(0)";
            }
          }}
        >
          {isVoting ? (
            <>
              <span
                style={{
                  display: "inline-block",
                  animation: "spin 1s linear infinite",
                }}
              >
                ⏳
              </span>
              Signing...
            </>
          ) : (
            <>✅ Dismiss</>
          )}
        </button>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}