import { LoginForm } from "./login-form";

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next =
    params.next && params.next.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : "/dashboard";

  return (
    <main className="login-shell">
      <section className="login-card">
        <header className="login-header">
          <p className="eyebrow">BarraVips.operator</p>
          <h1>Acesso operacional</h1>
          <p>Entre com sua conta para continuar.</p>
        </header>
        <LoginForm next={next} />
      </section>
    </main>
  );
}
