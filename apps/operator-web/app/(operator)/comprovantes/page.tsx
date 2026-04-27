import { PageHeader } from "@/components/page-header";
import { ComprovantesClient } from "@/features/comprovantes/comprovantes-client";

export default function ComprovantesPage() {
  return (
    <section className="page-stack">
      <PageHeader
        title="Comprovantes"
        description="Confira se o valor do comprovante bate com o combinado pela IA antes de confirmar o pagamento."
        eyebrow="Operação · Comprovantes"
      />
      <ComprovantesClient />
    </section>
  );
}
