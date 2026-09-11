import { NextRequest, NextResponse } from "next/server";
import { distributedRateLimit } from "@/lib/rate-limit";
import { measure } from "@/lib/performance";
import { authorizeGatewayRequest } from "@/lib/gateway-auth";
import { getGatewayOrganization, ingestGatewayArtifact } from "@/services/gateway/universalGateway";
import { extractPlaybookText } from "@/services/playbooks";
import { EntitlementDeniedError, requireEntitlement } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return measure("POST /api/v1/documents/intelligence", async () => {
    const authorization = authorizeGatewayRequest(request);
    if (!authorization.ok) {
      return NextResponse.json(
        { error: authorization.error },
        { status: authorization.status },
      );
    }
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const limit = await distributedRateLimit(
      `gateway-document:${ip}`,
      30,
      60_000,
    );
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429 },
      );
    }

    // Resolve the organization once, from the server-authoritative slug
    // bound to this API key — never from the client form — so the
    // entitlement check below and the ingestion call afterward agree on the
    // same organization.
    const organization = await getGatewayOrganization(authorization.orgSlug);
    try {
      await requireEntitlement(organization.id, "universal_gateway");
    } catch (error) {
      if (error instanceof EntitlementDeniedError) {
        return NextResponse.json(
          { error: error.message, code: "ENTITLEMENT_REQUIRED" },
          { status: 403 },
        );
      }
      throw error;
    }

    const form = await request.formData();
    const file = form.get("file");
    const sourceSystem = String(form.get("source_system") ?? "document-upload");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Document file is required as form field `file`." },
        { status: 400 },
      );
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Document must be 10 MB or smaller." },
        { status: 413 },
      );
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["pdf", "docx", "txt", "md"].includes(extension)) {
      return NextResponse.json(
        {
          error: "Supported document formats are PDF, DOCX, TXT, and Markdown.",
        },
        { status: 415 },
      );
    }

    const content = await extractPlaybookText(file);
    if (!content.trim()) {
      return NextResponse.json(
        { error: "No readable text could be extracted from the document." },
        { status: 422 },
      );
    }
    const results = await ingestGatewayArtifact({
      organizationId: organization.id,
      sourceSystem,
      artifactType: "document",
      name: file.name,
      content,
      metadata: {
        contentType: file.type,
        size: file.size,
        supportedFormats: [
          "PDF",
          "DOCX",
          "PO",
          "SOW",
          "Contract",
          "Invoice",
          "TXT",
          "Markdown",
        ],
      },
    });

    return NextResponse.json({
      ok: true,
      document: file.name,
      extractedApprovals: results.length,
      backgroundJobIds: results
        .map((item) => item.backgroundJobId)
        .filter(Boolean),
      correlationIds: results.map((item) => item.correlationId),
    });
  });
}
