# backend/services/moderation.py

import hashlib
import random
from datetime import datetime, timezone, timedelta
from supabase_client import supabase
from services.blockchain import create_case_on_chain

IST = timezone(timedelta(hours=5, minutes=30))


def select_random_moderators(exclude_user_id: str = None, count: int = 3) -> list:
    """
    Select random moderators from profiles that have wallet_address set.
    Excludes the offender.
    """
    try:
        query = supabase.table("profiles") \
            .select("id, username, wallet_address") \
            .not_.is_("wallet_address", "null")
        
        # Exclude the offender from being a moderator
        if exclude_user_id:
            query = query.neq("id", exclude_user_id)
        
        resp = query.execute()
        eligible = resp.data or []
        
        # Filter out profiles with empty wallet_address
        eligible = [p for p in eligible if p.get("wallet_address") and p["wallet_address"].strip()]
        
        if len(eligible) < count:
            print(f"⚠️ Only {len(eligible)} eligible moderators found (need {count})")
            if len(eligible) == 0:
                return []
            count = len(eligible)
        
        selected = random.sample(eligible, count)
        
        print(f"👥 Selected {len(selected)} moderators:")
        for mod in selected:
            print(f"   - {mod['username']} ({mod['wallet_address'][:10]}...)")
        
        return selected
        
    except Exception as e:
        print(f"❌ Error selecting moderators: {e}")
        return []


def create_moderation_case(message_id: str, user_id: str, content: str, harmful_score: float) -> dict:
    """
    Full flow:
    1. Select 3 random moderators
    2. Create case in Supabase moderation_cases table
    3. Call smart contract createCase()
    4. Update moderation_cases with blockchain_case_id
    """
    try:
        print(f"\n🚨 Creating moderation case for message: {message_id}")
        
        # --- Step 1: Get offender wallet address ---
        offender_resp = supabase.table("profiles") \
            .select("wallet_address") \
            .eq("id", user_id) \
            .single() \
            .execute()
        
        offender_wallet = None
        if offender_resp.data and offender_resp.data.get("wallet_address"):
            offender_wallet = offender_resp.data["wallet_address"]
        
        # Also check messages table for wallet_address
        if not offender_wallet:
            msg_resp = supabase.table("messages") \
                .select("wallet_address") \
                .eq("id", message_id) \
                .single() \
                .execute()
            if msg_resp.data and msg_resp.data.get("wallet_address"):
                offender_wallet = msg_resp.data["wallet_address"]
        
        if not offender_wallet:
            print("⚠️ No wallet address found for offender, using zero address")
            offender_wallet = "0x0000000000000000000000000000000000000000"
        
        # --- Step 2: Select 3 random moderators ---
        moderators = select_random_moderators(exclude_user_id=user_id, count=3)
        
        if len(moderators) < 3:
            print(f"❌ Not enough moderators ({len(moderators)}/3). Skipping blockchain call.")
            # Still create the case in Supabase for tracking
            mod_wallets = [m["wallet_address"].lower() for m in moderators]
            while len(mod_wallets) < 3:
                mod_wallets.append(None)
            
            case_data = {
                "message_id": message_id,
                "offender_id": user_id,
                "moderator_1": mod_wallets[0],
                "moderator_2": mod_wallets[1],
                "moderator_3": mod_wallets[2],
                "status": "insufficient_moderators",
                "toxicity_score": harmful_score,
                "created_at": datetime.now(IST).isoformat()
            }
            
            resp = supabase.table("moderation_cases").insert(case_data).execute()
            return {"success": False, "reason": "insufficient_moderators", "case": resp.data}
        
        mod_wallets = [m["wallet_address"].lower() for m in moderators]
        
        # --- Step 3: Create message hash ---
        message_hash = hashlib.sha256(
            f"{message_id}:{content}".encode()
        ).hexdigest()
        
        print(f"📝 Message hash: {message_hash[:20]}...")
        print(f"👤 Offender wallet: {offender_wallet}")
        print(f"👥 Moderator wallets: {[w[:10]+'...' for w in mod_wallets]}")
        
        # --- Step 4: Insert case into Supabase FIRST ---
        case_data = {
            "message_id": message_id,
            "offender_id": user_id,
            "moderator_1": mod_wallets[0],
            "moderator_2": mod_wallets[1],
            "moderator_3": mod_wallets[2],
            "status": "voting",
            "toxicity_score": harmful_score,
            "created_at": datetime.now(IST).isoformat()
        }
        
        insert_resp = supabase.table("moderation_cases").insert(case_data).execute()
        
        if not insert_resp.data:
            print("❌ Failed to insert case into Supabase")
            return {"success": False, "reason": "db_insert_failed"}
        
        supabase_case_id = insert_resp.data[0]["id"]
        print(f"📦 Supabase case created: {supabase_case_id}")
        
        # --- Step 5: Call smart contract ---
        chain_result = create_case_on_chain(
            message_hash_hex=message_hash,
            offender_address=offender_wallet,
            moderator_addresses=mod_wallets
        )
        
        if chain_result["success"]:
            blockchain_case_id = chain_result["case_id"]
            
            # Update Supabase case with blockchain case ID
            supabase.table("moderation_cases").update({
                "blockchain_case_id": blockchain_case_id,
                "status": "voting"
            }).eq("id", supabase_case_id).execute()
            
            print(f"✅ Moderation case fully created!")
            print(f"   Supabase ID: {supabase_case_id}")
            print(f"   Blockchain Case ID: {blockchain_case_id}")
            print(f"   TX: {chain_result['tx_hash']}")
            
            return {
                "success": True,
                "supabase_case_id": supabase_case_id,
                "blockchain_case_id": blockchain_case_id,
                "tx_hash": chain_result["tx_hash"],
                "moderators": mod_wallets
            }
        else:
            # Blockchain failed but Supabase case exists
            supabase.table("moderation_cases").update({
                "status": "chain_error"
            }).eq("id", supabase_case_id).execute()
            
            print(f"⚠️ Case created in DB but blockchain call failed: {chain_result.get('error')}")
            return {
                "success": False,
                "reason": "blockchain_failed",
                "error": chain_result.get("error"),
                "supabase_case_id": supabase_case_id
            }
        
    except Exception as e:
        print(f"❌ Error creating moderation case: {e}")
        import traceback
        traceback.print_exc()
        return {"success": False, "reason": str(e)}


