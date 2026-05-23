'use client';

import { useState, useTransition } from 'react';
import { saveStudentProfile } from './actions';
import { ProfilePhotoUpload } from '@/components/profile-photo-upload';

type Initial = {
  phone: string;
  age: string;
  gym: string;
  level: string;
  team: string;
  comments: string;
};

export function OnboardingForm({ fullName, photoUrl, initial }: { fullName: string; photoUrl: string; initial: Initial }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await saveStudentProfile(formData);
      if (result && !result.ok) setError(result.error ?? 'Failed.');
    });
  }

  return (
    <form action={handleSubmit} className="p-6 space-y-4">
      <ProfilePhotoUpload initialUrl={photoUrl} />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
        <input
          value={fullName}
          disabled
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-gray-100 text-gray-500"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input
            type="tel"
            name="phone"
            defaultValue={initial.phone}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Age</label>
          <input
            type="number"
            name="age"
            min="1"
            max="120"
            defaultValue={initial.age}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Gym</label>
          <input
            name="gym"
            defaultValue={initial.gym}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
          <input
            name="level"
            defaultValue={initial.level}
            placeholder="e.g. Beginner, JV, Varsity"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
          <input
            name="team"
            defaultValue={initial.team}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Comments</label>
          <textarea
            name="comments"
            rows={3}
            defaultValue={initial.comments}
            placeholder="Anything the coach should know."
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 p-2 rounded">{error}</div>}

      <button
        type="submit"
        disabled={pending}
        className="cp-btn-primary px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
      >
        {pending ? 'Saving...' : 'Save and continue'}
      </button>
    </form>
  );
}
