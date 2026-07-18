export type MarketingPage = {
  slug: string;
  group: 'solutions' | 'resources' | 'company';
  eyebrow: string;
  title: string;
  summary: string;
  description: string;
  cta: string;
  accent: string;
  highlights: string[];
  capabilities: Array<{ title: string; copy: string }>;
  timeline?: Array<{ time: string; title: string; detail: string }>;
  metrics?: Array<{ value: string; label: string }>;
  faqs: Array<{ question: string; answer: string }>;
};

const standardFaqs = (team: string) => [
  {
    question: `How quickly can ${team} teams start?`,
    answer: 'Most teams can connect a read-only source and begin capturing approval evidence during a guided pilot. No workflow migration is required.',
  },
  {
    question: 'Does ApprovLine change data in connected systems?',
    answer: 'No. ApprovLine is designed for read-only evidence capture and intelligence. It does not approve, modify, delete, or send data in source systems.',
  },
  {
    question: 'Can access be limited by team or department?',
    answer: 'Yes. Tenant isolation and role-based permissions keep customer data separated and control who can investigate, export, and administer records.',
  },
];

const solution = (
  slug: string,
  title: string,
  summary: string,
  accent: string,
  highlights: string[],
  capabilities: MarketingPage['capabilities'],
  cta: string,
): MarketingPage => ({
  slug,
  group: 'solutions',
  eyebrow: `${slug} intelligence`,
  title,
  summary,
  description: `${title} | ApprovLine`,
  accent,
  highlights,
  capabilities,
  cta,
  timeline: [
    { time: '09:14', title: 'Request captured', detail: 'Source evidence preserved automatically' },
    { time: '11:42', title: 'Decision detected', detail: 'Approver, conditions, and confidence extracted' },
    { time: '11:43', title: 'Policy validated', detail: 'Required controls and evidence checked' },
    { time: '11:44', title: 'Audit trail ready', detail: 'Searchable timeline available to authorized teams' },
  ],
  metrics: [
    { value: '< 1 min', label: 'Evidence retrieval' },
    { value: 'Read-only', label: 'Source access' },
    { value: '100%', label: 'Decision traceability' },
  ],
  faqs: standardFaqs(slug),
});

