import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { ProfileForm } from './profile-form';

export default async function CoachProfilePage() {
  const authed = await requireRole('coach');
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email, phone')
    .eq('id', authed.user.id)
    .single();

  const { data: coach } = await supabase
    .from('coach_profiles')
    .select('*')
    .eq('user_id', authed.user.id)
    .maybeSingle();

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900">My profile</h2>
        <p className="text-sm text-gray-600 mt-1">
          Public bio plus the defaults that apply to your class types and notifications.
        </p>
      </div>
      <ProfileForm
        initial={{
          full_name: profile?.full_name ?? '',
          email: profile?.email ?? '',
          phone: profile?.phone ?? '',
          bio: coach?.bio ?? '',
          photo_url: coach?.photo_url ?? '',
          groupme_bot_id: coach?.groupme_bot_id ?? '',
          default_booking_window_hours: coach?.default_booking_window_hours ?? 24,
          default_cancel_window_hours: coach?.default_cancel_window_hours ?? 6,
          default_reminder_hours: (coach?.default_reminder_hours ?? [24, 2]).join(', '),
          morning_digest_enabled: coach?.morning_digest_enabled ?? true,
          morning_digest_time: (coach?.morning_digest_time ?? '07:00:00').slice(0, 5),
        }}
      />
    </div>
  );
}
