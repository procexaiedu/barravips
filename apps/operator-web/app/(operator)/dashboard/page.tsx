import { PageHeader } from "@/components/page-header";
import { DashboardClient } from "@/features/dashboard/dashboard-client";

export default function DashboardPage() {
  return (
    <section className="page-stack">
      <PageHeader
        title="Visão geral"
        description="O que precisa da sua atenção agora: clientes esperando, fotos para aprovar e a agenda da semana."
      />
      <DashboardClient />
    </section>
  );
}
