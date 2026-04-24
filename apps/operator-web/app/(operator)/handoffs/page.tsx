import { PageHeader } from "@/components/page-header";
import { HandoffsClient } from "@/features/handoffs/handoffs-client";

export default function HandoffsPage() {
  return (
    <section className="page-stack">
      <PageHeader
        title="Leads para assumir"
        description="Fila de atendimento humano com motivo, urgência, SLA e ação direta para assumir o lead."
        eyebrow="Operação · Atendimento humano"
      />
      <HandoffsClient />
    </section>
  );
}
