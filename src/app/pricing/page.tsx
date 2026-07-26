"use client";

import Link from "next/link";
import { useCoachAuth } from "@/app/hooks/use-coach-auth";
import { AuthMessage } from "@/app/components/auth-message";
import { buildMembershipCheckoutUrl, getStripePaymentLink } from "@/lib/billing";
import { trackMonetizationEvent } from "@/lib/monetization";

export default function PricingPage() {
  const { authUser, authMessage, signInWithGoogle } = useCoachAuth();
  const paymentLink = getStripePaymentLink();

  return (
    <div className="page-shell">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
        <section className="panel text-center animate-status-rise">
          <p className="eyebrow">Membership</p>
          <h1 className="mb-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Simplicity first, no tiers.
          </h1>
          <p className="mb-6 text-sm leading-6 text-slate-700 sm:text-base">
            Every feature of Focus is included in one single direct membership model. 
            Enjoy a completely free, unrestricted 30-day trial. Continue afterward for only $5/month.
          </p>

          <div className="mx-auto max-w-sm rounded-2xl border border-[--accent]/30 bg-[--field] p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-[--accent] text-slate-950 font-bold font-mono text-[9px] px-3 py-1 uppercase rounded-bl-lg tracking-wider">
              30 Days Free
            </div>
            <p className="text-xs uppercase tracking-widest font-bold text-[--accent] font-mono">Full Membership</p>
            <p className="text-5xl font-extrabold text-slate-800 dark:text-slate-100 mt-2">
              $5<span className="text-sm font-normal text-slate-400">/mo</span>
            </p>
            <p className="mt-3 text-sm text-slate-600 leading-normal">
              Continuous focus cycles, action target customizations, weekly performance reviews, and automatic secure cloud syncing.
            </p>

            <ul className="text-left space-y-2 text-xs text-slate-700 my-5 border-t border-slate-200 dark:border-slate-800 pt-4">
              <li className="flex items-center gap-1.5">
                <span className="text-[--accent]" aria-hidden="true">✓</span>
                <span>Unrestricted daily cycle timelines</span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="text-[--accent]" aria-hidden="true">✓</span>
                <span>Action and reflection customizations</span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="text-[--accent]" aria-hidden="true">✓</span>
                <span>Weekly progress sparklines & diagnostics</span>
              </li>
              <li className="flex items-center gap-1.5">
                <span className="text-[--accent]" aria-hidden="true">✓</span>
                <span>Secure account cross-device cloud sync</span>
              </li>
            </ul>

            {authUser ? (
              paymentLink ? (
                <a
                  className="primary-button inline-flex w-full justify-center text-center font-bold"
                  href={buildMembershipCheckoutUrl(paymentLink, {
                    uid: authUser.uid,
                    email: authUser.email,
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() =>
                    trackMonetizationEvent("pricing_cta_clicked", "pro", "pricing", "stripe_payment_link")
                  }
                >
                  Join Membership ($5/mo)
                </a>
              ) : (
                <a
                  className="primary-button inline-flex w-full justify-center text-center font-bold"
                  href={`mailto:hello@calmdailycoach.com?subject=Calm%20Daily%20Coach%20Membership%20upgrade&body=Hi%2CCoach!%20My%20account%20uid%20is%20${authUser.uid}.%20Please%20upgrade%20me%20to%20the%20$5%2Fmonth%20plan.`}
                  onClick={() =>
                    trackMonetizationEvent("pricing_cta_clicked", "pro", "pricing", "mailto_upgrade")
                  }
                >
                  Join Membership ($5/mo)
                </a>
              )
            ) : (
              <button
                onClick={signInWithGoogle}
                className="primary-button inline-flex w-full justify-center text-center font-bold"
              >
                Sign in to start 30-day Free Trial
              </button>
            )}
            <AuthMessage message={authMessage} />
          </div>

          <div className="mt-5 border-t border-slate-200 dark:border-slate-800 pt-4 text-sm text-slate-600">
            <p>
              Your first 30 days are completely free. If you have questions or need support, contact Hello@CalmDailyCoach.com.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Link className="secondary-button" href="/">
                Back to dashboard
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
