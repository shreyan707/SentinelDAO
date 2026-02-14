-- =====================================================
-- Fix Message Insertion - Add RLS Policies
-- This ensures users can INSERT messages
-- =====================================================

-- First, check current policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'messages';

-- =====================================================
-- Create INSERT policy for messages
-- =====================================================

-- Allow authenticated users to insert their own messages
CREATE POLICY IF NOT EXISTS "Users can insert their own messages"
  ON messages
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow anonymous users to insert messages (if needed)
-- Uncomment if you want anonymous posting
-- CREATE POLICY IF NOT EXISTS "Anyone can insert messages"
--   ON messages
--   FOR INSERT
--   TO anon
--   WITH CHECK (true);

-- =====================================================
-- Verify RLS is enabled on messages table
-- =====================================================

-- Enable RLS (if not already enabled)
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- Check if policies exist
-- =====================================================

SELECT 
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'messages'
ORDER BY cmd;

-- Expected output should include:
-- 1. SELECT policy (allow reading messages)
-- 2. INSERT policy (allow inserting messages)

-- =====================================================
-- Test Insert (run after applying policies)
-- =====================================================

-- This should work now:
/*
INSERT INTO messages (user_id, content, wallet_address)
VALUES (
  auth.uid(),
  'Test message after policy fix',
  '0x1234567890abcdef'
);
*/

-- =====================================================
-- Troubleshooting
-- =====================================================

-- If inserts still fail, check:

-- 1. Is RLS enabled?
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'messages';
-- Should show: t (true)

-- 2. Are there any policies?
SELECT count(*) FROM pg_policies WHERE tablename = 'messages';
-- Should show: >= 2 (SELECT and INSERT)

-- 3. Check the exact error:
-- Open browser console when sending message
-- Look for Supabase error details
