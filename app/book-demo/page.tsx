import type { Metadata } from 'next';
import { EnterpriseMarketingPage } from '@/components/marketing/EnterpriseMarketingPage';
import { MarketingLeadForm } from '@/components/marketing/MarketingLeadForm';
import type { MarketingPage } from '@/lib/marketing-pages';

export const metadata: Metadata = {
  title: 'Book an ApprovLine Enterprise Demo',
  description: 'Book a tailored ApprovLine demo for approval intelligence, policy compliance, investigations, analytics, and enterprise integrations.',
  alternates: { canonical: '/book-demo' },
};

const page: MarketingPage = {
  slug: 'book-demo', group: 'company', eyebrow: 'Enterprise demo', title: 'See your approval intelligence layer in action.',
  summary: 'Explore how ApprovLine captures approvals, validates policy, connects evidence, and turns enterprise decisions into trusted intelligence.',
  description: metadata.title as string, cta: 'Schedule demo', accent: '#818cf8',
  highlights: ['Tailored to your systems', 'Architecture and security review', 'Real approval workflows', 'Pilot planning'],
  capabilities: [
    { title: 'Approval capture', copy: 'See decisions normalized from communication, workflow, meeting, and custom enterprise systems.' },
    { title: 'Policy intelligence', copy: 'Evaluate approvals against company playbooks, thresholds, and required sign-offs.' },
    { title: 'Investigation workflow', copy: 'Move from a high-risk approval to evidence, policy context, timeline, and report.' },
    { title: 'Executive value', copy: 'Understand risk reduction, traceability, audit effort, adoption, and measurable ROI.' },
  ],
  metrics: [{ value: '30 min', label: 'Focused session' }, { value: 'Read-only', label: 'Integration model' }, { value: '< 15 min', label: 'Pilot setup target' }],
  faqs: [
    { question: 'Is the demo customized?', answer: 'Yes. We use your qualification details to focus on the systems, departments, policies, and approval risks most relevant to your organization.' },
    { question: 'Who should attend?', answer: 'Legal, procurement, compliance, security, finance, engineering, operations, IT, and executive stakeholders all benefit from the appropriate workflow.' },
    { question: 'Can we include a security review?', answer: 'Yes. We can cover read-only permissions, tenant isolation, encryption, identity, retention, auditability, and deployment readiness.' },
  ],
};

export default function BookDemoPage() {
  return <EnterpriseMarketingPage page={page} form={<MarketingLeadForm kind="demo" />} />;
}