export const solutionPages: Record<string, MarketingPage> = Object.fromEntries(
  [
    solution('legal', 'Approval Intelligence for Legal Teams', 'Connect contracts, review decisions, conditions, and evidence in one defensible legal approval record.', '#8b5cf6', ['Contract approvals', 'MSA and NDA approvals', 'Vendor agreements', 'Amendment tracking'], [
      { title: 'Legal review workflows', copy: 'Capture review decisions from email, Teams, Slack, Jira, and connected contract processes.' },
      { title: 'Decision evidence', copy: 'Preserve who approved, when they approved, the conditions applied, and the original source.' },
      { title: 'Contract timeline', copy: 'Connect MSAs, NDAs, amendments, vendor agreements, and investigations chronologically.' },
      { title: 'Audit-ready exports', copy: 'Produce structured evidence packages for legal operations, disputes, and governance reviews.' },
    ], 'Book Legal Demo'),
    solution('security', 'Security Approval Intelligence', 'Turn security exceptions, access requests, risk decisions, and control evidence into a complete audit trail.', '#22d3ee', ['Security exceptions', 'Access approvals', 'Risk approvals', 'Vulnerability approvals'], [
      { title: 'Control evidence', copy: 'Connect decisions to SOC 2 and ISO 27001 control evidence without manual reconstruction.' },
      { title: 'Exception governance', copy: 'Track exception owners, compensating controls, expiry conditions, and approvals.' },
      { title: 'Risk visibility', copy: 'Identify high-risk approvals, missing security sign-offs, and incomplete evidence.' },
      { title: 'Compliance reporting', copy: 'Export a defensible security decision history for auditors and reviewers.' },
    ], 'Book Security Demo'),
    solution('procurement', 'Procurement Approval Intelligence', 'Create one connected record for vendor onboarding, purchasing decisions, budgets, and multi-level sign-offs.', '#60a5fa', ['Vendor onboarding', 'Purchase approvals', 'Budget approvals', 'Multi-level approvals'], [
      { title: 'Vendor intelligence', copy: 'Connect vendors, contracts, approvals, policies, risks, and investigations.' },
      { title: 'Spend visibility', copy: 'Understand approval volume, value, bottlenecks, and exceptions across departments.' },
      { title: 'Policy thresholds', copy: 'Validate required approvers against procurement rules and delegation limits.' },
      { title: 'Workflow evidence', copy: 'Capture decisions from Slack, Teams, email, Jira, and ServiceNow.' },
    ], 'Book Procurement Demo'),
    solution('finance', 'Finance Approval Intelligence', 'Make budgets, expenses, invoices, and payment decisions searchable, governed, and audit-ready.', '#34d399', ['Budget approvals', 'Expense approvals', 'Invoice approvals', 'Payment approvals'], [
      { title: 'Financial governance', copy: 'Validate approval authority, thresholds, conditions, and segregation of duties.' },
      { title: 'Approval analytics', copy: 'See cycle time, approval value, bottlenecks, and missing finance sign-offs.' },
      { title: 'Payment evidence', copy: 'Preserve approval source, approver identity, timestamp, and linked records.' },
      { title: 'Audit support', copy: 'Retrieve complete finance approval chains without searching across inboxes and threads.' },
    ], 'Book Finance Demo'),
    solution('compliance', 'Compliance Approval Intelligence', 'Continuously validate approvals against policy and produce evidence for regulatory and governance reviews.', '#a78bfa', ['Regulatory evidence', 'Policy enforcement', 'Audit readiness', 'Governance reporting'], [
      { title: 'AI compliance validation', copy: 'Compare every captured decision with uploaded policies and approval matrices.' },
      { title: 'Evidence completeness', copy: 'Identify missing approvers, source links, timestamps, and escalation steps.' },
      { title: 'Control reporting', copy: 'Monitor compliance scores, violations, trends, and remediation activity.' },
      { title: 'Investigation workflow', copy: 'Move from a risky approval to evidence, policy context, notes, and a report.' },
    ], 'Book Compliance Demo'),
    solution('engineering', 'Engineering Approval Intelligence', 'Connect code, infrastructure, deployment, architecture, and incident decisions to business governance.', '#818cf8', ['Pull request approvals', 'Deployment approvals', 'Change requests', 'Production releases'], [
      { title: 'Change intelligence', copy: 'Link pull requests, Jira tickets, releases, approvals, and incident decisions.' },
      { title: 'Architecture reviews', copy: 'Preserve design decisions, reviewers, conditions, and policy references.' },
      { title: 'Security exceptions', copy: 'Track exception scope, compensating controls, owners, and expiration requirements.' },
      { title: 'Engineering ecosystem', copy: 'Unify evidence from GitHub, GitLab, Azure DevOps, Jenkins, Kubernetes, and Jira.' },
    ], 'Book Engineering Demo'),
    solution('operations', 'Operations Approval Intelligence', 'Bring incident, change, process, and cross-functional approvals into one operational decision ledger.', '#f472b6', ['Operations workflows', 'Incident approvals', 'Change management', 'Executive dashboards'], [
      { title: 'Operational visibility', copy: 'See decisions across ServiceNow, Teams, Zoom, email, and connected systems.' },
      { title: 'Process governance', copy: 'Validate approvals against operating procedures, risk rules, and escalation paths.' },
      { title: 'Cross-functional context', copy: 'Connect owners, departments, systems, evidence, and downstream actions.' },
      { title: 'Executive intelligence', copy: 'Translate operational approval activity into risk, speed, and ROI metrics.' },
    ], 'Book Operations Demo'),
  ].map((page) => [page.slug, page]),
);

