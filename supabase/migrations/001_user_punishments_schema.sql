-- =====================================================
-- User Punishments Table
-- Tracks all timeout and ban punishments
-- =====================================================

create table if not exists public.user_punishments (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  wallet_address text not null,
  punishment_type text not null, -- 'timeout' or 'ban'
  duration_hours integer null, -- null for permanent bans
  reason text not null,
  case_id uuid null, -- reference to moderation_cases if applicable
  issued_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone null,
  is_active boolean not null default true,
  issued_by text null, -- moderator wallet or 'system'
  
  constraint user_punishments_pkey primary key (id),
  constraint fk_user_punishments_user foreign key (user_id) references profiles(id) on delete cascade,
  constraint fk_user_punishments_wallet foreign key (wallet_address) references profiles(wallet_address) on delete cascade,
  constraint check_punishment_type check (punishment_type in ('timeout', 'ban')),
  constraint check_duration check (
    (punishment_type = 'ban' and duration_hours is null) or
    (punishment_type = 'timeout' and duration_hours is not null)
  )
) tablespace pg_default;

-- =====================================================
-- Indexes for Performance
-- =====================================================

create index if not exists idx_user_punishments_user_id 
  on public.user_punishments(user_id);

create index if not exists idx_user_punishments_wallet 
  on public.user_punishments(wallet_address);

create index if not exists idx_user_punishments_active 
  on public.user_punishments(is_active) 
  where is_active = true;

create index if not exists idx_user_punishments_expires 
  on public.user_punishments(expires_at) 
  where expires_at is not null;

-- =====================================================
-- Add Punishment Status Columns to Profiles
-- =====================================================

alter table public.profiles
  add column if not exists is_banned boolean default false,
  add column if not exists is_timed_out boolean default false,
  add column if not exists timeout_until timestamp with time zone null,
  add column if not exists ban_reason text null,
  add column if not exists last_punishment_at timestamp with time zone null;

-- Index for checking banned/timed out users
create index if not exists idx_profiles_banned 
  on public.profiles(is_banned) 
  where is_banned = true;

create index if not exists idx_profiles_timed_out 
  on public.profiles(is_timed_out) 
  where is_timed_out = true;

-- =====================================================
-- Row Level Security (RLS) Policies
-- =====================================================

-- Enable RLS on user_punishments
alter table user_punishments enable row level security;

-- Users can view their own punishments
drop policy if exists "Users can view their own punishments" on user_punishments;
create policy "Users can view their own punishments"
  on user_punishments for select
  using (auth.uid() = user_id);

-- Anyone can view all punishments (for moderation transparency)
drop policy if exists "Public can view punishments" on user_punishments;
create policy "Public can view punishments"
  on user_punishments for select
  using (true);

-- Only authenticated users via service role can insert/update punishments
-- (This will be done via your backend/edge functions)
