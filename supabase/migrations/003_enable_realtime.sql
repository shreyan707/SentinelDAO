-- =====================================================
-- Enable Realtime for Messages Table
-- Run this in your Supabase SQL Editor
-- =====================================================

-- Enable realtime replication for messages table
alter publication supabase_realtime add table messages;

-- Verify realtime is enabled
SELECT 
  schemaname,
  tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
AND tablename = 'messages';

-- Expected output: Should show 'public | messages'

-- =====================================================
-- Verify RLS Policies
-- =====================================================

-- Check existing policies on messages table
SELECT 
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'messages';

-- Create SELECT policy if not exists (allows everyone to read messages)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'messages' 
    AND policyname = 'Messages are viewable by everyone'
  ) THEN
    CREATE POLICY "Messages are viewable by everyone"
      ON messages FOR SELECT
      USING (true);
  END IF;
END $$;

-- =====================================================
-- Grant Realtime Permissions
-- =====================================================

-- Grant usage on realtime schema (if needed)
GRANT USAGE ON SCHEMA realtime TO anon, authenticated;

-- =====================================================
-- Test Query
-- =====================================================

-- To verify realtime is working, run this after the above:
-- 1. Open your app in browser 1
-- 2. Open SQL editor in browser 2
-- 3. Run this INSERT:

/*
INSERT INTO messages (user_id, content, wallet_address)
SELECT 
  id,
  'Test realtime message',
  wallet_address
FROM profiles
WHERE username = 'your_username'
LIMIT 1;
*/

-- 4. Message should appear immediately in browser 1 without refresh

-- =====================================================
-- Troubleshooting
-- =====================================================

-- If messages don't appear in realtime:

-- 1. Check if realtime is enabled for table
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- 2. Check Supabase project settings:
--    - Go to Project Settings → API
--    - Ensure Realtime is enabled

-- 3. Check browser console for:
--    "✅ Connected to realtime messages"
--    If you see errors, check your RLS policies

-- 4. Restart realtime (in Supabase dashboard):
--    - Project Settings → Database → Connection Pooling
--    - Restart database connections

-- =====================================================
-- Disable Realtime (if needed)
-- =====================================================

-- To disable realtime for messages:
-- alter publication supabase_realtime drop table messages;
