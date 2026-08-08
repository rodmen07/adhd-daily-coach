"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { normalizeRoutePath } from "@/lib/route-path";
import { primaryNavRoutes } from "@/lib/routes";

// The links below are DERIVED, never listed here. This component used to carry
// its own `NAV_LINKS` array, one of the four independent route lists v0.22
// collapsed into `src/lib/routes.ts`; adding a link by hand here now fails
// `src/app/__tests__/route-registry-guard.test.ts` rather than quietly giving
// the app a thirteenth vocabulary for where a person can go.
const NAV_ROUTES = primaryNavRoutes();

export function SiteNav() {
  // The export is configured with trailingSlash, so the live pathname is
  // "/journal/" while the hrefs are written "/journal". `normalizeRoutePath`
  // is the one place that reconciles the two; the subscription gate's route
  // exemption uses the same helper rather than a second copy of the rule.
  const activePath = normalizeRoutePath(usePathname());

  return (
    <nav className="site-nav-links" aria-label="Primary">
      {NAV_ROUTES.map((route) => (
        <Link
          key={route.path}
          href={route.path}
          aria-current={activePath === route.path ? "page" : undefined}
        >
          {route.label}
        </Link>
      ))}
    </nav>
  );
}
