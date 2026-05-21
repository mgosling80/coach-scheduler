-- Run this in Supabase SQL Editor.

-- Add waitlist offer window setting to coach_profiles
alter table coach_profiles
  add column if not exists waitlist_offer_window_minutes int not null default 120;

-- Helper: check if user is admin for a given coach (drop and recreate in case signature changed)
create or replace function is_admin_for_coach(check_coach_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from coach_admins
    where coach_id = check_coach_id and admin_id = auth.uid()
  ) or has_role('super_admin');
$$;

-- Allow admins/super_admins to see student profiles regardless of approval state
drop policy if exists "admin reads student profiles" on student_profiles;
create policy "admin reads student profiles"
on student_profiles for select
using (
  has_role('super_admin')
  or exists (
    select 1 from user_roles
    where user_id = auth.uid() and role = 'admin'
  )
);

-- Allow admins/super_admins to read all profiles (for the admin queue)
drop policy if exists "admin reads all profiles" on profiles;
create policy "admin reads all profiles"
on profiles for select
using (
  has_role('super_admin')
  or exists (
    select 1 from user_roles
    where user_id = auth.uid() and role = 'admin'
  )
);

-- Allow admins/super_admins to read user_roles for visibility into who has what
drop policy if exists "admin reads all roles" on user_roles;
create policy "admin reads all roles"
on user_roles for select
using (
  has_role('super_admin')
  or exists (
    select 1 from user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'admin'
  )
);

-- Allow admins to create approval rows for any coach they manage
-- (existing "coach manages approvals" policy already supports this via is_admin_for_coach)

-- Auto-assign 'student' role at signup, only if user has no other role yet.
-- A super_admin or coach inserted by us won't get 'student' overwritten because
-- handle_new_user only runs once (on insert).
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );

  insert into public.notification_preferences (user_id) values (new.id);

  -- Default everyone signing up to student. Admins promote them as needed.
  insert into public.user_roles (user_id, role)
  values (new.id, 'student')
  on conflict do nothing;

  return new;
end;
$$;
