export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
      status: 'ok',
      service: 'ApprovLine',
      timestamp: new Date().toISOString(),
  });
}
