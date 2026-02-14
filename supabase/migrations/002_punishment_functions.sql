-- =====================================================
-- Function: assign_punishment
-- Assigns timeout or ban based on warning count and severity
-- =====================================================

create or replace function assign_punishment(
  p_user_id uuid,
  p_wallet_address text,
  p_case_id uuid,
  p_reason text,
  p_severe_score double precision default 0
)
returns jsonb
language plpgsql
security definer -- Run with elevated privileges
as $$
declare
  v_warnings integer;
  v_punishment_type text;
  v_duration_hours integer;
  v_expires_at timestamp with time zone;
  v_punishment_id uuid;
begin
  -- Get current warning count
  select warnings into v_warnings
  from profiles
  where id = p_user_id;

  if not found then
    raise exception 'User not found: %', p_user_id;
  end if;

  -- Determine punishment type based on warnings and severity
  if p_severe_score > 0.9 then
    -- High severity = immediate ban
    v_punishment_type := 'ban';
    v_duration_hours := null;
    v_expires_at := null;
  elsif v_warnings >= 3 then
    -- 3+ warnings = permanent ban
    v_punishment_type := 'ban';
    v_duration_hours := null;
    v_expires_at := null;
  elsif v_warnings = 2 then
    -- 2 warnings = 7-day timeout
    v_punishment_type := 'timeout';
    v_duration_hours := 168; -- 7 days
    v_expires_at := now() + interval '168 hours';
  else
    -- 1 warning = 24-hour timeout
    v_punishment_type := 'timeout';
    v_duration_hours := 24;
    v_expires_at := now() + interval '24 hours';
  end if;

  -- Insert punishment record
  insert into user_punishments (
    user_id,
    wallet_address,
    punishment_type,
    duration_hours,
    reason,
    case_id,
    expires_at,
    issued_by
  ) values (
    p_user_id,
    p_wallet_address,
    v_punishment_type,
    v_duration_hours,
    p_reason,
    p_case_id,
    v_expires_at,
    'system'
  ) returning id into v_punishment_id;

  -- Update profiles table
  if v_punishment_type = 'ban' then
    update profiles
    set 
      is_banned = true,
      ban_reason = p_reason,
      last_punishment_at = now()
    where id = p_user_id;
  else
    update profiles
    set 
      is_timed_out = true,
      timeout_until = v_expires_at,
      last_punishment_at = now()
    where id = p_user_id;
  end if;

  -- Increment warnings
  update profiles
  set warnings = warnings + 1
  where id = p_user_id;

  return jsonb_build_object(
    'success', true,
    'punishment_id', v_punishment_id,
    'punishment_type', v_punishment_type,
    'duration_hours', v_duration_hours,
    'expires_at', v_expires_at,
    'new_warning_count', v_warnings + 1
  );
exception
  when others then
    return jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
end;
$$;

-- =====================================================
-- Function: expire_timeouts
-- Automatically expire timeouts that have passed
-- =====================================================

create or replace function expire_timeouts()
returns void
language plpgsql
security definer
as $$
begin
  -- Mark expired timeouts as inactive
  update user_punishments
  set is_active = false
  where punishment_type = 'timeout'
    and is_active = true
    and expires_at <= now();

  -- Update profiles to remove timeout status
  update profiles
  set 
    is_timed_out = false,
    timeout_until = null
  where is_timed_out = true
    and timeout_until <= now();
end;
$$;

-- =====================================================
-- Function: get_user_punishment_status
-- Get current punishment status for a user
-- =====================================================

create or replace function get_user_punishment_status(p_wallet_address text)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_profile record;
  v_active_punishment record;
  v_punishment_history jsonb;
begin
  -- First, expire any old timeouts
  perform expire_timeouts();

  -- Get profile
  select * into v_profile
  from profiles
  where wallet_address = p_wallet_address;

  if not found then
    return jsonb_build_object('error', 'User not found');
  end if;

  -- Get active punishment if any
  select * into v_active_punishment
  from user_punishments
  where wallet_address = p_wallet_address
    and is_active = true
  order by issued_at desc
  limit 1;

  -- Get punishment history (last 5)
  select jsonb_agg(
    jsonb_build_object(
      'punishment_type', punishment_type,
      'reason', reason,
      'issued_at', issued_at,
      'expires_at', expires_at,
      'is_active', is_active
    )
  ) into v_punishment_history
  from (
    select * from user_punishments
    where wallet_address = p_wallet_address
    order by issued_at desc
    limit 5
  ) recent;

  return jsonb_build_object(
    'is_banned', v_profile.is_banned,
    'is_timed_out', v_profile.is_timed_out,
    'timeout_until', v_profile.timeout_until,
    'ban_reason', v_profile.ban_reason,
    'warnings', v_profile.warnings,
    'can_post', not (v_profile.is_banned or v_profile.is_timed_out),
    'active_punishment', row_to_json(v_active_punishment),
    'punishment_history', v_punishment_history
  );
end;
$$;

-- Grant execute permissions to authenticated users
grant execute on function assign_punishment to authenticated;
grant execute on function expire_timeouts to authenticated;
grant execute on function get_user_punishment_status to authenticated;
grant execute on function assign_punishment to anon;
grant execute on function expire_timeouts to anon;
grant execute on function get_user_punishment_status to anon;
