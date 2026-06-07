const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/api/')) return `${API_BASE}${url}`;
  return url;
}
