import Link from "next/link";

import { OperatorNav } from "@/components/operator-nav";

export default function NotFound() {
  return (
    <div className="operator-shell">
      <OperatorNav />
      <main className="operator-main">
        <div className="page-stack">
          <header className="page-header">
            <p className="eyebrow">Operação</p>
            <h1>Rota não encontrada</h1>
            <p>Esta área não existe no painel operacional.</p>
          </header>
          <section className="panel">
            <p className="empty-state">Use a visão geral para voltar ao fluxo principal.</p>
            <Link className="button secondary" href="/dashboard">
              Voltar para o dashboard
            </Link>
          </section>
        </div>
      </main>
    </div>
  );
}
