"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef } from "react";
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
//
// v0.24 PR2 finishes the interaction v0.23 knowingly left half-built (D7).
// The two effects below are the whole of that change: the element stays a
// native <details>, so it still opens with no JavaScript, is still announced
// by the platform, and its open state still crosses no hydration boundary.
// The recorded alternative - swapping in a `<button aria-expanded>` popover -
// buys exactly these two behaviours and gives up all three of those, which is
// why D7 declines it.
const INLINE_ROUTES = inlineNavRoutes();
const MORE_GROUPS = moreNavGroups();

export function SiteNav() {
  // The export is configured with trailingSlash, so the live pathname is
  // "/journal/" while the hrefs are written "/journal". `normalizeRoutePath`
  // is the one place that reconciles the two; the subscription gate's route
  // exemption uses the same helper rather than a second copy of the rule.
  const activePath = normalizeRoutePath(usePathname());
  const moreRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  // One stable base per mount; each group heading suffixes it. Generated
  // rather than slugged from the category name so a future group called
  // "In the moment / later" cannot produce a duplicate or invalid id.
  const groupIdBase = useId();

  // D7, first half: Escape closes the panel and returns focus to the summary.
  //
  // The open state lives in the DOM (`details.open`) rather than in React, so
  // the listener reads it there instead of mirroring it into state a native
  // toggle could desync. Two deliberate choices, both load-bearing:
  //
  //  - It bails on an already-handled event, so a component that owns Escape
  //    more specifically keeps it.
  //  - It does NOT call preventDefault itself. An open <details> has no
  //    default action for Escape to suppress, and claiming the event would
  //    silently disable the keyboard dialog's own Escape handler on the rare
  //    render where both are open - this listener is on `document` and that
  //    one is on `window`, so a bubbling keydown reaches this one first no
  //    matter which component mounted first.
  //
  // Focus return is not decoration. Without it, Escape closes the menu and
  // leaves focus on a link that is no longer visible, which is worse for a
  // keyboard reader than not closing at all.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.key !== "Escape") {
        return;
      }

      const disclosure = moreRef.current;
      if (!disclosure?.open) {
        return;
      }

      disclosure.open = false;
      summaryRef.current?.focus();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // D7, second half: a pointer-down outside the disclosure closes it.
  //
  // Containment is the whole rule, and it is why this is not "close on any
  // pointer-down": the summary and every link in the panel are inside the
  // element, so opening the menu and choosing something from it must never be
  // read as a dismissal. Focus is deliberately NOT moved here - the reader is
  // already pointing at whatever they meant to reach, and pulling focus back
  // to the summary would undo their own gesture.
  useEffect(() => {
    function onPointerDown(event: Event) {
      const disclosure = moreRef.current;
      if (!disclosure?.open) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && disclosure.contains(target)) {
        return;
      }

      disclosure.open = false;
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

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
          there is nothing to hydrate. Its one stated cost - that a native
          <details> closes on neither Escape nor an outside click - was paid by
          every reader on every page for exactly one milestone; v0.24 D7 adds
          both behaviours in the two effects above rather than paying the
          `<button aria-expanded>` popover's price for them. */}
      <details className="site-nav-more" ref={moreRef}>
        <summary ref={summaryRef} aria-label="More pages">
          More
        </summary>
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
                        // menu genuinely needs. Escape and outside-click are
                        // the other two, and v0.24 PR2 landed them in the
                        // effects above; this one stays here because it is a
                        // property of the link, not of the document.
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
