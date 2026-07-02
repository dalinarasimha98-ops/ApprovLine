import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';

const providerUrls: Record<string, string> = {
  slack: 'https://slack.com/oauth/v2/authorize',
  gmail: 'https://accounts.google.com/o/oauth2/v2/auth',
  teams: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  zoom: 'https://zoom.us/oauth/authorize',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  await requireRole('ADMIN');
  const { provider } = await params;
  if (provider === 'slack') {
    return NextResponse.redirect(new URL('/api/integrations/slack/install', request.url));
  }
  if (provider === 'gmail') {
    return NextResponse.redirect(new URL('/api/integrations/gmail/install', request.url));
  }
  if (provider === 'outlook' || provider === 'exchange') {
    return NextResponse.redirect(new URL('/api/integrations/outlook/install', request.url));
  }
  if (provider === 'teams') {
    return NextResponse.redirect(new URL('/api/integrations/teams/install', request.url));
  }

  const target = providerUrls[provider];
  if (!target) return NextResponse.json({ error: 'Unsupported provider' }, { status: 404 });

  const redirectUri = new URL(`/api/integrations/oauth/${provider}/callback`, request.url).toString();
  const url = new URL(target);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', crypto.randomUUID());

  return NextResponse.redirect(url);
}
