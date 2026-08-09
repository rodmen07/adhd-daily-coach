import type { Metadata } from "next";
import { Sora, IBM_Plex_Mono } from "next/font/google";
import { SiteNav } from "@/app/components/site-nav";
import { ThemeToggle } from "@/app/components/theme-toggle";
import { SyncStatusBadge } from "@/app/components/sync-status-badge";
import { SubscriptionGuard } from "@/app/components/subscription-guard";
import { KeyboardHelp } from "@/app/components/keyboard-help";
import { metadataForRoute, ROOT_TITLE } from "@/app/route-metadata";
import { SITE_URL } from "../../site-base-path.mjs";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

/**
 * `/`'s registry-derived metadata (v0.27 D3): its `description` moved into the
 * registry entry — one home, D1 — and its `openGraph` block is composed by the
 * same derivation every other route uses, with `og:title` special-cased there
 * to the untemplated `ROOT_TITLE` the root actually serves.
 */
const rootMetadata = metadataForRoute("/");

export const metadata: Metadata = {
  /**
   * v0.25 D3. `template` is what every child segment's one-word title is
   * rendered through, so `title: "Slicer"` in `src/app/slicer/layout.tsx`
   * becomes `Slicer · ADHD Daily Coach`. The distinguishing word comes FIRST
   * because a browser tab truncates from the right.
   *
   * `default` is the string `/` keeps, byte-for-byte what it served before
   * v0.25: a template applies to CHILD segments, never to the segment
   * that declares it, and `src/app/page.tsx` exports no title of its own. Two
   * records depend on that string not moving - it is the site's title in
   * search results and link previews, and `docs/RENAME_RUNBOOK.md` quotes it
   * verbatim as the evidence that the 2026-07-29 rename completed.
   * `src/__tests__/route-title-contract.test.ts` reads BOTH the runbook and
   * the built `out/index.html` and fails if they stop agreeing. The literal
   * itself lives in `src/app/route-metadata.ts` as of v0.27 so this default
   * and the root `og:title` cannot drift apart.
   */
  title: {
    template: "%s · ADHD Daily Coach",
    default: ROOT_TITLE,
  },
  description: rootMetadata.description,
  /**
   * v0.27 D4. Declared so anything Next ever resolves relatively resolves
   * under the real deployed URL, base path included. The `og:url` values
   * themselves are deliberately NOT relative: `new URL("/now/", base)` drops
   * a project-page base path (the trap `src/app/route-metadata.ts` documents),
   * so the derivation composes absolute URLs and this base is a backstop, not
   * the mechanism.
   */
  metadataBase: new URL(SITE_URL),
  openGraph: rootMetadata.openGraph,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      className={`${sora.variable} ${plexMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  // "calm-daily-coach:" is the FROZEN legacy key namespace -
                  // see the note in src/lib/planner-state.ts. Renaming it here
                  // would silently drop every existing user's saved theme.
                  var savedTheme = localStorage.getItem("calm-daily-coach:theme");
                  var nextTheme = savedTheme === "light" ? "light" : "dark";
                  document.documentElement.dataset.theme = nextTheme;
                } catch (error) {
                  document.documentElement.dataset.theme = "dark";
                }
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {/* First thing a keyboard reaches, invisible until then. */}
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        {/* v0.26 PR2 (docs/design/HEADER_ACTIONS.md D1): the sync/help/theme
            cluster left `.site-nav-actions` and sits beside the title, so the
            header is two rows on phones (title + cluster / nav) and stays one
            row above the 56rem cap. DOM order is title, cluster, nav - the
            wrap order phones need; the desktop media query in globals.css
            restores title, nav, cluster visually. `.site-nav-cluster` is the
            class hook e2e/nav-shape.spec.ts addresses the cluster by, replacing
            the positional `.site-nav-actions > :last-child` (PR #172's filed
            obligation: reposition the node and re-point the selector in the
            same commit). */}
        <header className="site-nav-shell">
          <div className="site-nav-inner">
            <p className="site-nav-title">ADHD Daily Coach</p>
            <div className="site-nav-cluster">
              <SyncStatusBadge />
              <KeyboardHelp />
              <ThemeToggle />
            </div>
            <SiteNav />
          </div>
        </header>
        {/* The single main landmark for every route. Pages contribute their own
            content wrappers; the landmark lives here so the skip link always has
            the same target, including on the sign-in and trial gate screens.
            tabIndex lets focus actually land here when the skip link is used. */}
        <main id="main-content" className="flex-1" tabIndex={-1}>
          <SubscriptionGuard>{children}</SubscriptionGuard>
        </main>
      </body>
    </html>
  );
}
