export type ApprovalType =
  | 'explicit'
  | 'implicit'
  | 'conditional'
  | 'rejection'
  | 'escalation'
  | 'not_approval';

export type ApprovalCategory =
  | 'Finance'
  | 'Procurement'
  | 'Legal'
  | 'HR'
  | 'Engineering'
  | 'Security'
  | 'Compliance';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ClassifyRequest {
  message: string;
  source?: string;
  channel?: string;
  sender?: string;
  sender_email?: string;
  senderEmail?: string;
  slack_user?: string;
  teams_user?: string;
  zoom_participant?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface ClassifyResponse {
  approval_detected: boolean;
  approval_type: ApprovalType;
  confidence: number;
  approver: string | null;
  approver_name: string | null;
  approver_email: string | null;
  approval_timestamp: string | null;
  source_platform: string | null;
  risk_level: RiskLevel;
  business_impact: string;
  category: ApprovalCategory | null;
  subject: string;
  department: string | null;
  reasoning: string;
  conditions: string | null;
}
