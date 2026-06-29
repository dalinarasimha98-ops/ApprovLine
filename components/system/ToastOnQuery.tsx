'use client';

import { useSearchParams } from 'next/navigation';

const reasonLabels: Record<string, string> = {
  access_denied: 'Connection was cancelled before authorization completed.',
  missing_oauth_code_or_state: 'OAuth did not return the required code. Please try again.',
  invalid_oauth_state: 'The install session expired. Please start again.',
  missing_workspace_token: 'The provider did not return a workspace token.',
  missing_google_account_profile: 'Google did not return an email profile.',
};

function messageFor(provider: 'slack' | 'gmail', status: string | null, reason: string | null) {
  const name = provider === 'slack' ? 'Slack' : 'Gmail';
  if (status === 'connected') return { tone: 'success', text: `${name} connected successfully.` };
  if (status === 'error') return { tone: 'error', text: reasonLabels[reason ?? ''] ?? `${name} action needs attention.` };
  return null;
}

export function ToastOnQuery() {
  const params = useSearchParams();
  const slack = messageFor('slack', params.get('slack'), params.get('reason'));
  const gmail = messageFor('gmail', params.get('gmail'), params.get('reason'));
  const approvalRecordId = params.get('approvalRecordId');
  const message = slack ?? gmail ?? (approvalRecordId ? { tone: 'success', text: 'Approval record created.' } : null);

  if (!message) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-sm rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-900 shadow-[0_20px_70px_rgba(15,23,42,0.18)]">
      <span className={message.tone === 'success' ? 'text-emerald-600' : 'text-rose-600'}>
        {message.tone === 'success' ? 'Success: ' : 'Error: '}
      </span>
      {message.text}
    </div>
  );
}
