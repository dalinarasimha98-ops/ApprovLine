'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { CopilotAnswer, CopilotMessage } from '@/services/copilot/copilot';

type OrgStats = {
  total: number;
  highRisk: number;
  violations: number;
  evidenceCoverage: number;
};

type CopilotTurn = {
  id: string;
  question: string;
  answer?: CopilotAnswer;
  error?: string;
};

type CopilotClientProps = {
  suggestions: string[];
  initialQuestion?: string;
  orgStats?: OrgStats;
};

function badgeClass(type: string) {
  if (type === 'approval') return 'border-teal-800 bg-teal-950 text-teal-400';
  if (type === 'policy') return 'border-emerald-800 bg-emerald-950 text-emerald-400';
  if (type === 'investigation') return 'border-rose-800 bg-rose-950 text-rose-400';
  if (type === 'audit_log') return 'border-amber-800 bg-amber-950 text-amber-400';
  return 'border-[#1E3354] bg-[#0D1B30] text-[#8BA3BE]';
}

function confidenceClass(confidence: number) {
  if (confidence >= 90) return 'bg-emerald-950 text-emerald-400 border-emerald-800';
  if (confidence >= 75) return 'bg-teal-950 text-teal-400 border-teal-800';
  if (confidence >= 60) return 'bg-amber-950 text-amber-400 border-amber-800';
  return 'bg-rose-950 text-rose-400 border-rose-800';
}

