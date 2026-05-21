create or replace function coach_session_bookings(p_session_id uuid)
returns table(
  booking_id uuid,
  student_id uuid,
  student_name text,
  student_email text,
  status booking_status,
  booked_at timestamptz,
  marked_no_show_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select b.id, b.student_id, p.full_name, p.email, b.status, b.booked_at, b.marked_no_show_at
  from bookings b
  join sessions s on s.id = b.session_id
  join profiles p on p.id = b.student_id
  where b.session_id = p_session_id
    and (s.coach_id = auth.uid() or is_admin_for_coach(s.coach_id))
  order by b.booked_at;
$$;

grant execute on function coach_session_bookings(uuid) to authenticated;

create or replace function coach_session_waitlist(p_session_id uuid)
returns table(
  waitlist_id uuid,
  student_id uuid,
  student_name text,
  wait_position int,
  joined_at timestamptz,
  promoted_at timestamptz,
  promotion_expires_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select w.id, w.student_id, p.full_name, w.position, w.joined_at, w.promoted_at, w.promotion_expires_at
  from waitlist_entries w
  join sessions s on s.id = w.session_id
  join profiles p on p.id = w.student_id
  where w.session_id = p_session_id
    and (s.coach_id = auth.uid() or is_admin_for_coach(s.coach_id))
  order by w.position;
$$;

grant execute on function coach_session_waitlist(uuid) to authenticated;

create or replace function mark_no_show(p_booking_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_coach uuid;
begin
  select s.coach_id into v_coach from bookings b join sessions s on s.id = b.session_id where b.id = p_booking_id;
  if v_coach is null then raise exception 'Booking not found'; end if;
  if v_coach <> auth.uid() and not is_admin_for_coach(v_coach) then raise exception 'Not allowed'; end if;
  update bookings set status = 'no_show', marked_no_show_at = now(), marked_no_show_by = auth.uid() where id = p_booking_id;
end; $$;

grant execute on function mark_no_show(uuid) to authenticated;

create or replace function mark_session_completed(p_session_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_coach uuid;
begin
  select coach_id into v_coach from sessions where id = p_session_id;
  if v_coach is null then raise exception 'Session not found'; end if;
  if v_coach <> auth.uid() and not is_admin_for_coach(v_coach) then raise exception 'Not allowed'; end if;
  update bookings set status = 'completed' where session_id = p_session_id and status = 'confirmed';
end; $$;

grant execute on function mark_session_completed(uuid) to authenticated;

create or replace function cancel_session(p_session_id uuid, p_reason text)
returns table(cancelled_booking_ids uuid[], affected_student_ids uuid[])
language plpgsql security definer set search_path = public
as $$
declare v_coach uuid; v_booking_ids uuid[]; v_student_ids uuid[];
begin
  select coach_id into v_coach from sessions where id = p_session_id;
  if v_coach is null then raise exception 'Session not found'; end if;
  if v_coach <> auth.uid() and not is_admin_for_coach(v_coach) then raise exception 'Not allowed'; end if;
  select array_agg(id), array_agg(student_id) into v_booking_ids, v_student_ids from bookings where session_id = p_session_id and status = 'confirmed';
  update bookings set status = 'cancelled_by_coach', cancelled_at = now() where session_id = p_session_id and status = 'confirmed';
  update sessions set cancelled = true, cancelled_at = now(), cancelled_reason = p_reason where id = p_session_id;
  delete from waitlist_entries where session_id = p_session_id;
  return query select coalesce(v_booking_ids, array[]::uuid[]), coalesce(v_student_ids, array[]::uuid[]);
end; $$;

grant execute on function cancel_session(uuid, text) to authenticated;
