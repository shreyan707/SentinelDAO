from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from supabase_client import supabase
from services.scanner import scan  # Your scanner

app = FastAPI(title="Sentinel Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/messages-simple")
def get_messages_simple():
    """Works exactly like test_supabase.py"""
    resp = supabase.table("messages").select("id,user_id,content,created_at").limit(10).execute()
    return {
        "success": True,
        "data": resp.data or [],
        "count": len(resp.data or [])
    }

@app.get("/messages-complete")
def get_messages_complete():
    """Raw data, no processing"""
    resp = supabase.table("messages").select("*").limit(20).execute()
    return resp.data or []

@app.get("/scan-new-messages")
def scan_new_messages(limit: int = 10):
    """
    Pulls messages → AI scan → FLAGS in Supabase + returns results
    """
    resp = supabase.table("messages").select("id,user_id,content").order("created_at", desc=True).limit(limit).execute()
    
    if not resp.data:
        return {"status": "no_messages", "count": 0}
    
    results = []
    for msg in resp.data:
        scan_result = scan(msg["content"])
        
        # ✅ WRITE RESULTS BACK TO SUPABASE
        update_resp = (
            supabase
            .table("messages")
            .update({
                "flagged": scan_result["flagged"],
                "reason": scan_result["reason"],
                "harmful_score": scan_result["harmful_score"],
                "severe_score": scan_result["severe_score"],
                "punishment": scan_result["punishment"],
                "processed_at": "NOW()"
            })
            .eq("id", msg["id"])
            .execute()
        )
        
        results.append({
            "message_id": msg["id"],
            "user_id": msg["user_id"],
            "content": msg["content"],
            **scan_result,
            "supabase_updated": update_resp.data is not None
        })
    
    return {"status": "scanned_and_flagged", "count": len(results), "results": results}


@app.get("/scan-status/{message_id}")
def get_scan_status(message_id: str):
    """Check scan results for a message"""
    resp = (
        supabase
        .table("messages")
        .select("id, flagged, reason, harmful_score, severe_score, punishment")
        .eq("id", message_id)
        .single()
        .execute()
    )
    return resp.data or {"error": "message_not_found"}
