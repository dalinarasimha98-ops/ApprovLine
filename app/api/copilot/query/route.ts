import { NextResponse } from "next/server";
import { z } from "zod";
import { getDashboardTenant } from "@/lib/auth";
import { answerCopilotQuestion } from "@/services/copilot/copilot";
import { recordPerformance } from "@/lib/performance";
import { EntitlementDeniedError, requireEntitlement } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

const COPILOT_TENANT_TIMEOUT_MS = 8000;

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const requestSchema = z.object({
  question: z.string().min(3).max(1000),
  history: z.array(messageSchema).max(12).optional(),
});

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const tenant = await getDashboardTenant(COPILOT_TENANT_TIMEOUT_MS);
    if (tenant.status === "unauthenticated") {
      recordPerformance("/api/copilot/query", Date.now() - startedAt, 401);
      return NextResponse.json(
        { error: "Sign in to use ApprovLine Copilot." },
        { status: 401 },
      );
    }
    if (!tenant.organization) {
      recordPerformance("/api/copilot/query", Date.now() - startedAt, 503);
      return NextResponse.json(
        { error: tenant.error ?? "Workspace is not ready yet." },
        { status: 503 },
      );
    }

    const parsed = requestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      recordPerformance("/api/copilot/query", Date.now() - startedAt, 400);
      return NextResponse.json(
        {
          error:
            "Ask a clear question about approvals, risks, policies, evidence, or investigations.",
        },
        { status: 400 },
      );
    }

    await requireEntitlement(tenant.organization.id, "copilot");

    const answer = await answerCopilotQuestion({
      organizationId: tenant.organization.id,
      actorUserId: tenant.user?.id,
      question: parsed.data.question,
      history: parsed.data.history,
    });

    recordPerformance("/api/copilot/query", Date.now() - startedAt, 200);
    return NextResponse.json(answer);
  } catch (error) {
    if (error instanceof EntitlementDeniedError) {
      recordPerformance("/api/copilot/query", Date.now() - startedAt, 403);
      return NextResponse.json(
        { error: error.message, code: "ENTITLEMENT_REQUIRED" },
        { status: 403 },
      );
    }
    console.error("[copilot] query failed", error);
    recordPerformance("/api/copilot/query", Date.now() - startedAt, 500);
    return NextResponse.json(
      {
        error:
          "Copilot could not safely answer this question. Try a narrower question or open service readiness.",
      },
      { status: 500 },
    );
  }
}
