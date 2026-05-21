-- Track which reminders have fired to avoid duplicates.
create table if not exists reminders_sent (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  hours_before int not null,
  sent_at timestamptz not null default now(),
  unique (booking_id, hours_before)
);

alter table reminders_sent enable row level security;

create policy "system writes reminders" on reminders_sent for all
  to authenticated using (true) with check (true);

-- Helper RPC for cron to find upcoming sessions needing reminders.
-- Returns bookings whose session is in [now, now + max_hours] window AND no
-- reminder yet sent for the corresponding hours_before bucket.
create or replace function bookings_needing_reminders(
  p_lookahead_hours int
)
returns table(
  booking_id uuid,
  student_id uuid,
  coach_id uuid,
  class_type_id uuid,
  session_id uuid,
  start_at timestamptz,
  hours_before int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with reminder_targets as (
    -- Cross join each booking with its reminder hours
    select
      b.id as booking_id,
      b.student_id,
      s.coach_id,
      s.class_type_id,
      s.id as session_id,
      s.start_at,
      h as hours_before
    from bookings b
    join sessions s on s.id = b.session_id
    cross join lateral unnest(
      coalesce(
        (select reminder_hours from notification_preferences where user_id = b.student_id),
        array[24, 2]
      )
    ) as h
    where b.status = 'confirmed'
      and s.cancelled = false
      and s.start_at > now()
      and s.start_at <= now() + (p_lookahead_hours || ' hours')::interval
  )
  select
    rt.booking_id, rt.student_id, rt.coach_id, rt.class_type_id, rt.session_id,
    rt.start_at, rt.hours_before
  from reminder_targets rt
  where
    -- only return if we're within or past the reminder window
    rt.start_at <= now() + (rt.hours_before || ' hours')::interval
    -- and we haven't sent this specific reminder yet
    and not exists (
      select 1 from reminders_sent rs
      where rs.booking_id = rt.booking_id
        and rs.hours_before = rt.hours_before
    );
end;
$$;

grant execute on function bookings_needing_reminders(int) to authenticated, service_role;

-- Find bookings starting today (used for morning digest)
create or replace function student_bookings_today(p_student_id uuid)
returns table(
  booking_id uuid,
  session_id uuid,
  start_at timestamptz,
  coach_name text,
  class_type_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id as booking_id,
    s.id as session_id,
    s.start_at,
    p.full_name as coach_name,
    ct.name as class_type_name
  from bookings b
  join sessions s on s.id = b.session_id
  join profiles p on p.id = s.coach_id
  join class_types ct on ct.id = s.class_type_id
  where b.student_id = p_student_id
    and b.status = 'confirmed'
    and s.cancelled = false
    and s.start_at >= date_trunc('day', now())
    and s.start_at < date_trunc('day', now()) + interval '1 day'
  order by s.start_at;
$$;

grant execute on function student_bookings_today(uuid) to authenticated, service_role;

create or replace function coach_bookings_today(p_coach_id uuid)
returns table(
  booking_id uuid,
  session_id uuid,
  start_at timestamptz,
  student_name text,
  class_type_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id as booking_id,
    s.id as session_id,
    s.start_at,
    p.full_name as student_name,
    ct.name as class_type_name
  from bookings b
  join sessions s on s.id = b.session_id
  join profiles p on p.id = b.student_id
  join class_types ct on ct.id = s.class_type_id
  where s.coach_id = p_coach_id
    and b.status = 'confirmed'
    and s.cancelled = false
    and s.start_at >= date_trunc('day', now())
    and s.start_at < date_trunc('day', now()) + interval '1 day'
  order by s.start_at;
$$;

grant execute on function coach_bookings_today(uuid) to authenticated, service_role;

-- Sweep expired approvals
create or replace function expire_old_approvals()
returns int
language sql
security definer
set search_path = public
as $$
  with updated as (
    update coach_approvals
    set status = 'expired'
    where status = 'approved'
      and expires_at is not null
      and expires_at < now()
    returning 1
  )
  select count(*)::int from updated;
$$;

grant execute on function expire_old_approvals() to service_role;

-- Sweep expired waitlist offers (clears promoted_at so next eligible can be promoted manually later)
-- For now we just delete the expired offer.
create or replace function expire_old_waitlist_offers()
returns int
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from waitlist_entries
    where promoted_at is not null
      and promotion_expires_at is not null
      and promotion_expires_at < now()
    returning 1
  )
  select count(*)::int from deleted;
$$;

grant execute on function expire_old_waitlist_offers() to service_role;
