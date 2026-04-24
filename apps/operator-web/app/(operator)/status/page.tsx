import { PageHeader } from "@/components/page-header";
import { StatusClient } from "@/features/status/status-client";

export default function StatusPage() {
  return (
    <section className="page-stack">
      <PageHeader
        title="Saúde da operação"
        description="Integrações e canais que mantêm o agente no ar. Conexões sem verificação real não aparecem como saudáveis."
        eyebrow="Configuração · Saúde da operação"
      />
      <StatusClient />
    </section>
  );
}
