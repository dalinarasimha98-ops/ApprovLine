import type { Metadata } from 'next';
import { EnterpriseMarketingPage } from '@/components/marketing/EnterpriseMarketingPage';
import { MarketingLeadForm } from '@/components/marketing/MarketingLeadForm';
import type { MarketingPage } from '@/lib/marketing-pages';

export const metadata: Metadata = {
  title: 'Contact ApprovLine | Sales, Support, Security, and Partnerships',
  description: 'Contact ApprovLine sales, support, security, partnerships, or the general enterprise team.',
  alternates: { canonical: '/contact' },
};

const page: MarketingPage = {
  slug: 'contact', group: 'company', eyebrow: 'Contact ApprovLine', title: 'Start the right enterprise conversation.',
  summary: 'Connect with ApprovLine sales, support, security, partnerships, or our general enterprise team.',
  description: metadata.title as string, cta: 'Contact ApprovLine', accent: '#22d3ee',
  highlights: ['Enterprise sales', 'Customer support', 'Security reviews', 'Partner ecosystem'],
  capabilities: [
    { title: 'Sales', copy: 'Discuss enterprise use cases, pilots, pricing, deployment, and procurement.' },
    { title: 'Support', copy: 'Get help with an existing workspace, connector, account, or operational question.' },
    { title: 'Security', copy: 'Request architecture, privacy, compliance, questionnaire, and trust information.' },
    { title: 'Partnerships', copy: 'Explore technology, implementation, consulting, and system-integrator programs.' },
    { title: 'General inquiries', copy: 'Route company, media, procurement, and other questions to the appropriate ApprovLine owner.' },
    { title: 'Global office', copy: 'ApprovLine operates as a distributed company. Corporate office details are available during formal procurement.' },
  ],
  metrics: [{ value: '< 1 day', label: 'Typical response' }, { value: 'Global', label: 'Remote enterprise team' }, { value: 'Direct', label: 'Specialist routing' }],
  timeline: [{ time: '01', title: 'Tell us what you need', detail: 'Your request is routed to the right team' }, { time: '02', title: 'Specialist response', detail: 'A relevant ApprovLine owner follows up' }, { time: '03', title: 'Focused next step', detail: 'Demo, support session, or security review' }],
  faqs: [
    { question: 'Where is ApprovLine located?', answer: 'ApprovLine operates as a distributed enterprise software company. Corporate office details are provided during formal procurement and contracting.' },
    { question: 'How do I report a security issue?', answer: 'Select Security in the form or email security@approvline.com. Please do not include credentials or sensitive customer data in the initial report.' },
    { question: 'Can I request an enterprise pilot?', answer: 'Yes. Select Sales and describe your systems, team, and approval-governance goals.' },
  ],
};

export default function ContactPage() {
  return <EnterpriseMarketingPage page={page} form={<MarketingLeadForm kind="contact" />} />;
}
