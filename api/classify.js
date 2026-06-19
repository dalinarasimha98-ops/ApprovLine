export default async function handler(req) {
  const origin = req.headers.get('origin') || '';
  const allowedOrigins = [
    'https://approvline.com',
    'https://www.approvline.com',
    'https://approline.com',
    'https://www.approline.com',
    'http://localhost:3000',
    'http://localhost:4173',
  ];
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers,
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers,
    });
  }

  const { message, source } = body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'message is required' }), {
      status: 400,
      headers,
    });
  }

  if (message.length > 4000) {
    return new Response(JSON.stringify({ error: 'message too long (max 4000 chars)' }), {
      status: 400,
      headers,
    });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured' }),
      { status: 500, headers }
    );
  }

  const SYSTEM = `You are ApprovLine's decision classification engine. Analyze business messages and extract approval intelligence.

Respond ONLY with a valid JSON object, no markdown, no preamble. Schema:
{
  "verdict": "APPROVED" | "CONDITIONAL" | "REJECTED" | "ESCALATION" | "NOT_A_DECISION",
  "confidence": <integer 0-100>,
  "summary": "<one sentence: what was decided, by whom, about what>",
  "approver": "<name or role if identifiable, else 'Unknown'>",
  "subject": "<what the decision is about, 3-6 words>",
  "condition": "<condition string if CONDITIONAL, else 'None'>",
  "reasoning": "<2-3 sentences explaining why you classified it this way>"
}`;

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Source: ${source || 'Unknown'}\n\nMessage:\n${message.trim()}`,
        },
      ],
    }),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    console.error('Anthropic API error:', anthropicRes.status, errText);
    return new Response(
      JSON.stringify({ error: 'Classification service unavailable' }),
      { status: 502, headers }
    );
  }

  const data = await anthropicRes.json();
  const raw = data.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .replace(/```json|```/g, '')
    .trim();

  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    console.error('Failed to parse Claude response:', raw);
    return new Response(
      JSON.stringify({ error: 'Failed to parse classification result' }),
      { status: 500, headers }
    );
  }

  return new Response(JSON.stringify(result), { status: 200, headers });
}
