export async function postToGroupMe(params: {
  botId: string;
  text: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.groupme.com/v3/bots/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bot_id: params.botId,
        text: params.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `GroupMe ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown GroupMe error' };
  }
}
