import OpenAI from 'openai';
import { z } from 'zod';
import { createHash } from 'crypto';
import { env } from '@/config/env';
import type { ClassifyRequest, ClassifyResponse } from '@/types/classifier';
import {
  approvalClassifierSystemPrompt,
  approvalClassifierUserPrompt,
  CLASSIFIER_PROMPT_VERSION,
} from '@/services/classifier/prompts';

const classifierSchema = z.object({
  approval_detected: z.boolean(),
  approval_type: z.enum(['explicit', 'implicit', 'conditional', 'rejection', 'escalation', 'not_approval']),
  confidence: z.number().int().min(0).max(100),
  approver: z.string().nullable(),
  subject: z.string().min(1),
  department: z.string().nullable(),
  reasoning: z.string().min(1),
  conditions: z.string().nullable(),
});

const OPENAI_MODEL = 'gpt-4.1-mini';
const DEFAULT_ANTHROPIC_MODEL = 'claude-3-5-sonnet-20241022';

export const CLASSIFIER_MODEL = env.ANTHROPIC_API_KEY
  ? env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL
  : OPENAI_MODEL;

export function hashClassifierInput(input: ClassifyRequest) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function parseClassifierJson(content: string) {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  return classifierSchema.parse(JSON.parse(cleaned));
}

async function classifyWithAnthropic(input: ClassifyRequest): Promise<ClassifyResponse> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL,
      max_tokens: 800,
      temperature: 0,
      system: approvalClassifierSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: approvalClassifierUserPrompt(input),
        },
      ],
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message ?? 'Anthropic classification request failed';
    throw new Error(message);
  }

  const text = payload?.content?.find((part: { type?: string }) => part.type === 'text')?.text;
  if (!text) {
    throw new Error('Anthropic returned an empty classification response');
  }

  return parseClassifierJson(text);
}

export async function classifyWithOpenAI(input: ClassifyRequest): Promise<ClassifyResponse> {
  if (env.ANTHROPIC_API_KEY) {
    return classifyWithAnthropic(input);
  }

  if (!env.OPENAI_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY or OPENAI_API_KEY is not configured');
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const completion = await client.chat.completions.create({
    model: CLASSIFIER_MODEL,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: approvalClassifierSystemPrompt() },
      { role: 'user', content: approvalClassifierUserPrompt(input) },
    ],
  });

  const content = completion.choices[0]?.message.content;
  if (!content) {
    throw new Error('OpenAI returned an empty classification response');
  }

  return parseClassifierJson(content);
}

export { CLASSIFIER_PROMPT_VERSION };
