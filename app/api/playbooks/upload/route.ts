import { NextResponse } from "next/server";
import { getDashboardTenant } from "@/lib/auth";
import {
  extractPlaybookText,
  indexPlaybookDocument,
} from "@/services/playbooks";
import { EntitlementDeniedError, requireEntitlement } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

const allowedExtensions = new Set(["pdf", "docx", "txt", "md", "markdown"]);

export async function POST(request: Request) {
  try {
    const tenant = await getDashboardTenant(4000);
    if (tenant.status === "unauthenticated")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!tenant.organization)
      return NextResponse.json(
        { error: tenant.error ?? "Workspace unavailable." },
        { status: 503 },
      );
    await requireEntitlement(tenant.organization.id, "playbook_ai");

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Upload a PDF, DOCX, TXT, or Markdown file." },
        { status: 400 },
      );
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Playbook file must be 10 MB or smaller." },
        { status: 413 },
      );
    }

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!allowedExtensions.has(extension)) {
      return NextResponse.json(
        { error: "Unsupported playbook file type." },
        { status: 400 },
      );
    }

    const content = await extractPlaybookText(file);
    if (content.length < 40) {
      return NextResponse.json(
        { error: "Could not extract enough text from this document." },
        { status: 400 },
      );
    }

    const category = String(form.get("category") ?? "").trim();
    const document = await indexPlaybookDocument({
      organizationId: tenant.organization.id,
      ownerUserId: tenant.user?.id,
      name: file.name,
      fileType: extension,
      content,
      category: category || undefined,
      metadata: {
        category: category || undefined,
        originalSize: file.size,
        contentType: file.type || "unknown",
      },
    });

    return NextResponse.json({ document });
  } catch (error) {
    if (error instanceof EntitlementDeniedError) {
      return NextResponse.json(
        { error: error.message, code: "ENTITLEMENT_REQUIRED" },
        { status: 403 },
      );
    }
    console.error("[playbooks] upload failed", error);
    return NextResponse.json(
      { error: "The playbook could not be processed safely." },
      { status: 500 },
    );
  }
}
