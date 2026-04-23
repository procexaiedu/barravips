import { OperatorNav } from "@/components/operator-nav";

export default function OperatorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="operator-shell">
      <OperatorNav />
      <main className="operator-main">{children}</main>
    </div>
  );
}
