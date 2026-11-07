/** @type {import('next').NextConfig} */
const nextConfig = {
  cleanDistDir: true,
  distDir:
    process.env.NODE_ENV === "development" && process.env.FELINE_SDK_DEV_TARGET === "production"
      ? ".next-online-center"
      : ".next",
  allowedDevOrigins: ["blog.user-center.test"],
  outputFileTracingIncludes: {
    "/*": ["./config/user-center.production.profiles.json"],
  },
  logging: { incomingRequests: false, browserToTerminal: false },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "prod-files-secure.s3.us-west-2.amazonaws.com",
      },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
  turbopack: {
    root: import.meta.dirname,
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },
};

export default nextConfig;
