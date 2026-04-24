import { PageHeader } from "@/components/page-header";
import { DashboardClient } from "@/features/dashboard/dashboard-client";

export default function DashboardPage() {
  return (
    <section className="page-stack">
      <PageHeader
        title="Command center SDR"
        description="Saúde do agente, prioridades humanas, fila ranqueada e sinais do funil em uma única visão operacional."
      />
      <DashboardClient />
    </section>
  );
}
