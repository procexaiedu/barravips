"use client";

import { OperatorNav } from "@/components/operator-nav";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  return (
    <div className="operator-shell">
      <OperatorNav />
      <main className="operator-main">
        <div className="page-stack">
          <header className="page-header">
            <p className="eyebrow">Operação</p>
            <h1>Algo saiu do fluxo esperado</h1>
            <p>A interface não conseguiu montar esta tela agora.</p>
          </header>
          <section className="panel">
            <div className="panel-notice">
              {error.message || "Erro inesperado ao carregar a rota."}
            </div>
            <button className="button" type="button" onClick={reset}>
              Tentar novamente
            </button>
          </section>
        </div>
      </main>
    </div>
  );
}
