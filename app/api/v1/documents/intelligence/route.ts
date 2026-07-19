import { NextRequest, NextResponse } from "next/server";
import { distributedRateLimit } from "@/lib/rate-limit";
import { measure } from "@/lib/performance";
import { authorizeGatewayRequest } from "@/lib/gateway-auth";
import { ingestGatewayArtifact } from "@/services/gateway/universalGateway";
import { extractPlaybookText } from "@/services/playbooks";

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

    const form = await request.formData();
    const file = form.get("file");
    const sourceSystem = String(form.get("source_system") ?? "document-upload");
    const tenantSlug = form.get("tenant_slug")
      ? String(form.get("tenant_slug"))
      : undefined;

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
      organizationSlug: tenantSlug,
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
