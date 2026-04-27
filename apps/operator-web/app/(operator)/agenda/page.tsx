import { PageHeader } from "@/components/page-header";
import { AgendaClient } from "@/features/agenda/agenda-client";

export default function AgendaPage() {
  return (
    <section className="page-stack">
      <PageHeader
        title="Agenda"
        description="Disponibilidade semanal, reservas e bloqueios da sua modelo — o que o agente pode oferecer para os clientes."
        eyebrow="Operação · Agenda"
      />
      <AgendaClient />
    </section>
  );
}
