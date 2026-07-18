import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EnterpriseMarketingPage } from '@/components/marketing/EnterpriseMarketingPage';
import { companyPages } from '@/lib/marketing-pages';

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(companyPages).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = companyPages[slug];
  if (!page) return {};
  return { title: page.description, description: page.summary, alternates: { canonical: `/company/${slug}` } };
}

export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = companyPages[slug];
  if (!page) notFound();
  return <EnterpriseMarketingPage page={page} />;
}
