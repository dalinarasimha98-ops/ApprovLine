'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function CopyEvidenceLinkButton({ path, className }: { path: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      const url = `${window.location.origin}${path}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.warn('[evidence] copy link failed', error instanceof Error ? error.message : error);
    }
  };

  return (
    <button type="button" onClick={handleCopy} className={className}>
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? 'Copied' : 'Copy evidence link'}
    </button>
  );
}
