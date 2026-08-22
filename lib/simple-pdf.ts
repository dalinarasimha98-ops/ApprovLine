/**
 * Minimal, dependency-free single-page PDF writer - originally lived only in
 * app/api/export/approvals/route.ts; extracted here so
 * app/api/approvals/[id]/evidence/route.ts can reuse it instead of
 * duplicating the PDF object/xref writing logic. Deliberately basic (one
 * page, one fixed-width font, plain text lines) - this exists to produce a
 * genuinely openable PDF from plain-text content, not a full layout engine.
 */
export function escapePdfText(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)').replaceAll('\n', ' ');
}

export function createSimplePdf(lines: string[]) {
  const objects: string[] = [];
  const contentLines = lines.slice(0, 42).flatMap((line, index) => {
    const y = 760 - index * 16;
    return [`BT /F1 9 Tf 42 ${y} Td (${escapePdfText(line.slice(0, 118))}) Tj ET`];
  });
  const stream = contentLines.join('\n');

  objects.push('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj');
  objects.push('2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj');
  objects.push(
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
  );
  objects.push('4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj');
  objects.push(`5 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj`);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${object}\n`;
  }
  const xrefAt = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return pdf;
}
