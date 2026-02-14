# backend/scanner_loop.py

import asyncio
from supabase import create_client, Client
from dotenv import load_dotenv
import os
from datetime import datetime, timezone, timedelta

# Load .env FIRST
load_dotenv()

url = os.getenv("SUPABASE_URL") or "https://qtgpcpflcrgrkvffozds.supabase.co"
service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0Z3BjcGZsY3Jncmt2ZmZvemRzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDk1MDc0NCwiZXhwIjoyMDg2NTI2NzQ0fQ.ZXdbcClBxUHk1pUy7crEjDeEWOb07DthYsKOd8GbLIE"

print(f"🔗 URL: {url[:30]}...")
print(f"🔑 Service key loaded: {'✅' if service_key else '❌ MISSING'}")

supabase: Client = create_client(url, service_key)

IST = timezone(timedelta(hours=5, minutes=30))


async def scan_unprocessed():
    """Scan messages where processed_at IS NULL"""
    try:
        resp = supabase.table("messages") \
            .select("id, user_id, content") \
            .is_("processed_at", None) \
            .limit(3) \
            .execute()
        
        messages = resp.data or []
        
        if not messages:
            return
        
        print(f"\n📨 Found {len(messages)} unprocessed messages")
        
        from services.scanner import scan
        
        for msg in messages:
            print(f"🆕 Scanning: {msg['content'][:40]}...")
            
            # Get user's warning count for punishment calibration
            warning_count = 0
            if msg.get("user_id"):
                try:
                    profile = supabase.table("profiles") \
                        .select("warnings") \
                        .eq("id", msg["user_id"]) \
                        .single() \
                        .execute()
                    warning_count = (profile.data or {}).get("warnings", 0) or 0
                except:
                    pass
            
            # Run scanner
            result = scan(msg["content"], warning_count=warning_count)
            
            # Update message with scan results
            supabase.table("messages").update({
                "flagged": result["flagged"],
                "reason": result["reason"],
                "harmful_score": result["harmful_score"],
                "severe_score": result["severe_score"],
                "punishment": result["punishment"],
                "processed_at": datetime.now(IST).isoformat()
            }).eq("id", msg["id"]).execute()
            
            status = "🚨 FLAGGED" if result["flagged"] else "✅ SAFE"
            print(f"   {status} | Score: {result['harmful_score']:.2f} | Punishment: {result.get('punishment', 'none')}")
            
            # ===== NEW: Create moderation case if flagged =====
            if result["flagged"] and msg.get("user_id"):
                print(f"⚖️ Triggering moderation case...")
                
                # Check if case already exists for this message
                existing = supabase.table("moderation_cases") \
                    .select("id") \
                    .eq("message_id", msg["id"]) \
                    .execute()
                
                if not existing.data:
                    from services.moderation import create_moderation_case
                    
                    case_result = create_moderation_case(
                        message_id=msg["id"],
                        user_id=msg["user_id"],
                        content=msg["content"],
                        harmful_score=result["harmful_score"]
                    )
                    
                    if case_result["success"]:
                        print(f"   ✅ Moderation case created! Chain ID: {case_result['blockchain_case_id']}")
                    else:
                        print(f"   ⚠️ Moderation case issue: {case_result.get('reason', 'unknown')}")
                else:
                    print(f"   ℹ️ Case already exists for this message")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()


async def check_resolved():
    """Check blockchain for resolved cases and update Supabase"""
    try:
        from services.moderation import check_and_update_resolved_cases
        check_and_update_resolved_cases()
    except Exception as e:
        print(f"❌ Error checking resolved: {e}")


async def main():
    print("🔄 Sentinel scanner started...")
    print("   📡 Scanning for new messages every 2 seconds")
    print("   ⚖️ Checking resolved cases every 10 seconds")
    
    cycle = 0
    while True:
        await scan_unprocessed()
        
        # Check resolved cases every 5 cycles (10 seconds)
        if cycle % 5 == 0:
            await check_resolved()
        
        cycle += 1
        await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(main())