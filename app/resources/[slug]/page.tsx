import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EnterpriseMarketingPage } from '@/components/marketing/EnterpriseMarketingPage';
import { resourcePages } from '@/lib/marketing-pages';

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(resourcePages).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = resourcePages[slug];
  if (!page) return {};
  return { title: page.description, description: page.summary, alternates: { canonical: `/resources/${slug}` } };
}

export default async function ResourcePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = resourcePages[slug];
  if (!page) notFound();
  return <EnterpriseMarketingPage page={page} />;
}
