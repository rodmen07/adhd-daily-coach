import { describe, expect, it } from "vitest";
import { isRoute, normalizeRoutePath } from "@/lib/route-path";

/**
 * These two functions decide which route the nav highlights and, since v0.14
 * PR1, which route the subscription gate lets through. The trailing-slash case
 * is the one that matters in production: `next.config.ts` sets
 * `trailingSlash: true`, so the shape the app actually receives is "/pricing/",
 * never the "/pricing" the exemption list is written with.
 */
describe("normalizeRoutePath", () => {
  it("strips the trailing slash the static export adds", () => {
    expect(normalizeRoutePath("/pricing/")).toBe("/pricing");
  });

  it("leaves an already-bare path alone", () => {
    expect(normalizeRoutePath("/pricing")).toBe("/pricing");
  });

  it("keeps the root as the root in both forms", () => {
    expect(normalizeRoutePath("/")).toBe("/");
    expect(normalizeRoutePath("")).toBe("/");
  });

  it("reads a null pathname as the root, since Next returns null before the router is ready", () => {
    expect(normalizeRoutePath(null)).toBe("/");
    expect(normalizeRoutePath(undefined)).toBe("/");
  });

  it("collapses repeated trailing slashes rather than matching on one of them", () => {
    expect(normalizeRoutePath("/pricing//")).toBe("/pricing");
  });
});

describe("isRoute", () => {
  it("matches the live trailing-slash pathname against a bare route", () => {
    expect(isRoute("/pricing/", "/pricing")).toBe(true);
  });

  it("does not match a different route", () => {
    expect(isRoute("/journal/", "/pricing")).toBe(false);
  });

  it("does not match a route that merely starts the same way", () => {
    // A prefix match would exempt a hypothetical "/pricing-admin" too, which is
    // the classic way an allowlist quietly grows past what it was reviewed for.
    expect(isRoute("/pricing-admin/", "/pricing")).toBe(false);
    expect(isRoute("/pricing/details/", "/pricing")).toBe(false);
  });

  it("matches the root without matching everything", () => {
    expect(isRoute("/", "/")).toBe(true);
    expect(isRoute("/journal/", "/")).toBe(false);
  });
});
