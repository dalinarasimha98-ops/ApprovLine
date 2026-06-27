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

export const CLASSIFIER_MODEL = 'gpt-4.1-mini';

export function hashClassifierInput(input: ClassifyRequest) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

export async function classifyWithOpenAI(input: ClassifyRequest): Promise<ClassifyResponse> {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
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

  return classifierSchema.parse(JSON.parse(content));
}

export { CLASSIFIER_PROMPT_VERSION };
