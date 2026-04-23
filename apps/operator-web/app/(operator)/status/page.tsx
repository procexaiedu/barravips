import { PageHeader } from "@/components/page-header";
import { StatusClient } from "@/features/status/status-client";

export default function StatusPage() {
  return (
    <section className="page-stack">
      <PageHeader
        title="Status do sistema"
        description="Saúde técnica do backend, do WhatsApp e da agenda. Integrações sem verificação real não são mostradas como saudáveis."
      />
      <StatusClient />
    </section>
  );
}
