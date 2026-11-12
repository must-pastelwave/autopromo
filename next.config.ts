import type { NextConfig } from "next";

// Routes that can publish (and so render video) need the ffmpeg binary in their bundle.
const PUBLISHING_ROUTES = ['/api/agent/**', '/api/cron', '/api/video/**', '/']

// Every page reads live data from Postgres, so Cache Components is off.
const nextConfig: NextConfig = {
  serverExternalPackages: ['ffmpeg-static'],
  outputFileTracingIncludes: Object.fromEntries(PUBLISHING_ROUTES.map(r => [r, ['./node_modules/ffmpeg-static/ffmpeg']])),
};

export default nextConfig;
