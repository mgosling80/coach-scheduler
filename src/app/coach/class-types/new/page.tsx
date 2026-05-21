import { requireRole } from '@/lib/auth';
import { ClassTypeForm } from '../class-type-form';
import { createClassType } from '../actions';

export default async function NewClassTypePage() {
  await requireRole('coach');

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900">New class type</h2>
      </div>
      <ClassTypeForm
        initial={{
          name: '',
          description: '',
          duration_minutes: 60,
          capacity: 1,
          color: '#3b82f6',
          booking_window_hours: '',
          cancel_window_hours: '',
          is_active: true,
        }}
        onSubmit={createClassType}
      />
    </div>
  );
}
