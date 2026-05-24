import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getGeneralSlots } from '@/lib/booking';
import { ArrowLeft } from 'lucide-react';
import { Wordmark } from '@/components/wordmark';
import { HeaderAvatar } from '@/components/header-avatar';
import { BookingFlow } from './booking-flow';

export default async function CoachBookingPage({
  params,
}: {
  params: Promise<{ coachId: string }>;
}) {
  const { coachId } = await params;
  const authed = await requireAuth();
  const supabase = await createClient();

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

  const { data: coach } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', coachId)
    .maybeSingle();

  const { data: classTypes } = await supabase
    .from('class_types')
    .select('id, name, description, capacity, color')
    .eq('coach_id', coachId)
    .eq('is_active', true)
    .order('name');

  const { data: coachProfile } = await supabase
    .from('coach_profiles')
    .select('default_booking_window_hours')
    .eq('user_id', coachId)
    .maybeSingle();
  const bookingWindowHours = coachProfile?.default_booking_window_hours ?? 24;

  const rangeStart = new Date();
  const rangeEnd = new Date();
  rangeEnd.setDate(rangeEnd.getDate() + 28);

  const days = await getGeneralSlots(supabase, coachId, bookingWindowHours, rangeStart, rangeEnd);

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
        <Link href="/book" className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--navy-900)] mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to coaches
        </Link>
        <h2 className="text-2xl font-extrabold font-display text-[var(--navy-900)] mb-1">
          Book with {coach?.full_name ?? 'Coach'}
        </h2>
        <p className="text-sm text-[var(--muted)] mb-6">
          Pick a time, choose how long, then the lesson type.
        </p>

        <BookingFlow
          coachId={coachId}
          days={days}
          classTypes={classTypes ?? []}
        />
      </main>
    </div>
  );
}
