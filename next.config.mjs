/** @type {import('next').NextConfig} */
const nextConfig = {
  // Gränssnittet är statisk HTML/CSS/JS i /public. Next.js används bara för /api/correct.
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/index.html" },
        { source: "/integritet", destination: "/integritet.html" },
        { source: "/guider", destination: "/guider/index.html" },
        // Bara slugs utan punkt, så att /guider/index.html inte skrivs om en gång till
        { source: "/guider/:slug([a-z0-9-]+)", destination: "/guider/:slug.html" },
      ],
    };
  },
  async redirects() {
    return [
      // Gammal platshållarsida
      { source: "/villkor", destination: "/integritet", permanent: true },
    ];
  },
};

export default nextConfig;
