# Database Setup Instructions

## 🚨 CRITICAL: You must run these migrations in Supabase!

The app won't work until you run these SQL files in your **Supabase SQL Editor**.

---

## Step 1: Run Punishment System Migrations

**In this order:**

### 1️⃣ User Punishments Schema
Location: `supabase/migrations/001_user_punishments_schema.sql`

Creates the punishment tracking table and adds fields to profiles.

### 2️⃣ Punishment Functions
Location: `supabase/migrations/002_punishment_functions.sql`

Creates:
- `assign_punishment()` - Assigns timeouts/bans
- `expire_timeouts()` - Auto-expires timeouts
- `get_user_punishment_status()` - Checks user status

### 3️⃣ Enable Realtime
Location: `supabase/migrations/003_enable_realtime.sql`

Enables real-time updates for messages.

### 4️⃣ Fix Message Permissions
Location: `supabase/migrations/004_fix_message_insert_policy.sql`

Allows users to send messages (INSERT policy).

---

## Step 2: How to Run

1. Go to your Supabase Dashboard
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy and paste the contents of each file **in order**
5. Click **Run** for each one

---

## Step 3: Verify

Run this to check if everything is set up:

```sql
-- Check if punishment functions exist
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE '%punishment%';

-- Should return:
-- assign_punishment
-- expire_timeouts
-- get_user_punishment_status

-- Check if messages realtime is enabled
SELECT * FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
AND tablename = 'messages';

-- Should return one row

-- Check message policies
SELECT policyname FROM pg_policies WHERE tablename = 'messages';

-- Should show INSERT and SELECT policies
```

---

## ❌ Current Errors You're Seeing

Based on the console output:

1. ❌ **`get_user_punishment_status` not found**
   → Run `002_punishment_functions.sql`

2. ❌ **Ambiguous relationship for messages/profiles**
   → Fixed in code (Chat.jsx)

3. ❌ **Realtime connection failing**
   → Run `003_enable_realtime.sql`

---

## ✅ After Running Migrations

1. Refresh the app
2. Try sending a message
3. Should work!

---

## 🆘 Still Having Issues?

If you still see errors after running ALL migrations, share:
1. The output from the verification SQL above
2. Any new console errors
