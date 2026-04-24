import { PageHeader } from "@/components/page-header";
import { ComprovantesClient } from "@/features/comprovantes/comprovantes-client";

export default function ComprovantesPage() {
  return (
    <section className="page-stack">
      <PageHeader
        title="Comprovantes"
        description="Fila de revisão para pagamentos, contratos, propostas assinadas e documentos enviados pelos leads."
        eyebrow="Operação · Comprovantes"
      />
      <ComprovantesClient />
    </section>
  );
}
