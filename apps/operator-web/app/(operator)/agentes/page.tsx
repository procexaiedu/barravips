import { PageHeader } from "@/components/page-header";
import { AgentesListClient } from "@/features/agentes/agentes-client";

export default function AgentesPage() {
  return (
    <section className="page-stack">
      <PageHeader
        title="Agentes"
        description="Configure e acompanhe seus agentes SDR de IA. A lista esta pronta para multiplos agentes, mesmo com uma unica operacao ativa no MVP."
        eyebrow="Configuracao · Agentes"
        primaryAction={{ label: "Novo agente", href: "/agentes/novo/configuracao" }}
      />
      <AgentesListClient />
    </section>
  );
}
