import { PageHeader } from "@/components/page-header";
import { HandoffsClient } from "@/features/handoffs/handoffs-client";

export default function HandoffsPage() {
  return (
    <section className="page-stack">
      <PageHeader
        title="Transferências"
        description="Conversas em que a IA saiu e a modelo precisa assumir. Devolver para a IA pede confirmação."
      />
      <HandoffsClient />
    </section>
  );
}
