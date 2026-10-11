/** @type {import('next').NextConfig} */
const nextConfig = {
  // Gränssnittet är statisk HTML/CSS/JS i /public. Next.js används bara för /api/correct.
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/index.html" },
        { source: "/integritet", destination: "/integritet.html" },
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
