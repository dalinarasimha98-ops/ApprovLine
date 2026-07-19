import Link from 'next/link';
import styles from './LandingPage.module.css';

const businessSources = [
  { name: 'Slack', mark: 'S', tone: 'purple' },
  { name: 'Microsoft Teams', mark: 'T', tone: 'indigo' },
  { name: 'Outlook', mark: 'O', tone: 'blue' },
  { name: 'Gmail', mark: 'G', tone: 'red' },
  { name: 'Zoom', mark: 'Z', tone: 'cyan' },
];

const engineeringSources = [
  { name: 'GitHub', mark: 'GH', tone: 'slate' },
  { name: 'GitLab', mark: 'GL', tone: 'orange' },
  { name: 'Azure DevOps', mark: 'AZ', tone: 'blue' },
  { name: 'Jenkins', mark: 'JK', tone: 'red' },
  { name: 'Kubernetes', mark: 'K8', tone: 'royal' },
  { name: 'Jira', mark: 'J', tone: 'royal' },
  { name: 'ServiceNow', mark: 'N', tone: 'green' },
];

const sources = [...businessSources, ...engineeringSources];

const intelligenceLayers = [
  { name: 'Playbook AI', icon: 'PB' },
  { name: 'Investigation Center', icon: 'IC' },
  { name: 'Enterprise Memory Graph', icon: 'MG' },
  { name: 'Executive Analytics', icon: 'EA' },
  { name: 'AI Copilot', icon: 'AI' },
  { name: 'Universal Approval Gateway', icon: 'UG' },
];

const engineeringUseCases = [
  ['DA', 'Deployment Approval Intelligence', 'Capture release decisions, sign-offs, conditions, and owners across the deployment lifecycle.'],
  ['CM', 'Change Management Visibility', 'Connect infrastructure and application changes to the people, evidence, and policies that authorized them.'],
  ['PR', 'Pull Request Decision Tracking', 'Preserve review approvals, requested changes, merge decisions, and engineering accountability.'],
  ['IG', 'Infrastructure Governance', 'Create an auditable record for cloud, Kubernetes, network, and privileged infrastructure decisions.'],
  ['SE', 'Security Exception Tracking', 'Track accepted risk, compensating controls, expiration dates, and required security approvers.'],
  ['RA', 'Production Release Audit Trail', 'Link release approvals, change tickets, incidents, and deployment evidence in one timeline.'],
];

const systems = [
  {
    title: 'Approval Intelligence',
    copy: 'Detect approvals automatically across every enterprise channel.',
    href: '/approvals',
    visual: 'approval',
  },
  {
    title: 'Playbook AI',
    copy: 'Validate every decision against company policy and playbooks.',
    href: '/playbooks',
    visual: 'playbook',
  },
  {
    title: 'Investigation Center',
    copy: 'Investigate high-risk decisions with all context in one place.',
    href: '/investigations',
    visual: 'investigation',
  },
  {
    title: 'Memory Graph',
    copy: 'Connect people, approvals, vendors, contracts, and risks.',
    href: '/memory',
    visual: 'memory',
  },
  {
    title: 'AI Copilot',
    copy: 'Ask questions, get evidence, and make better decisions faster.',
    href: '/copilot',
    visual: 'copilot',
  },
  {
    title: 'Universal Gateway',
    copy: 'Capture approvals from any system with one universal gateway.',
    href: '/dashboard/gateway',
    visual: 'gateway',
  },
];

const trustItems = [
  ['Read-Only Access', 'We never take action. Always read-only, always safe.'],
  ['SSO & Identity', 'Enterprise SSO with Microsoft, Okta, Google, and SAML.'],
  ['Tenant Isolation', 'Data isolation for every organization and workspace.'],
  ['Audit Logging', 'A complete log for every action, change, and event.'],
  ['Encryption', 'Data encrypted in transit and at rest.'],
  ['99.9% Reliability', 'Operational readiness for enterprise workloads.'],
];

