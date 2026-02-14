# backend/routes/moderation.py

from fastapi import APIRouter, HTTPException, Query
from supabase_client import supabase
from services.blockchain import get_case_from_chain, get_case_count

router = APIRouter(prefix="/moderation", tags=["Moderation"])


@router.get("/cases")
def get_all_cases(status: str = None, limit: int = 20):
    """Get all moderation cases, optionally filtered by status"""
    query = supabase.table("moderation_cases") \
        .select("*, messages:message_id(content, harmful_score, severe_score, reason), offender:offender_id(username, wallet_address, warnings)") \
        .order("created_at", desc=True) \
        .limit(limit)
    
    if status:
        query = query.eq("status", status)
    
    resp = query.execute()
    
    return {
        "success": True,
        "count": len(resp.data or []),
        "cases": resp.data or []
    }


@router.get("/my-cases")
def get_my_cases(wallet_address: str = Query(..., description="Moderator wallet address")):
    """Get cases assigned to a specific moderator wallet"""
    addr = wallet_address.lower()
    
    resp = supabase.table("moderation_cases") \
        .select("*, messages:message_id(content, harmful_score, severe_score, reason), offender:offender_id(username, wallet_address, warnings)") \
        .or_(f"moderator_1.eq.{addr},moderator_2.eq.{addr},moderator_3.eq.{addr}") \
        .order("created_at", desc=True) \
        .execute()
    
    cases = resp.data or []
    
    # Enrich with on-chain data
    enriched = []
    for case in cases:
        chain_data = None
        if case.get("blockchain_case_id") is not None:
            chain_data = get_case_from_chain(case["blockchain_case_id"])
        
        enriched.append({
            **case,
            "on_chain": chain_data
        })
    
    return {
        "success": True,
        "count": len(enriched),
        "cases": enriched
    }


@router.get("/case/{case_id}")
def get_case_detail(case_id: str):
    """Get full details of a specific moderation case"""
    resp = supabase.table("moderation_cases") \
        .select("*, messages:message_id(content, harmful_score, severe_score, reason, punishment), offender:offender_id(username, wallet_address, warnings)") \
        .eq("id", case_id) \
        .single() \
        .execute()
    
    if not resp.data:
        raise HTTPException(status_code=404, detail="Case not found")
    
    case = resp.data
    chain_data = None
    
    if case.get("blockchain_case_id") is not None:
        chain_data = get_case_from_chain(case["blockchain_case_id"])
    
    return {
        "success": True,
        "case": {
            **case,
            "on_chain": chain_data
        }
    }


@router.get("/chain/case/{blockchain_case_id}")
def get_chain_case(blockchain_case_id: int):
    """Read case directly from blockchain"""
    data = get_case_from_chain(blockchain_case_id)
    
    if not data:
        raise HTTPException(status_code=404, detail="Case not found on chain")
    
    return {
        "success": True,
        "case": data
    }


@router.get("/chain/count")
def get_chain_case_count():
    """Get total case count from blockchain"""
    count = get_case_count()
    return {"success": True, "case_count": count}


@router.get("/stats")
def get_moderation_stats():
    """Get moderation statistics"""
    try:
        total = supabase.table("moderation_cases").select("id", count="exact").execute()
        voting = supabase.table("moderation_cases").select("id", count="exact").eq("status", "voting").execute()
        resolved = supabase.table("moderation_cases").select("id", count="exact").eq("status", "resolved").execute()
        punished = supabase.table("moderation_cases").select("id", count="exact").eq("decision", "punish").execute()
        dismissed = supabase.table("moderation_cases").select("id", count="exact").eq("decision", "dismiss").execute()
        
        return {
            "success": True,
            "stats": {
                "total_cases": total.count or 0,
                "voting": voting.count or 0,
                "resolved": resolved.count or 0,
                "punished": punished.count or 0,
                "dismissed": dismissed.count or 0
            }
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/retry-chain/{case_id}")
def retry_blockchain_case(case_id: str):
    """Retry blockchain call for a case that failed"""
    resp = supabase.table("moderation_cases") \
        .select("*, messages:message_id(content)") \
        .eq("id", case_id) \
        .single() \
        .execute()
    
    if not resp.data:
        raise HTTPException(status_code=404, detail="Case not found")
    
    case = resp.data
    
    if case.get("blockchain_case_id") is not None:
        raise HTTPException(status_code=400, detail="Case already has blockchain ID")
    
    from services.moderation import create_moderation_case
    
    result = create_moderation_case(
        message_id=case["message_id"],
        user_id=case["offender_id"],
        content=case["messages"]["content"] if case.get("messages") else "",
        harmful_score=case.get("toxicity_score", 0)
    )
    
    return {"success": result["success"], "result": result}