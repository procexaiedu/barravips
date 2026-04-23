import { PageHeader } from "@/components/page-header";
import { ConversasClient } from "@/features/conversas/conversas-client";

export default function ConversasPage() {
  return (
    <section className="page-stack">
      <PageHeader
        title="Conversas"
        description="Todos os clientes que falaram com a modelo. Filtre por situação ou busque pelo nome para abrir a conversa completa."
      />
      <ConversasClient />
    </section>
  );
}
