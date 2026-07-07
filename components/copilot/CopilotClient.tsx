'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { CopilotAnswer, CopilotMessage } from '@/services/copilot/copilot';

type CopilotTurn = {
  id: string;
  question: string;
  answer?: CopilotAnswer;
  error?: string;
};

type CopilotClientProps = {
  suggestions: string[];
  initialQuestion?: string;
};

function badgeClass(type: string) {
  if (type === 'approval') return 'border-blue-100 bg-blue-50 text-[#2155d9]';
  if (type === 'policy') return 'border-emerald-100 bg-emerald-50 text-emerald-700';
  if (type === 'investigation') return 'border-rose-100 bg-rose-50 text-rose-700';
  if (type === 'audit_log') return 'border-amber-100 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-600';
}

function confidenceClass(confidence: number) {
  if (confidence >= 90) return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (confidence >= 75) return 'bg-blue-50 text-[#2155d9] border-blue-100';
  if (confidence >= 60) return 'bg-amber-50 text-amber-700 border-amber-100';
  return 'bg-rose-50 text-rose-700 border-rose-100';
}

function ResponseSkeleton() {
  return (
    <div className="grid min-h-[236px] content-start gap-5" aria-label="Copilot is preparing an answer">
      <div className="flex items-center justify-between gap-4">
        <div className="grid flex-1 gap-2">
          <div className="h-3 w-28 rounded-full bg-blue-100" />
          <div className="h-5 w-4/5 rounded-full bg-slate-100" />
          <div className="h-5 w-2/3 rounded-full bg-slate-100" />
        </div>
        <div className="h-8 w-28 rounded-full bg-emerald-50" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
          <div className="h-3 w-32 rounded-full bg-slate-200" />
          <div className="mt-4 grid gap-3">
            <div className="h-3 w-full rounded-full bg-slate-200" />
            <div className="h-3 w-5/6 rounded-full bg-slate-200" />
            <div className="h-3 w-3/4 rounded-full bg-slate-200" />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
          <div className="h-3 w-36 rounded-full bg-slate-200" />
          <div className="mt-4 grid gap-3">
            <div className="h-3 w-11/12 rounded-full bg-slate-200" />
            <div className="h-3 w-4/5 rounded-full bg-slate-200" />
            <div className="h-3 w-2/3 rounded-full bg-slate-200" />
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-24 rounded-2xl border border-slate-100 bg-white" />
        <div className="h-24 rounded-2xl border border-slate-100 bg-white" />
      </div>
    </div>
  );
}

