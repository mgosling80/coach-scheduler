import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';

export type Role = 'super_admin' | 'coach' | 'admin' | 'student';

export type AuthedUser = {
  user: User;
  roles: Role[];
};

export async function getAuthedUser(): Promise<AuthedUser | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: roleRows } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id);

  const roles = (roleRows ?? []).map((r) => r.role as Role);
  return { user, roles };
}

export async function requireAuth(): Promise<AuthedUser> {
  const authed = await getAuthedUser();
  if (!authed) redirect('/login');
  return authed;
}

export async function requireRole(role: Role): Promise<AuthedUser> {
  const authed = await requireAuth();
  if (!authed.roles.includes(role) && !authed.roles.includes('super_admin')) {
    redirect('/dashboard');
  }
  return authed;
}

export function hasRole(authed: AuthedUser, role: Role): boolean {
  return authed.roles.includes(role) || authed.roles.includes('super_admin');
}
