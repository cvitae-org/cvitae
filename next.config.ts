import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/libs/i18n/request.ts");

const nextConfig: NextConfig = {
  // Next can incorrectly infer the workspace root if there are multiple lockfiles on disk.
  outputFileTracingRoot: __dirname,
};

export default withNextIntl(nextConfig);
