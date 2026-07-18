import Link from 'next/link';
import type { ReactNode } from 'react';
import type { MarketingPage } from '@/lib/marketing-pages';
import styles from './EnterpriseMarketingPage.module.css';

const groupLabels = {
  solutions: 'Solutions',
  resources: 'Resources',
  company: 'Company',
};

const groupRoutes = {
  solutions: '/#systems',
  resources: '/#resources',
  company: '/#company',
};

const sourceLabels = ['Slack', 'Teams', 'Email', 'Jira', 'Zoom', 'ServiceNow'];

export function EnterpriseMarketingPage({ page, form }: { page: MarketingPage; form?: ReactNode }) {
  const liveHealth = page.slug === 'system-health';
  const primaryHref = liveHealth
    ? '/health'
    : page.slug === 'careers'
      ? 'mailto:careers@approvline.com'
      : form
        ? '#lead-form'
        : '/book-demo';

  return (
    <main className={styles.page} style={{ '--accent': page.accent } as React.CSSProperties}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': page.slug === 'careers' ? 'WebPage' : 'SoftwareApplication',
            name: page.title,
            description: page.summary,
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            provider: { '@type': 'Organization', name: 'ApprovLine', url: 'https://www.approvline.com' },
          }),
        }}
      />
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="ApprovLine home">
          <span className={styles.brandMark}>A</span>
          <span>ApprovLine</span>
        </Link>
        <nav className={styles.nav} aria-label="Marketing navigation">
          <Link href="/#platform">Platform</Link>
          <Link href="/#systems">Solutions</Link>
          <Link href="/#resources">Resources</Link>
          <Link href="/#company">Company</Link>
        </nav>
        <div className={styles.headerActions}>
          <Link href="/sign-in" className={styles.signIn}>Sign in</Link>
          <Link href="/book-demo" className={styles.headerCta}>Book demo</Link>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroGrid} aria-hidden="true" />
        <div className={styles.heroCopy}>
          <div className={styles.breadcrumb}>
            <Link href="/">Home</Link><span>/</span>
            <Link href={groupRoutes[page.group]}>{groupLabels[page.group]}</Link><span>/</span>
            <span>{page.slug.replaceAll('-', ' ')}</span>
          </div>
          <p className={styles.eyebrow}>{page.eyebrow}</p>
          <h1>{page.title}</h1>
          <p className={styles.summary}>{page.summary}</p>
          <div className={styles.heroActions}>
            <Link href={primaryHref} className={styles.primaryButton}>{page.cta}<span aria-hidden="true">→</span></Link>
            <Link href="/#platform" className={styles.secondaryButton}>Explore platform</Link>
          </div>
          <div className={styles.trustRow}>
            <span>Read-only</span><span>Tenant isolated</span><span>Audit ready</span>
          </div>
        </div>

        <div className={styles.heroVisual} aria-label="ApprovLine approval intelligence flow">
          <div className={styles.visualSources}>
            <small>Evidence sources</small>
            {sourceLabels.map((source) => <span key={source}>{source}</span>)}
          </div>
          <div className={styles.visualEngine}>
            <span className={styles.engineMark}>A</span>
            <strong>Approval<br />Intelligence</strong>
            <small>Capture · Validate · Explain</small>
          </div>
          <div className={styles.visualOutput}>
            <small>Decision record</small>
            <strong>Approval verified</strong>
            <dl>
              <div><dt>Evidence</dt><dd>Complete</dd></div>
              <div><dt>Risk</dt><dd>Low</dd></div>
              <div><dt>Policy</dt><dd>Matched</dd></div>
            </dl>
          </div>
        </div>
      </section>

      {page.metrics && (
        <section className={styles.metrics} aria-label="Key metrics">
          {page.metrics.map((metric) => (
            <div key={metric.label}><strong>{metric.value}</strong><span>{metric.label}</span></div>
          ))}
        </section>
      )}

      <section className={styles.introBand}>
        <div>
          <p className={styles.eyebrow}>Connected intelligence</p>
          <h2>From fragmented evidence to a defensible decision record.</h2>
        </div>
        <p>ApprovLine continuously connects approval evidence, identity, policy context, risk, and audit history without changing how teams work in their source systems.</p>
      </section>

      <section className={styles.capabilities}>
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>Core capabilities</p>
          <h2>Built for enterprise accountability.</h2>
        </div>
        <div className={styles.capabilityGrid}>
          {page.capabilities.map((capability, index) => (
            <article key={capability.title} className={styles.capabilityCard}>
              <span className={styles.cardIcon}>{String(index + 1).padStart(2, '0')}</span>
              <h3>{capability.title}</h3>
              <p>{capability.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.productSection}>
        <div className={styles.productPreview}>
          <div className={styles.previewTop}><span /><span /><span /><strong>ApprovLine decision timeline</strong></div>
          <div className={styles.previewBody}>
            <aside><b>Overview</b><span>Approvals</span><span>Investigations</span><span>Policies</span><span>Audit logs</span></aside>
            <div className={styles.previewContent}>
              <div className={styles.previewStats}><span><b>1,248</b> Decisions</span><span><b>96%</b> Traceable</span><span><b>18</b> Risks found</span></div>
              <div className={styles.previewTable}>
                {['Vendor onboarding', 'Budget increase', 'Security exception', 'Contract amendment'].map((label, index) => (
                  <div key={label}><strong>{label}</strong><span>{['Procurement', 'Finance', 'Security', 'Legal'][index]}</span><i>{index === 2 ? 'High risk' : 'Verified'}</i></div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className={styles.benefitCopy}>
          <p className={styles.eyebrow}>What changes</p>
          <h2>Find the answer, the evidence, and the policy in one place.</h2>
          <ul>{page.highlights.map((highlight) => <li key={highlight}><span>✓</span>{highlight}</li>)}</ul>
        </div>
      </section>

      {page.timeline && (
        <section className={styles.timelineSection}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Evidence timeline</p>
            <h2>Every step remains connected.</h2>
          </div>
          <div className={styles.timeline}>
            {page.timeline.map((event) => (
              <article key={`${event.time}-${event.title}`}><time>{event.time}</time><span className={styles.timelineDot} /><div><h3>{event.title}</h3><p>{event.detail}</p></div></article>
            ))}
          </div>
        </section>
      )}

      {form && <section className={styles.formBand} id="lead-form">{form}</section>}

      <section className={styles.faqSection}>
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>Frequently asked</p>
          <h2>Clear answers for enterprise teams.</h2>
        </div>
        <div className={styles.faqs}>
          {page.faqs.map((faq) => <details key={faq.question}><summary>{faq.question}<span>+</span></summary><p>{faq.answer}</p></details>)}
        </div>
      </section>

      <section className={styles.finalCta}>
        <p className={styles.eyebrow}>Approval intelligence, operationalized</p>
        <h2>Make every important decision provable.</h2>
        <p>See how ApprovLine connects evidence, policy, risk, and audit history across your enterprise.</p>
        <div><Link href={primaryHref} className={styles.primaryButton}>{page.cta}<span aria-hidden="true">→</span></Link><Link href="/contact" className={styles.secondaryButton}>Contact ApprovLine</Link></div>
      </section>

      <footer className={styles.footer}>
        <div><Link href="/" className={styles.brand}><span className={styles.brandMark}>A</span><span>ApprovLine</span></Link><p>The approval intelligence platform for modern enterprises.</p></div>
        <div><strong>Solutions</strong><Link href="/solutions/legal">Legal</Link><Link href="/solutions/security">Security</Link><Link href="/solutions/procurement">Procurement</Link></div>
        <div><strong>Resources</strong><Link href="/resources/trust-center">Trust Center</Link><Link href="/resources/compliance">Compliance</Link><Link href="/resources/system-health">System Health</Link></div>
        <div><strong>Company</strong><Link href="/company/about">About</Link><Link href="/company/careers">Careers</Link><Link href="/contact">Contact</Link></div>
      </footer>
    </main>
  );
}
