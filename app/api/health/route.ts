import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'ApprovLine',
    timestamp: new Date().toISOString(),
  });
}
