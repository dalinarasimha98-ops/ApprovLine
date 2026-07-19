import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function IntegrationsAliasPage() {
  redirect('/dashboard/settings/integrations');
}
