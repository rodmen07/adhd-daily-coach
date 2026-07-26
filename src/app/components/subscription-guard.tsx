"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useCoachAuth } from "@/app/hooks/use-coach-auth";
import { getFirebaseFirestore } from "@/lib/firebase";
import { upsertUserAccount, type UserAccount } from "@/lib/firestore-user";
import { blocksAccess, resolveEntitlement } from "@/lib/entitlement";
import { isRoute } from "@/lib/route-path";
import Link from "next/link";

interface SubscriptionGuardProps {
  children: React.ReactNode;
}

/**
 * Routes this gate never blocks, whoever is asking.
 *
 * `/pricing` is here because the trial-ended screen below offers exactly one
 * action - "Subscribe for $5/month", linking to `/pricing` - and this
 * component wraps every route via `layout.tsx`, so before this exemption the
 * paywall's only way out led straight back to the paywall. A checkout page
 * behind its own paywall is wrong under every reading of who else the app
 * should let in, so the exemption is unconditional and does not wait on that
 * separate question (decision D2 in docs/design/GUEST_ACCESS_AND_PAYWALL.md).
 *
 * Keep this list to routes that are wrong to block rather than merely nice to
 * open: it is an allowlist punched through the app's authorization boundary.
 */
const GATE_EXEMPT_ROUTES = ["/pricing"] as const;

/**
 * The app's one authorization boundary: `layout.tsx` wraps every route in it.
 *
 * What it blocks, as of v0.14 PR2 (decision D1, approved by the user
 * 2026-07-26): a SIGNED-IN account that is out of entitlement, and nothing
 * else. A signed-out person gets the product. The app is local-first by
 * construction - every store resolves to localStorage when signed out - so a
 * guest's data lives in their browser, signing in is an upgrade (sync and
 * backup), and v0.13's guest-to-account migration is what carries the data
 * across. Before this, the gate answered `!authUser` with a full-screen "Sign
 * in required" wall on every route, which made three consecutive milestones of
 * local-first work unreachable on the deployed build.
 *
 * The membership itself is unchanged (D4): a signed-in account whose trial has
 * finished, or that is explicitly `"expired"`, still gets the trial-ended
 * screen, now with a Subscribe link that leads somewhere (PR1). The honest
 * consequence, stated by the design doc and confirmed by the user: such a
 * person can sign out and keep using the local app. The membership sells sync
 * and backup, not the ability to run a timer.
 *
 * Sign-in itself lives where it already did (D3): the in-page "Continue with
 * Google" buttons on `/`, `/focus`, and `/pricing`, which no signed-out visitor
 * could reach until now. This component deliberately renders no sign-in surface
 * of its own - replacing a wall with a banner or a modal would trade one
 * blocking surface for a softer one, against the product rules.
 */
export function SubscriptionGuard({ children }: SubscriptionGuardProps) {
  const { authUser, authConfigured } = useCoachAuth();
  const pathname = usePathname();
  const [account, setAccount] = useState<UserAccount | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    if (!authConfigured) {
      if (active) {
        Promise.resolve().then(() => {
          setLoading(false);
        });
      }
      return;
    }

    if (!authUser) {
      if (active) {
        Promise.resolve().then(() => {
          setAccount(null);
          setLoading(false);
        });
      }
      return;
    }

    const db = getFirebaseFirestore();
    if (!db) {
      if (active) {
        Promise.resolve().then(() => {
          setLoading(false);
        });
      }
      return;
    }

    // Upsert (create-or-fetch) rather than read-only get. This guarantees the account
    // record exists before we evaluate the trial, eliminating the first-login race where
    // a read could resolve before the account was written and wrongly report no trial.
    upsertUserAccount(db, authUser.uid, authUser.email ?? "", authUser.displayName ?? null)
      .then((acc) => {
        if (active) {
          setAccount(acc);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Error checking subscription user account:", err);
        if (active) {
          Promise.resolve().then(() => {
            setLoading(false);
          });
        }
      });

    return () => {
      active = false;
    };
  }, [authUser, authConfigured]);

  // Ahead of the loading state on purpose: an exempt route must not depend on
  // an account read that a signed-out visitor never triggers and a blocked one
  // has already paid for once. Hooks above run either way, so a signed-in
  // person still gets their account record created on a first visit here.
  if (GATE_EXEMPT_ROUTES.some((route) => isRoute(pathname, route))) {
    return <>{children}</>;
  }

  // Ahead of the loading state, and deliberately so. Nobody is signed in, so
  // there is no account read to wait for - and this component renders during
  // the static export, where `authUser` is always null and no effect has run,
  // so gating here would ship the spinner as the prerendered HTML of every
  // page. That is exactly what the deployed site served before this change:
  // `curl` on any route returned "Loading account details..." and no content.
  if (!authUser) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-(--background) text-[--foreground]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-t-transparent border-[--accent]" />
          <p className="text-sm font-medium tracking-wide">Loading account details...</p>
        </div>
      </div>
    );
  }

  // Fail open: only block when we have a real account that is genuinely out of
  // entitlement. A null account (still provisioning, or a transient Firestore read
  // issue) must never be treated as an expired trial, otherwise brand-new users get
  // locked out on first login. `resolveEntitlement` keeps the same posture for an
  // account whose `createdAt` is unreadable - it resolves to `unknown`, not expired.
  const entitlement = account ? resolveEntitlement(account) : null;
  const isBlocked = entitlement !== null && blocksAccess(entitlement);

  if (isBlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-(--background) px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8 rounded-2xl border border-rose-900/30 bg-(--panel) p-8 text-center shadow-2xl">
          <div className="space-y-2">
            <span className="inline-block rounded-full bg-rose-500/10 p-3 text-rose-500">
              <svg className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </span>
            <h2 className="text-3xl font-extrabold tracking-tight text-[--foreground]">Your Trial Has Ended</h2>
            <p className="text-sm text-[--muted]">
              Your 30-day free trial has expired. To continue customizing targets, executing plans, and reviewing daily focus cycles, please subscribe.
            </p>
          </div>

          <div className="rounded-xl border border-(--line) bg-(--panel)/50 p-5 mt-4">
            <p className="text-[10px] font-bold text-[--accent] uppercase tracking-wider">Premium Access</p>
            <p className="text-3xl font-extrabold text-[--foreground] mt-1">$5<span className="text-sm font-normal text-[--muted]">/mo</span></p>
            <p className="text-xs text-[--muted] mt-2">Unlimited execution timelines, custom categories, analytics review, and secure cloud backups.</p>
          </div>

          <div className="mt-8 space-y-4">
            <Link
              href="/pricing"
              className="flex w-full items-center justify-center rounded-full bg-[--accent] px-4 py-3 text-sm font-bold text-[--accent-foreground] transition-all hover:bg-[--accent-strong] shadow-lg hover:shadow-[--accent]/20"
            >
              Subscribe for $5/month
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
