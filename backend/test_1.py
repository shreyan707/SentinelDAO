from supabase_client import supabase

print("=== Testing Supabase connection ===")

# Test 1: Simple table query
try:
    resp = supabase.table("messages").select("id,content").limit(1).execute()
    print("✅ Messages table:", resp.data)
except Exception as e:
    print("❌ Messages error:", str(e))

# Test 2: List all tables (via information_schema)
try:
    resp = supabase.rpc("list_tables").execute()
    print("✅ Tables:", resp.data)
except:
    print("ℹ️ No list_tables RPC, that's normal")
    
print("✅ Client initialized successfully!")
