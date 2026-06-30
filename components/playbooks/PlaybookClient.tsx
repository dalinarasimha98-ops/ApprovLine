'use client';

import { useState } from 'react';

type PlaybookDocument = {
  id: string;
  name: string;
  fileType: string;
  status: string;
  uploadedAt: string | Date;
  lastIndexedAt: string | Date | null;
  metadata: unknown;
  _count: { chunks: number };
};

type PlaybookQuery = {
  id: string;
  question: string;
  confidence: number;
  createdAt: string | Date;
};

type Answer = {
  answer: string;
  requiredApprovers: string[];
  requiredDepartments: string[];
  policySections: Array<{ document: string; section: string; excerpt: string }>;
  evidenceMissing: string[];
  compliant: 'yes' | 'no' | 'needs_review';
  confidence: number;
};

function statusClass(status: string) {
  if (status === 'READY') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (status === 'ERROR') return 'bg-rose-50 text-rose-700 border-rose-100';
  return 'bg-amber-50 text-amber-700 border-amber-100';
}

function isDemo(metadata: unknown) {
  return Boolean(metadata && typeof metadata === 'object' && 'demo' in metadata && (metadata as { demo?: unknown }).demo);
}

export function PlaybookClient({
  initialDocuments,
  initialQueries,
}: {
  initialDocuments: PlaybookDocument[];
  initialQueries: PlaybookQuery[];
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [queries, setQueries] = useState(initialQueries);
  const [question, setQuestion] = useState('Can I approve a $50,000 vendor contract?');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshLibrary() {
    const response = await fetch('/api/playbooks');
    if (!response.ok) throw new Error('Unable to refresh playbook library.');
    const data = await response.json() as { documents: PlaybookDocument[]; recentQueries: PlaybookQuery[] };
    setDocuments(data.documents);
    setQueries(data.recentQueries);
  }

  async function upload(formData: FormData) {
    setBusy('upload');
    setError(null);
    try {
      const response = await fetch('/api/playbooks/upload', { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Upload failed.');
      await refreshLibrary();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.');
    } finally {
      setBusy(null);
    }
  }

  async function seedDemo() {
    setBusy('demo');
    setError(null);
    try {
      const response = await fetch('/api/playbooks', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Demo playbook seed failed.');
      await refreshLibrary();
    } catch (seedError) {
      setError(seedError instanceof Error ? seedError.message : 'Demo playbook seed failed.');
    } finally {
      setBusy(null);
    }
  }

  async function deleteDocument(id: string) {
    setBusy(id);
    setError(null);
    try {
      const response = await fetch(`/api/playbooks/${id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Delete failed.');
      setDocuments((current) => current.filter((document) => document.id !== id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Delete failed.');
    } finally {
      setBusy(null);
    }
  }

  async function ask() {
    setBusy('query');
    setError(null);
    try {
      const response = await fetch('/api/playbooks/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Playbook query failed.');
      setAnswer(data as Answer);
      await refreshLibrary();
    } catch (queryError) {
      setError(queryError instanceof Error ? queryError.message : 'Playbook query failed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="grid gap-6">
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-[#07111f] p-6 text-white shadow-sm sm:p-7">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-200">Playbook AI</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">Company-specific approval intelligence</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Upload internal policies and ask who needs to approve, whether a request is compliant, and which source section applies.
            </p>
          </div>
          <button
            type="button"
            onClick={seedDemo}
            disabled={busy !== null}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-[#2155d9] px-5 text-sm font-bold text-white shadow-sm shadow-blue-950/30 hover:bg-[#2f66ff] disabled:cursor-wait disabled:opacity-70"
          >
            {busy === 'demo' ? 'Creating demo...' : 'Add Demo Playbooks'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900 shadow-sm">{error}</div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-6">
          <form
            action={upload}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Upload</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">Add approval policy documents</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">Supports PDF, DOCX, TXT, and Markdown. Documents are indexed only inside this organization.</p>
            <input
              name="file"
              type="file"
              accept=".pdf,.docx,.txt,.md,.markdown"
              required
              className="mt-5 block w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-[#2155d9] file:px-3 file:py-2 file:text-sm file:font-bold file:text-white"
            />
            <button
              type="submit"
              disabled={busy !== null}
              className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-[#2155d9] px-5 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-[#1b49bd] disabled:cursor-wait disabled:opacity-70"
            >
              {busy === 'upload' ? 'Indexing...' : 'Upload and index'}
            </button>
          </form>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Library</p>
                <h3 className="mt-1 text-lg font-black text-slate-950">Playbook documents</h3>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{documents.length} docs</span>
            </div>
            <div className="mt-5 grid gap-3">
              {documents.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
                  <p className="font-black text-slate-950">No playbooks yet</p>
                  <p className="mt-1 text-sm text-slate-500">Upload a policy or add demo playbooks to try approval guidance.</p>
                </div>
              ) : documents.map((document) => (
                <div key={document.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-slate-950">
                        {document.name}
                        {isDemo(document.metadata) ? <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#2155d9]">Demo</span> : null}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {document.fileType.toUpperCase()} · {document._count.chunks} chunks · Uploaded {new Date(document.uploadedAt).toLocaleDateString()}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        Last indexed {document.lastIndexedAt ? new Date(document.lastIndexedAt).toLocaleString() : 'pending'}
                      </p>
                    </div>
                    <div className="grid justify-items-end gap-2">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${statusClass(document.status)}`}>{document.status}</span>
                      <button
                        type="button"
                        onClick={() => deleteDocument(document.id)}
                        disabled={busy !== null}
                        className="text-xs font-black text-slate-500 hover:text-rose-600 disabled:cursor-wait"
                      >
                        {busy === document.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Ask</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">Approval guidance</h3>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              className="mt-4 min-h-32 w-full rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100"
              placeholder="Who should approve this budget increase?"
            />
            <button
              type="button"
              onClick={ask}
              disabled={busy !== null || question.trim().length < 5}
              className="mt-4 inline-flex h-11 items-center justify-center rounded-lg bg-[#2155d9] px-5 text-sm font-bold text-white shadow-sm shadow-blue-200 hover:bg-[#1b49bd] disabled:cursor-wait disabled:opacity-70"
            >
              {busy === 'query' ? 'Checking policies...' : 'Ask Playbook AI'}
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Answer</p>
            {answer ? (
              <div className="mt-4 grid gap-4">
                <div className="rounded-xl bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-black text-slate-950">{answer.answer}</h3>
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-[#2155d9]">{answer.confidence}% confidence</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold capitalize text-slate-500">Compliance: {answer.compliant.replace('_', ' ')}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-100 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-500">Required approvers</p>
                    <ul className="mt-2 list-disc pl-5 text-sm font-semibold text-slate-700">
                      {answer.requiredApprovers.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                  <div className="rounded-xl border border-slate-100 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-500">Departments</p>
                    <ul className="mt-2 list-disc pl-5 text-sm font-semibold text-slate-700">
                      {answer.requiredDepartments.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-100 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">Policy sources</p>
                  <div className="mt-3 grid gap-3">
                    {answer.policySections.map((source) => (
                      <div key={`${source.document}-${source.section}`} className="rounded-lg bg-slate-50 p-3">
                        <p className="text-sm font-black text-slate-950">{source.document} · {source.section}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{source.excerpt}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-amber-700">Evidence missing</p>
                  <ul className="mt-2 list-disc pl-5 text-sm font-semibold text-amber-900">
                    {(answer.evidenceMissing.length ? answer.evidenceMissing : ['No missing evidence identified from the selected playbooks.']).map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-8 text-center">
                <p className="font-black text-slate-950">Ask a policy question</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">Playbook AI will return required approvers, departments, cited sections, confidence, and missing evidence.</p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Audit trail</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">Recent questions</h3>
            <div className="mt-4 grid gap-3">
              {queries.length === 0 ? <p className="text-sm font-semibold text-slate-500">No playbook questions asked yet.</p> : queries.map((query) => (
                <div key={query.id} className="rounded-xl bg-slate-50 p-3">
                  <p className="text-sm font-bold text-slate-800">{query.question}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{query.confidence}% confidence · {new Date(query.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
