import crypto from 'node:crypto';
import zlib from 'node:zlib';
import OpenAI from 'openai';
import { prisma } from '@/lib/prisma';
import { env } from '@/config/env';
import type { Prisma } from '@prisma/client';

const embeddingDimensions = 96;

type SourceMatch = {
  chunkId: string;
  documentId: string;
  documentName: string;
  sectionTitle: string;
  content: string;
  score: number;
};

export type PlaybookAnswer = {
  answer: string;
  requiredApprovers: string[];
  requiredDepartments: string[];
  policySections: Array<{ document: string; section: string; excerpt: string }>;
  evidenceMissing: string[];
  compliant: 'yes' | 'no' | 'needs_review';
  confidence: number;
};

function sha256(value: string | Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stripBinaryNoise(value: string) {
  return value
    .replace(/\u0000/g, ' ')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractZipEntry(buffer: Buffer, targetName: string) {
  let offset = 0;
  while (offset < buffer.length - 30) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) {
      offset += 1;
      continue;
    }

    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buffer.subarray(nameStart, nameStart + fileNameLength).toString('utf8');
    const dataStart = nameStart + fileNameLength + extraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);

    if (name === targetName) {
      if (compression === 0) return data.toString('utf8');
      if (compression === 8) return zlib.inflateRawSync(data).toString('utf8');
      return null;
    }

    offset = dataStart + compressedSize;
  }
  return null;
}

export async function extractPlaybookText(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const raw = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  const extension = file.name.split('.').pop()?.toLowerCase() ?? 'txt';

  if (extension === 'txt' || extension === 'md' || file.type.includes('text')) {
    return stripBinaryNoise(raw);
  }

  if (extension === 'pdf') {
    const textFragments = raw.match(/\(([^()]{8,})\)/g)?.map((item) => item.slice(1, -1)) ?? [];
    const fallback = textFragments.length > 10 ? textFragments.join('\n') : raw.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ');
    return stripBinaryNoise(fallback);
  }

  if (extension === 'docx') {
    const documentXml = extractZipEntry(buffer, 'word/document.xml') ?? raw;
    const xmlText = documentXml
      .replace(/<w:p[^>]*>/g, '\n')
      .replace(/<w:tab\/>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    return stripBinaryNoise(xmlText);
  }

  return stripBinaryNoise(raw);
}

function sectionTitleFor(chunk: string, index: number) {
  const heading = chunk
    .split('\n')
    .map((line) => line.trim().replace(/^#+\s*/, ''))
    .find((line) => line.length > 0 && line.length < 90);
  return heading ?? `Section ${index + 1}`;
}

export function chunkPlaybookContent(content: string) {
  const paragraphs = content.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs.length ? paragraphs : [content]) {
    if (`${current}\n\n${paragraph}`.length > 1800 && current.length > 0) {
      chunks.push(current.trim());
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [content.slice(0, 1800)];
}

function localEmbedding(text: string) {
  const vector = Array.from({ length: embeddingDimensions }, () => 0);
  const tokens = text.toLowerCase().match(/[a-z0-9$,.]+/g) ?? [];
  for (const token of tokens) {
    const hash = crypto.createHash('sha1').update(token).digest();
    const index = hash[0] % embeddingDimensions;
    vector[index] += 1 + Math.min(token.length, 12) / 12;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / norm).toFixed(6)));
}

export async function embedText(text: string) {
  if (!env.OPENAI_API_KEY) return localEmbedding(text);

  try {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000),
      dimensions: embeddingDimensions,
    });
    return response.data[0]?.embedding ?? localEmbedding(text);
  } catch (error) {
    console.warn('[playbooks] OpenAI embeddings unavailable, using local fallback', error);
    return localEmbedding(text);
  }
}

function cosineSimilarity(left: number[], right: number[]) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  return dot / ((Math.sqrt(leftNorm) || 1) * (Math.sqrt(rightNorm) || 1));
}

