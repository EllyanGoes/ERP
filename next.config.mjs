/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Type errors will be shown as warnings in dev but won't fail the build.
    // Fix progressively as each module stabilizes.
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
