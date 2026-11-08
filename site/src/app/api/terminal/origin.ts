/**
 * Whether a state-changing request comes from this site's own pages. Next can
 * construct request.url with its internal hostname; Host is the browser's
 * destination and can't be set by a cross-origin page's scripts.
 */
export function sameOrigin(request: Request) {
  const destination = new URL(request.url);
  if (request.headers.get("host")) destination.host = request.headers.get("host")!;
  return request.headers.get("origin") === destination.origin;
}
