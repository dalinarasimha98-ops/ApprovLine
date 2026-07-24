type ConfirmationDeliveryInput = {
  to: string;
  approverName: string;
  subject: string;
  confirmationUrl: string;
  expiresAt: Date;
  conditions: string | null;
  approvalTimestamp: Date | null;
  recorderName: string;
};

export type ConfirmationDeliveryResult = {
  delivery: 'email' | 'copy_secure_link';
  providerMessageId?: string;
  reason?: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character] ?? character);
}

export async function deliverApprovalConfirmation(
  input: ConfirmationDeliveryInput,
): Promise<ConfirmationDeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = (process.env.APPROVLINE_CONFIRMATION_FROM_EMAIL ?? process.env.EMAIL_FROM)?.trim();
  if (!apiKey || !from) {
    return {
      delivery: 'copy_secure_link',
      reason: 'Email delivery is not configured. Use the secure confirmation link.',
    };
  }

  const conditions = input.conditions
    ? `<p><strong>Conditions:</strong> ${escapeHtml(input.conditions)}</p>`
    : '';
  const approvalTimestamp = input.approvalTimestamp
    ? input.approvalTimestamp.toISOString()
    : 'Not specified';

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: `Confirm approval record: ${input.subject}`,
        html: `<p>Hello ${escapeHtml(input.approverName)},</p>
          <p>${escapeHtml(input.recorderName)} recorded the following approval and requested your confirmation.</p>
          <p><strong>Decision:</strong> ${escapeHtml(input.subject)}</p>
          <p><strong>Approval timestamp:</strong> ${escapeHtml(approvalTimestamp)}</p>
          ${conditions}
          <p><a href="${escapeHtml(input.confirmationUrl)}">Review and respond to this approval record</a></p>
          <p>This secure link expires on ${escapeHtml(input.expiresAt.toISOString())}. If you did not make this decision, reject or correct the record.</p>`,
      }),
      signal: AbortSignal.timeout(5_000),
    });
    const payload = await response.json().catch(() => ({})) as { id?: string; message?: string };
    if (!response.ok) {
      return {
        delivery: 'copy_secure_link',
        reason: payload.message ?? `Email provider returned ${response.status}.`,
      };
    }
    return { delivery: 'email', providerMessageId: payload.id };
  } catch (error) {
    return {
      delivery: 'copy_secure_link',
      reason: error instanceof Error ? error.message : 'Email delivery failed.',
    };
  }
}
