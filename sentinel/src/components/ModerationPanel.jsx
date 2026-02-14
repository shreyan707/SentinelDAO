import { useState, useEffect, useCallback } from "react";
import { useWallet } from "../hooks/useWallet";
import { getCaseFromChain, getCaseCount, getVoteFromChain } from "../lib/sentinelSDK";
import VoteButton from "./VoteButton";
import { supabase } from "../lib/supabase";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function ModerationPanel({ isOpen, onClose }) {
  const { address, isConnected } = useWallet();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("pending"); // pending | resolved | all
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // ─── Load Stats ───
  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/moderation/stats`);
      const data = await res.json();
      if (data.success) setStats(data.stats);
    } catch (e) {
      console.error("Stats error:", e);
    }
  }, []);

  // ─── Load Cases from Backend API ───
  const loadMyCases = useCallback(async () => {
    if (!isConnected || !address) return;

    setLoading(true);
    setError(null);

    try {
      // Try backend API first
      const res = await fetch(
        `${API_URL}/moderation/my-cases?wallet_address=${address.toLowerCase()}`
      );
      const data = await res.json();

      if (data.success && data.cases.length > 0) {
        // Enrich with on-chain vote data
        const enrichedCases = await Promise.all(
          data.cases.map(async (dbCase) => {
            let myVote = 0;
            let onChainData = dbCase.on_chain || null;

            if (dbCase.blockchain_case_id !== null && dbCase.blockchain_case_id !== undefined) {
              try {
                if (!onChainData) {
                  onChainData = await getCaseFromChain(dbCase.blockchain_case_id);
                }
                myVote = await getVoteFromChain(dbCase.blockchain_case_id, address);
              } catch (e) {
                console.error("Chain read error for case", dbCase.blockchain_case_id, e);
              }
            }

            return {
              ...dbCase,
              onChainData,
              myVote: Number(myVote),
            };
          })
        );

        setCases(enrichedCases);
      } else {
        // Fallback: load from blockchain directly
        await loadCasesFromChain();
      }

      // Load stats too
      await loadStats();
    } catch (err) {
      console.error("API error, falling back to chain:", err);
      setError("Backend unavailable, loading from blockchain...");
      await loadCasesFromChain();
    }

    setLoading(false);
  }, [isConnected, address, loadStats]);

  // ─── Fallback: Load from Blockchain ───
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
            id: `chain-${i}`,
            blockchain_case_id: i,
            onChainData: caseData,
            myVote: Number(myVote),
            messages: {
              content: "Message hash: " + caseData.messageHash.slice(0, 20) + "...",
            },
            offender: { wallet_address: caseData.offender },
            status: caseData.resolved ? "resolved" : "voting",
            decision:
              caseData.decision === 1
                ? "punish"
                : caseData.decision === 2
                ? "dismiss"
                : null,
            toxicity_score: null,
          });
        }
      }

      setCases(myCases);
    } catch (err) {
      console.error("Chain fallback failed:", err);
      setCases([]);
    }
  };

  // ─── Refresh handler ───
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadMyCases();
    setRefreshing(false);
  };

  // ─── Realtime subscription ───
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
            console.log("🔔 New case notification received!");
            loadMyCases();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isConnected, address, loadMyCases]);

  // ─── Filter cases by tab ───
  const filteredCases = cases.filter((c) => {
    const isResolved = c.onChainData?.resolved || c.status === "resolved";
    const hasVoted = c.myVote !== 0;

    if (activeTab === "pending") return !isResolved && !hasVoted;
    if (activeTab === "voted") return !isResolved && hasVoted;
    if (activeTab === "resolved") return isResolved;
    return true; // "all"
  });

  // ─── Counts ───
  const pendingCount = cases.filter((c) => {
    return !(c.onChainData?.resolved || c.status === "resolved") && c.myVote === 0;
  }).length;

  const votedCount = cases.filter((c) => {
    return !(c.onChainData?.resolved || c.status === "resolved") && c.myVote !== 0;
  }).length;

  const resolvedCount = cases.filter((c) => {
    return c.onChainData?.resolved || c.status === "resolved";
  }).length;

  // ─── Helpers ───
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

  const getTimeAgo = (dateStr) => {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const getSeverityLevel = (score) => {
    if (!score) return { text: "Unknown", color: "#9ca3af" };
    if (score > 0.8) return { text: "CRITICAL", color: "#ef4444" };
    if (score > 0.6) return { text: "HIGH", color: "#f97316" };
    if (score > 0.4) return { text: "MEDIUM", color: "#eab308" };
    return { text: "LOW", color: "#22c55e" };
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        width: "460px",
        height: "100vh",
        backgroundColor: "#0f1219",
        borderLeft: "1px solid #1e293b",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "'Inter', -apple-system, sans-serif",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.4)",
      }}
    >
      {/* ═══ HEADER ═══ */}
      <div
        style={{
          padding: "20px 24px",
          borderBottom: "1px solid #1e293b",
          background: "linear-gradient(135deg, #0f1219 0%, #1a1f2e 100%)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #7c3aed, #3b82f6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "20px",
              }}
            >
              ⚖️
            </div>
            <div>
              <h2 style={{ color: "white", fontSize: "18px", margin: 0, fontWeight: "700" }}>
                Moderation Panel
              </h2>
              <p style={{ color: "#64748b", fontSize: "12px", margin: "2px 0 0 0" }}>
                SentinelDAO • On-chain Governance
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              backgroundColor: "#1e293b",
              border: "none",
              color: "#94a3b8",
              fontSize: "18px",
              cursor: "pointer",
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = "#334155";
              e.target.style.color = "white";
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = "#1e293b";
              e.target.style.color = "#94a3b8";
            }}
          >
            ✕
          </button>
        </div>

        {/* ═══ STATS BAR ═══ */}
        {stats && (
          <div
            style={{
              display: "flex",
              gap: "8px",
              marginTop: "16px",
            }}
          >
            {[
              { label: "Total", value: stats.total_cases, color: "#64748b" },
              { label: "Voting", value: stats.voting, color: "#eab308" },
              { label: "Punished", value: stats.punished, color: "#ef4444" },
              { label: "Dismissed", value: stats.dismissed, color: "#22c55e" },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  flex: 1,
                  padding: "10px 8px",
                  backgroundColor: "#1e293b",
                  borderRadius: "10px",
                  textAlign: "center",
                }}
              >
                <div style={{ color: stat.color, fontSize: "18px", fontWeight: "700" }}>
                  {stat.value}
                </div>
                <div style={{ color: "#64748b", fontSize: "10px", marginTop: "2px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ NOTIFICATION BADGE ═══ */}
        {pendingCount > 0 && (
          <div
            style={{
              marginTop: "12px",
              padding: "10px 16px",
              background: "linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                backgroundColor: "#ef4444",
                animation: "pulse 2s infinite",
                boxShadow: "0 0 8px rgba(239,68,68,0.6)",
              }}
            />
            <span style={{ color: "#fca5a5", fontSize: "13px", fontWeight: "500" }}>
              {pendingCount} case{pendingCount > 1 ? "s" : ""} awaiting your vote
            </span>
          </div>
        )}
      </div>

      {/* ═══ TABS ═══ */}
      <div
        style={{
          display: "flex",
          padding: "12px 24px 0",
          gap: "4px",
          borderBottom: "1px solid #1e293b",
        }}
      >
        {[
          { key: "pending", label: "Pending", count: pendingCount, icon: "🔴" },
          { key: "voted", label: "Voted", count: votedCount, icon: "🟡" },
          { key: "resolved", label: "Resolved", count: resolvedCount, icon: "🟢" },
          { key: "all", label: "All", count: cases.length, icon: "📋" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1,
              padding: "10px 8px 14px",
              backgroundColor: "transparent",
              border: "none",
              borderBottom: activeTab === tab.key ? "2px solid #7c3aed" : "2px solid transparent",
              color: activeTab === tab.key ? "white" : "#64748b",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: activeTab === tab.key ? "600" : "400",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              transition: "all 0.2s",
            }}
          >
            <span style={{ fontSize: "10px" }}>{tab.icon}</span>
            {tab.label}
            {tab.count > 0 && (
              <span
                style={{
                  backgroundColor: activeTab === tab.key ? "#7c3aed" : "#334155",
                  color: "white",
                  fontSize: "10px",
                  padding: "2px 6px",
                  borderRadius: "9999px",
                  fontWeight: "600",
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ CASES LIST ═══ */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 24px",
        }}
      >
        {/* Error banner */}
        {error && (
          <div
            style={{
              padding: "12px 16px",
              backgroundColor: "rgba(234,179,8,0.1)",
              border: "1px solid rgba(234,179,8,0.3)",
              borderRadius: "10px",
              marginBottom: "16px",
              color: "#fbbf24",
              fontSize: "13px",
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* Not connected */}
        {!isConnected ? (
          <EmptyState
            icon="🦊"
            title="Connect Wallet"
            subtitle="Connect your wallet to view moderation cases assigned to you"
          />
        ) : loading ? (
          <EmptyState
            icon="⏳"
            title="Loading Cases..."
            subtitle="Fetching from backend and blockchain"
          />
        ) : filteredCases.length === 0 ? (
          <EmptyState
            icon={activeTab === "pending" ? "✅" : "📭"}
            title={activeTab === "pending" ? "All Caught Up!" : "No Cases"}
            subtitle={
              activeTab === "pending"
                ? "No cases awaiting your vote"
                : `No ${activeTab} cases found`
            }
          />
        ) : (
          filteredCases.map((caseItem, index) => {
            const isResolved = caseItem.onChainData?.resolved || caseItem.status === "resolved";
            const hasVoted = caseItem.myVote !== 0;
            const statusText = getStatusText(caseItem);
            const caseId = caseItem.blockchain_case_id ?? index;
            const voteCount = caseItem.onChainData?.voteCount ?? caseItem.onChainData?.vote_count ?? 0;
            const severity = getSeverityLevel(caseItem.toxicity_score);
            const messageContent = caseItem.messages?.content || "Message content unavailable";
            const reason = caseItem.messages?.reason || caseItem.reason || null;

            return (
              <div
                key={caseItem.id || index}
                style={{
                  backgroundColor: "#141925",
                  borderRadius: "16px",
                  padding: "0",
                  marginBottom: "16px",
                  border: `1px solid ${
                    !isResolved && !hasVoted
                      ? "#7c3aed"
                      : isResolved
                      ? "#1e293b"
                      : "#334155"
                  }`,
                  overflow: "hidden",
                  transition: "all 0.2s",
                }}
              >
                {/* ─── Case Header ─── */}
                <div
                  style={{
                    padding: "16px 20px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderBottom: "1px solid #1e293b",
                    backgroundColor: !isResolved && !hasVoted ? "rgba(124,58,237,0.05)" : "transparent",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ color: "#64748b", fontSize: "13px", fontWeight: "600" }}>
                      Case #{caseId}
                    </span>
                    {caseItem.created_at && (
                      <span style={{ color: "#475569", fontSize: "11px" }}>
                        {getTimeAgo(caseItem.created_at)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {/* Severity badge */}
                    {caseItem.toxicity_score && (
                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: "6px",
                          fontSize: "10px",
                          fontWeight: "700",
                          backgroundColor: severity.color + "20",
                          color: severity.color,
                          letterSpacing: "0.5px",
                        }}
                      >
                        {severity.text}
                      </span>
                    )}
                    {/* Status badge */}
                    <span
                      style={{
                        padding: "4px 12px",
                        borderRadius: "8px",
                        fontSize: "11px",
                        fontWeight: "700",
                        backgroundColor:
                          getStatusColor(
                            isResolved ? "resolved" : "voting",
                            caseItem.decision ||
                              (caseItem.onChainData?.decision === 1 ? "punish" : "dismiss")
                          ) + "20",
                        color: getStatusColor(
                          isResolved ? "resolved" : "voting",
                          caseItem.decision ||
                            (caseItem.onChainData?.decision === 1 ? "punish" : "dismiss")
                        ),
                        letterSpacing: "0.5px",
                      }}
                    >
                      {statusText}
                    </span>
                  </div>
                </div>

                <div style={{ padding: "16px 20px" }}>
                  {/* ─── Offender Info ─── */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      marginBottom: "14px",
                    }}
                  >
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "8px",
                        backgroundColor: "#1e293b",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "14px",
                      }}
                    >
                      👤
                    </div>
                    <div>
                      <div style={{ color: "#94a3b8", fontSize: "11px" }}>Offender</div>
                      <div
                        style={{
                          color: "#f87171",
                          fontSize: "13px",
                          fontFamily: "monospace",
                          fontWeight: "500",
                        }}
                      >
                        {caseItem.offender?.username && (
                          <span style={{ color: "#e2e8f0", marginRight: "8px" }}>
                            @{caseItem.offender.username}
                          </span>
                        )}
                        {truncateAddress(
                          caseItem.offender?.wallet_address || caseItem.onChainData?.offender
                        )}
                      </div>
                    </div>
                    {caseItem.offender?.warnings > 0 && (
                      <span
                        style={{
                          marginLeft: "auto",
                          padding: "3px 8px",
                          backgroundColor: "rgba(239,68,68,0.15)",
                          borderRadius: "6px",
                          color: "#fca5a5",
                          fontSize: "11px",
                          fontWeight: "600",
                        }}
                      >
                        ⚠️ {caseItem.offender.warnings} warning{caseItem.offender.warnings > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>

                  {/* ─── Flagged Message ─── */}
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ color: "#64748b", fontSize: "11px", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Flagged Message
                    </div>
                    <div
                      style={{
                        padding: "14px 16px",
                        backgroundColor: "#0f1219",
                        borderRadius: "12px",
                        borderLeft: "3px solid #ef4444",
                      }}
                    >
                      <p
                        style={{
                          color: "#e2e8f0",
                          fontSize: "14px",
                          margin: 0,
                          wordBreak: "break-word",
                          lineHeight: "1.6",
                        }}
                      >
                        "{messageContent}"
                      </p>
                    </div>
                  </div>

                  {/* ─── AI Reason ─── */}
                  {reason && (
                    <div
                      style={{
                        marginBottom: "16px",
                        padding: "10px 14px",
                        backgroundColor: "rgba(124,58,237,0.08)",
                        borderRadius: "10px",
                        border: "1px solid rgba(124,58,237,0.2)",
                      }}
                    >
                      <div style={{ color: "#a78bfa", fontSize: "11px", marginBottom: "4px", fontWeight: "600" }}>
                        🤖 AI Detection Reason
                      </div>
                      <div style={{ color: "#c4b5fd", fontSize: "13px" }}>
                        {reason}
                      </div>
                    </div>
                  )}

                  {/* ─── Toxicity Score Bar ─── */}
                  {caseItem.toxicity_score != null && (
                    <div style={{ marginBottom: "16px" }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "8px",
                        }}
                      >
                        <span style={{ color: "#64748b", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                          Toxicity Score
                        </span>
                        <span
                          style={{
                            color: severity.color,
                            fontSize: "13px",
                            fontWeight: "700",
                          }}
                        >
                          {(caseItem.toxicity_score * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div
                        style={{
                          width: "100%",
                          height: "8px",
                          backgroundColor: "#1e293b",
                          borderRadius: "4px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${caseItem.toxicity_score * 100}%`,
                            height: "100%",
                            background: `linear-gradient(90deg, ${severity.color}cc, ${severity.color})`,
                            borderRadius: "4px",
                            transition: "width 0.5s ease",
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* ─── Vote Progress ─── */}
                  <div style={{ marginBottom: "16px" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "8px",
                      }}
                    >
                      <span style={{ color: "#64748b", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Moderator Votes
                      </span>
                      <span style={{ color: "#94a3b8", fontSize: "12px", fontWeight: "600" }}>
                        {voteCount} / 3
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          style={{
                            flex: 1,
                            height: "6px",
                            borderRadius: "3px",
                            backgroundColor: i < voteCount
                              ? "linear-gradient(90deg, #7c3aed, #3b82f6)"
                              : "#1e293b",
                            background: i < voteCount
                              ? "linear-gradient(90deg, #7c3aed, #3b82f6)"
                              : "#1e293b",
                            transition: "all 0.3s",
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* ─── Moderators List ─── */}
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ color: "#64748b", fontSize: "11px", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      Assigned Moderators
                    </div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {[caseItem.moderator_1, caseItem.moderator_2, caseItem.moderator_3]
                        .filter(Boolean)
                        .map((mod, i) => {
                          const isMe = mod?.toLowerCase() === address?.toLowerCase();
                          return (
                            <div
                              key={i}
                              style={{
                                flex: 1,
                                padding: "8px 10px",
                                backgroundColor: isMe ? "rgba(124,58,237,0.15)" : "#1e293b",
                                borderRadius: "8px",
                                border: isMe ? "1px solid rgba(124,58,237,0.4)" : "1px solid transparent",
                                textAlign: "center",
                              }}
                            >
                              <div
                                style={{
                                  color: isMe ? "#a78bfa" : "#94a3b8",
                                  fontSize: "11px",
                                  fontFamily: "monospace",
                                }}
                              >
                                {truncateAddress(mod)}
                              </div>
                              {isMe && (
                                <div
                                  style={{
                                    color: "#7c3aed",
                                    fontSize: "9px",
                                    marginTop: "2px",
                                    fontWeight: "700",
                                  }}
                                >
                                  YOU
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* ─── VOTING BUTTONS ─── */}
                  {!isResolved && !hasVoted && (
                    <div
                      style={{
                        padding: "16px",
                        backgroundColor: "rgba(124,58,237,0.05)",
                        borderRadius: "12px",
                        border: "1px solid rgba(124,58,237,0.2)",
                      }}
                    >
                      <div
                        style={{
                          color: "#a78bfa",
                          fontSize: "12px",
                          marginBottom: "12px",
                          fontWeight: "600",
                          textAlign: "center",
                        }}
                      >
                        ⚖️ Cast Your Vote
                      </div>
                      <VoteButton
                        caseId={caseId}
                        onVoteComplete={(result) => {
                          console.log("Vote recorded:", result);
                          loadMyCases();
                        }}
                      />
                    </div>
                  )}

                  {/* ─── ALREADY VOTED ─── */}
                  {!isResolved && hasVoted && (
                    <div
                      style={{
                        padding: "14px 16px",
                        backgroundColor: "#1e293b",
                        borderRadius: "12px",
                        textAlign: "center",
                      }}
                    >
                      <p style={{ color: "#e2e8f0", margin: 0, fontSize: "14px" }}>
                        Your vote:{" "}
                        <strong
                          style={{
                            color: caseItem.myVote === 1 ? "#ef4444" : "#22c55e",
                            fontSize: "15px",
                          }}
                        >
                          {caseItem.myVote === 1 ? "🚨 PUNISH" : "✅ DISMISS"}
                        </strong>
                      </p>
                      <p
                        style={{
                          color: "#64748b",
                          fontSize: "12px",
                          margin: "6px 0 0 0",
                        }}
                      >
                        Waiting for other moderators... ({voteCount}/3)
                      </p>
                    </div>
                  )}

                  {/* ─── RESOLVED ─── */}
                  {isResolved && (
                    <div
                      style={{
                        padding: "14px 16px",
                        backgroundColor: statusText === "PUNISHED"
                          ? "rgba(239,68,68,0.08)"
                          : "rgba(34,197,94,0.08)",
                        borderRadius: "12px",
                        border: `1px solid ${
                          statusText === "PUNISHED"
                            ? "rgba(239,68,68,0.2)"
                            : "rgba(34,197,94,0.2)"
                        }`,
                        textAlign: "center",
                      }}
                    >
                      <p style={{ color: "#e2e8f0", margin: 0, fontSize: "15px", fontWeight: "600" }}>
                        {statusText === "PUNISHED" ? "🔨" : "✅"} Case{" "}
                        <span
                          style={{
                            color: statusText === "PUNISHED" ? "#ef4444" : "#22c55e",
                          }}
                        >
                          {statusText}
                        </span>
                      </p>
                      {caseItem.myVote !== 0 && (
                        <p style={{ color: "#64748b", fontSize: "12px", margin: "6px 0 0 0" }}>
                          You voted: {caseItem.myVote === 1 ? "Punish" : "Dismiss"}
                        </p>
                      )}
                      {caseItem.blockchain_case_id !== null && (
                        <a
                          href={`https://sepolia.etherscan.io/address/0xc24c387C5654566B3C53bD69913d78acd20CB35E`}
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
                          View on Etherscan ↗
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ═══ FOOTER ═══ */}
      <div
        style={{
          padding: "14px 24px",
          borderTop: "1px solid #1e293b",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: "#0f1219",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: "#22c55e",
              boxShadow: "0 0 6px rgba(34,197,94,0.5)",
            }}
          />
          <span style={{ color: "#64748b", fontSize: "11px" }}>
            Live • Sepolia Network
          </span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          style={{
            padding: "8px 16px",
            background: refreshing
              ? "#1e293b"
              : "linear-gradient(135deg, #1e293b, #334155)",
            color: refreshing ? "#475569" : "#e2e8f0",
            border: "1px solid #334155",
            borderRadius: "8px",
            cursor: refreshing ? "not-allowed" : "pointer",
            fontSize: "12px",
            fontWeight: "500",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            transition: "all 0.2s",
          }}
        >
          <span style={{ 
            display: "inline-block",
            animation: refreshing ? "spin 1s linear infinite" : "none" 
          }}>
            🔄
          </span>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* ═══ CSS Animations ═══ */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        div::-webkit-scrollbar {
          width: 6px;
        }
        div::-webkit-scrollbar-track {
          background: transparent;
        }
        div::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 3px;
        }
        div::-webkit-scrollbar-thumb:hover {
          background: #475569;
        }
      `}</style>
    </div>
  );
}

// ─── Empty State Component ───
function EmptyState({ icon, title, subtitle }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "60px 30px",
        color: "#64748b",
      }}
    >
      <div
        style={{
          fontSize: "48px",
          marginBottom: "16px",
          filter: "grayscale(0.3)",
        }}
      >
        {icon}
      </div>
      <p
        style={{
          color: "#94a3b8",
          fontSize: "16px",
          fontWeight: "600",
          margin: "0 0 6px 0",
        }}
      >
        {title}
      </p>
      <p
        style={{
          color: "#475569",
          fontSize: "13px",
          margin: 0,
          lineHeight: "1.5",
        }}
      >
        {subtitle}
      </p>
    </div>
  );
}