export function normalizePageUrl(url: string): string {
  const trimmedUrl = url.trim();

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmedUrl)) {
    return trimmedUrl;
  }

  if (trimmedUrl.startsWith("//")) {
    return `https:${trimmedUrl}`;
  }

  return `https://${trimmedUrl}`;
}
