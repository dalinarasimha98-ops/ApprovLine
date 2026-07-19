const PLACEHOLDER_HOSTS = new Set(['example.com', 'example.org', 'example.net']);

export function getSafeEvidenceUrl(value?: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isPlaceholder =
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === 'example' ||
      hostname.endsWith('.example') ||
      PLACEHOLDER_HOSTS.has(hostname) ||
      [...PLACEHOLDER_HOSTS].some((host) => hostname.endsWith(`.${host}`));

    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || isPlaceholder) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}
