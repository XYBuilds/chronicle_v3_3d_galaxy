/**
 * P23.6: production Pages hostname → canonical apex (301).
 * Match only `the-movie-cosmos.pages.dev` so branch preview hosts are unchanged.
 *
 * @param {{ request: Request; next: () => Promise<Response> }} context
 */
export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === "the-movie-cosmos.pages.dev") {
    const target = new URL(url.pathname + url.search, "https://themoviecosmos.com");
    return Response.redirect(target.href, 301);
  }
  return context.next();
}
