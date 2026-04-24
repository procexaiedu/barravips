import { OperatorNav } from "@/components/operator-nav";
import { createClient } from "@/utils/supabase/server";

export default async function OperatorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="operator-shell">
      <OperatorNav userEmail={user?.email ?? null} />
      <main className="operator-main">{children}</main>
    </div>
  );
}
