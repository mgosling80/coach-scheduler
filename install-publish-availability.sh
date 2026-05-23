#!/usr/bin/env bash
# install-publish-availability.sh
# Adds a coach-written "Publish & notify" action on the availability page that
# broadcasts to GroupMe, with a cooldown + "last published" display.
# Run from project root: bash install-publish-availability.sh

set -e
if [ ! -f package.json ]; then echo "ERROR: run from project root."; exit 1; fi

# ============================================================
# Schema: track last publish time
# ============================================================
echo "Writing schema-publish-availability.sql"
cat > schema-publish-availability.sql << 'FILE_EOF'
alter table coach_profiles
  add column if not exists availability_last_published_at timestamptz;
FILE_EOF

# ============================================================
# Server action: publishAvailability
# ============================================================
echo "Appending publishAvailability to availability actions"
cat >> src/app/coach/availability/actions.ts << 'FILE_EOF'

const COOLDOWN_MINUTES = 5;

export async function publishAvailability(message: string) {
  const authed = await requireRole('coach');
  const supabase = await createClient();

  const text = (message ?? '').trim();
  if (!text) return { ok: false, error: 'Write a message before publishing.' };
  if (text.length > 500) return { ok: false, error: 'Message is too long (max 500 characters).' };

  const { data: coach } = await supabase
    .from('coach_profiles')
    .select('groupme_bot_id, availability_last_published_at')
    .eq('user_id', authed.user.id)
    .maybeSingle();

  if (!coach?.groupme_bot_id) {
    return { ok: false, error: 'Add a GroupMe bot ID in your profile first.' };
  }

  // Cooldown guard
  if (coach.availability_last_published_at) {
    const last = new Date(coach.availability_last_published_at).getTime();
    const elapsedMin = (Date.now() - last) / 60000;
    if (elapsedMin < COOLDOWN_MINUTES) {
      const wait = Math.ceil(COOLDOWN_MINUTES - elapsedMin);
      return { ok: false, error: `Just published. Try again in ${wait} min.` };
    }
  }

  const { postToGroupMe } = await import('@/lib/notify/groupme');
  const result = await postToGroupMe({ botId: coach.groupme_bot_id, text });
  if (!result.ok) return { ok: false, error: result.error ?? 'GroupMe post failed.' };

  const publishedAt = new Date().toISOString();
  await supabase
    .from('coach_profiles')
    .update({ availability_last_published_at: publishedAt })
    .eq('user_id', authed.user.id);

  revalidatePath('/coach/availability');
  return { ok: true, publishedAt };
}
FILE_EOF

# ============================================================
# Availability page: pass GroupMe + last-published info to client
# ============================================================
echo "Patching availability page to load publish info"
cat > src/app/coach/availability/page.tsx << 'FILE_EOF'
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { AvailabilityClient } from './availability-client';

export default async function AvailabilityPage() {
  const authed = await requireRole('coach');
  const supabase = await createClient();

  const { data: classTypes } = await supabase
    .from('class_types')
    .select('id, name, color, duration_minutes')
    .eq('coach_id', authed.user.id)
    .eq('is_active', true)
    .order('name');

  const { data: blocks } = await supabase
    .from('availability_blocks')
    .select('id, class_type_id, day_of_week, start_time, end_time, effective_from, effective_until')
    .eq('coach_id', authed.user.id)
    .eq('is_active', true)
    .order('day_of_week')
    .order('start_time');

  const { data: coach } = await supabase
    .from('coach_profiles')
    .select('groupme_bot_id, availability_last_published_at')
    .eq('user_id', authed.user.id)
    .maybeSingle();

  return (
    <AvailabilityClient
      classTypes={classTypes ?? []}
      blocks={blocks ?? []}
      hasGroupMe={!!coach?.groupme_bot_id}
      lastPublishedAt={coach?.availability_last_published_at ?? null}
    />
  );
}
FILE_EOF

# ============================================================
# Availability client: add Publish & notify UI
# ============================================================
echo "Patching availability client with Publish & notify"
python3 - << 'PYEOF'
path = 'src/app/coach/availability/availability-client.tsx'
with open(path) as f:
    c = f.read()

# 1) imports: add Megaphone icon + publishAvailability action
c = c.replace(
    "import { Plus, Trash2 } from 'lucide-react';",
    "import { Plus, Trash2, Megaphone } from 'lucide-react';"
)
c = c.replace(
    "import { createAvailabilityBlock, deleteAvailabilityBlock } from './actions';",
    "import { createAvailabilityBlock, deleteAvailabilityBlock, publishAvailability } from './actions';"
)

