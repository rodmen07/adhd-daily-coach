import type { Metadata } from "next";
import { Sora, IBM_Plex_Mono } from "next/font/google";
import { SiteNav } from "@/app/components/site-nav";
import { ThemeToggle } from "@/app/components/theme-toggle";
import { SyncStatusBadge } from "@/app/components/sync-status-badge";
import { SubscriptionGuard } from "@/app/components/subscription-guard";
import { KeyboardHelp } from "@/app/components/keyboard-help";
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

export const metadata: Metadata = {
  title: "ADHD Daily Coach: Your friendly self-improvement coach",
  description:
    "Your ADHD friendly self-improvement coach. Small, deliberate daily steps that fit how your brain works.",
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
        <header className="site-nav-shell">
          <div className="site-nav-inner">
            <p className="site-nav-title">ADHD Daily Coach</p>
            <div className="site-nav-actions">
              <SiteNav />
              <div className="flex items-center gap-3">
                <SyncStatusBadge />
                <KeyboardHelp />
                <ThemeToggle />
              </div>
            </div>
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
