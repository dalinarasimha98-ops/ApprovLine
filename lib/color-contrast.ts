/**
 * Real W3C relative-luminance / contrast-ratio math (not an approximation).
 * Extracted from tests/theme.test.ts, which used this to verify design
 * tokens meet WCAG AA - now also the server-side validator for a
 * customer-supplied Organization brand color
 * (app/api/settings/organization/branding/route.ts), so a brand color that
 * would make text unreadable is rejected before it can ever be persisted.
 */

export type RgbTuple = [number, number, number];

const HEX_PATTERN = /^#([0-9a-fA-F]{6})$/;

export function isValidHexColor(value: string): boolean {
  return HEX_PATTERN.test(value);
}

export function hexToRgb(hex: string): RgbTuple | null {
  const match = HEX_PATTERN.exec(hex);
  if (!match) return null;
  const int = parseInt(match[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

export function relativeLuminance([r, g, b]: RgbTuple): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const channel = c / 255;
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function contrastRatio(a: RgbTuple, b: RgbTuple): number {
  const [la, lb] = [relativeLuminance(a), relativeLuminance(b)];
  const [lighter, darker] = la > lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

export const AA_NORMAL_TEXT_CONTRAST = 4.5;
