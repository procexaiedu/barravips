import { PageHeader } from "@/components/page-header";
import { AcompanhantesListClient } from "@/features/acompanhantes/acompanhantes-client";

export default function AcompanhantesPage() {
  return (
    <section className="page-stack">
      <PageHeader
        title="Acompanhantes"
        description="Catálogo das acompanhantes pelas quais o agente atende. Cada cadastro alimenta o que ele sabe oferecer, onde, por quanto e em quais condições."
        eyebrow="Catálogo · Acompanhantes"
        primaryAction={{ label: "Nova acompanhante", href: "/acompanhantes/novo/configuracao" }}
      />
      <AcompanhantesListClient />
    </section>
  );
}
