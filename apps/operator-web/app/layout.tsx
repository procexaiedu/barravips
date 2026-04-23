import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "BarraVips Operator",
  description: "Painel operacional Barra Vips",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
