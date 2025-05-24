/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'vlr.orlandomm.net',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'owcdn.net',
        pathname: '/**',
      },
    ],
  },
};

module.exports = nextConfig;
