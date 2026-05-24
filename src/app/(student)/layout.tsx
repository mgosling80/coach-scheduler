import { createClient } from '@/lib/supabase/server';
import { StudentMobileNav } from '@/components/student-mobile-nav';
import { CoachMobileNav } from '@/components/coach-mobile-nav';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const roleSet = new Set<string>();
  if (user) {
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    (roles ?? []).forEach((r) => roleSet.add(r.role));
  }

  const isCoachOrAdmin = roleSet.has('coach') || roleSet.has('admin');
  const isStudent = roleSet.has('student') && !isCoachOrAdmin;

  return (
    <>
      <div className={(isStudent || isCoachOrAdmin) ? 'pb-20 md:pb-0' : ''}>{children}</div>
      {isStudent && <StudentMobileNav />}
      {isCoachOrAdmin && <CoachMobileNav />}
    </>
  );
}
