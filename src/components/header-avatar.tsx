import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Avatar } from './avatar';

export async function HeaderAvatar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, photo_url')
    .eq('id', user.id)
    .maybeSingle();

  return (
    <Link href="/account" title="Account" className="inline-flex items-center">
      <Avatar name={profile?.full_name ?? user.email ?? '?'} photoUrl={profile?.photo_url} size={34} ring />
    </Link>
  );
}
