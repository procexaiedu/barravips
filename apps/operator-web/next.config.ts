import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/leads-para-assumir",
        destination: "/handoffs",
        permanent: true,
      },
      {
        source: "/leads-para-assumir/:path*",
        destination: "/handoffs/:path*",
        permanent: true,
      },
      {
        source: "/atendimento-humano",
        destination: "/handoffs",
        permanent: true,
      },
      {
        source: "/atendimento-humano/:path*",
        destination: "/handoffs/:path*",
        permanent: true,
      },
      {
        source: "/pagamentos",
        destination: "/comprovantes",
        permanent: true,
      },
      {
        source: "/pagamentos/:path*",
        destination: "/comprovantes/:path*",
        permanent: true,
      },
      {
        source: "/materiais",
        destination: "/midias",
        permanent: true,
      },
      {
        source: "/materiais/:path*",
        destination: "/midias/:path*",
        permanent: true,
      },
      {
        source: "/modelos",
        destination: "/agentes",
        permanent: true,
      },
      {
        source: "/modelos/:path*",
        destination: "/agentes/:path*",
        permanent: true,
      },
      {
        source: "/saude",
        destination: "/status",
        permanent: true,
      },
      {
        source: "/saude/:path*",
        destination: "/status/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
