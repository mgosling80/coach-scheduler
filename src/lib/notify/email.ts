import { Resend } from 'resend';

const FROM = process.env.NOTIFY_FROM_EMAIL || 'Coach Scheduler <onboarding@resend.dev>';

let resendClient: Resend | null = null;
function client() {
  if (!resendClient) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY not set');
    resendClient = new Resend(key);
  }
  return resendClient;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  try {
    const result = await client().emails.send({
      from: FROM,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html ?? `<pre style="font-family: system-ui, sans-serif; white-space: pre-wrap;">${escapeHtml(params.text)}</pre>`,
    });
    if (result.error) return { ok: false, error: result.error.message };
    return { ok: true, id: result.data?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown email error' };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
