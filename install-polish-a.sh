#!/usr/bin/env bash
# install-polish-a.sh
# PWA setup, reminder cron jobs, password reset, account deletion.
# Run from project root: bash install-polish-a.sh

set -e

if [ ! -f package.json ]; then
  echo "ERROR: run this from your project root."
  exit 1
fi

mkdir -p public
mkdir -p src/app/api/cron/reminders
mkdir -p src/app/api/cron/morning-digest
mkdir -p src/app/api/cron/expire-approvals
mkdir -p src/app/api/cron/expire-waitlist-offers
mkdir -p src/app/forgot-password
mkdir -p src/app/reset-password
mkdir -p src/app/account
mkdir -p src/app/auth/callback

# ============================================================
# PWA Manifest + icons
# ============================================================
echo "Writing public/manifest.webmanifest"
cat > public/manifest.webmanifest << 'FILE_EOF'
{
  "name": "Coach Scheduler",
  "short_name": "Coach Scheduler",
  "description": "Schedule private coaching sessions",
  "start_url": "/dashboard",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2563eb",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
FILE_EOF

# Generate placeholder icons using ImageMagick if available; otherwise a simple SVG fallback
echo "Generating icon files"
cat > public/icon.svg << 'FILE_EOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#2563eb"/>
  <g fill="#ffffff" transform="translate(96 96)">
    <rect x="0" y="40" width="320" height="280" rx="20"/>
    <rect x="0" y="40" width="320" height="60" fill="#1d4ed8"/>
    <rect x="50" y="0" width="20" height="60" rx="6" fill="#ffffff"/>
    <rect x="250" y="0" width="20" height="60" rx="6" fill="#ffffff"/>
    <circle cx="80" cy="160" r="14" fill="#2563eb"/>
    <circle cx="160" cy="160" r="14" fill="#2563eb"/>
    <circle cx="240" cy="160" r="14" fill="#2563eb"/>
    <circle cx="80" cy="220" r="14" fill="#93c5fd"/>
    <circle cx="160" cy="220" r="14" fill="#2563eb"/>
    <circle cx="240" cy="220" r="14" fill="#93c5fd"/>
    <circle cx="80" cy="280" r="14" fill="#93c5fd"/>
    <circle cx="160" cy="280" r="14" fill="#93c5fd"/>
  </g>
</svg>
FILE_EOF

# Make a tiny script to rasterize if user has sharp installed; we'll use a runtime conversion
cat > scripts/generate-icons.mjs << 'FILE_EOF' 2>/dev/null || true
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icon.svg');
await sharp(svg).resize(192, 192).png().toFile('public/icon-192.png');
await sharp(svg).resize(512, 512).png().toFile('public/icon-512.png');
await sharp(svg).resize(180, 180).png().toFile('public/apple-touch-icon.png');
console.log('Icons generated.');
FILE_EOF

mkdir -p scripts
cat > scripts/generate-icons.mjs << 'FILE_EOF'
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icon.svg');
await sharp(svg).resize(192, 192).png().toFile('public/icon-192.png');
await sharp(svg).resize(512, 512).png().toFile('public/icon-512.png');
await sharp(svg).resize(180, 180).png().toFile('public/apple-touch-icon.png');
console.log('Icons generated.');
FILE_EOF

echo "Installing sharp for icon generation (one-time dev dep)"
npm install --save-dev sharp 2>&1 | tail -5

echo "Generating PNG icons from SVG"
node scripts/generate-icons.mjs

# ============================================================
# Update layout with PWA metadata + apple-touch-icon
# ============================================================
echo "Updating src/app/layout.tsx (PWA tags + manifest link)"
cat > src/app/layout.tsx << 'FILE_EOF'
import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Coach Scheduler',
  description: 'Schedule private coaching sessions',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Coach Scheduler',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
FILE_EOF

# ============================================================
# SCHEMA: cron-related additions
# ============================================================
echo "Writing schema-polish.sql"
cat > schema-polish.sql << 'FILE_EOF'
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
FILE_EOF

# ============================================================
# Service-role Supabase client (server-only)
# ============================================================
echo "Writing src/lib/supabase/admin.ts"
cat > src/lib/supabase/admin.ts << 'FILE_EOF'
import { createClient } from '@supabase/supabase-js';

// Server-side only — uses the service role key, bypasses RLS.
// MUST NOT be imported from client components.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
FILE_EOF

# ============================================================
# Cron auth helper
# ============================================================
echo "Writing src/lib/cron-auth.ts"
cat > src/lib/cron-auth.ts << 'FILE_EOF'
import { NextResponse } from 'next/server';

/**
 * Verify a cron request. Vercel Cron requests carry an Authorization header
 * with the CRON_SECRET as bearer token.
 */
export function verifyCron(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
FILE_EOF

# ============================================================
# Cron route: send reminders
# ============================================================
echo "Writing src/app/api/cron/reminders/route.ts"
cat > src/app/api/cron/reminders/route.ts << 'FILE_EOF'
import { NextResponse } from 'next/server';
import { verifyCron } from '@/lib/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/notify/email';
import { formatDateTime12 } from '@/lib/format';

export async function GET(request: Request) {
  const unauth = verifyCron(request);
  if (unauth) return unauth;

  const supabase = createAdminClient();

  // Look ahead 25 hours so we catch the 24hr reminder window
  const { data: rows, error } = await supabase.rpc('bookings_needing_reminders', {
    p_lookahead_hours: 25,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = {
    booking_id: string;
    student_id: string;
    coach_id: string;
    class_type_id: string;
    session_id: string;
    start_at: string;
    hours_before: number;
  };

  const targets = (rows as Row[]) ?? [];
  let sent = 0;
  let failed = 0;

  for (const r of targets) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', r.student_id)
      .maybeSingle();

    const { data: prefs } = await supabase
      .from('notification_preferences')
      .select('email_enabled')
      .eq('user_id', r.student_id)
      .maybeSingle();

    if (!profile?.email || prefs?.email_enabled === false) continue;

    const { data: coach } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', r.coach_id)
      .maybeSingle();

    const { data: ct } = await supabase
      .from('class_types')
      .select('name')
      .eq('id', r.class_type_id)
      .maybeSingle();

    const subject = `Reminder: ${ct?.name ?? 'session'} in ${r.hours_before}hr`;
    const body = `Reminder — your ${ct?.name ?? 'session'} with ${coach?.full_name ?? 'your coach'} is on ${formatDateTime12(r.start_at)}.`;

    const result = await sendEmail({ to: profile.email, subject, text: body });

    if (result.ok) {
      await supabase.from('reminders_sent').insert({
        booking_id: r.booking_id,
        hours_before: r.hours_before,
      });
      await supabase.from('notifications_sent').insert({
        recipient_id: r.student_id,
        channel: 'email',
        subject,
        body,
        related_booking_id: r.booking_id,
        related_session_id: r.session_id,
        delivery_status: 'sent',
      });
      sent++;
    } else {
      failed++;
    }
  }

  return NextResponse.json({ ok: true, sent, failed, candidates: targets.length });
}
FILE_EOF

# ============================================================
# Cron route: morning digest
# ============================================================
echo "Writing src/app/api/cron/morning-digest/route.ts"
cat > src/app/api/cron/morning-digest/route.ts << 'FILE_EOF'
import { NextResponse } from 'next/server';
import { verifyCron } from '@/lib/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/notify/email';
import { formatTime12 } from '@/lib/format';

// Runs every 30 minutes; sends digest at each user's configured time if they
// haven't been digested today.
export async function GET(request: Request) {
  const unauth = verifyCron(request);
  if (unauth) return unauth;

  const supabase = createAdminClient();
  const now = new Date();
  const currentTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  // Window of ±15 minutes around the user's configured digest time
  const windowStart = subtractMinutes(currentTime, 15);
  const windowEnd = addMinutes(currentTime, 15);

  // Students with digest enabled and current time in their digest window
  const { data: studentPrefs } = await supabase
    .from('notification_preferences')
    .select('user_id, day_of_digest_time')
    .eq('day_of_digest_enabled', true);

  let studentSent = 0;
  for (const pref of (studentPrefs ?? [])) {
    const digestTime = (pref.day_of_digest_time as string).slice(0, 5);
    if (!inTimeWindow(digestTime, windowStart, windowEnd)) continue;
    if (await wasSentToday(supabase, pref.user_id, 'student_digest')) continue;

    const { data: bookings } = await supabase.rpc('student_bookings_today', {
      p_student_id: pref.user_id,
    });
    type B = { start_at: string; coach_name: string; class_type_name: string };
    const list = (bookings as B[]) ?? [];
    if (list.length === 0) continue;

    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', pref.user_id)
      .maybeSingle();
    if (!profile?.email) continue;

    const lines = list.map(
      (b) => `• ${formatTime12(new Date(b.start_at).toTimeString().slice(0, 5))} — ${b.class_type_name} with ${b.coach_name}`
    );
    const subject = `Today's sessions (${list.length})`;
    const body = `Good morning${profile.full_name ? ', ' + profile.full_name.split(' ')[0] : ''}.\n\nYou have ${list.length} session${list.length === 1 ? '' : 's'} today:\n\n${lines.join('\n')}`;

    const result = await sendEmail({ to: profile.email, subject, text: body });
    if (result.ok) {
      await supabase.from('notifications_sent').insert({
        recipient_id: pref.user_id,
        channel: 'email',
        subject,
        body,
        delivery_status: 'sent',
      });
      studentSent++;
    }
  }

  // Coaches with morning digest enabled
  const { data: coachProfiles } = await supabase
    .from('coach_profiles')
    .select('user_id, morning_digest_time')
    .eq('morning_digest_enabled', true);

  let coachSent = 0;
  for (const cp of (coachProfiles ?? [])) {
    const digestTime = (cp.morning_digest_time as string).slice(0, 5);
    if (!inTimeWindow(digestTime, windowStart, windowEnd)) continue;
    if (await wasSentToday(supabase, cp.user_id, 'coach_digest')) continue;

    const { data: bookings } = await supabase.rpc('coach_bookings_today', {
      p_coach_id: cp.user_id,
    });
    type B = { start_at: string; student_name: string; class_type_name: string };
    const list = (bookings as B[]) ?? [];
    if (list.length === 0) continue;

    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', cp.user_id)
      .maybeSingle();
    if (!profile?.email) continue;

    const lines = list.map(
      (b) => `• ${formatTime12(new Date(b.start_at).toTimeString().slice(0, 5))} — ${b.class_type_name} with ${b.student_name}`
    );
    const subject = `Today's schedule (${list.length})`;
    const body = `Good morning${profile.full_name ? ', ' + profile.full_name.split(' ')[0] : ''}.\n\nYou have ${list.length} session${list.length === 1 ? '' : 's'} today:\n\n${lines.join('\n')}`;

    const result = await sendEmail({ to: profile.email, subject, text: body });
    if (result.ok) {
      await supabase.from('notifications_sent').insert({
        recipient_id: cp.user_id,
        channel: 'email',
        subject,
        body,
        delivery_status: 'sent',
      });
      coachSent++;
    }
  }

  return NextResponse.json({ ok: true, studentSent, coachSent });
}

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

function inTimeWindow(t: string, start: string, end: string): boolean {
  // Handle wraparound for early morning ranges
  if (start <= end) return t >= start && t <= end;
  return t >= start || t <= end;
}

function subtractMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m - mins;
  const ph = ((Math.floor(total / 60) % 24) + 24) % 24;
  const pm = ((total % 60) + 60) % 60;
  return `${pad(ph)}:${pad(pm)}`;
}

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  const ph = (Math.floor(total / 60) % 24 + 24) % 24;
  const pm = ((total % 60) + 60) % 60;
  return `${pad(ph)}:${pad(pm)}`;
}

type SupabaseLike = ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>;

async function wasSentToday(supabase: SupabaseLike, userId: string, kind: 'student_digest' | 'coach_digest'): Promise<boolean> {
  const subjectPrefix = kind === 'student_digest' ? "Today's sessions" : "Today's schedule";
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const { count } = await supabase
    .from('notifications_sent')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .like('subject', `${subjectPrefix}%`)
    .gte('sent_at', since.toISOString());
  return (count ?? 0) > 0;
}
FILE_EOF

# ============================================================
# Cron route: expire approvals
# ============================================================
echo "Writing src/app/api/cron/expire-approvals/route.ts"
cat > src/app/api/cron/expire-approvals/route.ts << 'FILE_EOF'
import { NextResponse } from 'next/server';
import { verifyCron } from '@/lib/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  const unauth = verifyCron(request);
  if (unauth) return unauth;

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('expire_old_approvals');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, expired: data ?? 0 });
}
FILE_EOF

