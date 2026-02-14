export const SENTINEL_DAO_ADDRESS = "0xc24c387C5654566B3C53bD69913d78acd20CB35E";

export const SENTINEL_DAO_ABI = [
  {
    "inputs": [],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "caseId", "type": "uint256"},
      {"indexed": false, "name": "messageHash", "type": "bytes32"},
      {"indexed": false, "name": "offender", "type": "address"},
      {"indexed": false, "name": "moderators", "type": "address[3]"}
    ],
    "name": "CaseCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "caseId", "type": "uint256"},
      {"indexed": true, "name": "moderator", "type": "address"},
      {"indexed": false, "name": "decision", "type": "uint8"}
    ],
    "name": "VoteCast",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "caseId", "type": "uint256"},
      {"indexed": false, "name": "decision", "type": "uint8"}
    ],
    "name": "CaseResolved",
    "type": "event"
  },
  {
    "inputs": [
      {"name": "_messageHash", "type": "bytes32"},
      {"name": "_offender", "type": "address"},
      {"name": "_moderators", "type": "address[3]"}
    ],
    "name": "createCase",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "_caseId", "type": "uint256"},
      {"name": "_decision", "type": "uint8"}
    ],
    "name": "castVote",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "_caseId", "type": "uint256"}],
    "name": "getCase",
    "outputs": [
      {"name": "messageHash", "type": "bytes32"},
      {"name": "offender", "type": "address"},
      {"name": "moderators", "type": "address[3]"},
      {"name": "voteCount", "type": "uint8"},
      {"name": "resolved", "type": "bool"},
      {"name": "decision", "type": "uint8"},
      {"name": "createdAt", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "_caseId", "type": "uint256"},
      {"name": "_moderator", "type": "address"}
    ],
    "name": "getVote",
    "outputs": [{"name": "", "type": "uint8"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "_caseId", "type": "uint256"}],
    "name": "getModerators",
    "outputs": [{"name": "", "type": "address[3]"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "caseCount",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{"name": "", "type": "address"}],
    "stateMutability": "view",
    "type": "function"
  }
];