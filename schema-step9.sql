-- Add policy so admins can read student profiles via the security definer
-- (already covered, but make doubly sure)

-- Allow admins to see all recurring booking requests
drop policy if exists "admin reads all recurring" on recurring_booking_requests;
create policy "admin reads all recurring"
on recurring_booking_requests for select
using (
  has_role('super_admin')
  or exists (
    select 1 from user_roles
    where user_id = auth.uid() and role = 'admin'
  )
);

drop policy if exists "admin updates all recurring" on recurring_booking_requests;
create policy "admin updates all recurring"
on recurring_booking_requests for update
using (
  has_role('super_admin')
  or exists (
    select 1 from user_roles
    where user_id = auth.uid() and role = 'admin'
  )
);
