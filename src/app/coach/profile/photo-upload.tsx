'use client';

import { useState, useTransition, useRef } from 'react';
import Image from 'next/image';
import { Upload, X, ImageIcon } from 'lucide-react';
import { uploadCoachPhoto, removeCoachPhoto } from './photo-upload-actions';

export function PhotoUpload({ initialUrl }: { initialUrl: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    const formData = new FormData();
    formData.append('photo', file);

    startTransition(async () => {
      const result = await uploadCoachPhoto(formData);
      if (result.ok && result.url) {
        // Cache-bust the URL so the new image shows immediately
        setUrl(`${result.url}?t=${Date.now()}`);
      } else {
        setError(result.error ?? 'Upload failed.');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    });
  }

  function handleRemove() {
    if (!confirm('Remove your profile photo?')) return;
    setError(null);
    startTransition(async () => {
      const result = await removeCoachPhoto();
      if (result.ok) {
        setUrl('');
      } else {
        setError(result.error ?? 'Remove failed.');
      }
    });
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">Profile photo</label>
      <div className="flex items-start gap-4">
        <div className="w-24 h-24 rounded-full bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center flex-shrink-0">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            <ImageIcon className="w-8 h-8 text-gray-400" />
          )}
        </div>

        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            <label className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">
              <Upload className="w-4 h-4" />
              {url ? 'Replace' : 'Upload'}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleFileChange}
                disabled={pending}
                className="hidden"
              />
            </label>
            {url && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={pending}
                className="inline-flex items-center gap-1 px-3 py-2 text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
                Remove
              </button>
            )}
          </div>
          <p className="text-xs text-gray-500">
            JPEG, PNG, WebP, or GIF. Max 5 MB. Square photos look best.
          </p>
          {pending && <p className="text-xs text-gray-500">Uploading...</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
