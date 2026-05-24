alter table recurring_booking_requests
  add column if not exists duration_minutes int not null default 60;
