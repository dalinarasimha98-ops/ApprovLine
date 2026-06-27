export type ApprovalType =
  | 'explicit'
  | 'implicit'
  | 'conditional'
  | 'rejection'
  | 'escalation'
  | 'not_approval';

export interface ClassifyRequest {
  message: string;
  source?: string;
  channel?: string;
  sender?: string;
}

export interface ClassifyResponse {
  approval_detected: boolean;
  approval_type: ApprovalType;
  confidence: number;
  approver: string | null;
  subject: string;
  department: string | null;
  reasoning: string;
  conditions: string | null;
}
