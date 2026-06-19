export function getTimestampUrl(
  videoUrl: string | undefined,
  timestampSeconds: number
): string {
  if (!videoUrl) return '';
  try {
    const url = new URL(videoUrl);
    const hostname = url.hostname.toLowerCase();
    const pathname = url.pathname.toLowerCase();

    // Check if it's a YouTube shorts URL
    const isShorts = pathname.startsWith('/shorts/');
    // Check if it's a youtu.be short URL
    const isShortLink = hostname === 'youtu.be';

    if (isShorts || isShortLink) {
      // Shorts URL & Short Links format: ?t=25 (no 's' suffix)
      url.searchParams.set('t', String(timestampSeconds));
    } else {
      // Watch URL format: &t=25s (with 's' suffix)
      url.searchParams.set('t', `${timestampSeconds}s`);
    }

    return url.toString();
  } catch (e) {
    // Gracefully handle invalid URLs
    if (videoUrl) {
      const separator = videoUrl.includes('?') ? '&' : '?';
      return `${videoUrl}${separator}t=${timestampSeconds}`;
    }
    return '';
  }
}