# ============================================================
# Cron route: expire waitlist offers
# ============================================================
echo "Writing src/app/api/cron/expire-waitlist-offers/route.ts"
cat > src/app/api/cron/expire-waitlist-offers/route.ts << 'FILE_EOF'
import { NextResponse } from 'next/server';
import { verifyCron } from '@/lib/cron-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  const unauth = verifyCron(request);
  if (unauth) return unauth;

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('expire_old_waitlist_offers');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, expired: data ?? 0 });
}
FILE_EOF

# ============================================================
# vercel.json with cron schedule
# ============================================================
echo "Writing vercel.json"
cat > vercel.json << 'FILE_EOF'
{
  "crons": [
    { "path": "/api/cron/reminders", "schedule": "0 * * * *" },
    { "path": "/api/cron/morning-digest", "schedule": "*/30 * * * *" },
    { "path": "/api/cron/expire-approvals", "schedule": "0 3 * * *" },
    { "path": "/api/cron/expire-waitlist-offers", "schedule": "*/15 * * * *" }
  ]
}
FILE_EOF

# ============================================================
# Auth callback route for email confirmation, password reset
# ============================================================
echo "Writing src/app/auth/callback/route.ts"
cat > src/app/auth/callback/route.ts << 'FILE_EOF'
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
FILE_EOF

