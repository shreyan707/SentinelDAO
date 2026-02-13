# SentinelDAO 🛡️

> Decentralized content moderation powered by AI detection, community voting, and blockchain transparency

## Overview

SentinelDAO reimagines content moderation for the decentralized web. Instead of corporations making moderation decisions behind closed doors, our platform combines AI toxicity detection with community-driven governance to create a transparent, fair, and truly decentralized moderation system.

**The Problem**: Centralized platforms moderate billions of users with zero transparency, inconsistent AI enforcement, and no user input.

**Our Solution**: AI flags potentially toxic content → Random community members vote → Majority decides → Everything recorded on-chain.

## Key Features

🤖 **AI-Powered Detection** - Every message scanned by HuggingFace's toxic-bert model  
⚖️ **Community Jury System** - 3 randomly selected moderators vote on each case  
💰 **Token Economics** - Good moderators earn rewards, bad actors lose tokens  
🔗 **Blockchain Transparency** - All moderation decisions recorded on Polygon  
⚡ **Real-time Updates** - Instant notifications via Supabase Realtime  
🎯 **No Admin Overrides** - Truly decentralized - even creators can't reverse community votes

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Realtime + Auth)
- **AI**: HuggingFace Inference API (toxic-bert)
- **Blockchain**: Solidity, Hardhat, Polygon Mumbai, ethers.js
- **Smart Contracts**: ERC-20 token + DAO governance contract

## How It Works

1. User sends a message in the global chat
2. AI analyzes toxicity (auto-flags if >70% toxic)
3. System selects 3 random moderators with ≥10 tokens
4. Moderators vote: **Punish** or **Dismiss**
5. Majority decision executes automatically:
   - **Punish**: Offender loses 20 tokens, message removed, moderators earn 5 tokens each
   - **Dismiss**: Message approved, moderators earn 3 tokens each
6. All decisions recorded on-chain for public audit
