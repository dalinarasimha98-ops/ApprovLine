// Client-safe constants and types for onboarding - no Prisma, no next/cache,
// nothing server-only. components/onboarding/CustomerOnboardingWizard.tsx
// ('use client') imports directly from this file rather than from
// services/onboarding.ts, which re-exports everything here for server-side
// consumers but also pulls in unstable_cache/revalidateTag - importing that
// from a client component breaks the build ("You're importing a component
// that needs revalidateTag...").

export const onboardingStepKeys = [
  'organization',
  'team',
  'departments',
  'categories',
  'integrations',
  'playbooks',
  'memory',
  'copilot',
  'validation',
  'go-live',
] as const;

export type OnboardingStepKey = (typeof onboardingStepKeys)[number];

export const onboardingStepLabels: Record<OnboardingStepKey, string> = {
  organization: 'Organization Setup',
  team: 'Team Setup',
  departments: 'Department Configuration',
  categories: 'Approval Categories',
  integrations: 'Integration Connections',
  playbooks: 'Playbook AI Setup',
  memory: 'Memory Graph Initialization',
  copilot: 'AI Copilot Readiness',
  validation: 'Workspace Validation',
  'go-live': 'Go Live',
};

export type TeamInviteDraft = {
  name: string;
  email: string;
  role: string;
};

export type IntegrationDraft = {
  provider: string;
  status: 'Not Connected' | 'Connected' | 'Requires Attention' | 'Skipped';
};

export type PlaybookDraft = {
  name: string;
  category: string;
  status: 'Ready' | 'Processing' | 'Needs Review';
  summary?: string;
};

export type CopilotSetupDraft = {
  dataSources: string[];
  permissions: string[];
  scope: string;
};

export type OnboardingPatch = {
  step?: number;
  completedStep?: OnboardingStepKey;
  organization?: {
    name?: string;
    companyDomain?: string;
    industry?: string;
    companySize?: string;
    country?: string;
    primaryAdminName?: string;
    primaryAdminEmail?: string;
  };
  invitedTeamMembers?: TeamInviteDraft[];
  departments?: string[];
  approvalCategories?: string[];
  integrationSetup?: IntegrationDraft[];
  playbookSetup?: PlaybookDraft[];
  copilotSetup?: CopilotSetupDraft;
  memoryGraphInitialized?: boolean;
  complete?: boolean;
};
