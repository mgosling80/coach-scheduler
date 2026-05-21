import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { ClassTypeForm } from '../class-type-form';
import { updateClassType, deleteClassType } from '../actions';

export default async function EditClassTypePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const authed = await requireRole('coach');
  const supabase = await createClient();

  const { data: ct } = await supabase
    .from('class_types')
    .select('*')
    .eq('id', id)
    .eq('coach_id', authed.user.id)
    .maybeSingle();

  if (!ct) notFound();

  const updateAction = updateClassType.bind(null, id);
  const deleteAction = deleteClassType.bind(null, id);

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900">Edit class type</h2>
      </div>
      <ClassTypeForm
        initial={{
          name: ct.name,
          description: ct.description ?? '',
          duration_minutes: ct.duration_minutes,
          capacity: ct.capacity,
          color: ct.color ?? '#3b82f6',
          booking_window_hours: ct.booking_window_hours?.toString() ?? '',
          cancel_window_hours: ct.cancel_window_hours?.toString() ?? '',
          is_active: ct.is_active,
        }}
        onSubmit={updateAction}
        onDelete={deleteAction}
      />
    </div>
  );
}
