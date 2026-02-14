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
        resp = supabase.table("messages").select("id, content").is_("processed_at", None).limit(3).execute()
        messages = resp.data or []
        
        if not messages:
            return
        
        print(f"📨 Found {len(messages)} unprocessed messages")
        
        for msg in messages:
            print(f"🆕 Scanning: {msg['content'][:40]}...")
            
            # Your scanner function
            from services.scanner import scan
            result = scan(msg['content'])
            ist = timezone(timedelta(hours=5, minutes=30))
            
            # Update message WITH PUNISHMENT
            update = supabase.table("messages").update({
                "flagged": result["flagged"],
                "reason": result["reason"], 
                "harmful_score": result["harmful_score"],
                "punishment": result["punishment"], 
                "severe_score": result["severe_score"],
                "processed_at": datetime.now(ist).isoformat()
            }).eq("id", msg["id"]).execute()
            
            status = "🚨 FLAGGED" if result["flagged"] else "✅ SAFE"
            print(f"   {status} | Score: {result['harmful_score']:.2f} | Punishment: {result.get('punishment', 'none')}")
            
    except Exception as e:
        print(f"❌ Error: {e}")

async def main():
    print("🔄 Async scanner started...")
    while True:
        await scan_unprocessed()
        await asyncio.sleep(2)

if __name__ == "__main__":
    asyncio.run(main())
