# backend/main.py

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from supabase_client import supabase
from services.scanner import scan
from routes.moderation import router as moderation_router

app = FastAPI(title="Sentinel Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register moderation routes
app.include_router(moderation_router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/messages-simple")
def get_messages_simple():
    resp = supabase.from_("messages").select("id,user_id,content,created_at").limit(10).execute()
    return {
        "success": True,
        "data": resp.data or [],
        "count": len(resp.data or [])
    }


@app.get("/scan-new-messages")
def scan_new_messages(limit: int = 10):
    resp = supabase.from_("messages") \
        .select("id,user_id,content") \
        .order("created_at", desc=True) \
        .limit(limit) \
        .execute()
    
    if not resp.data:
        return {"status": "no_messages", "count": 0}
    
    results = []
    for msg in resp.data:
        scan_result = scan(msg["content"])
        results.append({
            "message_id": msg["id"],
            "user_id": msg["user_id"],
            "content": msg["content"],
            **scan_result
        })
    
    return {"status": "scanned", "count": len(results), "results": results}