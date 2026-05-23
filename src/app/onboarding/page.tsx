import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { OnboardingForm } from './onboarding-form';

export default async function OnboardingPage() {
  const authed = await requireAuth();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, phone, photo_url')
    .eq('id', authed.user.id)
    .single();

  const { data: student } = await supabase
    .from('student_profiles')
    .select('*')
    .eq('user_id', authed.user.id)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-[var(--cream)] py-8 px-4">
      <div className="max-w-xl mx-auto bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b border-gray-100">
          <h1 className="text-xl font-extrabold font-display text-[var(--navy-900)]">Tell us about yourself</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            This information goes to administrators reviewing your account. Once approved by a coach, you can book sessions.
          </p>
        </div>
        <OnboardingForm
          fullName={profile?.full_name ?? ''}
          photoUrl={profile?.photo_url ?? ''}
          initial={{
            phone: profile?.phone ?? '',
            age: student?.age?.toString() ?? '',
            gym: student?.gym ?? '',
            level: student?.level ?? '',
            team: student?.team ?? '',
            comments: student?.comments ?? '',
          }}
        />
      </div>
    </div>
  );
}
