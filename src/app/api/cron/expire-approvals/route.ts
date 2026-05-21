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