# 2) widen the component props
c = c.replace(
    """export function AvailabilityClient({
  classTypes,
  blocks,
}: {
  classTypes: ClassType[];
  blocks: Block[];
}) {
  const [showForm, setShowForm] = useState(false);""",
    """export function AvailabilityClient({
  classTypes,
  blocks,
  hasGroupMe,
  lastPublishedAt,
}: {
  classTypes: ClassType[];
  blocks: Block[];
  hasGroupMe: boolean;
  lastPublishedAt: string | null;
}) {
  const [showForm, setShowForm] = useState(false);"""
)

# 3) Insert the PublishBar just above the closing </div> of the main card.
#    The card ends right after the day list block. We insert before the final
#    "</div>\n  );\n}" that closes the top-level card div for the populated state.
# Simplest reliable anchor: the end of the blocksByDay map section.
anchor = """      <div className="divide-y divide-gray-100">
        {blocksByDay.map((day) => ("""
# We keep the list, but add the PublishBar right after the header/form area,
# before the day list. Insert a publish bar block right before this anchor.
publish_bar = """      <PublishBar hasGroupMe={hasGroupMe} lastPublishedAt={lastPublishedAt} />

      <div className="divide-y divide-gray-100">
        {blocksByDay.map((day) => ("""
c = c.replace(anchor, publish_bar)

# 4) Append the PublishBar component at the end of the file.
publish_component = '''

function PublishBar({
  hasGroupMe,
  lastPublishedAt,
}: {
  hasGroupMe: boolean;
  lastPublishedAt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(
    "New lesson availability is up! Head to the app to book your spots."
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<string | null>(lastPublishedAt);

  function handlePublish() {
    setError(null);
    startTransition(async () => {
      const result = await publishAvailability(message);
      if (!result.ok) {
        setError(result.error ?? 'Failed.');
      } else {
        setPublished((result as { publishedAt?: string }).publishedAt ?? new Date().toISOString());
        setOpen(false);
      }
    });
  }

  function lastPublishedLabel(iso: string): string {
    const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} hr ago`;
    return new Date(iso).toLocaleDateString();
  }

  return (
    <div className="px-6 py-4 border-b border-gray-100" style={{ background: 'rgba(240,180,41,.07)' }}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-sm font-bold font-display text-[var(--navy-900)] flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-[var(--gold-600)]" />
            Publish &amp; notify
          </h3>
          <p className="text-xs text-[var(--muted)] mt-1">
            Done editing? Send a GroupMe announcement so families know new times are open.
          </p>
          {published && (
            <p className="text-xs text-[var(--muted)] mt-1">
              Last published {lastPublishedLabel(published)}.
            </p>
          )}
        </div>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            disabled={!hasGroupMe}
            className="cp-btn-gold px-4 py-2 rounded-lg text-sm disabled:opacity-50 inline-flex items-center gap-2 flex-shrink-0"
            title={hasGroupMe ? '' : 'Add a GroupMe bot ID in your profile first'}
          >
            <Megaphone className="w-4 h-4" />
            Publish &amp; notify
          </button>
        )}
      </div>

      {!hasGroupMe && (
        <p className="text-xs text-red-600 mt-2">
          Add a GroupMe bot ID in your profile to enable announcements.
        </p>
      )}

      {open && (
        <div className="mt-3 space-y-2 bg-white rounded-lg border border-gray-200 p-3">
          <label className="block text-sm font-semibold text-[var(--navy-900)]">Announcement message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            maxLength={500}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--gold-500)]"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--muted)]">{message.length}/500</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setOpen(false)}
                className="text-sm text-[var(--muted)] hover:text-[var(--navy-900)] px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={handlePublish}
                disabled={pending}
                className="cp-btn-gold px-4 py-1.5 rounded-lg text-sm disabled:opacity-50"
              >
                {pending ? 'Publishing...' : 'Send to GroupMe'}
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
'''
c = c.rstrip() + publish_component + "\n"

with open(path, 'w') as f:
    f.write(c)
print("Patched availability client")
PYEOF

echo ""
echo "Done. Publish & notify installed."
echo "NEXT: run schema-publish-availability.sql in Supabase, then npm run build."