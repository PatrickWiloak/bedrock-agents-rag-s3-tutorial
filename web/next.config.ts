import type { NextConfig } from 'next';

/**
 * The UI is served as a static site from S3 behind CloudFront, so Next.js runs
 * purely as a build-time site generator here - `next build` emits `web/out/`,
 * which the CDK stack uploads.
 *
 * Consequences worth knowing:
 * - There are no server-side route handlers. Chat requests go straight from the
 *   browser to API Gateway, using the endpoint written into config.json at
 *   deploy time.
 * - Image optimization needs a server, so it is disabled.
 */
const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
