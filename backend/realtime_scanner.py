import asyncio
import time
from supabase import create_client, Client
from dotenv import load_dotenv
import os
from datetime import datetime, timezone, timedelta

# Load .env FIRST
load_dotenv()

# Hardcode keys temporarily to bypass os.getenv bug
url = os.getenv("SUPABASE_URL") or "https://qtgpcpflcrgrkvffozds.supabase.co"
service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0Z3BjcGZsY3Jncmt2ZmZvemRzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDk1MDc0NCwiZXhwIjoyMDg2NTI2NzQ0fQ.ZXdbcClBxUHk1pUy7crEjDeEWOb07DthYsKOd8GbLIE"

print(f"🔗 URL: {url[:30]}...")
print(f"🔑 Service key loaded: {'✅' if service_key else '❌ MISSING'}")

# Create client
supabase: Client = create_client(url, service_key)

async def scan_unprocessed():
    """Scan messages where processed_at IS NULL"""
    try:
        # ✅ SELECT user_id for warnings
        resp = supabase.table("messages").select("id, content, user_id").is_("processed_at", None).limit(3).execute()
        messages = resp.data or []
        
        if not messages:
            return
        
        print(f"📨 Found {len(messages)} unprocessed messages")
        
        # IST timezone
        ist = timezone(timedelta(hours=5, minutes=30))
        
        for msg in messages:
            print(f"🆕 Scanning: {msg['content'][:40]}...")
            
            # Your scanner function
            from services.scanner import scan
            result = scan(msg['content'])
            
            # ✅ Update message WITH PUNISHMENT + SCORES
            supabase.table("messages").update({
                "flagged": result["flagged"],
                "reason": result["reason"], 
                "harmful_score": result["harmful_score"],
                "punishment": result["punishment"], 
                "severe_score": result["severe_score"],
                "processed_at": datetime.now(ist).isoformat()
            }).eq("id", msg["id"]).execute()


            # When flagged → create moderation case
            if result["flagged"] and msg.get("user_id"):
                # 1. Get 3 random wallets from profiles
                random_users = supabase.table("profiles").select("wallet_address").limit(3).order("random()").execute()
                random_wallets = [row["wallet_address"] for row in random_users.data]
                
                # 2. Insert moderation cases
                for wallet in random_wallets:
                    supabase.table("moderation_cases").insert({
                        "message_id": msg["id"],
                        "user_id": msg["user_id"],
                        "proposed_punishment": result["punishment"],
                        "reviewer_wallet": wallet,
                        "created_at": datetime.now(ist).isoformat()
                    }).execute()
                
                print(f"   📋 Created moderation case | Reviewers: {len(random_wallets)} users")

            
            status = "🚨 FLAGGED" if result["flagged"] else "✅ SAFE"
            print(f"   {status} | H:{result['harmful_score']:.2f} S:{result['severe_score']:.2f} | {result.get('punishment', 'none')}")
            
            # ✅ INCREMENT WARNINGS if flagged (NEW!)
            if result["flagged"] and msg.get("user_id"):
                supabase.rpc("increment_warnings", {
                    "user_id": msg["user_id"]
                })
                print(f"   ⚠️  Profile warnings +1 → {msg['user_id'][:8]}...")
    
    except Exception as e:
        print(f"❌ Error: {e}")

async def main():
    print("🔄 Async scanner started...")
    while True:
        await scan_unprocessed()
        await asyncio.sleep(2)

if __name__ == "__main__":
    asyncio.run(main())
