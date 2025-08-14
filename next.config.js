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
      {
        protocol: 'https',
        hostname: 'www.vlr.gg',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'vlr.gg',
        pathname: '/**',
      },
    ],
  },
};

module.exports = nextConfig;
