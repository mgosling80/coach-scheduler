'use server';

import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

const APPROVAL_DAYS = 14;

export async function approveStudent(approvalId: string) {
  const authed = await requireRole('coach');
  const supabase = await createClient();

  const expires = new Date();
  expires.setDate(expires.getDate() + APPROVAL_DAYS);

  // Find approval to confirm ownership
  const { data: approval } = await supabase
    .from('coach_approvals')
    .select('coach_id')
    .eq('id', approvalId)
    .maybeSingle();

  if (!approval) return { ok: false, error: 'Approval not found.' };

  // Allow coach (their own) or admin who manages this coach
  const { data: { user } } = await supabase.auth.getUser();
  const isOwnCoach = approval.coach_id === user!.id;
  const isAdmin = authed.roles.includes('admin') || authed.roles.includes('super_admin');
  if (!isOwnCoach && !isAdmin) return { ok: false, error: 'Not allowed.' };

  const { error } = await supabase
    .from('coach_approvals')
    .update({
      status: 'approved',
      decided_at: new Date().toISOString(),
      decided_by: user!.id,
      expires_at: expires.toISOString(),
    })
    .eq('id', approvalId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/coach/students');
  return { ok: true };
}

export async function declineStudent(approvalId: string, reason: string) {
  const authed = await requireRole('coach');
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  const { error } = await supabase
    .from('coach_approvals')
    .update({
      status: 'declined',
      decided_at: new Date().toISOString(),
      decided_by: user!.id,
      decline_reason: reason || null,
    })
    .eq('id', approvalId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/coach/students');
  return { ok: true };
}
