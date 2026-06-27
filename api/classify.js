const allowedOrigins = [
  'https://approvline.com',
  'https://www.approvline.com',
  'https://approline.com',
  'https://www.approline.com',
  'http://localhost:3000',
  'http://localhost:4173',
];

function setCorsHeaders(req, res) {
  const origin = req.headers.origin || '';
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
}

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return {};
}

export default async function handler(req, res) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  let body;
  try {
    body = parseBody(req);
  } catch {
    return sendJson(res, 400, { error: 'Invalid JSON body' });
  }

  const { message, source } = body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return sendJson(res, 400, { error: 'message is required' });
  }

  if (message.length > 4000) {
    return sendJson(res, 400, { error: 'message too long (max 4000 chars)' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return sendJson(res, 500, { error: 'ANTHROPIC_API_KEY is not configured' });
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

  try {
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
      return sendJson(res, 502, { error: 'Classification service unavailable' });
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
      return sendJson(res, 500, { error: 'Failed to parse classification result' });
    }

    return sendJson(res, 200, result);
  } catch (error) {
    console.error('Classifier route error:', error);
    return sendJson(res, 500, { error: 'Classifier route failed' });
  }
}