# ============================================================
# Forgot password page
# ============================================================
echo "Writing src/app/forgot-password/page.tsx"
cat > src/app/forgot-password/page.tsx << 'FILE_EOF'
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow p-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Reset password</h1>
        {sent ? (
          <div className="space-y-4">
            <div className="text-sm text-green-700 bg-green-50 p-3 rounded">
              If an account exists for {email}, a reset link is on its way.
            </div>
            <Link href="/login" className="text-sm text-blue-600 hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Sending...' : 'Send reset link'}
            </button>

            <p className="text-sm text-center">
              <Link href="/login" className="text-gray-600 hover:text-gray-900">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
FILE_EOF

# ============================================================
# Reset password page (after clicking link in email)
# ============================================================
echo "Writing src/app/reset-password/page.tsx"
cat > src/app/reset-password/page.tsx << 'FILE_EOF'
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow p-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Set new password</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              New password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">Minimum 8 characters.</p>
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}
FILE_EOF

# ============================================================
# Update login page to add forgot password link
# ============================================================
echo "Updating src/app/login/page.tsx (adds forgot password link)"
cat > src/app/login/page.tsx << 'FILE_EOF'
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-lg shadow p-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Sign in</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="email"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="current-password"
            />
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="mt-4 flex justify-between text-sm">
          <Link href="/forgot-password" className="text-gray-600 hover:text-gray-900">
            Forgot password?
          </Link>
          <Link href="/signup" className="text-blue-600 hover:underline">
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
FILE_EOF

# ============================================================
# Account settings page (email change, account deletion)
# ============================================================
echo "Writing src/app/account/actions.ts"
cat > src/app/account/actions.ts << 'FILE_EOF'
'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAuth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { z } from 'zod';

export async function changeEmail(formData: FormData) {
  const authed = await requireAuth();
  const supabase = await createClient();

  const newEmail = formData.get('new_email') as string;
  const parsed = z.string().email().safeParse(newEmail);
  if (!parsed.success) return { ok: false, error: 'Invalid email.' };

  const { error } = await supabase.auth.updateUser({ email: parsed.data });
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    message: `A confirmation link was sent to both ${authed.user.email} and ${parsed.data}. Click both to complete the change.`,
  };
}

