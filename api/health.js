export default async function handler() {
  return new Response(
    JSON.stringify({
      status: 'ok',
      service: 'ApprovLine',
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    }
  );
}
