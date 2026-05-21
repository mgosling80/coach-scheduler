import { NextResponse } from 'next/server';

/**
 * Verify a cron request. Vercel Cron requests carry an Authorization header
 * with the CRON_SECRET as bearer token.
 */
export function verifyCron(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
