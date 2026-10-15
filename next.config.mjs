/** @type {import('next').NextConfig} */
const nextConfig = {
  // Gränssnittet är statisk HTML/CSS/JS i /public. Next.js används bara för /api/correct.
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/index.html" },
        { source: "/integritet", destination: "/integritet.html" },
        { source: "/en", destination: "/en.html" },
        { source: "/ar", destination: "/ar.html" },
        { source: "/ratta/:slug([a-z0-9-]+)", destination: "/ratta/:slug.html" },
        { source: "/guider", destination: "/guider/index.html" },
        // Bara slugs utan punkt, så att /guider/index.html inte skrivs om en gång till
        { source: "/guider/:slug([a-z0-9-]+)", destination: "/guider/:slug.html" },
      ],
    };
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      // CSS och JS länkas alltid med ?v=hash (scripts/build.mjs) och kan därför cachas länge
      {
        source: "/:file(styles\\.css|app\\.js)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/:file(favicon\\.svg|apple-touch-icon\\.png|og-image\\.png)",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400" }],
      },
    ];
  },
  async redirects() {
    return [
      // En adress för hela sajten: mamosta.se → www.mamosta.se (undviker dubbelt innehåll i Google)
      {
        source: "/:path*",
        has: [{ type: "host", value: "mamosta.se" }],
        destination: "https://www.mamosta.se/:path*",
        permanent: true,
      },
      // Gammal platshållarsida
      { source: "/villkor", destination: "/integritet", permanent: true },
    ];
  },
};

export default nextConfig;
