/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@open-spaced-repetition/binding"],
  images: { unoptimized: true },
};
export default nextConfig;