export async function changePassword(formData: FormData) {
  await requireAuth();
  const supabase = await createClient();

  const newPassword = formData.get('new_password') as string;
  if (!newPassword || newPassword.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: error.message };

  return { ok: true, message: 'Password updated.' };
}

export async function deleteAccount() {
  const authed = await requireAuth();
  const adminClient = createAdminClient();

  // Soft-anonymize profile so booking history remains useful for coaches
  await adminClient
    .from('profiles')
    .update({
      full_name: 'Former user',
      email: `deleted-${authed.user.id}@example.invalid`,
      phone: null,
    })
    .eq('id', authed.user.id);

  // Delete auth user (cascades to profiles via FK)
  const { error } = await adminClient.auth.admin.deleteUser(authed.user.id);
  if (error) return { ok: false, error: error.message };

  redirect('/login');
}
FILE_EOF

echo "Writing src/app/account/page.tsx"
cat > src/app/account/page.tsx << 'FILE_EOF'
import Link from 'next/link';
import { requireAuth } from '@/lib/auth';
import { AccountClient } from './client';

export default async function AccountPage() {
  const authed = await requireAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="text-lg font-semibold text-gray-900">
            Coach Scheduler
          </Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className="text-sm text-gray-600 hover:text-gray-900">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Account</h2>
            <p className="text-sm text-gray-600 mt-1">Signed in as {authed.user.email}</p>
          </div>
          <AccountClient currentEmail={authed.user.email ?? ''} />
        </div>
      </main>
    </div>
  );
}
FILE_EOF

