import { PageHeader } from "@/components/page-header";
import { ConversasClient } from "@/features/conversas/conversas-client";

export default function ConversasPage() {
  return (
    <section className="page-stack">
      <PageHeader
        title="Conversas"
        description="Caixa de entrada comercial para priorizar leads, abrir contexto e decidir o próximo passo com poucos cliques."
        eyebrow="Operação · Inbox comercial"
      />
      <ConversasClient />
    </section>
  );
}
