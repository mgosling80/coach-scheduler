import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { OnboardingForm } from './onboarding-form';

export default async function OnboardingPage() {
  const authed = await requireAuth();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, phone')
    .eq('id', authed.user.id)
    .single();

  const { data: student } = await supabase
    .from('student_profiles')
    .select('*')
    .eq('user_id', authed.user.id)
    .maybeSingle();

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-xl mx-auto bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-semibold text-gray-900">Tell us about yourself</h1>
          <p className="text-sm text-gray-600 mt-1">
            This information goes to administrators reviewing your account. Once approved by a coach, you can book sessions.
          </p>
        </div>
        <OnboardingForm
          fullName={profile?.full_name ?? ''}
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
