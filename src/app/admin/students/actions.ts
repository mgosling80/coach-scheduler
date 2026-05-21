'use server';

import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function assignStudentToCoach(studentId: string, coachId: string) {
  await requireRole('admin');
  const supabase = await createClient();

  // Create approval row (pending) for this coach. If one already exists, no-op.
  const { error } = await supabase
    .from('coach_approvals')
    .insert({
      student_id: studentId,
      coach_id: coachId,
      status: 'pending',
    });

  // Unique constraint on (coach_id, student_id) means duplicate inserts will fail.
  // That's fine — we ignore the duplicate.
  if (error && !error.message.toLowerCase().includes('duplicate')) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/admin/students');
  return { ok: true };
}

export async function removeAssignment(approvalId: string) {
  await requireRole('admin');
  const supabase = await createClient();

  const { error } = await supabase
    .from('coach_approvals')
    .delete()
    .eq('id', approvalId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/students');
  return { ok: true };
}
