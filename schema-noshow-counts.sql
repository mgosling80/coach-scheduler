-- Return a count of no_show bookings per student for a given coach.
-- security definer so the coach can see all bookings, not just their own.
create or replace function coach_student_noshow_counts(p_coach_id uuid)
returns table(
  student_id uuid,
  no_show_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select b.student_id, count(*)::int as no_show_count
  from bookings b
  join sessions s on s.id = b.session_id
  where s.coach_id = p_coach_id
    and b.status = 'no_show'
  group by b.student_id;
$$;

grant execute on function coach_student_noshow_counts(uuid) to authenticated;

-- Undo a no-show (sets back to confirmed)
create or replace function unmark_no_show(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach uuid;
begin
  select s.coach_id into v_coach
  from bookings b
  join sessions s on s.id = b.session_id
  where b.id = p_booking_id;

  if v_coach is null then raise exception 'Booking not found'; end if;
  if v_coach <> auth.uid() and not is_admin_for_coach(v_coach) then
    raise exception 'Not allowed';
  end if;

  update bookings
  set status = 'confirmed',
      marked_no_show_at = null,
      marked_no_show_by = null
  where id = p_booking_id;
end;
$$;

grant execute on function unmark_no_show(uuid) to authenticated;
