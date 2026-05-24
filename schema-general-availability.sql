-- ============================================================
-- Stage 1: general availability (decouple from class types)
-- ============================================================

-- 1. Make class_type_id nullable on availability_blocks (we stop using it).
alter table availability_blocks alter column class_type_id drop not null;

-- 2. Collapse existing per-class-type blocks into general windows.
--    Multiple class types sharing the same window become one row.
--    Strategy: keep the earliest-id row per distinct
--    (coach_id, day_of_week, start_time, end_time, effective_from, effective_until)
--    among active blocks; deactivate the rest; null out class_type_id on survivors.

with ranked as (
  select
    id,
    row_number() over (
      partition by coach_id, day_of_week, start_time, end_time, effective_from, coalesce(effective_until, '9999-12-31')
      order by id
    ) as rn
  from availability_blocks
  where is_active = true
)
update availability_blocks ab
set is_active = false
from ranked r
where ab.id = r.id and r.rn > 1;

-- Null out class_type_id on the surviving active blocks (now general).
update availability_blocks
set class_type_id = null
where is_active = true;

-- Note: we intentionally keep class_type_id as a nullable column for history.
