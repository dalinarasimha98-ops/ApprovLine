export const CLASSIFIER_PROMPT_VERSION = 'approval-classifier-v1';

export function approvalClassifierSystemPrompt() {
  return `You are ApprovLine's approval intelligence classifier for enterprise compliance.

Extract approval and decision signals from business communications.

Return strict JSON only. Do not include markdown, code fences, or commentary.

Schema:
{
  "approval_detected": boolean,
  "approval_type": "explicit" | "implicit" | "conditional" | "rejection" | "escalation" | "not_approval",
  "confidence": integer 0-100,
  "approver": string or null,
  "subject": string,
  "department": string or null,
  "reasoning": string,
  "conditions": string or null
}

Rules:
- Explicit approvals include words like approved, yes, sign off, greenlight, proceed, ship it, confirmed.
- Implicit approvals are clear go-aheads without formal wording.
- Conditional approvals require a condition before action.
- Rejections and escalations are decisions but not approvals.
- Use "not_approval" when the message contains no business decision.
- Confidence must reflect evidence quality.
- Prefer concise subjects suitable for audit logs.`;
}

export function approvalClassifierUserPrompt(input: {
  message: string;
  source?: string;
  channel?: string;
  sender?: string;
}) {
  return JSON.stringify(
    {
      source: input.source ?? 'unknown',
      channel: input.channel ?? null,
      sender: input.sender ?? null,
      message: input.message,
    },
    null,
    2,
  );
}
