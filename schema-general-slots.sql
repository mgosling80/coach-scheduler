-- Sessions for a coach in a date range, with confirmed booked counts.
-- security definer so a student can see all sessions (for overlap detection)
-- without RLS hiding other students' sessions.
create or replace function coach_sessions_in_range(
  p_coach_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  id uuid,
  class_type_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  capacity int,
  booked_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    s.class_type_id,
    s.start_at,
    s.end_at,
    s.capacity,
    coalesce(count(b.id) filter (
      where b.status in ('confirmed','completed','no_show')
    ), 0) as booked_count
  from sessions s
  left join bookings b on b.session_id = s.id
  where s.coach_id = p_coach_id
    and s.cancelled = false
    and s.start_at < p_to
    and s.end_at > p_from
  group by s.id, s.class_type_id, s.start_at, s.end_at, s.capacity, s.start_at
  order by s.start_at;
$$;
