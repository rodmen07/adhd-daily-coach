import { metadataForRoute } from "@/app/route-metadata";

/**
 * Server segment layout whose only job is this route's `metadata` (v0.25 D4).
 * It returns `children` unchanged, so it adds no DOM node and no styling; the
 * page underneath stays `"use client"` and cannot export `metadata` itself.
 *
 * `/monetization` gets a title like every other route (D5). `audience:
 * "internal"` is explicitly not access control - `src/lib/routes.ts:29-34`
 * says so - and this is a shipped route at a real URL a person can bookmark,
 * so exempting it would only put an exception into a guard clause that is
 * otherwise total.
 */
export const metadata = metadataForRoute("/monetization");

export default function MonetizationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
