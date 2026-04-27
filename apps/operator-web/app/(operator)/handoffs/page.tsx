import { PageHeader } from "@/components/page-header";
import { HandoffsClient } from "@/features/handoffs/handoffs-client";

export default function HandoffsPage() {
  return (
    <section className="page-stack">
      <PageHeader
        title="Escaladas para a modelo"
        description="A IA escalou para a modelo. Acompanhe até ela assumir no WhatsApp e o atendimento terminar. Intervenha apenas em exceções."
        eyebrow="Operação · Handoff"
      />
      <HandoffsClient />
    </section>
  );
}
