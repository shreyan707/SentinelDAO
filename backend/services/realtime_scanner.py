# backend/services/realtime_scanner.py
import asyncio
import time
from supabase_client import supabase
from scanner import scan
import requests

async def watch_new_messages():
    """Background task: watches for new messages via Supabase Realtime"""
    while True:
        try:
            # Trigger scan via HTTP (self-call)
            resp = requests.post("http://localhost:8000/scan-new-messages", 
                               json={"limit": 5})
            print(f"Scanned: {resp.json()}")
        except Exception as e:
            print(f"Scan error: {e}")
        
        await asyncio.sleep(10)  # Check every 10 seconds

# Run: python -m services.realtime_scanner