export async function indexPlaybookDocument(input: {
  organizationId: string;
  ownerUserId?: string;
  name: string;
  fileType: string;
  content: string;
  metadata?: Record<string, unknown>;
}) {
  const contentHash = sha256(input.content);
  const document = await prisma.playbookDocument.create({
    data: {
      organizationId: input.organizationId,
      ownerUserId: input.ownerUserId,
      name: input.name,
      fileType: input.fileType,
      status: 'INDEXING',
      contentHash,
      metadata: input.metadata as Prisma.InputJsonValue,
    },
  });

  try {
    const chunks = chunkPlaybookContent(input.content);
    for (const [index, content] of chunks.entries()) {
      const embedding = await embedText(content);
      await prisma.playbookChunk.create({
        data: {
          organizationId: input.organizationId,
          documentId: document.id,
          chunkIndex: index,
          content,
          sectionTitle: sectionTitleFor(content, index),
          tokenEstimate: Math.ceil(content.length / 4),
          embedding,
          metadata: {
            demo: Boolean(input.metadata?.demo),
            contentHash,
          },
        },
      });
    }

    return prisma.playbookDocument.update({
      where: { id: document.id },
      data: {
        status: 'READY',
        lastIndexedAt: new Date(),
        metadata: {
          ...(input.metadata ?? {}),
          chunkCount: chunks.length,
        } as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    await prisma.playbookDocument.update({
      where: { id: document.id },
      data: {
        status: 'ERROR',
        metadata: {
          ...(input.metadata ?? {}),
          error: error instanceof Error ? error.message : 'indexing_failed',
        } as Prisma.InputJsonValue,
      },
    });
    throw error;
  }
}

export async function searchPlaybookChunks(organizationId: string, question: string, limit = 5): Promise<SourceMatch[]> {
  const queryEmbedding = await embedText(question);
  const chunks = await prisma.playbookChunk.findMany({
    where: {
      organizationId,
      document: { status: 'READY' },
    },
    include: { document: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return chunks
    .map((chunk) => ({
      chunkId: chunk.id,
      documentId: chunk.documentId,
      documentName: chunk.document.name,
      sectionTitle: chunk.sectionTitle ?? `Section ${chunk.chunkIndex + 1}`,
      content: chunk.content,
      score: cosineSimilarity(queryEmbedding, Array.isArray(chunk.embedding) ? chunk.embedding.map(Number) : []),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function inferGuidance(question: string, sources: SourceMatch[]): PlaybookAnswer {
  const combined = `${question}\n${sources.map((source) => source.content).join('\n')}`.toLowerCase();
  const departments = new Set<string>();
  const approvers = new Set<string>();
  const missing = new Set<string>();

  if (/\b(contract|vendor|procurement|purchase|supplier|po)\b/.test(combined)) {
    departments.add('Procurement');
    approvers.add('Procurement approval');
    missing.add('Vendor risk review evidence');
  }
  if (/\b(contract|msa|terms|legal|signature|liability)\b/.test(combined)) {
    departments.add('Legal');
    approvers.add('Legal approval');
    missing.add('Final contract redlines or legal sign-off');
  }
  if (/\b(\$|budget|spend|payment|invoice|finance|amount|cost)\b/.test(combined)) {
    departments.add('Finance');
    approvers.add('Finance approval');
    missing.add('Budget owner approval and spend amount');
  }
  if (/\b(security|soc 2|data|access|pii|gdpr|compliance|risk)\b/.test(combined)) {
    departments.add('Security');
    departments.add('Compliance');
    approvers.add('Security or Compliance approval');
    missing.add('Security/compliance evidence packet');
  }
  if (/\b(employee|candidate|offer|compensation|hr)\b/.test(combined)) {
    departments.add('HR');
    approvers.add('HR approval');
    missing.add('People team approval trail');
  }

  if (approvers.size === 0) approvers.add('Manager approval');
  if (departments.size === 0) departments.add('Business owner');

  const confidence = Math.max(72, Math.min(96, Math.round(78 + (sources[0]?.score ?? 0) * 18 + sources.length * 2)));
  const compliant = sources.length === 0 ? 'needs_review' : missing.size > 0 ? 'needs_review' : 'yes';

  return {
    answer: `${Array.from(approvers).join(', ')} required. ${sources[0] ? `Most relevant policy source is ${sources[0].documentName}, ${sources[0].sectionTitle}.` : 'Upload a playbook to improve source-backed guidance.'}`,
    requiredApprovers: Array.from(approvers),
    requiredDepartments: Array.from(departments),
    policySections: sources.map((source) => ({
      document: source.documentName,
      section: source.sectionTitle,
      excerpt: source.content.slice(0, 320),
    })),
    evidenceMissing: Array.from(missing),
    compliant,
    confidence,
  };
}

async function answerWithOpenAI(question: string, sources: SourceMatch[]) {
  if (!env.OPENAI_API_KEY) return null;
  try {
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are ApprovLine Playbook AI. Answer approval governance questions using only provided policy sources. Return JSON with answer, requiredApprovers, requiredDepartments, policySections, evidenceMissing, compliant, confidence.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            question,
            sources: sources.map((source) => ({
              document: source.documentName,
              section: source.sectionTitle,
              excerpt: source.content.slice(0, 1400),
              score: source.score,
            })),
          }),
        },
      ],
      temperature: 0.1,
    });
    const raw = response.choices[0]?.message.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlaybookAnswer>;
    return {
      answer: String(parsed.answer ?? ''),
      requiredApprovers: Array.isArray(parsed.requiredApprovers) ? parsed.requiredApprovers.map(String) : [],
      requiredDepartments: Array.isArray(parsed.requiredDepartments) ? parsed.requiredDepartments.map(String) : [],
      policySections: Array.isArray(parsed.policySections) ? parsed.policySections as PlaybookAnswer['policySections'] : [],
      evidenceMissing: Array.isArray(parsed.evidenceMissing) ? parsed.evidenceMissing.map(String) : [],
      compliant: parsed.compliant === 'yes' || parsed.compliant === 'no' ? parsed.compliant : 'needs_review',
      confidence: Math.max(1, Math.min(99, Number(parsed.confidence ?? 85))),
    } satisfies PlaybookAnswer;
  } catch (error) {
    console.warn('[playbooks] OpenAI answer generation unavailable, using rules fallback', error);
    return null;
  }
}

export async function queryPlaybooks(input: { organizationId: string; actorUserId?: string; question: string }) {
  const sources = await searchPlaybookChunks(input.organizationId, input.question);
  const aiAnswer = await answerWithOpenAI(input.question, sources);
  const answer = aiAnswer ?? inferGuidance(input.question, sources);
  const stored = await prisma.playbookQuery.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      question: input.question,
      answer: answer as unknown as Prisma.InputJsonValue,
      sourceChunkIds: sources.map((source) => source.chunkId),
      confidence: answer.confidence,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'playbook.query.answered',
      metadata: {
        question: input.question,
        queryId: stored.id,
        confidence: answer.confidence,
        sourceChunkIds: sources.map((source) => source.chunkId),
      },
    },
  });

  return { queryId: stored.id, ...answer };
}

export async function seedDemoPlaybooks(organizationId: string, ownerUserId?: string) {
  const existing = await prisma.playbookDocument.count({
    where: {
      organizationId,
      metadata: {
        path: ['demo'],
        equals: true,
      },
    },
  });
  if (existing > 0) return { created: 0 };

  const samples = [
    {
      name: 'Demo Vendor Procurement Policy.md',
      fileType: 'md',
      content: `# Vendor Procurement Policy

## Section 4.2 Vendor contracts above $25,000
Vendor contracts above $25,000 require Procurement approval, Legal approval, and Finance approval before signature. Security review is required when vendor access includes customer data, production systems, SOC 2 evidence, or subprocessors.

## Section 5.1 Required evidence
Required evidence includes vendor risk review, budget owner approval, final contract redlines, procurement intake form, and payment terms.`,
    },
    {
      name: 'Demo Legal Approval Playbook.md',
      fileType: 'md',
      content: `# Legal Approval Playbook

## Section 2.1 Contract sign-off
Legal owns approval for customer contracts, vendor agreements, data processing terms, liability changes, indemnity, and non-standard payment terms. Legal approval must cite the final redline version.

## Section 3.4 Missing evidence
If final redlines, counterparty name, contract amount, or signature authority are missing, the approval is not complete and should be routed for review.`,
    },
    {
      name: 'Demo Finance Approval Matrix.md',
      fileType: 'md',
      content: `# Finance Approval Matrix

## Section 1.3 Spend thresholds
Budget increases above $10,000 require department manager approval. Spend above $25,000 requires Finance approval. Spend above $50,000 requires Finance leadership approval and procurement evidence.

## Section 1.5 Budget evidence
Approvals must include amount, cost center, business justification, and budget owner.`,
    },
  ];

  for (const sample of samples) {
    await indexPlaybookDocument({
      organizationId,
      ownerUserId,
      name: sample.name,
      fileType: sample.fileType,
      content: sample.content,
      metadata: { demo: true, source: 'ApprovLine demo mode' },
    });
  }

  await prisma.auditLog.create({
    data: {
      organizationId,
      actorUserId: ownerUserId,
      action: 'playbook.demo.seeded',
      metadata: { demo: true, documents: samples.map((sample) => sample.name) },
    },
  });

  return { created: samples.length };
}
