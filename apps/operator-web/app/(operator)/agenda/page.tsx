import { PageHeader } from "@/components/page-header";
import { AgendaClient } from "@/features/agenda/agenda-client";

export default function AgendaPage() {
  return (
    <section className="page-stack">
      <PageHeader
        title="Agenda"
        description="Disponibilidade semanal, reservas, bloqueios e sincronização que determinam se o agente pode oferecer horários."
        eyebrow="Operação · Agenda"
      />
      <AgendaClient />
    </section>
  );
}
