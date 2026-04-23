import { PageHeader } from "@/components/page-header";
import { ModelosClient } from "@/features/modelos/modelos-client";

export default function ModelosPage() {
  return (
    <section className="page-stack">
      <PageHeader
        title="Modelos"
        description="Cadastre, edite e ative modelos operacionais. A IA sempre usa apenas a modelo marcada como ativa."
      />
      <ModelosClient />
    </section>
  );
}