export const resourcePages: Record<string, MarketingPage> = {
  'trust-center': {
    slug: 'trust-center', group: 'resources', eyebrow: 'Security & trust', title: 'Enterprise trust, made transparent.',
    summary: 'Understand how ApprovLine protects customer data, isolates tenants, secures integrations, and governs AI.',
    description: 'ApprovLine Trust Center | Security, privacy, and responsible AI', cta: 'Talk to Security', accent: '#60a5fa',
    highlights: ['Encryption in transit and at rest', 'Tenant isolation', 'Read-only integrations', 'Responsible AI'],
    capabilities: [
      { title: 'Security architecture', copy: 'Layered application, identity, infrastructure, database, and operational controls.' },
      { title: 'Privacy & residency', copy: 'Documented data handling, retention, deletion, and regional deployment strategy.' },
      { title: 'Vulnerability disclosure', copy: 'A defined path for responsible reporting, triage, remediation, and communication.' },
      { title: 'Security contacts', copy: 'Direct routes for security reviews, incidents, procurement, and data protection requests.' },
    ],
    metrics: [{ value: 'AES-256', label: 'Encrypted storage' }, { value: 'TLS 1.2+', label: 'Data in transit' }, { value: 'Isolated', label: 'Customer tenants' }],
    faqs: [
      { question: 'Can ApprovLine modify connected systems?', answer: 'No. Production connectors are designed for read-only evidence capture and cannot approve, delete, or send source-system data.' },
      { question: 'How is tenant isolation enforced?', answer: 'Authentication, organization-scoped queries, role checks, and tenant-aware storage boundaries are applied throughout the application.' },
      { question: 'How do I report a vulnerability?', answer: 'Send responsible disclosure details to security@approvline.com. Reports are acknowledged, triaged, and handled confidentially.' },
    ],
  },
  compliance: {
    slug: 'compliance', group: 'resources', eyebrow: 'Compliance readiness', title: 'Controls buyers and auditors can understand.',
    summary: 'Bring security controls, policy governance, audit evidence, and privacy commitments into one clear compliance posture.',
    description: 'ApprovLine Compliance | SOC 2, ISO 27001, GDPR, and CCPA readiness', cta: 'Request Compliance Review', accent: '#34d399',
    highlights: ['SOC 2 readiness', 'ISO 27001 alignment', 'GDPR and CCPA', 'HIPAA future roadmap'],
    capabilities: [
      { title: 'Audit readiness', copy: 'Maintain complete approval records, operational logs, evidence links, and exportable reports.' },
      { title: 'Policy management', copy: 'Upload governance documents and evaluate decisions against structured rules.' },
      { title: 'Security controls', copy: 'Document identity, encryption, tenant isolation, retention, and monitoring controls.' },
      { title: 'Privacy operations', copy: 'Support retention, deletion, access control, and customer data-handling reviews.' },
    ],
    metrics: [{ value: 'SOC 2', label: 'Readiness program' }, { value: 'ISO 27001', label: 'Control alignment' }, { value: 'GDPR', label: 'Privacy architecture' }],
    faqs: standardFaqs('compliance'),
  },
  'system-health': {
    slug: 'system-health', group: 'resources', eyebrow: 'Public system health', title: 'ApprovLine service status.',
    summary: 'Current operational health across the API, dashboard, AI services, integrations, gateway, and background processing.',
    description: 'ApprovLine System Health and Service Status', cta: 'Open Live Health Check', accent: '#22c55e',
    highlights: ['API operational', 'Dashboard operational', 'AI services monitored', 'Gateway monitored'],
    capabilities: [
      { title: 'API status', copy: 'Core application and ingestion API availability is monitored continuously.' },
      { title: 'Integration health', copy: 'Connector configuration, synchronization, latency, and failures are tracked.' },
      { title: 'Background jobs', copy: 'Queue depth, processing health, retries, and dead-letter activity are monitored.' },
      { title: 'Incident communication', copy: 'Scheduled maintenance and material incidents are documented with clear timelines.' },
    ],
    metrics: [{ value: '99.99%', label: 'Target uptime' }, { value: '< 1s', label: 'Health response' }, { value: '24/7', label: 'Automated monitoring' }],
    timeline: [
      { time: 'Today', title: 'All systems operational', detail: 'No active customer-impacting incidents' },
      { time: 'Jul 14', title: 'Maintenance completed', detail: 'Database maintenance completed without downtime' },
      { time: 'Jul 02', title: 'Connector latency resolved', detail: 'Delayed sync processing returned to normal' },
    ],
    faqs: [{ question: 'Where can I see live diagnostics?', answer: 'The live health endpoint is available at /health and reports configured service readiness without exposing credentials.' }, ...standardFaqs('operations').slice(1)],
  },
  'executive-analytics': {
    slug: 'executive-analytics', group: 'resources', eyebrow: 'Executive intelligence', title: 'Turn approval activity into measurable ROI.',
    summary: 'Give leadership a clear view of bottlenecks, cycle times, compliance, risk, adoption, and business value.',
    description: 'ApprovLine Executive Analytics | Approval ROI and risk intelligence', cta: 'See Analytics Demo', accent: '#8b5cf6',
    highlights: ['Approval bottlenecks', 'Executive KPIs', 'Compliance scores', 'ROI reports'],
    capabilities: [
      { title: 'Department metrics', copy: 'Compare approval volume, speed, risk, and evidence coverage across business teams.' },
      { title: 'Risk analytics', copy: 'Drill into high-risk decisions, policy violations, and missing sign-offs.' },
      { title: 'AI insights', copy: 'Surface bottlenecks, unusual patterns, recommended actions, and executive summaries.' },
      { title: 'Board-ready reporting', copy: 'Preview and export evidence-backed PDF and CSV executive reports.' },
    ],
    metrics: [{ value: '41h', label: 'Audit effort saved' }, { value: '96%', label: 'Decision traceability' }, { value: '18', label: 'High-risk events found' }],
    faqs: standardFaqs('executive'),
  },
  privacy: {
    slug: 'privacy', group: 'resources', eyebrow: 'Privacy', title: 'Customer data stays customer controlled.',
    summary: 'A clear overview of how ApprovLine collects, processes, protects, retains, and deletes personal and enterprise data.',
    description: 'ApprovLine Privacy Policy', cta: 'Ask a Privacy Question', accent: '#60a5fa',
    highlights: ['Purpose limitation', 'Data minimization', 'Retention controls', 'Customer rights'],
    capabilities: [
      { title: 'Information collected', copy: 'Account, workspace, integration metadata, approval evidence, and product usage required to deliver the service.' },
      { title: 'How data is used', copy: 'To provide, secure, support, and improve ApprovLine under customer instructions and documented purposes.' },
      { title: 'Retention and deletion', copy: 'Workspace retention settings and contractual requirements govern how long customer records are maintained.' },
      { title: 'Privacy requests', copy: 'Customers can contact privacy@approvline.com for access, correction, deletion, or data-processing questions.' },
    ],
    faqs: standardFaqs('privacy'),
  },
  terms: {
    slug: 'terms', group: 'resources', eyebrow: 'Terms', title: 'Clear terms for a trusted enterprise service.',
    summary: 'The operating principles, customer responsibilities, service boundaries, and acceptable-use expectations for ApprovLine.',
    description: 'ApprovLine Terms of Service', cta: 'Ask a Legal Question', accent: '#818cf8',
    highlights: ['Customer ownership', 'Authorized use', 'Service security', 'Responsible operation'],
    capabilities: [
      { title: 'Service use', copy: 'Customers may use ApprovLine for authorized business purposes within their organization and plan limits.' },
      { title: 'Customer content', copy: 'Customers retain ownership of their content and control the systems and evidence connected to ApprovLine.' },
      { title: 'Security responsibilities', copy: 'Both parties maintain appropriate safeguards for credentials, access, users, and configured integrations.' },
      { title: 'Support and changes', copy: 'Service updates, support commitments, and commercial terms are governed by the applicable agreement.' },
    ],
    faqs: standardFaqs('legal'),
  },
};