const pricing = [
  {
    name: 'Starter',
    price: '$199',
    cadence: '/month',
    note: 'For focused teams building a reliable approval record.',
    features: ['Up to 10 users', '2 connected systems', 'AI approval classification', 'Searchable approval timeline', 'CSV exports', 'Standard support'],
    cta: 'Start Free Trial',
    href: '/get-started',
  },
  {
    name: 'Growth',
    price: '$499',
    cadence: '/month',
    note: 'For organizations operationalizing approval intelligence.',
    features: ['Up to 50 users', '8 connected systems', 'Playbook AI compliance', 'Investigation Center', 'Executive analytics', 'Priority support'],
    cta: 'Book Demo',
    href: '/book-demo',
    featured: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    cadence: 'Pricing',
    note: 'For regulated enterprises with complex governance.',
    features: ['Unlimited users and systems', 'Enterprise Memory Graph', 'Advanced AI Copilot', 'SSO and identity controls', 'Custom retention and integrations', 'Dedicated success and SLA'],
    cta: 'Contact Sales',
    href: 'mailto:sales@approvline.com',
  },
];

const pricingTrust = [
  'Enterprise-grade encryption',
  'Tenant isolation',
  'Complete audit logging',
  'SOC 2-ready architecture',
  'No hidden fees',
  'Cancel anytime for Starter & Growth',
];

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={compact ? styles.brandMarkCompact : styles.brandMark} aria-hidden="true">
      <span />
      <span />
    </span>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return <p className={styles.sectionEyebrow}>{children}</p>;
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path d="M3 9h11M10 5l4 4-4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <path d="m4 9 3 3 7-7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArchitectureVisual() {
  const sourceGroups = [
    { label: 'Business systems', items: businessSources },
    { label: 'Engineering systems', items: engineeringSources },
  ];

  return (
    <div className={styles.architecture} aria-label="ApprovLine approval intelligence architecture">
      <div className={styles.archGrid} aria-hidden="true" />
      <section className={styles.sourcePanel}>
        <span className={styles.panelLabel}>Enterprise Sources</span>
        {sourceGroups.map((group) => (
          <div className={styles.sourceGroup} key={group.label}>
            <b>{group.label}</b>
            {group.items.map((source) => (
              <div className={styles.sourceRow} key={source.name}>
                <span className={`${styles.sourceMark} ${styles[source.tone]}`}>{source.mark}</span>
                <span>{source.name}</span>
                <i />
              </div>
            ))}
          </div>
        ))}
      </section>

      <div className={styles.engineWrap}>
        <div className={styles.enginePulse} />
        <div className={styles.engineCard}>
          <BrandMark />
          <strong>Approval<br />Intelligence<br />Engine</strong>
        </div>
      </div>

      <section className={styles.layerPanel}>
        <span className={styles.panelLabel}>Intelligence Layer</span>
        {intelligenceLayers.map((layer, index) => (
          <div className={styles.layerRow} key={layer.name} style={{ '--row': index } as React.CSSProperties}>
            <i />
            <span className={styles.layerIcon}>{layer.icon}</span>
            <span>{layer.name}</span>
          </div>
        ))}
      </section>

      <svg className={styles.archLines} viewBox="0 0 620 520" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="sourceLine" x1="0" x2="1">
            <stop stopColor="#2089ff" />
            <stop offset="1" stopColor="#8a5cff" />
          </linearGradient>
          <linearGradient id="layerLine" x1="0" x2="1">
            <stop stopColor="#8a5cff" />
            <stop offset="1" stopColor="#5d8cff" />
          </linearGradient>
        </defs>
        {[56, 86, 116, 146, 176, 236, 266, 296, 326, 356, 386, 416].map((y, index) => (
          <path key={`s-${y}`} d={`M144 ${y} C210 ${y}, 195 ${160 + index * 18}, 266 ${160 + index * 18}`} stroke="url(#sourceLine)" />
        ))}
        {[86, 156, 226, 296, 366, 436].map((y, index) => (
          <path key={`l-${y}`} d={`M354 ${155 + index * 42} C430 ${155 + index * 42}, 410 ${y}, 478 ${y}`} stroke="url(#layerLine)" />
        ))}
      </svg>
    </div>
  );
}

