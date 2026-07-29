/**
 * One place that knows how a `usePathname()` value compares to a route written
 * as a plain href.
 *
 * `next.config.ts` sets `trailingSlash: true`, so the live pathname is
 * "/journal/" while every href in the app is written "/journal". Two features
 * now depend on that comparison - the nav's active-link marking
 * (`site-nav.tsx`) and the subscription gate's route exemption
 * (`subscription-guard.tsx`) - and a second hand-rolled copy of the rule is a
 * silent drift hazard: a gate that stops matching its exempt route would still
 * look correct in review and would only show up as a locked-out person.
 *
 * `basePath` (the repo name in production, derived in `site-base-path.mjs`) is NOT
 * part of the value Next gives `usePathname()`, so it is deliberately not
 * handled here. Verified against the live export rather than assumed: fetching
 * the deployed /journal/ page shows `aria-current="page"` already resolved
 * onto the basePath-prefixed `href=".../journal/"` link, which is exactly this
 * comparison succeeding in production.
 */

/**
 * Reduce a pathname to its canonical, comparable form: no trailing slashes,
 * and "/" for the root. A null pathname (Next returns null before the router
 * is ready) reads as the root.
 */
export function normalizeRoutePath(pathname: string | null | undefined): string {
  if (!pathname) {
    return "/";
  }

  const withoutTrailingSlash = pathname.replace(/\/+$/, "");
  return withoutTrailingSlash === "" ? "/" : withoutTrailingSlash;
}

/** True when `pathname` addresses `route`, whatever trailing-slash form it arrives in. */
export function isRoute(pathname: string | null | undefined, route: string): boolean {
  return normalizeRoutePath(pathname) === normalizeRoutePath(route);
}