def check_and_update_resolved_cases():
    """
    Poll blockchain for resolved cases and update Supabase.
    Called periodically by the scanner loop.
    """
    try:
        # Get all cases that are still 'voting' in Supabase
        resp = supabase.table("moderation_cases") \
            .select("id, blockchain_case_id") \
            .eq("status", "voting") \
            .not_.is_("blockchain_case_id", "null") \
            .execute()
        
        pending_cases = resp.data or []
        
        if not pending_cases:
            return
        
        from services.blockchain import get_case_from_chain
        
        for case in pending_cases:
            chain_data = get_case_from_chain(case["blockchain_case_id"])
            
            if chain_data and chain_data["resolved"]:
                decision = "punish" if chain_data["decision"] == 1 else "dismiss"
                
                supabase.table("moderation_cases").update({
                    "status": "resolved",
                    "decision": decision
                }).eq("id", case["id"]).execute()
                
                print(f"⚖️ Case {case['blockchain_case_id']} resolved: {decision.upper()}")
                
                # If punished, increment warnings on the offender's profile
                if decision == "punish":
                    case_full = supabase.table("moderation_cases") \
                        .select("offender_id") \
                        .eq("id", case["id"]) \
                        .single() \
                        .execute()
                    
                    if case_full.data and case_full.data.get("offender_id"):
                        offender_id = case_full.data["offender_id"]
                        
                        # Get current warnings
                        profile = supabase.table("profiles") \
                            .select("warnings") \
                            .eq("id", offender_id) \
                            .single() \
                            .execute()
                        
                        current_warnings = (profile.data or {}).get("warnings", 0) or 0
                        
                        supabase.table("profiles").update({
                            "warnings": current_warnings + 1
                        }).eq("id", offender_id).execute()
                        
                        print(f"⚠️ Offender {offender_id} warnings: {current_warnings} → {current_warnings + 1}")
                
    except Exception as e:
        print(f"❌ Error checking resolved cases: {e}")