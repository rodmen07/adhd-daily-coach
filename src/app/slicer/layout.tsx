import { metadataForRoute } from "@/app/route-metadata";

/**
 * Server segment layout whose only job is this route's `metadata` (v0.25 D4).
 * It returns `children` unchanged, so it adds no DOM node and no styling; the
 * page underneath stays `"use client"` and cannot export `metadata` itself.
 */
export const metadata = metadataForRoute("/slicer");

export default function SlicerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
