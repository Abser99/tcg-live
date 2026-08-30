import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
    formats: ["image/avif", "image/webp"],
  },
  compress: true,
  poweredByHeader: false,
  /* The dev-only overlay badge sat over the live view's top-right controls. Errors are
     still reported — in the terminal and the browser console — this only hides the
     floating badge, and it has no effect on a production build. */
  devIndicators: false,
};

export default nextConfig;
