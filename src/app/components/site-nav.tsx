"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useRef } from "react";
import { normalizeRoutePath } from "@/lib/route-path";
import { inlineNavRoutes, moreNavGroups } from "@/lib/routes";

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
//
// v0.24 gives the panel MEANING as well as room (D3, D4). Nine flat links
// become four short labelled lists, and the labels are real visible headings
// rather than `aria-label` strings: the complaint this milestone answers is
// that a reader who opens "More" meets nine undifferentiated items, and an
// invisible-only label fixes the screen reader while leaving the sighted
// reader exactly where they were. Groups with nothing behind the disclosure
// render nothing at all, so a heading is never shown over an empty list.
const INLINE_ROUTES = inlineNavRoutes();
const MORE_GROUPS = moreNavGroups();

export function SiteNav() {
  // The export is configured with trailingSlash, so the live pathname is
  // "/journal/" while the hrefs are written "/journal". `normalizeRoutePath`
  // is the one place that reconciles the two; the subscription gate's route
  // exemption uses the same helper rather than a second copy of the rule.
  const activePath = normalizeRoutePath(usePathname());
  const moreRef = useRef<HTMLDetailsElement>(null);
  // One stable base per mount; each group heading suffixes it. Generated
  // rather than slugged from the category name so a future group called
  // "In the moment / later" cannot produce a duplicate or invalid id.
  const groupIdBase = useId();

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
          {MORE_GROUPS.map((section, index) => {
            const headingId = `${groupIdBase}-${index}`;

            return (
              <div key={section.group} className="site-nav-more-group">
                <h2 id={headingId} className="site-nav-more-group-heading">
                  {section.group}
                </h2>
                <ul className="site-nav-more-group-list" aria-labelledby={headingId}>
                  {section.routes.map((route) => (
                    <li key={route.path}>
                      <Link
                        href={route.path}
                        aria-current={activePath === route.path ? "page" : undefined}
                        // Client-side navigation does not remount this
                        // component, and a <details> keeps its open state in
                        // the DOM rather than in React, so without this the
                        // menu would still be hanging open over the page a
                        // reader just navigated to. This is the one behaviour
                        // the native element does not give us for free that a
                        // menu genuinely needs; Escape and outside-click
                        // remain the recorded cost above, and v0.24 PR2 is
                        // where they land.
                        onClick={() => {
                          if (moreRef.current) {
                            moreRef.current.open = false;
                          }
                        }}
                      >
                        {route.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </details>
    </nav>
  );
}
