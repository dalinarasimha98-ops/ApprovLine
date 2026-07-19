import { createHash } from "node:crypto";
import { z } from "zod";

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

export const publicLeadSchema = z
  .object({
    kind: z.enum(["contact", "demo"]),
    firstName: text(1, 80),
    lastName: text(1, 80),
    email: z.string().trim().email().max(254),
    company: text(2, 160),
    companySize: optionalText(50),
    industry: optionalText(100),
    department: optionalText(100),
    tools: optionalText(300),
    interest: optionalText(120),
    topic: optionalText(120),
    message: text(10, 4_000),
    consent: z.literal(true),
    website: z.string().max(0).optional().or(z.literal("")),
    idempotencyKey: z.string().trim().min(16).max(120),
    sourcePath: z.string().trim().max(200).optional(),
  })
  .superRefine((value, context) => {
    if (value.kind === "demo") {
      for (const key of [
        "companySize",
        "industry",
        "department",
        "tools",
        "interest",
      ] as const) {
        if (!value[key])
          context.addIssue({
            code: "custom",
            path: [key],
            message: "Required for demo requests",
          });
      }
    } else if (!value.topic) {
      context.addIssue({
        code: "custom",
        path: ["topic"],
        message: "Select a contact team",
      });
    }
  });

export type PublicLeadInput = z.infer<typeof publicLeadSchema>;

export function sanitizeLeadText(value: string | undefined) {
  if (!value) return undefined;
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

export function leadDuplicateKey(
  input: Pick<PublicLeadInput, "kind" | "email" | "company">,
  now = new Date(),
) {
  const day = now.toISOString().slice(0, 10);
  return createHash("sha256")
    .update(
      `${input.kind}:${input.email.toLowerCase()}:${input.company.toLowerCase()}:${day}`,
    )
    .digest("hex");
}

export function hashNetworkIdentifier(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