function ResponseSkeleton() {
  return (
    <div className="grid gap-4 p-4 sm:p-5" aria-label="Copilot is preparing an answer">
      <div className="flex items-center gap-3">
        <div className="h-2.5 w-24 rounded-full bg-[#1E3354] animate-pulse" />
        <div className="h-2.5 w-40 rounded-full bg-[#1E3354] animate-pulse" />
      </div>
      <div className="grid gap-2">
        <div className="h-4 w-4/5 rounded-full bg-[#1E3354] animate-pulse" />
        <div className="h-4 w-3/4 rounded-full bg-[#1E3354] animate-pulse" />
        <div className="h-4 w-2/3 rounded-full bg-[#1E3354] animate-pulse" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-24 rounded-xl border border-[#1E3354] bg-[#112240] animate-pulse" />
        <div className="h-24 rounded-xl border border-[#1E3354] bg-[#112240] animate-pulse" />
      </div>
    </div>
  );
}

const coverageItems = [
  'Approvals and decisions',
  'Slack, Gmail, Teams, Outlook, Jira, Zoom',
  'Playbook AI policies',
  'Investigations and audit logs',
  'Executive ROI analytics',
  'Universal Gateway records',
];

export function CopilotClient({ suggestions, initialQuestion, orgStats }: CopilotClientProps) {
  const [question, setQuestion] = useState(initialQuestion ?? '');
  const [turns, setTurns] = useState<CopilotTurn[]>([]);
  const [pending, setPending] = useState(false);
  const messageAreaRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const visibleSuggestions = useMemo(() => suggestions.slice(0, 9), [suggestions]);

  const history = useMemo<CopilotMessage[]>(() => {
    return turns
      .flatMap((turn) => [
        { role: 'user' as const, content: turn.question },
        ...(turn.answer ? [{ role: 'assistant' as const, content: turn.answer.answer }] : []),
      ])
      .slice(-12);
  }, [turns]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return;
    const startedAt = performance.now();
    console.info('[copilot:perf] mounted_ms', Math.round(startedAt));
    let cls = 0;
    let observer: PerformanceObserver | undefined;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const layoutShift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
          if (!layoutShift.hadRecentInput) cls += layoutShift.value ?? 0;
        }
      });
      observer.observe({ type: 'layout-shift', buffered: true });
    } catch {
      observer = undefined;
    }
    return () => {
      observer?.disconnect();
      console.info('[copilot:perf] cumulative_layout_shift', Number(cls.toFixed(4)));
    };
  }, []);

  useEffect(() => {
    const node = messageAreaRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
  }, [turns.length, pending]);

  async function ask(value: string) {
    const clean = value.trim();
    if (!clean || pending) return;
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setQuestion('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setPending(true);
    setTurns((current) => [...current, { id, question: clean }]);
    try {
      const response = await fetch('/api/copilot/query', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: clean, history }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? 'Copilot request failed.');
      if (process.env.NODE_ENV === 'development' && typeof performance !== 'undefined') {
        console.info('[copilot:perf] first_response_ms', Math.round(performance.now() - startedAt));
      }
      setTurns((current) =>
        current.map((turn) => (turn.id === id ? { ...turn, answer: payload as CopilotAnswer } : turn)),
      );
    } catch (error) {
      setTurns((current) =>
        current.map((turn) =>
          turn.id === id
            ? { ...turn, error: error instanceof Error ? error.message : 'Copilot could not answer this question.' }
            : turn,
        ),
      );
    } finally {
      setPending(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(question);
  }

  function handleTextareaInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setQuestion(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  }

  function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void ask(question);
    }
  }

  const stats = orgStats ?? { total: 0, highRisk: 0, violations: 0, evidenceCoverage: 0 };

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_272px] xl:items-start">

      {/* ── Chat column ── */}
      <section className="flex h-[min(800px,calc(100vh-200px))] min-h-[560px] min-w-0 flex-col overflow-hidden rounded-2xl border border-[#1E3354] bg-[#060C17]">

        {/* Stats strip */}
        <div className="grid shrink-0 grid-cols-4 border-b border-[#1E3354]">
          <div className="border-r border-[#1E3354] px-5 py-3.5">
            <p className="font-mono text-[9.5px] uppercase tracking-widest text-[#4A6785]">Total Approvals</p>
            <p className="mt-1 font-mono text-xl font-medium tabular-nums text-[#E8F0FE]">
              {stats.total.toLocaleString()}
            </p>
          </div>
          <div className="border-r border-[#1E3354] px-5 py-3.5">
            <p className="font-mono text-[9.5px] uppercase tracking-widest text-[#4A6785]">High Risk</p>
            <p className="mt-1 font-mono text-xl font-medium tabular-nums text-amber-400">
              {stats.highRisk.toLocaleString()}
            </p>
          </div>
          <div className="border-r border-[#1E3354] px-5 py-3.5">
            <p className="font-mono text-[9.5px] uppercase tracking-widest text-[#4A6785]">Violations</p>
            <p className="mt-1 font-mono text-xl font-medium tabular-nums text-rose-400">
              {stats.violations.toLocaleString()}
            </p>
          </div>
          <div className="px-5 py-3.5">
            <p className="font-mono text-[9.5px] uppercase tracking-widest text-[#4A6785]">Evidence Coverage</p>
            <p className="mt-1 font-mono text-xl font-medium tabular-nums text-teal-400">
              {stats.evidenceCoverage}%
            </p>
          </div>
        </div>

        {/* Chat scroll */}
        <div
          ref={messageAreaRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth p-5 [scrollbar-width:thin] [scrollbar-color:#1E3354_transparent]"
        >
          <div className="flex flex-col gap-5">

            {/* Empty / welcome state */}
            {turns.length === 0 ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-[#1E3354] bg-[#0D1B30]/40 p-8 text-center">
                <div className="grid h-11 w-11 place-items-center rounded-xl border border-teal-800/60 bg-teal-950/50 text-teal-500">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 13h2v-6h-2v6zm0-8h2V5h-2v2z" fill="currentColor" stroke="none" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[#E8F0FE]">Ask ApprovLine anything about decisions</h3>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-[#8BA3BE]">
                    Query approvals, surface risk patterns, check compliance gaps, or request an audit-ready report.
                  </p>
                </div>
              </div>
            ) : null}

            {/* Conversation turns */}
            {turns.map((turn) => (
              <article key={turn.id} className="flex flex-col gap-4">

                {/* User bubble */}
                <div className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-teal-500 px-4 py-3 text-sm font-medium leading-6 text-[#060C17]">
                    {turn.question}
                  </div>
                </div>

                {/* AI response card */}
                <div className="border-l-2 border-teal-500 bg-[#0D1B30] rounded-r-xl overflow-hidden">

                  {/* Loading skeleton */}
                  {!turn.answer && !turn.error ? <ResponseSkeleton /> : null}

                  {/* Error */}
                  {turn.error ? (
                    <div className="p-4 text-sm font-medium text-rose-400">
                      {turn.error}
                    </div>
                  ) : null}

                  {/* Answer */}
                  {turn.answer ? (
                    <div className="grid gap-0 divide-y divide-[#1E3354]">

                      {/* Answer header */}
                      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                        <div className="min-w-0">
                          <p className="font-mono text-[9.5px] uppercase tracking-widest text-teal-600">
                            Direct Answer
                          </p>
                          <p className="mt-2 font-mono text-sm leading-7 text-[#E8F0FE]">
                            {turn.answer.answer}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2.5 py-1 font-mono text-[10px] font-medium ${confidenceClass(turn.answer.confidence)}`}>
                          {turn.answer.confidence}% confidence
                        </span>
                      </div>

                      {/* Evidence + Actions */}
                      <div className="grid gap-4 px-5 py-4 lg:grid-cols-2">
                        <div>
                          <p className="font-mono text-[9.5px] uppercase tracking-widest text-[#4A6785]">
                            Supporting Evidence
                          </p>
                          <ul className="mt-3 grid gap-2 text-sm leading-6 text-[#8BA3BE]">
                            {turn.answer.supportingEvidence.map((item) => (
                              <li key={item} className="flex gap-2">
                                <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-teal-500" />
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="font-mono text-[9.5px] uppercase tracking-widest text-[#4A6785]">
                            Recommended Actions
                          </p>
                          <ul className="mt-3 grid gap-2 text-sm leading-6 text-[#8BA3BE]">
                            {turn.answer.recommendedActions.map((item) => (
                              <li key={item} className="flex gap-2">
                                <span className="mt-1 shrink-0 font-mono text-teal-500">→</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {/* Sources */}
                      {turn.answer.sources.length > 0 ? (
                        <div className="px-5 py-4">
                          <p className="font-mono text-[9.5px] uppercase tracking-widest text-[#4A6785]">
                            Sources
                          </p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            {turn.answer.sources.map((source) => (
                              <Link
                                key={`${source.type}-${source.id}`}
                                href={source.href}
                                className="group block rounded-xl border border-[#1E3354] bg-[#112240] p-4 text-sm transition hover:border-teal-800 hover:bg-[#0D1B30]"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide ${badgeClass(source.type)}`}>
                                    {source.source}
                                  </span>
                                  <span className="font-mono text-[10px] text-teal-600 group-hover:text-teal-400">
                                    Open →
                                  </span>
                                </div>
                                <p className="mt-2.5 font-medium text-[#E8F0FE]">{source.label}</p>
                                <p className="mt-1 line-clamp-2 leading-5 text-[#8BA3BE]">{source.excerpt}</p>
                              </Link>
                            ))}
                          </div>
                        </div>
                      ) : null}

                    </div>
                  ) : null}

                </div>
              </article>
            ))}

          </div>
        </div>

        {/* Input zone */}
        <form onSubmit={onSubmit} className="shrink-0 border-t border-[#1E3354] bg-[#060C17] p-4">

          {/* Suggestion chips */}
          {turns.length === 0 && visibleSuggestions.length > 0 ? (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
              {visibleSuggestions.slice(0, 4).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void ask(s)}
                  disabled={pending}
                  className="shrink-0 rounded-full border border-[#1E3354] bg-[#0D1B30] px-3 py-1.5 font-mono text-[11px] text-[#8BA3BE] transition hover:border-teal-800 hover:bg-teal-950 hover:text-teal-400 disabled:cursor-wait disabled:opacity-50"
                >
                  {s.length > 40 ? s.slice(0, 40) + '…' : s}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex items-end gap-2">
            <div className="flex flex-1 items-end gap-2 rounded-xl border border-[#1E3354] bg-[#0D1B30] px-4 py-3 transition focus-within:border-teal-800 focus-within:ring-1 focus-within:ring-teal-800/50">
              <textarea
                ref={textareaRef}
                value={question}
                onChange={handleTextareaInput}
                onKeyDown={handleTextareaKeyDown}
                placeholder="Ask about approvals, risk patterns, compliance gaps…"
                rows={1}
                disabled={pending}
                className="max-h-[120px] min-h-[20px] flex-1 resize-none bg-transparent font-mono text-sm text-[#E8F0FE] outline-none placeholder:text-[#4A6785] disabled:opacity-60"
              />
            </div>
            <button
              type="submit"
              disabled={pending || question.trim().length < 3}
              className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-teal-500 text-[#060C17] transition hover:bg-teal-400 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Send"
            >
              {pending ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M14 2L2 7l4.5 4.5M14 2L9.5 14 6.5 6.5M14 2L6.5 6.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>
          <p className="mt-2 text-center font-mono text-[10px] text-[#4A6785]">
            ⌘ Enter to send · Shift+Enter for newline · Copilot has access to your org&apos;s approval history
          </p>
        </form>

      </section>

      {/* ── Right rail ── */}
      <aside className="grid min-w-0 content-start gap-4 xl:sticky xl:top-28">

        {/* Context card */}
        {orgStats ? (
          <div className="rounded-2xl border border-teal-800/50 bg-teal-950/30 p-4">
            <p className="font-mono text-[9.5px] uppercase tracking-widest text-teal-600">Copilot Context</p>
            <div className="mt-3 grid gap-1.5">
              {[
                { label: 'Records in scope', value: stats.total.toLocaleString(), color: 'text-[#E8F0FE]' },
                { label: 'High risk', value: stats.highRisk.toLocaleString(), color: 'text-amber-400' },
                { label: 'Violations', value: stats.violations.toLocaleString(), color: 'text-rose-400' },
                { label: 'Evidence coverage', value: `${stats.evidenceCoverage}%`, color: 'text-teal-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between border-b border-[#1E3354]/50 py-1.5 last:border-0">
                  <span className="text-xs text-[#8BA3BE]">{label}</span>
                  <span className={`font-mono text-xs font-medium tabular-nums ${color}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Suggested questions */}
        <div className="overflow-hidden rounded-2xl border border-[#1E3354] bg-[#0D1B30]">
          <div className="flex items-center justify-between border-b border-[#1E3354] px-4 py-3">
            <p className="font-mono text-[9.5px] uppercase tracking-widest text-[#4A6785]">Suggested Questions</p>
            <span className="rounded-full bg-[#112240] px-2 py-0.5 font-mono text-[10px] text-[#8BA3BE]">
              {visibleSuggestions.length}
            </span>
          </div>
          <div className="grid max-h-[420px] gap-1.5 overflow-y-auto p-3 [scrollbar-width:thin] [scrollbar-color:#1E3354_transparent]">
            {visibleSuggestions.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => void ask(item)}
                disabled={pending}
                className="group w-full rounded-xl border border-[#1E3354] bg-[#060C17]/50 px-3 py-2.5 text-left text-xs font-medium leading-5 text-[#8BA3BE] transition hover:border-teal-800 hover:bg-teal-950/30 hover:text-teal-400 disabled:cursor-wait disabled:opacity-50"
              >
                <span className="block whitespace-normal break-words">{item}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Coverage */}
        <div className="overflow-hidden rounded-2xl border border-[#1E3354] bg-[#0D1B30]">
          <div className="border-b border-[#1E3354] px-4 py-3">
            <p className="font-mono text-[9.5px] uppercase tracking-widest text-[#4A6785]">Copilot Coverage</p>
          </div>
          <div className="grid gap-1.5 p-3">
            {coverageItems.map((item) => (
              <div key={item} className="flex items-center gap-2.5 rounded-lg border border-[#1E3354] bg-[#060C17]/40 px-3 py-2">
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-emerald-950 text-emerald-500 ring-1 ring-emerald-800">
                  <svg viewBox="0 0 16 16" className="h-2.5 w-2.5" fill="none" aria-hidden="true">
                    <path d="M3 8.5L6.5 12 13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="text-xs leading-5 text-[#8BA3BE]">{item}</span>
              </div>
            ))}
          </div>
        </div>

      </aside>
    </div>
  );
}
