# Timeout and Ban System Setup Guide

This guide walks you through setting up the timeout and ban punishment system for SentinelDAO.

## 🗄️ Database Setup

### Prerequisites
- Supabase project with existing `profiles` and `messages` tables
- SQL Editor access in Supabase dashboard

### Step 1: Run Migrations

Execute the following SQL files in order in your Supabase SQL Editor:

#### 1. User Punishments Schema
Run `supabase/migrations/001_user_punishments_schema.sql`

This creates:
- `user_punishments` table to track all timeouts and bans
- New columns in `profiles` table for ban/timeout status
- Indexes for performance
- Row Level Security policies

#### 2. Punishment Functions
Run `supabase/migrations/002_punishment_functions.sql`

This creates:
- `assign_punishment()` - Assigns timeout or ban based on warning count
- `expire_timeouts()` - Automatically expires timeouts
- `get_user_punishment_status()` - Gets current punishment status

### Step 2: Verify Installation

Run this query to verify tables were created:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('user_punishments');
```

Run this to verify functions were created:

```sql
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('assign_punishment', 'expire_timeouts', 'get_user_punishment_status');
```

## 🎯 Punishment Escalation Policy

The system uses a tiered approach:

| Offense | Warning Count | Punishment | Duration |
|---------|---------------|------------|----------|
| 1st offense | 1 warning | Timeout | 24 hours |
| 2nd offense | 2 warnings | Timeout | 7 days |
| 3rd offense | 3+ warnings | **Permanent Ban** | Forever |
| High severity | Any (severe_score > 0.9) | **Immediate Ban** | Forever |

## 🔧 How It Works

### 1. Message Flagging
- Toxic messages are detected and flagged by the moderation system
- Moderation cases are created and assigned to moderators

### 2. Voting
- Moderators vote "Punish" or "Dismiss" on flagged messages
- When a moderator votes "Punish", the VoteButton component:
  - Casts the vote on-chain
  - **Automatically calls `assignPunishment()`**
  - Increments the user's warning count
  - Assigns timeout or ban based on warning count

### 3. Enforcement
- **Real-time checking**: Chat component checks punishment status every 30 seconds
- **Message blocking**: `canUserPost()` prevents banned/timed out users from posting
- **UI feedback**: PunishmentBanner shows ban/timeout status with countdown timer
- **Auto-expiration**: Timeouts expire automatically

## 🧪 Testing

### Test 1: First Offense (24-hour timeout)

```sql
-- Manually assign punishment to test user
SELECT assign_punishment(
  '<user_uuid>'::uuid,
  '<wallet_address>',
  NULL, -- case_id
  'Test punishment - 1st offense',
  0 -- severe_score
);

-- Check status
SELECT * FROM get_user_punishment_status('<wallet_address>');

-- Verify user cannot post
-- Try sending a message in the UI - should be blocked
```

### Test 2: Second Offense (7-day timeout)

```sql
-- User should already have 1 warning from Test 1
-- Assign another punishment
SELECT assign_punishment(
  '<user_uuid>'::uuid,
  '<wallet_address>',
  NULL,
  'Test punishment - 2nd offense',
  0
);

-- Should get 7-day timeout
SELECT * FROM user_punishments WHERE wallet_address = '<wallet_address>';
```

### Test 3: Third Offense (Permanent Ban)

```sql
-- User should have 2 warnings
-- Assign third punishment
SELECT assign_punishment(
  '<user_uuid>'::uuid,
  '<wallet_address>',
  NULL,
  'Test punishment - 3rd offense',
  0
);

-- Should get permanent ban
SELECT is_banned, ban_reason FROM profiles WHERE wallet_address = '<wallet_address>';
```

### Test 4: High Severity Immediate Ban

```sql
-- New user with 0 warnings
SELECT assign_punishment(
  '<new_user_uuid>'::uuid,
  '<new_wallet_address>',
  NULL,
  'Severe violation',
  0.95 -- severe_score > 0.9
);

-- Should get immediate ban
SELECT is_banned FROM profiles WHERE wallet_address = '<new_wallet_address>';
```

### Test 5: Timeout Expiration

```sql
-- Manually expire a timeout for testing
UPDATE user_punishments 
SET expires_at = NOW() - INTERVAL '1 hour'
WHERE punishment_type = 'timeout' 
AND wallet_address = '<wallet_address>';

-- Call expiration function
SELECT expire_timeouts();

-- User should be able to post again
SELECT is_timed_out FROM profiles WHERE wallet_address = '<wallet_address>';
-- Should be FALSE
```

## 📊 Monitoring

### View All Active Punishments

```sql
SELECT 
  p.username,
  p.wallet_address,
  up.punishment_type,
  up.reason,
  up.issued_at,
  up.expires_at,
  p.warnings
FROM user_punishments up
JOIN profiles p ON up.wallet_address = p.wallet_address
WHERE up.is_active = true
ORDER BY up.issued_at DESC;
```

### View Ban Statistics

```sql
SELECT 
  COUNT(*) FILTER (WHERE is_banned = true) as total_bans,
  COUNT(*) FILTER (WHERE is_timed_out = true) as active_timeouts,
  AVG(warnings) as avg_warnings
FROM profiles;
```

### View Punishment History for User

```sql
SELECT 
  punishment_type,
  reason,
  duration_hours,
  issued_at,
  expires_at,
  is_active
FROM user_punishments
WHERE wallet_address = '<wallet_address>'
ORDER BY issued_at DESC;
```

## 🔐 Security Notes

- ✅ Row Level Security (RLS) is enabled on `user_punishments`
- ✅ Users can view their own punishments
- ✅ All punishments are publicly viewable (transparency)
- ✅ Only backend/edge functions can insert punishments (via service role)
- ✅ Functions run with `SECURITY DEFINER` for elevated privileges

## 🆘 Troubleshooting

### Issue: Punishments not being assigned

**Check:**
1. Is the database function created? Run verification query above
2. Check browser console for errors
3. Verify `caseData` is being passed to VoteButton

### Issue: User can still post despite being banned

**Check:**
1. Run `SELECT * FROM get_user_punishment_status('<wallet_address>');`
2. Check if `can_post` is `false` in the response
3. Verify Chat component is checking `canUserPost()` before sending

### Issue: Timeout not expiring

**Solutions:**
1. Call `expire_timeouts()` manually: `SELECT expire_timeouts();`
2. The function runs automatically when checking user status
3. For production, set up pg_cron to run hourly

### Issue: Warning count not incrementing

**Check:**
```sql
SELECT warnings FROM profiles WHERE wallet_address = '<wallet_address>';
```

If not incrementing, the `assign_punishment()` function may not be executing properly.

## 🚀 Production Deployment

### Recommended: Set up pg_cron for automatic timeout expiration

```sql
-- Install pg_cron extension (if not already)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Run expire_timeouts() every hour
SELECT cron.schedule(
  'expire-timeouts',
  '0 * * * *', -- Every hour
  $$SELECT expire_timeouts();$$
);
```

### Environment Variables

Ensure these are set in your `.env` file:
```
VITE_SUPABASE_URL=<your-supabase-url>
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

## 📝 Next Steps

1. ✅ Run database migrations
2. ✅ Test with a test account
3. ✅ Monitor punishment assignments
4. ✅ Set up pg_cron for production
5. 🎯 Integrate with your moderation workflow
