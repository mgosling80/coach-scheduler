-- Step 7 schema additions

-- Allow students to read class types of coaches they're approved with
-- (booking flow needs this)
drop policy if exists "anyone authed reads class types" on class_types;
create policy "anyone authed reads class types"
on class_types for select
using (auth.uid() is not null);

-- Allow students to read availability/blackouts (needed for slots view)
drop policy if exists "anyone authed reads availability" on availability_blocks;
create policy "anyone authed reads availability"
on availability_blocks for select
using (auth.uid() is not null);

-- Index for finding sessions needing reminders
create index if not exists idx_sessions_start_active
  on sessions (start_at)
  where cancelled = false;
