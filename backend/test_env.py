from dotenv import load_dotenv
import os

load_dotenv()
print("URL:", os.getenv("SUPABASE_URL"))
print("Key starts with:", os.getenv("SUPABASE_SERVICE_ROLE_KEY")[:20] + "...")