echo "Writing src/app/account/client.tsx"
cat > src/app/account/client.tsx << 'FILE_EOF'
'use client';

import { useState, useTransition } from 'react';
import { changeEmail, changePassword, deleteAccount } from './actions';

export function AccountClient({ currentEmail }: { currentEmail: string }) {
  const [pending, startTransition] = useTransition();
  const [emailMsg, setEmailMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pwMsg, setPwMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);

  function handleEmail(formData: FormData) {
    setEmailMsg(null);
    startTransition(async () => {
      const r = await changeEmail(formData);
      setEmailMsg(r.ok ? { kind: 'ok', text: r.message ?? 'Sent.' } : { kind: 'error', text: r.error ?? 'Failed.' });
    });
  }

  function handlePassword(formData: FormData) {
    setPwMsg(null);
    startTransition(async () => {
      const r = await changePassword(formData);
      setPwMsg(r.ok ? { kind: 'ok', text: r.message ?? 'Updated.' } : { kind: 'error', text: r.error ?? 'Failed.' });
    });
  }

  function handleDelete() {
    const ok = confirm(
      'Delete your account? Your past bookings stay on coaches\' records, but your profile will be anonymized. This cannot be undone.'
    );
    if (!ok) return;
    setDeleteMsg(null);
    startTransition(async () => {
      const r = await deleteAccount();
      if (r && !r.ok) setDeleteMsg(r.error ?? 'Failed.');
    });
  }

  return (
    <div className="p-6 space-y-8">
      <section>
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Change email</h3>
        <form action={handleEmail} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current email</label>
            <input type="email" value={currentEmail} disabled className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-gray-100 text-gray-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New email</label>
            <input type="email" name="new_email" required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {pending ? 'Sending...' : 'Send change link'}
            </button>
            {emailMsg && (
              <span className={`text-xs ${emailMsg.kind === 'ok' ? 'text-green-700' : 'text-red-700'}`}>
                {emailMsg.text}
              </span>
            )}
          </div>
        </form>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Change password</h3>
        <form action={handlePassword} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
            <input type="password" name="new_password" required minLength={8} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            <p className="mt-1 text-xs text-gray-500">Minimum 8 characters.</p>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {pending ? 'Saving...' : 'Update password'}
            </button>
            {pwMsg && (
              <span className={`text-xs ${pwMsg.kind === 'ok' ? 'text-green-700' : 'text-red-700'}`}>
                {pwMsg.text}
              </span>
            )}
          </div>
        </form>
      </section>

      <section className="pt-6 border-t border-gray-200">
        <h3 className="text-sm font-semibold text-red-700 uppercase tracking-wide mb-3">Danger zone</h3>
        <button
          onClick={handleDelete}
          disabled={pending}
          className="text-sm text-red-600 hover:text-red-700 border border-red-300 px-4 py-2 rounded-md hover:bg-red-50 disabled:opacity-50"
        >
          Delete my account
        </button>
        <p className="mt-2 text-xs text-gray-500">
          Your past bookings remain on coaches&apos; records, but your name and email are removed.
        </p>
        {deleteMsg && <div className="mt-2 text-sm text-red-700">{deleteMsg}</div>}
      </section>
    </div>
  );
}
FILE_EOF

