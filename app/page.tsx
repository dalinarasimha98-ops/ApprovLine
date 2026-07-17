import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/LandingPage';

export const metadata: Metadata = {
  title: 'ApprovLine | Enterprise Approval Intelligence Platform',
  description:
    'Capture approvals across enterprise systems, validate decisions against policy, and build a searchable, audit-ready intelligence layer.',
  alternates: {
    canonical: 'https://www.approvline.com',
  },
  openGraph: {
    title: 'ApprovLine | Every Approval. Every Decision. One Source of Truth.',
    description:
      'The enterprise approval intelligence platform for connected decisions, policy validation, investigations, and audit-ready evidence.',
    url: 'https://www.approvline.com',
    siteName: 'ApprovLine',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ApprovLine | Enterprise Approval Intelligence',
    description: 'Turn fragmented approvals into connected, explainable enterprise intelligence.',
  },
};

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://www.approvline.com/#organization',
      name: 'ApprovLine',
      url: 'https://www.approvline.com',
      description: 'Enterprise approval intelligence and decision evidence platform.',
    },
    {
      '@type': 'SoftwareApplication',
      '@id': 'https://www.approvline.com/#software',
      name: 'ApprovLine',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: 'https://www.approvline.com',
      provider: { '@id': 'https://www.approvline.com/#organization' },
      description:
        'Capture approvals across enterprise systems, validate decisions against policy, and create an audit-ready intelligence layer.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description: 'Enterprise pilot and custom pricing available.',
      },
    },
  ],
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <LandingPage />
    </>
  );
}
