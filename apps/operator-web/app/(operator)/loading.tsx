export default function OperatorLoading() {
  return (
    <div className="page-stack">
      <header className="page-header">
        <p className="eyebrow">Operação</p>
        <h1>Carregando painel</h1>
        <p>Preparando a interface operacional.</p>
      </header>
      <section className="panel" aria-live="polite">
        <span className="live-dot">Carregando</span>
        <p className="empty-state">Buscando os dados mais recentes.</p>
      </section>
    </div>
  );
}
