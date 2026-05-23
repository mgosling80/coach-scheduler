import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getBookableSlots } from '@/lib/booking';
import { ArrowLeft } from 'lucide-react';
import { SlotsClient } from './slots-client';
import { Wordmark } from '@/components/wordmark';
import { HeaderAvatar } from '@/components/header-avatar';

export default async function SlotsPage({
  params,
}: {
  params: Promise<{ coachId: string; classTypeId: string }>;
}) {
  const { coachId, classTypeId } = await params;
  const authed = await requireAuth();
  const supabase = await createClient();

  // Verify approval
  const now = new Date().toISOString();
  const { data: approval } = await supabase
    .from('coach_approvals')
    .select('status, expires_at')
    .eq('student_id', authed.user.id)
    .eq('coach_id', coachId)
    .eq('status', 'approved')
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .maybeSingle();

  if (!approval) notFound();

  const { data: classType } = await supabase
    .from('class_types')
    .select('id, coach_id, name, duration_minutes, capacity, booking_window_hours, cancel_window_hours')
    .eq('id', classTypeId)
    .eq('coach_id', coachId)
    .eq('is_active', true)
    .maybeSingle();

  if (!classType) notFound();

  const { data: coachProfile } = await supabase
    .from('coach_profiles')
    .select('default_booking_window_hours, default_cancel_window_hours')
    .eq('user_id', coachId)
    .maybeSingle();

  const defaults = {
    default_booking_window_hours: coachProfile?.default_booking_window_hours ?? 24,
    default_cancel_window_hours: coachProfile?.default_cancel_window_hours ?? 6,
  };

  // Show next 4 weeks
  const rangeStart = new Date();
  const rangeEnd = new Date();
  rangeEnd.setDate(rangeEnd.getDate() + 28);

  const slots = await getBookableSlots(
    supabase,
    classType,
    defaults,
    rangeStart,
    rangeEnd,
    authed.user.id
  );

  // Serialize Dates for the client component
  const serializedSlots = slots.map((s) => ({
    start: s.start.toISOString(),
    end: s.end.toISOString(),
    bookedCount: s.bookedCount,
    capacity: s.capacity,
    isFull: s.isFull,
    sessionId: s.sessionId,
    studentIsBooked: s.studentIsBooked,
    studentIsWaitlisted: s.studentIsWaitlisted,
  }));

  return (
    <div className="min-h-screen bg-[var(--cream)]">
      <header
        className="sticky top-0 z-30"
        style={{ background: 'linear-gradient(135deg, #2e5bd4 0%, #3d6ae8 55%, #5b8cf5 100%)' }}
      >
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Wordmark variant="light" />
          <HeaderAvatar />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <Link href={`/book/${coachId}`} className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--navy-900)] mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
        <h2 className="text-2xl font-extrabold font-display text-[var(--navy-900)] mb-1">{classType.name}</h2>
        <p className="text-sm text-[var(--muted)] mb-6">
          {classType.duration_minutes} min · {classType.capacity === 1 ? '1:1' : `Group of ${classType.capacity}`}
        </p>

        <SlotsClient
          slots={serializedSlots}
          coachId={coachId}
          classTypeId={classTypeId}
        />
      </main>
    </div>
  );
}