export function CopilotClient({ suggestions, initialQuestion }: CopilotClientProps) {
  const [question, setQuestion] = useState(initialQuestion ?? '');
  const [turns, setTurns] = useState<CopilotTurn[]>([]);
  const [pending, setPending] = useState(false);
  const messageAreaRef = useRef<HTMLDivElement | null>(null);
  const visibleSuggestions = useMemo(() => suggestions.slice(0, 9), [suggestions]);

  const history = useMemo<CopilotMessage[]>(() => {
    return turns.flatMap((turn) => [
      { role: 'user' as const, content: turn.question },
      ...(turn.answer ? [{ role: 'assistant' as const, content: turn.answer.answer }] : []),
    ]).slice(-12);
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
      setTurns((current) => current.map((turn) => (turn.id === id ? { ...turn, answer: payload as CopilotAnswer } : turn)));
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

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
      <section className="grid h-[min(760px,calc(100vh-220px))] min-h-[620px] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="shrink-0 border-b border-slate-100 p-4 sm:p-5">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#2155d9]">Enterprise Decision Intelligence Assistant</p>
          <h2 className="mt-1.5 text-xl font-black tracking-tight text-slate-950">Ask ApprovLine anything about decisions</h2>
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500">
            Copilot searches approvals, evidence, audits, investigations, playbooks, integrations, transcripts, documents, and executive analytics.
          </p>
        </div>

        <div ref={messageAreaRef} className="min-h-0 overflow-y-auto overscroll-contain scroll-smooth p-4 sm:p-5">
          <div className="grid min-h-full content-start gap-4">
            {turns.length === 0 ? (
            <div className="grid min-h-full place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#07111f] text-white shadow-lg shadow-slate-300/60">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
                  <path d="M12 3.2 19 6v5.2c0 4.5-2.9 7.9-7 9.6-4.1-1.7-7-5.1-7-9.6V6l7-2.8Z" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M8.5 12.1h7M8.5 9.2h7M8.5 15h4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-black text-slate-950">Start with a decision question</h3>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
                Ask who approved a vendor, why a record is high risk, which approvals violate policy, or what evidence is missing.
              </p>
            </div>
            ) : null}

            {turns.map((turn) => (
            <article key={turn.id} className="grid gap-4">
              <div className="ml-auto max-w-2xl rounded-2xl bg-[#2155d9] px-4 py-3 text-sm font-bold leading-6 text-white shadow-sm shadow-blue-200">
                {turn.question}
              </div>

              <div className="min-h-[268px] max-w-4xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                {!turn.answer && !turn.error ? (
                  <ResponseSkeleton />
                ) : null}

                {turn.error ? (
                  <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm font-bold text-rose-700">
                    {turn.error}
                  </div>
                ) : null}

                {turn.answer ? (
                  <div className="grid gap-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Direct answer</p>
                        <p className="mt-2 text-base font-black leading-7 text-slate-950">{turn.answer.answer}</p>
                      </div>
                      <span className={`rounded-full border px-3 py-1.5 text-xs font-black ${confidenceClass(turn.answer.confidence)}`}>
                        {turn.answer.confidence}% confidence
                      </span>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                        <p className="text-xs font-black uppercase tracking-wide text-slate-500">Supporting evidence</p>
                        <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-700">
                          {turn.answer.supportingEvidence.map((item) => (
                            <li key={item} className="flex gap-2">
                              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2155d9]" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                        <p className="text-xs font-black uppercase tracking-wide text-slate-500">Recommended actions</p>
                        <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-700">
                          {turn.answer.recommendedActions.map((item) => (
                            <li key={item} className="flex gap-2">
                              <span className="mt-1.5 text-[#2155d9]">→</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-slate-500">Sources</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {turn.answer.sources.length > 0 ? turn.answer.sources.map((source) => (
                          <Link
                            key={`${source.type}-${source.id}`}
                            href={source.href}
                            className="min-h-[150px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${badgeClass(source.type)}`}>
                                {source.source}
                              </span>
                              <span className="text-xs font-black text-[#2155d9]">Open</span>
                            </div>
                            <p className="mt-3 font-black text-slate-950">{source.label}</p>
                            <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">{source.excerpt}</p>
                          </Link>
                        )) : (
                          <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm font-semibold text-slate-500">
                            No citation records matched yet.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </article>
            ))}
          </div>
        </div>

        <form onSubmit={onSubmit} className="shrink-0 border-t border-slate-100 p-3 sm:p-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-2 shadow-inner sm:flex-row">
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask: Which approvals violated procurement policy?"
              className="min-h-12 flex-1 rounded-xl border border-transparent bg-white px-4 text-sm font-semibold text-slate-950 outline-none ring-0 placeholder:text-slate-400 focus:border-blue-200"
              disabled={pending}
            />
            <button
              type="submit"
              disabled={pending || question.trim().length < 3}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#2155d9] px-5 text-sm font-black text-white shadow-sm shadow-blue-200 transition hover:bg-[#1b49bd] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
              {pending ? 'Thinking...' : 'Ask Copilot'}
            </button>
          </div>
        </form>
      </section>

      <aside className="grid w-full content-start gap-4 xl:sticky xl:top-28 xl:w-80">
        <div className="min-h-[360px] rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#2155d9]">Suggested questions</p>
          <div className="mt-3 grid gap-2">
            {visibleSuggestions.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => void ask(item)}
                disabled={pending}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-bold leading-5 text-slate-700 transition hover:border-blue-200 hover:bg-blue-50 hover:text-[#2155d9] disabled:cursor-wait disabled:opacity-60"
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-[230px] rounded-2xl border border-slate-200 bg-[#07111f] p-4 text-white shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-200">Copilot coverage</p>
          <div className="mt-3 grid gap-2.5 text-sm font-semibold text-slate-300">
            {['Approvals and decisions', 'Slack, Gmail, Teams, Outlook, Jira, Zoom, ServiceNow', 'Playbook AI policies', 'Investigations and audit logs', 'Executive ROI analytics', 'Universal Gateway records'].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-blue-500/20 text-xs text-blue-200">✓</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
