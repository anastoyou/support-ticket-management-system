const rawMediaUrl = (import.meta.env.VITE_MEDIA_URL as string | undefined)?.trim();

export const MEDIA_BASE = rawMediaUrl || '/';

export const getMediaUrl = (url: string): string => {
  if (!url) return '';
  if (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('blob:') ||
    url.startsWith('data:')
  ) {
    return url;
  }

  const cleanPath = url.startsWith('/') ? url : `/${url}`;
  const trimmedBase = MEDIA_BASE.replace(/\/+$/, '');
  if (!trimmedBase) {
    return cleanPath;
  }
  if (trimmedBase.startsWith('/') && cleanPath.startsWith(trimmedBase)) {
    return cleanPath;
  }
  return `${trimmedBase}${cleanPath}`;
};
