import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { EnterpriseMarketingPage } from '@/components/marketing/EnterpriseMarketingPage';
import { solutionPages } from '@/lib/marketing-pages';

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(solutionPages).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = solutionPages[slug];
  if (!page) return {};
  return { title: page.description, description: page.summary, alternates: { canonical: `/solutions/${slug}` } };
}

export default async function SolutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = solutionPages[slug];
  if (!page) notFound();
  return <EnterpriseMarketingPage page={page} />;
}
