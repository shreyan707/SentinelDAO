# backend/main.py

import logging
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from supabase_client import supabase  # local file: supabase_client.py

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Sentinel Backend")

# --- CORS (allow your frontend) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://shreyan707.github.io",
        "https://shreyan707.github.io/SentinelDAO",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Schemas ----------

class Message(BaseModel):
    id: str
    user_id: str
    content: str
    created_at: str
    toxicity_score: Optional[float] = None
    is_flagged: Optional[bool] = None
    moderation_status: Optional[str] = None
    username: Optional[str] = None


# ---------- Routes ----------

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/messages", response_model=List[Message])
def get_messages():
    """
    Read messages from Supabase.
    First version: simple select; then we try to include username via join.
    """
    try:
        # Try join with profiles.username (requires FK messages.user_id -> profiles.id)
        resp = (
            supabase
            .table("messages")
            .select(
                "id,user_id,content,created_at,"
                "toxicity_score,is_flagged,moderation_status,"
                "profiles(username)"
            )
            .order("created_at", desc=False)
            .execute()
        )
    except Exception as e:
        logger.exception("Supabase query failed")
        raise HTTPException(status_code=500, detail=str(e))

    # New supabase-py returns .data / .error
    if getattr(resp, "error", None):
        logger.error("Supabase error: %s", resp.error)
        raise HTTPException(status_code=500, detail=str(resp.error))

    rows = resp.data or []

    messages: list[Message] = []
    for row in rows:
        profile = row.pop("profiles", None)
        if profile and isinstance(profile, dict):
            row["username"] = profile.get("username")
        messages.append(Message(**row))

    return messages


@app.get("/messages/latest", response_model=List[Message])
def get_latest_messages(limit: int = 20):
    """
    Get the latest N messages (default 20), newest last.
    """
    try:
        resp = (
            supabase
            .table("messages")
            .select("id,user_id,content,created_at,profiles(username)")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
    except Exception as e:
        logger.exception("Supabase query failed (latest)")
        raise HTTPException(status_code=500, detail=str(e))

    if getattr(resp, "error", None):
        logger.error("Supabase error (latest): %s", resp.error)
        raise HTTPException(status_code=500, detail=str(resp.error))

    rows = resp.data or []
    out: list[Message] = []
    for row in rows:
        profile = row.pop("profiles", None)
        if profile and isinstance(profile, dict):
            row["username"] = profile.get("username")
        out.append(Message(**row))

    # reverse so messages are chronological
    return list(reversed(out))
