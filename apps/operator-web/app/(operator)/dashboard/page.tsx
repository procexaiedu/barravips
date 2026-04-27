import { PageHeader } from "@/components/page-header";
import { DashboardClient } from "./dashboard-client";

export default function DashboardPage() {
  return (
    <section className="page-stack dashboard-page">
      <PageHeader
        title="Acompanhamento comercial"
        description="Veja a evolucao dos leads, conversas e receita acompanhada pela equipe."
      />
      <DashboardClient />
    </section>
  );
}