export const companyPages: Record<string, MarketingPage> = {
  about: {
    slug: 'about', group: 'company', eyebrow: 'About ApprovLine', title: 'Every important decision should be provable.',
    summary: 'ApprovLine was created to replace fragmented approval evidence with connected, explainable enterprise intelligence.',
    description: 'About ApprovLine | The Approval Intelligence Company', cta: 'Meet ApprovLine', accent: '#818cf8',
    highlights: ['Security first', 'Evidence over assumptions', 'Human accountable AI', 'Enterprise by design'],
    capabilities: [
      { title: 'Our mission', copy: 'Make every enterprise approval searchable, explainable, governed, and defensible.' },
      { title: 'Our vision', copy: 'Become the trusted intelligence layer for every important business decision.' },
      { title: 'Why approval intelligence', copy: 'Critical decisions happen everywhere, while evidence remains fragmented and difficult to reconstruct.' },
      { title: 'Platform principles', copy: 'Read-only capture, customer control, tenant isolation, explainable intelligence, and complete auditability.' },
    ],
    timeline: [
      { time: 'Foundation', title: 'Approval intelligence defined', detail: 'A universal model for approvals, evidence, policy, and risk' },
      { time: 'Platform', title: 'Connected enterprise systems', detail: 'Copilot, Playbook AI, investigations, analytics, and Memory Graph' },
      { time: 'Today', title: 'Enterprise pilot readiness', detail: 'A production-focused platform for accountable decisions' },
    ],
    faqs: standardFaqs('enterprise'),
  },
  careers: {
    slug: 'careers', group: 'company', eyebrow: 'Careers', title: 'Build the future of accountable enterprise decisions.',
    summary: 'Join a focused team working across AI, security, distributed systems, compliance, and enterprise product design.',
    description: 'Careers at ApprovLine', cta: 'View Open Roles', accent: '#f472b6',
    highlights: ['High ownership', 'Remote collaboration', 'Customer proximity', 'Thoughtful craft'],
    capabilities: [
      { title: 'Mission-led work', copy: 'Build infrastructure that helps organizations understand and defend important decisions.' },
      { title: 'Remote by design', copy: 'Work with clarity, written context, focused collaboration, and flexible execution.' },
      { title: 'Meaningful benefits', copy: 'Competitive compensation, flexible time, learning support, and sustainable work practices.' },
      { title: 'Open positions', copy: 'Founding Engineering, Enterprise Product, Security, and Customer Success roles will be published here.' },
    ],
    timeline: [
      { time: '01', title: 'Intro conversation', detail: 'Understand your interests, experience, and working style' },
      { time: '02', title: 'Practical discussion', detail: 'Work through a realistic problem with the team' },
      { time: '03', title: 'Team conversation', detail: 'Meet collaborators and discuss mutual expectations' },
      { time: '04', title: 'Decision', detail: 'Clear, timely communication and next steps' },
    ],
    faqs: standardFaqs('candidate'),
  },
  partners: {
    slug: 'partners', group: 'company', eyebrow: 'Partner ecosystem', title: 'Bring approval intelligence to every enterprise system.',
    summary: 'Partner with ApprovLine to connect platforms, deliver transformation programs, and help customers govern decisions.',
    description: 'ApprovLine Partner Program', cta: 'Become a Partner', accent: '#22d3ee',
    highlights: ['Technology partners', 'Consulting partners', 'Implementation partners', 'System integrators'],
    capabilities: [
      { title: 'Technology partners', copy: 'Create secure connectors and extend approval intelligence into enterprise platforms.' },
      { title: 'Consulting partners', copy: 'Help customers map approval controls, policy requirements, and operating models.' },
      { title: 'Implementation partners', copy: 'Accelerate onboarding, identity, integration, playbook, and governance configuration.' },
      { title: 'Partner benefits', copy: 'Enablement, shared opportunities, technical support, solution resources, and co-selling alignment.' },
    ],
    faqs: standardFaqs('partner'),
  },
};

export function getMarketingPage(group: MarketingPage['group'], slug: string) {
  if (group === 'solutions') return solutionPages[slug];
  if (group === 'resources') return resourcePages[slug];
  return companyPages[slug];
}
