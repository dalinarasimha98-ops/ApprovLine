'use client';

import { useState } from 'react';
import { RequestIntegrationModal } from '@/components/integrations/RequestIntegrationModal';

type ComingSoonProvider = {
  slug: string;
  name: string;
  category: string;
  description: string;
  color: string;
};

const COMING_SOON: ComingSoonProvider[] = [
  { slug: 'salesforce', name: 'Salesforce', category: 'CRM', description: 'Opportunity, quote and contract approvals', color: '#00A1E0' },
  { slug: 'hubspot', name: 'HubSpot', category: 'CRM', description: 'Deal, quote and agreement sign-offs', color: '#FF7A59' },
  { slug: 'sap', name: 'SAP', category: 'ERP', description: 'Purchase order and financial authorizations', color: '#0070F2' },
  { slug: 'oracle', name: 'Oracle', category: 'ERP', description: 'Financial workflow and procurement approvals', color: '#C74634' },
  { slug: 'workday', name: 'Workday', category: 'HR', description: 'Headcount, compensation and HR approvals', color: '#F3734A' },
  { slug: 'coupa', name: 'Coupa', category: 'Procurement', description: 'Requisition, contract and supplier approvals', color: '#1EC16B' },
  { slug: 'ironclad', name: 'Ironclad', category: 'Legal', description: 'Contract workflows and legal sign-offs', color: '#5C1B72' },
  { slug: 'docusign', name: 'DocuSign', category: 'Legal', description: 'Electronic signature completion evidence', color: '#FFB800' },
  { slug: 'github', name: 'GitHub', category: 'Engineering', description: 'PR reviews, releases and deployment approvals', color: '#24292E' },
  { slug: 'gitlab', name: 'GitLab', category: 'Engineering', description: 'Merge request and pipeline approvals', color: '#FC6D26' },
  { slug: 'asana', name: 'Asana', category: 'Engineering', description: 'Task sign-offs and project milestone approvals', color: '#F06A6A' },
  { slug: 'monday', name: 'Monday.com', category: 'Engineering', description: 'Board item and automation approvals', color: '#FF3D57' },
  { slug: 'notion', name: 'Notion', category: 'Engineering', description: 'Page and database decisions', color: '#000000' },
  { slug: 'google_chat', name: 'Google Chat', category: 'Communication', description: 'Approval conversations in spaces and DMs', color: '#34A853' },
  { slug: 'whatsapp', name: 'WhatsApp Business', category: 'Communication', description: 'Business decisions via WhatsApp Cloud API', color: '#25D366' },
];

function ProviderIcon({ name, color }: { name: string; color: string }) {
  return (
    <div
      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-black text-white"
      style={{ backgroundColor: color }}
    >
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

export function MarketplaceSection() {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<{ name: string; slug: string } | undefined>();

  function openModal(provider?: { name: string; slug: string }) {
    setSelectedProvider(provider);
    setModalOpen(true);
  }

  return (
    <>
      {/* Coming Soon section */}
      <div className="grid gap-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-black uppercase tracking-[0.08em] text-slate-500">Coming Soon</h3>
          <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black text-blue-600">
            {COMING_SOON.length} planned
          </span>
        </div>
        <p className="text-sm font-semibold text-slate-500">
          These integrations are on our roadmap. Request the ones you need to help us prioritize.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {COMING_SOON.map((provider) => (
            <div
              key={provider.slug}
              className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <ProviderIcon name={provider.name} color={provider.color} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="block text-sm font-black text-slate-950">{provider.name}</span>
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-blue-600">
                    Soon
                  </span>
                </div>
                <span className="mt-0.5 block text-xs font-semibold text-slate-400">{provider.category}</span>
                <p className="mt-1.5 text-xs font-semibold leading-5 text-slate-500">{provider.description}</p>
                <button
                  onClick={() => openModal({ name: provider.name, slug: provider.slug })}
                  className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                >
                  Request access
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Request custom integration */}
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-950">Don&apos;t see your tool?</h3>
            <p className="mt-1 max-w-lg text-sm font-semibold text-slate-500">
              Request any integration — enterprise ERP, niche ITSM tool, home-grown system. We prioritize by customer demand.
            </p>
          </div>
          <button
            onClick={() => openModal(undefined)}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#2155d9] px-5 py-3 text-sm font-black text-white transition hover:bg-[#1a44be]"
          >
            Request an Integration
          </button>
        </div>
      </div>

      {/* Generic connector CTA */}
      <div className="rounded-2xl border border-violet-200 bg-violet-50 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-black text-violet-950">Have a system with a webhook or API?</h3>
            <p className="mt-1 max-w-lg text-sm font-semibold text-violet-700">
              Connect any system today using the Universal Gateway — no custom connector required.
              Supports signed webhooks, REST API, CSV import, and email forwarding.
            </p>
          </div>
          <a
            href={`/dashboard/gateway`}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-violet-300 bg-white px-5 py-3 text-sm font-black text-violet-700 transition hover:bg-violet-50"
          >
            Use Generic Connector
          </a>
        </div>
      </div>

      <RequestIntegrationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        defaultProviderName={selectedProvider?.name ?? ''}
        defaultProviderSlug={selectedProvider?.slug}
      />
    </>
  );
}
