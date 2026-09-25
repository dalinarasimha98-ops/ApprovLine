'use client';

import { useEffect, useRef } from 'react';

/**
 * Shared accessible drawer shell for customer-facing dashboard detail
 * panels (currently the Action Center; a natural home for any future
 * customer drawer). There is no Radix/shadcn/headlessui dependency in
 * this repo, so this is a small, self-contained implementation of the
 * standard WAI-ARIA dialog pattern — matching the same contract as
 * components/founder/FounderDrawer.tsx (focus-on-open, a real Tab/
 * Shift+Tab trap, Escape, focus restoration, body scroll lock), kept as
 * its own component rather than importing the Founder-only one so
 * customer-facing code never depends on Founder Console internals.
 *
 * Render an element with `id={titleId}` inside `children` so the dialog
 * has an accessible name; everything else about the drawer's layout is
 * entirely up to the caller.
 */
export type DetailDrawerSize = 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<DetailDrawerSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md lg:max-w-lg',
  lg: 'max-w-lg lg:max-w-xl',
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type DetailDrawerProps = {
  open?: boolean;
  onClose: () => void;
  titleId: string;
  descriptionId?: string;
  size?: DetailDrawerSize;
  className?: string;
  children: React.ReactNode;
};

export function DetailDrawer({ open = true, onClose, titleId, descriptionId, size = 'md', className = '', children }: DetailDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    triggerRef.current = document.activeElement;

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const focusables = () => (panel ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : []);
    const first = focusables()[0];
    (first ?? panel)?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (els.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = els[0];
      const lastEl = els[els.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousBodyOverflow;
      const trigger = triggerRef.current;
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={`absolute inset-y-0 right-0 flex w-full ${SIZE_CLASSES[size]} flex-col overflow-y-auto border-l border-al-border bg-al-surface shadow-2xl outline-none ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