function ProductMiniVisual({ type }: { type: string }) {
  if (type === 'memory') {
    return (
      <div className={`${styles.productMini} ${styles.miniGraph}`} aria-hidden="true">
        <span className={styles.graphCenter}>M</span>
        {['V', 'C', 'A', 'P', 'R'].map((label, index) => (
          <span key={label} className={styles.graphNode} style={{ '--node': index } as React.CSSProperties}>{label}</span>
        ))}
      </div>
    );
  }

  if (type === 'copilot') {
    return (
      <div className={`${styles.productMini} ${styles.miniCopilot}`} aria-hidden="true">
        <span>Who approved Vendor Alpha?</span>
        <i />
        <i />
        <b>3 verified sources</b>
      </div>
    );
  }

  if (type === 'gateway') {
    return (
      <div className={`${styles.productMini} ${styles.miniGateway}`} aria-hidden="true">
        <div><span>POST</span><i /></div>
        <div><span>CSV</span><i /></div>
        <div><span>DOC</span><i /></div>
      </div>
    );
  }

  if (type === 'investigation') {
    return (
      <div className={`${styles.productMini} ${styles.miniInvestigation}`} aria-hidden="true">
        <div><i /><span /></div>
        <div><i /><span /></div>
        <div><i /><span /></div>
        <b>High risk</b>
      </div>
    );
  }

  if (type === 'playbook') {
    return (
      <div className={`${styles.productMini} ${styles.miniPlaybook}`} aria-hidden="true">
        <div><span>Procurement Policy</span><b>96%</b></div>
        <div><span>Legal Review</span><b>Ready</b></div>
        <div><span>Security Standard</span><b>92%</b></div>
      </div>
    );
  }

  return (
    <div className={`${styles.productMini} ${styles.miniApproval}`} aria-hidden="true">
      <div><span>Captured</span><b>24,531</b></div>
      <div className={styles.miniBars}><i /><i /><i /><i /><i /></div>
      <small>+12.4% this month</small>
    </div>
  );
}

