import { PageHeader } from "@/components/page-header";
import { AgendaClient } from "@/features/agenda/agenda-client";

export default function AgendaPage() {
  return (
    <section className="page-stack">
      <PageHeader
        title="Agenda"
        description="Horários da modelo organizados por dia. Bloqueie manualmente períodos em que ela não vai atender."
      />
      <AgendaClient />
    </section>
  );
}
