'use client';

import { useState } from 'react';
import styles from './MarketingLeadForm.module.css';

type FormKind = 'contact' | 'demo';

export function MarketingLeadForm({ kind }: { kind: FormKind }) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const isDemo = kind === 'demo';

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status !== 'idle') return;
    setStatus('sending');
    window.setTimeout(() => setStatus('sent'), 650);
  }

  if (status === 'sent') {
    return <div className={styles.success} role="status"><span>✓</span><div><h2>Thank you. We’ll be in touch.</h2><p>An ApprovLine enterprise specialist will follow up with next steps.</p></div></div>;
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.copy}>
        <p>{isDemo ? 'Enterprise demo' : 'Contact ApprovLine'}</p>
        <h2>{isDemo ? 'See approval intelligence with your workflows.' : 'Talk with the right ApprovLine team.'}</h2>
        <span>{isDemo ? 'We will tailor the conversation to your systems, policies, risks, and desired outcomes.' : 'Tell us what you are working on and we will route your request to sales, security, support, or partnerships.'}</span>
        <ul><li>30-minute focused conversation</li><li>No generic product tour</li><li>Security and architecture questions welcome</li></ul>
      </div>
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.row}><label>First name<input name="firstName" autoComplete="given-name" required /></label><label>Last name<input name="lastName" autoComplete="family-name" required /></label></div>
        <label>Work email<input type="email" name="email" autoComplete="email" placeholder="you@company.com" required /></label>
        <label>Company<input name="company" autoComplete="organization" required /></label>
        {isDemo && <><div className={styles.row}><label>Company size<select name="companySize" required defaultValue=""><option value="" disabled>Select size</option><option>1–100</option><option>101–500</option><option>501–2,000</option><option>2,001+</option></select></label><label>Industry<select name="industry" required defaultValue=""><option value="" disabled>Select industry</option><option>Technology</option><option>Financial Services</option><option>Healthcare</option><option>Manufacturing</option><option>Retail</option><option>Professional Services</option><option>Other</option></select></label></div><div className={styles.row}><label>Department<select name="department" required defaultValue=""><option value="" disabled>Select department</option><option>Legal</option><option>Security</option><option>Procurement</option><option>Finance</option><option>Compliance</option><option>Engineering</option><option>Operations</option></select></label><label>Current approval tools<input name="tools" placeholder="Slack, Teams, email…" required /></label></div><label>Primary use case<select name="interest" required defaultValue=""><option value="" disabled>Select use case</option><option>Approval Intelligence</option><option>Policy Compliance</option><option>Investigation Center</option><option>Executive Analytics</option><option>Universal Gateway</option></select></label></>}
        {!isDemo && <label>How can we help?<select name="topic" required defaultValue=""><option value="" disabled>Select a team</option><option>Sales</option><option>Security</option><option>Support</option><option>Partnerships</option></select></label>}
        <label>{isDemo ? 'What would you like to see?' : 'Message'}<textarea name="message" rows={4} required /></label>
        <button type="submit" disabled={status === 'sending'}>{status === 'sending' ? 'Sending…' : isDemo ? 'Request enterprise demo' : 'Send message'}</button>
        <small>By submitting, you agree that ApprovLine may contact you about this request.</small>
      </form>
    </div>
  );
}
