import twilio from 'twilio';

let twilioClient: ReturnType<typeof twilio> | null = null;
function client() {
  if (!twilioClient) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) throw new Error('TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set');
    twilioClient = twilio(sid, token);
  }
  return twilioClient;
}

/**
 * Normalize US phone numbers to E.164 (+1XXXXXXXXXX).
 * Accepts: "2148836464", "214-883-6464", "(214) 883-6464", "+12148836464", etc.
 * Returns null if it can't make sense of it.
 */
function normalizeUsPhone(raw: string): string | null {
  if (!raw) return null;
  // Strip everything but digits
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

export async function sendSms(params: {
  to: string;
  body: string;
}): Promise<{ ok: boolean; error?: string; sid?: string }> {
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!from) return { ok: false, error: 'TWILIO_PHONE_NUMBER not set' };

  const to = normalizeUsPhone(params.to);
  if (!to) return { ok: false, error: `Invalid US phone number: ${params.to}` };

  try {
    const result = await client().messages.create({
      to,
      from,
      body: params.body,
    });
    return { ok: true, sid: result.sid };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown SMS error' };
  }
}
