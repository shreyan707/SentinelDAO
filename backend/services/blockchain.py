# backend/services/blockchain.py

from web3 import Web3
import json
import os
from dotenv import load_dotenv

load_dotenv()

# --- Config ---
RPC_URL = os.getenv("RPC_URL", "https://eth-sepolia.g.alchemy.com/v2/fIBOmvk-cdsiUFKkjLNUQ")
CONTRACT_ADDRESS = os.getenv("CONTRACT_ADDRESS", "0xc24c387C5654566B3C53bD69913d78acd20CB35E")
OWNER_PRIVATE_KEY = os.getenv("OWNER_PRIVATE_KEY", "d4cecd61886be0011f2ccfada678d00d2019ee7bca584ad40e5ee1b79608f99b")

# Add 0x prefix if missing
if not OWNER_PRIVATE_KEY.startswith("0x"):
    OWNER_PRIVATE_KEY = "0x" + OWNER_PRIVATE_KEY

# --- Web3 Setup ---
w3 = Web3(Web3.HTTPProvider(RPC_URL))

OWNER_ADDRESS = w3.eth.account.from_key(OWNER_PRIVATE_KEY).address
print(f"🔗 Web3 connected: {w3.is_connected()}")
print(f"🏠 Owner address: {OWNER_ADDRESS}")

# --- Contract ABI (only the functions we need) ---
CONTRACT_ABI = [
    {
        "inputs": [
            {"internalType": "bytes32", "name": "_messageHash", "type": "bytes32"},
            {"internalType": "address", "name": "_offender", "type": "address"},
            {"internalType": "address[3]", "name": "_moderators", "type": "address[3]"}
        ],
        "name": "createCase",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "caseCount",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "uint256", "name": "_caseId", "type": "uint256"}],
        "name": "getCase",
        "outputs": [
            {"internalType": "bytes32", "name": "messageHash", "type": "bytes32"},
            {"internalType": "address", "name": "offender", "type": "address"},
            {"internalType": "address[3]", "name": "moderators", "type": "address[3]"},
            {"internalType": "uint8", "name": "voteCount", "type": "uint8"},
            {"internalType": "bool", "name": "resolved", "type": "bool"},
            {"internalType": "uint8", "name": "decision", "type": "uint8"},
            {"internalType": "uint256", "name": "createdAt", "type": "uint256"}
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "uint256", "name": "_caseId", "type": "uint256"},
            {"internalType": "address", "name": "_moderator", "type": "address"}
        ],
        "name": "getVote",
        "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "internalType": "uint256", "name": "caseId", "type": "uint256"},
            {"indexed": False, "internalType": "bytes32", "name": "messageHash", "type": "bytes32"},
            {"indexed": False, "internalType": "address", "name": "offender", "type": "address"},
            {"indexed": False, "internalType": "address[3]", "name": "moderators", "type": "address[3]"}
        ],
        "name": "CaseCreated",
        "type": "event"
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "internalType": "uint256", "name": "caseId", "type": "uint256"},
            {"indexed": False, "internalType": "uint8", "name": "decision", "type": "uint8"}
        ],
        "name": "CaseResolved",
        "type": "event"
    }
]

contract = w3.eth.contract(address=CONTRACT_ADDRESS, abi=CONTRACT_ABI)


def create_case_on_chain(message_hash_hex: str, offender_address: str, moderator_addresses: list) -> dict:
    """
    Call SentinelDAO.createCase() on Sepolia.
    
    Args:
        message_hash_hex: hex string of message hash (will be converted to bytes32)
        offender_address: wallet address of the offender
        moderator_addresses: list of 3 moderator wallet addresses
    
    Returns:
        dict with tx_hash and case_id
    """
    try:
        # Convert message hash to bytes32
        if message_hash_hex.startswith("0x"):
            message_hash_hex = message_hash_hex[2:]
        message_hash_bytes = bytes.fromhex(message_hash_hex.ljust(64, '0')[:64])
        
        # Ensure valid addresses
        offender = Web3.to_checksum_address(offender_address)
        moderators = [Web3.to_checksum_address(addr) for addr in moderator_addresses[:3]]
        
        # Pad moderators list to 3 if needed (shouldn't happen)
        while len(moderators) < 3:
            moderators.append(Web3.to_checksum_address("0x0000000000000000000000000000000000000000"))
        
        # Build transaction
        nonce = w3.eth.get_transaction_count(OWNER_ADDRESS)
        
        tx = contract.functions.createCase(
            message_hash_bytes,
            offender,
            moderators
        ).build_transaction({
            'from': OWNER_ADDRESS,
            'nonce': nonce,
            'gas': 300000,
            'gasPrice': w3.eth.gas_price,
            'chainId': 11155111  # Sepolia
        })
        
        # Sign and send
        signed_tx = w3.eth.account.sign_transaction(tx, OWNER_PRIVATE_KEY)
        tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        
        print(f"📤 TX sent: {tx_hash.hex()}")
        
        # Wait for receipt
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        
        if receipt.status == 1:
            # Get the case ID from the CaseCreated event
            logs = contract.events.CaseCreated().process_receipt(receipt)
            case_id = logs[0]['args']['caseId'] if logs else None
            
            print(f"✅ Case created on-chain! Case ID: {case_id}")
            print(f"   TX: https://sepolia.etherscan.io/tx/{tx_hash.hex()}")
            
            return {
                "success": True,
                "tx_hash": tx_hash.hex(),
                "case_id": case_id,
                "block_number": receipt.blockNumber
            }
        else:
            print(f"❌ TX failed! Receipt: {receipt}")
            return {"success": False, "error": "Transaction reverted", "tx_hash": tx_hash.hex()}
            
    except Exception as e:
        print(f"❌ Blockchain error: {e}")
        return {"success": False, "error": str(e)}


def get_case_from_chain(case_id: int) -> dict:
    """Read case data from the smart contract"""
    try:
        result = contract.functions.getCase(case_id).call()
        return {
            "message_hash": result[0].hex(),
            "offender": result[1],
            "moderators": list(result[2]),
            "vote_count": result[3],
            "resolved": result[4],
            "decision": result[5],
            "created_at": result[6]
        }
    except Exception as e:
        print(f"❌ Error reading case {case_id}: {e}")
        return None


def get_case_count() -> int:
    """Get total number of cases on-chain"""
    try:
        return contract.functions.caseCount().call()
    except Exception as e:
        print(f"❌ Error getting case count: {e}")
        return 0


def check_resolved_cases(from_block: int = None) -> list:
    """Check for CaseResolved events"""
    try:
        if from_block is None:
            from_block = w3.eth.block_number - 1000  # Last ~1000 blocks
        
        events = contract.events.CaseResolved.get_logs(fromBlock=from_block)
        
        resolved = []
        for event in events:
            resolved.append({
                "case_id": event['args']['caseId'],
                "decision": event['args']['decision'],  # 1=punish, 2=dismiss
                "block_number": event['blockNumber'],
                "tx_hash": event['transactionHash'].hex()
            })
        
        return resolved
    except Exception as e:
        print(f"❌ Error checking resolved cases: {e}")
        return []