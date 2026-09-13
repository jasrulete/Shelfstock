/**
 * The only place a `?next=` parameter is allowed to send a user after login.
 *
 * A string check - "starts with / but not //" - is not enough: the WHATWG URL
 * parser treats a backslash as a slash for http(s), so "/\evil.com" resolves
 * to https://evil.com/, and the App Router then performs a full-page
 * navigation to it. Resolving the value exactly as the router will, and
 * comparing origins, refuses every spelling of "somewhere else" at once.
 * Anything that does not parse, or lands on another origin, goes home.
 *
 * Returns a path (with query and hash), never an absolute URL, so the caller
 * is never handed an origin at all.
 */
export function safeNext(raw: string | null | undefined, origin: string): string {
  if (!raw) return '/';
  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return '/';
  }
  if (url.origin !== origin) return '/';
  return url.pathname + url.search + url.hash;
}
