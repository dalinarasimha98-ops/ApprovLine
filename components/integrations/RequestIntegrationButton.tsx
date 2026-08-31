'use client';

import { useState } from 'react';
import { RequestIntegrationModal } from '@/components/integrations/RequestIntegrationModal';

export function RequestIntegrationButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl bg-[#2155d9] px-4 py-2 text-sm font-black text-white shadow-sm transition hover:bg-[#1a44be]"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
        </svg>
        Request an Integration
      </button>
      <RequestIntegrationModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
