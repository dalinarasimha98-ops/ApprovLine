'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getFounderAccess } from '@/services/founder';
import {
  deleteFounderDemoWorkspace,
  demoCompanySizes,
  demoIndustries,
  generateFounderDemoWorkspace,
  previewDemoSample,
  type DemoCompanySize,
  type DemoGenerationInput,
  type DemoIndustry,
  type DemoSamplePreview,
  type DemoWorkspaceSummary,
} from '@/services/founderDemoGenerator';
import { isDemoModuleKey, isDemoScenarioKey, type DemoModuleKey, type DemoScenarioKey } from '@/lib/founder-demo-generator';

/**
 * Every action re-derives Founder identity and read-only state
 * server-side (never trusts a client-supplied role/access value — a
 * Server Action can only ever receive the plain arguments below, never a
 * smuggled `access` object), independently of app/founder/layout.tsx's
 * own gate. Every mutation additionally re-verifies, inside
 * services/founderDemoGenerator.ts itself, that the target organization's
 * slug starts with "founder-demo-" before touching it — so a forged or
 * guessed real customer organizationId can never be reset or regenerated
 * through this page, even if this action layer had a bug.
 */

async function requireFounderWrite() {
  const access = await getFounderAccess();
  if (!access.ok || access.readOnly) {
    throw new Error('Unauthorized: Founder write access is required.');
  }
  return access;
}

function safeErrorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/postgresql:\/\/[^\s]+/g, '[database-url-redacted]').slice(0, 220);
}

function parseModules(input: unknown): DemoModuleKey[] {
  if (!Array.isArray(input)) return [];
  return input.filter(isDemoModuleKey);
}

export type GenerateDemoInput = {
  industry: string;
  companySize: string;
  modules: string[];
  scenario: string;
  companyName?: string;
  domain?: string;
  primaryAdminEmail?: string;
};

export async function generateDemoWorkspace(input: GenerateDemoInput): Promise<{ ok: true; data: DemoWorkspaceSummary } | { ok: false; error: string }> {
  try {
    const access = await requireFounderWrite();

    if (!demoIndustries.includes(input.industry as DemoIndustry)) return { ok: false, error: 'Select a valid industry.' };
    if (!demoCompanySizes.includes(input.companySize as DemoCompanySize)) return { ok: false, error: 'Select a valid company size.' };
    if (!isDemoScenarioKey(input.scenario)) return { ok: false, error: 'Select a valid scenario.' };
    const modules = parseModules(input.modules);
    if (modules.length === 0) return { ok: false, error: 'Select at least one data module.' };

    const companyName = input.companyName?.trim().slice(0, 120) || undefined;
    const domain = input.domain?.trim().slice(0, 253).toLowerCase() || undefined;
    const primaryAdminEmail = input.primaryAdminEmail?.trim().slice(0, 254) || undefined;
    if (domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return { ok: false, error: 'Enter a valid domain, e.g. acme-demo.example.' };
    if (primaryAdminEmail && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(primaryAdminEmail)) return { ok: false, error: 'Enter a valid admin email.' };

    const generationInput: DemoGenerationInput = {
      industry: input.industry as DemoIndustry,
      companySize: input.companySize as DemoCompanySize,
      modules,
      scenario: input.scenario as DemoScenarioKey,
      companyName,
      domain,
      primaryAdminEmail,
    };

    const result = await generateFounderDemoWorkspace(access, generationInput);
    revalidatePath('/founder/demo-generator');
    return { ok: true, data: result };
  } catch (error) {
    console.error('[demo-generator] generateDemoWorkspace failed', error);
    return { ok: false, error: safeErrorMessage(error) };
  }
}

export async function resetDemoWorkspace(organizationId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const access = await requireFounderWrite();
    if (!organizationId) return { ok: false, error: 'A demo workspace is required.' };

    // Independently re-verified here too (defense in depth), even though
    // deleteFounderDemoWorkspace() performs the same check itself — a
    // forged organizationId for a real customer is rejected before this
    // action even calls into the shared engine.
    const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { slug: true } });
    if (!organization) return { ok: false, error: 'Demo workspace was not found.' };
    if (!organization.slug.startsWith('founder-demo-')) {
      return { ok: false, error: 'This is not a demo workspace and cannot be reset from here.' };
    }

    await deleteFounderDemoWorkspace(access, organizationId);
    revalidatePath('/founder/demo-generator');
    return { ok: true };
  } catch (error) {
    console.error('[demo-generator] resetDemoWorkspace failed', error);
    return { ok: false, error: safeErrorMessage(error) };
  }
}

export async function previewDemoSampleData(input: {
  industry: string;
  companySize: string;
  companyName?: string;
  domain?: string;
}): Promise<{ ok: true; data: DemoSamplePreview } | { ok: false; error: string }> {
  try {
    // Read-only: any authenticated Founder (including read-only) may
    // preview — only generation/reset require write access.
    const access = await getFounderAccess();
    if (!access.ok) return { ok: false, error: 'Not authorized.' };
    if (!demoIndustries.includes(input.industry as DemoIndustry)) return { ok: false, error: 'Select a valid industry.' };
    if (!demoCompanySizes.includes(input.companySize as DemoCompanySize)) return { ok: false, error: 'Select a valid company size.' };

    const data = previewDemoSample(input.industry as DemoIndustry, input.companySize as DemoCompanySize, input.companyName?.trim(), input.domain?.trim());
    return { ok: true, data };
  } catch (error) {
    console.error('[demo-generator] previewDemoSampleData failed', error);
    return { ok: false, error: safeErrorMessage(error) };
  }
}
