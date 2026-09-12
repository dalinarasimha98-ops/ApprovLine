'use client';

import { useEffect, useRef } from 'react';

/**
 * Shared accessible drawer shell for every Founder Console detail drawer
 * (Plans & Billing, Customer Integrations, Integration Catalog, Feature
 * Management, and the Customers list preview). There is no Radix/shadcn/
 * headlessui dependency in this repo (checked package.json), so this is a
 * small, self-contained implementation of the standard WAI-ARIA dialog
 * pattern rather than a wrapper around a third-party primitive — not a
 * competing modal framework, and not a per-module custom focus trap.
 *
 * Contract: this component owns the overlay, panel positioning/sizing,
 * ARIA wiring, and all focus/keyboard mechanics (focus-on-open, a real
 * Tab/Shift+Tab trap, Escape, and focus restoration to whatever had focus
 * before the drawer opened). It does NOT own your header/body markup —
 * exactly like Radix's Dialog.Content, it just needs to know which
 * element inside `children` is the title (and, optionally, the
 * description) so it can associate them via aria-labelledby/
 * aria-describedby. Render an element with `id={titleId}` (and
 * `id={descriptionId}` if used) somewhere in your children; everything
 * else about your drawer's visual layout (badges, subtitles, tabs,
 * footer actions) is entirely up to the caller and stays untouched.
 *
 * `open` defaults to true because every current call site already
 * conditionally mounts this component (`{selected ? <FounderDrawer>...
 * </FounderDrawer> : null}`) rather than keeping it always-mounted — the
 * prop exists for API completeness (and any future module that prefers to
 * keep the drawer always-mounted and toggle visibility itself).
 */
export type FounderDrawerSize = 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<FounderDrawerSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-[440px]',
  lg: 'max-w-[480px]',
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type FounderDrawerProps = {
  open?: boolean;
  onClose: () => void;
  titleId: string;
  descriptionId?: string;
  size?: FounderDrawerSize;
  className?: string;
  children: React.ReactNode;
};

export function FounderDrawer({ open = true, onClose, titleId, descriptionId, size = 'lg', className = '', children }: FounderDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    // Remember whatever had focus before the drawer opened (the "View"/
    // "Manage" button that triggered it) so it can be restored on close.
    triggerRef.current = document.activeElement;

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
      // Keep Tab/Shift+Tab cycling inside the drawer — the actual focus
      // trap. The background is never keyboard-reachable while this
      // listener owns Tab, regardless of what else is on the page.
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    // Capture phase so this owns Tab/Escape before any other listener
    // a module's own content might attach.
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const trigger = triggerRef.current;
      if (trigger instanceof HTMLElement) trigger.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-950/30" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={`absolute inset-y-0 right-0 flex w-full ${SIZE_CLASSES[size]} flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-2xl outline-none ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
