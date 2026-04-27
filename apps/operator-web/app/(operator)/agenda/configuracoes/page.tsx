import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { CalendarSettingsCard } from "@/features/agenda/calendar-settings-card";

export default function AgendaConfiguracoesPage() {
  return (
    <section className="page-stack">
      <PageHeader
        title="Configurações da agenda"
        description="Integrações e preferências que deixam a agenda pronta para o agente oferecer horários."
        eyebrow="Operação · Agenda"
      />
      <div className="section-stack">
        <div className="agenda-settings-back">
          <Link className="link-pill" href="/agenda">
            ← Voltar para a agenda
          </Link>
        </div>
        <CalendarSettingsCard />
      </div>
    </section>
  );
}