# ============================================================
# Add Account link to dashboard
# ============================================================
echo "Patching dashboard to add Account link"
python3 - << 'PYEOF'
import re
path = 'src/app/dashboard/page.tsx'
with open(path) as f:
    content = f.read()

# Add the user/settings icon to the import line if not there
if 'Settings' not in content:
    content = content.replace(
        "import { ArrowRight, Calendar, Users, Shield, Bell }",
        "import { ArrowRight, Calendar, Users, Shield, Bell, Settings }"
    )

# Append an Account dash card after the Notification preferences card
hook = '''        <DashCard
          href="/preferences"
          icon={Bell}
          title="Notification preferences"
          description="Choose how and when we contact you."
        />'''
new_hook = hook + '''

        <DashCard
          href="/account"
          icon={Settings}
          title="Account"
          description="Change email, password, or delete account."
        />'''
content = content.replace(hook, new_hook)

with open(path, 'w') as f:
    f.write(content)
print("Patched dashboard")
PYEOF

echo ""
echo "Done. Polish A installed."
echo ""
echo "REQUIRED NEXT STEPS:"
echo "1. Run schema-polish.sql in Supabase SQL Editor"
echo "2. Get the Supabase service role key:"
echo "     Supabase dashboard -> Project Settings -> API -> service_role secret"
echo "     Add to .env.local AND to Vercel env vars as:"
echo "     SUPABASE_SERVICE_ROLE_KEY=sb_secret_..."
echo "3. Generate a CRON_SECRET (random string, 32+ chars):"
echo "     openssl rand -hex 32"
echo "     Add to .env.local AND Vercel as:"
echo "     CRON_SECRET=<the random hex string>"
echo "4. In Supabase: Authentication -> Sign In / Up -> turn email confirmation BACK ON"
echo "5. In Supabase: Authentication -> URL Configuration -> Redirect URLs:"
echo "     Add: https://coach-scheduler-drab.vercel.app/auth/callback"
echo "     Add: http://localhost:3000/auth/callback"
echo "6. Commit + push. Vercel will pick up vercel.json and activate the cron jobs."