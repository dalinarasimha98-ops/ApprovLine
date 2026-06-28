import Link from 'next/link';
import { FriendlyClerkErrors } from '@/components/auth/FriendlyClerkErrors';

function LogoMark() {
  return (
    <span className="auth-logo-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M12 3.2 19 6v5.2c0 4.5-2.9 7.9-7 9.6-4.1-1.7-7-5.1-7-9.6V6l7-2.8Z" stroke="currentColor" strokeWidth="1.9" />
        <path d="m8.8 12 2.1 2.1 4.5-5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function AuthShell({
  cardTitle,
  cardSubtitle,
  children,
  footer,
}: {
  cardTitle: string;
  cardSubtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-copy">
          <Link href="/" className="auth-brand" aria-label="ApprovLine home">
            <LogoMark />
            <span>ApprovLine</span>
          </Link>
          <p className="auth-eyebrow">Universal Approval Intelligence</p>
          <h1 id="auth-title">Every approval. Captured. Proven.</h1>
          <p className="auth-subtitle">Transform Slack, Gmail, Teams and email approvals into a searchable audit trail.</p>
          <div className="auth-proof" aria-label="Authentication setup">
            <span>SOC 2 Ready</span>
            <span>GDPR Ready</span>
            <span>Enterprise Security</span>
            <span>AI Powered Approval Intelligence</span>
          </div>
        </div>
        <div className="auth-card">
          <div className="auth-card-head">
            <h2>{cardTitle}</h2>
            <p>{cardSubtitle}</p>
          </div>
          {children}
          <FriendlyClerkErrors />
          <p className="auth-footer">{footer}</p>
        </div>
      </section>
    </main>
  );
}
