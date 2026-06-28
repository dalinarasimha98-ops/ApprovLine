'use client';

import { useState } from 'react';

export function QueueWarningDismissible() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
      <div>
        <p className="font-bold">Background processing temporarily unavailable</p>
        <p className="mt-1 text-amber-800">
          Core onboarding and approval tracking continue to work. Queue-based ingestion will resume once Redis is configured.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setVisible(false)}
        className="min-h-0 rounded-md border border-amber-200 bg-white px-2 py-1 text-xs font-bold text-amber-800 shadow-sm hover:bg-amber-100"
      >
        Dismiss
      </button>
    </div>
  );
}
