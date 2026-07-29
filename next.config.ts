import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

/**
 * The GitHub Pages project-page basePath is the REPO NAME, so it is derived
 * rather than hardcoded: the repo is being renamed from `calm-daily-coach` to
 * `adhd-daily-coach`, and a hardcoded literal would 404 every asset, chunk and
 * route the instant the rename lands (or the instant this file is changed
 * ahead of it). Deriving from `GITHUB_REPOSITORY` - which every GitHub Actions
 * job injects automatically - makes the deploy correct in EITHER order, with
 * no follow-up PR and no window where the live site is broken.
 *
 * `SITE_REPO_NAME` is a manual override for preview builds and forks that want
 * to pin a basePath without editing tracked files. The final fallback is only
 * reached locally (`GITHUB_REPOSITORY` is never unset in Actions), so it is
 * pinned to the NEW slug.
 */
const repoName =
  process.env.SITE_REPO_NAME ??
  process.env.GITHUB_REPOSITORY?.split("/")[1] ??
  "adhd-daily-coach";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  basePath: isProduction ? `/${repoName}` : "",
  assetPrefix: isProduction ? `/${repoName}/` : undefined,
};

export default nextConfig;
