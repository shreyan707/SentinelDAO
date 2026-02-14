import { useState, useEffect } from "react";
import { useWallet } from "../hooks/useWallet";
import { getCaseFromChain, getCaseCount, getVoteFromChain } from "../lib/sentinelSDK";
import VoteButton from "./VoteButton";
import { supabase } from "../lib/supabase";

export default function ModerationPanel({ isOpen, onClose }) {
  const { address, isConnected } = useWallet();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load cases where current user is a moderator
  const loadMyCases = async () => {
    if (!isConnected || !address) return;

    setLoading(true);
    try {
      // Get cases from Supabase where user is a moderator
      const { data: dbCases, error } = await supabase
        .from("moderation_cases")
        .select(`
          *,
          messages:message_id (content),
          offender:offender_id (wallet_address, username)
        `)
        .or(
          `moderator_1.eq.${address.toLowerCase()},moderator_2.eq.${address.toLowerCase()},moderator_3.eq.${address.toLowerCase()}`
        )
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Supabase error:", error);
        // Fallback: load from blockchain directly
        await loadCasesFromChain();
        return;
      }

      if (dbCases && dbCases.length > 0) {
        // Enrich with on-chain data
        const enrichedCases = await Promise.all(
          dbCases.map(async (dbCase) => {
            let onChainData = null;
            let myVote = 0;

            if (dbCase.blockchain_case_id !== null) {
              try {
                onChainData = await getCaseFromChain(dbCase.blockchain_case_id);
                myVote = await getVoteFromChain(dbCase.blockchain_case_id, address);
              } catch (e) {
                console.error("Chain read error:", e);
              }
            }

            return {
              ...dbCase,
              onChainData,
              myVote,
            };
          })
        );

        setCases(enrichedCases);
      } else {
        // No cases in Supabase, try blockchain
        await loadCasesFromChain();
      }
    } catch (error) {
      console.error("Failed to load cases:", error);
      await loadCasesFromChain();
    }
    setLoading(false);
  };

  // Fallback: load directly from blockchain
  const loadCasesFromChain = async () => {
    try {
      const totalCases = await getCaseCount();
      const myCases = [];

      for (let i = 0; i < totalCases; i++) {
        const caseData = await getCaseFromChain(i);
        const isModerator = caseData.moderators.some(
          (mod) => mod.toLowerCase() === address.toLowerCase()
        );

        if (isModerator) {
          const myVote = await getVoteFromChain(i, address);
          myCases.push({
            blockchain_case_id: i,
            onChainData: caseData,
            myVote,
            messages: { content: "Message hash: " + caseData.messageHash.slice(0, 20) + "..." },
            offender: { wallet_address: caseData.offender },
            status: caseData.resolved ? "resolved" : "voting",
            decision: caseData.decision === 1 ? "punish" : caseData.decision === 2 ? "dismiss" : null,
            toxicity_score: null,
          });
        }
      }

      setCases(myCases);
    } catch (error) {
      console.error("Failed to load from chain:", error);
      setCases([]);
    }
  };

  // Realtime subscription for new cases
  useEffect(() => {
    if (!isConnected || !address) return;

    loadMyCases();

    const channel = supabase
      .channel("moderation-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "moderation_cases",
        },
        (payload) => {
          const newCase = payload.new;
          const addr = address.toLowerCase();

          if (
            newCase.moderator_1 === addr ||
            newCase.moderator_2 === addr ||
            newCase.moderator_3 === addr
          ) {
            loadMyCases();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isConnected, address]);

  // Helper functions
  const truncateAddress = (addr) => {
    if (!addr) return "Unknown";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const getStatusColor = (status, decision) => {
    if (status === "resolved" && decision === "punish") return "#ef4444";
    if (status === "resolved" && decision === "dismiss") return "#22c55e";
    return "#eab308";
  };

  const getStatusText = (caseItem) => {
    if (caseItem.onChainData?.resolved) {
      return caseItem.onChainData.decision === 1 ? "PUNISHED" : "DISMISSED";
    }
    if (caseItem.status === "resolved") {
      return caseItem.decision === "punish" ? "PUNISHED" : "DISMISSED";
    }
    return "VOTING";
  };

  const pendingCount = cases.filter((c) => {
    if (c.onChainData) return !c.onChainData.resolved && c.myVote === 0;
    return c.status !== "resolved";
  }).length;

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: "420px",
        height: "100vh",
        backgroundColor: "#111827",
        borderLeft: "1px solid #374151",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "20px",
          borderBottom: "1px solid #374151",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h2 style={{ color: "white", fontSize: "20px", margin: 0 }}>
            ⚖️ Moderation Panel
          </h2>
          <p style={{ color: "#9ca3af", fontSize: "13px", margin: "4px 0 0 0" }}>
            {pendingCount > 0
              ? `${pendingCount} case${pendingCount > 1 ? "s" : ""} need your vote`
              : "No pending cases"}
          </p>
        </div>
        <button
          onClick={onClose}
          style={{
            backgroundColor: "transparent",
            border: "none",
            color: "#9ca3af",
            fontSize: "24px",
            cursor: "pointer",
          }}
        >
          ✕
        </button>
      </div>

      {/* Cases List */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
        }}
      >
        {!isConnected ? (
          <div
            style={{
              textAlign: "center",
              padding: "40px 20px",
              color: "#9ca3af",
            }}
          >
            <p style={{ fontSize: "40px", marginBottom: "12px" }}>🦊</p>
            <p>Connect your wallet to see moderation cases</p>
          </div>
        ) : loading ? (
          <div
            style={{
              textAlign: "center",
              padding: "40px 20px",
              color: "#9ca3af",
            }}
          >
            <p style={{ fontSize: "40px", marginBottom: "12px" }}>⏳</p>
            <p>Loading cases...</p>
          </div>
        ) : cases.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "40px 20px",
              color: "#9ca3af",
            }}
          >
            <p style={{ fontSize: "40px", marginBottom: "12px" }}>✅</p>
            <p>No moderation cases assigned to you</p>
          </div>
        ) : (
          cases.map((caseItem, index) => {
            const isResolved = caseItem.onChainData?.resolved || caseItem.status === "resolved";
            const hasVoted = caseItem.myVote !== 0;
            const statusText = getStatusText(caseItem);
            const caseId = caseItem.blockchain_case_id ?? index;
            const voteCount = caseItem.onChainData?.voteCount ?? 0;

            return (
              <div
                key={caseItem.id || index}
                style={{
                  backgroundColor: "#1f2937",
                  borderRadius: "12px",
                  padding: "20px",
                  marginBottom: "16px",
                  border: `1px solid ${isResolved ? "#374151" : "#7c3aed"}`,
                }}
              >
                {/* Case Header */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "16px",
                  }}
                >
                  <span style={{ color: "#9ca3af", fontSize: "13px" }}>
                    Case #{caseId}
                  </span>
                  <span
                    style={{
                      padding: "4px 12px",
                      borderRadius: "9999px",
                      fontSize: "12px",
                      fontWeight: "600",
                      backgroundColor: getStatusColor(
                        isResolved ? "resolved" : "voting",
                        caseItem.decision || (caseItem.onChainData?.decision === 1 ? "punish" : "dismiss")
                      ) + "20",
                      color: getStatusColor(
                        isResolved ? "resolved" : "voting",
                        caseItem.decision || (caseItem.onChainData?.decision === 1 ? "punish" : "dismiss")
                      ),
                    }}
                  >
                    {statusText}
                  </span>
                </div>

                {/* Offender */}
                <div style={{ marginBottom: "12px" }}>
                  <span style={{ color: "#9ca3af", fontSize: "12px" }}>
                    Offender
                  </span>
                  <p
                    style={{
                      color: "#f87171",
                      fontSize: "14px",
                      margin: "4px 0 0 0",
                      fontFamily: "monospace",
                    }}
                  >
                    {truncateAddress(
                      caseItem.offender?.wallet_address ||
                      caseItem.onChainData?.offender
                    )}
                  </p>
                </div>

                {/* Flagged Message */}
                <div style={{ marginBottom: "16px" }}>
                  <span style={{ color: "#9ca3af", fontSize: "12px" }}>
                    Flagged Message
                  </span>
                  <div
                    style={{
                      marginTop: "6px",
                      padding: "12px",
                      backgroundColor: "#111827",
                      borderRadius: "8px",
                      borderLeft: "3px solid #ef4444",
                    }}
                  >
                    <p
                      style={{
                        color: "#d1d5db",
                        fontSize: "14px",
                        margin: 0,
                        wordBreak: "break-word",
                      }}
                    >
                      {caseItem.messages?.content || "Message content unavailable"}
                    </p>
                  </div>
                </div>

                {/* Toxicity Score */}
                {caseItem.toxicity_score && (
                  <div style={{ marginBottom: "16px" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "6px",
                      }}
                    >
                      <span style={{ color: "#9ca3af", fontSize: "12px" }}>
                        AI Toxicity Score
                      </span>
                      <span style={{ color: "#f87171", fontSize: "12px" }}>
                        {(caseItem.toxicity_score * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div
                      style={{
                        width: "100%",
                        height: "6px",
                        backgroundColor: "#374151",
                        borderRadius: "3px",
                      }}
                    >
                      <div
                        style={{
                          width: `${caseItem.toxicity_score * 100}%`,
                          height: "100%",
                          backgroundColor:
                            caseItem.toxicity_score > 0.8
                              ? "#ef4444"
                              : caseItem.toxicity_score > 0.7
                              ? "#f59e0b"
                              : "#22c55e",
                          borderRadius: "3px",
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Vote Count */}
                <div style={{ marginBottom: "16px" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: "6px",
                    }}
                  >
                    <span style={{ color: "#9ca3af", fontSize: "12px" }}>
                      Votes
                    </span>
                    <span style={{ color: "#d1d5db", fontSize: "12px" }}>
                      {voteCount} / 3
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "4px" }}>
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        style={{
                          flex: 1,
                          height: "4px",
                          borderRadius: "2px",
                          backgroundColor: i < voteCount ? "#7c3aed" : "#374151",
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Voting Buttons or Status */}
                {!isResolved && !hasVoted && (
                  <VoteButton
                    caseId={caseId}
                    onVoteComplete={(result) => {
                      console.log("Vote recorded:", result);
                      // Reload cases after voting
                      loadMyCases();
                    }}
                  />
                )}

                {!isResolved && hasVoted && (
                  <div
                    style={{
                      padding: "12px",
                      backgroundColor: "#111827",
                      borderRadius: "8px",
                      textAlign: "center",
                    }}
                  >
                    <p style={{ color: "#d1d5db", margin: 0 }}>
                      You voted:{" "}
                      <strong
                        style={{
                          color: caseItem.myVote === 1 ? "#ef4444" : "#22c55e",
                        }}
                      >
                        {caseItem.myVote === 1 ? "PUNISH" : "DISMISS"}
                      </strong>
                    </p>
                    <p
                      style={{
                        color: "#9ca3af",
                        fontSize: "12px",
                        margin: "4px 0 0 0",
                      }}
                    >
                      Waiting for other moderators... ({voteCount}/3)
                    </p>
                  </div>
                )}

                {isResolved && (
                  <div
                    style={{
                      padding: "12px",
                      backgroundColor: "#111827",
                      borderRadius: "8px",
                      textAlign: "center",
                    }}
                  >
                    <p style={{ color: "#d1d5db", margin: 0, fontSize: "14px" }}>
                      Case resolved:{" "}
                      <strong
                        style={{
                          color: statusText === "PUNISHED" ? "#ef4444" : "#22c55e",
                        }}
                      >
                        {statusText}
                      </strong>
                    </p>
                    {caseItem.blockchain_case_id !== null && (
                      <a
                        href={`https://sepolia.etherscan.io/address/0xc24c387C5654566B3C53bD69913d78acd20CB35E`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "#7c3aed",
                          fontSize: "12px",
                          marginTop: "4px",
                          display: "inline-block",
                        }}
                      >
                        View on Etherscan ↗
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "16px 20px",
          borderTop: "1px solid #374151",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ color: "#9ca3af", fontSize: "12px" }}>
          Powered by SentinelDAO
        </span>
        <button
          onClick={loadMyCases}
          style={{
            padding: "6px 14px",
            backgroundColor: "#374151",
            color: "#d1d5db",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontSize: "12px",
          }}
        >
          🔄 Refresh
        </button>
      </div>
    </div>
  );
}