"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { normalizeRoutePath } from "@/lib/route-path";
import { inlineNavRoutes, moreNavRoutes } from "@/lib/routes";

// The links below are DERIVED, never listed here. This component used to carry
// its own `NAV_LINKS` array, one of the four independent route lists v0.22
// collapsed into `src/lib/routes.ts`; adding a link by hand here now fails
// `src/app/__tests__/route-registry-guard.test.ts` rather than quietly giving
// the app a thirteenth vocabulary for where a person can go.
//
// v0.23 splits that one list in two by the registry's `navSlot` field (D6).
// Twelve pills never fit the 56rem `.site-nav-inner` cap at any width, so the
// header wrapped to four rows on a phone and ate 39.6% of the viewport - and
// because the shell is `position: sticky`, that cost was permanent rather than
// paid once. Three inline plus a disclosure is the largest set that stays on
// one row at 375x667; `e2e/nav-shape.spec.ts` measures it in a real browser.
const INLINE_ROUTES = inlineNavRoutes();
const MORE_ROUTES = moreNavRoutes();

export function SiteNav() {
  // The export is configured with trailingSlash, so the live pathname is
  // "/journal/" while the hrefs are written "/journal". `normalizeRoutePath`
  // is the one place that reconciles the two; the subscription gate's route
  // exemption uses the same helper rather than a second copy of the rule.
  const activePath = normalizeRoutePath(usePathname());
  const moreRef = useRef<HTMLDetailsElement>(null);

  return (
    <nav className="site-nav-links" aria-label="Primary">
      {INLINE_ROUTES.map((route) => (
        <Link
          key={route.path}
          href={route.path}
          aria-current={activePath === route.path ? "page" : undefined}
        >
          {route.label}
        </Link>
      ))}

      {/* A native <details>, the same vocabulary the dashboard's "Workspace
          insights" collapsible already uses (D4). It needs no JavaScript to
          open, the platform announces it to screen readers and puts it in the
          tab order, and its open state crosses no hydration boundary because
          there is nothing to hydrate. Its stated cost, recorded rather than
          hidden: native <details> closes on neither Escape nor an outside
          click. The recorded alternative is a `<button aria-expanded>` plus a
          popover, which buys those two behaviours for the price of client JS
          and focus management. */}
      <details className="site-nav-more" ref={moreRef}>
        <summary aria-label="More pages">More</summary>
        <div className="site-nav-more-panel">
          {MORE_ROUTES.map((route) => (
            <Link
              key={route.path}
              href={route.path}
              aria-current={activePath === route.path ? "page" : undefined}
              // Client-side navigation does not remount this component, and a
              // <details> keeps its open state in the DOM rather than in React,
              // so without this the menu would still be hanging open over the
              // page a reader just navigated to. This is the one behaviour the
              // native element does not give us for free that a menu genuinely
              // needs; Escape and outside-click remain the recorded cost above.
              onClick={() => {
                if (moreRef.current) {
                  moreRef.current.open = false;
                }
              }}
            >
              {route.label}
            </Link>
          ))}
        </div>
      </details>
    </nav>
  );
}