function DashboardPreview() {
  const approvals = [
    ['Vendor onboarding - Acme Corp', 'Sarah Johnson', 'Slack', 'Medium', '2m ago'],
    ['Contract renewal - Globex', 'Mike Chen', 'Email', 'Low', '15m ago'],
    ['Budget increase - Project Phoenix', 'Priya Patel', 'Teams', 'High', '31m ago'],
    ['Access request - New system', 'David Kim', 'Jira', 'Low', '45m ago'],
    ['Policy exception - Marketing', 'Lisa Thompson', 'Slack', 'Medium', '1h ago'],
  ];

  return (
    <div className={styles.dashboardPreview}>
      <aside className={styles.previewSidebar}>
        <div className={styles.previewLogo}><BrandMark compact /><span>ApprovLine</span></div>
        {['Overview', 'Approvals', 'Playbook AI', 'Investigations', 'Memory Graph', 'AI Copilot', 'Reports', 'Settings'].map((item, index) => (
          <span className={index === 0 ? styles.previewActive : ''} key={item}><i />{item}</span>
        ))}
        <div className={styles.previewUser}><b>JC</b><span>Jane Cooper<small>Admin</small></span></div>
      </aside>
      <main className={styles.previewMain}>
        <div className={styles.previewTopbar}>
          <div><small>Approval Intelligence</small><strong>Overview</strong></div>
          <div className={styles.previewTopActions}><span>⌕</span><span>◐</span><b>JC</b></div>
        </div>
        <div className={styles.kpiGrid}>
          {[
            ['Approvals Captured', '24,531', '+12.4%'],
            ['Missing Sign-Offs', '312', '+8.1%'],
            ['Policy Violations', '128', '-3.2%'],
            ['Risks Detected', '78', '+5.4%'],
          ].map(([label, value, trend]) => (
            <div key={label}><span>{label}</span><strong>{value}</strong><small>{trend}</small></div>
          ))}
        </div>
        <section className={styles.approvalTablePreview}>
          <div className={styles.tableTitle}><strong>Recent Approvals</strong><span>View all</span></div>
          <div className={styles.tableHead}><span>Approval</span><span>Approver</span><span>Source</span><span>Risk</span><span>Time</span></div>
          {approvals.map((approval) => (
            <div className={styles.tableRow} key={approval[0]}>
              <span>{approval[0]}</span><span>{approval[1]}</span><span>{approval[2]}</span>
              <span className={approval[3] === 'High' ? styles.riskHigh : approval[3] === 'Medium' ? styles.riskMedium : styles.riskLow}>{approval[3]}</span>
              <span>{approval[4]}</span>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className={styles.page}>
      <header className={styles.siteHeader}>
        <div className={styles.navShell}>
          <Link className={styles.brand} href="/" aria-label="ApprovLine home">
            <BrandMark />
            <span>ApprovLine</span>
          </Link>
          <nav className={styles.mainNav} aria-label="Primary navigation">
            <a href="#platform">Platform <span>⌄</span></a>
            <a href="#systems">Solutions <span>⌄</span></a>
            <a href="#resources">Resources <span>⌄</span></a>
            <a href="#company">Company <span>⌄</span></a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div className={styles.navActions}>
            <Link className={styles.signIn} href="/sign-in">Sign In</Link>
            <Link className={styles.outlineButton} href="/get-started">Start Pilot</Link>
            <Link className={styles.primaryButton} href="/book-demo">Book Demo</Link>
            <details className={styles.mobileMenu}>
              <summary aria-label="Open navigation menu">
                <span aria-hidden="true" />
                <span aria-hidden="true" />
                <span aria-hidden="true" />
              </summary>
              <nav aria-label="Mobile navigation">
                <a href="#platform">Platform</a>
                <a href="#systems">Solutions</a>
                <a href="#resources">Resources</a>
                <a href="#company">Company</a>
                <a href="#pricing">Pricing</a>
                <Link href="/sign-in">Sign In</Link>
                <Link href="/get-started">Start Pilot</Link>
                <Link href="/book-demo">Book Demo</Link>
              </nav>
            </details>
          </div>
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroGlow} aria-hidden="true" />
          <div className={styles.heroShell}>
            <div className={styles.heroCopy}>
              <SectionEyebrow>The Approval Intelligence Platform</SectionEyebrow>
              <h1>Every Approval.<br />Every Decision.<br /><em>One Source of Truth.</em></h1>
              <p>Capture, understand, and explain approvals across business and engineering. ApprovLine connects vendor decisions and contract sign-offs with infrastructure changes, production deployments, pull request reviews, security exceptions, and release approvals in one audit-ready intelligence layer.</p>
              <div className={styles.heroSignals} aria-label="Approval intelligence coverage">
                <span><b>Business</b> Vendor, finance, procurement, and contract approvals</span>
                <span><b>Engineering</b> Deployments, change requests, releases, and architecture reviews</span>
              </div>
              <div className={styles.heroActions}>
                <Link className={styles.primaryButtonLarge} href="/book-demo">Book Enterprise Demo <ArrowIcon /></Link>
                <a className={styles.outlineButtonLarge} href="#platform">Explore Platform <ArrowIcon /></a>
              </div>
              <div className={styles.heroTrust}>
                {['SOC 2 Ready', 'ISO 27001 Aligned', 'GDPR Ready', 'Enterprise Security'].map((item) => (
                  <span key={item}><i><CheckIcon /></i>{item}</span>
                ))}
              </div>
            </div>
            <ArchitectureVisual />
          </div>
        </section>

        <section className={styles.logoWall} aria-label="Trusted by enterprise teams">
          <span className={styles.logoWallLabel}>Built for enterprise teams</span>
          <div>
            {['Legal', 'Security', 'Procurement', 'Finance', 'Compliance', 'Engineering', 'Operations'].map((team) => <strong key={team}>{team}</strong>)}
          </div>
        </section>

        <section className={styles.problemSection} id="platform">
          <div className={styles.sectionShell}>
            <div className={styles.sectionHeading}>
              <SectionEyebrow>The Enterprise Blind Spot</SectionEyebrow>
              <h2>Approvals are everywhere.<br />Accountability is nowhere.</h2>
              <p>Most enterprise decisions happen outside formal workflows. When scrutiny arrives, teams spend days reconstructing who approved what.</p>
            </div>
            <div className={styles.problemSplit}>
              <div className={styles.disconnectedPanel}>
                <div className={styles.panelTop}><span>Disconnected activity</span><b>6 sources</b></div>
                {[
                  ['Slack', 'Looks good. Move forward.', '12:42'],
                  ['Teams', 'Finance has signed off.', '13:18'],
                  ['Email', 'Approved subject to legal review.', '14:06'],
                  ['Zoom', 'Let us proceed with the vendor.', '15:31'],
                  ['Jira', 'Status changed to Approved', '16:02'],
                ].map(([source, message, time], index) => (
                  <div className={styles.messageFragment} key={source}>
                    <span className={`${styles.sourceMark} ${styles[['purple', 'indigo', 'red', 'cyan', 'royal'][index]]}`}>{source[0]}</span>
                    <div><b>{source}</b><p>{message}</p></div><small>{time}</small>
                  </div>
                ))}
                <div className={styles.disconnectedLabel}>No shared context. No audit trail.</div>
              </div>
              <div className={styles.unifiedTimeline}>
                <div className={styles.panelTop}><span>ApprovLine unified timeline</span><b className={styles.liveBadge}>Live</b></div>
                {[
                  ['Request created', 'Vendor Alpha onboarding', '09:14'],
                  ['Finance approved', 'Priya Patel · Microsoft Teams', '13:18'],
                  ['Legal condition added', 'Contract terms · Outlook', '14:06'],
                  ['Decision validated', 'PROC-3.2 · 96% confidence', '14:07'],
                  ['Audit evidence ready', 'Complete approval chain', '14:08'],
                ].map(([title, note, time], index) => (
                  <div className={styles.timelineRow} key={title}>
                    <i className={index === 4 ? styles.timelineDone : ''} />
                    <div><b>{title}</b><p>{note}</p></div><small>{time}</small>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.processSection}>
          <div className={styles.sectionShell}>
            <div className={styles.centerHeading}>
              <SectionEyebrow>How Intelligence Is Built</SectionEyebrow>
              <h2>The Approval Intelligence Platform</h2>
              <p>One continuous system turns fragmented activity into connected, explainable enterprise intelligence.</p>
            </div>
            <div className={styles.processGrid}>
              {[
                ['01', 'Capture', 'Collect approvals from communication systems, tickets, meetings, contracts, and documents.'],
                ['02', 'Understand', 'AI identifies approvals, rejections, conditions, risk, approvers, and policy context.'],
                ['03', 'Connect', 'Memory Graph links decisions, contracts, vendors, investigations, policies, and evidence.'],
                ['04', 'Explain', 'Copilot answers questions and produces audit-ready evidence instantly.'],
              ].map(([number, title, copy]) => (
                <article key={number}>
                  <div className={styles.processIcon}><span>{number}</span><i /></div>
                  <h3>{title}</h3><p>{copy}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.engineeringSection} id="engineering">
          <div className={styles.sectionShell}>
            <div className={styles.engineeringHeader}>
              <div>
                <SectionEyebrow>Engineering Approval Intelligence</SectionEyebrow>
                <h2>Built for modern engineering organizations.</h2>
              </div>
              <p>Engineering decisions carry operational, security, and compliance risk. ApprovLine connects the approval evidence behind every production change without forcing teams into a new workflow.</p>
            </div>
            <div className={styles.engineeringGrid}>
              {engineeringUseCases.map(([icon, title, copy], index) => (
                <article key={title}>
                  <div className={styles.engineeringCardTop}>
                    <span>{icon}</span>
                    <small>{String(index + 1).padStart(2, '0')}</small>
                  </div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                  <div className={styles.engineeringEvidence}><i />Evidence connected</div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.systemsSection} id="systems">
          <div className={styles.sectionShell}>
            <div className={styles.centerHeading}>
              <SectionEyebrow>One Connected Operating Layer</SectionEyebrow>
              <h2>One platform. Six enterprise systems.</h2>
              <p>Move from isolated approvals to a complete decision intelligence system.</p>
            </div>
            <div className={styles.systemGrid}>
              {systems.map((system) => (
                <article className={styles.systemCard} key={system.title}>
                  <ProductMiniVisual type={system.visual} />
                  <h3>{system.title}</h3>
                  <p>{system.copy}</p>
                  <Link href={system.href}>Learn more <ArrowIcon /></Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.productProofSection}>
          <div className={styles.productProofShell}>
            <DashboardPreview />
            <div className={styles.productProofCopy}>
              <SectionEyebrow>Approval Intelligence</SectionEyebrow>
              <h2>Turn approval activity into enterprise intelligence.</h2>
              <p>ApprovLine continuously monitors business and engineering decision activity and builds a searchable, contextual, and audit-ready approval ledger.</p>
              <ul>
                {['Real-time approval capture', 'AI-powered classification', 'Risk and policy validation', 'Complete evidence trail'].map((item) => (
                  <li key={item}><CheckIcon />{item}</li>
                ))}
              </ul>
              <Link className={styles.outlineButtonLarge} href="/approvals">Explore Approval Intelligence <ArrowIcon /></Link>
            </div>
          </div>
        </section>

        <section className={styles.graphSection}>
          <div className={styles.sectionShell}>
            <div className={styles.graphCopy}>
              <SectionEyebrow>Enterprise Memory Graph</SectionEyebrow>
              <h2>Every decision connected.</h2>
              <p>The Memory Graph transforms isolated records into connected enterprise intelligence across vendors, contracts, approvals, policies, investigations, and risks.</p>
              <div className={styles.graphStats}>
                <span><strong>29K+</strong>Connected entities</span>
                <span><strong>84K+</strong>Verified relationships</span>
                <span><strong>&lt; 1 sec</strong>Evidence retrieval</span>
              </div>
              <Link className={styles.textLink} href="/memory">Explore Memory Graph <ArrowIcon /></Link>
            </div>
            <div className={styles.largeGraph} aria-label="Connected enterprise decision graph">
              <span className={styles.largeGraphCenter}>Approval<br />#24-531</span>
              {[
                ['Vendor Alpha', 'Vendor'], ['MSA-2026', 'Contract'], ['Sarah J.', 'Approver'],
                ['PROC-3.2', 'Policy'], ['INV-017', 'Investigation'], ['High', 'Risk'],
              ].map(([label, type], index) => (
                <div className={styles.largeGraphNode} key={label} style={{ '--node': index } as React.CSSProperties}>
                  <i>{type[0]}</i><span>{label}<small>{type}</small></span>
                </div>
              ))}
              <svg viewBox="0 0 600 420" preserveAspectRatio="none" aria-hidden="true">
                {[0, 1, 2, 3, 4, 5].map((index) => (
                  <line key={index} x1="300" y1="210" x2={[90, 270, 500, 520, 260, 75][index]} y2={[70, 45, 95, 320, 375, 315][index]} />
                ))}
              </svg>
            </div>
          </div>
        </section>

        <section className={styles.copilotSection}>
          <div className={styles.sectionShell}>
            <div className={styles.centerHeading}>
              <SectionEyebrow>Evidence, Not Guesswork</SectionEyebrow>
              <h2>Ask questions. Get evidence.</h2>
              <p>Copilot works across your approval ledger, policies, investigations, and Memory Graph.</p>
            </div>
            <div className={styles.copilotWindow}>
              <aside>
                <div className={styles.previewLogo}><BrandMark compact /><span>AI Copilot</span></div>
                <b>Suggested</b>
                {['Who approved Vendor Alpha?', 'Show high-risk approvals', 'Which approvals violated policy?', 'Project Phoenix risks'].map((question, index) => (
                  <span className={index === 0 ? styles.copilotActive : ''} key={question}>{question}</span>
                ))}
              </aside>
              <main>
                <div className={styles.userQuestion}>Who approved Vendor Alpha and what policy applied?</div>
                <div className={styles.copilotAnswer}>
                  <span className={styles.aiAvatar}>A</span>
                  <div>
                    <b>Vendor Alpha was approved by Sarah Johnson (Procurement) and Priya Patel (Finance).</b>
                    <p>The decision was validated against Procurement Policy PROC-3.2. Legal approval remains conditional on the final MSA terms.</p>
                    <div className={styles.citationRow}>
                      <span>1 Slack message</span><span>2 Outlook email</span><span>3 PROC-3.2</span>
                    </div>
                  </div>
                </div>
                <div className={styles.copilotInput}><span>Ask ApprovLine Copilot...</span><b>↑</b></div>
              </main>
              <section className={styles.evidenceDrawer}>
                <span>Verified evidence</span>
                <strong>3 sources</strong>
                <div><b>Slack approval</b><small>Sarah Johnson · 14:06</small></div>
                <div><b>Finance sign-off</b><small>Priya Patel · 14:18</small></div>
                <div><b>Policy reference</b><small>PROC-3.2 · current</small></div>
              </section>
            </div>
          </div>
        </section>

        <section className={styles.trustSection}>
          <div className={styles.sectionShell}>
            <div className={styles.centerHeading}>
              <SectionEyebrow>Security Is The Architecture</SectionEyebrow>
              <h2>Built for enterprise trust.</h2>
              <p>Security, identity, isolation, and auditability are part of every ApprovLine workflow.</p>
            </div>
            <div className={styles.trustGrid}>
              {trustItems.map(([title, copy], index) => (
                <article key={title}>
                  <span className={styles.trustIcon}>{String(index + 1).padStart(2, '0')}</span>
                  <div><h3>{title}</h3><p>{copy}</p></div>
                  <b>Verified</b>
                </article>
              ))}
            </div>
            <div className={styles.trustAction}>
              <span><i><CheckIcon /></i>Read-only by design</span>
              <span><i><CheckIcon /></i>Enterprise identity controls</span>
              <span><i><CheckIcon /></i>Complete auditability</span>
              <Link href="/trust">Open Security &amp; Trust Center <ArrowIcon /></Link>
            </div>
          </div>
        </section>

        <section className={styles.integrationSection}>
          <div className={styles.sectionShell}>
            <div className={styles.centerHeading}>
              <SectionEyebrow>Zero Workflow Migration</SectionEyebrow>
              <h2>Works with the systems you already use.</h2>
              <p>Connect your enterprise stack with read-only access and no disruption to existing workflows.</p>
            </div>
            <div className={styles.integrationWall}>
              {[...sources, { name: 'Universal Gateway', mark: 'U', tone: 'violet' }].map((source) => (
                <div key={source.name}><span className={`${styles.sourceMark} ${styles[source.tone]}`}>{source.mark}</span><b>{source.name}</b><small>Read-only</small></div>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.roiSection}>
          <div className={styles.sectionShell}>
            <div className={styles.roiHeader}>
              <div><SectionEyebrow>Executive ROI</SectionEyebrow><h2>From approval activity to business value.</h2></div>
              <Link className={styles.outlineButtonLarge} href="/analytics">View Executive Analytics <ArrowIcon /></Link>
            </div>
            <div className={styles.roiGrid}>
              {[
                ['Approvals captured', '24,531', '+12.4%'],
                ['Missing sign-offs', '312', 'Detected'],
                ['Policy violations', '128', '-3.2%'],
                ['Risks identified', '78', '+5.4%'],
                ['Evidence generated', '18.4K', 'Audit ready'],
                ['Time saved', '1,240h', 'This quarter'],
              ].map(([label, value, note], index) => (
                <article key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small><i style={{ '--bar': `${42 + index * 9}%` } as React.CSSProperties} /></article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.setupSection}>
          <div className={styles.sectionShell}>
            <div className={styles.setupCopy}>
              <SectionEyebrow>Fast Enterprise Deployment</SectionEyebrow>
              <h2>Live in less than 15 minutes.</h2>
              <p>No implementation project. No custom engineering. No workflow disruption.</p>
              <Link className={styles.primaryButtonLarge} href="/get-started">Start Pilot Program <ArrowIcon /></Link>
            </div>
            <div className={styles.setupSteps}>
              {['Connect systems', 'Upload policies', 'Invite your team', 'Capture approvals', 'Generate insights'].map((step, index) => (
                <div key={step}><span>{index + 1}</span><b>{step}</b><small>{index === 0 ? 'Read-only OAuth' : index === 1 ? 'AI extracts rules' : index === 2 ? 'Role-based access' : index === 3 ? 'Automatic detection' : 'Evidence and ROI'}</small></div>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.readinessSection}>
          <div className={styles.sectionShell}>
            <div className={styles.centerHeading}>
              <SectionEyebrow>Operationally Critical By Design</SectionEyebrow>
              <h2>Built for modern enterprise operations.</h2>
            </div>
            <div className={styles.readinessGrid}>
              {[
                ['Observability', 'Healthy', '99.99%'], ['Reliability', 'Certified', 'A'], ['Backup Recovery', 'Verified', 'RPO'],
                ['Security Validation', 'Passing', '100'], ['Identity Management', 'Ready', 'SSO'], ['Pilot Readiness', 'Complete', '10/10'],
              ].map(([title, status, score]) => (
                <article key={title}><div><span>{score}</span><i /></div><h3>{title}</h3><p>{status}</p></article>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.pricingSection} id="pricing">
          <div className={styles.sectionShell}>
            <div className={styles.centerHeading}>
              <SectionEyebrow>Enterprise Pricing</SectionEyebrow>
              <h2>Scale approval intelligence with confidence.</h2>
              <p>Flexible plans built around your systems, approval volume, and operational needs.</p>
            </div>
            <div className={styles.pricingGrid}>
              {pricing.map((plan) => (
                <article className={plan.featured ? styles.featuredPlan : ''} key={plan.name}>
                  {plan.featured && <span className={styles.planLabel}>Most Popular</span>}
                  <h3>{plan.name}</h3><p>{plan.note}</p>
                  <div className={styles.planPrice}><strong>{plan.price}</strong><small>{plan.cadence}</small></div>
                  <ul>{plan.features.map((feature) => <li key={feature}><CheckIcon />{feature}</li>)}</ul>
                  <Link className={plan.featured ? styles.primaryButtonLarge : styles.outlineButtonLarge} href={plan.href}>{plan.cta} <ArrowIcon /></Link>
                </article>
              ))}
            </div>
            <div className={styles.pricingTrust} aria-label="Pricing trust and security">
              {pricingTrust.map((item) => <span key={item}><CheckIcon />{item}</span>)}
            </div>
          </div>
        </section>

        <section className={styles.proofPlaceholder} id="resources">
          <div className={styles.sectionShell}>
            <div className={styles.proofIntro}>
              <SectionEyebrow>Customer Outcomes</SectionEyebrow>
              <h2>Designed for the teams who carry decision risk.</h2>
              <p>Legal, Security, Procurement, Finance, Compliance, Engineering, and Operations share one verified decision record.</p>
            </div>
            <div className={styles.proofCards}>
              {[
                ['Procurement', 'Reconstruct vendor approval chains in seconds, not weeks.'],
                ['Engineering', 'Connect deployments, change requests, reviews, and release evidence.'],
                ['Compliance', 'Turn every decision into audit-ready proof.'],
              ].map(([team, copy]) => <article key={team}><span>Built for enterprise</span><h3>{team} intelligence</h3><p>{copy}</p></article>)}
            </div>
          </div>
        </section>

        <section className={styles.finalCta} id="company">
          <div className={styles.finalCtaShell}>
            <div><SectionEyebrow>The Intelligence Layer For Every Decision</SectionEyebrow><h2>Stop chasing approvals.<br />Start understanding decisions.</h2><p>Turn approval chaos into trusted, actionable enterprise intelligence.</p></div>
            <div className={styles.finalCtaActions}>
              <Link className={styles.primaryButtonLarge} href="/book-demo">Book Enterprise Demo <ArrowIcon /></Link>
              <Link className={styles.outlineButtonLarge} href="/get-started">Start Pilot Program <ArrowIcon /></Link>
              <span><CheckIcon />No credit card required</span><span><CheckIcon />Setup in 15 minutes</span>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerShell}>
          <div className={styles.footerBrand}>
            <Link className={styles.brand} href="/"><BrandMark /><span>ApprovLine</span></Link>
            <p>The Approval Intelligence Platform for modern enterprises.</p>
            <span>Read-only. Explainable. Audit-ready.</span>
          </div>
          <div><h3>Platform</h3><Link href="/approvals">Approval Intelligence</Link><Link href="/playbooks">Playbook AI</Link><Link href="/investigations">Investigation Center</Link><Link href="/memory">Memory Graph</Link><Link href="/copilot">AI Copilot</Link></div>
          <div><h3>Solutions</h3><Link href="/solutions/legal">Legal</Link><Link href="/solutions/security">Security</Link><Link href="/solutions/procurement">Procurement</Link><Link href="/solutions/finance">Finance</Link><Link href="/solutions/compliance">Compliance</Link><Link href="/solutions/engineering">Engineering</Link><Link href="/solutions/operations">Operations</Link></div>
          <div><h3>Resources</h3><Link href="/resources/trust-center">Trust Center</Link><Link href="/resources/compliance">Compliance</Link><Link href="/resources/system-health">System Health</Link><Link href="/resources/executive-analytics">Executive Analytics</Link><Link href="/contact">Contact</Link></div>
          <div><h3>Company</h3><Link href="/company/about">About</Link><Link href="/company/careers">Careers</Link><Link href="/company/partners">Partners</Link><Link href="/book-demo">Book a Demo</Link></div>
        </div>
        <div className={styles.footerBottom}><span>© 2026 ApprovLine. All rights reserved.</span><div><Link href="/resources/privacy">Privacy Policy</Link><Link href="/resources/terms">Terms of Service</Link></div></div>
      </footer>
    </div>
  );
}
